"use strict";

// Package imports
const qm = require("qminer");
const fs = qm.fs;

// Command line arguments
let argv = require("minimist")(process.argv.slice(2));

// Individial operations
if (argv.d) {
    console.log("Reading data info from: " + argv.d);
} else {
    console.log("USAGE:");
    console.log("  -d : path to data info json file");
    console.log("  OPTIONAL:");
    console.log("    -o : output db path");
    console.log("    -c : as complete - load all defined product types and sellers");
    console.log("    -a : load all defined product types in json file");
    console.log("    -s : load sellers name");
    console.log("    -i : load prices with intervals");
    process.exit(1);
}

const dbPath = argv.o ? argv.o : "./db";

// Read dataset metadata (file locations etc.)
let data_info_file = new fs.FIn(argv.d);
let data_info = JSON.parse(data_info_file.readAll());

if (!(argv.a || argv.c)) {
    // Default is loading TV product type
    data_info.big_bang.product_types = ["TV", "KLIMA"];
    data_info.ceneje.product_types = ["LedTv", "Klime"];
    console.log("Load Klima & TV product type");
}

// Create base
let base = new qm.Base({ mode: "createClean", dbPath: dbPath });
let nSkippedLines = 0;

// Generic logging on end of reading csv file
function logging(dataType) {
    for (let i = 0; i < dataType.store.length; i++) {
        if (dataType.msg[i]) {
            console.log("Collected data about: " + storesRef[dataType.store[i]].length + " " + dataType.msg[i]);
        } else {
            console.log("Collected data about: " + storesRef[dataType.store[i]].length);
        }
    }
}

// Generic wrapper to read csv files
function readCsvFile(filename, prodType, dataType, createRecFun) {
    let nLines = 0;
    nSkippedLines = 0;
    let file;

    if (fs.exists(filename)) {
        file = fs.openRead(filename);
    } else {
        throw new Error("File " + filename + " does not exist. Exiting ...");
    }

    if (typeof dataType.customReadCsv === "function") {
        //DataType.customReadCsv.apply( this, arguments );
        dataType.customReadCsv(file, prodType, dataType, createRecFun);
    } else {
        fs.readCsvLines(
            file,
            {
                delimiter: "\t",
                skipLines: 1,
                onLine: function (lineVals) {
                    nLines += 1;
                    if (nLines % 1000 === 0) {
                        process.stdout.write("\r" + nLines);
                    }
                    createRecFun(lineVals, prodType);
                },
                onEnd: function (err) {
                    console.log("\rRead " + nLines + " lines");
                    if (nSkippedLines) console.log("Skipped " + nSkippedLines + " lines");
                    logging(dataType);
                    if (err) {
                        console.log("!!! QMiner error");
                        throw err;
                    }
                }
            }
        );
        file.close();
    }
}

// Generic wrapper to read csv files
function readCsvFileIter(filename, prodType, dataType, createRecFun) {
    let file;

    if (fs.exists(filename)) {
        file = fs.openRead(filename);
    } else {
        throw new Error("File " + filename + " does not exist. Exiting ...");
    }

    let line_i = 0;
    while (!file.eof) {
        let line = file.readLine();
        let lineVals = line.split("\t");

        // Skip first line
        if (line_i < 1) {
            line_i += 1;
            continue;
        }
        // Print progress
        if (line_i % 1000 === 0) {
            process.stdout.write("\r" + line_i);
        }
        // Process line
        createRecFun(lineVals, prodType);
        line_i += 1;
    }

    file.close();

    console.log("\rRead " + line_i + " lines");
    logging(dataType);
}


//=============================================================================
// BIG BANG DATA
//=============================================================================
console.time("Load");
console.log("===   LOADING BIG BANG DATA   ===");

let BBDir = data_info.big_bang.dir;
// let BBProdTypes = ["TV"]; //"KLIMA", "MOBILNI", "SUSILNI"];
// let BBDataTypes = ["Lastnosti_artikla", "SELLOUT", "aktivnosti"];
// filename = "BB_<data_type>_SKU_<product_type>_jan2015-nov2017.tsv"

