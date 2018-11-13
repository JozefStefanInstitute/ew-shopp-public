"use strict";
const qm = require('qminer');
const assert = require('assert');
const utils = require("./utils");


function kFold(X, y, k = 3, trainFn, verbose = false) {
    let nSamples = y.length;
    let ind = new Array(nSamples);
    for (let i = 0; i < nSamples; i++) ind[i] = i;

    let shuff = utils.shuffle(ind);
    let foldSize = 1.0 * nSamples / k;
    let foldsRes = [];

    for (let tk = 0; tk < k; tk++) {
        if (verbose) utils.showProgress("fold: " + tk);
        let trainInd = new qm.la.IntVector(shuff.filter((v, i) => i < tk * foldSize || i >= (tk + 1) * foldSize));
        let testInd = new qm.la.IntVector(shuff.filter((v, i) => i >= tk * foldSize && i < (tk + 1) * foldSize));
        foldsRes.push(trainFn(X.getColSubmatrix(trainInd), y.subVec(trainInd),
            X.getColSubmatrix(testInd), y.subVec(testInd), trainInd, testInd));
    }
    if (verbose) utils.showProgress("");

    return foldsRes
}

function kFoldVal(X, y, k = 3, trainFn, valSize = 0.3) {
    // KFold with validation set
    let ind = [], nSamples = y.length;
    for (let i = 0; i < nSamples; i++) ind.push(i);

    let shuff = utils.shuffle(ind);
    let foldSize = Math.ceil(1.0 * nSamples / k);
    for (let tk = 0; tk < k; tk++) {
        let testInd = new qm.la.IntVector(shuff.filter((v, i) => i >= tk * foldSize && i < (tk + 1) * foldSize));

        let otherInd = shuff.filter((v, i) => i < tk * foldSize || i >= (tk + 1) * foldSize);
        let tmpShuff = utils.shuffle(otherInd);

        let valPos = Math.floor(valSize * tmpShuff.length);
        let validInd = new qm.la.IntVector(tmpShuff.slice(0, valPos));
        let trainInd = new qm.la.IntVector(tmpShuff.slice(valPos));

        trainFn(X.getColSubmatrix(trainInd), y.subVec(trainInd),
            X.getColSubmatrix(testInd), y.subVec(testInd), X.getColSubmatrix(validInd), y.subVec(validInd), trainInd, testInd, validInd);
    }
}

function trainTestSplit(X, y, testSize = 0.33, shuffle = true) {
    let ind = [], nSamples = y.length;
    for (let i = 0; i < nSamples; i++) ind.push(i);
    if (shuffle) ind = utils.shuffle(ind);

    let splitPos = Math.floor(testSize * nSamples);
    let testInd = new qm.la.IntVector(ind.slice(0, valPos));
    let trainInd = new qm.la.IntVector(ind.slice(valPos));

    return {
        xTrain: X.getColSubmatrix(trainInd), yTrain: y.subVec(trainInd),
        xTest: X.getColSubmatrix(testInd), yTest: y.subVec(testInd)
    };
}


function leaveOneGroupOutIter(groups) {
    var ind = [];
    for (let i = 0; i < groups.length; i++) ind.push(i);

    var uniqueGroups = groups.filter((v, i, a) => a.indexOf(v) === i);
    var groupIdx = 0;

    return {
        next: function (X, y) {
            if (groupIdx == uniqueGroups.length)
                return {done: true};

            let outGroup = uniqueGroups[groupIdx];
            groupIdx++;
            let trainInd = new qm.la.IntVector(ind.filter(x => groups[x] != outGroup));
            let testInd = new qm.la.IntVector(ind.filter(x => groups[x] == outGroup));
            return {
                trainInd: trainInd,
                testInd: testInd,
                xTrain: X.getColSubmatrix(trainInd),
                xTest: X.getColSubmatrix(testInd),
                yTrain: y.subVec(trainInd),
                yTest: y.subVec(testInd),
                done: false
            };
        }
    };
}

