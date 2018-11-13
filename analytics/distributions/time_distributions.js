"use strict";

const qm = require("qminer");
const assert = require("assert");
const reg = require("regression");

// Command line arguments
const argv = require("minimist")(process.argv.slice(2));

let data_params = {
    "BBS": {
        "name": "Big Bang sales",
        "store": "BBSellout",
        "dateCol": "DAN",
        "valCol": "Kolicina",
        "prodType": "TV"
    },
    "CEW": {
        "name": "Ceneje views",
        "store": "CEPageviews",
        "dateCol": "date",
        "valCol": "pageviews",
        "prodType": "LedTv"
    },
    "CEC": {
        "name": "Ceneje clicks",
        "store": "CEPageviews",
        "dateCol": "date",
        "valCol": "clicks",
        "prodType": "LedTv"
    },
    "CECBB": {
        "name": "Ceneje clicks BB",
        "store": "CEClicks",
        "dateCol": "date",
        "valCol": "clicks",
        "filterCol": "idtrgovine",
        "filterVals": [862],
        "prodType": "LedTv"
    }
};


// Individial operations
if (argv.d) {
    console.log("Computing daily distributions");
    let dailyDists = computeDailyDists(data_params);

    let outfn = "dailyDists.json";
    console.log("Writing daily distributions to " + outfn);
    let fout = new qm.fs.FOut(outfn);
    fout.write(JSON.stringify(dailyDists));
    fout.close();
} else if (argv.w) {
    console.log("Computing weekly distributions");
    let weeklyDists = computeWeeklyDists(argv.t);

    let outfn = "weeklyDists.json";
    console.log("Writing weekly distributions to " + outfn);
    let fout = new qm.fs.FOut(outfn);
    fout.write(JSON.stringify(weeklyDists));
    fout.close();
} else if (argv.r) {
    console.log("Computing MSE for yearly aligned weekly distributions");
    let weeklyMSE = computeWeeklyMSEs();

    let outfn = "weeklyMSE.json";
    console.log("Writing weekly MSE to " + outfn);
    let fout = new qm.fs.FOut(outfn);
    fout.write(JSON.stringify(weeklyMSE));
    fout.close();
} else {
    console.log("USAGE:");
    console.log("  -d : compute daily distributions");
    console.log("  -w : compute weekly distributions (-t : compute linear trend fit)");
    console.log("  -r : compute MSE for yearly aligned weekly distributions");
}

//======================================================================================================================
function getRecordsByProdType(base, storeName, prodType) {
    let store = base.store(storeName);
    assert.notStrictEqual(store, null, "Cannot find store " + storeName + " in database.");
    let records = store.allRecords;
    records.filterByField("ProdType", prodType);
    return records;
}

function computeDailyDists(data_params) {
    // Open base
    let base = new qm.Base({ mode: "openReadOnly" });

    let dists = [];
    // Big Bang Sales
    dists.push(computeDailyDist(base, data_params.BBS));

    // Ceneje pageviews and clicks
    dists.push(computeDailyDist(base, data_params.CEW));
    dists.push(computeDailyDist(base, data_params.CEC));

    return dists;
}

function computeDailyDist(base, params) {
    let rec = getRecordsByProdType(base, params.store, params.prodType);
    return {
        name: params.name,
        dist: getDailyDist(rec, params)// Params.dateCol, params.valCol)
    };
}

// Transform { date1: val1, date1: val2, ...} to [[date1, val1], [date2, val2], ...] with sorted dates
function dateMapToList(dateMap) {
    let dateList = Object.keys(dateMap).map(key => [new Date(key), dateMap[key]]);
    dateList.sort(function (item1, item2) { return item1[0] - item2[0]; });
    return dateList;
}

function getDailyDist(records, params) { // DateCol, valCol) {
    let distMap = {};

    if ("filterCol" in params && "filterVals" in params) {
        records = records.filter(function (rec) { return params.filterVals.includes(rec[params.filterCol]); });
    }
    assert.ok(records.length > 0, "No records left after filter.");

    records.each(function (rec) {
        if (rec[params.dateCol] in distMap) {
            distMap[rec[params.dateCol]] += rec[params.valCol];
        } else {
            distMap[rec[params.dateCol]] = rec[params.valCol];
        }
    });

    return dateMapToList(distMap);
}


function computeWeeklyDists(trend) {
    // Open base
    let base = new qm.Base({ mode: "openReadOnly" });

    let dists = [];

    // Big Bang Sales
    let BBSDists = computeWeeklyDist(base, data_params.BBS, trend);
    for (let BBSDist of BBSDists) {
        dists.push(BBSDist);
    }

    // Ceneje pageviews and clicks
    let CEWDists = computeWeeklyDist(base, data_params.CEW, trend);
    for (let CEWDist of CEWDists) {
        dists.push(CEWDist);
    }

    let CECDists = computeWeeklyDist(base, data_params.CEC, trend);
    for (let CECDist of CECDists) {
        dists.push(CECDist);
    }

    // Ceneje clicks for BB
    let CECBBDists = computeWeeklyDist(base, data_params.CECBB, trend);
    for (let CECBBDist of CECBBDists) {
        dists.push(CECBBDist);
    }

    return dists;
}


