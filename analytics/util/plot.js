"use strict";

const qm = require("qminer");
const fs = qm.fs;
const nodeFs = require("fs");
const path = require("path");
const argv = require("minimist");
const utils = require("./utils.js");
const config = require("../config/config.js");
const plotly = require("plotly")(config.plotly.username, config.plotly.apiKey);

function exportImage(figure, params, options = { format: "png", height: 500, width: 700 }) {
    plotly.getImage(figure, options, function (error, imageStream) {
        if (error) {
            console.error(error);
            return;
        }
        let fileStream = nodeFs.createWriteStream(params["output_file"] ? params["output_file"] : "plot.png");
        imageStream.pipe(fileStream);
    });
}

function exportJson(figure, params) {
    const obj = {
        figure: figure,
        params: params
    };
    utils.saveToJson(params.output_json, obj);
}

function getYValuesFromStore(base, storeName, x, targetVal) {
    let y = [];
    for (let i = 0; i < x.length; i++) {
        let query = {
            $from: storeName,
        };
        query = Object.assign(query, x[i]);
        let recs = base.search(query);
        if (recs.length > 0)
            y.push(recs[0][targetVal]);
    }
    return y;
}

function getXValuesFromStore(keys, store) {
    let xVals = [];
    store.allRecords.each((rec) => {
        let x = {};
        keys.forEach((k) => x[k] = rec[k]);
        xVals.push(x);
    });
    return xVals;
}

function plot(xValues, yTraces, yNames, params = {}) {

    if (config.plotly.username === undefined || config.plotly.apiKey === undefined) {
        console.warn("Plotly API username or apiKey is not provided in config.js - Predictions can not be plotted.");
        return;
    }

    let data = new Array(yTraces.length);
    for (let i = 0; i < yTraces.length; i++) {
        data[i] = {
            name: yNames[i],
            x: xValues,
            y: yTraces[i],
            type: "scatter"
        }
    }

    // Set figure layout
    let figure = {
        "data": data, "layout": {
            showlegend: true,
            title: params["title"] ? params["title"] : "",
            xaxis: {
                title: params["x_axis"] ? params["x_axis"] : "",
                titlefont: { size: 12 },
                tickangle: 45,
                tickfont: { size: 8 },
            },
            yaxis: {
                title: params["y_axis"] ? params["y_axis"] : "",
                titlefont: { size: 12 }
            }
        }
    };

    exportImage(figure, params);
}

function plotHeatmap(x, y, z, params) {

    // Set colorscale
    let merged = [].concat(...z).filter(e => e !== "-");
    let min = Math.min(...merged);
    let max = Math.max(...merged);
    let zero = Math.abs(0.0 - min / (max - min));
    let defaultColorscale = min > 0.0 ?
        [[0, "#d3d3d3"], [1, "#006400"]] // Positive numbers
        : [[0, "#8b0000"], [zero, "#d3d3d3"], [1, "#006400"]]; // Positive & negative numbers
    const data = [{
        z: z,
        x: x,
        y: y,
        colorscale: defaultColorscale, // "hot", // YIOrRd
        type:
            "heatmap"
    }];

    // Overwrite colorscale
    if (params.colorscale === "red") {
        data[0].colorscale =
            [[0, "#d3d3d3"], [1, "#8b0000"]] // Positive numbers
    } else if (params.colorscale != null) {
        data[0].colorscale = params.colorscale;
    }

    const figure = {
        "data": data, "layout": {
            margin: {
                t: 100,
                l: 150,
                r: 125,
                b: 100
            },
            autosize: true,
            showlegend: true,
            title: params["title"] ? params["title"] : "",
            xaxis: {
                title: params["x_axis"] ? params["x_axis"] : "",
                titlefont: {
                    family: "Arial"
                },
                showgrid: false,
                ticks: "",
                side: "bottom",
                linecolor: "#636363",
                linewidth: 3,
            },
            yaxis: {
                title: params["y_axis"] ? params["y_axis"] : "",
                titlefont: {
                    family: "Arial"
                },
                showgrid: false,
                ticksuffix: " ",
                linecolor: "#636363",
                linewidth: 3,
            },
            annotations: []
        }
    };

    // Heatmap annotations
    for (let i = 0; i < y.length; i++) {
        for (let j = 0; j < x.length; j++) {
            let textColor = "black";
            let result = {
                font: {
                    family: "Arial",
                    color: textColor
                },
                x: x[j],
                y: y[i],
                text: z[i][j],
                showarrow: false,

            };
            figure.layout.annotations.push(result);
        }
    }

    if (params.output_json) {
        exportJson(figure, params);
    }
    exportImage(figure, params);
}

if (require.main === module) {
    let parsedArgs = argv(process.argv.slice(2), {
        string: ["modelsDir"],
        default: {
            "modelsDir": "../data/usecase/categories/models/",
        },
    });

    let dir = parsedArgs["modelsDir"];

    [...nodeFs.readdirSync(dir), ""].forEach((currDir) => {
        let currPath = path.join(dir, currDir);
        if (!utils.existsDir(currPath, true)) return;

        // Plot from tsv
        if (parsedArgs["tsv"] != null) {
            let plotTsv = path.join(currPath, parsedArgs["tsv"]);
            // Check it TSV exists
            if (!utils.existsFile(plotTsv, true)) return;
            let x = [], yPred = [], yTrue = [];
            let file = fs.openRead(plotTsv);
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
            let params = { "output_file": path.join(currPath, "predictions_plot.png") };
            plot(x, [yTrue, yPred], ["True", "Predicted"], params);
            return;
        }

        // Plot from internal database
        let internalDb = path.join(currPath, "internalDb");
        if (!utils.existsDir(internalDb, true)) return;

        const base = new qm.Base({
            "dbPath": internalDb
        });

        // Additional parameters
        let params = {
            title: "Predictions vs true values",
            output_file: path.join(currPath, "plot.png")
        };
        let targetVal = "Value";
        // Get keys
        let keys = base.store("InputFit").fields.map(x => x.name).filter(x => x !== targetVal);
        // X values
        let x = getXValuesFromStore(keys, base.store("OutputPredictions"));
        // Get Y values - trace lines from stores
        let yLines = [];
        // Get true values from input records used for fit
        let trueVals = getYValuesFromStore(base, "InputFit", x, targetVal);
        if (trueVals.length === 0) {
            // Try getting true values from input records used for predictions
            trueVals = getYValuesFromStore(base, "InputPredictions", x, targetVal);
        }
        yLines.push(trueVals);
        yLines.push(getYValuesFromStore(base, "OutputPredictions", x, targetVal));
        base.close();

        let xStrings = x.map((x) => {
            return Object.values(x).reduce((acc, v) => {
                return acc + v;
            }, "");
        });
        plot(xStrings, yLines, ["True", "Predicted"], params);
    });
}

module.exports = {
    plot, plotHeatmap, getXValuesFromStore, getYValuesFromStore
};