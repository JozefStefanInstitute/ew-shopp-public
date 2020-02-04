# Media Attention Features 

The media attention tool collects data regarding the level of media content (in number of articles, events and date mentions) focusing on some given concept during a specified time period. The data is obtained by querying the Event Registry service and then distilling the information into the key features relevant for measurement of media attention.

## Install

See [pipeline's installation guide](../pipeline/README.md#install).

### Set EventRegistry API key

To download events and articles from EventRegistry ([Download from EventRegistry](#1-download-from-eventregistry)) and calculate media coverage features from it, you need to provide an EventRegistry API key in the [config.js](../../analytics/config/config.js#L16):

```js
config.eventRegisty = {
    apiKey:  process.env.EVENTREGISTRY_KEY || "your_key",
};
```

## Usage

Media attention features are used with the [pipeline script](../pipeline/README.md). We define JSON configuration file for media attention **feature transformation** and one JSON configuration file for media attention **feature selection** during the fit and/or predict phase.

### 1. Download from EventRegistry
Article and event information are usually downloaded when building features. See [*Feature transformation*](#feature-transformation) 
section.

However, you can define queries and download EventRegistry data using [EventRegistry Node.js API](https://github.com/EventRegistry/event-registry-node-js).

### 2. Feature transformation 

To download interested events from EventRegistry and calculate media attention features run:

```console
node analytics/pipeline/pipeline_runner.js -m transform -d analytics/events/config/media_attention_example.json
```

using JSON configuration file for media attention feature transformation:

```json
{
    "name": "MediaAttentionExample",
    "version": "0.1",
    "description": "Extracting media attention features for 2017 for 2 concepts within Germany",
    "transformation": [
        {
            "module": "../events/events_features",
            "params": {
                "download": true,
                "input_db": "../data/usecase/common/dbs/eventsDb",
                "output_db": "../data/usecase/common/features/eventsFeaturesDb",
                "output_conf_db": "./analytics/events/configEventsFeaturesDb.json",
                "clean_db": true,
                "queries": [
                    {
                        "keyword": "Association football",
                        "locations": ["Germany"],
                        "start_date": "2017-01-01",
                        "end_date": "2017-12-30",
                        "event_feature_id": "FootballGermany"
                    },
                    {
                        "keyword": "Music",
                        "locations": ["Germany"],
                        "start_date": "2017-01-01",
                        "end_date": "2017-12-30",
                        "event_feature_id": "MusicGermany"
                    }
                ]
            }
        }
    ]
}
```
Before execution you must properly define parameters in 
[media_attention_example.json](./config/media_attention_example.json) configuration file. See [API documentation](#api) with described parameters.

Considering this example using [media_attention_example.json](./config/media_attention_example.json), we are 
calculating media attention features for `'Association football'` concept from `2017-01-01` to `2017-12-30` in
 Germany and features for `'Music'` concept for the same time frame and location. 


### 3. Feature selection

To select media attention features, calculated in previous step, run:

```console
node analytics/pipeline/pipeline_runner.js -m fit -d ./events/config/media_attention_fit.json
```

using fragment of a pipeline configuration file defining feature selection:

```json
{
    "module": "generic_feature_selector",
    "params": {
        "input_db": "../data/usecase/common/features/eventsFeaturesDb",
        "forecast_offset": -1,
        "search_query": {
            "$from": "EventsFeatures",
            "EventFeatureId": "FootballGermany"
        },
        "features": [
            "EventsCounts",
            "ArticlesCounts",
            "MentionedArticlesCurrent",
            "MentionedEventsCurrent",
            "ArticlesCountsPastMax",
            "ArticlesCountsPastMin",
            "EventsCountsPastMax",
            "EventsCountsPastMin",
            "ArticlesCountsPastAvg",
            "EventsCountsPastAvg",
            "MentionedEventsFuture",
            "MentionedArticlesFuture",
            "MentionedArticlesFuture1",
            "MentionedEventsFuture1"
        ],
        "normalize": "scale"
    }
}
```

In this example we used only media attention features for the `'Association football'` concept with `EventFeatureId = FootballGermany` defined during [feature transformation](./config/media_attention_example.json#L20).

With parameter `features` we defined subset of [media attention features](#list-of-features) we want to use.

## API

### Feature transformation 

**Module name**: ../events/events_features

**Description**: Used for download events and articles data from EventRegistry and building media attention features.

**Example**: Feature transformation [configuration file](./config/media_attention_example.json).

**Parameters**:

| Parameter | Type                | Description |
| --------- |:-------- |:----------------------------------------------------------  |
| input_db  | String   | Location of QMiner database with raw media attention data, used to build features (e.g. [*eventsDb/*](../../../data/usecase/common/dbs/eventsDb)). |
| output_db | String   | Location of QMiner database where features are stored (e.g. [*eventsFeaturesDb/*](../../../data/usecase/common/features/eventsFeaturesDb)).            |
| download  | Boolean  | Boolean to query the EventRegistry. Otherwise, script calculates features on previously downloaded information. |
| clean_db  | Boolean  | Removes existing QMiner database storing events' features and creates new. |
| queries    | List    | List of queries to be executed. Each query defines keyword, location and time frame. |

The most relevant parameters for a specific event's query:

| Parameter | Type                | Description |
| --------- |:-------- |:----------------------------------------------------------  |
| keyword   | String   | Interested category, Wikipedia concept, matching the cluster centroid. |
| locations | List    | List of source locations acceptable to retrieve articles and events. |
| start_date | String  (*YYYY-MM-DD*) | First day of the interested time frame for which we want to calculate media attention features. |
| end_date  | String   (*YYYY-MM-DD*) | Last day of the interested time frame for which we want to calculate media attention features. |
| event_feature_id | String | Identifier to filter features in the feature selection phase. |

Note: Downloading of articles and events might take a long time. 

##### Mapping 
The mapping between the event's concepts and cluster centroids (categories) is done manually. In other words, for the 
cluster centroids (categories), we've generated in the clustering phase, we must hand pick Wikipedia concepts that might
 be relevant to that category. For example, if we want to build the model for a category *'football'* in Germany
 , specifically cluster centroid 
`'/Sport & Fitness/Sport/Fußball'`, we set the keyword, precisely Wikipedia concept, to `'Association 
football'` and location to `'Germany'`. This will retrieve articles and events from EventRegistry associated with a 
football and only from the news sources located in Germany.

We can provide any keyword as a keyword to EventRegistry, and it will try to find the closest matching Wikipedia concept.

---

### Feature selection

**Module name**: generic_feature_selector

**Description**: Used for selecting media attention features for modelling. 

Module `generic_feature_selector` enables us to select any field from any QMiner database with features.
During the [feature transformation](#feature-transformation) we've built QMiner database with media attention features (e.g. `../data/usecase/common/features/eventsFeaturesDb`).
Now we select the ones we want to use to fit the model. We provide QMiner query to filter only features relevant
to the football in Germany. 

Please see the [pipeline's documentation](../pipeline/README.md#generic-feature-selector), on how to define
 configuration file using `generic_feature_selector`, and for a detailed explanation on how to use QMiner queries
 , please see the [QMiner query documentation](https://github.com/qminer/qminer/wiki/Query-Language).

---

### List of features 

Past signal: 

| Feature   | Type     | Description |
| --------- |:-------- |:----------------------------------------------------------  |
| ArticlesCounts   | int   | The number of articles from yesterday.  |
| ArticlesCountsPastMax | int    | Maximum number of articles per day in the past 7 days.  |
| ArticlesCountsPastAvg | float | Average number of articles per day in the past 7 days.  |
| ArticlesCountsPastMin  | int  |  Minimum number of articles per day in the past 7 days. |
| EventsCounts  | int | The number of events from yesterday. |
| EventsCountsPastMax  | int | Maximum number of events per day in the past 7 days.  |
| EventsCountsPastAvg  | float  |  Average number of events per day in the past 7 days.  |
| EventsCountsPastMin  | int | Minimum number of events per day in the past 7 days.  |

Future signal: 

| Feature   | Type     | Description |
| --------- |:-------- |:----------------------------------------------------------  |
| MentionedArticlesCurrent   | int   | The number of times yesterday is mentioned in the past articles.  |
| MentionedEventsCurrent | int    | The number of times yesterday is mentioned in past events. |
| MentionedArticlesFuture | int | The number of any future dates in yesterday's articles. |
| MentionedEventsFuture  | int  |  The number of any future dates in yesterday's events.  |
| MentionedArticlesFuture<n>  | int | The number of mentions in yesterday's articles of the specific future date (n days after today). |
| MentionedEventsFuture<n>  | int | The number of mentions in yesterday's events of the specific future date (n days after today). |


[er_link]: http://eventregistry.org/

## Enrichment API
Server exposing an API to enrich given dates with event features.

### Server configuration file
Before running the server, prepare the server configuration file:
```json
{
    "host": "localhost",
    "port": 1338,
    "input_db": "<path_to_eventsFeaturesDb>"
}
```

The configuration file template is located at [analytics/events/templates/server_configuration.json](templates/server_configuration.json).

with parameters:

| Parameter                | Type                | Description            |
| ------------------- |:-------- |:---------------------------------  |
| host            | String              | Hostname. |
| port  | String              | Port that server listens to.               |
| input_db      | String             | Path to the QMiner DB containing event features.   |

### Running the server
Once the configuration file is prepared, you can start the server with:

```console
node analytics/server/server.js -c analytics/server/templates/server_configuration.json
```

### Submitting a request (POST /enrich)
```json
{ 
    "forecast_offset": -1, 
    "features": [
        "EventsCounts", 
        "ArticlesCounts"
    ], 
    "dates": ["2017-02-01", "2017-02-03"] 
}
```

Request has the following fields which are described in more detail in the sections above.

| Field                | Type                 | Description     |
| ------------------- |:------------------|:----------------------  |
| forecast_offset            | Integer               | Forecast offset (same as in the **Feature Selection** section). |
| features  | List                |  Features to be retrieved for each date (same as in the **Feature Selection** section). |
| dates  | List | Dates to be enriched in "YYYY-MM-DD" format. |

**Example:**
```bash
curl --header "Content-Type: application/json" \
  --request POST  'http://127.0.0.1:1338/enrich' \
  --data '{ 
        "forecast_offset": -1, 
        "features": [
            "EventsCounts", 
            "ArticlesCounts"
        ], 
        "dates": ["2017-02-01", "2017-02-03"] 
    }' 
```

### Getting a response
If the query executes successfully, response has the following format:

```json
{
    "data":
    [   
        {
            "EventsCounts":17,
            "ArticlesCounts":72,
            "EventsCountsPastAvg":17.714285714285715,
            "ArticlesCountsPastAvg":65.42857142857143,
            "EventsCountsPastMin":12,
            "EventsCountsPastMax":27,
            "ArticlesCountsPastMax":84,
            "ArticlesCountsPastMin":38
        },{
            "EventsCounts":28,
            "ArticlesCounts":91,
            "EventsCountsPastAvg":19.571428571428573,
            "ArticlesCountsPastAvg":76.28571428571429,
            "EventsCountsPastMin":12,
            "EventsCountsPastMax":28,
            "ArticlesCountsPastMax":91,
            "ArticlesCountsPastMin":49
        }
    ]
}
```
Field **data** stores features for each date in the order given by **dates** field on request.

### Selecting the keyword

In case there are multiple keywords in the **eventsFeaturesDb**, you can select one using 
the **search_query** field as in the **Feature selection** section above.

This is set to **"Association football"** keyword by default.


```json
"search_query": {
    "$from": "EventsFeatures",
    "EventFeatureId": "FootballGermany"
}
```

The **EventFeatureId** should match the **event_feature_id** field used at the **Feature transformation** step.
The example request for enriching the dates with ***"Association football"*** keyword:

```json
{ 
    "forecast_offset": -1, 
    "search_query": {
        "$from": "EventsFeatures",
        "EventFeatureId": "FootballGermany"
    },
    "features": [
        "EventsCounts", 
        "ArticlesCounts"
    ], 
    "dates": ["2017-02-01", "2017-02-03"] 
}
```

and the example for enriching the dates with ***"Music"*** keyword:

```json
{ 
    "forecast_offset": -1, 
    "search_query": {
        "$from": "EventsFeatures",
        "EventFeatureId": "MusicGermany"
    },
    "features": [
        "EventsCounts", 
        "ArticlesCounts"
    ], 
    "dates": ["2017-02-01", "2017-02-03"] 
}
```
