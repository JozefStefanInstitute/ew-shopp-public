"use strict";

const qm = require("qminer");
const assert = require("assert");
const utils = require("../util/utils");
const argv = require("minimist")(process.argv.slice(2));

const MAJOR_SELLERS_IDS = ["138", "114", "862", "152", "1335", "561", "526", "342", "53", "440", "562", "571", "186",
    "790", "1215", "256"];
//  const MAJOR_TV_BRANDS = ["SAMSUNG", "PHILIPS", "LG", "SONY", "VOX", "SHARP", "PANASONIC"];

const USE_CASES = {
    "MD": {
        "name": "TV difference after event - major sellers",
        "store": {
            "CEClicks": {
                "filterCol": ["CESellers.gotRedirect.IdSeller", "CEProducts.wasClicked.ProdType"],
                "filterVal": [MAJOR_SELLERS_IDS, ["LedTv"]]
            }
        },
        "diff": {
            "timestampCol": "Date",
            "interestCol": "Clicks",
            "pastDate": 365,  // Or Date
            "futureDate": 365,
            "binSize": 24
        }
    },
    "CD": {
        "name": "TV difference after event - custom sellers",
        "store": {
            "CEClicks": {
                "filterCol": ["CESellers.gotRedirect.IdSeller", "CEProducts.wasClicked.ProdType"],
                "filterVal": [["46"], ["LedTv"]]
            }
        },
        "diff": {
            "timestampCol": "Date",
            "interestCol": "Clicks",
            "pastDate": 365,
            "futureDate": 365,
            "binSize": 24
        }
    },
    "SMD": {
        "name": "Difference on discounts",
        "store": {
            "CEPricesIntervals": {
                "filterCol": ["CESellers.sellingInterval.IdSeller", "CEProducts.hadPriceInterval.ProdType"],
                "filterVal": [MAJOR_SELLERS_IDS, ["LedTv"]]
            },
        },
        "diff": {
            "rec": "ofProduct.wasClicked",
            "timestampCol": "Date",
            "interestCol": "Clicks",
            "pastDate": "",     // Whole past interval
            "futureDate": 3,    // 5, 7 in days
            "binSize": 24,      // In hours
            // Optional
            "relative": true,
            "smoothing": 100.0,
            "categories": true,
            "addBrands": false,
            // "filterRes": res => res.discount > 3.0
        }
    },
    "DEB": {
        "name": "Discount effect over brands",
        "store": {
            "CEPricesIntervals": {
                "filterCol": ["CESellers.sellingInterval.IdSeller", "CEProducts.hadPriceInterval.ProdType"],
                "filterVal": [MAJOR_SELLERS_IDS, ["LedTv"]]
            },
        },
        "diff": {
            "rec": "ofProduct.wasClicked",
            "timestampCol": "Date",
            "interestCol": "Clicks",
            "pastDate": "",     // Whole past interval
            "futureDate": "3",  // 5, 7 in days
            "binSize": 24,      // In hours
            // Optional
            "relative": true,
            "onDataFn": (rec, interval, info) => {
                return {
                    diff_avg: interval.diff.diff_avg,
                    discount: info.discount,
                    price: info.price,
                    brand: rec.ofProduct.Brand,
                    productId: rec.ofProduct.IdProduct,
                    productName: rec.ofProduct.ProdName
                }
            },
            // "includeRank": false,
            // "filterRes": res => res.discount > 3.0,
            "smoothing": 100.0,
            "categories": true,
        }
    },
    "BBTV": {
        "name": "Big Bang marketing discounts effect",
        "store": {
            "BBActivity": {
                "filterCol": ["BBProduct.promotedIn.ProdType"],
                "filterVal": [["TV"]]
            },
        },
        "diff": {
            "rec": "promotedProduct.wasSold",
            "timestampCol": "DAN",
            "interestCol": "Kolicina",
            "pastDate": "30",       // Whole past interval
            "futureDate": "",       // 5, 7 in days
            "binSize": 24,          // In hours
            "groupBy": "brand",
            // Optional
            "relative": true,
            "onDataFn": (rec, interval) => {
                return {
                    diff_avg: interval.diff.diff_avg,
                    brand: rec.promotedProduct.BlagovnaZnamkaNaziv,
                    productId: rec.promotedProduct.ArtikelID,
                    productName: rec.promotedProduct.ArtikelNaziv,
                    price: rec.ZAC_CE_MA_PRO_A.toFixed(3),
                    discount: rec.POPUST,
                    actionType: rec.AkcijaNaziv
                }
            },
            "smoothing": 100.0,
            "filterRes": res => res.discount > 0.0 //  && res.actionType !== "ODPRODAJA"
        }
    },
    "FEATBB": {
        "name": "Default BigBang discount properties",
        "store": {
            "BBActivity": {
                "filterCol": ["BBProduct.promotedIn.ProdType"],
                "filterVal": [["TV"]]
            },
        },
        "diff": {
            "rec": "promotedProduct.wasSold",
            "timestampCol": "DAN",
            "interestCol": "Kolicina",
            "pastDate": "30",       // Whole past interval
            "binSize": 24,          // In hours
            "futureDate": "",       // 5, 7 in days
            "groupBy": "",
            "onDataFn": (rec, interval) => {
                return {
                    diff_avg: interval.diff.diff_avg,
                    brand: rec.promotedProduct.BlagovnaZnamkaNaziv,
                    productId: rec.promotedProduct.ArtikelID,
                    productName: rec.promotedProduct.ArtikelNaziv,
                    price: rec.ZAC_CE_MA_PRO_A.toFixed(3),
                    discount: rec.POPUST,
                    startDate: rec.ZAC_DAT,
                    endDate: rec.KON_DAT,
                    actionType: rec.AkcijaNaziv
                }
            },
            // Optional
            "relative": true,
            "smoothing": 100.0,
            // "filterRes": res => res.discount > 0.0 && res.actionType !== "ODPRODAJA"
        }
    },
    "FEATC": {
        "name": "Default Ceneje discount properties",
        "input_db": "../data/dbs/CeBBRawDb",
        "store": {
            "CEPricesIntervals": {
                "filterCol": ["CESellers.sellingInterval.IdSeller", "CEProducts.hadPriceInterval.ProdType"],
                "filterVal": [MAJOR_SELLERS_IDS, ["LedTv"]]
            },
        },
        "diff": {
            "rec": "ofProduct.wasClicked",
            "timestampCol": "Date",
            "interestCol": "Clicks",
            "pastDate": "",     // Whole past interval
            "futureDate": 3,  // 5, 7 in days
            "binSize": 24,      // In hours
            // Optional
            "relative": true,
            "smoothing": 100.0,
            "categories": false,
            "onDataFn": (rec, interval, info) => {
                return {
                    product_id: rec.ofProduct.IdProduct,
                    prod_type: rec.ofProduct.ProdType,
                    brand: rec.ofProduct.Brand,
                    startDate: info.startDate,
                    endDate: info.endDate,
                    price: info.price,
                    discount: info.discount,
                    rank_disc: interval.diff.rank_disc,
                    n_prices_disc: interval.diff.n_prices_disc,
                    rank_gain: interval.diff.rank_gain,
                    diff_avg: interval.diff.diff_avg,
                    rank_avg: interval.diff.rank_avg,
                    n_prices_avg: interval.diff.n_prices_avg
                }
            },
            "includeRank": true,
            "includeRankGain": true,
            "freqRank": 1      // In hours
        }
    }
};

