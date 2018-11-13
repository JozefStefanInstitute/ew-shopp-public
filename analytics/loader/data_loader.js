"use strict";

const qm = require("qminer");
/** @type {Object} * @property {Function} FIn */
const fs = qm.fs;
const nodeFs = require("fs");
const arangoDb = require("arangojs").Database;
const mysql = require("mysql");

/** @type {Object} *
 *  @property {string} d - path to configuration JSON */
const argv = require("minimist")(process.argv.slice(2));
const utils = require("../util/utils");

/**
 * @class Handle
 * @property {Object} conf - The configurations for creating a handle to the database connection or CSV file.
 * @property {('Source'|'Destination')} direction - Storing/loading the data.
 * @property {Array} promises - Store of all async operations when querying database.
 * @property {number} affectedRecords - Number of affected records in the execution.
 * @property {string} name - Name of the handle.
 */
class Handle {
    constructor(conf, direction) {
        this.conf = conf;
        this.direction = direction;
        this.promises = [];
        this.affectedRecords = 0;
        this.verbose = conf.verbose;
        this.name = undefined;
        this.returnQueryRes = !!conf["query_res"];
        if (this.returnQueryRes) this.results = [];
    }

    setQueryDst(dstDb, queries) {
        this.dstDb = dstDb;
        // Create stores if QminerDB is a destination
        if (dstDb.conf.type === "QminerDB") {
            dstDb.initStores(queries);
        }
    }

    checkQuery(query_src, usePlaceholders = false) {
        if (query_src == null) {
            console.error(`Parameter 'query_dst' must be defined to store to ${this.name}.`);
            return false;
        }

        if (query_src.query == null) {
            console.error(`Parameter 'query' must be defined to store to ${this.name}.`);
            return false;
        }

        if (usePlaceholders && query_src.placeholder_mapping == null) {
            console.error("Parameter 'placeholder_mapping' must be defined to map values.");
            return false;
        }
        return true;
    }

    logQuery(query) {
        console.log(`Executing query ${JSON.stringify(query, null, 4)} on ${this.name}.`);
    }

    log() {
        Handle.log(this.direction, this.name);
        if (this.direction === "Destination") {
            console.log(`   Affected ${this.affectedRecords} records.`);
            Handle.log("");
        } else if (this.direction === "Source") {
            console.log(`   Queried  ${this.affectedRecords} record${this.affectedRecords === 1 ? "." : "s."}`);
        }
    }

    static log(mode, name = "") {
        switch (mode) {
            case "Source":
                console.log("================================ RESULTS ================================");
                console.log(`=== Source (${name}) ===`);
                break;
            case "Destination":
                console.log(`=== Destination (${name}) ===`);
                break;
            case "Initial":
                console.log("============================= INITIAL STATE =============================");
                break;
            case "Querying":
                console.log("================================ QUERYING ===============================");
                break;
            default:
                console.log("=========================================================================");
        }
    }

    static removeNonAscii(obj) {
        let keys = Object.keys(obj);
        for (let i = 0; i < keys.length; i++) {
            let oldKey = keys[i];
            let newKey = oldKey.replace(/[^\x00-\x7F]/g, "");
            if (oldKey !== newKey) {
                obj[newKey] = obj[oldKey];
                delete obj[oldKey];
            }
        }
    }
}

//======================================================================================================================
// ARANGODB DATABASE HANDLE
//======================================================================================================================
/**
 * Class to connect to ArangoDB and performs queries.
 * @class ArangoDBHandle
 * @extends Handle
 * @property {Object} db - Database instance as described in
 * {@link https://docs.arangodb.com/devel/Drivers/JS/Reference/Database/}.
 * @property {Function} db.useBasicAuth - To use ArangoDB with authentication.
 * @property {Function} db.useDatabase - Updates the Database instance and its connection string to
 * use the given databaseName, then returns itself.
 */
class ArangoDBHandle extends Handle {
    constructor(conf, direction) {
        super(conf, direction);
        this.db = new arangoDb({
            url: conf.host
        });

        this.db.useBasicAuth(conf.user, conf.password);
        this.db.useDatabase(conf.database);
        this.name = `ArangoDB [${conf.database}, ${conf.host}]`;
        console.log(`${direction}: ${this.name}`);
    }

    close() {
        return Promise.all(this.promises).then(() => {
            return new Promise(() => {
                this.log();
            });
        });
    }

