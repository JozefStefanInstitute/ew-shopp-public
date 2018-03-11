"use strict";

let qm = require('qminer');
let assert = require('assert');

// load weather data
let ws = new qm.Base({mode: 'openReadOnly', dbPath: './weatherDb/'}).store("Weather");
// and product data
let ps = new qm.Base({mode: 'openReadOnly', dbPath: './db/'}).store("Sales");

// ...