if (require.main === module) {
    // Individual operations
    if (argv.m) {
        console.log("Computing distributions for time intervals around event for major sellers");
        utils.saveToJson("diffDists.json", computeIntervalDiff(USE_CASES.MD));
    } else if (argv.c) {
        console.log("Computing distributions for time intervals around event for custom sellers");
        utils.saveToJson("diffDists.json", computeIntervalDiff(USE_CASES.CD));
    } else if (argv.d) {
        console.log("Computing scatter of diff on discounts for major sellers");
        utils.saveToJson(argv.d, computeDiffOnDiscounts(USE_CASES.SMD));
    } else if (argv.b) {
        console.log("Computing scatter of diff on discounts for brands");
        utils.saveToJson(argv.b, computeDiffOnDiscounts(USE_CASES.DEB));
    } else if (argv.a) {
        console.log("Computing scatter of diff on discounts for Big Bang marketing activities");
        utils.saveToJson(argv.a, computeDiffOnBBMarketing(USE_CASES.BBTV));
    } else if (argv.t) {
        console.log("Computing discounts properties on BigBang sales");
        utils.saveToJson(argv.t, getBBDiscountProps());
    } else if (argv.z) {
        console.log("Computing discounts properties on Ceneje clicks");
        utils.saveToJson(argv.z, getDiscountProps());
    } else {
        console.log("USAGE:");
        console.log("  -m : compute distributions for major sellers (time intervals)");
        console.log("  -c : compute distributions for custom sellers (time intervals)");
        console.log("  -d : compute difference in clicks on discounts for major sellers");
        console.log("  -b : compute difference in clicks on discounts for brands");
        console.log("  -a : compute difference in sold products on discounts/marketing activities for Big Bang");
        console.log("  -t : compute discounts properties on BigBang sales");
        console.log("  -z : compute discounts properties on Ceneje clicks");
    }
}

