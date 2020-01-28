"use strict";

const qm = require('qminer');
const fs = qm.fs;

const argv = require('minimist')(process.argv.slice(2));

if (argv.d && argv.o) {
    console.log("Feature records from: " + argv.d + " to: " + argv.o);
} else {
    console.log("USAGE:");
    console.log("  -d : path to pipeline directory");
    console.log("  -o : output file");
    process.exit(1);
}

const REC_COUNT = 5;

let base = new qm.Base({ dbPath: argv.d+"/db", mode: 'openReadOnly' });

/*
    TODO: Excluding one of those stores causes Segmentation Fault
    in loading the FeatureSpace from file:

        let ftr = new qm.FeatureSpace(queryBase, fin);

    Currently I have no idea where does this dependency come frome as
    each feature from FeatureSpace has source set to "FtrSpace" store.
*/
let used = ["FtrSpace", "InputFeat"];

let schema = [];
let records = {};

// Find records with interesting predicted values
// i.e. top REC_COUNT highest predictions
let outputStore = base.store("Output");

let predictValue = outputStore.allRecords.map(x => x.Value);
let argsMax = new Array(predictValue.length).fill(0).map((x, i) => i);
argsMax = argsMax.sort((a, b) => predictValue[b] - predictValue[a]);

console.log("Top predictions")
console.log(argsMax.slice(0, REC_COUNT).map(x => predictValue[x]));

for (let store of base.getStoreList()) {
    if (used.indexOf(store.storeName) < 0) continue;
    schema.push({
        name: store.storeName,
        fields: base.store(store.storeName).fields.filter(x => x.name != 'Value').map(function (field) {
            return {
                name: field.name,
                type: field.type,
                null: field.nullable
            }
        })
    })

    records[store.storeName] = [];
    for (let i = 0; i < REC_COUNT; i++) {
        let inRec = {};

        let recIdx = argsMax[i];

        let rec = base.store(store.storeName).allRecords[recIdx];
        schema[schema.length - 1].fields.forEach(x => inRec[x.name] = rec[x.name]);
        records[store.storeName].push(inRec);
    }
}

let fout = fs.openWrite(argv.o);
fout.write(JSON.stringify({
    data: {
        records: records
    }
}, null, 2));

fout.close();
base.close();