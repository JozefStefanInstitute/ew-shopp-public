"use strict";

const utils = require("../util/utils.js");
const eventsDownload = require("./events_download.js");
const qm = require("qminer");

const dbFeatConfigPathDefault = "./analytics/events/configEventsFeaturesDb.json";
const dbFeatPathDefault = "../data/common/features/eventsFeaturesDb";

async function get(conf) {
    const data = eventsDownload.run(conf);
    const rawData = await data;
    if (conf.raw) return rawData;
}

function exec(params) {
    // Default parameters
    const finalParams = Object.assign({
        input_db: "../data/dbs/eventsDb",
        output_db: dbFeatPathDefault,
        output_conf_db: dbFeatConfigPathDefault,
        clean_db: false,
        download: false
    }, params);

    // Download missing raw data from EventRegistry
    const getRawDataFn = async () => {
        if (!finalParams.download) return;

        // Get keyword from keywordID if necessary. Keyword needed to search concept URI.
        if (finalParams.keyword == null && finalParams.keyword_query) {
            const keywordDb = new qm.Base({ dbPath: finalParams.keyword_query.db });
            let activitiesRecs = keywordDb.search(finalParams.keyword_query.search_query);
            console.log(activitiesRecs.length);
            activitiesRecs.each(rec => {
                console.log(rec.hadKeyword);
            });
        }

        // Create sub-queries for each feature
        const subQueries = {
            misc: {dbPath: finalParams.input_db},
            queries: []
        };
        for(const query of finalParams.queries) {
            subQueries.queries = [...subQueries.queries, ...(Object.keys(eventsDownload.typeStoreNameMap).map((type) =>
                new Object({
                    type: type,
                    conceptKeyword: query.keyword,
                    dateStart: query.start_date,
                    dateEnd: query.end_date,
                    locations: query.locations
                })
            ))];
        }
        return await get(subQueries);
    };

    // Can be async because there is no more calculations after transformation/building of features
    let inputDb, outputDb;
    return getRawDataFn().then(() => {
        // Calculate features
        [inputDb, outputDb] = prepareDatabases(finalParams);
        for(const query of finalParams.queries) {
            const [conceptUri, locationUri] = getConceptAndLocationsUris(inputDb, query);
            calculateFeatures(conceptUri, locationUri, inputDb, outputDb, query);
        }
    }).catch((e) => {
        console.error(e);
    }).finally(() => {
        if (inputDb != null) inputDb.close();
        if (outputDb != null) outputDb.close();
    });
}

function prepareDatabases(params) {

    const outDbConf = {
        dbPath: params.output_db,
        dbConfigPath: params.output_conf_db,
        dbClean: params.clean_db
    };

    const outputDb = eventsDownload.checkDb(outDbConf);
    if (!utils.existsDir(params.input_db)) {
        console.error("Input database" + params.input_db + " does not exist.");
        return;
    }
    const inputDb = new qm.Base({ mode: "open", dbPath: params.input_db });
    return [inputDb, outputDb];
}

function getConceptAndLocationsUris(inputDb, params) {
    let recs = inputDb.store("ConceptUris").allRecords.filterByField("Concept", params.keyword);
    if (recs.empty) throw Error("No keyword '" + params.keyword + "' found in the input database.");

    const conceptUri = recs[0].ConceptUri;
    const locationUri = params.locations.map((loc) => {
        let recs = inputDb.store("LocationUris").allRecords.filterByField("Location", loc);
        if (recs.empty) throw Error("No location '" + loc + "' found in the input database.");
        return recs[0].LocationUri;
    });

    return [conceptUri, locationUri];
}

