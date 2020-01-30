"use strict";

const http = require("http");
const fs = require("fs");
const argv = require("minimist")(process.argv.slice(2));
const express = require("express");
const bodyParser = require("body-parser");
const qm = require("qminer");
const assert = require('assert');

const selector = require("../pipeline/modules/generic_feature_selector");
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

// const sslOptions = {
//      key: fs.readFileSync(serverConf.security.key, "utf8"),
//      cert: fs.readFileSync(serverConf.security.cert, "utf8")
// };

const port = serverConf.port;
const app = express();

// generic_feature_selector parameters
let params = {
    input_db: serverConf.input_db,
    forecast_offset: -1,
    search_query: {
        $from: "EventsFeatures",
        EventFeatureId: "FootballGermany"
    },
    features: [
        "EventsCounts",
        "ArticlesCounts"
    ],
    normalize: "scale",
    output_store: "EventFeats",
    input: {
        primary_key: ["Timestamp"]
    },
    dates: ['2017-1-5','2017-1-6']
};


async function getFeatures(req){
    // Update parameters
    let currParams = JSON.parse(JSON.stringify(params));
    
    // Optional 
    if(req.hasOwnProperty("input_db"))
        currParams['input_db'] = req['input_db'];
    //if(req.hasOwnProperty('normalize'))
    //    currParams['normalize'] = req['normalize'];
    if(req.hasOwnProperty('search_query'))
        currParams['search_query'] = req['search_query'];
    
    // Mandatory
    console.log(req);
    ["forecast_offset", "features", "dates"].forEach(field => {
        assert.ok(req.hasOwnProperty(field), "Field " + field + " missing in the request.");
        currParams[field] = req[field];
    });

    // Prepare input dates
    let base = new qm.Base({ mode: "createClean", dbPath: 'tmpDb' });
    base.createStore({
        name: "Input",
        fields: [
            {
                name: "Timestamp",
                type: "datetime"
            }
        ]
    });
    let inStore = base.store("Input");
    currParams.dates.forEach(x => 
        inStore.push({Timestamp: utils.keepDate(new Date(x))}));
   
    // Select features
    let [features, mapping] = selector.exec(currParams, base);
    
    let res = [];
    base.store(currParams['output_store']).allRecords.each(rec => {
        let tRec = {};
        features.forEach(feat => { tRec[feat.field] = rec[feat.field]; });
        res.push(tRec);
    });
    return res;
}

// Server setup
app.use(bodyParser.json());

app.post("/enrich", async (req, res) => {
    utils.startSection("Enrich request 📈");
    try {
        res.send({
            data: await getFeatures(req.body)
        });
    } catch (e) {
        console.error(e.message);
        res.send(e.message);
    }

    console.log("Finished! 🎉");
    utils.endSection();
});

http.createServer(app).listen(port, () => {
    console.log("🔥 Server is up! Listening on port " + port + "!")
});