let BBData = {
    Properties: {
        store: ["BBProductProperty"],   // Store/scheme used
        msg: ["product properties"],    // Message used for logging (1:1 to store)
        customReadCsv: null             // If generic not applicable, define custom csv reader function
                                        // E.g. function test(file, prodType, dataType, createRecFun)
    },
    Saleout: {
        store: ["BBProduct", "BBSellout"],
        msg: ["products", "sales"]
    },
    Activities: {
        store: ["BBActivity"],
        msg: ["activities"]
    }
};

base.createStore([{
    name: "BBProduct",
    fields: [
        { name: "ProdType", type: "string", shortstring: true, codebook: true },
        { name: "ArtikelID", type: "string", shortstring: true, primary: true },
        { name: "EanKoda", type: "uint64" },
        { name: "ArtikelNaziv", type: "string", shortstring: true, codebook: true },
        { name: "BlagovnaZnamkaID", type: "int" },
        { name: "BlagovnaZnamkaNaziv", type: "string", shortstring: true, codebook: true },
        { name: "BlagovnaSkupinaNaziv1", type: "string", shortstring: true, codebook: true },
        { name: "BlagovnaSkupinaNaziv2", type: "string", shortstring: true, codebook: true },
        { name: "BlagovnaSkupinaNaziv3", type: "string", shortstring: true, codebook: true },
        { name: "BlagovnaSkupinaNaziv4", type: "string", shortstring: true, codebook: true },
        { name: "BlagovnaSkupinaID1", type: "string", shortstring: true, codebook: true },
        { name: "BlagovnaSkupinaID2", type: "string", shortstring: true, codebook: true },
        { name: "BlagovnaSkupinaID3", type: "string", shortstring: true, codebook: true },
        { name: "BlagovnaSkupinaID4", type: "string", shortstring: true, codebook: true },
        { name: "ID_BRICK", type: "string", shortstring: true, codebook: true },
        { name: "NAZIV_BRICK", type: "string", shortstring: true, codebook: true }
    ],
    joins: [
        { name: "wasSold", type: "index", store: "BBSellout", inverse: "soldProduct" },
        { name: "hasProperty", type: "index", store: "BBProductProperty", inverse: "propertyOf" },
        { name: "promotedIn", type: "index", store: "BBActivity", inverse: "promotedProduct" }
    ],
    keys: [
        { field: "ProdType", type: "value" }
    ]
}, {
    name: "BBProductProperty",
    fields: [
        { name: "PredlogaID", type: "string", shortstring: true, codebook: true },
        { name: "PredlogaNaziv", type: "string", shortstring: true, codebook: true },
        { name: "VRSTNI_RED", type: "int" },
        { name: "OBVEZNOST", type: "int" },
        { name: "LastnostID", type: "int" },
        { name: "LastnostNaziv", type: "string", shortstring: true, codebook: true },
        { name: "VrednostID", type: "int" },
        { name: "VrednostNaziv", type: "string", shortstring: true, codebook: true }
    ],
    joins: [
        { name: "propertyOf", type: "field", store: "BBProduct", inverse: "hasProperty" },
    ],
    keys: []
}, {
    name: "BBSellout",
    fields: [
        { name: "DAN", type: "datetime" },
        { name: "Kolicina", type: "int" },
        { name: "ProdajnaCena", type: "float" },
        { name: "MaloprodajnaCena", type: "float" },
        { name: "Popust", type: "float" },
        { name: "ProdajniKanal2ID", type: "int" },
        { name: "PoslovalnicaID", type: "int" },
        { name: "PoslovalnicaNaziv", type: "string", shortstring: true, codebook: true },
        { name: "PoslovalnicaPostaID", type: "int" },
        { name: "PoslovalnicaPostaNaziv", type: "string", shortstring: true, codebook: true },
        { name: "RegijaNaziv", type: "string", shortstring: true, codebook: true },
        { name: "StatisticnaRegijaNaziv", type: "string", shortstring: true, codebook: true },
        { name: "StatusAbc", type: "string", shortstring: true, codebook: true, null: true },
        { name: "StatusBsp", type: "string", shortstring: true, codebook: true, null: true },
        { name: "StatusEol", type: "string", shortstring: true, codebook: true, null: true }
    ],
    joins: [
        { name: "soldProduct", type: "field", store: "BBProduct", inverse: "wasSold" }
    ],
    keys: [
        { field: "DAN", type: "value" }
    ]
}, {
    name: "BBActivity",
    fields: [
        { name: "ST_AKCIJE", type: "int" },
        { name: "AkcijaID", type: "string", shortstring: true, codebook: true },
        { name: "AkcijaNaziv", type: "string", shortstring: true, codebook: true },
        { name: "StevilkaAkcijeNaziv", type: "string", shortstring: true, codebook: true },
        { name: "KANALOGLAS", type: "string", shortstring: true, codebook: true, null: true },
        { name: "KanalOglasevanjaNaziv", type: "string", shortstring: true, codebook: true },
        { name: "ProdajniKatalogID", type: "int", null: true },
        { name: "ProdajniKatalogNaziv", type: "string", shortstring: true, codebook: true, null: true },
        { name: "ZAC_DAT", type: "datetime" },
        { name: "KON_DAT", type: "datetime" },
        { name: "POPUSTCENA", type: "string", shortstring: true, codebook: true },
        { name: "POPUST", type: "float" },
        { name: "ZAC_CE_MA_PRO_A", type: "float" },
        { name: "KON_CE_MA_PRO_A", type: "float" }
    ],
    joins: [
        { name: "promotedProduct", type: "field", store: "BBProduct", inverse: "promotedIn" }
    ],
    keys: []
}]);