function computeIntervalDiff(params) {
    // Open base
    let base = new qm.Base({ mode: "openReadOnly" });
    let rec = utils.getFilteredRecords(base, params);
    let dists = [];

    console.time("Compute diff");

    let intervals = diffOnTimeInterval(new Date("2015-12-02"),
        params.diff.pastDate, params.diff.futureDate, rec, params.diff, params.diff.binSize);
    dists.push({ name: "Diff", data: intervals.diff, dist: intervals.before.values.concat(intervals.after.values) });

    console.timeEnd("Compute diff");

    base.close();
    return dists;
}

function computeDiffOnDiscounts(params) {
    // Input: [intervalPrices]
    // Output: [<category>: {info: ...}, dist:{"name":"Big Bang sales","dist":[["discount",[diffStats]]}, ...}]
    // Open base
    let base = params.input_db ? new qm.Base({
        dbPath: params.input_db,
        mode: "openReadOnly"
    }) : new qm.Base({ mode: "openReadOnly" });

    let rec = utils.getFilteredRecords(base, params);
    console.log("Number of filtered recs:", rec.length);
    console.time("Compute diff");
    rec.sortByField("Start", true);
    let diffs = getDiscountDistUnsorted(base, rec, params);

    // Filter final results
    if ("filterRes" in params.diff && params.diff.filterRes !== "") {
        for (const [catKey, category] of Object.entries(diffs)) {
            for (const [key, value] of Object.entries(category.dist)) {
                diffs[catKey].dist[key] = value.reduce(
                    (accumulator, res) => {
                        if (params.diff.filterRes(res)) accumulator.push(res);
                        return accumulator;
                    }, []);
            }
        }
    }

    console.timeEnd("Compute diff");

    base.close();
    return diffs;
}

