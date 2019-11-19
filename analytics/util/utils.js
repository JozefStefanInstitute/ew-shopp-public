"use strict";

const qm = require("qminer");
const fs = qm.fs;
const assert = require("assert");
const readline = require("readline");
const path = require("path");
const nodeFs = require("fs");

//======================================================================================================================
// General utils
//======================================================================================================================
/**
 * Transform object to list.
 * @param {Object} obj - object with keys and values { key: val, key1: val1, ... }.
 * @param {boolean} sort - to sort list by keys.
 *
 * @return {array} [ [key, val], [key, val1], ...].
 */
function objToList(obj, sort = true) {
    let list = Object.keys(obj).map(key => [key, obj[key]]);
    if (sort) {
        list.sort(function (item1, item2) {
            return item1[0] - item2[0];
        });
    }
    return list;
}

/**
 * Access nested property.
 * @param {Object} obj - any object with properties.
 * @param {String} access - string with nested properties separated with '.' e.g. "a.b.c".
 *
 * @return {Object} nested property from obj.
 * @example obj = {a': 2, a: {b: {c: 10, c': 5}, b':3 }}, access = "a.b.c" will return 10.
 */
function getProperty(obj, access) {
    if (access) {
        return access.split(".").reduce((obj, i) => obj[i], obj);
    }
    return obj;
}

function toArray(element) {
    return element == null ? [] : Array.isArray(element) ? element : [element];
}

function findRangeNext(curr, arr, predFn) {
    let first = curr + 1, last;
    for (; first < arr.length && !predFn(arr[first]); first++) ;
    assert.ok(first < arr.length, "Start point not found!");
    last = first;
    for (; last < arr.length && predFn(arr[last]); last++) ;
    return { first: first, last: last - 1 };
}

function groupBy(arr, keyg) {
    let keyVals = {}, keyIdx = 0;
    let res = [];
    for (let x of arr) {
        let key = keyg(x);
        if (!(key in keyVals)) {
            keyVals[key] = keyIdx++;
            res.push([]);
        }
        res[keyVals[key]].push(x);
    }
    return res;
}

function getGroupIds(arr, keyFn) {
    let aggr = {}, groupIds = [];
    let groupIndex = 0;
    for (let i = 0; i < arr.length; i++) {
        let key = keyFn(arr[i]);
        if (!(key in aggr)) {
            aggr[key] = groupIndex;
            groupIndex++;
        }
        groupIds.push(aggr[key]);
    }
    return groupIds;
}

function getKey(primaryKey, obj, allowedKeys = null, keepOnlyDate = true, forecastOffset = null) {
    let key = {};
    let usedKeys = new Set();
    primaryKey.forEach(pk => {
        if ((allowedKeys == null || allowedKeys.has(pk)) && pk in obj) {
            usedKeys.add(pk);
            if (obj[pk] instanceof Date) {
                let val = obj[pk];
                // If the offset is negative it means that the features are from n-th day before.
                // Therefore, features are valid for the n-th day in the future.
                val = forecastOffset ? addDays(val, -forecastOffset) : val;
                val = keepOnlyDate ? keepDate(val).valueOf() : val;
                key[pk] = val;
            } else {
                key[pk] = obj[pk].valueOf();
            }
        } else {
            key[pk] = undefined;
        }
    });
    return [JSON.stringify(key), usedKeys];
}

function cloneObj(x) {
    return Object.assign({}, x);
}

function shuffle(org) {
    let m = org.length, t, i;
    let arr = org.slice(0); // Copy

    while (m) {
        i = Math.floor(Math.random() * m--);
        t = arr[m];
        arr[m] = arr[i];
        arr[i] = t;
    }
    return arr;
}

//======================================================================================================================
// Date manipulations
//======================================================================================================================
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];
const HOLIDAYS = new Set([
    "2015-1-1", "2015-2-8", "2015-4-6", "2015-4-27", "2015-5-1", "2015-5-2", "2015-6-25", "2015-8-15", "2015-10-31",
    "2015-11-1", "2015-12-25", "2015-12-26",
    "2016-1-1", "2016-2-8", "2016-3-28", "2016-4-27", "2016-5-1", "2016-5-2", "2016-6-25", "2016-8-15", "2016-10-31",
    "2016-11-1", "2016-12-25", "2016-12-26",
    "2017-1-1", "2017-1-2", "2017-2-8", "2017-4-17", "2017-4-27", "2017-5-1", "2017-5-2", "2017-6-25", "2017-8-15",
    "2017-10-31", "2017-11-1", "2017-12-25", "2017-12-26",
    "2018-1-1", "2018-1-2", "2018-2-8", "2018-4-2", "2018-4-27", "2018-5-1", "2018-5-2", "2018-6-25", "2018-8-15",
    "2018-10-31", "2018-11-1", "2018-12-25", "2018-12-26"
]);