// Get references to individual stores to a dictionary - globally accessed
let storesRef = {
    "BBProduct": base.store("BBProduct"),
    "BBProductProperty": base.store("BBProductProperty"),
    "BBSellout": base.store("BBSellout"),
    "BBActivity": base.store("BBActivity")
};

function getBBFilename(dataType, prodType) {
    let filenameTemplate = data_info.big_bang.filename_template;
    // Use template for defining a filename
    if (filenameTemplate) {
        filenameTemplate = filenameTemplate.replace("<data_type>", dataType).replace("<product_type>", prodType);
        return filenameTemplate;
    } else {
        return "BB_" + dataType + "_SKU_" + prodType + "_jan2015-nov2017.tsv";
    }
}

function onLineSellout(lineVals, prodType) {
    let rec = {
        ProdType: prodType,
        ArtikelID: lineVals[10],
        EanKoda: parseInt(lineVals[11]),
        ArtikelNaziv: lineVals[12],
        BlagovnaZnamkaID: parseInt(lineVals[13]),
        BlagovnaZnamkaNaziv: lineVals[14],
        BlagovnaSkupinaNaziv1: lineVals[0],
        BlagovnaSkupinaNaziv2: lineVals[1],
        BlagovnaSkupinaNaziv3: lineVals[2],
        BlagovnaSkupinaNaziv4: lineVals[3],
        BlagovnaSkupinaID1: lineVals[4],
        BlagovnaSkupinaID2: lineVals[5],
        BlagovnaSkupinaID3: lineVals[6],
        BlagovnaSkupinaID4: lineVals[7],
        ID_BRICK: lineVals[8],
        NAZIV_BRICK: lineVals[9]
    };
    storesRef.BBProduct.push(rec);
    rec = {
        soldProduct: { ArtikelID: lineVals[10] },
        DAN: new Date(lineVals[22].split(" ")[0]),
        Kolicina: parseInt(lineVals[18]),
        ProdajnaCena: parseFloat(lineVals[19]),
        MaloprodajnaCena: parseFloat(lineVals[20]),
        Popust: parseFloat(lineVals[21]),
        ProdajniKanal2ID: parseInt(lineVals[23]),
        PoslovalnicaID: parseInt(lineVals[24]),
        PoslovalnicaNaziv: lineVals[25],
        PoslovalnicaPostaID: parseInt(lineVals[26]),
        PoslovalnicaPostaNaziv: lineVals[27],
        RegijaNaziv: lineVals[28],
        StatisticnaRegijaNaziv: lineVals[29],
        StatusAbc: lineVals[15],
        StatusBsp: lineVals[16],
        StatusEol: lineVals[17]
    };
    storesRef.BBSellout.push(rec);
}

