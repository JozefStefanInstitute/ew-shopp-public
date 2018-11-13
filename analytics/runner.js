"use strict";

const path = require("path");
const childProcess = require("child_process");
const argv = require("minimist");
const assert = require("assert");

const config = require("./config/config");
const utils = require("./util/utils");
const mm = require("./pipeline/model_manager");
const pipeline = require("./pipeline/pipeline_runner");
const loader = require("./loader/data_loader");
// Default loader configuration locations
const MODELS_FOLDER = config.paths.models;
const LOADER_CONF_FOLDER = config.paths.configurations.loader;

// Specific to the shared database
const WEATHER_STORE_CONF = LOADER_CONF_FOLDER + "weather_store.json";
const WEATHER_STORE_INIT_CONF = LOADER_CONF_FOLDER + "weather_store_init.json";
const PREDICTION_STORE_CONF = LOADER_CONF_FOLDER + "pred_store.json";
const PROD_LOAD_CONF = LOADER_CONF_FOLDER + "prod_load_init.json";

// Scripts
const WEATHER_UPDATE_SCRIPT = "./scripts/weather_update.sh";

// Raw weather data
const WEATHER_QM_STORE_CONF = config.paths.weatherQmStore;
const WEATHER_TSV_FOLDER = config.paths.weatherRawTsv;
const WEATHER_QM_INIT = config.paths.weatherInitTsv;

// Misc
const YESTERDAY = utils.addDays(new Date(), -1);

// Model manager
let modelManager;

function updateWeather(params, date = YESTERDAY) {
    let filename = `db-weather-${date}.tsv`;
    let srcTsv = WEATHER_TSV_FOLDER + filename;
    if (utils.existsFile(srcTsv) && params["update-weather"] !== "force") {
        modelManager.log(`Weather data (TSVs) already exist for ${date}`);
    } else {
        // Run script to get updates
        modelManager.log(`Run weather update script (${date})`);

        let res = childProcess.spawnSync("sh", ["-c", WEATHER_UPDATE_SCRIPT], {
            cwd: process.cwd(),
            stdio: "inherit"
        });
        if (res.status !== 0) {
            modelManager.log("Update weather failed", "ERROR");
        } else {
            modelManager.log("Update weather successfully finished");
        }
    }
}

async function uploadWeather(params, date = YESTERDAY) {
    // Load weather configurations and upload to MariaDB
    const init = params["upload-weather"] === "init";

    let filename, srcTsv, conf;
    if (init) {
        conf = utils.loadFromJson(WEATHER_STORE_INIT_CONF);
        filename = conf["source"]["filename"];
        srcTsv = conf["source"]["dir"] + filename;
    } else {
        conf = utils.loadFromJson(WEATHER_STORE_CONF);
        filename = `db-weather-${date}.tsv`;
        srcTsv = WEATHER_TSV_FOLDER + filename;
    }

    modelManager.log("Upload weather to MariaDB", "INFO", null, `Read from file '${srcTsv}'`);
    if (utils.existsFile(srcTsv)) {
        if (!init) {
            // Set date
            conf["queries"][0]["query_dst"]["placeholder_mapping"][0] = {
                mode: "fixed",
                value: new Date(date).toISOString()
            };
        }
        let dataLoader = new loader.Loader(conf);
        return dataLoader.run();
    } else {
        modelManager.log("Upload weather data to MariaDB failed", "WARN", null, `File '${srcTsv}' does not exist`);
    }
}