    storeFn(queryParams, expectAllrecords = false) {
        const processQueryErrFn = this.processDocumentsError();
        const processQueryFn = (res) => {
            this.affectedRecords += res.extra.stats.writesExecuted;
        };
        this.queryMapping(queryParams.mapping);

        let processRecFn = (rec, query) => {
            // Prepare values
            let values = query.placeholder_mapping.map(key => {
                let value;
                if (typeof this.mapping[key] === "object" && this.mapping[key].type != null) {
                    value = QminerDBHandle.processTypes(this.mapping[key].type, rec[key]);
                } else {
                    value = rec[key];
                }
                return `"${value}"`;
            });

            let queryStr = query.query;
            // Replace all '?' with values
            values.forEach(val => (queryStr = queryStr.replace("?", val)));

            // Execute query
            this.logQuery(queryStr);
            this.promises.push(
                this.db
                    .query(queryStr)
                    .then(processQueryFn, processQueryErrFn)
                    .catch(e => console.error("Failed execute query: ", e))
            );
        };
        // Return callback function
        if (expectAllrecords) {
            return (recs, query = null) => {
                if (!this.checkQuery(query, true)) return -1;
                recs.each(rec => processRecFn(rec, query));
            };
        } else {
            return (recs, query = null) => {
                if (!this.checkQuery(query, true)) return -1;
                processRecFn(recs, query);
            };
        }
    }

    async queryAll(queries) {
        for (let queryParams of queries) {
            if (!queryParams.use_query) continue;

            // Prepare destination store function
            let storeFn = this.dstDb.storeFn(queryParams, false);
            await this.query(queryParams, storeFn);
            if (this.dstDb.upload) await this.dstDb.upload();
        }
    }

    query(queryParams, storeFn) {
        const processDocumentsFn = this.processDocuments(storeFn);
        const processDocumentsErrFn = this.processDocumentsError();

        if (queryParams.query_src != null && queryParams.query_src.query != null) {
            // Query is given - execute
            let queryStr = queryParams.query_src.query;
            this.logQuery(queryStr);
            return this.db
                .query(queryStr)
                .then(processDocumentsFn, processDocumentsErrFn)
                .catch(e => console.error("Failed to execute query: ", e));
        } else {
            // No query is given - load all and use 1-to-1 mapping
            console.log("Parameter 'query' in 'query_src' is not defined. Using 'name' of a query as " +
                "a collection name to get all documents from database.");

            let collections = this.db.collection(queryParams.name);
            return collections
                .all()
                .then(processDocumentsFn, processDocumentsErrFn)
                .catch(e => console.error("Failed to execute query: ", e));
        }
    }

    queryMapping(qMap) {
        this.mapping = {};
        if (qMap == null) return;
        qMap.forEach(store => Object.assign(this.mapping, store.fields));
    }

    processDocuments(storeFn) {
        return cursor => {
            this.affectedRecords += cursor.extra.stats.scannedFull;
            cursor.each(doc => {
                storeFn(doc);
            });
        };
    }

    processDocumentsError() {
        return err => console.error("Failed to execute query: ", err.response.body.errorMessage);
    }

    getQueryResults() {
        return Promise.all(this.promises).then(() => {
            return this.results;
        });
    }
}

//======================================================================================================================
// MARIADB DATABASE HANDLE
//======================================================================================================================
/**
 * Class to connect to MariaDB and performs queries.
 * @class MariaDBHandle
 * @extends Handle
 * @property {Object} db - Database instance/connection as described in
 * {@link https://github.com/mysqljs/mysql#establishing-connections}.
 */
class MariaDBHandle extends Handle {
    constructor(conf, direction) {
        super(conf, direction);

        this.db = mysql.createPool({
            connectionLimit: 20,
            host: conf.host,
            user: conf.user,
            port: conf.port ? conf.port : 3306,
            password: conf.password,
            database: conf.database,
            acquireTimeout: 60000,
            connectTimeout: 60000
        });
        this.recs = [];
        this.name = "MariaDB [" + conf.host + "]";
        console.log(direction + ": " + this.name);
    }

    close() {
        return Promise.all(this.promises).then(() => {
            return new Promise(resolve => {
                this.log();
                this.db.end(resolve);
            });
        });
    }

