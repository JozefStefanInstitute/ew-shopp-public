"use strict";

const qm = require("qminer");
const assert = require("assert");
const utils = require("../../util/utils");

/*
* Instance of input database.
* Can be kept alive after the first execution.
* This is safe, because it is opened in 'openReadOnly' mode.
 */
let inputBase;

function createNewStore(base, store, params) {
    assert.ok("input" in params);
    // Auto generate target fields with names matching primary keys
    // Create fields with names defined in params.input
    // Fields properties are matched to existing one in the input_store
    let fields = [];
    store["fields"].forEach(field => {
        let targetField = {};
        if (params["input"]["primary_key"].includes(field["name"]) || field["name"] === params["target_var"]) {
            // Copy all properties except 'id'
            Object.keys(field).forEach(key => {
                if (key !== "id") targetField[key] = field[key];
            });

            if (field.name === params["target_var"]) {
                targetField["name"] = "Value";
                // When not fitting allow "Value" to be null
                if (params["mode"] !== "fit") targetField["null"] = true;
            }
            fields.push(targetField);
        }
    });

    // Store target to db
    let targetStore = base.createStore({
        name: params["target_store"] ? params["target_store"] : "Input",
        fields: fields
    });
    return [targetStore, fields];
}

function exec(params, base) {
    if (inputBase == null || inputBase.isClosed()) {
        inputBase = new qm.Base({ mode: "openReadOnly", dbPath: params["input_db"] });
    }
    let recs, inputStore;

    // Set search query corresponding to the mode ({fit|predict})
    let searchQuery = "search_query_" + params["mode"];
    let searchQueryGiven = false;
    if (params[searchQuery] != null) {
        searchQueryGiven = true;
    } else if (params["search_query"] != null) {
        searchQuery = "search_query";
        searchQueryGiven = true;
    }


    console.log(`Input extractor is using '${searchQuery}'.`);
    // Apply filter if provided
    if (searchQueryGiven) {
        recs = inputBase.search(params[searchQuery]);
        inputStore = recs.store;
    } else if (params["input_store"] != null) {
        // Look for all records in the input store
        inputStore = inputBase.store(params["input_store"]);
        recs = inputStore.allRecords;
    } else {
        throw Error("Input extractor can not extract input - no 'search_query' or 'input_store' provided.");
    }

    if (params["sample"] != null) {
        recs = recs.sample(params["sample"]);
    }

    let [targetStore, fields] = createNewStore(base, inputStore, params);
    let minVal = 0;
    if (params["positive"] === true) {
        minVal = Math.abs(Math.min(...recs.getVector(params["target_var"]).toArray()));
        console.log(minVal);
    }

    recs.each(r => {
        let rec = {
            /*
             Timestamp: utils.keepDate(x["Date"]),
             Value: x[params["target_var"]]
             */
        };
        let targetVar = params["target_var"];
        let targetVal = r[targetVar];
        if (params["positive"] === true && targetVal < 0.0) {
            targetVal += minVal;
        }

        // Primary key mapping
        fields.forEach(field => {
            if (field.name === "Value") {
                rec[field.name] = targetVal;
            } else {
                rec[field.name] = r[field.name];
                if (field.name === "Timestamp" && params["forecast_offset"]) {
                    rec[field.name] = utils.addDays(rec[field.name], params["forecast_offset"]);
                }
            }
        });

        if (params["thresh"]) {
            if (params["thresh"].length === 1) {
                rec["Value"] = targetVal >= params["thresh"][0] ? 1 : -1;
            }
            if (params["thresh"].length === 2) {
                rec["Value"] = targetVal <= params["thresh"][0] ? -1 : targetVal >= params["thresh"][1] ? 1 : 0;
            }

            if (rec["Value"] !== 0) targetStore.push(rec);
        } else {
            if (params["mode"] === "fit" && rec["Value"] == null) {
                console.log("Skip record (Value is null)");
            } else {
                targetStore.push(rec);
            }
        }
    });

    if (params["keep_alive_db"] === false) {
        inputBase.close();
    }
}

module.exports = { exec };
