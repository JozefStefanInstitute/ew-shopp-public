"use strict";

const qm = require("qminer");
const assert = require("assert");
const fs = qm.fs;
const nodeFs = require("fs");
const config = require("../config/config");
const utils = require("../util/utils");

// Configurable parameters
const MODELS_ROOT_DIR = config.paths.models;
const DATA_ROOT_DIR = config.paths.dataDir;

/**
*   Execute pipeline specified in json file
*/

//======================================================================================================================
// Command line arguments
//======================================================================================================================
if (require.main === module) {
    let argv = require("minimist")(process.argv.slice(2));

    if (argv.d && argv.m) {
        console.log(`Reading configuration from: ${argv.d}`);
        console.log(`Executing [${argv.m}] pipeline`);
    } else {
        console.log("USAGE:");
        console.log("  -d : path to configuration json file");
        console.log("  -m : [fit/fit-init/predict/transform]");
        process.exit(1);
    }

    // Parse pipeline file
    let pipeline = utils.loadFromJson(argv.d);

    exec(pipeline, argv.m);
}

//======================================================================================================================
// Pipeline execution
//======================================================================================================================
function exec(pipeline, mode, overBase = undefined, modelsRootDir = undefined) {
    /*
    Pipeline can be executed in four different modes:
    * transform
        execute all one time feature transformation modules specified in build_policy field
    * fit-init
        fit the model for the first time using module specified in "input_extraction"
        as input - model saved to file
    * fit
        use existing model and fit the model with new data specified in "input_extraction" as input
    * predict
        load fitted components from disk and do predictions on records stored in "Input" store

    stores/records from pipeline's execution base are overriden by stores from overBase 
    (if they exist).
    */
    assert(["fit-init", "fit", "predict", "predict-active", "transform"].indexOf(mode) >= 0,
        "Mode " + mode + " not recognized");
    pipeline["mode"] = mode;
    modelsRootDir = modelsRootDir == null ? MODELS_ROOT_DIR : modelsRootDir;
    
    if (!pipeline.hasOwnProperty("dir")){
        // If 'usecase' field is defined use the new location
        if(pipeline.hasOwnProperty("usecase")){
            // Model goes under data/usecase/<USECASE_NAME>/models/<PIPELINE_NAME>/
            pipeline["dir"] = DATA_ROOT_DIR + "usecase/" + pipeline["usecase"] + "/models/" + pipeline["name"] + "/";
        }
        else{
            // If 'usecase' field is not defined location remains the same as before
            let modelDir;
            if (pipeline["name"] != null && pipeline["version"] != null) {
                modelDir = pipeline["name"] + "v" + pipeline["version"];
            } else if (pipeline["id"]) {
                modelDir = pipeline["id"];
            } else {
                console.log("'id' or 'name' + 'version' are not defined in configurations", "ERROR");
                return null;
            }
            
            // Model files and QMiner db are stored in pipeline directory
            modelsRootDir += modelsRootDir.endsWith("/") ? "" : "/";
            pipeline["dir"] = modelsRootDir + modelDir + "/";
        }
    }

    // Additional check to ensure directory path ends with '/'
    if (!pipeline["dir"].endsWith("/")) pipeline["dir"] += "/";

    if (!nodeFs.existsSync(pipeline["dir"])) {
        let exist = ["fit", "predict", "predict-active"].indexOf(mode) >= 0;
        assert(!exist, "Pipeline directory not found!");
        if (mode !== "transform") fs.mkdir(pipeline["dir"]);
    }

    if (mode === "transform") {
        console.log(`Mode: ${mode}`);
        transform(pipeline);
    } else if (mode === "fit-init" || mode === "fit" || mode === "predict") {
        // Basic execution information
        console.log(`Pipeline: ${pipeline["id"]}`);
        console.log(`Dir: ${pipeline["dir"]}`);
        console.log(`Mode: ${mode}`);

        // Copy pipeline config file to working directory
        let fout = fs.openWrite(pipeline["dir"] + "pipeline-" + mode + ".json");
        fout.write(JSON.stringify(pipeline, null, 4));
        fout.close();

        // Create fresh instance of pipeline's working DB
        let base = new qm.Base({ mode: "createClean", dbPath: pipeline["dir"] + "db" });

        inputExtraction(pipeline, base);
        // Check input columns
        let inputStore = base.store("Input");

        // All primary key fields should be present in the inputStore
        let inputFieldsNm = inputStore.fields.map(x => x.name);
        // When fitting the pipeline target value should be present
        if (mode === "fit-init" || mode === "fit")
            assert(inputFieldsNm.indexOf("Value") >= 0, "Value field not present in the input store.");

        // Feature extraction (selection) phase is mode independent
        let featureList = extraction(pipeline, base);
        // All model features are stored in "FtrSpace" store,
        // Feature is a list of used features and their types

        model(pipeline, base, featureList);

        // Optional output step
        if (typeof pipeline["pipeline"]["output"] !== "undefined") {
            output(pipeline, base);
        }

        let outputStoreObjs;
        if(typeof base.store("Output") !== "undefined" && base.store("Output") != null)
            outputStoreObjs = base.store("Output").allRecords.map(rec => rec.toJSON());
        else
            console.log("No 'Output' store in pipeline Db");

        base.close();
        return outputStoreObjs;
    }
    else if (mode === "predict-active") {
        // =pen pre-built base from fit step
        const base = new qm.Base({ mode: "open", dbPath: pipeline["dir"] + "db" });
        const tmpBase = new qm.Base({ mode: "createClean", dbPath: pipeline["dir"] + "Tmpdb" });

        // Fill temporary base
        // * "FtrSpace" and "Input" gets copied from overBase - usually base created by prediction server
        // * Other stores are copied from pipeline's working base to satisfy the requirement from FeatureSpace
        base.getStoreList().map(x => x.storeName).forEach(function (storeName) {
            if (storeName !== "Output") { // Exclude output store

                // I have to use "InputFeat" instead of "Input"
                // because model's "input_store" is set to "InputFeat"
                if (storeName !== "InputFeat" && storeName !== "FtrSpace")
                    writeStore(base, tmpBase, storeName);
                else
                    writeStore(overBase, tmpBase, storeName);
            }
        });
        base.close();

        // Act as if in the "predict" from now on
        pipeline["mode"] = "predict";

        // Feature list can be empty since FeatureSpace
        // is already fitted
        model(pipeline, tmpBase, []);

        // Get predictions
        return tmpBase.store("Output").allRecords.map(rec => rec.toJSON());

        // 'tmpBase' is not stored on disk so no tmpBase.close() is needed
    }
}