    getPlaceholdersValues(rec, placeholderMap) {
        return placeholderMap.map(key => {
            // Extended
            if (rec == null) {
                return key["value"];
            }

            let value;
            if (typeof key === "object") {
                if (key["mode"] === "fixed") {
                    value = key["value"];
                } else {
                    // Get value
                    value = rec[key];
                }
            } else {
                // Get value
                value = rec[key];
            }

            // Empty strings
            if (value === "") return null;

            // Use number as value
            if (!isNaN(parseFloat(value)) && isFinite(value)) return value;

            // Format date from JS Date to MySql Date
            let date = new Date(value);
            if (date.toString() !== "Invalid Date" && !isNaN(date)) {
                value = date.toLocaleString();
            }
            // JSON - Stringify object
            if (typeof value === "object") {
                value = JSON.stringify(value);
            }

            return value;
        });
    }

    storeFn(schemas, expectAllRecords = false) {
        return (recs, query = null) => {
            if (!this.checkQuery(query, true)) return -1;
            let processRecFn = rec => {
                this.recs.push(
                    new Promise(resolve => {
                        let values = this.getPlaceholdersValues(rec, query.placeholder_mapping);
                        this.i = 0;
                        resolve([values, query]);
                    })
                );
            };

            if (expectAllRecords) {
                recs.each(processRecFn);
            } else {
                processRecFn(recs);
            }
        };
    }

    async upload() {
        await Promise.all(this.recs).then(recs => {
            return new Promise(resolve => {
                for (let rec of recs) {
                    this.promises.push(
                        new Promise(resolve => {
                            let [values, query] = rec;
                            this.db
                                .query(query.query, values)
                                .on("error", error => {
                                    if (error.code === "ER_DUP_ENTRY") {
                                        // Ignore duplicate error
                                    } else {
                                        throw error;
                                    }
                                })
                                .on("result", row => {
                                    this.i++;
                                    if (this.i > 0 && this.i % 100 === 0) {
                                        utils.showProgress("Record " + this.i);
                                    }
                                    if (this.returnQueryRes) {
                                        this.results.push(row);
                                    }
                                    this.affectedRecords += row.affectedRows;
                                })
                                .on("end", () => {
                                    resolve(this.affectedRecords);
                                });
                        })
                    );
                }
                resolve();
            });
        });
    }

    async queryAll(queries) {
        for (let queryParams of queries) {
            if (!queryParams.use_query) continue;
            let storeFn = this.dstDb.storeFn(queryParams, false);
            await this.query(queryParams, storeFn);
        }
    }

    query(queryParams, storeFn) {
        let queryStr;
        if (queryParams.query_src != null && queryParams.query_src.query != null) {
            queryStr = queryParams.query_src.query;
        } else {
            console.error("Parameter 'query_src' or parameter 'query' not defined. Using default query " +
                `'SELECT * FROM ${queryParams.name}'`);
            queryStr = "SELECT * FROM " + queryParams.name;
        }
        let i = 0;
        return new Promise((resolve, reject) => {
            this.logQuery(queryStr);
            this.i = 0;
            this.db.getConnection((error, connection) => {
                if (error) {
                    console.log(error);
                    reject(error);
                    throw error;
                }

                let streamQuery = connection.query(queryStr);

                streamQuery
                    .on("error", error => {
                        reject(error);
                    })
                    .on("result", row => {
                        storeFn(row);
                        i++;
                        if (queryParams["return_value"]) this.result.push(row);
                        if (i > 0 && i % 100 === 0) {
                            utils.showProgress("Record " + i);
                        }
                    })
                    .on("end", () => {
                        connection.release();
                        this.affectedRecords += i;
                        utils.showProgress("");
                        resolve(this.affectedRecords);
                    });
            });
        }).catch(e => console.error("Failed to execute query: ", e.sqlMessage));
    }

    getQueryResults() {
        return Promise.all(this.promises).then(() => {
            return this.results;
        });
    }
}

//======================================================================================================================
// CSV HANDLE
//======================================================================================================================
/**
 * Class to handle CSV files and processes all lines.
 * @class CSVHandle
 * @extends Handle
 * @property {string} dir - Directory with CSV files.
 * @property {string} filename - Filename of global CSV file - used when not defined in a specific query.
 * @property {string} hasGlobalFile - Flag if global CSV file is set.
 * @property {string} delimiter='\t' - Column delimiter.
 * @property {boolean} hasHeader=true - Pass true for CSV files with header.
 * @property {number} allAffectedRecords - Number of all process lines.
 * @property {Set} csvs - Set of all processed CSV files.
 */
