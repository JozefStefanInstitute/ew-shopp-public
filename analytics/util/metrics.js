"use strict";

const la = require('qminer').la;
const assert = require('assert');


function confusionMatrix(yTrue, yPred, nCat = null, verbose = false) {
    if (nCat == null) {
        nCat = new Set([...yTrue.toArray(), ...yPred.toArray()]).size;
    }

    if (verbose) console.log(`\n True ${yTrue.toArray()}\nPred ${yPred.toArray()}`);

    let confMat = new la.Matrix({"rows": nCat, "cols": nCat});
    for (let i = 0; i < yTrue.length; i++) {
        let predL = yPred.at(i);
        let trueL = yTrue.at(i);
        confMat.put(predL, trueL, confMat.at(predL, trueL) + 1);
    }

    return confMat;
}


function precisionRecall(confMat) {
    assert.ok(confMat.cols === confMat.rows);
    let nLabels = confMat.cols;
    let prec = [];
    for (let i = 0; i < nLabels; i++) {
        prec.push(confMat.at(i, i) / confMat.getRow(i).sum());
    }
    let rec = [];
    for (let i = 0; i < nLabels; i++) {
        rec.push(confMat.at(i, i) / confMat.getCol(i).sum());
    }
    return {"prec": prec, "rec": rec};
}


function calculateAME(err, verbose = false) {
    // compute AME
    let ame = 0;
    for (let e of err) {
        ame += Math.abs(e[1] - e[2]);
    }
    ame = ame / err.length;
    if (verbose) console.log("AME: " + ame);
    return ame;
}


function calculateRMSE(err, verbose = false) {
    // compute RMSE
    let rmse = 0.0;
    for (let e of err) {
        rmse += (e[1] - e[2]) * (e[1] - e[2]);
    }
    rmse = Math.sqrt(rmse / err.length);
    if (verbose) console.log("RMSE: " + rmse);
    return rmse;
}

module.exports = {confusionMatrix, precisionRecall, calculateAME, calculateRMSE};