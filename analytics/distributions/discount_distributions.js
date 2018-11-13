"use strict";

const qm = require("qminer");
const utils = require("../util/utils");

// Command line arguments
let argv = require("minimist")(process.argv.slice(2));

const majorSellersIds = ["138", "114", "862", "152", "1335", "561", "526", "342",
    "53", "440", "562", "571", "186", "790", "1215", "256"];


let dataParams = {
    "DD": {
        "name": "Discount distribution",
        "store": {
            "CEPricesIntervals": {
                "filterCol": ["CESellers.sellingInterval.IdSeller", "CEProducts.hadPriceInterval.ProdType"],
                "filterVal": [[], ["LedTv"]]
            }
        },
        "useIntervals": true
    },
    "MDD": {
        "name": "Discount distribution - Major sellers",
        "store": {
            "CEPricesIntervals": {
                "filterCol": ["CESellers.sellingInterval.IdSeller", "CEProducts.hadPriceInterval.ProdType"],
                "filterVal": [majorSellersIds, ["LedTv"]]
            }
        },
        "useIntervals": true
    },
    "CDD": {
        "name": "Discount distribution - Custom sellers",
        "store": {
            "CEPricesIntervals": {
                "filterCol": ["CESellers.sellingInterval.IdSeller", "CEProducts.hadPriceInterval.ProdType"],
                "filterVal": [["862", "342", "114"], ["LedTv"]]
            }
        },
        "useIntervals": true
    }
};

// Individual operations
if (argv.a) {
    console.log("Computing discount distributions for all sellers");
    let discounts = computeDiscountDists(dataParams.DD);
    let outfn = "discountDists.json";
    utils.saveToJson(outfn, discounts);
} else if (argv.m) {
    console.log("Computing discount distributions for major sellers");
    let sellersDiscounts = computeDiscountDists(dataParams.MDD);
    let outfn = "discountDists.json";
    utils.saveToJson(outfn, sellersDiscounts);
} else if (argv.c) {
    console.log("Computing discount distributions for custom sellers");
    let sellersDiscounts = computeDiscountDists(dataParams.CDD);
    let outfn = "discountDists.json";
    utils.saveToJson(outfn, sellersDiscounts);
} else {
    console.log("USAGE:");
    console.log("  -a : compute distributions for all sellers");
    console.log("  -m : compute distributions for major sellers");
    console.log("  -c : compute distributions for custom sellers");
}
//======================================================================================================================

function computeDiscountDists(params) {
    // Open base
    let base = new qm.Base({mode: "openReadOnly"});
    let rec = utils.getFilteredRecords(base, params);

    console.time("Compute dist");

    let dists;
    let sortBy = "Timestamp";
    if (params.useIntervals) {
        sortBy = "Start";
    }

    rec = rec.sortByField(sortBy, true);
    dists = getDiscountDistUnsorted(base, rec);

    console.timeEnd("Compute dist");
    base.close();

    return dists;
}

/**
 * Calculates discount distributions for all filtered sellers over all filtered products.
 * It assumes that records are not ordered.
 * @param {Base} base - base to extract all major sellers.
 * @param {RecordSet} records - all record to calculate discount distribution.
 *
 * @returns {array} [ [discount, freq], [discount1: freq], ...].
 */
function getDiscountDistUnsorted(base, records) {
    // Sort all records only by timestamp

    // all sellers
    let dists = {};

    // Prepare dists for all sellers
    let sellersStore = utils.getStore(base, "CESellers");
    let sellers = new Set(sellersStore.allRecords.getVector("IdSeller").toArray());

    sellers.forEach(function (seller) {
        dists[seller] = {};
        dists[seller].dists = {};
        dists[seller].products = {};
    });

    // Initial record
    let currRec = records[0];
    dists[currRec.atSeller.IdSeller].products[currRec.ofProduct.IdProduct] = currRec.Price;

    // Go through all records that are sorted by timestamp
    records.each(function (rec) {
        let currSellerId = rec.atSeller.IdSeller;
        let currProductId = rec.ofProduct.IdProduct;
        let currPrice = rec.Price;

        // Check if product exists
        if (!(currProductId in dists[currSellerId].products)) {
            dists[currSellerId]["products"][currProductId] = currPrice;
            return;
        }

        let price = dists[currSellerId].products[currProductId];
        // Check if discount
        if (price > currPrice) {
            let relDiscount = 1.0 - currPrice / price;
            if (relDiscount > 0.8) {
                currPrice = price;
                // Probably error in the data
            } else {
                // Pron to small error, but does not effect visualization
                let discount = (relDiscount * 100.0).toFixed(4);
                // If (dists[currSellerId]["dists"][discount] !== undefined) {
                if (discount in dists[currSellerId].dists) {
                    dists[currSellerId].dists[discount]++;
                } else {
                    dists[currSellerId].dists[discount] = 1;
                }
            }
        } else if (currPrice === (price * 100.0)) {
            // Most likely an error in a csv file
            currPrice = price;
        }

        dists[currSellerId].products[currProductId] = currPrice;
    });

    let finalDists = [];
    let minorDists = [];
    // Extract major and minor sellers
    Object.keys(dists).forEach(function (key) {
        if (Object.keys(dists[key]["dists"]).length === 0)
            return;
        let seller = dists[key];
        if (majorSellersIds.includes(key)) {
            let sellerName = sellersStore.recordByName(key).SellerName;
            finalDists.push({name: sellerName, dist: utils.objToList(seller.dists)});
        } else {
            minorDists = minorDists.concat(utils.objToList(seller.dists));
        }
    });

    finalDists.push({name: "Others", dist: minorDists});
    return finalDists;
}