class CSVHandle extends Handle {
    constructor(conf, direction) {
        super(conf, direction);
        this.dir = conf.dir ? conf.dir : "";
        this.customFn = conf.customFn ? conf.customFn : null;
        this.filename = this.dir + (conf.filename ? conf.filename : "");
        this.hasGlobalFile = this.filename && utils.existsFile(this.filename);
        this.delimiter = conf.delimiter != null ? conf.delimiter : "\t";
        this.hasHeader = conf.hasHeader != null || conf.hasHeader;
        this.name = "CSV [" + this.filename + "]";
        this.allAffectedRecords = 0;
        this.allReadLines = 0;
        this.csvs = new Set();
        console.log("Global " + direction + ": " + this.name);
    }

    close() {
        return Promise.all(this.promises).then(() => {
            this.log();
        });
    }

    static storeFn() {
        throw Error("Storing records to CSV files is currently not supported");
    }

    async queryAll(queries) {
        for (let queryParams of queries) {
            if (!queryParams.use_query) continue;

            try {
                let file = this.openFile(queryParams);
                let storeFn = this.getStoreFn(queryParams);
                if (storeFn == null) continue;
                let filterFn = this.getFilterFn(queryParams);
                await this.query(queryParams, file, storeFn, filterFn);
                if (this.dstDb.upload) await this.dstDb.upload();
            } catch (error) {
                throw error;
            }
        }
        // Wait for destination to finish
        await Promise.all(this.dstDb.promises);
    }

    query(queryParams, file, storeFn, filterFn) {
        return new Promise((resolve, reject) => {
            if (queryParams["use_read_csv_lines"] == null || queryParams["use_read_csv_lines"] === true) {
                return this.readCsvLines(queryParams, file, storeFn, filterFn, resolve, reject);
            } else {
                return this.readCsvLinesIter(queryParams, file, storeFn, filterFn, resolve, reject);
            }
        })
            .then(res => {
                this.allAffectedRecords += res.affectedRecords;
                this.allReadLines += res.readLines;

                this.closeFile(file);
            })
            .catch(e => console.error("Failed to read line: ", e));
    }

    readCsvLines(queryParams, file, storeFn, filterFn, resolveFn, rejectFn) {
        let nAffectedRecords = 0;
        let nSkippedRecords = 0;
        let nReadLines = 0;
        console.log(file.name);
        return fs.readCsvLines(file.descriptor, {
            delimiter: this.delimiter,
            skipLines: this.hasHeader ? 1 : 0,
            onLine: lineVals => {
                let rec = this.createRec(lineVals);
                if (filterFn(rec)) {
                    let res = storeFn(rec, queryParams.query_dst);
                    if (res === -1) {
                        return rejectFn("Error while reading lines.");
                    }
                    if (queryParams["return_value"]) this.result.push(res);
                    nReadLines += 1;
                    nAffectedRecords += res;
                }
                nSkippedRecords += 1;
                if (nReadLines % 1000 === 0) {
                    utils.showProgress(nReadLines);
                }
            },
            onEnd: err => {
                utils.showProgress("");
                if (err) {
                    console.log("!!! QMiner error");
                    return rejectFn(err);
                } else {
                    return resolveFn({
                        readLines: nReadLines,
                        affectedRecords: nAffectedRecords,
                        skippedRecords: nSkippedRecords - nAffectedRecords
                    });
                }
            }
        });
    }

    readCsvLinesIter(queryParams, file, storeFn, filterFn, resolveFn, rejectFn) {
        let nAffectedRecords = 0;
        let nSkippedRecords = 0;
        let nReadLines = 0;
        console.log(file.name);
        file = file.descriptor;
        try {
            while (!file.eof) {
                let line = file.readLine();
                let lineVals = line.split(this.delimiter);

                let rec = this.createRec(lineVals);
                if (filterFn(rec)) {
                    let res = storeFn(rec, queryParams.query_dst);
                    if (res === -1) {
                        return rejectFn("Error while reading lines.");
                    }
                    nReadLines += 1;
                    nAffectedRecords += res;
                }
                nSkippedRecords += 1;
                if (nReadLines % 1000 === 0) {
                    utils.showProgress(nReadLines);
                }
            }
            utils.showProgress("");
            return resolveFn({
                readLines: nReadLines,
                affectedRecords: nAffectedRecords,
                skippedRecords: nSkippedRecords - nAffectedRecords
            });
        } catch (e) {
            return rejectFn(e);
        }
    }