function writeStore(baseSrc, baseDest, storeName) {
    if (baseSrc.isStore(storeName)) {
        assert(!baseDest.isStore(storeName), "Store " + storeName + " already exists is baseDest.");

        let srcStore = baseSrc.store(storeName);

        baseDest.createStore({
            name: storeName,
            fields: srcStore.fields.map(function (field) {
                return {
                    name: field.name,
                    type: field.type,
                    null: field.nullable
                }
            })
        });

        let destStore = baseDest.store(storeName);
        srcStore.allRecords.each(rec => {
            let inRec = {};
            destStore.fields.forEach(field => inRec[field.name] = rec[field.name]);
            destStore.push(inRec);
        });
        return true;
    }
    return false;
}

function transform(pipeline) {
    // Transformation modules are independent - there is no input
    // from the previous stages of the pipeline neither is there any
    // output
    for (let moduleInfo of pipeline["transformation"]) {
        let builder = loadModule(moduleInfo["module"]);
        builder.exec(moduleInfo["params"]);
    }
}

function inputExtraction(pipeline, base) {
    let inputExtractor = loadModule(pipeline["input_extraction"]["module"]);

    let params = pipeline["input_extraction"]["params"];
    params["input"] = pipeline["pipeline"]["input"];
    params["output_store"] = "Input";

    inputExtractor.exec(params, base);
}