function onLineActivity(lineVals) {
    if (!storesRef.BBProduct.recordByName(lineVals[0])) {
        nSkippedLines += 1;
    } else {
        let discountCat = lineVals[14];
        let discount = parseFloat(lineVals[15]);
        let endPrice = parseFloat(lineVals[16]);
        let startPrice;
        if (discountCat === "P") {
            startPrice = (endPrice * 100) / (100.0 - discount);
        } else if (discountCat === "C") {
            startPrice = endPrice + discount;
            discount = discount / startPrice * 100.0;
            //DiscountCat = 'P';
        } else {
            console.log("Unknown 'POPUSTCENA' category. Used as 'C' category.");
            startPrice = endPrice + discount;
            discount = discount / startPrice * 100.0;
        }

        let rec = {
            promotedProduct: { ArtikelID: lineVals[0] },
            ST_AKCIJE: parseInt(lineVals[4]),
            AkcijaID: lineVals[5],
            AkcijaNaziv: lineVals[6],
            StevilkaAkcijeNaziv: lineVals[7],
            KANALOGLAS: lineVals[8],
            KanalOglasevanjaNaziv: lineVals[9],
            ProdajniKatalogID: parseInt(lineVals[10]),
            ProdajniKatalogNaziv: lineVals[11],
            ZAC_DAT: new Date(lineVals[12].split(" ")[0]),
            KON_DAT: new Date(lineVals[13].split(" ")[0]),
            POPUSTCENA: discountCat,
            POPUST: discount,
            ZAC_CE_MA_PRO_A: startPrice,
            KON_CE_MA_PRO_A: endPrice
        };
        storesRef.BBActivity.push(rec);
    }
}

function onLineProductProperty(lineVals) {
    let rec = {
        propertyOf: { ArtikelID: lineVals[0] },
        PredlogaID: lineVals[4],
        PredlogaNaziv: lineVals[5],
        VRSTNI_RED: parseInt(lineVals[6]),
        OBVEZNOST: parseInt(lineVals[7]),
        LastnostID: parseInt(lineVals[8]),
        LastnostNaziv: lineVals[9],
        VrednostID: parseInt(lineVals[10]),
        VrednostNaziv: lineVals[11]
    };
    storesRef.BBProductProperty.push(rec);
}

for (let i = 0; i < data_info.big_bang.product_types.length; i++) {
    let prodType = data_info.big_bang.product_types[i];
    console.log("===   " + prodType + "   ===");

    // SELLOUT
    let selloutFileFnm = BBDir + getBBFilename("SELLOUT", prodType);
    console.log("Reading sellout data from " + selloutFileFnm);
    readCsvFile(selloutFileFnm, prodType, BBData.Saleout, onLineSellout);

    // PRODUCT PROPERTIES
    let prodPropFileFnm = BBDir + getBBFilename("Lastnosti_artikla", prodType);
    console.log("Reading " + BBData.Properties.msg + " from " + prodPropFileFnm);
    readCsvFile(prodPropFileFnm, prodType, BBData.Properties, onLineProductProperty);

    // MARKETING ACTIVITIES
    let activityFileFnm = BBDir + getBBFilename("aktivnosti", prodType);
    console.log("Reading " + BBData.Activities.msg + " data from " + activityFileFnm);
    readCsvFile(activityFileFnm, prodType, BBData.Activities, onLineActivity);
}

//=============================================================================
// CENEJE DATA
//=============================================================================

console.log("===   LOADING CENEJE DATA   ===");

let CEDir = data_info.ceneje.dir;
// Let CEProdTypes = ["LedTv", "Klime", "MobilePhones", "WinterTyres", "SummerTyres"];
// Let CEDataTypes = ["", "ClicksSeller", "_prices"];
// Filename = "ijs_<product_type><data_type>"

let CEData = {
    Pageviews: {
        store: ["CEPageviews"],
        msg: ["pageviews"],
        customReadCsv: null // If generic not applicable, define custom function to read csv
    },
    Clicks: {
        store: ["CEClicks"],
        msg: ["clicks"]
    },
    Prices: {
        store: ["CEPrices"],
        msg: ["prices"]
    },
    PricesIntervals: {
        store: ["CEPricesIntervals"],
        msg: ["interval prices"]
    },
    Sellers: {
        store: ["CESellers"],
        msg: ["sellers"]
    },
    Products: {
        store: ["CEProducts"],
        msg: ["products"]
    }
};