function calculateFeatures(conceptUri, locationUri, inputDb, outputDb, params) {
    const [dateStartKd, dateEndKd] = [utils.keepDate(params.start_date), utils.keepDate(params.end_date)];
    let currDate = dateStartKd;
    const typeFieldMap = { articlesCounts: "ArticlesCounts", eventsCounts: "EventsCounts" };
    const typeMentionedFieldMap = { articlesCounts: "ArticlesCountsMentioned", eventsCounts: "EventsCountsMentioned" };
    const typeMentionedOutFieldMap = {
        articlesCounts: "MentionedArticlesCurrent",
        eventsCounts: "MentionedEventsCurrent"
    };

    const typeMentionedOutFieldFutureMap = {
        articlesCounts: "MentionedArticlesFuture",
        eventsCounts: "MentionedEventsFuture"
    };

    const getCountsFn = (type, result, storeName) => {
        // Get articles counts
        let recs = inputDb.search({
            $from: storeName, //
            ConceptUri: conceptUri,
            LocationUri: locationUri,
            // Fit on week before
            Date: {
                $gt: utils.getDateString(utils.addDays(currDate, -7)),
                $lt: utils.getDateString(utils.addDays(currDate, -1))
            }
        }).filter(rec => rec.LocationUri.length === locationUri.length);
        if (recs.empty) {
            console.log(`No records found in the store '${storeName}' for a date ${utils.getDateString(currDate)},` +
                ` location '${locationUri}' and concept '${conceptUri}'.
                 Probably there are no records before that date and consequently some features cannot be calculated.`);
            return;
        }

        // Average counts for 7 days before
        let sum = 0;
        recs.each(rec => {sum += rec.Count});
        result[typeFieldMap[type]+"PastAvg"] = sum / recs.length;

        // Get min/max for 7 day before
        let min = recs[0].Count, max = recs[0].Count;
        recs.each(rec => {min = rec.Count < min ? rec.Count : min;
        max = rec.Count > max ? rec.Count : max;});
        result[typeFieldMap[type] + "PastMax"] = max;
        result[typeFieldMap[type] + "PastMin"] = min;

        // Record for one day before
        const currCount = recs[recs.length - 1];
        // Counts for one day before
        result[typeFieldMap[type]] = currCount.Count;
        // Get future mentioned dates
        let countFutureDateMentions = 0;
        currCount.hasMentionedDates.each((rec) => {
            if (rec.DateMentioned >= currDate) countFutureDateMentions += rec.Count;
        });

        result[typeMentionedOutFieldFutureMap[type]] = countFutureDateMentions;

        // Get the number of mentioned dates for specific date in the future (set with offset)
        for (let offset = 1; offset <= 7; offset++) {
            let countFutureDateMentions = 0;
            let cmpDate = utils.keepDate(utils.addDays(currDate, offset));
            currCount.hasMentionedDates.each((rec) => {
                let dateMentioned = utils.keepDate(rec.DateMentioned);
                if (utils.sameDate(rec.DateMentioned , cmpDate)) countFutureDateMentions += rec.Count;
            });
            result[typeMentionedOutFieldFutureMap[type] + offset.toString()] = countFutureDateMentions;
        }

        // Get number of mentions of the current day
        let past = inputDb.search({
            $from: typeMentionedFieldMap[type],
            DateMentioned: utils.getDateString(currDate),
            $join: {
                $name: "hasMentionedDates",
                $query: {
                    $from: storeName,
                    ConceptUri: conceptUri,
                    LocationUri: locationUri,
                    Date: { $lt: utils.getDateString(utils.addDays(currDate, -1)) }
                }
            }
        }).filter(rec => rec.onDate.LocationUri.length === locationUri.length);

        if (!past.empty) {
            result[typeMentionedOutFieldMap[type]] += past.length;
        }
    };

    // Go through all dates
    while (currDate <= dateEndKd) {

        const result = {
            EventFeatureId: params.event_feature_id ? params.event_feature_id : "Uncategorized",
            KeywordId: params.keyword_id ? params.keyword_id : null,
            Region: params.region ? params.region : null,
            ConceptUri: conceptUri,
            LocationUri: locationUri,
            Timestamp: currDate,
            EventsCounts: 0,
            ArticlesCounts: 0,
            MentionedArticlesCurrent: 0,
            MentionedArticlesFuture: 0,
            MentionedEventsCurrent: 0,
            MentionedEventsFuture: 0,
            ArticlesCountsPastMax: 0,
            ArticlesCountsPastMin: 0,
            EventsCountsPastMax: 0,
            EventsCountsPastMin: 0,
            EventsCountsPastAvg: 0,
            ArticlesCountsPastAvg: 0
        };

        for(let offset = 1; offset <= 7; offset++){
            result["MentionedArticlesFuture"+offset] = 0;
            result["MentionedEventsFuture"+offset] = 0;
        }

        // Get signal of counts & mentioned dates
        getCountsFn("articlesCounts", result, eventsDownload.typeStoreNameMap["articlesCounts"]);
        getCountsFn("eventsCounts", result, eventsDownload.typeStoreNameMap["eventsCounts"]);

        // Check if exist or add new one
        const queryExisting = {
            $from: "EventsFeatures",
            ConceptUri: conceptUri,
            LocationUri: locationUri,
            Timestamp: currDate
        };

        if (outputDb.search(queryExisting).empty) {
            outputDb.store("EventsFeatures").push(result);
        }

        currDate = utils.keepDate(utils.addDays(currDate, 1));
    }
}

module.exports = { exec, get };