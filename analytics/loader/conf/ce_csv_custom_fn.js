"use strict";

// Check if product with given id exists in database and add it if not
// Finally return product record
function getProductRec(base, idProduct, ...args) {
    // Check if product record already exists
    let store = base.store("CEProducts");
    let prodRec = store.recordByName(idProduct);
    if (prodRec === undefined) {
        // Create product record
        let rec = { IdProduct: idProduct, ProdType: args[0] };
        // Add it to the store
        store.push(rec);
        prodRec = store.recordByName(idProduct);
    }
    return prodRec;
}

// Check if seller with given id exists in database and add it if not
// Finally return seller record
function getSellerRec(base, idSeller) {
    // Check if seller record already exists
    let store = base.store("CESellers");
    let sellerRec = store.recordByName(idSeller);
    if (sellerRec === undefined) {
        // Create seller record
        let rec = {
            SellerName: "Unknown",
            IdSeller: idSeller
        };
        // Add it to the store
        store.push(rec);
        sellerRec = store.recordByName(idSeller);
    }
    return sellerRec;
}

// Read view record from file and store it
function onLinePageview(base, lineVals, ...args) {
    // Get product record - either existing or newly created
    let prodRec = getProductRec(base, lineVals[0], args[0]);
    // Create pageviews record
    let rec = {
        Date: new Date(lineVals[1]),
        Pageviews: parseInt(lineVals[2]),
        Clicks: parseInt(lineVals[3])
    };
    let pwRecId = base.store("CEPageviews").push(rec);
    // Add pageview record to the join
    prodRec.$addJoin("wasViewed", pwRecId);
}

// Read click record from file and store it
function onLineClick(base, lineVals, args) {
    // There are some legacy entries with position and nr. of all offers 0 - ignore them
    if (parseInt(lineVals[3]) === 0 && parseInt(lineVals[3]) === 0) {
        return;
    }

    let date = new Date(lineVals[1]);
    // Get product record - either existing or newly created
    let prodRec = getProductRec(base, lineVals[0], args[0]);
    // Get product record - either existing or newly created
    let sellerRec = getSellerRec(base, lineVals[2]);
    // Create clicks record
    let rec = {
        Date: date,
        offerPosition: parseInt(lineVals[3]),
        allOffers: parseInt(lineVals[4]),
        Clicks: parseInt(lineVals[5])
    };
    let clickRecId = base.store("CEClicks").push(rec);
    // Add clicks record to the joins
    prodRec.$addJoin("wasClicked", clickRecId);
    sellerRec.$addJoin("gotRedirect", clickRecId);
}

// Read price record from file and store it
function onLinePrice(base, lineVals, ...args) {
    // Get product record - either existing or newly created
    let prodRec = getProductRec(base, lineVals[0], args[0]);
    // Get product record - either existing or newly created
    let sellerRec = getSellerRec(base, lineVals[1]);
    // Create price record
    let rec = {
        Price: parseFloat(lineVals[2]),
        Timestamp: new Date(lineVals[3])
    };
    let priceRecId = base.store("CEPrices").push(rec);
    // Add clicks record to the joins
    prodRec.$addJoin("hadPrice", priceRecId);
    sellerRec.$addJoin("selling", priceRecId);
}

// Read price interval record from file and store it
function onLinePriceIntervals(base, lineVals, ...args) {
    // Get product record - either existing or newly created
    let prodRec = getProductRec(base, lineVals[0], args[0]);
    // Get product record - either existing or newly created
    let sellerRec = getSellerRec(base, lineVals[1]);
    // Create price record
    let rec = {
        Price: parseFloat(lineVals[2]),
        Start: new Date(lineVals[3]),
        End: new Date(lineVals[4])
    };
    let priceRecId = base.store("CEPricesIntervals").push(rec);
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
function onLineProduct(base, lineVals) {
    if (lineVals.length !== 14) {
        console.log("Expecting a line of 14 fields:", lineVals.length);
    }

    // Problematic TV ids
    // If (lineVals[0] in ["2227676", "3096689", "5119899", "5119897", "5255785"]) {
    //     Console.log("skipping", lineVals[0]);
    //     Return;
    // }

    // Check if product record already exists and take its prodType
    let prodRec = base.store("CEProducts").recordByName(lineVals[0]);
    if (prodRec === undefined) {
        return;
    }
    let prodType = prodRec.ProdType;

    // Process EANs - when they are missing field is empty
    let eans = null;
    if (lineVals[12] !== "") {
        // Only parse if something there
        eans = lineVals[12].split(" ");
    }

    // Create product record
    let rec = {
        IdProduct: lineVals[0],
        ProdType: prodType, // Product types not given in this file
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
    base.store("CEProducts").push(rec);
}

function onSeller(base, lineVals) {
    let rec = {
        IdSeller: lineVals[0],
        SellerName: lineVals[1]
    };
    base.store("CESellers").push(rec);
}

module.exports = { onSeller, onLinePageview, onLineClick, onLinePrice, onLinePriceIntervals, onLineProduct };