    prepareHeader(file, queryParams) {
        this.hasHeader = queryParams.hasHeader == null || queryParams.hasHeader === true;
        this.header = [];
        if (this.hasHeader) {
            // Remember header indices
            let cols = file.readLine();
            cols = cols.split(this.delimiter);
            let i = 0;
            for (const col of cols) {
                // Remove non-ascii characters
                this.header[i++] = col.replace(/[^\x00-\x7F]/g, "");
            }
            this.hasHeader = false;
        }
    }

    openFile(queryParams) {
        let filename = this.dir + (queryParams.filename ? queryParams.filename : "");
        if (queryParams.filename && filename && nodeFs.existsSync(filename)) {
            this.localFile = true;
        } else if (this.hasGlobalFile) {
            this.localFile = false;
            filename = this.filename;
            console.log(`Local query's CSV file not defined. Using global CSV source file '${filename}'.`);
        } else {
            throw Error(`CSV file '${this.hasGlobalFile ? filename : this.filename}'` +
                "not given or does not exist. Exiting ...");
        }

        this.csvs.add(filename);
        let file = fs.openRead(filename);

        this.prepareHeader(file, queryParams);
        return { descriptor: file, name: filename };
    }

    closeFile(file) {
        file.descriptor.close();
        this.localFile = false;
    }

    getFilterFn(queryParams) {
        return queryParams.query_src != null && queryParams.query_src.filter_fn != null && this.customFn != null
            ? this.customFn[queryParams.query_src.filter_fn]
            : () => true;
    }

    getStoreFn(queryParams) {
        if (queryParams.query_src != null && queryParams.query_src.read_line_fn != null) {
            // Use custom function to read/store lines
            let customFnName = queryParams.query_src.read_line_fn;
            let customFnArgs = queryParams.query_src.read_line_fn_args;
            this.createRec = vals => vals;
            if (this.customFn[customFnName].length === 1) {
                const storeFn = this.dstDb.storeFn(queryParams, false);
                if (storeFn == null) return null;

                return (rec, query_dst) => {
                    // Custom function returns record, which is passed to store function
                    let actRec = this.customFn[customFnName](rec, ...customFnArgs);
                    if (actRec) {
                        storeFn(actRec, query_dst);
                    }
                    return actRec;
                };
            } else if (this.customFn[customFnName].length >= 2) {
                return rec => {
                    // Custom function gets destination database and it should store the record
                    return this.customFn[customFnName](this.dstDb.db, rec, ...customFnArgs);
                };
            }
        } else {
            this.createRec = vals => {
                let i = 0,
                    rec = {};
                for (const val of vals) {
                    rec[this.header[i++]] = val;
                }
                return rec;
            };
            const storeFn = this.dstDb.storeFn(queryParams, false);
            if (storeFn == null) return null;
            return (rec, query_dst) => {
                storeFn(rec, query_dst);
                return 1;
            };
        }
    }

    log() {
        if (this.csvs.size === 1) {
            Handle.log(this.direction, this.name);
        } else {
            Handle.log(this.direction, this.csvs.size + " CSVs");
        }
        if (this.allAffectedRecords)
            console.log(`   Affected ${this.allAffectedRecords} record${this.allAffectedRecords === 1 ? "." : "s."}`);
        if (this.allReadLines) console.log(`   Read ${this.allReadLines} line${this.allReadLines === 1 ? "." : "s."}`);
    }
}

//======================================================================================================================
// QMINER DATABASE HANDLE
//======================================================================================================================
/**
 * Class to handle Qminer database.
 * @class QminerDBHandle
 * @extends Handle
 * @property {Object} db - Database instance as described in
 * [Qminer base constructor]
 * {@link https://rawgit.com/qminer/qminer/master/nodedoc/module-qm.html#~BaseConstructorParam}.
 * @property {Function} processTypes - Type conversion from Qminer types to JavaScript types - used for mapping.
 */
