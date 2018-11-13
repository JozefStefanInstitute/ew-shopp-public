"use strict";

const assert = require("assert");

// Definitions at: https://github.com/JozefStefanInstitute/weather-data/wiki/Weather-features
const weatherParams = {
    "instant": ["2d", "2t", "sd", "sp", "tcc", "ws", "rh"],
    "cumulative": ["sund", "tp", "ssr", "sf"]
};


function buildExtractors(params){
    // Extract features for all parameters
    let fe = [];

    let weatherParams = getAllParams();
    for(let param of weatherParams){
        for(let daterange of params.ranges.date)
            for(let timerange of params.ranges.time)
                fe = fe.concat(genDefaultFeatures(param, daterange, timerange));
    }
    return fe;
}

function genInstantFeatures(param, daterange, timerange = [0, 23]){
    let fe = [
        { param: param, aggr: "max",  daterange: daterange, timerange: timerange},
        { param: param, aggr: "min",  daterange: daterange, timerange: timerange},
        { param: param, aggr: "mean", daterange: daterange, timerange: timerange},
        { param: param, aggr: "diff", daterange: daterange, timerange: timerange}
    ];
    return fe;
}

function genCumFeatures(param, daterange, timerange = [0, 23]){
    let fe = [
        { param: param, aggr: "total", daterange: daterange, timerange: timerange}
    ];
    return fe;
}

function genDefaultFeatures(param, daterange, timerange){
    let paramType = getParamType(param);
    if(paramType == "instant")
        return genInstantFeatures(param, daterange, timerange);
    else
        return genCumFeatures(param, daterange, timerange);
}

function getParamType(param){
    for(let paramType of Object.keys(weatherParams)){
        if(weatherParams[paramType].indexOf(param) >= 0)
            return paramType;
    }
    assert.fail("Param " + param + " not recognized as weather parameter.");
}

function getAllParams(paramsType){
    if(typeof paramsType == "undefined")
        return weatherParams.instant.concat(weatherParams.cumulative);
    else return weatherParams[paramsType];
}

module.exports = { buildExtractors, weatherParams, genDefaultFeatures, getParamType, getAllParams };