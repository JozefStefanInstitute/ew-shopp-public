"use strict";

const config = require("../config/config.js");
const utils = require("../util/utils.js");
const fs = require("fs");
const qm = require("qminer");

const {
    EventRegistry, QueryEvents, QueryArticlesIter, GetCounts, RequestEventsTimeAggr, RequestEventsDateMentionAggr,
    QueryArticles, RequestArticlesDateMentionAggr, RequestArticlesTimeAggr
} = require("eventregistry");
const er = new EventRegistry({ apiKey: config.eventRegisty.apiKey });

let db;

/**
 * Possible values: ["eventsCountsMentioned", "eventsCounts", "articlesCountsMentioned", "articlesCounts"]
 **/

// Get store for this query type
const typeStoreNameMap = {
    eventsCounts: "EventsCounts", articlesCounts: "ArticlesCounts",
    articlesCountsMentioned: "ArticlesCounts", eventsCountsMentioned: "EventsCounts"
};

const joinedStoreNameMap = {
    articlesCountsMentioned: "ArticlesCountsMentioned", eventsCountsMentioned: "EventsCountsMentioned"
};

// EventRegistry query parameters
const dbConfigPath = "analytics/events/configDb.json";
const dbPath = "../data/dbs/eventsDb";

// Process after querying data
const readResponse = "fromDb";


if (require.main === module) {
    const queryExample = {
        type: "eventsCounts",
        conceptKeyword: "Association football",
        dateStart: utils.addDays(Date.now(), -19).toISOString(),
        dateEnd: utils.addDays(Date.now(), -16).toISOString(),
        locations: ["Spain"],
        path: "./usecase/events/articles_football.json"
    };
    run(queryExample).then((data) => console.log("Results:", data));
}

/**
 * Entry point to download events' features from EventRegistry
 * @param conf
 * @property {Array<Object>} [conf.queries] - Putting many queries at once in an array
 * (Example: conf.queries = [{type: , conceptKeyword: }, {type: , conceptKeyword: }...])
 *
 * ** One query properties
 * @property {String} conf.type - Type of query
 * @property {String} conf.conceptKeyword - Concept we are interested in
 * @property {Date} conf.dateStart - Start of the interested interval (datetime in ISO format)
 * @property {Date} conf.dateEnd - End of the interested interval (datetime in ISO format)
 * @property {Array<String>} conf.locations - Array of locations that articles and events are related (AND relation)
 * @property {String} [conf.path] - Path to output JSON of results
 * @property {Boolean} [extendedResult=false] - Elaborate results
 * @property {Boolean} [verbose=false] - Verbose script logging
 *
 * ** Misc properties
 * @property {Object} [conf.misc] - Optional miscellaneous options
 * @property {String} [dbPath="../data/dbs/eventsDb"] - Path to output QMiner database
 * @property {String} [dbConfigPath="analytics/events/configDb.json"] - Path to output QMiner database configuration
 * @property {String} [dbFeatPath="../data/common/features/eventsFeaturesDb"] - Path to output QMiner database
 * @property {String} [dbFeatConfigPath="./analytics/events/configEventsFeaturesDb.json"] - Path to output QMiner
 * database configuration
 *
 * @return {Promise<*>}
 */
async function run(conf) {
    return await setDefaultParams(conf).then((conf) => {
        db = checkDb(conf.misc);
        return conf;
    }).then(async (conf) => {
        for (let query of conf.queries) {
            await setDefaultQueryParams(query).then(checkExisting).then(queryER).then(saveResults);
        }
        return conf;
    }).then(loadResults).then((data) => {
        console.log("Downloading events' features finished successfully.");
        return data
    }).catch((e) => {
        console.error(e);
        console.error("Downloading events' features finished unsuccessfully!");
        throw e;
    }).finally(() => {
        if (db != null) db.close();
    });
}

/**
 * Query EventRegistry events and articles
 */

async function getERUris(conceptKeyword, locations) {
    let conceptUri = er.getConceptUri(conceptKeyword);
    let locationUris = locations.includes("Global") ? [] : locations.map((l) => er.getLocationUri(l));
    return Promise.all([conceptUri, ...locationUris]);
}

