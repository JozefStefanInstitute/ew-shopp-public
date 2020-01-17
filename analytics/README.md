# Analytics runner
 
Analytics runner facilitates loading and storing data from various data collections using [Loader module][loader] and, 
with the use of [Pipeline module][pipeline], it enables feature extraction, model building and making predictions.
Currently, the script is focused on moving data between a shared MariaDB database and a local QMiner database (QMinerDB). 
It extracts features from given data set, enriches data with weather features, creates models, 
uploads model configurations to the shared database, fits all the models, makes predictions and uploads predictions back to the shared database.

To put it in other words - it combines [Loader][loader] and [Pipeline][pipeline] modules with logging and error handling mechanisms.

**⚠️ Note**: Because of the diversity of different use cases, it is advised to use [Loader][loader] and [Pipeline][pipeline] separately and not with analytics runner wrapper.

## Features
The script executes sub-tasks in the following order:
* Data preparation — downloads data from MariaDB, obtains weather data and stores it to QMinerDB. 
* Weather transformation — extracts all weather features.
* Other transformation — extracts all other features, using transformation configuration files.
* Models preparation — creates new models or uses matching model configurations in the local QMinerDB.
* Model — can be executed in
    * Fit-init mode — fits a new model with the historical data.
    * Fit mode — fits the existing model with the recent data.
    * Predict mode — makes predictions using the existing model.
* Report

## Naming convention
**Runner configuration file**