function getDiscountDistUnsorted(base, records, params) {
    // All sellers
    let dists = {};

    // Prepare dists for all sellers
    let sellersStore = utils.getStore(base, "CESellers");
    let sellers = new Set(sellersStore.allRecords.getVector("IdSeller").toArray());

    sellers.forEach(function (seller) {
        dists[seller] = {};
        dists[seller].diff = [];
        dists[seller].products = {};
    });

    const absolutePastOffset = "pastDate" in params.diff && params.diff.pastDate !== "";
    const absoluteFutureOffset = "futureDate" in params.diff && params.diff.futureDate !== "";
    let pastOffset = getTimeOffset(params, absolutePastOffset, "pastDate", "Past");
    let futureOffset = getTimeOffset(params, absoluteFutureOffset, "futureDate", "Future");
    getSmoothing(params);
    const categories = "categories" in params.diff && params.diff.categories;

    let onDataFn = params.diff.onDataFn;
    if (!("onDataFn" in params.diff) || params.diff.onDataFn === "" || params.diff.onDataFn === undefined) {
        // Default function to gain data information
        console.log("Using default 'onDataFn' function.");
        onDataFn = (rec, interval, cal) => {
            let data = interval.diff;
            data.discount = cal.discount;
            data.price = cal.price;
            if (params.diff.addBrands) {
                data.brand = rec.ofProduct.Brand;
            }
            return data;
        }
    }

    // Initial record
    let currRec = records[0];
    let recordsProp = utils.getProperty(currRec, params.diff.rec);
    dists[currRec.atSeller.IdSeller].products[currRec.ofProduct.IdProduct] = {
        price: currRec.Price,
        start: currRec.Start,
        records: recordsProp.filter(rec => rec.redirectedTo.IdSeller === currRec.atSeller.IdSeller)
    };

    let i = 1;
    // Go through all records that are sorted by timestamp
    records.each(function (rec) {
        let currSellerId = rec.atSeller.IdSeller;
        let currProductId = rec.ofProduct.IdProduct;
        let currPrice = rec.Price;
        let currStart = rec.Start;

        // Check if product exists
        if (!(currProductId in dists[currSellerId].products)) {
            let records = utils.getProperty(rec, params.diff.rec);
            dists[currSellerId].products[currProductId] = {
                price: currPrice,
                start: currStart,
                records: records.filter(rec => rec.redirectedTo.IdSeller === currSellerId)
            };
            i++;
            return;
        }

        let price = dists[currSellerId].products[currProductId].price;
        // Check if discount
        if (price > currPrice) {
            let relDiscount = 1.0 - currPrice / price;
            if (relDiscount > 0.8) {
                currPrice = price;
                // Most likely an error in a csv file
            } else {
                // Pron to small error, but does not effect visualization
                let discount = Math.round((relDiscount * 100.0) * 1e4) / 1e4;
                let previousInterval = dists[currSellerId].products[currProductId];

                let endDate = rec.End;
                let startDate = previousInterval.start;

                if (absolutePastOffset) {
                    startDate = new Date(rec.Start);
                    startDate.setTime(startDate.getTime() - pastOffset);
                    // Do not limit to start of previous interval
                    //  startDate = previousInterval.start.getTime() > startDate.getTime() ? previousInterval.start
                    // : startDate;
                }

                if (absoluteFutureOffset) {
                    endDate = new Date(rec.Start);
                    endDate.setTime(endDate.getTime() + futureOffset);
                    endDate = endDate.getTime() > rec.End.getTime() ? rec.End : endDate;
                }

                if (rec.Start.getTime() === endDate.getTime()) {
                    // Discount on last interval - no further intervals
                    // look only 3 days into the future
                    endDate = new Date(rec.Start);
                    endDate.setTime(endDate.getTime() + futureOffset);
                }
                // Get only records of current seller
                let sellerRecords = dists[currSellerId].products[currProductId].records;
                // Calculate difference on discount
                if (!sellerRecords.empty) {
                    let intervals = diffOnTimeInterval(rec.Start, startDate, endDate,
                        sellerRecords, params.diff, params.diff.binSize, price, currPrice);
                    dists[currSellerId].diff.push(onDataFn(rec, intervals,
                        { discount: discount, price: price, endDate: endDate, startDate: startDate }));
                }
            }
        } else if (currPrice === (price * 100.0)) {
            // Most likely an error in a csv file
            currPrice = price;
        }

        dists[currSellerId].products[currProductId].price = currPrice;
        dists[currSellerId].products[currProductId].start = currStart;
        // Progress
        utils.showProgress((i++ / records.length * 100).toFixed(3) + "%");
    });
    process.stdout.write("\n");

    let finalDists = {};
    let minorDists = [];
    // Extract major and minor sellers
    Object.keys(dists).forEach(function (key) {
        if (Object.keys(dists[key].diff).length === 0)
            return;
        let seller = dists[key];
        if (MAJOR_SELLERS_IDS.includes(key)) {
            let sellerName = sellersStore.recordByName(key).SellerName;
            finalDists[sellerName] = seller.diff;
        } else {
            minorDists = minorDists.concat(seller.diff);
        }
    });

    if (minorDists.length > 0)
        finalDists["Others"] = minorDists;

    let allDists = [];
    for (let seller_name of Object.keys(finalDists)) {
        allDists = allDists.concat(finalDists[seller_name]);
    }

    allDists = allDists.sort(function (a, b) {
        return (a.price > b.price) ? 1 : ((b.price > a.price) ? -1 : 0);
    });

    let terciles = Math.floor(allDists.length / 3);
    let mediumPrice = allDists[terciles].price;
    let highPrice = allDists[terciles * 2].price;

    if (categories) {
        console.time("Categories");
        let smoothing = Number.parseFloat(params.diff.smoothing);
        let binSize = params.diff.binSize + "h";
        let categoriesDist = {
            low: {
                info: {
                    range: "[" + allDists[0].price + "€, " + mediumPrice + "€]", title: "Low-priced",
                    bin_size: binSize,
                    smoothing: smoothing,
                    future_offset: Math.floor(futureOffset / (24 * 60 * 60 * 1000)) + " days"
                }, dist: {}
            },
            medium: {
                info: {
                    range: "(" + mediumPrice + "€, " + highPrice + "€]", title: "Medium-priced",
                    bin_size: binSize,
                    smoothing: smoothing,
                    future_offset: Math.floor(futureOffset / (24 * 60 * 60 * 1000)) + " days"
                }, dist: {}
            },
            high: {
                info: {
                    range: "(" + highPrice + "€, " + allDists[allDists.length - 1].price + "€]", title: "High-priced",
                    bin_size: binSize,
                    smoothing: smoothing,
                    future_offset: Math.floor(futureOffset / (24 * 60 * 60 * 1000)) + " days"
                }, dist: {}
            },
        };

        for (let seller_name of Object.keys(finalDists)) {
            categoriesDist.low.dist[seller_name] = [];
            categoriesDist.medium.dist[seller_name] = [];
            categoriesDist.high.dist[seller_name] = [];
            for (let product of finalDists[seller_name]) {
                if (product.price <= mediumPrice) {
                    categoriesDist.low.dist[seller_name].push(product);
                } else if (product.price <= highPrice) {
                    categoriesDist.medium.dist[seller_name].push(product);
                } else {
                    categoriesDist.high.dist[seller_name].push(product);
                }
            }
        }
        console.timeEnd("Categories");
        finalDists = categoriesDist;
    } else {
        // No categories
        let smoothing = Number.parseFloat(params.diff.smoothing);
        let binSize = params.diff.binSize + "h";
        finalDists = {
            all: {
                info: {
                    range: "[" + allDists[0].price + ", " + allDists[allDists.length - 1].price + "]", title: "All",
                    bin_size: binSize,
                    smoothing: smoothing,
                    future_offset: Math.floor(futureOffset / (24 * 60 * 60 * 1000)) + " days"
                }, dist: finalDists
            }
        };
    }

    return finalDists;
}