async function queryER(queryParams) {

    if (!queryParams.queryER) return queryParams;
    queryParams.content = {};
    let runningQueries = [];
    const queryType = queryParams.type;
    for (const subQuery of queryParams.subERQueries) {

        let args = { conceptUri: subQuery.conceptUri, dateStart: subQuery.dateStart, dateEnd: subQuery.dateEnd };
        if (!subQuery.locationUris.includes("Global")) args.locationUri = subQuery.locationUris;

        let query;
        if (queryType === "articlesCounts") {
            query = new QueryArticles(args);
            query.setRequestedResult(new RequestArticlesTimeAggr());
        } else if (queryType === "articlesCountsMentioned") {
            query = new QueryArticles(args);
            query.setRequestedResult(new RequestArticlesDateMentionAggr());
        } else if (queryType === "eventsCounts") {
            query = new QueryEvents(args);
            query.setRequestedResult(new RequestEventsTimeAggr());
        } else if (queryType === "eventsCountsMentioned") {
            query = new QueryEvents(args);
            query.setRequestedResult(new RequestEventsDateMentionAggr());
        } else {
            console.error("Not valid type of query! Change 'type' parameter.");
            continue;
        }

        const response = er.execQuery(query);
        if (queryParams.verbose) {
            await response;
            console.info("Subquery response:", JSON.stringify(response, null, 4));
        } else {
            runningQueries.push(response);
        }
    }

    let results = await Promise.all(runningQueries);
    let mergedResults = {};
    // Merge results
    if (queryType === "articlesCounts" || queryType === "eventsCounts") {
        mergedResults[queryParams.conceptUri] = [];
        results.forEach((result) => {
            mergedResults[queryParams.conceptUri] =
                mergedResults[queryParams.conceptUri].concat(result.timeAggr.results);
        });
    } else if (queryType === "eventsCountsMentioned" || queryType === "articlesCountsMentioned") {
        results.forEach((result, i) => {
            mergedResults[queryParams.subERQueries[i].dateStart] = result;
        });
    }

    queryParams.content = mergedResults;
    return queryParams;
}

/**
 * Load data
 */

async function loadResults(results) {
    switch (readResponse) {
        case "fromDb":
            return loadFromDb(results);
        case "fromJson":
            return loadFromJson(results);
        default:
            return;
    }
}

async function loadFromDb(results) {
    let loadedResults = [];
    for (const query of results.queries) {
        let loadContent = [];

        if (query.type === "articlesCountsMentioned" || query.type === "eventsCountsMentioned") {
            db.search({
                $from: typeStoreNameMap[query.type],
                ConceptUri: query.conceptUri,
                LocationUri: query.locationUris,
                Date: { $lt: query.dateEnd, $gt: query.dateStart }
            }).each(rec => {
                if (rec.LocationUri.length !== query.locationUris.length) return;
                let curr = {
                    Date: rec.Date,
                    MentionedDates: []
                };

                rec.hasMentionedDates.each(rec => {
                    curr.MentionedDates.push({ Date: rec.DateMentioned, Count: rec.Count })
                });
                loadContent.push(curr);
            });
        } else {
            db.search({
                $from: typeStoreNameMap[query.type],
                ConceptUri: query.conceptUri,
                ...(query.locationUris && { LocationUri: query.locationUris }),
                Date: { $lt: query.dateEnd, $gt: query.dateStart }
            }).each(rec => {
                if (rec.LocationUri.length !== query.locationUris.length) return;
                loadContent.push({
                    Date: rec.Date,
                    Count: rec.Count
                })
            });
        }

        if (query.extendedResult) {
            query.results = loadContent;
            loadedResults.push(query);
        } else {
            loadedResults.push(loadContent);
        }
    }
    return loadedResults.length === 1 ? loadedResults[0] : loadedResults;
}

async function loadFromJson(results) {
    const readFile = async (path, encoding) => {
        try {
            let content = fs.readFileSync(path, encoding);
            return { path: path, loadContent: JSON.parse(content.toString(encoding)) };
        } catch (err) {
            console.error(err);
        }
    };
    let reads = [];
    for (const query of results.queries) {
        reads.push(readFile(query.path, "utf-8"));
    }
    return await Promise.all(reads);
}

/**
 * Save data
 */

async function saveResults(results) {
    if (results.content == null) return results;

    const saveQueryResultsFn = async (result) => {
        // Wait for EventRegistry
        result.content = await result.content;
        const jsonDump = {
            type: result.type,
            conceptUri: result.conceptUri, dateStart: result.dateStart, dateEnd: result.dateEnd,
            locationUri: result.locationUris, content: result.content
        };
        // Save to DB and dump to JSON
        return await Promise.all([saveToDb(result), saveToJson(result.path, jsonDump)]);
    };

    await saveQueryResultsFn(results);
    return results;
}

async function saveToJson(path, content) {
    if (path == null) return [];
    const write = async () => {
        const json = JSON.stringify(content, null, 4);
        fs.writeFileSync(path, json, "utf-8");
        return json;
    };
    return write();
}

