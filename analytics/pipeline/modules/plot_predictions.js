"use strict";

const utils = require("../../util/utils");
const plotly = require("../../util/plot");
const fs = require("qminer").fs;

function exec(params, base) {

    if ((params["pipeline_mode"] === "fit" || params["pipeline_mode"] === "fit-init") &&
        params["output_fit"] === false) {
        console.log("Skipping plots on fit predictions.");
        return;
    }

    // Go through all the records
    let x = [], yPred = [], yTrue = [];
    if (params["input_tsv"] != null) {
        // Plot from tsv
        if (!utils.existsFile(params["input_tsv"], true)) return;
        let file = fs.openRead(params["input_tsv"]);
        fs.readCsvLines(file, {
            delimiter: "\t",
            skipLines: 1,
            onLine: lineVals => {
                let xVal = "";
                lineVals.slice(0, -2).forEach(val => xVal += val + "\t");
                x.push(xVal);
                yPred.push(lineVals[lineVals.length - 1]);
                yTrue.push(lineVals[lineVals.length - 2]);
            }
        });
        file.close();
    } else {
        // Plot from stores (input/output pipelines stores)
        let inputStore = base.store(params["input_feat_store"]);
        let outputStore = base.store(params["output_store"]);
        let outputRecs = outputStore.allRecords;

        let otherFields = inputStore.fields.map(x => x.name).filter(x => x !== "Value");
        let lines = [];
        base.store(params["input_feat_store"]).allRecords.each((rec, i) => {
            let line = {};
            for (let field of otherFields) {
                line[field] = rec[field];
            }
            line["TrueValue"] = rec.Value;
            line["PredictedValue"] = outputRecs[i]["Value"];
            lines.push(line);
        });

        if (params["sort_by"] != null) {
            lines.sort((a, b) => {return a[params["sort_by"]] - b[params["sort_by"]]});
        }

        if (params["sort_by"] != null) {
            if (base.store(params["input_feat_store"]).fields.some(
                ({ name, type }) => name === params["sort_by"] && type === "datetime")) {
                lines.sort((a, b) => {return new Date(a[params["sort_by"]]) - new Date(b[params["sort_by"]])});
            } else {
                lines.sort((a, b) => {return a[params["sort_by"]] - b[params["sort_by"]]});
            }
        }

        // Write to file
        for (const line of lines) {
            let xVal = "";
            for (let [key, val] of Object.entries(line)) {
                if (key === "TrueValue") {
                    yTrue.push(val);
                } else if (key === "PredictedValue") {
                    yPred.push(val);
                } else {
                    if (val instanceof Date && !isNaN(val))
                        val = val.toDateString();
                    xVal += val;
                }
            }
            x.push(xVal);
        }
    }

    plotly.plot(x, [yTrue, yPred], ["True", "Predicted"], params);
}

module.exports = { exec };