A JSON configuration file that specifies all model's configurations and loader's configurations that 
are needed to run [analytics runner](runner.js) successfully.
See [Configuration section](#configuration).

**Transformation configuration file**

A JSON configuration file that specifies feature extraction. It is used in the pipeline module.
See [pipeline module documentation][pipeline].

**Model/pipeline configuration file**

A JSON configuration file that specifies input extraction, model building and making model predictions in
a single pipeline configuration file. It is used in the pipeline module.
See [pipeline module documentation][pipeline].

**Loader configuration file**

A JSON configurations file that specifies how to move data between different data collections conveniently. 
Currently supports moving data between TSV files, MariaDB, ArangoDB and QMinerDB. The configuration file is used in the loader module.
See [loader module documentation][loader].
    
## Configuration
Example of the runner configuration file:

```json
{
    "use_case": "Prediction by categories - example",
    "models_configs_dir": "./usecase/example/models/predict",
    "models_dst_dir": "../data/usecase/example/models/",
    "transformations": {
        "weather": "./usecase/common/transformations/weather_transformation.json",
        "other": [
            "./usecase/example/transformations/categories_transformation.json"
        ]
    }
}
```

When executing [_runner.js_](runner.js) and no configuration file with option `--conf` is specified,
the default runner configuration file [_analytics/config/analytics_runner_default.json_](config/analytics_runner_default.json) is used.

#### Parameters

| Parameter                | Type                | Required | Description                                                 |
| ------------------- |:------------------- |:-------- |:----------------------------------------------------------  |
| use_case            | String              | No      | Name of the use case.                                       |
| models_configs_dir  | String              | Yes      | Directory with the model configuration files.               |
| models_dst_dir      | String              | Yes      | Directory to save model database and expected results.   |
| transformations     | Object              | Yes      | Transformations to be executed on data.                     |
| transformations.weather | String          | Yes      | Transformation configuration file to build weather features. |
| transformations.other   | List            | Yes      | List of transformation configuration files to extract features from the data that are specific to the use-case. |

Some options, when specifying `init`, will look for paths with `_init.json` suffix. Transformation configuration files with `_init.json` suffix must be provided in the same directory as an original configuration file.
Note that the path is automatically resolved and it should not be provided in the runner configuration file.

Example:
_./usecase/example/transformations/categories_transformation.json_ as original configuration file and
_./usecase/example/transformations/categories_transformation_init.json_ for initial fit.

Initialization transformation configuration files are usually used only once, to get features from the historical data and
to fit the initial model.
Afterwards, to make predictions and to fit on recent data, the transformation configuration file for recent data is used.

## Execution

```console
node analytics/runner.js [<model_conf_paths>] [<options>]
```

### Model configuration paths

Option _model_conf_paths_ are given paths to the model configuration files that are used in the pipeline module. It can be provided
as multiple model configuration file paths or as a single path to the directory containing the model configuration files.
If specified, these model configurations files are used instead of the ones in the `conf.models_configs_dir` directory.
See [Configuration section](#configuration).

### Options

All the following options can be passed to the script. They are divided into separate sections for better clarity.
If not specified otherwise, the default value of the following parameters is `false` and the matching sub-tasks will not be executed.

#### Configuration file

```console
--conf=<path/to/runner/config/file.json>
```

Path to the runner configuration file. Default: [_analytics_runner_default.json_](config/analytics_runner_default.json).
See [Configuration section](#configuration).

#### Data preparation

```console
--update-weather[=force]
```

Download weather for a specific date. Weather data for a specific date are stored into `db-weather-<YYYY-MM-DD>.tsv` file.
See [_weather_update.sh_](../scripts/weather_update.sh) script and modify it as necessary.

If `force` is specified, existing TSVs will be overwritten.

Note: Option `--date` must be set or the default value is used.

Prerequisite:
To get raw weather data with [_weather_update.sh_](../scripts/weather_update.sh) script you must have
installed and properly configured [weather-data API](https://github.com/JozefStefanInstitute/weather-data).

```console
--upload-weather[=init]
```

Upload raw weather data from TSV files to QMinerDB and MariaDB. By default, execution uses configuration files [_weather_store.json_][weather_store] and [_weather_qminer.json_][weather_qminer].
If `init` is specified, the configuration files [_weather_store_init.json_][weather_store] is used and 
`config.paths.weatherInitTsv` in the [_config.js_](config/config.js) is used as source TSV file to initialize raw weather QMinerDB.

Prerequisite: [_weather_store.json_][weather_store], [_weather_qminer.json_][weather_qminer] 
  [_weather_store_init.json_][weather_store] and `config.paths.weatherInitTsv` TSV file.

```console
--update-data[=init]
```

Download data, namely products and product states, from shared MariaDB for the specific date. Loader module uses loader's configuration file
[_prod_load.json_][product_load] with modified source query, that has `--date` value.

If `init` is specified, a new database is created and the existing one is overwritten. The loader module loads data using configurations in [_prod_load_init.json_][product_load_init].

Note: If `init` is specified, option `--date` is ignored.

Prerequisite:
[_prod_load.json_][product_load] and [_prod_load_init.json_][product_load_init].

```console
--prepare-data[=init]
```

Same effect as putting options `--update-weather`, `--upload-weather` and `--update-data` together.

#### Transformations

```console
--transform-weather[=init|new]
```

Extract weather features using the pipeline module.
The path to the configuration file is given in the parameter `transformations.weather` in the provided runner configuration file.
Default: [_weather_transformation.json_](../usecase/common/transformations/weather_transformation.json).

If `init` is specified, the weather features are built using the path, in the parameter `transformations.weather`,
with suffix `_init.json` (e.g. `./weather_transformation_init.json`).

If `new` is specified, the `transformations.weather` file is used as template and `start_date` parameter
 in the configurations is set to `--date` option and `end_date` to 7 days after.

Note: Option `--date` is optional. However, if not given, yesterday's date is used.

```console
--transform-other[=init]
```

Extract all other features, commonly specific to the use-case.
Paths to configuration files are given in the list `transformations.other` in the provided runner configuration file.

```console
--transform[=init]
```

The same effect as putting options `--transform-other` and `--transform-weather` together.

#### Modes

```console
--upload[=false|true]
```

Upload predictions and raw weather data to the shared database.

```console
--fit[=init]
```

Fit models to queried data. 

To extract the queried input data, `input_extraction.params.search_query` is used in the model configuration file.
However, `search_query.Timestamp` is set to `--date` and consequentially only the records for a given date are selected.

If `init` is specified and parameter `input_extraction.params.init_use_timestamp`, in the model configuration file, is 
set to `false` or not present, the parameter `search_query.Timestamp` is removed from the model configuration file. 
All records are queried without `Timestamp` constraints.

If `init` is specified and `input_extraction.params.init_use_timestamp` 
is set to `true`, untouched `search_query` is used.

```console
--predict[=init|conf]
```

Make predictions for each model on queried input data.

To extract queried input data, `input_extraction.params.search_query` is used in the model configuration file.
However, `search_query.Timestamp` is set to `--date` and consequentially only records for a given date are selected.

If `init` is specified, parameter `search_query` is removed from pipeline's configuration file. All records are queried from that store.

If `conf` is specified, untouched `search_query` is used.
 
```console
-d <specific_date>
--date=<specific_date>
```

A specific date is used to download new products, update weather, transform weather, fit and predict for a specific date.

Note: Option `--date` is optional. However, if not given, yesterday's date is used.

#### Miscellaneous

```console
-v [false|true]
--verbose[=false|true]
```

Verbose logging. Default: `true`.

```console
-r [false|true]
--report[=false|true]
```

Show a short report at the end of the script. Default: Value from `--verbose` option.

```console
--clear-logs
```

Remove all logs from previous executions of the script.

```console
--prepare-models[=use|upload|update|local-update]
```

Create or update model configuration files in the shared database and the local QMinerDB using locally stored
model configurations files.
The script searches for model configuration files using directory path given as parameter `conf.models_configs_dir` in the runner configuration file.

If `use` is specified, use model in the local QMinerDB.

If `upload` is specified, upload model configuration files to the shared database and the local QMinerDB. If one exists, skip it.

If `update` is specified, update model configuration files in the shared database and the local QMinerDB.

If `local-update` is specified, update model configuration files in the local QMinerDB.

Note: Parameter `models_configs_dir` set in the runner configuration file must point to the directory with at least one model configuration file or [_model_conf_paths_](#model-configuration-paths) options must be provided.

## Workflow example
### 1. Prerequisite
To run this example you need:

#### 1.1. Loader configuration files
See [_usecase/common/loader_](../usecase/common/loader) directory with preconfigured configuration files:

* [_weather_store.json_][weather_store] — stores weather data for a specific date from a TSV file to the shared database.
* [_weather_store_init.json_][weather_store_init] — stores historical weather data from a TSV file to the shared database.
* [_weather_qminer.json_][weather_qminer] — stores weather data for a specific date from a TSV file to raw weather data QMinerDB.
* [_model_store_dupl.json_][model_store] — stores model configuration files to the shared database.
* [_model_update.json_][model_update] — stores model configuration files to the shared database.
* [_model_load.json_][model_load] — loads models configurations from shared MariaDB to QMinerDB.
* [_pred_store.json_][prediction_store] — stores predictions to the shared database.
* [_prod_load_init.json_][product_load_init] — download products and products' states from the shared database.
* [_prod_load.json_][product_load] — download products and products' states for a specific date from the shared database.

Note: Fill in database credentials.

#### 1.2. Raw historical data
QMinerDB with historical data.
Default: [_../../data/dbs/ceBbDb/_](../../data/dbs/ceBbDb).

We can modify `input_db_history` parameter in [_categories_transformation.json_](../usecase/example/transformations/categories_transformation.json) and [_categories_transformation_init.json_](../usecase/example/transformations/categories_transformation_init.json).

#### 1.3. Raw weather database
QMinerDB with raw weather data.
Default: [_../../data/dbs/weatherDb/_](../../data/dbs/weatherDb).

We can modify `input_db` parameter in  [_weather_transformation.json_](../usecase/common/transformations/weather_transformation.json) and [_weather_transformation_init.json_](../usecase/common/transformations/weather_transformation_init.json).

#### 1.4. Weather-data API
In case we want to update the weather database and weather features we need to install [weather-data API](https://github.com/JozefStefanInstitute/weather-data), or at least have TSV files (`db-weather-<YYYY-MM-DD>.tsv`) with the raw weather data you are interested in.

### 2. Weather preparation

Before fitting models and making predictions you need raw weather data and weather features for all the dates you are interested in. Default location of the raw weather QMinerDB is [_../../data/dbs/weatherDb/_](../../data/dbs/weatherDb/) and the location of the weather feature QMinerDB is [_../../data/common/features/weatherFeaturesDb/_](../../data/common/features/weatherFeaturesDb/).

In case the weather databases are not initialized, execute:

```console
node ./analytics/runner.js --upload-weather=init --weather-transformations=init --conf=./usecase/example/analytics_runner.json
```

Obtaining weather data and extracting weather features are time-consuming operations.
To avoid executing latter operations again and again, use and update the latest copies of the existing databases (the raw weather QMinerDB and the weather feature QMinerDB).

To update weather database with the new data execute:

```console
node ./analytics/runner.js --date=<new_date> --upload-weather --weather-transformations=new --conf=./usecase/example/analytics_runner.json 
```

If you want to update weather data on a date interval use [_analytics_runner.sh_](../scripts/analytics_runner.sh). See example in the [analytics runner section](#using-analytics_runnersh-script).

### 3. Initial transformations and model fit

```console
node ./analytics/runner.js ./usecase/example/models/init/ --transform-other=init --fit=init --prepare-models=upload --conf=./usecase/example/analytics_runner.json
```
This command runs transformations on historical data using [_categories_transformations_init.json_](../usecase/example/transformations/categories_transformation_init.json) transformation configuration file and creates all models described in the [_usecase/example/models/init/_](../usecase/example/models/init). Directory `models_configs_dir`, given in the runner configuration file, is ignored.
Finally, all models fit using historical data and its model configuration files.

The models are also uploaded to the shared database. In case, we want to leave out uploading the model configuration files provide `--prepare-models=local-update`.

To make it easier, one can divide the command into two separate commands — one for executing transformations and one for the initial fit of the models.

Note: Transformations are performed once and are used for all models in the use-case.

### 4. Download recent data

```console
node ./analytics/runner.js --update-data=init --conf=./usecase/example/analytics_runner.json
```
This command downloads all records from `products` and `product_states` shared database tables. 
Currently, using this command is use-case specific to the tables in the shared database. 

Note: You need to provide [_prod_load_init.json_](../usecase/common/loader/_prod_load_init.json). See [loader configuration files](#11-loader-configuration-files).

### 5. Transformations of recent data
```console
node ./analytics/runner.js --transform-other --conf=./usecase/example/analytics_runner.json 
```

This extracts all features from the newly obtained data.

### 6. Upload/update model configurations

```console
node ./analytics/runner.js ./usecase/example/models/predict/ --prepare-models=upload --conf=./usecase/example/analytics_runner.json
```
Upload model configuration files to the shared database. If one exists, skip it.

```console
node ./analytics/runner.js ./usecase/example/models/predict/ --prepare-models=update  --conf=./usecase/example/analytics_runner.json
```
Update model configuration files in the shared database. If one exists, replace it.

In case the model configuration file for prediction is different from the one for fitting the model it is necessary to update the model configuration file in the database. Cases usually differ in `input-extraction` parameter.

### 7. Predictions

Make predictions on the new dataset and upload to the shared database — specify `--upload` option.
If we want to predict using the `input_extraction.params.search_query` in the model configuration file and predict on all extracted records at once, execute:

```console
node ./analytics/runner.js --prepare-models=update --predict=conf--conf=./usecase/example/analytics_runner.json 
```

This queries all records using  `input_extraction` search query from the model configuration file.
Note, that parameter `input_extraction.params.search_query` must be set correctly in the pipeline configuration file, especially `Timestamp`.
 
In case, we would like to predict on date interval use the [_analytics_runner.sh_](#using-analyticsrunnersh-script) script:

```console
bash ./scripts/analytics_runner.sh --interval <from> <to> --prepare-data --other-transformations --predict
```

The script extracts inputs for each date separately and predicts on each set. 
The search query is ignored in the model configuration file.

## Using `analytics_runner.sh` script

Script [_analytics_runner.sh_](../scripts/analytics_runner.sh) wraps similar commands we used in the previous example. However, it is useful when we need to use 
[_runner.js_](./runner.js) on the date interval.

For example, if we would like to update raw weather QMinerDB and calculate new weather transformations between dates `<from>` and `<to>`, we can run:

```console
bash ./scripts/analytics_runner.sh --interval <from> <to> --upload-weather --weather-transformations=new
```
or shortly:
```console
bash ./scripts/analytics_runner.sh --interval <from> <to> --weather
```

For more shortcuts see [_analytics_runner.sh_](../scripts/analytics_runner.sh).

The script runs [_runner.js_](./runner.js) separately for each date between `<from>` and `<to>`, inclusive, with `--upload-weather --weather-transformations=new` parameters. Obviously, the parameter `--date` is set accordingly.

Similarly, we can use [_analytics_runner.sh_](../scripts/analytics_runner.sh) script to run other supported commands that use `--date` parameter.

[pipeline]:./pipeline/README.md
[loader]:./loader/README.md
[weather_store]:../usecase/common/loader/weather_store.json
[weather_store_init]:../usecase/common/loader/weather_store_init.json
[weather_qminer]:../usecase/common/loader/weather_qminer.json
[model_store]:../usecase/common/loader/model_store_dupl.json
[model_update]:../usecase/common/loader/model_update.json
[model_load]:../usecase/common/loader/model_load.json
[prediction_store]:../usecase/common/loader/pred_store.json
[product_load_init]:../usecase/common/loader/prod_load_init.json
[product_load]:../usecase/common/loader/prod_load.json