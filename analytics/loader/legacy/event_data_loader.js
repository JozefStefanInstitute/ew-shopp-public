"use strict";

const qm = require("qminer");
const assert = require("assert");
const fs = qm.fs;

// Command line arguments
const argv = require("minimist")(process.argv.slice(2));

// Individial operations
//  if (argv.e) {
//      console.log("loading event data as well");
//  } else {
//      console.log("USAGE:");
//      console.log("  --mse : path to mse file");
//  }

// PARAMETERS
// List of concepts one of which must be present in the event
let FILTER_CONCEPTS = []; // ["Association_football"];
// Path to mse data
let MSE_PATH = "weeklyMSE.json";
// Which mse values ot use
let MSE_NAME = "Big Bang sales MSE";
//  let MSE_NAME = "Ceneje views MSE";
//  let MSE_NAME = "Ceneje clicks MSE";
// Min mse value for positive example
//  let MSE_CUTOFF = 20000;
// Minimal event size (in nr. of articles)
let MIN_EVENT_SIZE = argv.min_event_size ? argv.min_event_size : 100;
console.log("Using minimal event size:" + MIN_EVENT_SIZE);
// Min relevance value for concept to be taken into account
let CONCEPT_CUTOFF = 20;
// How many days to take into time interval
let TIME_WINDOW = 7;
// How many days to take into post time interval
let POST_TIME_WINDOW = 14;
//  let POST_TIME_WINDOW = 31;
// which time periods to ignore
let IGNORE_PERIODS = [
    {
        start: new Date("2015-01-01"), // Holiday season 2014/15
        end: new Date("2015-01-31")
    }, {
        start: new Date("2015-11-15"),  // Holiday season 2015/16
        end: new Date("2016-01-31")
    }, {
        start: new Date("2016-11-15"),  // Holiday season 2016/17
        end: new Date("2017-01-31")
    }, {
        start: new Date("2017-11-15"),  // Holiday season 2017/18
        end: new Date("2017-11-30")
    }
];

// Function to check if date is to be ignored
function ignoreDate(d) {
    for (let iPer of IGNORE_PERIODS) {
        if (iPer.start <= d && d <= iPer.end) {
            return true;
        }
    }
    return false;
}

// Create base
let base = new qm.Base({
    mode: "createClean",
    dbPath: "./eventsDb/"
});

base.createStore([{
    name: "Events",
    fields: [
        { name: "date", type: "datetime" },
        { name: "dateVal", type: "uint64" },
        { name: "concepts", type: "string" }
    ],
    joins: [],
    keys: []
}, {
    name: "EventIntervals",
    fields: [
        { name: "startDate", type: "datetime" },
        { name: "endDate", type: "datetime" },
        { name: "postDate", type: "datetime" },
        { name: "concepts", type: "string" },
        { name: "postConcepts", type: "string" },
        { name: "mse", type: "float" }
    ],
    joins: [],
    keys: []
}]);

let Events = base.store("Events");
let EventIntervals = base.store("EventIntervals");

let eventsFnm = "/home/aljazk/ijs/ew-shopp/data/events/sports_2015_17_event_info.jsonl";
//  let eventsFnm = "/home/aljazk/ijs/ew-shopp/data/events/sports_event_info_small.jsonl";
let eventsFile = fs.openRead(eventsFnm);
console.log("Reading events data from " + eventsFnm);

//  let sortedConcepts = [];
let nLines = 0;
while (!eventsFile.eof) {
    let line = eventsFile.readLine();
    let event = JSON.parse(line).info;
    nLines += 1;
    if (nLines % 1000 === 0) {
        process.stdout.write("\r" + nLines);
    }

    // Ignore small events
    if (event.totalArticleCount < MIN_EVENT_SIZE) {
        continue;
    }

    // Collect concepts relevant enough in a string
    let evConcepts = [];
    for (let conc of event.concepts) {
        if (conc.score >= CONCEPT_CUTOFF) {
            // Take only the end of the URI - discard "http://en.wikipedia.org/wiki/"
            let concStr = conc.uri.split("/");
            concStr = concStr[concStr.length - 1];

            evConcepts.push(concStr);
        }
    }

    if (FILTER_CONCEPTS.length > 0) {
        let skip = true;
        for (let filterConcept of FILTER_CONCEPTS) {
            if (filterConcept in evConcepts) {
                skip = false;
                break;
            }
        }
        if (skip) {
            continue;
        }
    }

    evConcepts = concatenate(evConcepts);

    let evDate = new Date(event.eventDate);
    let evDateVal = evDate.getTime(); // Ms since midnight of January 1, 1970
    let rec = {
        date: evDate,
        dateVal: evDateVal,
        concepts: evConcepts
    };
    Events.push(rec);
    //  sortedConcepts.push([evDate, evConcepts]);
}
console.log("\rRead " + nLines + " lines");
//  sortedConcepts.sort(x => x[0]);
// console.log(sortedConcepts);
console.log("Collected data about: " + Events.length + " events");


// Read pre-computed MSE series
let MSEs = JSON.parse(fs.openRead(MSE_PATH).readAll());
// Find the specified one
let mse = null;
for (let x of MSEs) {
    if (x.name === MSE_NAME) {
        mse = x;
        break;
    }
}
assert.ok(mse !== null, "no mse series with specified name");


// One day and half a day in milliseconds
// let oneDay = 24*60*60*1000;
// let halfDay = oneDay/2;
function aggregateEvents(store, startDate, endDate) {
    // Start/end in ms since 1970
    let startVal = startDate.getTime();
    let endVal = endDate.getTime();
    let relevantRecs = store.allRecords.filterByField("dateVal", startVal, endVal);

    return relevantRecs.map((rec) => rec.concepts);
}

function concatenate(stringList) {
    let ret = "";
    for (let c of stringList) {
        ret += c + " ";
    }
    return ret;
}

// Compute the event intervals records
for (let msePoint of mse.dist) {
    let mseDate = new Date(msePoint[0]);
    let mseVal = msePoint[1];
    if (ignoreDate(mseDate)) {
        continue;
    }

    // Compute the borders of the time windows
    let endDate = new Date(mseDate);
    endDate.setDate(mseDate.getDate() + TIME_WINDOW);
    let postDate = new Date(endDate);
    postDate.setDate(endDate.getDate() + POST_TIME_WINDOW);

    // Aggregate events in the two windows
    let concepts = aggregateEvents(Events, mseDate, endDate);
    let postConcepts = aggregateEvents(Events, endDate, postDate);
    //  console.log(concepts.length, postConcepts.length, endDate, postDate);
    concepts = concatenate(concepts);
    postConcepts = concatenate(postConcepts);
    console.log(
        mseDate,
        "mse:", mseVal,
        "concepts:", concepts.split(" ").length,
        "postConcepts:", postConcepts.split(" ").length);

    let rec = {
        startDate: mseDate,
        endDate: endDate,
        postDate: postDate,
        concepts: concepts,
        postConcepts: postConcepts,
        mse: mseVal
    };
    EventIntervals.push(rec);
}
console.log("Collected data about: " + EventIntervals.length + " event intervals");

base.close();
