"use strict";
var qm = require('qminer');
var la = qm.la;

function rfe(X, y, trainFn, step, nFeaturesToSelect, scoreFn){
    /* Recursive feature elimination. */
    let nFeat = X.rows;
    let nFeatSel = typeof nFeaturesToSelect == 'undefined' ? nFeat / 2 : nFeaturesToSelect;
    if(step < 1.0) step = Math.trunc(Math.max(1, step * nFeat));
    
    let support = new Array(nFeat).fill(1);
    let scores = [];

    let Xt = X.transpose(); let remFeat = nFeat; let train = undefined; let featIdx = undefined;
    while(remFeat > nFeatSel){
        featIdx = new la.IntVector(new Array(nFeat).fill(0).map((v, i) => i).filter(x => support[x] > 0));
        let Xsub = Xt.getColSubmatrix(featIdx).transpose();

        train = trainFn(Xsub, y);

        let coef = new la.Vector(train.coef.toArray().map(x => x*x));
        let perm = coef.sortPerm().perm;
        let thresh = Math.min(step, remFeat - nFeatSel);
        
        // calculate feature set score
        if(typeof scoreFn != 'undefined')
            scores.push(scoreFn(train.clf, featIdx));

        // remove features
        for(let i = 0; i < thresh;i++)
            support[featIdx[perm[i]]] = 0;
        // count remaining features
        remFeat = support.reduce((a, b) => a + b);
    }

    // compute final score
    if(typeof scoreFn != 'undefined')
            scores.push(scoreFn(train.clf, featIdx));

    return { support: support, scores: scores };
}

function rfeCv(X, y, cvIter, trainFn, scoreFn, step){
    /* Recursive feature elimination with cross-validation. */
    let nFeat = X.rows;
    let nFeatSel = 1;
    if(step < 1.0) step = Math.trunc(Math.max(1, step * nFeat));
    
    let scoreSum = [];
    for(let spl = cvIter.next(X, y); !spl.done; spl = cvIter.next(X, y)){
        console.log(spl);
        let score = rfe(spl.xTrain, spl.yTrain, trainFn, step, nFeatSel, 
            (clf, featIdx) => scoreFn(clf, spl.xTest.transpose().getColSubmatrix(featIdx).transpose(), spl.yTest)).scores;
        
        if(scoreSum.length == 0) scoreSum = score;
        else scoreSum = scoreSum.map((v, i) => v + score[i]);
    }

    // find max element
    let maxScore = Math.max(...scoreSum), argMax = 0;
    for(; argMax < scoreSum.length && scoreSum[argMax] < maxScore; argMax++);
    
    nFeatSel = Math.max(nFeatSel, nFeat - argMax * step);
    console.log("Optimal number of features " + nFeatSel + " / " + nFeat);
    
    // re-execute the elimination
    let elm = rfe(X, y, trainFn, step, nFeatSel);
    return {
        nFeaturesToSelect: nFeatSel,
        support: elm.support
    };
}


module.exports = { rfe, rfeCv };