function getDayOfWeek(date) {
    return DOW[new Date(date).getDay()].toLowerCase();
}

function isHoliday(date) {
    return HOLIDAYS.has(new Date(date).toLocaleDateString()) ? 1 : 0;
}

function getMonthStr(date) {
    return MONTHS[new Date(date).getMonth()];
}

function getSeason(date) {
    let month = new Date(date).getMonth();
    if (3 < month && month < 5) return "spring";
    if (6 < month && month < 8) return "summer";
    if (9 < month && month < 11) return "fall";
    return "winter";
}

function daysDiff(a, b) {
    // Parameters 'a' and 'b' are javascript Date objects.
    // Discard the time and time-zone information.
    let _MS_PER_DAY = 1000 * 60 * 60 * 24;
    let utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    let utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.floor((utc2 - utc1) / _MS_PER_DAY);
}

function sameDate(a, b) {
    return keepDate(a).valueOf() === keepDate(b).valueOf();
}

function keepDate(dateTime) {
    let onlyDate = new Date(dateTime).toUTCString();
    onlyDate = new Date(onlyDate);
    onlyDate.setHours(0, 0, 0, 0);
    return onlyDate;
}

function getDateString(date) {
    date = new Date(date);
    let year = date.getFullYear();
    let month = date.getMonth() + 1;
    let dt = date.getDate();
    if (dt < 10)
        dt = "0" + dt;
    if (month < 10)
        month = "0" + month;

    return year + "-" + month + "-" + dt;
}

function addHours(dateTime, nHours = 1) {
    let curr = new Date(dateTime);
    curr.setHours(curr.getHours() + nHours);
    return curr;
}

function addDays(dateTime, nDays = 1) {
    let curr = new Date(dateTime);
    curr.setDate(curr.getDate() + nDays);
    return curr;
}

function addMonths(dateTime, nMonth = 1) {
    let curr = new Date(dateTime);
    curr.setMonth(curr.getMonth() + nMonth);
    return curr;
}

function getTimeframes(dateStart, dateEnd, aggregateNDays = 1, startDayName = "sun", cut = false) {
    const DOWLowerCase = DOW.map(u => u.toLowerCase());
    const getDiffDayFn = (currentDay, interestedDay) => {
        let dayCurrIndex = DOWLowerCase.indexOf(getDayOfWeek(currentDay));
        let dayInterestedIndex = DOWLowerCase.indexOf(interestedDay.toLowerCase());
        return dayInterestedIndex - dayCurrIndex;
    };

    let currDateKd = keepDate(dateStart);
    let dateEndKd = keepDate(dateEnd);
    // Set to interested start day and fix end date
    if (aggregateNDays !== 1) {
        let diffStart = getDiffDayFn(currDateKd, startDayName);
        let diffEnd = getDiffDayFn(dateEndKd, startDayName);
        diffStart = diffStart > 0 ? (cut ? diffStart : diffStart - aggregateNDays) :
            diffStart < 0 ? (cut ? aggregateNDays - diffStart : diffStart) :
                diffStart;
        diffEnd = diffEnd > 0 ? (cut ? diffEnd - aggregateNDays : diffEnd) :
            diffEnd < 0 ? (cut ? diffEnd : diffEnd + aggregateNDays) :
                diffEnd;
        currDateKd = addDays(currDateKd, diffStart);
        dateEndKd = addDays(dateEndKd, diffEnd);
    } else if (aggregateNDays === 1) {
        dateEndKd = addDays(dateEndKd, 1); // Include last day
    }

    const timeframes = [];
    while (currDateKd < dateEndKd) {
        let timeframe = {
            dateStart: currDateKd,
            dateEnd: addDays(currDateKd, aggregateNDays)
        };
        timeframes.push(timeframe);
        currDateKd = keepDate(timeframe.dateEnd);
    }

    return timeframes;
}

//======================================================================================================================
// I/O
//======================================================================================================================
function existsFile(path, warn = false) {
    path = path.toString();
    const exists = nodeFs.existsSync(path) && nodeFs.lstatSync(path).isFile();
    if (warn && !exists) console.warn(`File '${path}' does not exist`);
    return exists;
}