function computeWeeklyDist(base, params, trend) {
    let dists = [];

    let rec = getRecordsByProdType(base, params.store, params.prodType);
    let dailyDist = getDailyDist(rec, params);
    let weeklyDist = aggregateToWeek(dailyDist);

    if (trend) {
        let linReg = fitDist(weeklyDist);
        console.log(params.name + " fit\n", linReg);

        let linRegPlot = linReg.points.map((x, x_i) => [weeklyDist[x_i][0], x[1]]);
        let lrp = {
            name: params.name + " fit",
            dist: linRegPlot
        };
        dists.push(lrp);
    }

    let dist = {
        name: params.name,
        dist: weeklyDist
    };
    dists.push(dist);
    return dists;
}


function aggregateToWeek(dailyDist) {
    // Find first Monday
    let firstMonI = 0;
    while (dailyDist[firstMonI][0].getDay() !== 1) {
        firstMonI++;
    }

    let weeklySum = {};
    let lastMonday = null;
    // Start with the next day
    for (let i = firstMonI; i < dailyDist.length; i++) {
        if (dailyDist[i][0].getDay() === 1) {
            // Remember Monday
            lastMonday = dailyDist[i][0];
            // Start new weekly sum
            weeklySum[lastMonday] = dailyDist[i][1];
        } else {
            weeklySum[lastMonday] += dailyDist[i][1];
        }
    }
    // Throw away last week if not complete
    if (dailyDist[dailyDist.length - 1][0].getDay() !== 0) { // If last day not Sunday
        delete dailyDist[lastMonday];
    }
    // Transform to list and return
    return dateMapToList(weeklySum);
}


function fitDist(dist) {
    // Get just the numbered values of the distribution
    let enumDist = dist.map((x, x_i) => [x_i, x[1]]);
    return reg.linear(enumDist);
}


function computeWeeklyMSEs() {
    // Open base
    let base = new qm.Base({ mode: "openReadOnly" });

    let MSEs = [];
    let dayWindow = 10;
    let includeThisYear = true;

    // Big Bang Sales
    MSEs.push(computeWeeklyMSE(base, data_params.BBS, dayWindow, includeThisYear));

    // Ceneje pageviews and clicks
    MSEs.push(computeWeeklyMSE(base, data_params.CEW, dayWindow, includeThisYear));
    MSEs.push(computeWeeklyMSE(base, data_params.CEC, dayWindow, includeThisYear));

    return MSEs;
}


function computeWeeklyMSE(base, params, dayWindow, includeThisYear) {
    let rec = getRecordsByProdType(base, params.store, params.prodType);
    let dailyDist = getDailyDist(rec, params);
    let weeklyDist = aggregateToWeek(dailyDist);
    let normWeeklyDist = normalizeDist(weeklyDist);
    let weeklyMSE = computeMSE(normWeeklyDist, dayWindow, includeThisYear);

    return {
        name: params.name + " MSE",
        dist: weeklyMSE
    };
}


// Assumes the distribution has been normalized
function computeMSE(dist, dayWindow, includeThisYear) {
    let mse = [];

    for (let i = 0; i < dist.length; i++) {
        let closeDays = [];
        for (let j = 0; j < dist.length; j++) {
            if (i === j) {
                continue;
            }
            if (timeDiffInYear(dist[i][0], dist[j][0]) < dayWindow) {
                if (!includeThisYear && getDayDiff(dist[i][0], dist[j][0]) < dayWindow) {
                    continue;
                }
                closeDays.push(dist[j]);
            }
        }
        // Get average value in the window
        let closeVals = closeDays.map(x => x[1]);
        let mseVal = 0;
        for (let closeVal of closeVals) {
            if ((dist[i][1] - closeVal) > 0) {
                mseVal += (closeVal - dist[i][1]) * (closeVal - dist[i][1]);
            }
        }
        mseVal = mseVal / closeVals.length;

        mse.push([dist[i][0], mseVal]);
    }

    return mse;
}

function normalizeDist(dist) {
    let linReg = fitDist(dist);


    let normDist = [];
    for (let i = 0; i < dist.length; i++) {
        let x = dist[i];
        try {
            normDist.push([x[0], x[1] - linReg.points[i][1]]);
        } catch (err) {
            console.log(err);
        }
    }
    return normDist;
}


function getDayDiff(d1, d2) {
    let oneDay = 1000 * 60 * 60 * 24;
    // Compensate for daylight savings time, just in case
    let diffMs = (d2 - d1) + ((d1.getTimezoneOffset() - d2.getTimezoneOffset()) * 60 * 1000);
    return Math.round(Math.abs(diffMs / oneDay));
}

function timeDiffInYear(d1, d2) {
    let diffDay = getDayDiff(d1, d2);
    assert.ok(Number.isInteger(diffDay), "diff is not integer: " + diffDay);

    let yDiff = Math.floor(diffDay / 365);

    return Math.min(diffDay - yDiff * 365, (yDiff + 1) * 365 - diffDay);
}