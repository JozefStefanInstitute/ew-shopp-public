"use strict";

// Configuration file in JS, because it's easier to manage config variables for different environments.
// Comments are also great.

// Default environment is set to development
const env = process.env.NODE_ENV || "development";
const config = {};

// Plotly API configs
config.plotly = {};
config.plotly.username = process.env.PLOTLY_USER || undefined;
config.plotly.api_key = process.env.PLOTLY_PASSWORD || undefined;

// EventRegistry API configs
config.eventRegisty = {
    apiKey:  process.env.EVENTREGISTRY_KEY || undefined,
};

// Paths
config.paths = {};
config.paths.dataDir = "../data/";
config.paths.outDir = "../out/";
config.paths.manager = "../data/manager/managerDb/";

// Path to default models
config.paths.models = "../data/models/";

// Weather default paths
config.paths.weatherRawTsv = "../data/raw/weather/tsv/";
config.paths.weatherInitTsv = "slovenia-jan2014-24aug2018_qminer.tsv";

config.paths.configurations = {};
if (env === "development") {
    // Development specific configurations
    config.paths.configurations.loader = "./usecase/common/loader/";
} else if (env === "production") {
    // Production specific configurations
    config.paths.configurations.loader = "./usecase/common/loader/";
} else if (env === "test") {
    // Test specific configurations
    config.paths.weatherRawTsv = "./analytics/test/data/weather/tsv/";
    config.paths.manager = "./analytics/test/data/dbs/managerDb/";
}

config.paths.weatherQmStore = config.paths.configurations.loader + "weather_qminer.json";

module.exports = config;