base.createStore([{
    name: "CEProducts",
    fields: [
        { name: "IdProduct", type: "string", shortstring: true, primary: true },
        { name: "ProdType", type: "string", shortstring: true, codebook: true },
        { name: "ProdName", type: "string", shortstring: true, null: true },
        { name: "IdBrand", type: "string", shortstring: true, codebook: true, null: true },
        { name: "Brand", type: "string", shortstring: true, codebook: true, null: true },
        { name: "IdL0", type: "string", shortstring: true, codebook: true, null: true },
        { name: "L0", type: "string", shortstring: true, codebook: true, null: true },
        { name: "IdL1", type: "string", shortstring: true, codebook: true, null: true },
        { name: "L1", type: "string", shortstring: true, codebook: true, null: true },
        { name: "IdL2", type: "string", shortstring: true, codebook: true, null: true },
        { name: "L2", type: "string", shortstring: true, codebook: true, null: true },
        { name: "IdL3", type: "string", shortstring: true, codebook: true, null: true },
        { name: "L3", type: "string", shortstring: true, codebook: true, null: true },
        { name: "EANs", type: "string_v", shortstring: true, null: true }
    ],
    joins: [
        { name: "wasViewed", type: "index", store: "CEPageviews", inverse: "viewedProduct" },
        { name: "wasClicked", type: "index", store: "CEClicks", inverse: "clickedProduct" },
        { name: "hadPrice", type: "index", store: "CEPrices", inverse: "ofProduct" },
        { name: "hadPriceInterval", type: "index", store: "CEPricesIntervals", inverse: "ofProduct" }
    ],
    keys: [
        { field: "IdProduct", type: "value" },
        { field: "ProdType", type: "value" }
    ]
}, {
    name: "CESellers",
    fields: [
        { name: "IdSeller", type: "string", shortstring: true, primary: true },
        { name: "SellerName", type: "string", shortstring: true }
    ],
    joins: [
        { name: "gotRedirect", type: "index", store: "CEClicks", inverse: "redirectedTo" },
        { name: "selling", type: "index", store: "CEPrices", inverse: "atSeller" },
        { name: "sellingInterval", type: "index", store: "CEPricesIntervals", inverse: "atSeller" }
    ],
    keys: [{ field: "IdSeller", type: "value" }]
}, {
    name: "CEPageviews",
    fields: [
        { name: "Date", type: "datetime" },
        { name: "Pageviews", type: "int" },
        { name: "Clicks", type: "int" }
    ],
    joins: [
        { name: "viewedProduct", type: "field", store: "CEProducts", inverse: "wasViewed" }
    ],
    keys: []
}, {
    name: "CEClicks",
    fields: [
        { name: "Date", type: "datetime" },
        { name: "offerPosition", type: "int" },
        { name: "allOffers", type: "int" },
        { name: "Clicks", type: "int" }
    ],
    joins: [
        { name: "clickedProduct", type: "field", store: "CEProducts", inverse: "wasClicked" },
        { name: "redirectedTo", type: "field", store: "CESellers", inverse: "gotRedirect" }
    ],
    keys: []
}, {
    name: "CEPrices",
    fields: [
        { name: "Price", type: "float" },
        { name: "Timestamp", type: "datetime" }
    ],
    joins: [
        { name: "ofProduct", type: "field", store: "CEProducts", inverse: "hadPrice" },
        { name: "atSeller", type: "field", store: "CESellers", inverse: "selling" }
    ],
    keys: []
}, {
    name: "CEPricesIntervals",
    fields: [
        { name: "Price", type: "float" },
        { name: "Start", type: "datetime" },
        { name: "End", type: "datetime" }
    ],
    joins: [
        { name: "ofProduct", type: "field", store: "CEProducts", inverse: "hadPriceInterval" },
        { name: "atSeller", type: "field", store: "CESellers", inverse: "sellingInterval" }
    ],
    keys: []
}
]);

storesRef.CEProducts = base.store("CEProducts");
storesRef.CESellers = base.store("CESellers");
storesRef.CEPageviews = base.store("CEPageviews");
storesRef.CEClicks = base.store("CEClicks");
storesRef.CEPrices = base.store("CEPrices");
storesRef.CEPricesIntervals = base.store("CEPricesIntervals");

