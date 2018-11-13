"use strict";

const qm = require("qminer");
const assert = require("assert");

function exec(params, base) {
    const inputBase = new qm.Base({ mode: "openReadOnly", dbPath: params["input_db"] });
    let recs, store;

    // Apply filter if provided
    if (params["search_query"] != null) {
        recs = inputBase.search(params["search_query"]);
        store = recs.store;
    } else {
        store = inputBase.store(params["input_store"]);
        recs = store.allRecords;
    }

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

    recs.each(r => {
        let rec = {
            /*
                Timestamp: utils.keepDate(x["Date"]),
                Value: x[params["target_var"]]
            */
        };
        let targetVar = params["target_var"];
        // Primary key mapping
        fields.forEach(field => {
            rec[field.name] = field.name === "Value" ? r[targetVar] : r[field.name];
        });

        if (params["thresh"]) {
            if (params["thresh"].length === 1) rec["Value"] = r[targetVar] >= params["thresh"][0] ? 1 : -1;
            if (params["thresh"].length === 2) {
                rec["Value"] = r[targetVar] <= params["thresh"][0] ? -1 : r[targetVar] >= params["thresh"][1] ? 1 : 0;
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

    inputBase.close();
}

module.exports = { exec };
