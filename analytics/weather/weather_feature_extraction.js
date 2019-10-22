"use strict";

const assert = require("assert");
const qm = require("qminer");
const utils = require("../util/utils");

class WeatherVectorizer {
    constructor(options) {
        this._weatherStore = options.weatherStore;

        // Aggregation functions
        let _aggrs = {
            max: x => Math.max(...x),
            min: x => Math.min(...x),
            sum: x => x.reduce((x, y) => x + y),
            mean: x => (1.0 * x.reduce((x, y) => x + y)) / x.length,
            diff: x => Math.max(...x) - Math.min(...x),
            total: undefined // Total aggregation is implemented in transform function
        };

        // Check feature extractors
        options.featureExtractors.forEach(function (featExt) {
            assert.ok(featExt.aggr in _aggrs, "Aggregator " + featExt.aggr + " not supported.");

            if (typeof featExt.freq !== "undefined") {
                console.log("Frequency field is no longer used - default value is 's' (span)");
            }

            assert.ok(typeof featExt.daterange !== "undefined", "Date range should be defined.");
            if (typeof featExt.timerange !== "undefined") {
                assert.ok(
                    featExt.timerange[0] >= 0 && featExt.timerange[0] <= 23,
                    "Invalid timerange start " + featExt.timerange[0] + ". Should be between [0-23]."
                );
                assert.ok(
                    featExt.timerange[1] >= 0 && featExt.timerange[1] <= 23,
                    "Invalid timerange end " + featExt.timerange[1] + ". Should be between [0-23]."
                );
                assert.ok(
                    featExt.timerange[0] <= featExt.timerange[1],
                    "Timerange start > end -> " + featExt.timerange[0] + " > " + featExt.timerange[1]
                );
            }
        });

        this._featureExtractors = options.featureExtractors;
        this._aggrs = _aggrs;

        // Generate extractor names
        this._featureExtractors.map(function (featExt) {
            if (typeof featExt.name === "undefined") {
                featExt.name =
                    `span_${featExt.aggr}_${featExt.param}_daterange${Math.abs(featExt.daterange[0])}` +
                    `_${Math.abs(featExt.daterange[1])}_timerange${featExt.timerange[0]}_${featExt.timerange[1]}__`;
            }
            return featExt;
        });
    }

