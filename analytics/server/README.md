# Prediction Server

Prediction server exposing an API to get predictions from the models.

## Install

See [pipeline's installation guide](../pipeline/README.md#install).

## Usage
To start the prediction server run:

```console
node analytics/server/server.js -c analytics/server/templates/server_configuration.json
```

with [server_configuration.json](templates/server_configuration.json) file.

To query the prediction server post request on `<Server URL>:<Server port>/predict` endpoint.

For example, getting prediction using [search query][search_query_wiki]:

```console
curl --location --request POST 'https://127.0.0.1:1337/predict' \
--header 'Content-Type: application/json' \
--data-raw '{
  "data": {
  	"search_query": {
        "$from": "Activities",
        "Timestamp": { "$or": ["2017-12-11T00:00:00.000Z","2017-12-10T00:00:00.000Z","2017-12-29T00:00:00.000Z", "2017-10-29T00:00:00.000Z", "2017-10-30T00:00:00.000Z"]},
        "Region": {"$or" : [
            "20228"
        ]},
        "$join": {
            "$name": "hadActivity",
            "$query": {
                "$from": "Keywords",
                "Id": [
                    "2952"
                ]
            }
        }
      }
  }
}'
```

### Server configuration file
Before running the server, prepare the server configuration file:
```json
{
    "host": "localhost",
    "port": 1337,
    "security": {
        "key": "<path>.key",
        "cert": "<path>.cert"
    },
    "model": "<path_to_model_dir>"
}
```

with parameters:

| Parameter                | Type                | Description            |
| ------------------- |:-------- |:---------------------------------  |
| host            | String              | Hostname. |
| port  | String              | Port that server listens to.               |
| security.key      | String             | Path to the private key of the server.   |
| security.cert      | String             | Path to the certificate containing the public key.   |
| model      | String             | Path to the model's directory.   |
## API
### Predictions with search query (POST /predict)

Filter subset of all records from the QMiner database and make the predictions. All features for the interested records must be available on the server. 

#### Parameters

| Parameter                | Type                 | Description     |
| ------------------- |:------------------|:----------------------  |
| data            | Object               | Data to be processed. |
| data.search_query  | Object                | [Search query][search_query_wiki] to filter records from the QMiner database and make the predictions. **Note: Features must exist for these records!**       |

**Example Request:**

```console
curl --location --request POST 'https://127.0.0.1:1337/predict' \
--header 'Content-Type: application/json' \
--data-raw '{
  "data": {
  	"search_query": {
        "$from": "Activities",
        "Timestamp": { "$or": ["2017-12-11T00:00:00.000Z","2017-12-10T00:00:00.000Z","2017-12-29T00:00:00.000Z", "2017-10-29T00:00:00.000Z", "2017-10-30T00:00:00.000Z"]},
        "Region": {"$or" : [
            "20228"
        ]},
        "$join": {
            "$name": "hadActivity",
            "$query": {
                "$from": "Keywords",
                "Id": [
                    "2952"
                ]
            }
        }
      }
  }
}'
```

Part of the sending data:

```json
{
    "data": {
        "search_query": {
            "$from": "Activities",
            "Timestamp": { 
                "$or": [
                    "2017-12-11T00:00:00.000Z",
                    "2017-12-10T00:00:00.000Z",
                    "2017-12-29T00:00:00.000Z",
                    "2017-10-29T00:00:00.000Z", 
                    "2017-10-30T00:00:00.000Z"
                ]
            },
            "Region": {
                "$or" : [
                    "20228"
                ]
            },
            "$join": {
                "$name": "hadActivity",
                "$query": {
                    "$from": "Keywords",
                    "Id": [
                        "2952"
                    ]
                }
            }
        }
    }
}
```

**Example Response:**

```json
{
    "data": [
        {
            "Timestamp": "2017-10-29T00:00:00",
            "Value": 8
        },
        {
            "Timestamp": "2017-10-30T00:00:00",
            "Value": 8
        },
        {
            "Timestamp": "2017-12-10T00:00:00",
            "Value": 9
        },
        {
            "Timestamp": "2017-12-11T00:00:00",
            "Value": 9
        },
        {
            "Timestamp": "2017-12-29T00:00:00",
            "Value": 8
        }
    ]
}
```
### Predictions with features (POST /predict)

Send features to the prediction server and get predictions.
Firstly, [retrieve scheme](#scheme-of-the-feature-space-get-schema) of the model's feature store, to define the request's records correctly.

#### Parameters

| Parameter                | Type                | Description     |
| ------------------------ |:------------------- | --------------- |
| data            | Object               | Data to be processed. |
| data.records  | Object               | Object with `FtrSpace` and `InputFeat` parameters. |
| data.records.FtrSpace      | List              | Feature values for every interested record (e.g. `[{<feat_name_1>: <feat_value_1>, <feat_name_2>: <feat_value_2>, ...},{ <record_feat_2> }, ...]`)  |
| data.records.InputFeat | List        | Record's private key names and values. Records should be in the same order as features in `data.records.FtrSpace`. |


**Example Request:**

```console
curl -k --location --request POST 'https://127.0.0.1:1337/predict' \
--header 'Content-Type: application/json' \
--data-raw @query_request_example
```

using [@query_request_example](templates/query_request_example.json).

Example query requests can be generated using the [script](gen_query_file.js):

```console
node analytics/server/gen_query_file.js -d "../data/models/ExampleModelv0.1" -o "./query_request_example.json"
```

**Example Response:**
```json
{
    "data": [
        {
            "Timestamp": "2017-12-11T00:00:00",
            "Value": 8.900060924404489
        },
        {
            "Timestamp": "2017-12-10T00:00:00",
            "Value": 8.830623024618358
        },
        {
            "Timestamp": "2017-12-29T00:00:00",
            "Value": 7.585460467856431
        },
        {
            "Timestamp": "2017-10-29T00:00:00",
            "Value": 8.423012005272668
        },
        {
            "Timestamp": "2017-10-30T00:00:00",
            "Value": 8.320639536871845
        }
    ]
}
```

### Scheme of the feature space (GET /schema)

Get schema of the model's feature store, to correctly define the request's records of the [POST /predict request](#predictions-with-features-post-predict).

**Example Request:**

```console
curl -k --location --request GET 'https://127.0.0.1:1337/schema' \
--header 'Content-Type: application/json'
```

**Example Response:**

See [scheme response](templates/scheme_response_example.json).

#### Response parameters

| Parameter                | Type                | Description    |
| ------------------------ |:------------------- |:-------------  |
| data            | Object               | Data to be processed. |
| data.scheme[0].name | String             | Name of the store. It should be **FtrSpace**.   |
| data.scheme[0].fields | List             | List of fields' parameters, such as name and type. |
| data.scheme[1].name | String             | Name of the store. It should be **InputFeat**.   |
| data.scheme[1].fields | List             | List of fields' parameters, such as name and type. |

## Server security

**Server security** is **not** implemented!

[search_query_wiki]: https://github.com/qminer/qminer/wiki/Query-Language