class QminerDBHandle extends Handle {
    constructor(conf, direction) {
        super(conf, direction);
        let qmConf = {
            mode: conf.mode ? (conf.mode === "extend" ? "open" : conf.mode) : "openReadOnly",
            dbPath: conf.db_path
        };

        if (direction === "Source" && (qmConf.mode === "create" || qmConf.mode === "createClean")) {
            console.error("Qminer database is set as source and access mode must be set to 'open' or 'openReadOnly'!");
            if (this.dstDb) this.dstDb.close();
            process.exit(1);
        }

        if (!conf["db"]) {
            this.db = new qm.Base(qmConf);
        } else {
            // Use existing handle
            qmConf["mode"] = "open";
            this.db = conf["db"];
        }

        this.name = "QminerDB [" + qmConf.dbPath + ", " + qmConf.mode + "]";
        console.log(direction + ": " + this.name);
    }

    close() {
        return Promise.all(this.promises).then(() => {
            this.log();
            this.db.close();
        });
    }

    initStores(queries) {
        // Create all stores at once - needed in case of joins
        if (this.verbose) {
            Handle.log("Initial");
            this.log();
        }
        let stores = [];
        for (let queryParams of queries) {
            if (!queryParams.use_schema) continue;
            let schema = utils.toArray(queryParams.schema);
            stores = [...stores, ...schema];
        }

        // Create new store if requested
        if (this.conf.mode === "createClean" || this.conf.mode === "extend") {
            if (stores.length > 0) {
                this.db.createStore(stores);
                if (this.verbose) {
                    console.log("Created stores: ", JSON.stringify(stores, null, 4));
                    Handle.log("");
                }
            } else {
                console.log("No stores created.");
            }
        }
    }

    async queryAll(queries) {
        for (let queryParams of queries) {
            if (!queryParams.use_query) continue;

            let storeFn = this.dstDb.storeFn(queryParams, true);
            await this.query(queryParams, storeFn);
            if (this.dstDb.upload) await this.dstDb.upload();
        }
    }

    query(queryParams, storeFn) {
        if (queryParams.query_src === undefined || queryParams.query_src === "") {
            console.error("Parameter 'query_src' must be provided for QminerDB.");
            return;
        }
        let queryStr = queryParams.query_src;
        return new Promise((resolve, reject) => {
            this.logQuery(queryStr);
            let recs = this.db.search(queryStr);
            if (recs === null || recs.length === 0) {
                return reject(new Error("No records given by query."));
            }
            // Call store function of a destination database
            storeFn(recs, queryParams.query_dst);
            if (queryParams["return_value"]) this.result.push(recs);
            return resolve(recs);
        }).then(res => {
            this.affectedRecords += res.length;
        }).catch(error => {
            throw error;
        });
    }

    getQueryResults() {
        return Promise.all(this.promises).then(() => {
            return this.results;
        });
    }

    storeFn(queryParams, expectAllRecords = false) {
        if (queryParams.mapping) {
            // Get all available data for each field in the schema
            this.getSchemaInfo(queryParams, queryParams.mapping);
        } else {
            console.log("Mapping not defined. Skipping query phase.");
            return null;
        }

        if (expectAllRecords) {
            return recs => {
                for (let rec of recs)
                    for (let map of queryParams.mapping) {
                        let storeName = map.name;
                        let dstStore = utils.getStore(this.db, storeName);
                        this.processRecord(rec, dstStore, map);
                    }
            };
        } else {
            return rec => {
                // Map to fields in defined mapping schemas
                for (let store of queryParams.mapping) {
                    let storeName = store.name;
                    let dstStore = utils.getStore(this.db, storeName);
                    this.processRecord(rec, dstStore, store);
                }
            };
        }
    }

    processRecord(record, dstStore, map) {
        let rec = {};
        // Create record
        for (let fromField of Object.keys(map.fields)) {
            let field = map.fields[fromField];
            if (field == null)
                throw Error(`Cannot map '${fromField}' from source to destination.`);
            let data;
            let nullVal = {
                null: field.null == null ? (field.nullable == null ? false : field.nullable) : field.null,
                null_values: field.null_values == null ? [] : field.null_values
            };
            data = QminerDBHandle.processTypes(field.type, record[fromField], nullVal);
            if (data == null && (field.null == null || field.null === false)) {
                console.log("Error - null value", data, field.name);
            }
            rec[field.name] = data;
        }

        // Push record and increment counter
        if (this.returnQueryRes) this.results.push(rec);
        let recId = dstStore.push(rec);
        this.addJoins(map.joins, rec, recId);
    }

