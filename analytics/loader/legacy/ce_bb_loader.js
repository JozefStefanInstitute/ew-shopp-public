"use strict";

const qm = require("qminer");
const fs = qm.fs;
// Command line arguments
const argv = require("minimist")(process.argv.slice(2));
let loader;
if (require.main === module) {
    loader = require("../data_loader");
}

/**
 * This script expects the path to Big Bang configuration file [e.g. bb_csv_conf.json] with a properly defined source,
 * destination and first query in the query field, which should define applied scheme. Other queries will be ignored
 * in the given configuration file and will auto-generate based on data_info.json configurations. In the same manner,
 * the Ceneje configuration file should be defined.
 */

if (argv.d && argv.b && argv.c) {
    console.log("Reading data info from: " + argv.d);
} else {
    console.log("USAGE:");
    console.log("  -d : path to data info json file [data_info.json]");
    console.log("  -b : path to big bang json template file [bb_csv_conf.json]");
    console.log("  -c : path to ceneje json conf file [ce_csv_conf.json]");
    console.log("  OPTIONAL:");
    console.log("    -g : generate conf files");
    process.exit(1);
}

// Read data set metadata (file locations etc.)
let dataInfoFile = new fs.FIn(argv.d);
let dataInfo = JSON.parse(dataInfoFile.readAll());

let queries = [];

function saveJson(filename, conf) {
    let fout = new fs.FOut(filename);
    fout.writeJson(conf);
    fout.close();
}

function store(conf, closeDst) {
    loader.setConf(conf);
    loader.setSrc(conf.source);
    loader.setDst(conf.destination);
    loader.run(closeDst);
}

function addQuery(queries, name, srcPath, fnName, args) {
    let query = {
        name: name,
        use_query: true,
        use_schema: false,
        query_src: {
            filename: srcPath,
            read_line_fn: fnName,
            read_line_fn_args: args
        }
    };
    queries.push(query);
    return query;
}

//=============================================================================
// BIG BANG DATA
//=============================================================================
console.time("Load");
console.log("===   LOADING BIG BANG DATA   ===");

function getBBFilename(dataType, prodType) {
    let filenameTemplate = dataInfo.big_bang.filename_template;
    // Use template for defining a filename
    if (filenameTemplate) {
        filenameTemplate = filenameTemplate.replace("<data_type>", dataType).replace("<product_type>", prodType);
        return filenameTemplate;
    } else {
        return "BB_" + dataType + "_SKU_" + prodType + "_jan2015-nov2017.tsv";
    }
}

// Loading data loader template
const databaseBBConfFile = new fs.FIn(argv.b);
const confBB = JSON.parse(databaseBBConfFile.readAll());

queries.push(confBB.queries[0]);
for (let i = 0; i < dataInfo.big_bang.product_types.length; i++) {
    let prodType = dataInfo.big_bang.product_types[i];

    // Sellout
    let selloutFileFnm = getBBFilename("SELLOUT", prodType);
    addQuery(queries, "BB Sellout [" + prodType + "]", selloutFileFnm, "onLineSellout", [prodType]);

    // Product properties
    let prodPropFileFnm = getBBFilename("Lastnosti_artikla", prodType);
    addQuery(queries, "BB Product properties [" + prodType + "]", prodPropFileFnm, "onLineProductProperty", [prodType]);

    // Marketing activities
    let activityFileFnm = getBBFilename("aktivnosti", prodType);
    addQuery(queries, "BB Activities data [" + prodType + "]", activityFileFnm, "onLineActivity", [prodType]);
}

confBB.queries = queries;
store(confBB, true);
if (argv.g) saveJson("bb_csv_conf_auto.json", confBB);

//======================================================================================================================
// CENEJE DATA
//======================================================================================================================
console.log("===   LOADING CENEJE DATA   ===");
queries = [];

function getCEFilename(dataType, prodType) {
    let filenameTemplate = dataInfo.ceneje.filename_template;
    if (filenameTemplate) {
        filenameTemplate = filenameTemplate.replace("<data_type>", dataType).replace("<product_type>", prodType);
        return filenameTemplate;
    } else {
        // In case filename_template is not defined in json use default
        return "ijs_" + prodType + dataType + ".csv";
    }
}

// Loading data loader template
const databaseCEConfFile = new fs.FIn(argv.c);
const confCC = JSON.parse(databaseCEConfFile.readAll());
confCC.destination.mode = "extend";

queries.push(confCC.queries[0]);

// Sellers
let fileFnm = getCEFilename("Seller", "");
console.log("Reading sellers data from " + fileFnm);
addQuery(queries, "CE Sellers", fileFnm, "onSeller", []);

// For each product type load data to qm store
for (let i = 0; i < dataInfo.ceneje.product_types.length; i++) {
    let prodType = dataInfo.ceneje.product_types[i];

    // Pageviews
    let pageviewsFileFnm = getCEFilename("", prodType);
    addQuery(queries, "CE Pageviews [" + prodType + "]", pageviewsFileFnm, "onLinePageview", [prodType]);

    // Clicks
    let clicksFileFnm = getCEFilename("ClicksSeller", prodType);
    addQuery(queries, "CE Clicks [" + prodType + "]", clicksFileFnm, "onLineClick", [prodType]);

    // Prices
    let pricesFileFnm = getCEFilename("_prices", prodType);
    addQuery(queries, "CE Prices [" + prodType + "]", pricesFileFnm, "onLinePrice", [prodType]);

    // Price intervals
    let pricesIntFileFnm = getCEFilename("_prices_intervals", prodType);
    addQuery(queries, "CE Price intervals [" + prodType + "]", pricesIntFileFnm, "onLinePriceIntervals", [prodType]);

    // Product info
    let productsFileFnm = dataInfo.ceneje.products_filename;
    addQuery(queries, "CE Products [" + prodType + "]", productsFileFnm, "onLineProduct", [prodType]);
}

confCC.queries = queries;

store(confCC, true);
if (argv.g) saveJson("ce_csv_conf_auto.json", confCC);

console.timeEnd("Load");