function extraction(pipeline, base) {
    let featureList = [],
        featureStores = [],
        featureRecords = [];

    for (let moduleInfo of pipeline["pipeline"]["extraction"]) {
        let transformer = loadModule(moduleInfo["module"]);

        let params = moduleInfo["params"];
        params["output_store"] = moduleInfo["module"]; // !!!
        params["input"] = pipeline["pipeline"]["input"];

        let [features, featuresRecs] = transformer.exec(params, base);

        featureStores.push(base.store(params["output_store"]));
        featureRecords.push(featuresRecs);
        featureList = featureList.concat(features);
    }

    // 2b. Merge all features to the same store
    // there is a better solution using joins
    // i.e. { type: 'text', source: [{ store: "Users", join: "tweets"}] }
    // extracts text features for all tweets from each user record
    // currently concatenation is done with merging all records
    // in one common feature store
    console.log("Feature merge...");
    let featureFields = [];
    for (let featureStore of featureStores) {
        featureStore.fields.forEach(field => {
            featureFields.push({ name: field.name, type: field.type, null: field.nullable });
        });
    }
    let inputFeatFields = [];
    base.store("Input").fields.forEach(field => {
        inputFeatFields.push({ name: field.name, type: field.type, null: field.nullable });
    });

    base.createStore({
        name: "FtrSpace",
        fields: featureFields
    });

    base.createStore({
        name: "InputFeat",
        fields: inputFeatFields
    });

    let featureStoreRef = base.store("FtrSpace");
    let inputFeatStoreRef = base.store("InputFeat");

    let onlyDate =
        pipeline["pipeline"]["input"]["keep_only_date"] == null
            ? true
            : pipeline["pipeline"]["input"]["keep_only_date"];

    base.store("Input").allRecords.each(inputRec => {
        // Enrich all inputs with features from all feature stores
        let rec = {};
        // Get features
        featureRecords.forEach(recs => {
            let [inputKey] = utils.getKey(pipeline["pipeline"]["input"]["primary_key"], inputRec, null, onlyDate);
            let fRec = recs.get(inputKey);
            // Enrich input
            Object.keys(fRec).forEach(field => {
                rec[field] = fRec[field];
            });
        });

        // Any feature empty/missing skip it
        if (Object.values(rec).some(v => v == null)) {
            // TODO: featureFailStoreRef.push(rec)
            // missing features data to enrich
            // useful with servers request/response
            console.log("Skip record (not all features are available)");
        } else {
            // Store to one common feature store
            featureStoreRef.push(rec);
            let inRec = {};
            base.store("Input").fields.forEach(field => (inRec[field.name] = inputRec[field.name]));
            inputFeatStoreRef.push(inRec);
        }
    });

    // Change source store of each feature
    featureList.forEach((v, i, a) => (a[i].source = "FtrSpace"));
    console.log(`Num of feature records: ${featureStoreRef.allRecords.length}`);

    return featureList;
}

function model(pipeline, base, featureList) {
    let params = pipeline["pipeline"]["model"]["params"];

    // Why "input_store" = "InputFeat" and not "input_store" = "Input"?
    params["input_store"] = "InputFeat";
    params["output_store"] = "Output";
    params["feature_store"] = "FtrSpace";
    params["pipeline_mode"] = pipeline["mode"]; // Bad design...

    // model_filename without '/' is transformed to modelDir + model_filename
    if (params["model_filename"].indexOf("/") === -1)
        params["model_filename"] = pipeline["dir"] + params["model_filename"];

    // Save scores to file
    params["model_scores"] = pipeline["dir"] + "scores.txt";
    // Load model module
    let modelModule = loadModule(pipeline["pipeline"]["model"]["module"]);
    modelModule.exec(params, base, featureList);
}

function output(pipeline, base) {
    console.log("Output module !!!");
    let execOutputFn = (module) => {
        const params = module["params"];
        params["name"] = pipeline["name"];
        params["input_store"] = "Input";
        params["output_store"] = "Output";

        if (params["output_file"].indexOf("/") === -1) params["output_file"] = pipeline["dir"] + params["output_file"];

        const m = loadModule(module["module"]);
        m.exec(params, base);
    };

    if (Array.isArray(pipeline["pipeline"]["output"])) {
        pipeline["pipeline"]["output"].forEach(module => execOutputFn(module));
    } else if (typeof pipeline["pipeline"]["output"] === "object") {
        execOutputFn(pipeline["pipeline"]["output"]);
    }
}

function loadModule(modulePath) {
    // If modulePath does not contain '/' then search for the
    // module in pipeline/modules/ folder
    if (modulePath.indexOf("/") === -1) modulePath = "./modules/" + modulePath;
    return require(modulePath);
}

module.exports = { exec };
