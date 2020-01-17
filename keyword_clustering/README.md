# Keyword clustering tool

 The keywords clustering tool clusters together keywords by their meaning,
producing sets of keywords related to some central keyword (i.e. a category name). 
It transforms the keywords into a low-dimensional semantic space where they are 
comparable among each other. The transformation is created in such a way so that 
semantically related words are closer together than those that are unrelated which 
enables clustering using standard machine learning methodology.  

## Install
```console
pip install -r keyword_clustering/requirements.txt
```
This will install all necessary dependencies.

### Download fastText model 
Download **bin** fastText model from https://fasttext.cc/docs/en/crawl-vectors.html#models. 

This is referred to as a ***<fasttext_bin>*** file.

**Example:**

For the Spanish model, download [cc.es.300.bin](https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.es.300.bin.gz) and store it in ***data/cc.es.300.bin***.

## Usage 

### 1. Building the categorization model

Fit the embedding model on keywords:

```console 
python embedder.py build <fasttext_bin> <keywords_file> <embedder_json>
```

The output is a ***<embedder_json>*** file containing the categorization model.


**Example:**

Fitting the Spanish embeddings model:

```console
python embedder.py build data/cc.es.300.bin data/es-keywords.csv data/es-embedder.json
```

### 2. N closest keywords for each category 
To find n closest keywords for each category execute: 

```console
python categoriser.py relevance_to_category <fasttext_bin> <embedder_json> <categories_file> <keywords_file> <output_file>
```

The number of closest keywords can be specified via `--n_keywords` parameter (1000 by default).

**Example:**

```console
python categoriser.py relevance_to_category data/cc.es.300.bin data/es-embedder.json data/es-categories.csv data/es-keywords.csv out.csv 
```

### 3. Top-k categories for each keyword

To find top-k categories for each keyword execute: 

```console
python categoriser.py categorise_keywords <fasttext_bin> <embedder_json> <categories_file> <keywords_file> <output_file>
```

The number of closest categories can be specified via `--n_categories` parameter (3 by default).

Category column can be set via `--categories_column` parameter - (`--categories_column 'Category_ES'`)

**Example:**
```console
python categoriser.py categorise_keywords data/cc.es.300.bin data/es-embedder.json data/es-categories.csv data/new-es-keywords.csv out.csv 
```

### 4. Running the server

```console
python server.py <path_to_fasttext_bin> <path_to_embedder_json> <path_to_categories_file> 
```

**Example:**

Run the server using:

```console
python server.py data/cc.es.300.bin data/es-embedder.json data/es-categories.csv --port 8500
```

Query the server with:
```console
curl -v -H "Content-Type: application/json" -X POST \
     -d '{"keywords": ["atrium hotels", "nueva crevia inmobiliaria"]}' -i http://127.0.0.1:8500/categorise_keywords
```

Server returns the json file with the following format:
```json
[
    {
        "keyword": "atrium hotels",
        "categories": [
            {"category": "/Viajes y Turismo/alojamiento/Hoteles, moteles & Resorts/hoteles/Paquetes hotel", "distance": 0.75, "id": "13022"}, 
            {"category": "/Viajes y Turismo/alojamiento/Hoteles, moteles & Resorts/Resorts/Paquetes Resort", "distance": 0.766, "id": "13021"},
            {"category": "/Hogar & Jard\u00edn/Limpieza de viviendas", "distance": 0.77, "id": "10399"}
        ]
    },
    {
        "keyword": "nueva crevia inmobiliaria",
        "categories": [
            {"category": "/Salud/Servicios de atenci\u00f3n m\u00e9dica/Rehabilitaci\u00f3n f\u00edsica/Terapia f\u00edsica", "distance": 0.569, "id": "11792"},
            {"category": "/Salud/Servicios de atenci\u00f3n m\u00e9dica/Rehabilitaci\u00f3n f\u00edsica/Terapia ocupacional", "distance": 0.576, "id": "11794"},
            {"category": "/Salud/Servicios de atenci\u00f3n m\u00e9dica/Reasignaci\u00f3n terapia sexual", "distance": 0.58, "id": "13452"}
        ] 
    }
]
```

**Note:** If the resulting categories are not in the correct language, you should check the csv file and use the `--categories_column` parameter to specify the row containing the correct category names (i.e. `--categories_column 'Category_ES'`). 

### Optional:
Translate product categories from  **English** to  **Spanish**:

```console
python translate_categories.py data/en-categories.csv en es data/es-categories.csv
```

## API

### Embedder

```console 
python embedder.py build [-h] [--keywords_delimiter KEYWORDS_DELIMITER]
                         [--keywords_column KEYWORDS_COLUMN] [--sample SAMPLE]
                         path_model path_keywords path_embedder_parameters
```

To find all descriptions of possible arguments execute:
```console 
python embedder.py build --help
```

#### Required positional arguments

