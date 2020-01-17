# Weather Features 

## Install

To download weather data from the [ECMWF](https://www.ecmwf.int/) Meteorological Archival and Retrieval System (MARS) or the [OpenWeatherMap (OWM)](https://openweathermap.org/) use [weather-data tool](https://github.com/JozefStefanInstitute/weather-data).

To transform existing data from TSV files to weather features and use them within the analytics pipeline see [pipeline's installation guide](../pipeline/README.md#install).


## Usage

Weather features are used with the [pipeline script](../pipeline/README.md). 

### 1. Download weather data to TSV

To download weather data use [weather-data tool set](https://github.com/JozefStefanInstitute/weather-data).

#### Load TSV data to QMiner database

To load raw weather data from TSV use [Loader](../Loader/README.md).

### 2. Feature transformation

To calculate weather features run:

```console
node analytics/pipeline/pipeline_runner.js -m transform -d analytics/weather/config/weather_example.json
```

using an example JSON configuration file for weather feature transformation:

```json
{
    "name": "WeatherExample",
    "version": "0.1",
    "description": "Example for weather transformation",
    "transformation": [{
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
    }]
}
```

See parameter descriptions in [API description](#feature-transformation).

### 3. Feature selection

To select weather features, calculated in previous step, run:

```console
node analytics/pipeline/pipeline_runner.js -m transform -d analytics/weather/config/weather_example_fit.json
```

using fragment of a pipeline configuration file defining feature selection:

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

## API

### Feature transformation

**Module name**: weather_builder

**Description**: Used for building weather features from raw weather data.

**Parameters**:

| Parameter                | Type                | Description                                                 |
| ------------------- |:-------------------  |:----------------------------------------------------------  |
| input_db            | String              | Location of QMiner database with raw weather data, used to build features. |
| output_db         | String              | Location of QMiner database where features are stored.  |
| start_date | String  (*YYYY-MM-DD*) | First day of the interested time frame for which we want to calculate weather features. |
| end_date  | String   (*YYYY-MM-DD*) | Last day of the interested time frame for which we want to calculate weather features. |
| forecast_offsets  | List                | List of weather forecast offsets that should be used.    |
| regions     | List              | List of region IDs to use. |
| ranges.date      | List              | List of date ranges. |
| ranges.time      | List              | List of time ranges. |

### Feature selection

**Module name**: weather_feature_selector

**Description**: Used for selecting weather features built with weather_builder for modelling.

**Parameters**:

| Parameter                | Type                | Description                                                 |
| ------------------- |:-------------------  |:----------------------------------------------------------  |
| input_db            | String               | Location of the QMiner database containing prebuilt weather features. |
| forecast_offset  | Integer               | Forecast offset to use.    |
| regions     | List              | List of region IDs to use. |
| ranges.date      | List              | List of date ranges. |
| ranges.time      | List              | List of time ranges. |

---

### List of features 

Available weather parameters can be seen in [weather features documentation](https://github.com/JozefStefanInstitute/weather-data/wiki/Weather-features).
These parameters are now referred to as `<weather_param>`.

Built weather features are named as follows:
```
span_<aggregation>_<weather_param>_daterange<date_range>_timerange<range_time>__r<region_id>
```
with `max`, `min`, `sum`, `mean`, `diff` and `total` as `<aggregation>` types.

One feature is build for every type of `<aggregation>`, `<weather_param>`, given value in `ranges.date` (`<date_range>`), given value in `ranges.time` (`<time_range>`) and for every given value in `regions` (`<region_id>`).