function leaveOneGroupOut(X, y, groups, trainFn, useGroups) {
    /* Leave One Group Out cross-validator

    Provides train/test indices to split data according to a third-party
    provided group. For instance the groups could be the year of collection
    of the samples and thus allow for cross-validation against time-based splits.
    */
    let ind = [];
    for (let i = 0; i < groups.length; i++) ind.push(i);

    var uniqueGroups = groups.filter((v, i, a) => a.indexOf(v) === i);
    let useGroups_ = undefined;
    if (typeof useGroups == 'undefined') useGroups_ = new Set(uniqueGroups);
    else {
        assert.ok(useGroups instanceof Array, 'useGroups has to be an Array'); // fixit
        useGroups_ = new Set(useGroups); // :)
    }
    for (let outGroup of uniqueGroups) {
        if (!useGroups_.has(outGroup)) continue;
        let trainInd = new qm.la.IntVector(ind.filter(x => groups[x] != outGroup && useGroups_.has(groups[x])));
        let testInd = new qm.la.IntVector(ind.filter(x => groups[x] == outGroup));
        trainFn(X.getColSubmatrix(trainInd), y.subVec(trainInd),
            X.getColSubmatrix(testInd), y.subVec(testInd), trainInd, testInd);
    }
}

function trainOnGroups(X, y, groups, trainFn, useGroups) {
    let ind = [];
    for (let i = 0; i < groups.length; i++) ind.push(i);

    var uniqueGroups = groups.filter((v, i, a) => a.indexOf(v) === i);
    let useGroups_ = undefined;
    if (typeof useGroups == 'undefined') useGroups_ = new Set(uniqueGroups);
    else {
        assert.ok(useGroups instanceof Array, 'useGroups has to be an Array'); // fixit
        useGroups_ = new Set(useGroups); // :)
    }
    let trainInd = new qm.la.IntVector(ind.filter(x => useGroups_.has(groups[x])));
    return trainFn(X.getColSubmatrix(trainInd), y.subVec(trainInd), trainInd);
}

function testOnGroups(X, y, groups, testFn, useGroups) {
    let ind = [];
    for (let i = 0; i < groups.length; i++) ind.push(i);

    var uniqueGroups = groups.filter((v, i, a) => a.indexOf(v) === i);
    let useGroups_ = undefined;
    if (typeof useGroups == 'undefined') useGroups_ = new Set(uniqueGroups);
    else {
        assert.ok(useGroups instanceof Array, 'useGroups has to be an Array'); // fixit
        useGroups_ = new Set(useGroups); // :)
    }
    let testInd = new qm.la.IntVector(ind.filter(x => useGroups_.has(groups[x])));
    return testFn(X.getColSubmatrix(testInd), y.subVec(testInd), testInd);
}

function gridSearch(params, scoreFn) {
    let combs = [{}];
    for (let param in params) {
        let prevLen = combs.length;
        for (let i = 0; i < prevLen; i++) {
            for (let paramVal of params[param]) {
                let newComb = Object.assign({}, combs[i]);
                newComb[param] = paramVal;
                combs.push(newComb);
            }
        }
        for (let i = 0; i < prevLen; i++) combs.shift();
    }

    let bestComb = undefined, bestScore = -1.0, bestScores = undefined;
    for (let comb of combs) {
        let combScore = scoreFn(comb);
        if ((typeof bestComb == 'undefined') || combScore.score > bestScore) {
            bestComb = comb;
            bestScore = combScore.score;
            bestScores = combScore.scores;
        }
    }
    return {comb: bestComb, score: bestScore, scores: bestScores};
}

module.exports = {
    kFold,
    trainTestSplit,
    leaveOneGroupOut,
    leaveOneGroupOutIter,
    trainOnGroups,
    gridSearch,
    kFoldVal,
    testOnGroups
};