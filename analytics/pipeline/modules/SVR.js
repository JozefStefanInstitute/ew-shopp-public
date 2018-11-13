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

        let modelWeights = clf.weights.toArray();
        modelWeights = modelWeights.map((x, x_i) => [x, x_i]);
        modelWeights.sort((x1, x2) => -(x1[0] - x2[0]));
        for (let x of modelWeights.slice(0, 5)) {
            utils.log(x[0].toFixed(7).padEnd(11) + " " + ftr.getFeature(x[1]), scoreFout);
        }

        for (let x of modelWeights.slice(-5)) {
            utils.log(x[0].toFixed(7).padEnd(11) + " " + ftr.getFeature(x[1]), scoreFout);
        }

        // Cross-validation and model testing code goes here :)
        if (params["score"] === "cv") {
            let foldFn = getFoldFn(params);
            if (params["verbose"]) console.time("KFold test");
            let foldRes = modelSelection.kFold(X, y, 20, foldFn, true);
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

            var yPredCv = yPred; 
        }

        clf.fit(X, y);
        if (params["verbose"]) {
            let modelWeights = clf.weights.toArray();
            modelWeights = modelWeights.map((x, x_i) => [x, x_i]);
            modelWeights.sort((x1, x2) => -(x1[0] - x2[0]));
            console.log("Number of features:", modelWeights.length);
            for (let x of modelWeights.slice(0, 5)) {
                utils.log(x[0].toFixed(7).padEnd(11) + " " + ftr.getFeature(x[1]), scoreFout);
            }

            for (let x of modelWeights.slice(-5)) {
                utils.log(x[0].toFixed(7).padEnd(11) + " " + ftr.getFeature(x[1]), scoreFout);
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
        console.log("WARNING: Using CV predictions.");
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