function existsDir(path, warn = false) {
    path = path.toString();
    const exists = nodeFs.existsSync(path) && nodeFs.lstatSync(path).isDirectory();
    if (warn && !exists) console.warn(`Directory '${path}' does not exist`);
    return exists;
}

function createDir(dirPath, isDir = true) {
    let dirName = isDir ? dirPath : path.dirname(dirPath);
    if (!existsDir(dirName)) {
        nodeFs.mkdirSync(dirName, { recursive: true });
        console.log(`Directory ${dirName} created.`);
    }
    return dirName;
}

function extractPaths(paths, depth = 1, extract_dir = false) {
    assert.deepStrictEqual(Array.isArray(paths), true, "Paths must be in an array!");
    let filePaths = new Set();
    for (let confPath of paths) {
        if (existsFile(confPath)) {
            // File exists - no problem
            filePaths.add(path.normalize(confPath));
        } else if (existsDir(confPath)) {
            // Check if folder and get all file paths in the current folder - just one depth - no recursion
            let lstFiles = nodeFs.readdirSync(confPath);
            lstFiles.forEach(file => {
                let filePath = path.join(confPath, file);
                if (existsFile(filePath)) {
                    filePaths.add(filePath);
                } else if (existsDir(filePath)) {
                    if (extract_dir) filePaths.add(path.normalize(filePath));
                    if (depth > 1) extractPaths([filePath], depth - 1).forEach(filePaths.add, filePaths);
                }
            });
        } else {
            // File/Folder not found - warn
            console.warn(`Path '${confPath}' does not exists!`);
        }
    }

    return [...filePaths];
}

function saveToTsv(outPath, data, createHeader = false, addJoins = false, internalId = false, useColumns = null) {
    const fout = new fs.FOut(outPath);

    console.log("Writing to " + outPath);
    let fields = [];
    if (data instanceof qm.RecSet) {
        if (internalId) fields.push("$id");
        data.store.fields.forEach(x => fields.push(x.name));
        fields = fields.filter((field) => {return useColumns.includes(field)});
        if (addJoins) data.store.joins.forEach(x => {if (x.type === "field") fields.push(x.recordField)});
    } else {
        fields = useColumns;
    }

    const processRecordFn = (rec) => {
        let line = "";
        for (let i = 0; i < fields.length; i++) {
            if (fields[i] === "Timestamp") {
                line += new Date(getDateString(rec[fields[i]])).toISOString() + "\t";
            } else {
                let val = rec[fields[i]];
                val = !isNaN(val) ? Number.parseFloat(val).toFixed(5) : val;
                line += val + "\t";
            }
        }
        fout.writeLine(line);
    };

    if (createHeader) {
        let headerLine = "";
        for (let i = 0; i < fields.length; i++) {
            headerLine += fields[i] + "\t";
        }
        fout.writeLine(headerLine);
    }

    if (data instanceof qm.RecSet) {
        data.each(processRecordFn);
    } else {
        data.forEach(processRecordFn);
    }
    fout.close();
}

function saveToJson(outPath, data) {
    console.log("Writing to " + outPath);
    let fout = new fs.FOut(outPath);
    fout.write(JSON.stringify(data, null, 4));
    fout.close();
}

function loadFromJson(inPath) {
    const confFile = new fs.FIn(inPath);
    let conf = JSON.parse(confFile.readAll());
    confFile.close();
    return conf;
}

function replaceValueInObj(obj, fromVal, toVal, returnOrginalVal = false) {
    // Note: object must be without function calls, a Date object will be converted to UTC ISO8601 format,
    // it does not work on circular references -- every value will be converted to string and parsed back
    let objString = JSON.stringify(obj);
    let modifiedQuery = objString.replace(new RegExp(fromVal, "g"), toVal);
    if (returnOrginalVal) {
        let areTheSame = objString === modifiedQuery;
        return [JSON.parse(modifiedQuery), JSON.parse(objString), areTheSame];
    } else {
        return JSON.parse(modifiedQuery);
    }
}