function computeDiffOnBBMarketing(params) {
    let base = new qm.Base({ mode: "openReadOnly" });
    let rec = utils.getFilteredRecords(base, params);

    console.time("Compute diff");
    let diffs = getDiscountDiff(base, rec, params);
    console.timeEnd("Compute diff");

    // Group by
    let dists = {};
    if ("groupBy" in params.diff && params.diff.groupBy !== "") {
        for (let diff of diffs.dist) {
            let group = diff[params.diff.groupBy];
            if (group in dists) {
                dists[group].push(diff);
            } else {
                dists[group] = [diff];
            }
        }
        diffs.dist = dists;
    }

    // Filter final results
    if ("filterRes" in params.diff && params.diff.filterRes !== "") {
        for (const [key, value] of Object.entries(diffs.dist)) {
            diffs.dist[key] = value.reduce(
                (accumulator, res) => {
                    if (params.diff.filterRes(res)) accumulator.push(res);
                    return accumulator;
                }, []);
        }
    }

    base.close();
    return diffs;
}

function getDiscountDiff(base, records, params) {

    const absolutePastOffset = "pastDate" in params.diff && params.diff.pastDate !== "";
    const absoluteFutureOffset = "futureDate" in params.diff && params.diff.futureDate !== "";
    let futureOffset = getTimeOffset(params, absoluteFutureOffset, "futureDate", "Future");
    let pastOffset = getTimeOffset(params, absolutePastOffset, "pastDate", "Past");
    getSmoothing(params);

    let onDataFn = params.diff.onDataFn;
    if (!("onDataFn" in params.diff) || params.diff.onDataFn === "" || params.diff.onDataFn === undefined) {
        // Default function to gain data information
        console.log("Using default 'onDataFn' function.");
        onDataFn = (rec, interval) => {
            let data = interval.diff;
            data.discount = rec.POPUST;
            data.price = rec.ZAC_CE_MA_PRO_A.toFixed(3);
            data.actionType = rec.AkcijaNaziv;
            data.product = rec.ArtikelNaziv;
            data.brand = rec.promotedProduct.BlagovnaZnamkaNaziv;
            return data;
        }
    }

    let dists = [];
    // Go through all records that are sorted by timestamp
    records.each(function (rec) {
        let endDate = new Date(rec.KON_DAT);
        let startDate = new Date(rec.ZAC_DAT);
        // Fixed offset in the past
        startDate.setTime(startDate.getTime() - pastOffset);
        if (absoluteFutureOffset) {
            endDate = new Date(rec.ZAC_DAT);
            endDate.setTime(endDate.getTime() + futureOffset);
            //  endDate = endDate.getTime() < rec.KON_DAT.getTime() ? rec.KON_DAT : endDate;
        }

        // Online actions have same start and end date
        if (rec.ZAC_DAT.getTime() === endDate.getTime()) {
            // Discount on last interval - no further intervals
            // look only 30 days into the future
            endDate.setTime(endDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        }

        let recSell = utils.getProperty(rec, params.diff.rec);
        // Calculate difference on discount
        let intervals = diffOnTimeInterval(rec.ZAC_DAT, startDate, endDate,
            recSell, params.diff, params.diff.binSize);

        dists.push(onDataFn(rec, intervals));
    });

    return {
        info: {
            title: params.name,
            bin_size: params.diff.binSize + "h",
            smoothing: params.diff.smoothing,
            past_offset: Math.floor(pastOffset / (24 * 60 * 60 * 1000)) + " days"
        }, dist: dists
    };
}

function diffOnTimeInterval(eventDate, pastDate, futureDate, records, params,
                            binSize = 24, priceBefore = undefined, priceAfter = undefined) {
    let startDate = pastDate;
    let endDate = futureDate;
    // Get date or offset from event's date
    if (Number.isInteger(pastDate) && Number.isInteger(futureDate)) {
        startDate = new Date(eventDate);
        endDate = new Date(eventDate);
        startDate.setDate(startDate.getDate() - pastDate);
        endDate.setDate(endDate.getDate() + futureDate);
    } else {
        startDate = new Date(pastDate);
        endDate = new Date(futureDate);
        assert(startDate < eventDate, "Event's date must be after start date.");
        assert(endDate > eventDate, "Event's date must be before end date.")
    }

    let prop = {
        before: {
            start: startDate,
            end: eventDate,
            min: null,
            max: null,
            avg: 0.0,
            stddev: 0.0,
            values: {}
        },
        after: {
            start: eventDate,
            end: endDate,
            min: null,
            max: null,
            avg: 0.0,
            stddev: 0.0,
            values: {}
        },
        diff: {
            diff_avg: 0.0,
            diff_min: 0.0,
            diff_max: 0.0,
            len_disc: 0
        }
    };

    records.each(function (rec) {
            let timestamp = rec[params.timestampCol];
            let interval = getInterval(timestamp, prop);
            if (interval != null) {
                let val = rec[params.interestCol];
                if (val >= 0) {
                    interval.avg += val;
                    if (timestamp in interval.values) {
                        interval.values[timestamp] += val;
                    } else {
                        interval.values[timestamp] = val;
                    }
                }
            }
        }
    );

    // Aggregate with bin size
    let beforePeriodAggr = aggregate(prop.before.start, prop.before.end, prop.before.values, binSize);
    let afterPeriodAggr = aggregate(prop.after.start, prop.after.end, prop.after.values, binSize);

    // Map of bins to list of bins
    prop.before.values = utils.objToList(beforePeriodAggr);
    prop.after.values = utils.objToList(afterPeriodAggr);

    // Calculate avg. rank for discount period
    if (params.includeRank)
        Object.assign(prop.diff,
            calculateAvgRank(records, prop.after.start, prop.after.end, params, priceBefore, priceAfter));

    // Avg
    // discounts without clicks before or after
    if (prop.before.values.length <= 0) {
        prop.before.avg = 0.0;
    } else {
        prop.before.avg /= prop.before.values.length;
    }

    if (prop.after.values.length <= 0) {
        prop.after.avg = 0.0;
    } else {
        prop.after.avg /= prop.after.values.length;
    }

    // Min/max/stddev
    calculateMinMaxStddev(prop.before);
    calculateMinMaxStddev(prop.after);

    if (prop.before.avg < 0 || prop.after.avg < 0) {
        console.log("Negative average!");
        console.log(prop.before.avg);
        console.log(prop.after.avg);
    }
    // Difference
    if (params.relative) {
        prop.diff.diff_min = (prop.after.min - prop.before.min) / prop.before.min;
        prop.diff.diff_max = (prop.after.max - prop.before.max) / prop.before.max;
        prop.after.avg += params.smoothing;
        prop.before.avg += params.smoothing;
        prop.diff.diff_avg = (prop.after.avg - prop.before.avg) / prop.before.avg;
        prop.diff.len_disc = prop.after.values.length;
    } else {
        prop.diff.diff_min = prop.after.min - prop.before.min;
        prop.diff.diff_max = prop.after.max - prop.before.max;
        prop.diff.diff_avg = prop.after.avg - prop.before.avg;
        prop.diff.len_disc = prop.after.values.length;
    }

    return prop;
}

function getInterval(timestamp, intervals) {
    if (timestamp <= intervals.before.end) {
        if (intervals.before.start <= timestamp) {
            return intervals.before;
        }
    } else if (timestamp <= intervals.after.end) {
        return intervals.after;
    }
    return null;
}

function calculateMinMaxStddev(prop) {
    prop.stddev = 0;
    prop.values.forEach(function (val) {
        val = val[1];
        if (prop.min === null || prop.min > val) {
            prop.min = val;
        }

        if (prop.max === null || prop.max < val) {
            prop.max = val;
        }
        prop.stddev += (val - prop.avg) * (val - prop.avg);
    });
    prop.stddev /= (prop.values.length > 1) ? (prop.values.length - 1) : prop.values.length;
}

//======================================================================================================================
// Rank calculations
//======================================================================================================================
function Rank(record, startTimestamp, endTimestamp) {

    // All product price intervals of all sellers
    const priceIntervals = record.clickedProduct.hadPriceInterval.clone().filter(rec => {
        return rec.atSeller.IdSeller !== record.redirectedTo.IdSeller
    }).sortByField("End", true);

    //  {sellerId: [{interval_1}, {interval_2}, ..., {interval_n}]}
    let sellerPrices = {};

    function addInterval(sellerId, interval) {
        if (!(sellerId in sellerPrices)) {
            sellerPrices[sellerId] = [];
        }
        sellerPrices[sellerId].push({
            price: interval.Price,
            start: interval.Start,
            end: interval.End
        });
    }

    function createInterval(sellerId, interval) {
        sellerPrices[sellerId] = [{
            price: interval.Price,
            start: interval.Start,
            end: interval.End
        }];
    }

    function updateAllSellers(startTimestamp, endTimestamp) {
        sellerPrices = {};
        let lockedPrices = new Set();
        for (let i = 0; i < priceIntervals.length; i++) {
            let sellerId = priceIntervals[i].atSeller.IdSeller;
            if (priceIntervals[i].Start <= startTimestamp && startTimestamp < priceIntervals[i].End) {
                // Assuming intervals do not overlap and mark it as final
                createInterval(sellerId, priceIntervals[i]);
                // Lock price and make it final
                lockedPrices.add(sellerId);
            } else if (priceIntervals[i].Start <= endTimestamp) {
                addInterval(sellerId, priceIntervals[i]);
                // Lock price and make it final
                lockedPrices.add(sellerId);
            } else if (startTimestamp >= priceIntervals[i].End) {
                // Timestamp not in interval but we use last given price
                // because records are sorted by End this is guaranteed to be last
                if (lockedPrices.has(sellerId)) {
                    addInterval(sellerId, priceIntervals[i]);
                } else {
                    createInterval(sellerId, priceIntervals[i]);
                }
            }
        }
    }

    updateAllSellers(startTimestamp, endTimestamp);
    // Closure with price intervals
    return {
        get: function (price, timestamp) {
            // First get of sellers
            let rank = 1;
            let n = 0;
            for (let sellerId of Object.keys(sellerPrices)) {
                while (sellerPrices[sellerId].length > 0) {
                    let sellerQueue = sellerPrices[sellerId];
                    let sellerCurrInterval = sellerQueue[0];
                    // Timestamp inside interval
                    if (sellerCurrInterval.start <= timestamp && timestamp < sellerCurrInterval.end) {
                        // Price lower than current price, raise rank
                        if (sellerCurrInterval.price < price) rank++;
                        n++;
                        // Timestamp after interval
                    } else if (timestamp >= sellerCurrInterval.end) {
                        if (sellerQueue.length > 1) {
                            // Take next interval if available
                            sellerQueue.shift(1);
                            sellerPrices[sellerId] = sellerQueue;
                            continue;
                        }
                        if (sellerCurrInterval.price < price) rank++;
                        n++;
                    }
                    break;
                }
            }
            return { rank: rank, n: n };
        }
    }
}

function getPrice(timestamp, record) {
    let sellerId = record.redirectedTo.IdSeller;
    let foundPriceInterval = null;
    for (let i = 0; i < record.clickedProduct.hadPriceInterval.length; i++) {
        let priceInterval = record.clickedProduct.hadPriceInterval[i];
        if (priceInterval.atSeller.IdSeller === sellerId &&
            priceInterval.Start <= timestamp &&
            (timestamp < priceInterval.End ||
                (priceInterval.Start.getTime() === priceInterval.End.getTime()) &&
                priceInterval.Start.getTime() === timestamp.getTime())) {
            foundPriceInterval = priceInterval;
            break;
        }
    }

    if (foundPriceInterval == null) {
        console.log("Product without previous price");
    } else {
        return foundPriceInterval.Price;
    }
}

function calculateAvgRank(records, startTimestamp, endTimestamp, params,
                          priceBefore = undefined, priceAfter = undefined) {
    let rankProp = {
        // Rank_disc - rank on day of discount
        // n_prices_disc - number of prices before discount
        // rank_avg - average rank in the discount interval
        // n_prices_avg - number of prices in the discount interval
    };

    // Price stays the same through all interval
    let price = priceAfter === undefined ? getPrice(startTimestamp, records[0], params.futureDate) : priceAfter;
    // Prepare rank environment
    let rank = Rank(records[0], startTimestamp, endTimestamp);
    // Rank in time of discount
    let r = rank.get(price, startTimestamp);

    if ("includeRankGain" in params && params.includeRankGain === true) {
        // Rank before discount
        let newStartTimestamp = new Date(startTimestamp);
        newStartTimestamp.setTime(newStartTimestamp - 60 * 1000); // One minute before
        priceBefore = priceBefore === undefined ?
            getPrice(newStartTimestamp, records[0], params.futureDate) : priceBefore;
        if (priceBefore) {
            let previousRank = Rank(records[0], newStartTimestamp, startTimestamp);
            let rp = previousRank.get(priceBefore, newStartTimestamp);
            previousRank = null;
            rankProp.rank_gain = rp.rank - r.rank;
        }
    }

    rankProp.rank_disc = r.rank;
    rankProp.n_prices_disc = r.n;
    let ranks = r.rank;
    let nPrices = r.n;

    // Avg rank in the future - rank on hourly basis
    let h = 60 * 60 * 1000; // Hour
    if ("freqRank" in params && params.freqRank !== "") {
        h *= params.freqRank;
    }

    startTimestamp.setTime(startTimestamp.getTime() + h);
    let n = 1;
    while (startTimestamp <= endTimestamp) {
        n++;
        r = rank.get(price, startTimestamp);
        ranks += r.rank;
        nPrices += r.n;
        startTimestamp.setTime(startTimestamp.getTime() + h);
    }

    rankProp.rank_avg = ranks / n;
    rankProp.n_prices_avg = nPrices / n;

    return rankProp;
}

//======================================================================================================================
// Utils
//======================================================================================================================
function aggregate(fromDate, toDate, dist, binSize) {
    // Set first's bin range
    let endBinDate = new Date(fromDate);
    let startBinDate;

    // Sort by dates
    let dates = Object.keys(dist);
    let len = dates.length;
    dates = dates.map(d => new Date(d));
    dates.sort(function (a, b) {
        return a - b
    });

    let bins = {};
    let i = 0;
    binSize *= 60 * 60 * 1000;
    // Creates bins and fills them
    while (endBinDate < toDate) {
        startBinDate = endBinDate.toISOString();
        endBinDate.setTime(endBinDate.getTime() + binSize);
        bins[startBinDate] = 0;
        for (i; i < len && new Date(dates[i]) <= endBinDate; i++) {
            bins[startBinDate] += dist[dates[i]];
        }
    }

    // Fill if any left
    for (i; i < len, new Date(dates[i]) <= toDate; i++) {
        bins[startBinDate] += dist[dates[i]];
    }

    return bins;
}

function getTimeOffset(params, absoluteOffset, futurePast = "pastDate", msg = "Time ") {
    let pastOffset = 3;
    if (absoluteOffset) {
        console.log(msg + "offset: " + params.diff[futurePast]);
        pastOffset = Number.parseInt(params.diff[futurePast])
    }
    pastOffset *= 24 * 60 * 60 * 1000;
    return pastOffset;
}

function getSmoothing(params) {
    const smoothing = "smoothing" in params.diff && params.diff.smoothing !== "";
    if (smoothing) {
        params.diff.smoothing = Number.parseFloat(params.diff.smoothing);
    } else {
        params.diff.smoothing = 0.0;
    }
    // Smoothing to avoid dividing with zero
    console.log("Smoothing correction: " + params.diff.smoothing);
}

//======================================================================================================================
// Module exports
//======================================================================================================================
// Exported Ceneje discounts properties
function getDiscountProps(params = USE_CASES.FEATC, getInfo = false) {
    let data = computeDiffOnDiscounts(params);
    if (!getInfo) {
        data = data.all.dist;
    }
    utils.saveToJson("./discountFeat.json", data);
    return data;
}

// Exported BigBang discounts properties
function getBBDiscountProps(params = USE_CASES.FEATBB, getInfo = false) {
    let data = computeDiffOnBBMarketing(params);
    if (!getInfo) {
        data = data.dist;
    }
    utils.saveToJson("./discountBBFeat.json", data);
    return data;
}

module.exports = { getDiscountProps, USE_CASES, MAJOR_SELLERS_IDS };