| Argument | Type                | Description |
| --------- |:-------- |:----------------------------------------------------------  |
| build  | String | |
| path_model | String | Path to FastText model binary file. In [Usage section](#usage) also referred as `<fasttext_bin>`. |
| path_keywords  | String | Path to keywords file. In [Usage section](#usage) also referred as `<keywords_file>`. |
| path_embedder_parameters  | String | Path where to store the embedder parameters into a json file. In [Usage section](#usage) also referred as `<embedder_json>`. |

#### Optional arguments

| Argument | Type                | Default | Description |
| --------- |:-------- |:-------- |:----------------------------------------------------------  |
| `--keywords_delimiter [-kd]` | String | `,` |Delimiter used in the keywords csv file. |
| `--keywords_column [-kc]`  | String  | `Keyword` |Name of  column containing keywords in the keywords csv                         file. |
| `--sample [-s]`  | Integer  |`1000000` |Size of random sample of keywords.  |

---
### Categoriser

```console
python categoriser.py [-h] [--n_categories N_CATEGORIES]
                      [--n_keywords N_KEYWORDS]
                      [--categories_delimiter CATEGORIES_DELIMITER]
                      [--categories_column CATEGORIES_COLUMN]
                      [--categories_id_column CATEGORIES_ID_COLUMN]
                      [--keywords_delimiter KEYWORDS_DELIMITER]
                      [--keywords_column KEYWORDS_COLUMN]
                      {categorise_keywords,relevance_to_category} path_model
                      path_embedder_parameters path_categories path_keywords
                      path_output
```

To find all descriptions of possible arguments execute:

```console 
python categoriser.py --help
```

#### Required positional arguments

| Argument | Type                | Description |
| --------- |:-------- |:----------------------------------------------------------  |
| mode  | String | Possible value is`categorise_keywords`, to find find top-k categories for each keyword execute, or `relevance_to_category`, to find n-closest keywords for each category. |
| path_model | String | Path to FastText model binary file. In [Usage section](#usage) also referred as `<fasttext_bin>`. |
| path_embedder_parameters  | String | Path to the embedder parameters JSON file. In [Usage section](#usage) also referred as `<embedder_json>`. | 
| path_categories  | String | Path to the categories file. In [Usage section](#usage) also referred as `<categories_file>`. |
| path_keywords  | String | Path to the input keywords csv file. In [Usage section](#usage) also referred as `<keywords_file>`. |
| path_output  | String | Path to the output csv file. In [Usage section](#usage) also referred as `<output_file>`. |

#### Optional arguments

| Argument | Type                | Default | Description |
| --------- |:-------- |:-------- |:----------------------------------------------------------  |
| `--n_categories` | Integer | `3` | Number of closest categories to return. |
| `--n_keywords [-kd]` | Integer | `1000` | Number of closest keywords to return. |
| `--categories_delimiter [-cd]` | String | `,` | Delimiter used in the categories csv file. |
| `--categories_column [-cc]` | String | `Category` |Name of column containing categories in the categories csv file.  |
| `--categories_id_column [-cic]` | String | `CategoryID` | Name of column containing category ids in the categories csv file. |
| `--keywords_delimiter [-kd]` | String | `,` |Delimiter used in the keywords csv file. |
| `--keywords_column [-kc]`  | String  | `Keyword` |Name of  column containing keywords in the keywords csv                         file. |
| `--sample [-s]`  | Integer  |`1000000` |Size of random sample of keywords.  |

---
### Translate categories

```console
python translate_categories.py [-h]
                               [--categories_delimiter CATEGORIES_DELIMITER]
                               path_categories source_language
                               destination_language path_output
```

To find all descriptions of possible arguments execute:

```console 
python translate_categories.py -h
```

#### Required positional arguments

| Argument | Type                | Description |
| --------- |:-------- |:----------------------------------------------------------  |
| path_categories  | String | Path to input csv with categories. Assumed to contain two columns: `'category ID'` and `'category name'`. |
| source_language | String |Source language of the categories. String with the two letter (ISO 639-1) language code. (e.g. `'en'`) |
| destination_language  | String | Destination language of the categories. String with the two letter (ISO 639-1) language code. (e.g. `'de'`) 
| path_output  | String | Path to the categories output file.|

#### Optional arguments

| Argument | Type                | Default | Description |
| --------- |:-------- |:-------- |:----------------------------------------------------------  |
| `--categories_delimiter [-cd]` | String | `,` | Delimiter used in the categories csv file. |
---
### Server

```console
python server.py [-h] [--categories_delimiter CATEGORIES_DELIMITER]
                 [--categories_column CATEGORIES_COLUMN]
                 [--categories_id_column CATEGORIES_ID_COLUMN] [-p PORT]
                 path_model path_embedder_parameters path_categories
```

To find all descriptions of possible arguments execute:

```console 
python translate_categories.py -h
```

#### Required positional arguments

| Argument | Type                | Description |
| --------- |:-------- |:----------------------------------------------------------  |
| path_model | String | Path to FastText model binary file. In [Usage section](#usage) also referred as `<fasttext_bin>`. |
| path_embedder_parameters  | String | Path to the embedder parameters JSON file. In [Usage section](#usage) also referred as `<embedder_json>`. | 
| path_categories  | String | Path to the categories file. In [Usage section](#usage) also referred as `<categories_file>`. |

#### Optional arguments

| Argument | Type                | Default | Description |
| --------- |:-------- |:-------- |:----------------------------------------------------------  |
| `--categories_delimiter [-cd]` | String | `,` | Delimiter used in the categories csv file. |
| `--categories_column [-cc]` | String | `Category` |Name of column containing categories in the categories csv file.  |
| `--categories_id_column [-cic]` | String | `CategoryID` | Name of column containing category ids in the categories csv file. |
| `--port [-p]` | Integer | `5000` | Port that server listens. |