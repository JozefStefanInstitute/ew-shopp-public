# Media Attention Features 

## 1. Install

In the [./ew-shopp-public/](../..) directory run

```console
$> npm install
$> npm rebuild qminer --update-binary
```

to install all the necessary dependencies.

To download events and articles from EventRegistry ([*Download from EventRegistry*](#download-from-eventregistry
)) and calculate media coverage features from it, you need to provide an API key in the [*config.js*](../../analytics/config/config.js).

Note: Execute all node scripts from the [./ew-shopp-public/](../..) directory.

## 2. Download from EventRegistry
Article and event information are usually downloaded when building features. See [*Feature transformation*](#3-feature-transformation) 
section.

However, you can define queries and download EventRegistry data using [EventRegistry Node.js API](https://github.com/EventRegistry/event-registry-node-js).

## 3. Feature transformation 
Execute
```console
$> node analytics/pipeline/pipeline_runner.js -m transform -d ./events/config/media_attention_example.json
```
to download interested events from EventRegistry and extract events' features. Before execution you must properly define
 [*media_attention_example.json*](./config/media_attention_example.json) configuration file.

### Mapping 
The mapping between the event's concepts and cluster centroids (categories) is done manually. In other words, for the 
cluster centroids (categories), we've generated in the clustering phase, we must handpick Wikipedia concepts that might
 be relevant to that category. For example, if we want to build the model for a category *'football'* in Germany
 , specifically cluster centroid 
`'/Sport & Fitness/Sport/Fußball'`, we set the keyword, precisely Wikipedia concept, to `'Association 
football'` and location to `'Germany'`. This will retrieve articles and events from EventRegistry associated with a 
football and only from the news sources located in Germany.

We can provide any keyword as a keyword to EventRegistry, and it will try to find the closest matching Wikipedia concept.

### Configuration
Change [*configuration file*](./config/media_attention_example.json) for media attention feature extraction 
accordingly. 

The most relevant parameters:

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

Considering the existing [configuration file](./config/media_attention_example.json), we are 
calculating media attention features for `'Association football'` concept from `2017-01-01` to `2017-12-30` in
 Germany and features for `'Music'` concept for the same time frame and location. However, later in the fit
 phase, specifically in the feature selection, we will only use the media attention features for the `'Association
  football'` concept.
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
| EventsCountsPastMin  | int | Minimum number of events per day in the past 7 days.  |
| EventsCountsPastAvg  | float  |  Average number of events per day in the past 7 days.  |

Future signal: 

| Feature   | Type     | Description |
| --------- |:-------- |:----------------------------------------------------------  |
| MentionedArticlesCurrent   | int   | The number of times yesterday is mentioned in the past articles.  |
| MentionedEventsCurrent | int    | The number of times yesterday is mentioned in past events. |
| MentionedArticlesFuture | int | The number of any future dates in yesterday's articles. |
| MentionedEventsFuture  | int  |  The number of any future dates in yesterday's events.  |
| MentionedArticlesFuture<n>  | int | The number of mentions in yesterday's articles of the specific future date (n days after today). |
| MentionedEventsFuture<n>  | int | The number of mentions in yesterday's events of the specific future date (n days after today). |

## 4. Feature selection

Using `module: generic_feature_selector` enables us to select any field from any QMiner database with features.
During the [Feature transformation](#3-feature-transformation) we've built 
QMiner database with media attention features (*"../data/usecase/common/features/eventsFeaturesDb"*).
Now we select the ones we want to use to fit the model. We also provide QMiner query to filter only features relevant
to the football in Germany. 
In other words, `search_query` parameter is set to filter out only the relevant records from feature stores, while 
the `features` parameter sets which fields (features) to use. 
Note, that we filter by `EventFeatureId`, that was provided in the [configuration file](./config/media_attention_example.json)
during the feature transformation (`event_feature_id`). We don't want to use features for the `'Vacation'` keyword.

Configuration fragment defining feature selection:

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
This configuration fragment is one of many in the `extraction` list in the pipeline configuration file during the fit
 phase.

Please see the pipeline [README.md](../pipeline/README.md#generic-feature-selector), on how to define
 configuration file using `generic_feature_selector`, and for a detailed explanation on how to use QMiner queries
 , please see the [QMiner query documentation](https://github.com/qminer/qminer/wiki/Query-Language).