    addJoins(joins, rec, recId) {
        if (joins)
            for (let join of joins) {
                let joinStore = this.db.store(join.store);
                if (joinStore !== null) {
                    // Store exist
                    if (join.key) {
                        let searchQuery = {};
                        searchQuery.$from = join.store;
                        Object.keys(join.key).forEach(key => {
                            searchQuery[join.key[key]] = rec[key];
                        });
                        let joinRecs = this.db.search(searchQuery);
                        joinRecs.each(joinRec => {
                            joinRec.$addJoin(join.inverse, recId);
                        });
                    } else {
                        console.log("To enable auto generation of joins define key value in the join field.");
                    }
                }
            }
    }

    getSchemaInfo(queryParams, mapping) {
        // From array to object [{name: storeName, fields: {}}] => {storeName:{fields:{}}}
        let newMapping = {};
        mapping.forEach(store => {
            Handle.removeNonAscii(store.fields);
            newMapping[store.name] = {};
            Object.assign(newMapping[store.name], store);

            // Clear store
            if (store.clear) {
                this.db.store(store.name).clear();
            }
        });
        mapping = newMapping;

        let useSchema = {};
        if (queryParams.schema) {
            // Get info from defined schema
            // Rearrange schema
            queryParams.schema.forEach(store => {
                let newFields = {};
                store.fields.forEach(field => {
                    newFields[field.name] = field;
                });
                useSchema[store.name] = {};
                Object.assign(useSchema[store.name], store);
                useSchema[store.name].fields = newFields;
            });
        } else {
            // Get info from existing store
            Object.keys(mapping).forEach(key => {
                let store = mapping[key];
                let qmStore = utils.getStore(this.db, store.name);
                let newFields = {};
                qmStore.fields.forEach(field => {
                    newFields[field.name] = field;
                });
                useSchema[store.name] = {};
                useSchema[store.name].fields = {};
                Object.assign(useSchema[store.name].fields, newFields);
            });
        }

        // Get all data from scheme to mapping
        // Loop through stores
        Object.keys(mapping).forEach(store => {
            // Loop through fields
            Object.keys(mapping[store].fields).forEach(fromField => {
                let toField = mapping[store].fields[fromField];
                if (typeof toField === "string") {
                    mapping[store].fields[fromField] = useSchema[store].fields[toField];
                } else if (typeof toField === "object") {
                    toField = toField.name;
                    Object.assign(mapping[store].fields[fromField], useSchema[store].fields[toField]);
                } else {
                    console.error(
                        "Type of mapping value is not valid. " +
                        "It should be field name or object with defined name and other parameters."
                    );
                }
            });
        });
    }

    static processTypes(type, value, nullVal = null) {
        if (value == null || (nullVal && nullVal.null && nullVal.null_values.includes(value))) {
            return null;
        }

        switch (type) {
            case "string":
                return String(value);
            case "int": {
                let num = Number.parseInt(value);
                return isNaN(num) ? null : num;
            }
            case "float": {
                // Replace comma decimal separator to dot decimal separator
                value = typeof value === "string" ? value.replace(/,(\d+)$/, ".$1") : value;
                let num = Number.parseFloat(value);
                return isNaN(num) ? null : num;
            }
            case "json":
                return typeof value === "string" ? JSON.parse(value) : value;
            case "datetime": {
                let data = new Date(value);
                if (isNaN(data.getTime())) {
                    console.error("Invalid date:", value);
                } else {
                    return data.toISOString();
                }
                return null;
            }
        }
        return null;
    }

    log() {
        Handle.log(this.direction, this.name);
        if (this.direction === "Destination") {
            console.log("QminerDB state: ");
            let stores = this.db.getStoreList();
            if (stores.length === 0) {
                console.log("    Empty Qminer database.");
            } else {
                stores.forEach(store => {
                    console.log("   " + store.storeName + ": " + store.storeRecords + " records.");
                    if (this.verbose) {
                        console.log("   Last 3 records:");
                        let lastRecs = this.db.store(store.storeName).allRecords.trunc(3, store.storeRecords - 3);
                        console.log(JSON.stringify(lastRecs.toJSON().records, null, 4));
                    }
                });
            }
            Handle.log("");
        } else if (this.direction === "Source") {
            console.log("   Queried " + this.affectedRecords + (this.affectedRecords === 1 ? " record." : " records."));
        }
    }
}

