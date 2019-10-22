"use strict";

const qm = require("qminer");
const assert = require("assert");
const utils = require("../../util/utils");

function hasSublist(list, sublist) {
    for (let i = 0; i < list.length; i++) {
        if (list[i].length !== sublist.length)
            continue;

        let diff = false;
        for (let j = 0; j < list[i].length; j++) {
            if (list[i][j] !== sublist[j]) {
                diff = true;
                break;
            }
        }
        if (!diff) return true;
    }
    return false;
}

function exec(params, base) {
    // Base containing pre-build weather features and descriptions
    const inputBase = new qm.Base({ mode: "openReadOnly", dbPath: params["input_db"] });

    let weatherFeaturesStore = inputBase.store("Forecast" + Math.abs(params["forecast_offset"]));
    let weatherFeaturesDescriptionStore = inputBase.store("Forecast" + Math.abs(params["forecast_offset"]) + "Desc");

    let descriptionRecords = weatherFeaturesDescriptionStore.allRecords;

    // Find a subset of features matching specified criterion
    let selectedFeaturesName = [];
    for (let i = 0; i < descriptionRecords.length; i++) {
        let desc = descriptionRecords[i];

        if (!(params["regions"].indexOf(desc.Region) >= 0)) continue;
        if (!hasSublist(params["ranges"]["date"], [desc.DaterangeStart, desc.DaterangeEnd])) continue;
        if (!hasSublist(params["ranges"]["time"], [desc.TimerangeStart, desc.TimerangeEnd])) continue;

        selectedFeaturesName.push(desc.FeatureName);
    }

    if (params["features"] != null) {
        selectedFeaturesName = selectedFeaturesName.filter(name => params["features"].some(e => name.includes(e)))
    }

    if (params["sample"] != null) {
        selectedFeaturesName = utils.shuffle(selectedFeaturesName);
        selectedFeaturesName = selectedFeaturesName.slice(0, params["sample"]);
    }

    assert.notStrictEqual(selectedFeaturesName.length, 0, "Weather features not found!");
    // Featurize inputs
    let storeFields = [], features = [];

    selectedFeaturesName.forEach(featureName => {
        storeFields.push({ name: featureName, type: "float" });
        features.push({
            type: "numeric",
            source: params["output_store"],
            normalize: params["normalize"] ? params["normalize"] : "none",
            field: featureName
        });
    });

    // Maybe not necessary ??
    let featureStore = base.createStore({
        name: params["output_store"],
        fields: storeFields
    });

    // Map each date to a feature record
    let mappingFeatRec = new Map();
    let key, usedKeys;
    let featureRecords = weatherFeaturesStore.allRecords;
    for (let i = 0; i < featureRecords.length; i++) {
        let rec = {};
        Object.assign(rec, featureRecords[i]);
        // Use offset to calculate actual date of forecast
        if (params["use_forecast_date"])
            rec.Timestamp = utils.addDays(rec.Timestamp, params["forecast_offset"]);
        [key, usedKeys] = utils.getKey(params["input"]["primary_key"], rec);
        mappingFeatRec.set(key, rec);
    }

    let mapping = new Map();
    base.store("Input").allRecords.each(inputRec => {
        let [key] = utils.getKey(params["input"]["primary_key"], inputRec, usedKeys);
        let featRec = mappingFeatRec.get(key);
        assert(featRec != null,
            `${inputRec.Timestamp.valueOf()}: Could not map ${JSON.stringify(inputRec)} to weather features`);
        let rec = {};
        selectedFeaturesName.forEach(featureName => {
            rec[featureName] = featRec[featureName];
        });
        featureStore.push(rec);
        // Get full key
        [key] = utils.getKey(params["input"]["primary_key"], inputRec);
        mapping.set(key, rec);
    });

    inputBase.close();

    // Return feature specification for feature space
    return [features, mapping];
}

module.exports = { exec };