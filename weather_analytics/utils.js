'use strict';

let qm = require('qminer');
let fs = qm.fs;

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

function getAllSales(products){
    let allSales = [];
    for(let i = 0;i < products.length; i++)
        allSales = allSales.concat(products[i].wasSold.map(x => [x.Timestamp, x.Quantity]));
    return allSales;
}

function aggDaily(sales, startDate, endDate){
    let aggr = {};
    for(let currDate = new Date(startDate.valueOf()); currDate <= endDate; currDate.setDate(currDate.getDate() + 1))
        aggr[currDate] = 0;
    
    for(let i = 0;i < sales.length; i++){
        let timestamp = sales[i][0];
        timestamp.setHours(0, 0, 0, 0);
        aggr[timestamp] += sales[i][1];
    }

    let aggrList = Object.keys(aggr).map(key => [new Date(key), aggr[key]]);
    aggrList.sort(function (item1, item2) {
        return item1[0] - item2[0];
    });

    return aggrList;
}

function extractFeatures(base, startDate, endDate){
    let rows = [];
    
    let currPos = 0;
    let temps = base.store('T').allRecords.filter(x => x.DayOffset == 0 && x.Region == 10).sort(function(a, b){
        if(a.Timestamp.valueOf() != b.Timestamp.valueOf())
            return a.Timestamp.valueOf() - b.Timestamp.valueOf();
        if(a.FromHour != b.FromHour)
            return a.FromHour - b.FromHour;
        return a.ToHour - b.ToHour;
    });
    
    for(let currDate = new Date(startDate.valueOf()); currDate <= endDate; currDate.setDate(currDate.getDate() + 1)){
        for(; currPos < temps.length && temps[currPos].Timestamp < currDate; currPos++);
        assert.ok(currPos < temps.length && temps[currPos].Timestamp.valueOf() == currDate.valueOf(), "Index error");
        
        let row = [];
        for(; currPos < temps.length && temps[currPos].Timestamp.valueOf() == currDate.valueOf(); currPos++){
            row = row.concat([temps[currPos].Max, temps[currPos].Min, temps[currPos].Mean]);
        }
        assert.ok(row.length == 3 * 4, "Invalid length " + row.length);
        rows.push(row);
    }
    let X = new qm.la.Matrix(rows);
    return X.transpose();
}

function extractPeakLabels(sales, thresh){
    return qm.la.Vector(sales.map(x => x[1] > thresh ? 1 : -1));
}

function getGroups(dates, groupFn){
    let aggr = {};
    let groupIndex = 0;
    let groups = [];
    for(let i = 0;i < dates.length; i++){
        let groupVal = groupFn(dates[i]);
        if(!(groupVal in aggr))
        { aggr[groupVal] = groupIndex; groupIndex++; }
        groups.push(aggr[groupVal]);
    }
    return groups;
}

function leaveOneGroupOut(X, y, groups, trainFn){
    /* Leave One Group Out cross-validator

    Provides train/test indices to split data according to a third-party
    provided group. For instance the groups could be the year of collection 
    of the samples and thus allow for cross-validation against time-based splits.
    */
    let ind = [];
    for(let i = 0;i < groups.length; i++) ind.push(i);

    var uniqueGroups = groups.filter((v, i, a) => a.indexOf(v) === i);
    for(let outGroup of uniqueGroups)
    { 
        let trainInd = new qm.la.IntVector(ind.filter(x => groups[x] != outGroup));
        let testInd = new qm.la.IntVector(ind.filter(x => groups[x] == outGroup));
        trainFn(X.getColSubmatrix(trainInd), y.subVec(trainInd), 
            X.getColSubmatrix(testInd), y.subVec(testInd), trainInd, testInd);
    }
}

module.exports = { readCsvFile, getAllSales, aggDaily, extractFeatures, extractPeakLabels, getGroups, leaveOneGroupOut };