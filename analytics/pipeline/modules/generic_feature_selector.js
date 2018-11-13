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
    let selectedFeaturesName = params["features"] ? params["features"] : store.fields;

    // Set feature store and feature vector
    let storeFields = [],
        features = [];
    for (let featureName of selectedFeaturesName) {
        for (let field of store.fields) {
            if (featureName === field.name) {
                storeFields.push({ name: featureName, type: field.type, null: field.nullable });
                features.push({
                    type: store.isNumeric(featureName) ? "numeric" : "categorical",
                    source: params["output_store"],
                    normalize: params["normalize"] && store.isNumeric(featureName) ? params["normalize"] : "none",
                    field: featureName
                });
            }
        }
    }

    console.log(selectedFeaturesName);

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
        [key, usedKeys] = utils.getKey(params["input"]["primary_key"], rec, null, params["keep_only_date"]);
        mappingFeatRec.set(key, rec);
    }

    let mapping = new Map();
    // Fill feature store
    base.store("Input").allRecords.each(inputRec => {
        // Get feature matching key
        let [key] = utils.getKey(params["input"]["primary_key"], inputRec, usedKeys, params["keep_only_date"]);

        let featRec = mappingFeatRec.get(key);
        assert(featRec != null, inputRec.Timestamp.valueOf());
        let rec = {};
        selectedFeaturesName.forEach(featureName => {
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