function readCsvFile(filename, fn) {
    // Generic wrapper to read csv files
    let nLines = 0;
    let nSkippedLines = 0;
    let file;

    if (existsFile(filename)) {
        file = fs.openRead(filename);
    } else {
        console.log("File " + filename + " does not exist. Skipping ...");
        return;
    }

    fs.readCsvLines(file,
        {
            delimiter: "\t",
            skipLines: 1,
            onLine: function (lineVals) {
                nLines += 1;
                if (nLines % 1000 === 0) process.stdout.write("\r" + nLines);
                fn(lineVals);
            },
            onEnd: function (err) {
                console.log("\rRead " + nLines + " lines");
                if (nSkippedLines) console.log("Skipped " + nSkippedLines + " lines");
                if (err) {
                    console.log("!!! QMiner error");
                    throw err;
                }
            }
        }
    );
    file.close()
}

function startSection(msg, group = true) {
    let len = 71 - msg.length;
    let len1 = len / 2,
        len2 = len1 + (len % 2);
    const str = `${"========================================".substr(0, len1)} ${msg} ${"========================================"
        .substr(0, len2)}`;
    if (group) {
        console.group(str);
    } else {
        console.log(str);
    }
}

function endSection(group = true) {
    if (group) console.groupEnd();
    console.log("=========================================================================");
}

function log(msg, file = null) {
    if (file) {
        file.writeLine(msg);
    }
    console.log(msg);
}

function showProgress(msg) {
    readline.clearLine(process.stdout);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write("\r" + msg);
}

class ExitHandler {
    constructor(exitHandlersArr = undefined, readlineInterface = undefined) {
        if (readlineInterface) {
            this.rl = readlineInterface;
        } else {
            // Create local readline interface
            // Note: Avoid defining readline interface globally. When active, it reads input stream
            // and prevents program from closing. It needs to be closed manually.
            this.rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
        }

        this.exitHandlers = [];
        // Add exit handlers functions
        if (exitHandlersArr) this.addExitHandlers(exitHandlersArr);
        this.registerEvents();
    }

    close() {
        // Interface must be closed manually
        this.rl.close();
    }

    registerEvents() {

        if (process.platform === "win32") {
            // Listen readLine handler on Windows OS and emit signals internally
            this.rl.on("SIGTERM", () => { process.emit("SIGTERM")});
            this.rl.on("SIGUSR1", () => { process.emit("SIGUSR1")});
            this.rl.on("SIGUSR2", () => { process.emit("SIGUSR2")});
            this.rl.on("SIGINT", () => {process.emit("SIGINT")});
        }

        // Init eventListeners
        process.on("SIGINT", () => this.exitGracefully({ force: true, err: "Process received SIGINT!" }));
        process.on("SIGTERM", () => this.exitGracefully({ force: true, err: "Process received SIGTERM!" }));
        process.on("SIGUSR1", () => this.exitGracefully({ force: true, err: "Process received SIGUSR1!" }));
        process.on("SIGUSR2", () => this.exitGracefully({ force: true, err: "Process received SIGUSR2!" }));
        process.on("uncaughtException", (err) => this.exitGracefully({ force: true, err: err }));

        // Prevents program from closing - listens for signals on input
        this.rl.input.resume();
    }

    addExitHandlers(exitHandlersArr) {
        // Add exit handler functions to be executed on exit
        exitHandlersArr.forEach(e => this.exitHandlers.push(e));
    }

    exitGracefully(opt) {
        if (opt.err) console.error(opt.err);
        if (opt.force) console.error("Process exit on force!");
        this.exitHandlers.forEach(exitHandler => { if (typeof exitHandler === "function") exitHandler() });
        this.rl.close();
        process.exit(1);
    }
}

//======================================================================================================================
// Qminer store utils
//======================================================================================================================
function getStore(base, storeName) {
    let store = base.store(storeName);
    assert.notStrictEqual(store, null, "Cannot find store " + storeName + " in database.");
    return store;
}

function pushToStore(base, storeName, record, primaryFields = null) {
    if (primaryFields !== null) {
        if (existDuplicate(base, storeName, record, primaryFields)) {
            console.warn("Duplicate!");
            return;
        }
    }
    base.store(storeName).push(record);
}

function existDuplicate(base, storeName, record, primaryFields = null) {
    let found = base.search({
        $from: storeName,
        ...primaryFields.reduce((obj, field) => {
            obj[field] = record[field];
            return obj;
        }, {})
    });
    return !found.empty
}

