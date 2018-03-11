"use strict";

// package imports
let qm = require('qminer');
let fs = qm.fs;

// command line arguments
var argv = require('minimist')(process.argv.slice(2));

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
    dbPath: data_info.sales.dbPath
});

//=============================================================================
// SALES DATA
//=============================================================================
console.time('Load');
console.log("===   LOADING SALES DATA   ===");

// schema for sales data
base.createStore([{
    name: "Sales",
    fields: [
        { name: "ProductGroup",     type: "string"},
        { name: "SalesChannel",     type: "string"},
        { name: "Date",             type: "dateTime"},
        { name: "Quantity",         type: "int"},
    ],
    joins: [
    ],
    keys: [
    ]
}]);

// data store reference
let salesStore = base.store("Sales");

// line parser
function onLineSales(lineVals) {
    let rec = {
        ProductGroup: lineVals[0],
        SalesChannel: lineVals[1],
        Date: lineVals[2],
        Quantity: parseInt(lineVals[3])
    };
    salesStore.push(rec);
}

let SalesDir = data_info.sales.dir;
let SalesFileFnm = SalesDir + data_info.sales.filename;

console.log("Reading data from " + SalesFileFnm);
readCsvFile(SalesFileFnm, onLineSales);

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
