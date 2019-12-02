# 1. Building the categorization model
## Step 1 
Download **bin** fasttext model from https://fasttext.cc/docs/en/crawl-vectors.html.
This is reffered to as a ***<fasttext_bin>*** file.

**Example:**

For the Spanish model, download cc.es.300.bin from https://fasttext.cc/docs/en/crawl-vectors.html and store it in ***data/cc.es.300.bin***.

## Step 2
Fit the embedding model on keywords:
```
python embedder.py build <fasttext_bin> <keywords_file> <embedder_json>
```
The output is a ***<embedder_json>*** file containing the categorization model.


**Example:**

Fitting the Spanish embeddings model:

```
python embedder.py build data/cc.es.300.bin data/es-keywords.csv data/es-embedder.json
```

# 2. Find n closest keywords for each category 

```
python categoriser.py relevance_to_category <fasttext_bin> <embedder_json> <categories_file> <keywords_file> <output_file>
```

The number of closest keywords can be specified via **--n_keywords** parameter (1000 by default).

**Example:**
```
python categoriser.py relevance_to_category data/cc.es.300.bin data/es-embedder.json data/es-categories.csv data/es-keywords.csv out.csv 
```

# 3. Find top-k categories for each keyword
```
python categoriser.py categorise_keywords <fasttext_bin> <embedder_json> <categories_file> <keywords_file> <output_file>
```

The number of closest categories can be specified via **--n_categories** parameter (3 by default).

Category column can be set via ***--categories_column*** parameter - (__--categories_column 'Category_ES'__)

**Example:**
```
python categoriser.py categorise_keywords data/cc.es.300.bin data/es-embedder.json data/es-categories.csv data/new-es-keywords.csv out.csv 
```

## Running the server

```
python server.py <path_to_fasttext_bin> <path_to_embedder_json> <path_to_categories_file> 
```

**Example:**

Run the server using:
```
python server.py data/cc.es.300.bin data/es-embedder.json data/es-categories.csv --port 8500
```

Query the server with:
```
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
            {"category": "/Salud/Servicios de atenci\u00f3n m\u00e9dica/Rehabilitaci\u00f3n f\u00edsica/Terapia f\u00edsica", "distance": 0.569, "id": "11792"},{"category": "/Salud/Servicios de atenci\u00f3n m\u00e9dica/Rehabilitaci\u00f3n f\u00edsica/Terapia ocupacional", "distance": 0.576, "id": "11794"},
            {"category": "/Salud/Servicios de atenci\u00f3n m\u00e9dica/Reasignaci\u00f3n terapia sexual", "distance": 0.58, "id": "13452"}
        ] 
    }
]
```

**Note:** If the resulting categories are not in the correct language, you should check the csv file and use the **--categories_column** parameter to specify the row containing the correct category names (i.e. ***--categories_column 'Category_ES'***). 

# Optional:
Translate product categories from  **english** to  **spanish**:
```
python translate_categories.py data/en-categories.csv en es data/es-categories.csv
```