async function uploadWeatherQm(params, date) {
    const init = params["upload-weather"] === "init";

    let filename, srcTsv;
    if (init) {
        filename = WEATHER_QM_INIT;
        srcTsv = WEATHER_TSV_FOLDER + filename;
    } else {
        filename = `qminer-weather-${date}.tsv`;
        srcTsv = WEATHER_TSV_FOLDER + filename;
    }

    modelManager.log("Upload weather to QMinerDB", "INFO", null, `Read from file '${srcTsv}'`);
    if (utils.existsFile(srcTsv)) {
        let conf = utils.loadFromJson(WEATHER_QM_STORE_CONF);
        conf["source"]["dir"] = WEATHER_TSV_FOLDER;
        conf["source"]["filename"] = filename;
        conf["destination"]["mode"] = init ? "createClean" : "open";

        let dataLoader = new loader.Loader(conf);
        return dataLoader.run();
    } else {
        modelManager.log("Upload weather data to QMinerDB failed", "WARN", null, `File '${srcTsv}' does not exist`);
    }
}

async function updateData(params, date = YESTERDAY) {
    let conf = utils.loadFromJson(PROD_LOAD_CONF);
    const init = params["update-data"] === "init";

    conf["destination"]["query_res"] = true;
    if (init) {
        modelManager.log("Download data - all", "INFO");
        // Download all
        conf["destination"]["mode"] = "createClean";
    } else {
        modelManager.log(`Download data (${date})`, "INFO");
        // Download only product from that date
        console.log(`Update all products [${date}].`);
        conf["destination"]["mode"] = "open";
        conf["queries"].forEach(query => {
            if (query["name"] === "Product state") {
                query["query_src"]["query"] = `SELECT * FROM product_states WHERE date = "${date}"`;
            } else if (query["name"] === "Products") {
                query["query_src"]["query"] = `SELECT * FROM products WHERE date = "${date}"`;
            }
        });
    }

    let dataLoader = new loader.Loader(conf);
    return dataLoader.run(true, true).then(res => {
        if (res.length === 0) {
            modelManager.log("No new records found in MariaDB", "WARN");
        } else {
            modelManager.log(`Downloaded ${res.length} records`);
        }
    });
}

async function weatherTransformations(params, date) {
    if (!params["transform-weather"]) return;
    modelManager.log("Weather transformation started", "INFO");
    startSection("WEATHER TRANSFORMATIONS");
    const init = params["transform"] === "init" || params["transform-weather"] === "init";

    // Weather features
    let confPath = path.parse(params["weather-transformations"]);
    let conf = utils.loadFromJson(init ? path.join(confPath.dir, confPath.name + "_init" + confPath.ext)
        : params["weather-transformations"]);

    // Find weather transformation
    let weatherTransformation = conf["transformation"].find(tr => { return tr.module === "weather_builder" });

    if (params["transform-weather"] === "new") {
        weatherTransformation["params"]["future"] = true;
        // Set date as today and calculate future features (forecast)
        weatherTransformation["params"]["start_date"] = date;
        weatherTransformation["params"]["end_date"] = utils.addDays(date, 7);
    } else if (params["transform-weather"] !== "conf" && !init) {
        weatherTransformation["params"]["start_date"] = date;
        weatherTransformation["params"]["end_date"] = utils.addDays(date, 7);
    }

    pipeline.exec(conf, "transform", undefined, params["models-dst-dir"]);
    modelManager.log("Weather transformation finished", "INFO");
    endSection();
}

function runTransformationModule(params, transformation) {
    let msg, confCompletePath;
    const init = params["transform"] === "init" || params["transform-other"] === "init";
    if (typeof transformation === "object") {
        msg = transformation.log;
        confCompletePath = transformation.conf;
    } else {
        confCompletePath = transformation;
    }
    let confPath = path.parse(confCompletePath);
    let confFile = init ? path.join(confPath.dir, confPath.name + "_init" + confPath.ext) : confCompletePath;

    let conf = utils.loadFromJson(confFile);
    modelManager.log(msg ? msg : "Running " + (conf.id ? conf.id : conf.name), "INFO");
    // Enrich input with features - without fit values
    if (params["predict"]) conf["transformation"][0]["params"]["mode"] = "predict";
    pipeline.exec(conf, "transform", undefined, params["models-dst-dir"]);
}

