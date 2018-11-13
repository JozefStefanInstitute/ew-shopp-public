"use strict";

const qm = require("qminer");
const config = require("../config/config");
const utils = require("../util/utils");
const loader = require("../loader/data_loader");

// Model database
const MODEL_DB = config.paths.manager;
const LOADER_CONF_FOLDER = config.paths.configurations.loader;
const DEFAULT_MODEL_STORE_CONF = LOADER_CONF_FOLDER + "model_store_dupl.json";
const DEFAULT_MODEL_UPDATE_CONF = LOADER_CONF_FOLDER + "model_update.json";
const DEFAULT_MODEL_LOAD_CONF = LOADER_CONF_FOLDER + "model_load.json";

module.exports = class ModelManger {

    constructor(create = false) {
        // Return if already opened
        if (ModelManger.db != null && !create) return;

        // Create new exit handler - close modelManager gracefully
        ModelManger.exitHandler = new utils.ExitHandler([() => { this.close() }]);
        // Create database if does not exist
        this.logCounter = 0;
        if (create || !utils.existsDir(MODEL_DB)) {
            ModelManger.db = new qm.Base({
                mode: "createClean",
                dbPath: MODEL_DB
            });
            // Create local store for all models
            ModelManger.db.createStore([{
                name: "Models",
                fields: [
                    { name: "Name", type: "string" },
                    { name: "Version", type: "string" },
                    { name: "Desc", type: "string" },
                    { name: "Conf", type: "json" }
                ],
                joins: [
                    {
                        name: "hasEvent",
                        type: "index",
                        store: "Logs",
                        inverse: "ofModel"
                    }
                ],
                keys: [
                    {
                        field: "Name",
                        type: "value"
                    },
                    {
                        field: "Version",
                        type: "value"
                    }
                ]
            }, {
                name: "Logs",
                fields: [
                    { name: "N", type: "int" },
                    { name: "Timestamp", type: "datetime" },
                    { name: "Type", type: "string" },
                    { name: "Msg", type: "string" },
                    { name: "ExtendedMsg", type: "string" }
                ],
                joins: [
                    {
                        name: "ofModel",
                        type: "field",
                        store: "Models",
                        inverse: "hasEvent"
                    }
                ],
                keys: [
                    {
                        field: "Type",
                        type: "value"
                    },
                    {
                        field: "N",
                        type: "linear"
                    },
                    {
                        field: "Timestamp",
                        type: "linear"
                    }
                ]
            }]);
        } else {
            ModelManger.db = new qm.Base({
                mode: "open",
                dbPath: MODEL_DB
            });
        }

    }

    close() {
        if (ModelManger.db != null && !ModelManger.db.isClosed())
            ModelManger.db.close();
        ModelManger.exitHandler.close();
    }

    static _getModel(name, version) {
        if (name == null || version == null) return null;
        let model = ModelManger.db.store("Models")
            .allRecords.filterByField("Name", name).filterByField("Version", version);
        // Return first matching record
        return model.length >= 1 ? model[0] : null;
    }

    async _createModel(conf, mode) {
        let name, version;
        // Get name and version of the model from config files
        if (conf["name"] != null && conf["version"] != null) {
            name = conf["name"];
            version = conf["version"];
        } else if (conf["id"]) {
            [name, version] = conf["id"].split(/\Bv([0-9.]+)/);
        } else {
            this.log("'id' or 'name' + 'version' are not defined in configurations", "ERROR");
            return null;
        }

        // Get model stored in local ModelManager database
        let modelRec = ModelManger._getModel(name, version);

        // Model does not exist in the ModelManager database
        if (modelRec == null) {
            // Create new
            let id = ModelManger.db.store("Models").push({
                Name: conf["name"],
                Version: conf["version"],
                Desc: conf["description"],
                Conf: conf
            });
            modelRec = ModelManger.db.store("Models").allRecords.filterById(id, id)[0];
        }

        // Wrap model and push to shared database
        let model = new Model(modelRec, conf, mode);
        await model.pushModel(modelRec == null ? "upload" : mode, ModelManger.db);
        return model;
    }

    async createModels(confs, mode) {
        let models = [];
        for (const confPath of confs) {
            let conf = Model.getConf(confPath);
            if (conf) {
                let model = await this._createModel(conf, mode);
                if (model) models.push(model);
            } else {
                this.log("Model creation", "ERROR", null, `Model configuration file '${confPath}' does not exist.`);
            }
        }
        return models;
    }

    async downloadModels() {
        let models = [];
        await this._downloadModels(true);
        let modelsRec = ModelManger.db.store("Models").allRecords;
        for (let i = 0; i < modelsRec.length; i++) {
            models.push(new Model(modelsRec[i]));
        }
        return models;
    }

    async _downloadModels(clean = true) {
        this.log("Download model's configurations from shared database.");
        let conf = utils.loadFromJson(DEFAULT_MODEL_LOAD_CONF);
        conf["destination"]["query_res"] = true;

        if (clean) {
            this.log("Clear model's configurations from local ModelManager database.");
            ModelManger.db.store("Models").clear();
        }

        let dataLoader = new loader.Loader(conf, false);
        dataLoader.setSrc(conf["source"]);
        dataLoader.setDstWithHandle(conf["destination"], ModelManger.db);

        return dataLoader.run(false, true).then(res => {
            if (res.length > 0) {
                console.log(`Downloaded ${res.length} model's configurations.`);
            } else {
                console.log("No model's configurations to download.");
            }
        });
    }

    /**
     * LOGGING
     * */
    log(msg, type = "INFO", model = null, extendedMsg = "") {
        // Print log
        const print = (type === "ERROR") ? msg => console.error(msg) : msg => console.log(msg);
        print(`[${type}] ${msg}`);

        // Format extended message
        if (extendedMsg !== "") {
            if (typeof extendedMsg !== "string" && "message" in extendedMsg)
                extendedMsg = extendedMsg.message;
            if (typeof extendedMsg === "object")
                extendedMsg = JSON.stringify(extendedMsg, null, 4);
            print(`   ${extendedMsg}`);
        }

        // Store log
        let rec = {
            N: this.logCounter++,
            Timestamp: Date.now(),
            Type: type,
            Msg: msg,
            ExtendedMsg: extendedMsg
        };

        let id = ModelManger.db.store("Logs").push(rec);
        if (model) ModelManger.db.store("Logs")[id].$addJoin("ofModel", model.rec);
    }

    getReport(date, lastRun = true, verbose = true) {
        let day = lastRun ? new Date(date) : utils.keepDate(new Date(date));
        let dateString = day.toDateString();
        console.log(`\n======================= REPORT (${dateString}) ========================`);

        let recs = ModelManger.db.store("Logs").allRecords
            .filterByField("Timestamp", day.getTime(), utils.addDays(day, 1).getTime());

        if (recs.length > 0) {
            recs.sortByField("Timestamp", 1);
            recs.each(rec => {
                console.log(`[${rec.Type}] [${new Date(rec.Timestamp).toLocaleString()}]` +
                    `${rec.ofModel != null ? ` [${Model.getId(rec.ofModel)}]` : ""} : ${rec.Msg}`);
                if (verbose && rec.ExtendedMsg !== "") {
                    console.group();
                    console.log(`${rec.ExtendedMsg}`);
                    console.groupEnd();
                }
            });
        } else {
            console.log(`Could not find events for ${day}`);
        }

        console.log("=========================================================================");
    }

    clearLogs() {
        this.logCounter = 0;
        ModelManger.db.store("Logs").clear(ModelManger.db.store("Logs").length);
    }

    static getLastLogs(n = 3) {
        // Return logs ordered by Timestamp and sequential log number.
        // Can't sort by two fields in the same search query
        return ModelManger.db.search({
            "$from": "Logs",
            "$sort": { "Timestamp": -1 },
            "$limit": n
        }).sortByField("N", -1);
    }

};