function getFilteredRecords(base, params) {
    console.time("Filter data");

    // Get stores
    let stores = params.store;
    let storeName = Object.keys(stores)[0];
    let store = base.store(storeName);
    let storeParams = stores[storeName];

    assert.notStrictEqual(store, null, "Cannot find store " + storeName + " in database.");
    let records = store.allRecords;
    assert.ok(records.length > 0, "Store " + storeName + " has no records.");

    // Check if filters defined
    if (!("filterCol" in storeParams && "filterVal" in storeParams &&
        storeParams.filterVal.length > 0 && storeParams.filterCol.length > 0)) {
        console.log("No filter applied");
        return records;
    }

    // Construct json query
    let query = {};
    query["$from"] = storeName;
    query["$join"] = [];

    // Build query for each join
    for (let i = 0; i < storeParams.filterCol.length; i++) {
        let filterCol = storeParams.filterCol[i];
        let filterVal = storeParams.filterVal[i];

        if (filterVal.length === 0) continue;

        let joinFilter = filterCol.split(".");
        if (joinFilter.length > 1) {
            let joinQuery = {};
            joinQuery["$from"] = joinFilter[0];
            joinQuery[joinFilter[2]] = { $or: filterVal };
            query["$join"].push({
                $from: storeName,
                $name: joinFilter[1],
                $query: joinQuery
            });
        } else {
            query[joinFilter] = { $or: filterVal };
        }
    }
    // Apply filter
    let finalSet = base.search(
        query
    );

    assert.ok(finalSet.length > 0, "No records left after filter.");
    console.timeEnd("Filter data");
    return finalSet;
}

function getRecordSetInfo(recordSet, N = 3, cols = []) {
    recordSet = recordSet.clone();
    console.log("Number of records: " + recordSet.length);
    if (cols.length) {
        console.log(recordSet.trunc(N).map(rec => cols.map(col => rec[col])));
    } else {
        let tmp = [];
        for (let i = 0; i < N; i++) {
            tmp.push(recordSet[i]);
        }
        console.log(tmp);
    }
}

//======================================================================================================================
// Modeling utils
//======================================================================================================================
function modelPredict(clf, X) {
    let y_pred = [];
    for (let i = 0; i < X.cols; i++) {
        y_pred.push(clf.predict(X.getCol(i)));
    }
    y_pred = qm.la.Vector(y_pred);
    return y_pred;
}

function countPosNeg(y) {
    let nPos = y.toArray().filter(x => x === 1).length;
    let nNeg = y.toArray().filter(x => x === -1).length;
    let posW = 1.0;
    if (nPos < nNeg) posW = 1.0 * nNeg / nPos;
    console.log("Neg " + nNeg + " Pos " + nPos + " weight " + posW);
}

function argmax(arr) {
    let mpos = -1;
    for (let i = 0; i < arr.length; i++) {
        if (mpos === -1 || arr[i] > arr[mpos]) mpos = i;
    }
    return mpos;
}

function argmax2d(arr, axis) {
    assert.ok(typeof axis === "number" && axis <= 1 /* && is whole */, "axis " + axis + " is not an integer or "
        + axis + " > 1");
    let res = [];
    if (axis === 1) {
        for (let i = 0; i < arr.length; i++) {
            res.push(argmax(arr[i]));
        }
    } else if (axis === 0) {
        let maxlen = 0, mpos = -1;
        for (let i = 0; i < arr.length; i++) {
            maxlen = Math.max(maxlen, arr[i].length);
        }
        for (let j = 0; j < maxlen; j++) {
            mpos = -1;
            for (let i = 0; i < arr.length; i++) {
                if (arr[i].length > j)
                    if (mpos === -1 || arr[mpos][j] < arr[i][j]) mpos = i;
            }
            res.push(mpos);
        }
    }
    return res;
}

function getDailySeries(series, startDate, endDate, convertToList = true, wholeInterval = true, count = false) {
    let aggr = {}, aggrN = {};
    if (wholeInterval)
        for (let currDate = new Date(startDate.valueOf()); currDate <= endDate;
             currDate.setDate(currDate.getDate() + 1)) {
            aggr[keepDate(currDate)] = 0.0;
            aggrN[keepDate(currDate)] = 0;
        }

    for (let i = 0; i < series.length; i++) {
        let timestamp = keepDate(series[i][0]);
        if (timestamp < startDate || timestamp > endDate) continue;
        if (wholeInterval) assert(aggr[timestamp] !== undefined);
        else if (!(timestamp in aggr)) {
            aggr[timestamp] = 0.0;
            aggrN[timestamp] = 0;
        }
        if (series[i][1] >= 0) {
            aggr[timestamp] += series[i][1];
            aggrN[timestamp] += 1;
        }
    }

    // Convert to list
    if (convertToList) {
        let aggrList = Object.keys(aggr).map(key => [new Date(key), aggr[key]]);
        aggrList.sort(function (item1, item2) {
            return item1[0] - item2[0];
        });
        aggr = aggrList;
        aggr.forEach(x => assert(!isNaN(x[1]), "NaN value on series aggregation."));
    }

    return count ? [aggr, aggrN] : aggr;
}