async function transformations(params) {
    if (!params["transform-other"]) return;
    startSection("OTHER TRANSFORMATIONS");
    modelManager.log("Transformations started", "INFO");
    for (const transformation of params.transformations) {
        runTransformationModule(params, transformation);
    }
    endSection();
}

async function predict(model, date, params) {
    startSection("PREDICT");
    let conf = model["rec"]["Conf"];
    let init = params["predict"] === "init";
    if (init) {
        modelManager.log("Input selection", "INFO", model);
        delete conf["input_extraction"]["params"]["search_query"];
    } else if (params["predict"] === "conf") {
        modelManager.log("Input selection using config file", "INFO", model);
    } else {
        // Select record only for given date
        modelManager.log(`Input selection (${utils.keepDate(date).toLocaleDateString()})`, "INFO", model);
        conf["input_extraction"]["params"]["search_query"]["Timestamp"] = utils.keepDate(date);
    }

    modelManager.log("Prediction started", "INFO", model);

    // Predict
    try {
        pipeline.exec(conf, "predict", undefined, params["models-dst-dir"]);
    } catch (error) {
        modelManager.log("Model prediction", "ERROR", model, error);
        throw error;
    }
    modelManager.log("Model prediction completed", "INFO", model);

    // Upload predictions
    if (params["upload"]) {
        try {
            await uploadPredictions(params, model, date);
            modelManager.log("Upload predictions completed", "INFO", model);
        } catch (error) {
            modelManager.log("Upload predictions", "ERROR", model, error);
            throw error;
        }
    }

    endSection();
}

function fit(model, date, params) {
    const init = params["fit"] === "init" || params["prepare-models"] === "replace";
    startSection(init ? "INITIAL FIT - HISTORY" : "FIT");

    let conf = model["rec"]["Conf"];
    if (init) {
        modelManager.log("Input selection", "INFO", model);
        // Remove timestamp filter if exists - filter by other fields
        if (conf["input_extraction"]["params"]["init_use_timestamp"] !== true &&
            "search_query" in conf["input_extraction"]["params"])
            delete conf["input_extraction"]["params"]["search_query"]["Timestamp"];
    } else {
        // Select record only for a given date
        modelManager.log(`Input selection ${date}`, "INFO", model);
        conf["input_extraction"]["params"]["search_query"]["Timestamp"] = date;
    }
    // Checks that "Value" field is not null
    conf["input_extraction"]["params"]["mode"] = "fit";

    try {
        if (init) {
            modelManager.log("Initial fitting started", "INFO", model);
            pipeline.exec(conf, "fit-init", undefined, params["models-dst-dir"]);
        } else {
            modelManager.log("Fitting started", "INFO", model);
            pipeline.exec(conf, "fit", undefined, params["models-dst-dir"]);
        }
    } catch (error) {
        modelManager.log("Model fitting", "ERROR", model, error);
        throw error;
    }

    modelManager.log("Model fitting completed", "INFO", model);
    endSection();
}

function startSection(msg) {
    let len = 71 - msg.length;
    let len1 = len / 2,
        len2 = len1 + (len % 2);
    console.group(
        `${"==============================".substr(0, len1)} ${msg} ${"==============================".substr(0, len2)}`
    );
}

function endSection() {
    console.groupEnd();
    console.log("=========================================================================");
}

async function prepareData(params, date) {
    if (params["update-weather"]) {
        startSection("UPDATE WEATHER");
        try {
            updateWeather(params, date);
        } catch (error) {
            modelManager.log("Update weather", "ERROR", null, error);
            throw error;
        }
        endSection();
    }

    if (params["upload-weather"]) {
        startSection("UPLOAD WEATHER");
        await uploadWeatherQm(params, date).then(() => {
            modelManager.log("Upload weather to QMinerDB finished");
        }).catch(error => {
            modelManager.log("Upload weather to QMinerDB", "ERROR", null, error);
            throw error;
        });

        if (params["upload"] === true) {
            await uploadWeather(params, date).then(() => {
                modelManager.log("Upload weather to MariaDB finished");
            }).catch(error => {
                modelManager.log("Upload weather to MariaDB", "ERROR", null, error);
                throw error;
            });
        }

        // Wait for the weather upload to be completed
        endSection();
    }

    // Download all necessary data
    if (params["update-data"]) {
        startSection("UPDATE DATA");
        await updateData(params, date)
            .then(() => modelManager.log("Download finished", "INFO", null))
            .catch(error => {
                modelManager.log("Download data from MariaDB", "ERROR", null, error);
                throw error;
            });
        endSection();
    }
}

