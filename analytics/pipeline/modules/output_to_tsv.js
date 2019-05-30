"use strict";

const qm = require("qminer");
const fs = qm.fs;

function exec(params, base) {

    if ((params["pipeline_mode"] === "fit" || params["pipeline_mode"] === "fit-init") &&
        params["output_fit"] === false) {
        return;
    }

    let inputStore = base.store(params["input_feat_store"]);
    let outputStore = base.store(params["output_store"]);
    let outputRecs = outputStore.allRecords;
    let otherFields = inputStore.fields.map(x => x.name).filter(x => x !== "Value");

    // Write to tsv file
    console.log("Saving pipeline's output to " + params["output_file"]);
    let addHeader = true, ff;
    let exists = fs.exists(params["output_file"]);
    if (params["append"] && exists) {
        let info = fs.fileInfo(params["output_file"]);
        addHeader = info.size === 0;
        ff = fs.openAppend(params["output_file"]);
    } else {
        ff = fs.openWrite(params["output_file"]);
    }

    if (addHeader) {
        let headerLine = "";
        for (let field of otherFields) headerLine += field + "\t";
        headerLine += "InputValue\tOutputValue";
        ff.writeLine(headerLine);
    }

    inputStore.allRecords.each((rec, i) => {
        let line = "";
        for (let field of otherFields)
            line += rec[field] + "\t";

        // Input_value + predicted_value
        line += rec["Value"] + "\t" + outputRecs[i]["Value"];
        ff.writeLine(line);
    });
    ff.close();
}

module.exports = { exec };