async function saveToDb(result) {
    if (result.content == null) return result; // Content not present - EventRegistry most likely not queried

    if (result.verbose) console.log("Saving to database:", result);
    let content = Object.entries(result.content);
    if (result.type === "articlesCountsMentioned" || result.type === "eventsCountsMentioned") {
        for (const [day, articlesCounts] of content) {
            // Get counts
            let counts = db.search({
                $from: typeStoreNameMap[result.type],
                ConceptUri: result.conceptUri,
                LocationUri: result.locationUris,
                Date: day
            }).filter((rec) => rec.LocationUri.length === result.locationUris.length);

            // Create new counts if none
            let join;
            if (counts.empty !== true) {
                join = counts[0];
            } else {
                join = db.store(typeStoreNameMap[result.type]).push({
                    ConceptUri: result.conceptUri,
                    LocationUri: result.locationUris,
                    Date: day,
                    Count: articlesCounts.dateMentionAggr.totalResults
                });
            }

            const storeFn = (dateMentioned, count) => {
                let recId = db.store(joinedStoreNameMap[result.type]).push({
                    DateMentioned: dateMentioned, Count: count
                });
                db.store(joinedStoreNameMap[result.type])[recId].$addJoin("onDate", join);
            };

            // Join date mentioned with date counts
            if (articlesCounts.dateMentionAggr.results.length === 0) {
                storeFn(day, 0);
            } else {
                articlesCounts.dateMentionAggr.results.forEach(
                    (dayMentioned) => storeFn(dayMentioned.date, dayMentioned.count));
            }
        }
    } else if (result.type.includes("Counts")) { // Handle articlesCounts and eventsCounts
        for (const [conceptUri, days] of content) {
            for (const day of days) {
                db.store(typeStoreNameMap[result.type]).push({
                    ConceptUri: conceptUri,
                    LocationUri: result.locationUris,
                    Date: day.date,
                    Count: day.count
                });
            }
        }
    }

    return result;
}

/**
 * Utility functions
 */

function toDailySubQueries(query, interval) {

    const [dateStartKd, dateEndKd] = [utils.keepDate(interval.dateStart), utils.keepDate(interval.dateEnd)];
    let currDate = dateStartKd;
    while (currDate <= dateEndKd) {
        query.subERQueries.push({
            conceptUri: query.conceptUri,
            locationUris: query.locationUris,
            dateStart: utils.getDateString(currDate),
            dateEnd: utils.getDateString(currDate)
        });
        currDate = utils.keepDate(utils.addDays(currDate, 1));
    }
}

function setSubQueries(query, intervals, queryER) {
    query.subERQueries = [];
    query.queryER = queryER;
    query.dateStart = utils.getDateString(query.dateStart);
    query.dateEnd = utils.getDateString(query.dateEnd);
    for (const interval of intervals) {

        if (query.type === "articlesCountsMentioned" || query.type === "eventsCountsMentioned") {
            toDailySubQueries(query, interval);
        } else {
            query.subERQueries.push({
                conceptUri: query.conceptUri,
                locationUris: query.locationUris,
                dateStart: utils.getDateString(interval.dateStart),
                dateEnd: utils.getDateString(interval.dateEnd)
            });
        }
    }
}

async function setDefaultParams(conf) {
    // Leave as is parameters -> set global parameters -> set default parameters
    const defaultParams = {
        queries: [], misc: {
            dbPath: dbPath,
            dbConfigPath: dbConfigPath
        }
    };
    const finalConf = Object.assign({}, defaultParams);
    if (conf.queries == null) {
        finalConf.queries = [conf];
    } else {
        Object.assign(finalConf.queries, conf.queries);
        Object.assign(finalConf.misc, conf.misc);
    }
    return finalConf;
}

async function setDefaultQueryParams(query) {
    return Object.assign(query, Object.assign({ locations: ["Global"] }, query))
}

