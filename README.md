# EW-Shopp Data Analytics (ew-shopp-public)

[![License](https://img.shields.io/badge/License-BSD%202--Clause-blue.svg)](./License) [![Node 10.18](https://img.shields.io/badge/node-10.18.1-blue.svg)](https://nodejs.org/docs/latest-v10.x/api/)  [![Python 3.6](https://img.shields.io/badge/python-3.6+-blue.svg)](https://www.python.org/downloads/release/python-360/) 
Public repository of the analytics tools for the [EW-Shopp project][ew_shopp_link]. The contents are organized by topic in subfolders containing the code and the corresponding documentation.    

* 📈 [analytics](analytics/) - code to set up, fit and run the EW-Shopp analytics pipeline. 
    * ⚙️ [pipeline](analytics/pipeline/) - to perform feature transformation, feature selection, model training and predictions.    
    * 🌍 [events](analytics/events/) - code to download articles and events from [Event Registry][er_link] and calculate media attention features. Used with the pipeline.    
    * 🌦️ [weather](analytics/weather/) - code to calculate weather features. Used with the pipeline. 
* [download_events](download_events/) - utility code for downloading event data from [Event Registry][er_link]. 
* [keyword_clustering_tool](keyword_clustering/) - code to cluster together keywords by their meaning, producing sets of keywords related to some central keyword (i.e. a category name). 

# License    

BSD-2-Clause: [LICENSE](./License).
 
[er_link]: http://eventregistry.org/
[ew_shopp_link]: https://www.ew-shopp.eu/