    transform(forecastOffset, spans, regions, progress = 0) {
        /**
         * Extract weather features for each entry of spans.
         * @param {int} forecastOffset
         * @param {list} spans - list of objects { date: ..., span: ...}
         *
         * @return {qm.la.Matrix} matrix of weather features with one column per span
         */
        let numSamples = spans.length;

        // Sort spans by base date and store original ordering info
        let dateOrderSpans = spans.map(function (x, i) {
            x.order = i;
            return x;
        }).sort(
            function (a, b) {
                if (a.date.valueOf() !== b.date.valueOf())
                    return a.date.valueOf() - b.date.valueOf();
                if (typeof a.daterange !== "undefined" && typeof b.daterange !== "undefined")
                    return a.daterange[0] - b.daterange[0];
                return 0;
            });

        let featureExtractors = this._featureExtractors;
        let allWeatherParams = new Set(featureExtractors.map(x => x.param));
        
        // Largest past offset
        let defaultContextOffset = Math.min(...featureExtractors.map(x => x.daterange[0]));
        let spansContextOffset = Math.min(...spans.map(x => (typeof x.daterange !== "undefined" ? x.daterange[0] : 0)));

        let contextOffset = Math.min(defaultContextOffset, spansContextOffset);

        let rows = []; // Rows of feature matrix
        let featureNames = []; // Feature names
        let featureDescription = [];

        let lPos = 0,
            rPos = 0; // Current context's record interval
        let records = this._weatherStore.allRecords;

        // ASSUMPTION: Weather records are sorted by timestamp (date + hour) or
        // _weatherStore has 'Timestamp' key that enables sorting.
        // Extending the weather database may lead to unsorted records and consequently to incorrect context endpoints.
        if (this._weatherStore.keys.some(key => key.name === "Timestamp")) {
            records.sortByField("Timestamp", true);
        } else {
            console.warn(
                "WARNING: Weather store is missing 'Timestamp' key. Please add { \"field\": \"Timestamp\"," +
                " \"type\": \"linear\" } as a key in the weather store scheme. Otherwise, context endpoints may be" +
                " incorrect!"
            );
        }

        for (let span_i = 0; span_i < numSamples;) {
            let currSpan = dateOrderSpans[span_i];
            
            if (progress > 0 && span_i % progress === 0) {
                utils.showProgress("Featurizing span " + span_i + " of " + numSamples + " (" + currSpan.date + ")");
            }
            let contextStartDate = utils.addDays(currSpan.date, contextOffset);

            // Find context endpoints
            for (let i = 25; i >= 0; i--) {
                let cand = lPos + (1 << i);
                if (cand >= records.length) continue;
                if (utils.daysDiff(contextStartDate, records[cand].Timestamp) < 0) lPos = cand;
            }
            lPos++;
            assert.ok(utils.sameDate(contextStartDate, records[lPos].Timestamp), "Left endpoint error");

            for (let i = 25; i >= 0; i--) {
                let cand = rPos + (1 << i);
                if (cand >= records.length) continue;
                if (utils.daysDiff(currSpan.date, records[cand].Timestamp) <= 0) rPos = cand;
            }

            let contextRecs = [];
            for (let i = lPos; i <= rPos; i++) contextRecs.push(records[i]);

            contextRecs = contextRecs.filter(function (rec) {
                // Choose right forecast offset for each date from the context
                // when date == curr_date: forecast_offset == forecastOffset
                // when date == curr_date - 1: forecast_offset == forecast_offset + 1
                // ...
                // when curr_date - date <= 0: forecast_offset == 0 <- actual weather is used
                let daysDiff = utils.daysDiff(currSpan.date, rec.Timestamp);
                if (daysDiff < forecastOffset) {
                    return rec.DayOffset === 0;
                } else {
                    return -rec.DayOffset === forecastOffset - daysDiff;
                }
            });
            assert.ok(
                contextRecs.length > 0,
                `No records found! Date ${currSpan.date} forecast offset ${forecastOffset}`
            );

            let currRow = [];
            for (let weatherParam of allWeatherParams) {
                // Filter records with the right weather parameter
                let extrRecs = contextRecs.filter(x => x.Param === weatherParam);
                assert.ok(extrRecs.length > 0, `No records found! Param  ${weatherParam}`);

                // Filter extractors with the right weather parameter
                let relevantExtractors = featureExtractors.filter(x => x.param === weatherParam);

                // Group records by region
                let regionGroups = utils.groupBy(extrRecs, x => x.Region);
                for (let rEntry of regionGroups.entries()) {
                    // let rGroupIdx = rEntry[0];
                    let rGroup = rEntry[1];
                    let currRegion = rGroup[0].Region;

                    // Check if region is to be used
                    if (typeof regions !== "undefined" && regions.indexOf(currRegion) === -1) continue;

                    for (let featExt of relevantExtractors) {
                        // Choose corresponding aggregation function
                        let aggr = this._aggrs[featExt.aggr];

                        // Include only records from specified time range
                        // use feature extractor's range if no other is specified
                        // TODO: add the ability to choose different ranges for different feature extractors
                        let rangeStart =
                            typeof currSpan.daterange !== "undefined" ? currSpan.daterange[0] : featExt.daterange[0];
                        let rangeEnd =
                            typeof currSpan.daterange !== "undefined" ? currSpan.daterange[1] : featExt.daterange[1];

                        // First filter by daterange window
                        let featRecs = rGroup.filter(
                            x =>
                                utils.daysDiff(currSpan.date, x.Timestamp) >= rangeStart &&
                                utils.daysDiff(currSpan.date, x.Timestamp) <= rangeEnd
                        );
                        assert.ok(
                            featRecs.length > 0,
                            "No records found! Offset range " +
                            currSpan.date + " " + rangeStart + " " + rangeEnd + " " + weatherParam + " " +
                            JSON.stringify(rGroup)
                        );

                        // Filter the remaining by timerange window
                        if (typeof featExt.timerange !== "undefined") {
                            featRecs = featRecs.filter(
                                x =>
                                    x.Timestamp.getHours() >= featExt.timerange[0] &&
                                    x.Timestamp.getHours() <= featExt.timerange[1]
                            );
                        }

                        // Ignore frequency field - 'span' is default
                        // calculate aggregate on all records
                        if (featExt.aggr === "total") {
                            // Cumulative parameter
                            let totalValue = 0.0;

                            // ASSUMPTION: weather records are sorted by timestamp (date + hour)
                            let dailyGroups = utils.groupBy(featRecs, x => utils.keepDate(x.Timestamp).valueOf());
                            for (let tEntry of dailyGroups.entries()) {
                                // let tGroupIdx = tEntry[0];
                                let tGroup = tEntry[1];
                                totalValue += tGroup[tGroup.length - 1].Value - tGroup[0].Value;
                            }

                            currRow.push(totalValue);
                        } else {
                            // Instant parameters are trivial to process
                            currRow.push(aggr(featRecs.map(x => x.Value)));
                        }
                        if (rows.length === 0) {
                            let featureName = featExt.name + "r" + currRegion;

                            featureNames.push(featureName);
                            featureDescription.push({
                                featureName: featureName,
                                param: weatherParam,
                                aggr: featExt.aggr,

                                timerangeStart: featExt.timerange[0],
                                timerangeEnd: featExt.timerange[1],
                                daterangeStart: rangeStart,
                                daterangeEnd: rangeEnd,

                                region: currRegion
                            });
                        }
                    }
                }
            }
            // Avoid feature recalculating for same spans
            for (; span_i < numSamples; span_i++) {
                let tmpSpan = dateOrderSpans[span_i];
                // Straight-forward but not nice
                if (!(currSpan.date.valueOf() === tmpSpan.date.valueOf() &&
                    ((typeof currSpan.daterange === "undefined" && typeof tmpSpan.daterange === "undefined") ||
                    (currSpan.daterange[0] === tmpSpan.daterange[0] && currSpan.daterange[1] === tmpSpan.daterange[1]))
                )) break;
                rows.push(currRow);
            }
        }

        // Convert to feature matrix ordered by date
        let Xm = new qm.la.Matrix(rows).transpose();
        // Restore original span order
        let invOrder = new Array(numSamples).fill(0);
        for (let i = 0; i < numSamples; i++) invOrder[dateOrderSpans[i].order] = i;
        let X = Xm.getColSubmatrix(new qm.la.IntVector(invOrder));
        return { X: X, featureNames: featureNames, featureDescription: featureDescription };
    }
}

module.exports = { WeatherVectorizer };
