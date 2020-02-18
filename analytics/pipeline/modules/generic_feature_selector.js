"use strict";

const qm = require("qminer");
const assert = require("assert");
const utils = require("../../util/utils");

function exec(params, base) {
    const featureBase = new qm.Base({ mode: "openReadOnly", dbPath: params["input_db"] });
    let featureRecords, store;

    if (params["search_query"]) {
        featureRecords = featureBase.search(params["search_query"]);
        store = featureRecords.store;
    } else {
        assert.ok("input_store" in params, "Set 'input_store' or 'search_query' field to select features with " +
            "'generic_feature_selector' module.");
        store = featureBase.store(params["input_store"]);
        featureRecords = store.allRecords;
    }

    // Find a subset of features matching specified criterion
    let selectedFeaturesName = params["features"] ? params["features"] : store.fields.map(field => field.name);
    let notFeaturesName = params["not_features"] ? params["not_features"] : [];
    // Set feature store and feature vector
    let storeFields = [], features = [], usedFeatures = [];
    for (let field of store.fields) {
        let featureName = field.name;
        if (notFeaturesName.some(notFeature => featureName.match(notFeature)))
            continue;
        // If it match any given feature name than use it
        if (selectedFeaturesName.some(selectedFeature => featureName.match(selectedFeature))) {
            usedFeatures.push(featureName);
            if (field.type === "datetime") {
                console.warn("Field type datetime not supported for features! Skipping '" + featureName + "'!");
                continue;
            }
            storeFields.push({ name: featureName, type: field.type, null: field.nullable });
            features.push({
                type: store.isNumeric(field.name) ? "numeric" : "categorical",
                source: params["output_store"],
                normalize: params["normalize"] && store.isNumeric(featureName) ? params["normalize"] : "none",
                field: featureName
            });
        }
    }

    // Create feature store
    let featureStore = base.createStore({
        name: params["output_store"],
        fields: storeFields
    });

    params["keep_only_date"] = params["keep_only_date"] == null ? true : params["keep_only_date"];
    // Map key to a feature record
    let mappingFeatRec = new Map();
    let key, usedKeys;
    for (let i = 0; i < featureRecords.length; i++) {
        let rec = featureRecords[i];
        [key, usedKeys] = utils.getKey(params["input"]["primary_key"], rec, null, params["keep_only_date"],
            params["forecast_offset"]);
        mappingFeatRec.set(key, rec);
    }

    let mapping = new Map();
    // Fill feature store
    base.store("Input").allRecords.each(inputRec => {
        // Get feature matching key
        let [key] = utils.getKey(params["input"]["primary_key"], inputRec, usedKeys, params["keep_only_date"]);

        let featRec = mappingFeatRec.get(key);
        assert(featRec != null, inputRec.Timestamp.valueOf() + " " + inputRec.Timestamp);
        let rec = {};
        usedFeatures.forEach(featureName => {
            rec[featureName] = featRec[featureName];
        });

        featureStore.push(rec);
        // Get full key
        [key] = utils.getKey(params["input"]["primary_key"], inputRec, null, params["keep_only_date"]);
        mapping.set(key, rec);
    });

    featureBase.close();

    // Return feature specification for feature space
    return [features, mapping];
}

module.exports = { exec };