async function prepareModels(params) {
    if (!params["prepare-models"]) return;

    let models;
    startSection("MODEL PREPARATION");
    let exit = error => {
        throw error;
    };

    try {
        modelManager.log(`Preparation of models started (${params["prepare-models"]})`, "INFO");
        if(params["prepare-models"] === "download"){
            models = await modelManager.downloadModels();
        } else {
            models = await modelManager.createModels(params["models"], params["prepare-models"]);
        }
        // <modelsIds> params...
        // Get existing models
        if (models.length === 0) {
            exit(new Error("No models selected to be updated"));
        } else {
            modelManager.log("Models prepared", "INFO");
        }
    } catch (error) {
        modelManager.log("Preparing models", "ERROR", null, error);
        exit(error);
    }

    endSection();
    return models;
}

function uploadPredictions(params, model, date) {
    modelManager.log("Upload predictions", "INFO", model);
    let conf = utils.loadFromJson(PREDICTION_STORE_CONF);

    // Get days offset
    let daysOffset = 1;
    model["rec"]["Conf"]["pipeline"]["extraction"].forEach(extr => {
        if (extr["module"] === "weather_feature_selector") daysOffset = -extr["params"]["forecast_offset"];
    });
    // Return results
    conf["destination"]["query_res"] = true;

    // Prepare destination query
    let queryDst = conf["queries"][0]["query_dst"];
    queryDst["placeholder_mapping"] = [
        // If predict from configuration file use record's Timestamp and not current date as a fixed value
        params["predict"] === "conf" ? "Timestamp" : { mode: "fixed", value: date },
        "IdProduct",
        { mode: "fixed", value: model["rec"]["Name"] },
        { mode: "fixed", value: model["rec"]["Version"] },
        { mode: "fixed", value: daysOffset },
        { mode: "fixed", value: model["rec"]["Conf"]["pipeline"]["model"]["module"] },
        "Value"
    ];

    // Change source path of the model prediction database
    conf["source"]["db_path"] = (params["models-dst-dir"] ? params["models-dst-dir"] : MODELS_FOLDER) + model.getDb();

    let dataLoader = new loader.Loader(conf);
    return dataLoader.run().then(res => {
        if (res.length === 0) {
            modelManager.log("No prediction uploaded to MariaDB", "WARN", model);
        } else {
            modelManager.log(`Uploaded ${res.length} predictions`, "INFO", model);
        }
    });
}

/**
 * @param {Object} params - Configuration parameters.
 */