class Model {

    constructor(rec, conf = null, mode) {
        // Model exists
        if (rec == null) throw Error("Can't construct Model without record in the ModelManager database");
        // Wrap Qminer attributes
        this.rec = rec;
        if (mode === "use" || mode === "download") {
            console.log(`Model ${this.getId()} already exists in the database.`);
        } else if (mode === "update" || mode === "update-locally") {
            // Update locally
            this.rec.Name = conf["name"];
            this.rec.Version = conf["version"];
            this.rec.Desc = conf["description"];
            this.rec.Conf = conf;
        }
    }

    getId() {
        return this.rec.Name + "v" + this.rec.Version;
    }

    getDb() {
        return this.getId() + "/db";
    }

    /**
     *  Push model's configurations from local ModelManager QminerDB to arbitrary defined shared database.
     * @param {("upload"|"update")} mode - Mode how to push models configurations to shared database
     * @param {qm.Base} srcDb - Source Qminer database
     * */
    async pushModel(mode, srcDb) {
        if (!(mode === "upload" || mode === "update")) return;

        // Read loader configuration to upload/update local models
        let conf = utils.loadFromJson(mode === "upload" ? DEFAULT_MODEL_STORE_CONF : DEFAULT_MODEL_UPDATE_CONF);
        conf["destination"].query_res = true;
        // Set query to look for the right model
        conf["queries"][0]["query_src"]["Name"] = this.rec.Name;
        conf["queries"][0]["query_src"]["Version"] = this.rec.Version;

        // Set Loader
        let dataLoader = new loader.Loader(conf, false);
        dataLoader.setDst(conf["destination"]);
        dataLoader.setSrcWithHandle(conf["source"], srcDb);

        return dataLoader.run(true, false).then(res => {
            console.log(`Model ${this.rec.Name}v${this.rec.Version}` + `${res.length === 1 ? "" : "was not"} ${mode ===
            "update" ? "updat" : mode}ed successfully.`);
        });
    }

    static getId(model) {
        return model.Name + "v" + model.Version;
    }

    static getConf(confFilePath) {
        if (!utils.existsFile(confFilePath)) {
            console.log(`Model configuration file '${confFilePath}' does not exist.`);
            return null;
        }
        return utils.loadFromJson(confFilePath);
    }
}