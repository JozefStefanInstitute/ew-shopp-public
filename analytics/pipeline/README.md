# Model building pipeline
Combines feature extraction and model building into a single pipeline. Each pipeline is described with a configuration file in json format.  

Pipeline performs feature transformation, model training and prediction step. 

## Configuration
Pipeline is specified with a single file in JSON format. 
The main building block of the pipeline is a **module** (see below).

Configuration file in specified in JSON format and structured as follows:

```json
{
    "name": "SalesReg",
    "version": "0.1",
    "description": "Sales regression using weather features.",
    "pipeline": {
        "input": {
            "primary_key": ["Timestamp"]
        },
        "extraction": [
            ...
        ],
        "model": {
            ...
        }
    },
    "input_extraction": {
        ...
    }
}
```

#### Parameters

| Name                | Type                | Required | Description                                                 |
| ------------------- |:------------------- |:-------- |:----------------------------------------------------------  |
| name            | String              | Yes      | Name (unique identifier) of the pipeline.            |
| version  | String                | No      | Version of the pipeline (user specified).               |
| description      | String              | No      | Short description.   |
| pipeline | Object          | Yes      | Body of the pipeline specifying input handling, feature extraction and modelling. |
| pipeline.input.primary_key     | List              | Yes      | Primary key (unique identification fields) of each record from the input.                      |
| pipeline.extraction | List          | Yes      | List of modules performing feature extraction. |
| pipeline.model |  Object          | Yes      | Module performing data modelling. |
| input_extraction |  Object          | Yes      | Module populating pipeline's input. |

## Execution
Once specified pipeline is executed via **pipeline_runner** script which accepts the following parameters:

| Flag                | Type                | Required | Description                                                 |
| ------------------- |:------------------- |:-------- |:----------------------------------------------------------  |
| -d            | String              | Yes      | path to configuration json file.        |
| -m  | String                | Yes      | Pipeline execution mode (fit or predict).               |

Example of execution:

```console
$ node analytics/pipeline/pipeline_runner.js -d sales_reg.json -m fit
```

## Modules
Module is the main building block of the pipeline. It is a custom javascript class that executes a specific operation. Input to the module should be stored in a QMiner database and after module finishes with the execution it stores the result in the specified output database (to a fixed store with predefined name). Each module has its own set of configurable parameters.

## List of modules
Modules are used for input extraction and model fitting and everything in between.

### Weather builder
**Module name**: weather_builder

**Description**: Used for building weather features from raw weather data
#### Parameters:
| Name                | Type                | Required | Description                                                 |
| ------------------- |:------------------- |:-------- |:----------------------------------------------------------  |
| inputDb            | String              | Yes      | Location of the QMiner database containg raw weather data. |
| outputDb         | String              | Yes      | Location of the QMiner database where result is stored.  |
| forecastOffsets  | List                | Yes      | List of weather forecast offsets that should be used.    |
| ranges.date      | List              |  Yes    | List of date ranges. |
| ranges.time      | List              |  Yes    | List of time ranges. |

#### Example:
```json
{
    "module": "weather_builder",
    "params": {
        "input_db": "weatherDb",
        "output_db": "weatherFeaturesDb",
        "start_date": "2014-1-1",
        "end_date": "2017-12-31",
        "forecastOffsets": [-7, -6, -5, -4, -3, -2, -1, 0],
        "regions": [5, 8, 10, 11, 12],
        "ranges": {
            "date": [
                [-4, 0], [-3, 0], [-2, 0], [-1, 0]
            ],
            "time": [
                [0, 23]
            ]
        }
    }
}
```
### Weather feature selector
**Module name**: weather_feature_selector

**Description**: Used for selecting weather features built with weather_builder for modelling.
#### Parameters:
| Name                | Type                | Required | Description                                                 |
| ------------------- |:------------------- |:-------- |:----------------------------------------------------------  |
| inputDb            | String              | Yes      | Location of the QMiner database containg prebuilt weather features. |
| forecastOffset  | Int                | Yes      | Forecast offset to use.    |
| ranges.date      | List              |  Yes    | List of date ranges. |
| ranges.time      | List              |  Yes    | List of time ranges. |

#### Example:
```json
{
    "module": "weather_feature_selector",
    "params": {
        "input_db": "weatherFeaturesDb",
        "forecast_offset": -2,
        "regions": [5, 8, 10, 11, 12],
        "ranges": {
            "date": [
                [-4, 0], [-3, 0]
            ],
            "time": [
                [0, 23]
            ]
        }
    }
}
```
### Generic feature selector
**Module name**: generic_feature_selector

**Description**: Used for selecting prebuilt features from give Qminer Db.
#### Parameters:
| Name                | Type                | Required | Description                                                 |
| ------------------- |:------------------- |:-------- |:----------------------------------------------------------  |
| inputDb            | String              | Yes      | Location of the QMiner database containg prebuilt features. |
| input_store  | String                | Yes      | Name of the store containing features.    |
| features    | List              |  Yes    | Name of the feature fields. |

#### Example:
```json
{
    "module": "generic_feature_selector",
    "params": {
        "input_db": "SalesDb",
        "input_store": "discounts",
        "features": [
            "Seller", "Brand", "Price", "Discount"
        ]
    }
}
```
### Support vector regression model (SVR) 
**Module name**: SVR

**Description**: Support vector regression model
#### Parameters:
| Name                | Type                | Required | Description                                                 |
| ------------------- |:------------------- |:-------- |:----------------------------------------------------------  |
| SVM_param            | Object              | Yes      | Hyperparameters of the model described in detail in [QMiner's documentation](https://rawgit.com/qminer/qminer/master/nodedoc/module-analytics.html#~SVMParam) |
| score  | String                | Yes      | Model validation method (currently only "cv" - cross-validation)    |
| model_filename    | String              |  Yes    | File to save model to. |

#### Example:
```json
{
    "module": "SVR",
    "params": {
        "SVM_param": {
            "algorithm": "LIBSVM",
            "c": 10,
            "j": 3,
            "kernel": "POLY"
        },
        "score": "cv",
        "verbose": true,
        "model_filename": "regressor.model"
    }
}
```