function run(params) {
    if (params == null || typeof params !== "object")
        throw Error("'params' argument not given or not set properly - " + params);

    const date = params["date"];
    const timerStart = Date.now();

    modelManager = new mm();
    if (params["verbose"]) modelManager.log("Runner params", "INFO", null, params);
    // Prepare data
    return prepareData(params, date)
        .then(() => {
            return weatherTransformations(params, date);
        })
        .catch(error => {
            modelManager.log("Weather transformations failed", "ERROR", null, error);
            throw new Error("Runner failed to finish");
        })
        .then(() => {
            return transformations(params, date);
        })
        .catch(error => {
            if (error.message === "Runner failed to finish") throw error;
            modelManager.log("Transformations failed", "ERROR", null, error);
            throw new Error("Runner failed to finish");
        })
        .then(() => {
            return prepareModels(params);
        })
        .catch(error => {
            if (error.message === "Runner failed to finish") throw error;
            modelManager.log("Prepare models failed", "ERROR", null, error);
            throw new Error("Runner failed to finish");
        })
        .then(async models => {
            if (!(params["fit"] || params["predict"] || params["prepare-models"])) return;
            // Fit/predict on models
            for (const model of models) {
                let modelName = `Model (${model.getId()})`;
                startSection(modelName);
                modelManager.log("Model", "INFO", model);

                if (params["fit"] || params["prepare-models"] === "replace") {
                    fit(model, date, params);
                } else if (params["predict"]) {
                    await predict(model, date, params);
                }

                endSection();
            }
        })
        .then(() => {
            modelManager.log("Runner successfully finished", "INFO");
        })
        .catch(() => {
            modelManager.log("Runner failed to finish", "ERROR");
            process.exitCode = 1;
        })
        .then(() => {
            if (params["report"]) modelManager.getReport(timerStart, true, params["report"]);
            if (params["clear-logs"]) modelManager.clearLogs();
            modelManager.close();
        });
}

function setDefaultValue(argv, defVal, othrArgv = null) {
    return argv != null ? argv : othrArgv != null ? othrArgv : defVal;
}

if (require.main === module) {
    // File path is system dependent
    let newDir = __dirname + "\\..";
    if (process.platform === "linux") {
        newDir = __dirname + "/..";
    }
    console.log("Changing dir to: " + newDir);
    process.chdir(newDir);

    // Set default values of arguments
    let parsedArgs = argv(process.argv.slice(2), {
        boolean: ["report", "clear-logs", "verbose", "v", "r", "upload"],
        string: ["conf", "date", "d", "prepare-data", "update-weather", "upload-weather", "update-data", "config",
            "transform", "transform-weather", "transform-other",
            "prepare-models", "fit", "predict"],
        default: {
            "d": utils.getDateString(YESTERDAY),
            "v": true, "r": true,
            "prepare-data": undefined, "transform": undefined,
            "conf": "./analytics/config/analytics_runner_default.json",
        },
        alias: { "verbose": "v", "report": "r", "date": "d" }
    });
    let params = {};
    // Copy arguments to parameters
    Object.entries(parsedArgs).forEach(([key, val]) => params[key] = val === "" ? true : val);

    // Load configuration file with transformations or use default
    const conf = utils.loadFromJson(params["conf"]);
    params["transformations"] = conf.transformations.other;
    params["weather-transformations"] = conf.transformations.weather;
    params["models-configs-dir"] = conf.models_configs_dir;
    params["models-dst-dir"] = conf.models_dst_dir;
    params["report"] = setDefaultValue(params["report"], params["verbose"]);
    // Prepare data
    params["update-weather"] = setDefaultValue(params["update-weather"], false, params["prepare-data"]);
    params["upload-weather"] = setDefaultValue(params["upload-weather"], false, params["prepare-data"]);
    params["update-data"] = setDefaultValue(params["update-data"], false, params["prepare-data"]);
    // Transformations
    params["transform-weather"] = setDefaultValue(params["transform-weather"], false, params["transform"]);
    params["transform-other"] = setDefaultValue(params["transform-other"], false, params["transform"]);

    // Prepare models
    params["prepare-models"] =
        (params["prepare-models"] != null) ? params["prepare-models"] :
            (params["fit"] === "init") ? "upload" :
                (params["predict"] || params["fit"]) ? "use" : false;

    // Expect paths to model configuration file - currently only config files supported
    params["models"] = utils.extractPaths(parsedArgs["_"].length === 0 ? [params["models-configs-dir"]] :
        parsedArgs["_"]);

    // Check params
    if (params["fit"] || params["predict"] || params["upload"] || params["prepare-models"]) {
        // Models must be given in case of fit/predict/upload/prepare-models
        assert.notStrictEqual(params["models"].length, 0, "No existing model configuration files found.");
    }

    run(params);
}

module.exports = { run };