function getCEFilename(dataType, prodType) {
    let filenameTemplate = data_info.ceneje.filename_template;
    if (filenameTemplate) {
        filenameTemplate = filenameTemplate.replace("<data_type>", dataType).replace("<product_type>", prodType);
        return filenameTemplate;
    } else {
        // In case filename_template not defined in json use default
        return "ijs_" + prodType + dataType + ".csv";
    }
}

// Check if product with given id exists in database and add it if not
// Finally return product record
function getProductRec(idProduct, prodType) {
    // Check if product record already exists
    let prodRec = storesRef.CEProducts.recordByName(idProduct);
    if (prodRec === undefined) {
        // Create product record
        let rec = { IdProduct: idProduct, ProdType: prodType };
        // Add it to the store
        storesRef.CEProducts.push(rec);
        prodRec = storesRef.CEProducts.recordByName(idProduct);
    }
    return prodRec;
}

// Check if seller with given id exists in database and add it if not
// Finally return seller record
function getSellerRec(idSeller) {
    // Check if seller record already exists
    let sellerRec = storesRef.CESellers.recordByName(idSeller);
    if (sellerRec === undefined) {
        // Create seller record
        let rec = {
            SellerName: "Unknown",
            IdSeller: idSeller
        };
        // Add it to the store
        storesRef.CESellers.push(rec);
        sellerRec = storesRef.CESellers.recordByName(idSeller);
    }
    return sellerRec;
}

// Read view record from file and store it
function onLinePageview(lineVals, prodType) {
    // Get product record - either existing or newly created
    let prodRec = getProductRec(lineVals[0], prodType);
    // Create pageviews record
    let rec = {
        Date: new Date(lineVals[1]),
        Pageviews: parseInt(lineVals[2]),
        Clicks: parseInt(lineVals[3])
    };
    let pwRecId = storesRef.CEPageviews.push(rec);
    // Add pageview record to the join
    prodRec.$addJoin("wasViewed", pwRecId);
}

// Read click record from file and store it
function onLineClick(lineVals, prodType) {
    // There are some legacy entries with position and nr. of all offers 0 - ignore them
    if (parseInt(lineVals[3]) === 0 && parseInt(lineVals[3]) === 0) {
        return;
    }

    let date = new Date(lineVals[1]);
    // Get product record - either existing or newly created
    let prodRec = getProductRec(lineVals[0], prodType);
    // Get product record - either existing or newly created
    let sellerRec = getSellerRec(lineVals[2]);
    // Create clicks record
    let rec = {
        Date: date,
        offerPosition: parseInt(lineVals[3]),
        allOffers: parseInt(lineVals[4]),
        Clicks: parseInt(lineVals[5])
    };
    let clickRecId = storesRef.CEClicks.push(rec);
    // Add clicks record to the joins
    prodRec.$addJoin("wasClicked", clickRecId);
    sellerRec.$addJoin("gotRedirect", clickRecId);
}

// Read price record from file and store it
function onLinePrice(lineVals, prodType) {
    // Get product record - either existing or newly created
    let prodRec = getProductRec(lineVals[0], prodType);
    // Get product record - either existing or newly created
    let sellerRec = getSellerRec(lineVals[1]);
    // Create price record
    let rec = {
        Price: parseFloat(lineVals[2]),
        Timestamp: new Date(lineVals[3])
    };
    let priceRecId = storesRef.CEPrices.push(rec);
    // Add clicks record to the joins
    prodRec.$addJoin("hadPrice", priceRecId);
    sellerRec.$addJoin("selling", priceRecId);
}

// Read price interval record from file and store it
function onLinePriceIntervals(lineVals, prodType) {
    // Get product record - either existing or newly created
    let prodRec = getProductRec(lineVals[0], prodType);
    // Get product record - either existing or newly created
    let sellerRec = getSellerRec(lineVals[1]);
    // Create price record
    let rec = {
        Price: parseFloat(lineVals[2]),
        Start: new Date(lineVals[3]),
        End: new Date(lineVals[4])
    };
    let priceRecId = storesRef.CEPricesIntervals.push(rec);
    // Add clicks record to the joins
    prodRec.$addJoin("hadPriceInterval", priceRecId);
    sellerRec.$addJoin("sellingInterval", priceRecId);
}

