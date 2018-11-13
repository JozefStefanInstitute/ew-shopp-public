"use strict";

const qm = require("qminer");
const assert = require("assert");
const feature_extraction = require("../../weather/weather_feature_extraction.js");
const weather_utils = require("../../weather/weather_utils.js");
const utils = require("../../util/utils");
/*
*   General weather builder...
*/

/*
    Output base schema:

    schema: [
        {
            name: "Forecast-1",
            fields: [
                { name: "Timestamp",        type: "datetime" },
                { name: "{featureName1}",   type: "float" },
                ... 
            ]
        },
        {
            name: "Forecast-2",
            ...
        },
        ...,
        {
            name: "Forecast-1Desc",
            fields: [
                { name: "Name",              type:"string" },
                { name: "Param",             type:"string" },
                { name: "Aggr",              type:"string" },
                
                { name: "TimerangeStart",    type:"int" },
                { name: "TimerangeEnd",      type:"int" },
                { name: "DaterangeStart",    type:"int" },
                { name: "DaterangeEnd",      type:"int" },
                
                { name: "Region",            type:"int" }
            ]
        },
        {
            name: "Forecast-2Desc",
            ...
        },
        ...
    ]
*/
function exec(params) {
    // Load QMiner base containing raw weather data
    const wBase = new qm.Base({ mode: "openReadOnly", dbPath: params["input_db"] });

    // Build weather feature extractors as specified in params
    let fe = weather_utils.buildExtractors(params);
    // Initialize weather feature extraction module
    const we = new feature_extraction.WeatherVectorizer({
        weatherStore: wBase.store("Weather"),
        featureExtractors: fe
    });

    // Choose start and end date for featurization
    let startDate, endDate;
    if (params["start_date"] == null || params["end_date"] == null) {
        startDate = utils.keepDate(new Date());
        endDate = utils.keepDate(utils.addDays(new Date(), 1));
    } else {
        startDate = utils.keepDate(new Date(params["start_date"]));
        endDate = utils.keepDate(new Date(params["end_date"]));
    }
    assert.ok(startDate <= endDate, "Start date must be equal/before end date!");

    // Extract features for all dates from range [startDate, endDate]
    let allSpans = [],
        spans;
    for (let currDate = new Date(startDate.valueOf()); currDate <= endDate; currDate.setDate(currDate.getDate() + 1))
        allSpans.push({ date: new Date(currDate.valueOf()) });

    // Create new instance of QMiner base containing all features (schema is sketched above ^)
    let featuresBase = new qm.Base({
        mode: params["output_db_mode"] ? params["output_db_mode"] : "createClean",
        dbPath: params["output_db"]
    });

    let featuresStoreNames = new Set(featuresBase.getStoreList().map(store => store.storeName));

    // Extract features for each specified forecast offset separately
    for (let forecastOffset of params["forecast_offsets"].sort((a, b) => b - a)) {
        console.log(`Forecast offset: ${forecastOffset}`);
        if (startDate.toDateString() === new Date().toDateString() || params["future"]) {
            // Get dates that are actually possible for forecast offset
            spans = allSpans.filter(date => {
                return utils.addDays(date.date, forecastOffset) <= new Date(startDate);
            });
            if (spans.length === 0) continue;
        } else {
            spans = allSpans.slice();
        }

        let feats = we.transform(forecastOffset, spans, params.regions, 2);

        let Xw = feats.X; // Feature matrix
        let featureNames = feats.featureNames; // Feature names

        // Additional description for each feature
        let featureDescriptions = feats.featureDescription;

        // Define all field names for feature store
        let featureStoreFields = [
            {
                name: "Timestamp",
                type: "datetime"
            }
        ];
        featureNames.forEach(featureName => {
            featureStoreFields.push({
                name: featureName,
                type: "float"
            });
        });

        // Define all field names for feature description store
        let featureDescriptionStoreFields = [
            { name: "FeatureName", type: "string" },
            { name: "Param", type: "string" },
            { name: "Aggr", type: "string" },

            { name: "TimerangeStart", type: "int" },
            { name: "TimerangeEnd", type: "int" },
            { name: "DaterangeStart", type: "int" },
            { name: "DaterangeEnd", type: "int" },

            { name: "Region", type: "int" }
        ];

        // Populate features store
        let featureStoreName = "Forecast" + Math.abs(forecastOffset);
        let featureStore, featureDescriptionStore;
        if (featuresStoreNames.has(featureStoreName)) {
            featureStore = featuresBase.store(featureStoreName);
        } else {
            featureStore = featuresBase.createStore({
                name: featureStoreName,
                fields: featureStoreFields
            });
        }

        spans.forEach((span, index) => {
            let rec = {
                Timestamp: span.date
            };

            // Row in matrix corresponding to current Timestamp
            let weatherRow = Xw.getCol(index).toArray();

            // One column per feature
            assert.strictEqual(featureNames.length, weatherRow.length, "Wrong number of weather features");
            for (let i = 0; i < featureNames.length; i++) {
                rec[featureNames[i]] = weatherRow[i];
            }

            try {
                featureStore.push(rec);
            } catch (err) {
                console.error(`Skipping record:\n${JSON.stringify(rec)}\n${err}`);
            }
        });

        console.log("%d records in database", featureStore.allRecords.length);

        // Populate features description store
        featureStoreName = "Forecast" + Math.abs(forecastOffset) + "Desc";
        if (featuresStoreNames.has(featureStoreName)) {
            featureDescriptionStore = featuresBase.store(featureStoreName);
        } else {
            featureDescriptionStore = featuresBase.createStore({
                name: featureStoreName,
                fields: featureDescriptionStoreFields
            });
        }
        featureDescriptions.forEach(desc => {
            let rec = {
                FeatureName: desc.featureName,
                Param: desc.param,
                Aggr: desc.aggr,

                TimerangeStart: desc.timerangeStart,
                TimerangeEnd: desc.timerangeEnd,
                DaterangeStart: desc.daterangeStart,
                DaterangeEnd: desc.daterangeEnd,

                Region: desc.region
            };

            try {
                if (featureDescriptionStore.allRecords.filterByField("FeatureName", rec.FeatureName).length === 0) {
                    // Feature does not exist
                    featureDescriptionStore.push(rec);
                }
            } catch (err) {
                console.error(`Skipping record:\n${JSON.stringify(rec)}\n${err}`);
            }
        });
    }
    featuresBase.close();
}

module.exports = { exec };