function getAccumVal(list, field, date, nDays, forward = true, dateInISOString = false) {
    // If list transform to object.
    // Transform [[<timestamp>, <value>], ...] to {<timestamp>: <value>, ...}
    let obj = {};
    if (Array.isArray(list)) {
        list.forEach(el => (obj[new Date(el[0])] = el[1]));
    } else {
        obj = list;
    }

    let iterDate = new Date(date);
    let sum = 0.0, n = 0, completeInterval = true;
    for (let i = 0; i < nDays; i++) {
        let iterDateKey = dateInISOString ? iterDate.toISOString() : iterDate;
        if (iterDateKey in obj) {
            sum += obj[iterDateKey][field] > 0 ? obj[iterDateKey][field] : 0;
            n++;
        } else if (i === nDays - 1) {
            // Check if exist any date before or after last day of the interval - if true mark as complete
            let fn = forward ? date => new Date(date) >= iterDate : date => new Date(date) <= iterDate;
            completeInterval = Object.keys(obj).some(fn);
        }
        iterDate.setDate(iterDate.getDate() + (forward ? 1 : -1));
    }
    return [sum, n, completeInterval];
}

function minmaxScaleDailySeries(series) {
    let dg = groupBy(series, x => x[0].getFullYear());
    let cnct = [];
    for (let i = 0; i < dg.length; i++) {
        let minv = Math.min(...dg[i].map(x => x[1]));
        let maxv = Math.max(...dg[i].map(x => x[1]));
        cnct = cnct.concat(dg[i].map(x => [x[0], (x[1] - minv) / (maxv - minv)]));
    }
    return cnct;
}

function yearlymaxScaleDailySeries(series) {
    let dg = groupBy(series, x => x[0].getFullYear());
    let cnct = [];

    let yearlyMaxMin;
    for (let i = 0; i < dg.length; i++) {
        let maxv = Math.max(...dg[i].map(x => x[1]));
        if (typeof yearlyMaxMin === "undefined" || yearlyMaxMin > maxv) yearlyMaxMin = maxv;
    }

    for (let i = 0; i < dg.length; i++) {
        let maxv = Math.max(...dg[i].map(x => x[1]));
        let normC = 1.0 * yearlyMaxMin / maxv;
        cnct = cnct.concat(dg[i].map(x => [x[0], 1.0 * x[1] * normC]));
    }
    return cnct;
}

function computeJ(y) {
    let nPos = y.filter(x => x > 0).length;
    let nNeg = y.filter(x => x <= 0).length;
    return 1.0 * nNeg / nPos;
}

module.exports = {
    objToList, getProperty, toArray, findRangeNext, groupBy, getGroupIds, getKey, cloneObj, shuffle,
    getDayOfWeek, isHoliday, getMonthStr, getSeason, daysDiff, sameDate, keepDate, getDateString, addDays,
    existsFile, existsDir, extractPaths, saveToJson, saveToTsv, loadFromJson, replaceValueInObj, readCsvFile,
    log, showProgress, endSection, startSection, createDir,
    ExitHandler, getStore, pushToStore, existDuplicate, getFilteredRecords, getRecordSetInfo,
    modelPredict, countPosNeg, argmax, argmax2d, getDailySeries, getAccumVal, minmaxScaleDailySeries,
    yearlymaxScaleDailySeries, computeJ, addMonths, addHours, getTimeframes
};

// Tests
let a = [1, 2, 3];
assert.deepStrictEqual(2, argmax(a), "Calculated value is " + argmax(a));
assert.deepStrictEqual([2], argmax2d([a], 1), "Calculated value is " + argmax2d([a], 1));
assert.deepStrictEqual([0, 0, 0], argmax2d([a], 0), "Calculated value is " + argmax2d(a, 0));

let b = [
    [1, 2, 3],
    [4, 5, 1],
    [-1, 7]
];
assert.deepStrictEqual([1, 2, 0], argmax2d(b, 0), "Calculated value is " + argmax2d(b, 0));