async function checkExisting(query) {

    // Check if dates/locations/keywords already exist in the DB
    // Get concepts and locations URIs from DB
    const conceptUriRes = db.search({ $from: "ConceptUris", Concept: query.conceptKeyword });
    const locationUriRes =
        db.search({
            $from: "LocationUris",
            ...(!query.locations.includes("Global") && { Location: { $or: query.locations } })
        });

    if (conceptUriRes.length !== 1 ||
        (locationUriRes.length !== query.locations.length && (query.locations.length !== 0))) {
        // Query ER for locations and concept URIs
        [query.conceptUri, ...query.locationUris] = await getERUris(query.conceptKeyword, query.locations);

        if (query.conceptUri === undefined) {
            throw Error("No concept found for the keyword '" + query.conceptKeyword + "'!");
        }
        query.locationUris.forEach(loc => {
            if (loc === undefined) throw Error("No concept found for the location '" + loc + "'!");
        });

        // Save URIs to DB
        db.store("ConceptUris").push({ ConceptUri: query.conceptUri, Concept: query.conceptKeyword });
        query.locationUris.forEach((uri, index) => {
            db.store("LocationUris").push({
                LocationUri: uri,
                Location: query.locations[index]
            })
        });
    } else {
        query.conceptUri = conceptUriRes[0].ConceptUri;
        query.locationUris = [];
        if (!query.locations.includes("Global") &&
            locationUriRes.length !== 0) {
            locationUriRes.each(rec => {query.locationUris.push(rec.LocationUri)});
        }
    }
    query.locationUris = query.locations.includes("Global") ? ["Global"] : query.locationUris;

    // Get dates that already exist
    const [dateStartKd, dateEndKd] = [utils.keepDate(query.dateStart), utils.keepDate(query.dateEnd)];
    let interestedDates = new Set();
    let currDate = dateStartKd;
    while (currDate <= dateEndKd) {
        interestedDates.add(currDate.toISOString());
        currDate = utils.keepDate(utils.addDays(currDate, 1));
    }

    // Get dates we are interested in and do not exist
    let qmQuery;
    if (query.type === "articlesCountsMentioned" || query.type === "eventsCountsMentioned") {
        qmQuery = {
            $from: typeStoreNameMap[query.type],
            ConceptUri: query.conceptUri,
            // ...(query.locationUris && { LocationUri: query.locationUris }),
            LocationUri: query.locationUris,
            $sort: { Date: 1 },
            $join: {
                $name: "onDate",
                $query: { $from: joinedStoreNameMap[query.type], Count: { $gt: 0 } }
            }
        };
    } else {
        qmQuery = {
            $from: typeStoreNameMap[query.type],
            ConceptUri: query.conceptUri,
            ...(query.locationUris && { LocationUri: query.locationUris }),
            $sort: { Date: 1 }
        };
    }

    interestedDates = db.search(qmQuery).map(rec => {
        // Every location in the string_v field must match - Also partial results are found with only one
        // matching location
        return (rec.LocationUri.length === query.locationUris.length) ? rec.Date : null;
    }).reduce((interestedDates, date) => {
        if (date == null) return interestedDates;
        // Existing dates
        let existingDate = utils.keepDate(date).toISOString();
        if (interestedDates.has(existingDate))
            interestedDates.delete(existingDate);
        return interestedDates;
    }, interestedDates);

    let intervals;
    let queryER = false;
    if (interestedDates.size === 0) {
        console.log("All interested dates already exists for specific keyword and locations! Skipping querying of the" +
            " EventRegistry.");
        intervals = [{ dateStart: dateStartKd, dateEnd: dateEndKd }];
    } else {

        queryER = true;
        // Final intervals
        let interestedDatesArr = [...interestedDates].sort();
        let nextDate = utils.keepDate(interestedDatesArr[0]);

        intervals = interestedDatesArr.reduce((intervalsAcc, date) => {
            const dateCurr = utils.keepDate(date);
            if (utils.keepDate(dateCurr).toISOString() === utils.keepDate(nextDate).toISOString()) {
                intervalsAcc[intervalsAcc.length - 1].dateEnd = dateCurr;
            } else {
                intervalsAcc.push({ dateStart: dateCurr, dateEnd: dateCurr });
            }
            nextDate = utils.keepDate(utils.addDays(dateCurr, 1));
            return intervalsAcc;
        }, [{
            dateStart: utils.keepDate(interestedDatesArr[0]),
            dateEnd: utils.keepDate(interestedDatesArr[0])
        }]);

    }

    setSubQueries(query, intervals, queryER);
    return query;
}

function checkDb(conf) {
    // Check if DB even exists
    let db;
    if (!utils.existsDir(conf.dbPath) || conf.dbClean) {
        console.warn(`Database ${conf.dbPath} does not exists or flag 'clean_db' is set. Creating new ...`);
        db = createDb(conf);
    } else {
        db = new qm.Base({ mode: "open", dbPath: conf.dbPath });
    }

    return db;
}

function createDb(conf) {
    utils.createDir(conf.dbPath);
    return new qm.Base({
        dbPath: conf.dbPath,
        mode: "createClean",
        schemaPath: conf.dbConfigPath
    });
}

/**
 * Query simple example
 */

