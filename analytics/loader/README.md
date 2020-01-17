# Data loader

The data loading module transports data from different sources into various databases.
Four types of sources are currently supported: [ArangoDB][ArangoDB], [MariaDB][MariaDB], 
[QMiner base][QMBase] and a comma-separated values (CSV) file. 
And three types of destination databases: MariaDB, ArangoDB and QMiner base.
The entire transfer operation is specified in a configuration JSON which is given to the module 
`data_loader.js` as parameter `-d <configuration_file_path>`.

## Install

See [pipeline's installation guide](../pipeline/README.md#install).

## Configurations
The configuration file is provided to move data from source to destination.
First, the process connects to the source and destination. In the case, QMiner base is set as a destination all queries
are checked for `"use_schema"` flag and used to create new stores.
Second, the queries are executed in the given order in the `"queries"` list. 
Each query `"query_src.query"` collects records from one source and transfers them into a destination database store.
Finally, the connections are closed.

The configuration must be structured as follows:
```json
{
    "source": { ... },
    "destination": { ... },
    "queries": [
        { ... },
        { ... },
        ...
    ],
    "misc": { ... }
}
```

These top-level fields are described in the following table. 

#### Parameters

| Parameter                | Type                | Required | Description                                                 |
| ------------------- |:------------------- |:-------- |:----------------------------------------------------------  |
| source              | Object              | Yes      | Parameters to set up the source from which data will be loaded. [See details](#source-and-destination). |
| destination         | Object              | Yes      | Parameters to set up the destination to which data will be stored. |
| queries             | List                | Yes      | List of queries that will be executed.                      |
| misc                | Object              | No       | Miscellaneous options.                                      |

The source/destination parameters vary depending on the source/destination type. However, all types must have defined `type` parameter.

### source and destination

| Parameter                | Type                | Required   | Use case         | Description                                                 |
| ------------------- |:------------------- |:---------- |:---------------- |:----------------------------------------------------------  |
| type                | String              | Yes | All               | Type of source/destination. Possible values: [`"Csv" `, `"QminerDB"`, `"ArangoDB"`, `"MariaDB"`]. |
| host                | String              | Yes | MariaDB, ArangoDb | The hostname of the database you are connecting to.         |
| database            | String              | Yes | MariaDB, ArangoDb | Name of the database to use in these queries.               |
| user                | String              | Yes | MariaDB, ArangoDb | The user to authenticate as.                                |
| password            | String              | Yes | MariaDB, ArangoDb | The password of that user.                                  |
| db_path             | String              | Yes | QMiner base       | The path to QMiner db directory.                            |
| mode                | String              | No  | QMiner base       | Base access mode. Default is `"openReadOnly"`. Access modes are the same as described in [QMiner base constructor][QMBaseConstr], with additional `"extend"` option, which appends new schemas, defined in `queries`, to existing QMiner db. |
| dir                 | String              | No  | Csv               | Directory in which CSV file is placed. |
| filename            | String              | Yes | Csv               | Filename or filepath to CSV file. Relative path from `"dir"` if defined. |
| custom_fn_path      | String              | No  | Csv               | Filename or filepath to file with custom functions. |


### queries
Parameter `queries` has a list of queries where a query is defined with the following parameters:

| Parameter                | Type                | Required | Use case        | Description                                                 |
| ------------------- |:------------------- |:---------|:------------ |:----------------------------------------------------------  |
| name                | String              | Yes | All               | Name of the query. Note: When using ArangoDB as a source and query_src is not provided, this name is used as collection name to get all documents. |
| use_query           | Boolean             | Yes | All               | Flag to use this query. |
| use_schema          | Boolean             | Yes | All               | When QMiner base is used as destination and `"mode"` is set to `"createClean"`, `"create"` or `"extend"`, this flag indicates to use schema, defined in `"mapping.schema"`, to build a new store in QMiner base. |
| query_src           | Object              | Yes | MariaDB, ArangoDb, QMiner, Csv (optional) | Object with parameters to query source. |
| query_dst           | Object              | Yes | MariaDB or ArangoDb as a destination | Object with parameters to query destination. |
| mapping             | List                | Yes | QMiner base as a destination | List of objects used for mapping. [See Mapping](#Mapping). |
| schema              | List                | Yes | QMiner base as a destination | Store schema definitions to be created in QMiner base if flag `"use_schema"` is set. The definition of `"schema"` is the same as in [QMiner store schema definition][QMStore].

#### query_src and query_dst
Querying different sources and destinations varies from case to case. 

Parameters:

| Parameter                | Type                | Required | Use case         | Description                                                 |
| ------------------- |:------------------- |:---------|:---------------- |:----------------------------------------------------------  |
| query               | String              | Yes | MariaDB, ArangoDB    | Query string to query source or destination. [ArangoDB query language][AQL] or SQL string. |
| placeholder_mapping | String              | No  | MariaDB, ArangoDB    | Values from collected records to be mapped to values in a query. Note: In case you want to use fixed value for all records to be stored, place `{"mode": "fixed", "value":<value_you_want>}` on desired position. |
| read_line_fn        | String              | No  | Csv                   | Name of the custom function.                                |
| read_line_fn_args   | List                | No  | Csv                   | Additional arguments to custom function.                    |

##### CSV
By default, when querying CSV file, each line is read and destination `"query"` is executed to store the record. In
 order to filter or edit CSV line before storing it into destination base, you can define custom functions. 
 Set `"read_line_fn"` to name of the custom function. Furthermore, `"custom_fn_path"` must be set in the `"source"` 
 parameter, showing the path to the file with custom functions.

A custom function can be defined in two ways - with returning record or with a query to the destination database.
In case of passing two parameters, it is assumed, that function returns processed record. The first parameter is a list
 of values of the current CSV line and the second parameter is a list of additional arguments passed via `"read_line_fn_args"`.
On the contrary, when a custom function has three parameters, the first parameter is a connection to the destination database.
Therefore, a custom function must store CSV line to the destination database and the `"query_dst"` field is ignored.

##### MariaDB
To query MariaDB as a destination you must provide `"query"` and optional `"placeholde_mapping"`. Parameter `"query"` 
is simply SQL string with optional placeholder values.
Multiple placeholders must match with fields/columns of collected records from a source and are mapped to values in the same order as passed.

**Caution** This differs from prepared statements in that all ? are replaced, even those contained in comments and strings.

Example: 
```json
{
    "query_dst": {
        "query": "UPDATE predictions SET Prediction = ?, Timestamp = ? WHERE EventID = ?",
        "placeholder_mapping": [
            "prediction",
            "timestamp",
            "eventID"
        ]
    }
}
```

##### ArangoDB
Querying records from ArangoDB is done with [ArangoDB query language][AQL].

Example:
```json
{
    "query_src": {
        "query": "FOR forecast IN `slovenia-weather` RETURN forecast"
    }
}
```

Result of this query are all documents/records from *slovenia-weather*.

##### QMiner base
Querying records from QMiner store is done with [QMiner query language][QMQuery]. Example:
```json
{
    "query_src": {
        "$from": "WeatherPredictions",
        "timestamp": "2018-06-14T14:34:00.000Z",
        "eventID": "1"
    }
}
```

**Caution** To avoid any problems use ISO format to define datetime (e.g. `2018-06-12T14:34:00.000Z`).

#### Mapping
Each object in the `mapping` list has name of the store and defined `fields` parameter. Each field object is wrapped 
in the name of the source column. 

Parameters:

| Parameter                | Type                | Required | Description                                                 |
| ------------------- |:------------------- |:---------|:----------------------------------------------------------|
| name                | String              | Yes      | Name of the store in QMiner base. |
| fields              | Object              | Yes      | Mapping object. Each key is set to name of the source column and value is set to suitable QMiner store field [String]. In case of needing additional parameters, value can also be an object [Object]. |
| fields.<source_column>.name               | String   | No       | Name of the QMiner store field.                  |
| fields.<source_column>.null_values        | List     | No       | Values that are mapped as null values.      |

For example, if we have schema defined as
```json
{
    "schema": [
        {
            "name": "Example",
            "fields": [
                {
                    "name": "eventID",
                    "type": "string"
                },
                {
                    "name": "desc",
                    "type": "string",
                    "null": true
                }
            ]
        }
    ]
}
``` 

and let’s say we would like to map string values from `"EventID"` column 
in the source to a QMiner record field `"eventID"` and `"Desc"` column to `"desc"`.
The standard QMiner field specification object is wrapped in an object with the source column name as follows: 
```json
{
    "mapping": [
        {
            "name": "Example",
            "fields": {
                "EventID": "eventID",
                "Desc": {
                    "name": "desc",
                    "null_values": ["NULL", ""]
                }
            }
        }
    ]
}
```

### misc
Currently, miscellaneous options only control the logging verbosity.

| Parameter                | Type                | Required                | Description                                                 |
| ------------------- |:------------------- |:----------------------- |:----------------------------------------------------------  |
| verbose             | Boolean             | No                      | Verbose logging. Default: `false`                     |


## Examples

### CSV to QMiner base
A simple example to load weather data from CSV file to QMiner base:
```json
{
    "source": {
        "type": "Csv",
        "dir": "../data/",
        "filename": "slovenia-2014-2017_qminer.tsv"
    },
    "destination": {
        "type": "QminerDB",
        "db_path": "./dbWeather/",
        "mode": "createClean"
    },
    "queries": [
        {
            "name": "Example Schema",
            "use_query": true,
            "use_schema": true,
             "mapping": [
                {
                    "name": "weather",
                    "fields": {
                        "param": "Param",
                        "timestamp": "Timestamp",
                        "dayOffset": "DayOffset",
                        "region": "Region",
                        "value": "Value"
                    }
                }
            ],
            "schema": [
                {
                    "name": "weather",
                    "fields": [
                        {
                            "name": "Param",
                            "type": "string"
                        }, {
                            "name": "Timestamp",
                            "type": "datetime"
                        }, {
                            "name": "DayOffset",
                            "type": "int"
                        }, {
                            "name": "Region",
                            "type": "int"
                        }, {
                            "name": "Value",
                            "type": "float"
                        }
                    ]
                }
            ]
        }
    ],
    "misc": {
        "verbose": true
    }
}
```
In this example, the QMiner base is created and each line from CSV file is stored to QMiner store named "weather" according to defined mapping.

### CSV to MariaDB

In the following example, the data is loaded from CSV file and stored into MariaDB database. 
For each line in CSV file function *"onWeatherLine"* is executed.

Example of custom function with returning record:
```js
function onWeatherLine(lineVals, args) {
    const timestamp =  new Date(lineVals[3]);
    const date = new Date(args[0]);
    // Return null and skip the line
    if (timestamp.getTime() !== date.getTime()) return null;
    return {
        eventID: lineVals[0],
        timestamp: timestamp,
        prediction: lineVals[2],
    };
}

// Used custom functions must be exported
module.exports = { onWeatherLine }; 
```

A CSV file is specified as follows:

| eventID| 	weather	| prediction | 	timestamp               |
| ------ |:-------- |:---------- |:-----------------------  |
|1       |	good    | 0          | 2018-06-14T14:34:00.000Z |
|1       |	good    | 1          | 2018-06-15T14:34:00.000Z |
|2       |	bad	    | 0	         | 2018-06-12T14:34:00.000Z |
|0       |	good    | 1          | 2018-06-15T14:34:00.000Z |


Configuration JSON:
```json
{
    "source": {
        "type": "Csv",
        "dir": "../data/",
        "filename": "example.tsv",
        "custom_fn_path": "./templates/custom_fn.js"
    },
    "destination": {
        "type": "MariaDB",
        "host": "localhost",
        "database": "example",
        "user": "root",
        "password": "root"
    },
    "queries": [
        {
            "name": "Weather predictions",
            "use_query": true,
            "use_schema": false,
            "query_src":{
                "read_line_fn": "onWeatherLine",
                "read_line_fn_args": ["2018-06-15T14:34:00.000Z"]
            },
            "query_dst": {
                "query": "UPDATE predictions SET Prediction = ?, Timestamp = ? WHERE EventID = ?",
                "placeholder_mapping": [
                    "prediction",
                    "timestamp",
                    "eventID"
                ]
            }
        }
    ],
    "misc": {
        "verbose": true
    }
}
```

In this example, data loader uses all lines from CSV file with the timestamp *2018-06-15T14:34:00.000Z* to update records in MariaDB database.
All records with `EventID == 1` in the `example` database have updated fields `Prediction = 1` and `Timestamp = "2018-06-15 14:34:00"`.
Likewise, records with `EventID == 0`.

### QMiner base to MariaDB

```json
{
    "source": {
        "type": "QminerDB",
        "db_path": "./dbExample/",
        "mode": "open"
    },
    "destination": {
        "type": "MariaDB",
        "host": "localhost",
        "database": "example",
        "user": "root",
        "password": "root"
    },
    "queries": [
        {
            "name": "Weather predictions",
            "use_query": true,
            "use_schema": false,
            "query_src": {
                "$from": "WeatherPredictions",
                "timestamp": "2018-06-14T00:00:00.000Z",
                "eventID": "1"
            },
            "query_dst": {
                "query": "UPDATE predictions SET Prediction = ?, Timestamp = ?, Weather = ? WHERE EventID = ?",
                "placeholder_mapping": [
                    "prediction",
                    "timestamp",
                    {"mode":"fixed", "value":"good"},
                    "eventID"
                ]
            }
        }
    ],
    "misc": {
        "verbose": true
    }
}
```
All records in the destination base are going to be updated with matching records from `query_src`.
The destination record will get source record's `prediction` and `timestamp`. However, `Weather` parameter 
will be updated to `"good"` for all matching destination records.

### MariaDB to QMiner base

```json
{
    "destination": {
        "type": "QminerDB",
        "db_path": "./dbExample/",
        "mode": "open"
    },
    "source": {
        "type": "MariaDB",
        "host": "localhost",
        "database": "example",
        "user": "root",
        "password": "root"
    },
    "queries": [
        {
            "name": "Weather predictions",
            "use_query": true,
            "use_schema": false,
            "query_src": {
                "query": "SELECT * FROM predictions WHERE EventID = 3"
            },
            "mapping": [
                {
                    "name": "WeatherPredictions",
                    "fields": {
                        "EventID": "eventID",
                        "Prediction": "prediction",
                        "Timestamp": "timestamp",
                        "Weather": "weather"
                    }
                }
            ],
            "schema": [
                {
                    "name": "WeatherPredictions",
                    "fields": [
                        {
                            "name": "eventID",
                            "type": "string"
                        }, {
                            "name": "prediction",
                            "type": "int"
                        }, {
                            "name": "timestamp",
                            "type": "datetime"
                        }, {
                            "name": "weather",
                            "type": "string",
                            "shortstring": true,
                            "codebook": true
                        }
                    ],
                    "joins": [
                    ],
                    "keys": [
                        {
                            "field": "timestamp",
                            "type": "linear"
                        }, {
                            "field": "eventID",
                            "type": "value"
                        }
                    ]
                }
            ]
        }
    ],
    "misc": {
        "verbose": true
    }
}
```

### ArangoDB to QMiner base

```json
{
    "source": {
        "type": "ArangoDB",
        "host": "http://127.0.0.1:8529",
        "database": "_system",
        "user": "root",
        "password": "root"
    },
    "destination": {
        "type": "QminerDB",
        "db_path": "./dbExample/",
        "mode": "open"
    },
    "queries": [
        {
            "name": "SloveniaWeather",
            "query_src": {
                "query": "FOR forecast IN `slovenia-weather` RETURN forecast"
            },
            "use_query": true,
            "use_schema": true,
            "mapping": [
                {
                    "name": "SloveniaWeather",
                    "fields": {
                        "Param": "param",
                        "Value": "value",
                        "Timestamp": "timestamp",
                        "Region": "region",
                        "DayOffset": "dayOffset"
                    }
                }
            ],
            "schema": [
                {
                    "name": "SloveniaWeather",
                    "fields": [
                        {
                            "name": "param",
                            "type": "string",
                            "shortstring": true
                        }, {
                            "name": "value",
                            "type": "float"
                        }, {
                            "name": "timestamp",
                            "type": "datetime"
                        }, {
                            "name": "region",
                            "type": "int"
                        }, {
                            "name": "dayOffset",
                            "type": "int"
                        }
                    ],
                    "joins": [
                    ],
                    "keys": [
                        {
                            "field": "timestamp",
                            "type": "linear"
                        }, {
                            "field": "param",
                            "type": "value"
                        }
                    ]
                }
            ]
        }
    ],
    "misc": {
        "verbose": true
    }
}
```

[ArangoDB]:http://www.arangodb.com
[MariaDB]:http://mariadb.org
[QMStore]:https://rawgit.com/qminer/qminer/master/nodedoc/module-qm.html#~SchemaDef
[QMBaseConstr]:https://rawgit.com/qminer/qminer/master/nodedoc/module-qm.html#~BaseConstructorParam
[QMBase]:https://rawgit.com/qminer/qminer/master/nodedoc/module-qm.Base.html
[QMQuery]:https://github.com/qminer/qminer/wiki/Query-Language
[AQL]:https://docs.arangodb.com/devel/AQL/DataQueries.html