//======================================================================================================================
// CREATION OF DATABASE/FILE HANDLE
//======================================================================================================================
class Loader {
    constructor(conf, setSrcDst = true) {
        if (setSrcDst) {
            this.init(conf);
        } else {
            this.setConf(conf);
        }
    }

    init(conf) {
        this.setConf(conf);
        this.setSrc(conf.source);
        this.setDst(conf.destination);
    }

    /**
     * Creates database or file handle.
     * @param {('Source'|'Destination')} direction - Sets handle as a source or destination.
     * @param {Object} conf - Configuration object suitable according to type.
     */
    static createHandle(direction, conf) {
        switch (conf.type) {
            case "ArangoDB":
                return new ArangoDBHandle(conf, direction);
            case "MariaDB":
                return new MariaDBHandle(conf, direction);
            case "QminerDB":
                return new QminerDBHandle(conf, direction);
            case "Csv":
                return new CSVHandle(conf, direction);
            default:
                console.error("Connection of " + conf.type + " type is NOT defined.");
                process.exit(1);
        }
    }

    /**
     * Sets source.
     * @param {Object} conf - Configuration 'source' object.
     */
    setSrc(conf) {
        this.srcDb = Loader.createHandle("Source", conf);
    }

    setSrcWithHandle(conf, handle) {
        conf["db"] = handle;
        this.srcDb = Loader.createHandle("Source", conf);
    }

    /**
     * Sets destination.
     * @param {Object} conf - Configuration 'destination' object.
     */
    setDst(conf) {
        this.dstDb = Loader.createHandle("Destination", conf);
    }

    setDstWithHandle(conf, handle) {
        conf["db"] = handle;
        this.dstDb = Loader.createHandle("Destination", conf);
    }

    /**
     * Sets global configuration and, if necessary, loads module with custom functions.
     * @param {Object} dbConf - Configuration object.
     * @param {Object} dbConf.misc -  Miscellaneous options.
     * @param {Object} dbConf.source - Source parameters.
     * @param {Object} dbConf.destination - Destination parameters.
     * @param {string} dbConf.custom_fn_path - Filename/filepath to module with custom functions.
     */
    setConf(dbConf) {
        this.databaseConf = dbConf;
        this.verbose = dbConf.misc != null && dbConf.misc.verbose != null ? dbConf.misc.verbose : false;
        this.databaseConf.source.verbose = this.verbose;
        this.databaseConf.destination.verbose = this.verbose;
        if (this.databaseConf.source.custom_fn_path) {
            if (this.verbose) console.log("Custom functions loaded from:", dbConf.source.custom_fn_path);
            // Load custom function module
            this.databaseConf.source.customFn = require(dbConf.source.custom_fn_path);
        }
    }

    /**
     * Creates source and destination handle and executes all queries.
     * @param {boolean} closeDst=true - When loader is finished, close destination handle.
     * @param {boolean} closeSrc=true - When loader is finished, close source handle.
     */
    async run(closeDst = true, closeSrc = true) {
        let queries = this.databaseConf.queries;
        this.srcDb.setQueryDst(this.dstDb, queries);
        Handle.log("Querying");
        return this.srcDb
            .queryAll(queries)
            .then(() => {
                // Close databases
                let closes = [];
                if (closeSrc) closes.push(this.srcDb.close());
                if (closeDst) closes.push(this.dstDb.close());
                return Promise.all(closes);
            })
            .then(() => {
                // Get results and return
                return this.dstDb.getQueryResults();
            })
            .catch(error => {
                this.srcDb.close();
                this.dstDb.close();
                throw error;
            });
    }
}

if (require.main === module) {

    // Script called directly
    if (argv.d) {
        console.log("Reading config from: " + argv.d);
    } else {
        console.log("USAGE:");
        console.log("   -d : path to JSON config file");
        process.exit(1);
    }

    // Load configurations
    let conf = utils.loadFromJson(argv.d);
    let loader = new Loader(conf);
    loader.run().then(() =>
        console.log("Loader successfully finished!")
    ).catch((err) =>
        console.error(err)
    );
}

module.exports = { Loader };