const prevWeek = true;
const dateStart = prevWeek ? utils.addDays(Date.now(), -17).toISOString() : "2019-02-21";
const dateEnd = prevWeek ? utils.addDays(Date.now(), -16).toISOString() : "2019-02-21";

//  querySimpleExample().then(() => console.log("Done!"));
async function querySimpleExample() {
    // Get concept/category URI and location URI from category and location keywords
    let conceptUri = er.getConceptUri("Association football"); // er.getCategoryUri("Soccer");
    let locationUris = ["Spain"].map((l) => er.getLocationUri(l));
    [conceptUri, ...locationUris] = await Promise.all([conceptUri, ...locationUris]);
    /********************** Get articles counts - independent of locations ***********************/
    const articlesArgs = {
        conceptUri: conceptUri, sortBy: "date", dateStart: dateStart,
        dateEnd: dateEnd, isDuplicateFilter: "skipDuplicates"
    };

    const articlesQuery = new QueryArticlesIter(er, articlesArgs);
    const articleCounts = {};
    let nArticles = 0;
    const articlesResponse = await new Promise(resolve => {
        articlesQuery.execQuery((article) => {
            // Process each article individually
            if (!(article.date in articleCounts)) {
                articleCounts[article.date] = 0;
            }
            articleCounts[article.date] += 1;
            nArticles++;
        }, () => {
            let finalCount = [];
            Object.entries(articleCounts).forEach(([key, value]) => {
                finalCount.push({ date: key, count: value });
            });
            console.log(nArticles, finalCount);
            resolve(finalCount);
        });
    });

    console.log("Articles counts:", JSON.stringify(articlesResponse, null, 4));
    fs.writeFileSync("articles_counts_2.json", JSON.stringify(articlesResponse, null, 4), "utf-8");


    const queryArticlesDatesMentioned = new QueryArticles(articlesArgs);
    const responseArticlesDatesMentioned = await er.execQuery(queryArticlesDatesMentioned);
    fs.writeFileSync("articles_mentioned_2.json", JSON.stringify(responseArticlesDatesMentioned, null, 4), "utf-8");
    queryArticlesDatesMentioned.setRequestedResult(new RequestArticlesDateMentionAggr());


    // Prepare query - set from/to date and source
    const conceptArgs = { source: "news", dateStart: "2019-02-21", dateEnd: "2019-02-28" };
    const conceptQuery = new GetCounts(conceptUri, conceptArgs);
    const conceptResponse = await er.execQuery(conceptQuery);

    console.log("Concept counts:", JSON.stringify(conceptResponse, null, 4));
    /**
     * articlesResponse: {
     * 'http://en.wikipedia.org/wiki/Association_football':
     *  [ { date: '2019-02-21', count: 7868 },
     *  { date: '2019-02-22', count: 7948 },...,
     *  { date: '2019-02-28', count: 7595 }] }
     **/

    /********************** Get events counts ***********************/
    const eventsArgs = { conceptUri: conceptUri, dateStart: "2019-02-21", dateEnd: "2019-02-28" };
    if (locationUris.length > 0) eventsArgs.locationUri = locationUris;
    const eventsQuery = new QueryEvents(eventsArgs);

    // Get time distribution of the resulting events
    eventsQuery.setRequestedResult(new RequestEventsTimeAggr());
    const eventsResponseTimeAggr = await er.execQuery(eventsQuery);
    fs.writeFileSync("event_response.json", JSON.stringify(eventsResponseTimeAggr, null, 4), "utf-8");
    /**
     * eventsResponseTimeAggr: {
     * "timeAggr": {
     *  "usedResults": 500,¸
     *  "totalResults": 500,
     *  "results": [ { "date": "2019-02-21", "count": 81 }, ..., { "date": "2019-02-28", "count": 30 } ]
     */

    // Get events and the dates that are mentioned in articles about these events
    eventsQuery.setRequestedResult(new RequestEventsDateMentionAggr());
    const eventsResponseDatesMention = await er.execQuery(eventsQuery);
    fs.writeFileSync("event_response_mentioned.json", JSON.stringify(eventsResponseDatesMention, null, 4), "utf-8");
    /**
     * eventsResponseDatesMention: {
     * "timeAggr": {
     *  "usedResults": 499,
     *  "totalResults": 499,
     *  "results": [ { "date": "2007-03-10", "count": 6 },
     *  { "date": "2019-01-01", "count": 5 },
     *  ...,
     *  {"date": "2020-06-30", "count": 8 }]
     */
}

module.exports = { run, checkDb, typeStoreNameMap };