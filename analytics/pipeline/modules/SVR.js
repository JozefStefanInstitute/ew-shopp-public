"use strict";

const qm = require("qminer");
const assert = require("assert");
const utils = require("../../util/utils");
const modelSelection = require("../../util/model_selection");

function getFoldFn(params) {
    return (trainFeatures, trainLabels, testFeatures, testLabels) => {
        let clf = new qm.analytics.SVR(params["SVM_param"]);
        clf.fit(trainFeatures, trainLabels);
        let predictedLabels = clf.predict(testFeatures);

        assert.ok(predictedLabels.length === testLabels.length);

        return [testLabels, predictedLabels];
    };
}

function exec(params, base, featureList) {
    let clf, ftr;

    console.log("SVR Model says hello!");
    // 1. Create new model or load model from file
    // Model and feature space should be stored in the same file
    if (params["pipeline_mode"] === "fit-init") {
        clf = new qm.analytics.SVR(params["SVM_param"]);
        ftr = new qm.FeatureSpace(base, featureList);
    } else if (params["pipeline_mode"] === "fit" || params["pipeline_mode"] === "predict") {
        let fin = qm.fs.openRead(params["model_filename"]);
        ftr = new qm.FeatureSpace(base, fin);
        clf = new qm.analytics.SVR(fin);
        fin.close();
    }

    // 2. Get target input and features.
    // All features are stored in one large feature_store where each record
    // Corresponds to one input record. Records are naively joined by their position in the store.
    let inputStore = base.store(params["input_store"]);
    console.log(params["feature_store"]);
    let featureRecords = base.store(params["feature_store"]).allRecords;

    if (featureRecords.length === 0) {
        let e = Error("No feature records in the feature store. " + params["feature_store"] +
            " " + params["input_store"]);
        e.name = "NoFeatures";
        throw e;
    }

    /*
     * Check (featureList.length > 0) is weird but when base containing features
     * is not filled by the pipeline (but given beforehand) we have no featureList
     */
    if (params["pipeline_mode"] === "predict" && featureList.length > 0) {
        // Point of weirdness
        // Can not extract matrix - check
        let ftrInput = new qm.FeatureSpace(base, featureList);
        assert.ok(
            ftr.dims.length === ftrInput.dims.length,
            "Number of selected features does not match fitted features."
        );
    }

    // 3. Extract feature matrix
    // Feature space should only be updated on training data (because of normalization).
    // Special care is required when doing cross-validation.
    if (params["pipeline_mode"] === "fit" || params["pipeline_mode"] === "fit-init") ftr.updateRecords(featureRecords);
    let X = ftr.extractMatrix(featureRecords);

    // 4. Target extraction and model fitting.
    // If pipeline is in the 'fit' mode, values of target variable are available in 'input_store'
    if (params["pipeline_mode"] === "fit" || params["pipeline_mode"] === "fit-init") {
        let y = [];
        inputStore.allRecords.each(rec => {
            y.push(rec.Value);
        });
        y = new qm.la.Vector(y);

        // Save cs output and features scores
        let scoreFout = qm.fs.openWrite(params["model_scores"]);
        if (params["grid_search"] === true) {
            const gridParams = {
                type: ["EPSILON_SVR"],
                algorithm: ["LIBSVM"],
                kernel: ["RBF"],
                c: [1.0, 2.0, 10.0, 100.0, 150.0, 200.0],
                j: [1.0],
                gamma: [1.0, 0.1, 0.01, 0.001],
                eps: [0.001, 0.01],
                p: [0.01, 0.1],
                degree: [1, 2, 3, 4, 5],
                maxIterations: [200000],
                batchSize: [10000],
                maxTime: [3],
                cacheSize: [800]
            };

            let numOfComb = Object.values(gridParams).reduce((acc, a) => {return acc * a.length}, 1.0);
            console.log("Grid search [" + numOfComb + "]");
            let i = 1;
            const scoreFn = function (comb, X, y) {
                let scores = [], sumR2 = 0.0;
                utils.showProgress(`${(i++ / numOfComb * 100.0).toFixed(2)}%`);
                modelSelection.kFoldVal(X, y, 10,
                    function (xTrain, yTrain, xTest, yTest, xVal, yVal) {
                        let clf = new qm.analytics.SVR(comb);

                        clf.fit(xTrain, yTrain);

                        let yValPred = utils.modelPredict(clf, xVal);
                        let valScore = qm.analytics.metrics.r2Score(yVal, yValPred);
                        sumR2 += valScore;

                        let yPred = utils.modelPredict(clf, xTest);
                        let score = qm.analytics.metrics.r2Score(yTest, yPred);
                        scores.push(score);
                    }, 0.3);

                return { score: sumR2, scores: scores }
            };
            let gridRes = modelSelection.gridSearch(gridParams, (comb) => scoreFn(comb, X, y));
            utils.log(`Best combination: : ${JSON.stringify(gridRes.comb)}`, scoreFout);
            utils.log(`Score: : ${gridRes.score}`, scoreFout);
            utils.log("Grid scores: ", scoreFout);
            for (let score of gridRes.scores) {
                utils.log(`R2Score: ${score}`, scoreFout);
            }
            utils.log("============", scoreFout);
            clf = new qm.analytics.SVR(gridRes.comb);
        }

        clf.fit(X, y);

        // Cross-validation and model testing code goes here :)
        if (params["score"] === "cv") {
            let foldFn = getFoldFn(params);
            if (params["verbose"]) console.time("KFold test");
            let foldRes = modelSelection.kFold(X, y, y.length > 10 ? 10 : y.length, foldFn, true);
            if (params["verbose"]) console.timeEnd("KFold test");

            let yTrue = new qm.la.Vector(),
                yPred = new qm.la.Vector();

            foldRes.forEach(([trueVal, predVal]) => {
                yTrue.pushV(trueVal);
                yPred.pushV(predVal);
            });

            utils.log("Cross-validation testing:", scoreFout);
            utils.log(`MAE: ${qm.analytics.metrics.meanAbsoluteError(yTrue, yPred)}`, scoreFout);
            utils.log(`RMSE: ${qm.analytics.metrics.rootMeanSquareError(yTrue, yPred)}`, scoreFout);
            utils.log(`R2Score: ${qm.analytics.metrics.r2Score(yTrue, yPred)}`, scoreFout);

            var yPredCv = yPred; // TODO: fix
        }

        if (params["verbose"]) {
            let modelWeights = clf.weights.toArray();
            modelWeights = modelWeights.map((x, x_i) => [x, x_i]);
            modelWeights.sort((x1, x2) => -(x1[0] - x2[0]));
            console.log("Number of features:", modelWeights.length);
            if (params["show_all_weights"] === true) {
                for (let x of modelWeights) {
                    utils.log(x[0].toFixed(7).padEnd(11) + " " + ftr.getFeature(x[1]), scoreFout);
                }
            } else {
                for (let x of modelWeights.slice(0, 5)) {
                    utils.log(x[0].toFixed(7).padEnd(11) + " " + ftr.getFeature(x[1]), scoreFout);
                }

                for (let x of modelWeights.slice(-5)) {
                    utils.log(x[0].toFixed(7).padEnd(11) + " " + ftr.getFeature(x[1]), scoreFout);
                }
            }
        }
        scoreFout.close();
        // Save feature space and model in the same file
        let fout = qm.fs.openWrite(params["model_filename"]);
        ftr.save(fout);
        clf.save(fout);
        fout.close();
    }

    // 5. Do predictions and store them to 'output_store'.
    // TODO: when in fit-init or fit mode yPred be a cv prediction.
    let yPred = utils.modelPredict(clf, X);
    if (typeof yPredCv !== "undefined") {
        yPred = yPredCv;
        console.warn("WARNING: Using CV predictions.");
    }

    // Copy all Input fields and add Value field if it is not already present
    let outputStoreFields = inputStore.fields.slice(0);
    if (outputStoreFields.find(field => field.name === "Value") === undefined)
        outputStoreFields.push({ name: "Value", type: "float" });

    let outputStore = base.createStore({
        name: params["output_store"],
        fields: outputStoreFields
    });

    inputStore.allRecords.each((inputRec, i) => {
        let rec = {};

        outputStoreFields.forEach(field => {
            if (field.name !== "Value") rec[field.name] = inputRec[field.name];
        });

        rec["Value"] = yPred[i];
        outputStore.push(rec);
    });
}

module.exports = { exec };
