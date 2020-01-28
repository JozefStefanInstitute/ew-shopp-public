"use strict";

const https = require("https");
const fs = require("fs");
const argv = require("minimist")(process.argv.slice(2));
const express = require("express");
const bodyParser = require("body-parser");
const qm = require("qminer");

const runner = require("../pipeline/pipeline_runner");
const utils = require("../util/utils");


if (argv.c) {
    console.log("Reading configuration data from: " + argv.c);
} else {
    console.log("USAGE:");
    console.log("  -c : path to server configuration file");
    process.exit(1);
}

// Server's setting
const serverConfFile = new qm.fs.FIn(argv.c);
const serverConf = JSON.parse(serverConfFile.readAll());

const sslOptions = {
    key: fs.readFileSync(serverConf.security.key, "utf8"),
    cert: fs.readFileSync(serverConf.security.cert, "utf8")
};

const port = serverConf.port;
const app = express();

// Model's settings
const MODELS_DIR = "../data/models/";
let pipelinePath;
if (utils.existsDir(serverConf.pipeline)) {
    pipelinePath = serverConf.pipeline;
} else if (utils.existsDir(MODELS_DIR + serverConf.pipeline)) {
    pipelinePath = MODELS_DIR + serverConf.pipeline;
} else {
    throw new Error("💥 Path to model '" + serverConf.pipeline + "'does not exist!");
}
console.log("Using model '"+pipelinePath+"'!");
let baseIn;


async function openInputDatabase(path) {
    if (baseIn == null || baseIn.isClosed()) {
        if (!utils.existsDir(path)) {
            baseIn = new qm.Base({ dbPath: path + "/db" });
            console.warn("⚠ Input extraction base '" +
                path + "' does not exist! Using model's database!");
        } else {
            baseIn = new qm.Base({ dbPath: path });
            console.log("Input extraction base found!");
        }
    } else {
        console.log("Input already opened!");
    }
}


async function getInputStoreName(base, params) {
    // Get input extraction store name
    let storeNameIn;
    if (params.store) {
        storeNameIn = params.store
    } else if (params.search_query && params.search_query.$from) {
        storeNameIn = params.search_query.$from;
    } else {
        throw new Error("💥 Cannot extract store name from input extraction base!");
    }

    if (!base.isStore(storeNameIn)) {
        throw new Error("💥 Store '" + storeNameIn + "' does not exist in QMiner database '" + base + "'!");
    }
}


async function getSearchQuery(storeName, requestParams) {
    let inputRecords = [];
    // Filter interested records with keys
    let query = { $from: storeName };
    if (requestParams.search_query) {
        // Use search query if given
        query = requestParams.search_query;
        inputRecords = baseIn.search(requestParams.search_query);
    } else {
        const requestRecords = requestParams.records.InputFeat;
        const requestRecordKeys = Object.keys(requestRecords[0]);

        if (requestRecords[0] && requestRecordKeys.length === 1) {

            // If simple private key construct search query
            const key = requestRecordKeys[0];
            query[key] = { $or: [] };
            requestRecords.forEach(record => query[key].$or.push(record[key]));
            inputRecords = baseIn.search(query);

        } else {

            // Else filter record by record
            const query = { $from: storeName };
            requestRecords.forEach(record => {
                Object.keys(record).forEach(key => query[key] = record[key]);
                let foundRecord = baseIn.search(query);
                if (foundRecord) inputRecords.push(foundRecord);
            });

        }
    }

    if (inputRecords.length === 0) {
        throw new Error("💥 No records found with given search query!");
    }
    return query;
}


async function updatePipelineConfig(pipelineConfig, serverConfig, requestParams) {

    // If input extraction base does not exist any more use model base!
    const inputExtractionParams = pipelineConfig.input_extraction.params;
    const baseInPath = requestParams.input_db || inputExtractionParams.input_db;
    await openInputDatabase(baseInPath);
    let storeNameIn = await getInputStoreName(baseIn, inputExtractionParams);
    let query = await getSearchQuery(storeNameIn, requestParams);

    // Update pipeline configuration file to use final search query
    delete pipelineConfig.mode;
    pipelineConfig.input_extraction.params.search_query = query;
    pipelineConfig.input_extraction.params.keep_alive_db = true;

    return pipelineConfig;
}


function getModelScheme(base, stores) {

    const schema = [];
    stores.forEach(storeName => {
        schema.push({
            name: storeName,
            fields: base.store(storeName).fields.map((field) => {
                return {
                    name: field.name,
                    type: field.type,
                    null: field.nullable
                }
            }).filter(field => !field.internal && field.name !== "Value"),
            keys: base.store(storeName).toJSON().keys.map(key => {
                return { field: key.keyName, type: key.keyValue ? "value" : "linear" };
            })
        })
    });

    return schema;
}


async function getPredictions(req) {
    let queryBase = undefined, mode = "predict";
    let pipelineConfig = utils.loadFromJson(pipelinePath + "/pipeline-fit-init.json");
    if (req.body.data.search_query) {

        // Prediction with search query
        console.log("Get predictions using search query! 🔎 ");
        pipelineConfig = await updatePipelineConfig(pipelineConfig, serverConf, req.body.data);

    } else {

        // Prediction with feature space and input records
        console.log("Get predictions using feature space! 🌌");

        mode = "predict-active";
        const modelBase = new qm.Base({ dbPath: pipelinePath + "/db" });
        queryBase = new qm.Base({
            mode: "createClean",
            dbPath: "queryDb",
            schema: getModelScheme(modelBase, ["FtrSpace", "InputFeat"])
        });

        const records = req.body.data.records;
        for (let storeName of Object.keys(records)) {
            records[storeName].forEach(rec => queryBase.store(storeName).push(rec));
        }

    }

    console.group("Running predictions 💤 ... ");
    let predictions = await runner.exec(pipelineConfig, mode, queryBase);
    predictions = predictions.map(({$id, ...keepAttrs}) => keepAttrs);
    console.groupEnd();

    return predictions;
}


app.use(bodyParser.json());


app.get("/schema", async (req, res) => {
    utils.startSection("Schema request 🔎 ");
    console.log("Retrieving model's schema ...");

    try {
        const modelBase = new qm.Base({ dbPath: pipelinePath + "/db" });
        res.send({ data: { scheme: getModelScheme(modelBase, ["FtrSpace", "InputFeat"]) } });
    } catch (e) {
        console.error(e.message);
        res.send(e.message);
    }

    console.log("Finished! 🎉 ");
    utils.endSection();
});


app.post("/predict", async (req, res) => {
    utils.startSection("Predict request 📈");
    try {
        res.send({
            data: await getPredictions(req)
        });
    } catch (e) {
        console.error(e.message);
        res.send(e.message);
    }

    console.log("Finished! 🎉");
    utils.endSection();
});


https.createServer(sslOptions, app).listen(port, () => {
    console.log("🔥 Server is up! Listening on port " + port + "!")
});