// Check if string value is 'NULL' and replace it with the null object
function checkNULL(strVal) {
    if (strVal === "NULL") {
        return null;
    }
    return strVal;
}

// Read product data from file and add it to existing product fields
function onLineProduct(lineVals) {
    // Check if line is ok
    // console.log(lineVals.length);
    // assert.strictEqual(lineVals.length, 14, "Expecting a line of 14 fields")
    if (lineVals.length !== 14) {
        console.log("Expecting a line of 14 fields:", lineVals.length);
    }

    // Problematic TV ids
    /*
    if (lineVals[0] in ["2227676", "3096689", "5119899", "5119897", "5255785"]) {
    console.log("skipping", lineVals[0]);
    return;
    }
     */

    // Check if product record already exists and take its prodType
    let prodRec = storesRef.CEProducts.recordByName(lineVals[0]);
    if (prodRec === undefined) {
        return;
    }
    let prodType = prodRec.ProdType;

    // Process EANs - when they are missing field is empty
    let eans = null;
    if (lineVals[12] !== "") { // Only parse if something there
        eans = lineVals[12].split(" ");
    }

    // Create product record
    let rec = {
        IdProduct: lineVals[0],
        ProdType: prodType,  // Product types not given in this file
        ProdName: lineVals[1],
        IdBrand: lineVals[2],
        Brand: lineVals[3],
        IdL0: checkNULL(lineVals[4]), // Level 0 categories can be NULL
        L0: checkNULL(lineVals[5]),
        IdL1: lineVals[6],
        L1: lineVals[7],
        IdL2: lineVals[8],
        L2: lineVals[9],
        IdL3: lineVals[10],
        L3: lineVals[11],
        EANs: eans
    };
    storesRef.CEProducts.push(rec);
}

function onSeller(lineVals) {
    let rec = {
        IdSeller: lineVals[0],
        SellerName: lineVals[1],
    };
    storesRef.CESellers.push(rec);
}

// SELLERS
if (argv.s || argv.c) {
    console.log("===   SELLERS   ===");
    let fileFnm = CEDir + getCEFilename("Seller", "");
    console.log("Reading sellers data from " + fileFnm);
    readCsvFile(fileFnm, "", CEData.Sellers, onSeller);
}

// For each product type load data to qm store
for (let i = 0; i < data_info.ceneje.product_types.length; i++) {
    let prodType = data_info.ceneje.product_types[i];
    console.log("===   " + prodType + "   ===");

    // PAGEVIEWS
    let pageviewsFileFnm = CEDir + getCEFilename("", prodType);
    console.log("Reading " + CEData.Pageviews.msg + " data from " + pageviewsFileFnm);
    readCsvFile(pageviewsFileFnm, prodType, CEData.Pageviews, onLinePageview);

    // CLICKS
    let clicksFileFnm = CEDir + getCEFilename("ClicksSeller", prodType);
    console.log("Reading " + CEData.Clicks.msg + " data from " + clicksFileFnm);
    readCsvFile(clicksFileFnm, prodType, CEData.Clicks, onLineClick);

    // PRICES
    let pricesFileFnm = CEDir + getCEFilename("_prices", prodType);
    console.log("Reading " + CEData.Prices.msg + " data from " + pricesFileFnm);
    readCsvFile(pricesFileFnm, prodType, CEData.Prices, onLinePrice);

    // PRICES INTERVALS
    if (argv.i || argv.c) {
        let pricesIntFileFnm = CEDir + getCEFilename("_prices_intervals", prodType);
        console.log("Reading " + CEData.PricesIntervals.msg + " data from " + pricesIntFileFnm);
        readCsvFile(pricesIntFileFnm, prodType, CEData.PricesIntervals, onLinePriceIntervals);
    }

    // PRODUCT INFO
    let productsFileFnm = CEDir + data_info.ceneje.products_filename;
    console.log("Reading " + CEData.Products.msg + " data from " + productsFileFnm);
    readCsvFileIter(productsFileFnm, "", CEData.Products, onLineProduct);
}

base.getStoreList().forEach(store => console.log(store.storeName + ": " + store.storeRecords + " records."));
console.timeEnd("Load");

base.close();
