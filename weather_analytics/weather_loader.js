"use strict";

// package imports
let qm = require('qminer');
let fs = qm.fs;

// command line arguments
var argv = require('minimist')(process.argv.slice(2));

// individial operations
if (argv.d) {
    console.log("Reading data info from: " + argv.d);
} else {
    console.log("USAGE:");
    console.log("  -d : path to data info json file");
    process.exit(1);
}

// read dataset metadata (file locations etc.)
let data_info_file = new fs.FIn(argv.d);
let data_info = JSON.parse(data_info_file.readAll());

// create base
let base = new qm.Base({ 
    mode: 'createClean',
    dbPath: data_info.weather.dbPath
});

//=============================================================================
// WEATHER DATA
//=============================================================================
console.time('Load');
console.log("===   LOADING WEATHER DATA   ===");

let WDir = data_info.weather.dir;
base.createStore([{
    name: "Weather",
    fields: [
        { name: "aggFunc",		    type: "string", shortstring: true},
        { name: "dayOffset",        type: "int"},
        { name: "featureName",      type: "string"},
        { name: "fromHour",         type: "int"},
        { name: "region",           type: "int"},
        { name: "shortName",        type: "string", shortstring: true},
        { name: "toHour",           type: "int"},
        { name: "validityDateTime", type: "datetime"},
        { name: "value",            type: "float"}
    ],
    joins: [
    ],
    keys: [
        { field: "aggFunc", type: "value"}
    ]
}]);

let storesRef = {"Weather": base.store("Weather")};

function onLineWeather(lineVals) {
    let rec = {
        aggFunc: lineVals[0],
        dayOffset: parseInt(lineVals[1]),
        featureName: lineVals[2],
        fromHour: parseInt(lineVals[3]),
        region: parseInt(lineVals[4]),
        shortName: lineVals[5],
        toHour: parseInt(lineVals[6]),
        validityDateTime: lineVals[7],
        value: parseFloat(lineVals[8]),
    };
    storesRef["Weather"].push(rec);
}

let weatherFileFnm = WDir + data_info.weather.filename;
console.log("Reading weather data from " + weatherFileFnm);
readCsvFile(weatherFileFnm, onLineWeather);
base.close();

//=============================================================================
// UTIL
//=============================================================================
// generic wrapper to read csv files
function readCsvFile(filename, createRecFun){
    let nLines = 0;
    let nSkippedLines = 0;
    let file;

    if (fs.exists(filename)) {
        file = fs.openRead(filename);
    } else {
        console.log("File " + filename + " does not exist. Skipping ...")
        return;
    }

    fs.readCsvLines(file,
        {
            delimiter: '\t',
            skipLines: 1,
            onLine: function (lineVals) {
                nLines += 1;
                if (nLines % 1000 === 0) { process.stdout.write("\r" + nLines); }
                createRecFun(lineVals);
            },
            onEnd: function (err) {
                console.log("\rRead " + nLines + " lines");
                if(nSkippedLines) console.log("Skipped " + nSkippedLines + " lines");
                if (err) {
                    console.log('!!! QMiner error');
                    throw err;
                }
            }
        }
    );
    file.close()
}