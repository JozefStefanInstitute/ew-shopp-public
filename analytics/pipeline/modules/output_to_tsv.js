"use strict";

const qm = require("qminer");
const utils = require("../../util/utils");
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

    let featureFields, featureRecs;
    if (params["include_features"] === true) {
        let inputStoreFeat = base.store(params["feature_store"]);
        featureFields = inputStoreFeat.fields.map(x => x.name);
        featureRecs = inputStoreFeat.allRecords;
    }

    // Write to tsv file
    console.log("Saving pipeline's output to " + params["output_file"]);
    let addHeader = true, ff;
    let exists = fs.exists(params["output_file"]);
    if (params["append"] && exists) {
        let info = fs.fileInfo(params["output_file"]);
        addHeader = info.size === 0;
        ff = fs.openAppend(params["output_file"]);
    } else {
        utils.createDir(params["output_file"], false);
        ff = fs.openWrite(params["output_file"]);
    }

    if (addHeader) {
        let headerLine = "";
        for (let field of otherFields) headerLine += field + "\t";
        headerLine += "TrueValue\tPredictedValue";

        if (params["include_features"] === true) {
            headerLine += "\t";
            for (let field of featureFields) headerLine += field + "\t";
        }

        ff.writeLine(headerLine);
    }

    let lines = [];
    inputStore.allRecords.each((rec, i) => {
        // [PRIVATE KEY ...] [TRUE VALUE] | [PREDICTED VALUE] | [FEATURES ...]
        let line = {};
        for (let field of otherFields) {
            line[field] = rec[field];
        }

        line["TrueValue"] = rec.Value;
        line["PredictedValue"] = outputRecs[i]["Value"];
        if (params["include_features"] === true) {
            for (let field of featureFields) {
                let val = featureRecs[i][field];
                val = !isNaN(val) ? Number.parseFloat(val).toFixed(5) : val;
                line[field] = val;
            }
        }
        lines.push(line);
    });

    if (params["sort_by"] != null) {
        lines.sort((a, b) => {return a[params["sort_by"]] - b[params["sort_by"]]});
    }

    // Write to file
    for(const line of lines){
        let lineStr = "";
        for(const column of Object.values(line)){
            lineStr += column + "\t";
        }
        ff.writeLine(lineStr);
    }

    ff.flush();
    ff.close();
}

module.exports = { exec };
