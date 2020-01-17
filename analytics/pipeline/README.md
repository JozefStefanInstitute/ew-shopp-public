# Model building pipeline

Model building pipeline combines feature extraction and model building into a single pipeline. Each pipeline is described with a configuration file in JSON format.  

Pipeline can perform feature transformation, model training and prediction step. 

## Install

In the [./ew-shopp-public/](../..) directory run

```console
npm install
npm rebuild qminer --update-binary
```

to install all the necessary dependencies.

Note: Execute all node scripts from the [./ew-shopp-public/](../..) directory.

## Usage

Example of execution:

```console
node analytics/pipeline/pipeline_runner.js -m {transform,fit,predict} -d PATH_TO_CONFIG
```
Description of arguments:
| Argument                | Type                |  Description                                                 |
| ------------------- |:------------------- |:-------- |:----------------------------------------------------------  |
| -d            | String             | Path to the JSON configuration file.        |
| -m  | String                | Pipeline execution mode (fit, predict or transform).               |
## API 

### Feature transformation

```console
node analytics/pipeline/pipeline_runner.js -m transform -d PATH_TO_CONFIG
```

Currently supports [weather feature transformation](../weather/README.md) and [media attention feature transformation](../events/README.md). However, you can also provide your script to transform data and define a JSON configuration file structured as follows:

```json
{
    "name": "<transformation_name>",
    "version": "<transformation_version>",
    "description": "<transformation_short_description>",
    "transformation": [
        {
            "module": "<path_to_module_script_from_pipeline_runner>",
            "params": {
                "input_db": "<path_to_input_database>",
                "output_db": "<path_to_output_database>",
                ...
            }
        }
    ]
}

```
#### Custom module
The script `analytics/pipeline/pipeline_runner.js` with mode `-m transform` will try to execute function `function exec(params) {...}` inside your custom script `module` and pass all the parameters defined within `params` parameter. As an example of such script please see [weather_builder.js](./modules/weather_builder.js)

---

### Fit/Predict

Pipeline is specified with a single file in JSON format. 
The main building block of the pipeline is a [**module**](#modules) (see below).

A configuration file is specified in a JSON format and structured as follows:

```json
{
    "name": "<model_name>",
    "version": "<model_version>",
    "description": "<model_short_description>",
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

| Parameter                | Type                | Required | Description                                                 |
| ------------------- |:------------------- |:-------- |:----------------------------------------------------------  |
| name            | String              | Yes      | Name (unique identifier) of the pipeline.            |
| version  | String                | No      | Version of the pipeline (user specified).               |
| description      | String              | No      | Short description.   |
| pipeline | Object          | Yes      | Body of the pipeline specifying input handling, feature extraction and modelling. |
| pipeline.input.primary_key     | List              | Yes      | Primary key (unique identification fields) of each record from the input.                      |
| pipeline.extraction | List          | Yes      | List of modules performing feature extraction. |
| pipeline.model |  Object          | Yes      | Module performing data modelling. |
| input_extraction |  Object          | Yes      | Module populating pipeline's input. |

## Modules
Module is the main building block of the pipeline. It is a custom JavaScript class that executes a specific operation. Input to the module should be stored in a QMiner database and after module finishes with the execution it stores the result in the specified output database (to a fixed store with predefined name). Each module has its own set of configurable parameters.

## List of modules
Modules are used for input extraction and model fitting and everything in between.

### Weather
See [weather module documentation](..\weather\README.md).
### Media attention 
See [media attention module documentation](..\events\README.md).

### Generic feature selector

**Module name**: generic_feature_selector

**Description**: Used for selecting prebuilt features from given QMiner Database.

**Parameters**:

| Parameter                | Type                |  Required        |        Description                                                 |
| ------------------- |:------------------- |:-------------------|:----------------------------------------------------------  |
| input_db            | String              | Yes |Location of the QMiner database containing prebuilt features. |
| input_store  | String               | Yes, if `search_query` is not defined  | Name of the store containing features.    |
| search_query    | List             | No | QMiner search query to filter records from feature store. |
| features    | List             | No | Names of the feature fields. Strings in the list can also be given as regex expressions (i.e. "features": ["span_.*"]). |
| not_features    | List             | No | Names of the fields not consider as features. Strings in the list can also be given as regex expressions (i.e. "not_features": ["Time.*"]). |

#### Example:
```json
{
    "module": "generic_feature_selector",
    "params": {
        "input_db": "sales_db",
        "input_store": "discounts",
        "features": [
            "Seller", "Brand", "Price", "Discount"
        ]
    }
}
```

Parameter `search_query` is set to filter out only the relevant records from feature stores, while 
the `features` parameter sets which fields (features) to use.

### Support vector regression model (SVR) 
**Module name**: SVR

**Description**: Support vector regression model

**Parameters**:

| Parameter                | Type                | Description                                                 |
| ------------------- |:------------------- |:----------------------------------------------------------  |
| SVM_param            | Object              |  Hyperparameters of the model described in detail in [QMiner's documentation](https://rawgit.com/qminer/qminer/master/nodedoc/module-analytics.html#~SVMParam). |
| score  | String                |  Model validation method (currently only "cv" - cross-validation).    |
| model_filename    | String              | File to save model to. |

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
