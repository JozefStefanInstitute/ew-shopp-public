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

**Example:**
```
python categoriser.py categorise_keywords data/cc.es.300.bin data/es-embedder.json data/es-categories.csv data/new-es-keywords.csv out.csv 
```

## Running the server

```
python server.py <path_to_fasttext_bin> <path_to_embedder_json> <path_to_categories_file> 
```

**Example:**
```
python server.py data/cc.es.300.bin data/es-embedder.json data/es-categories.csv 
```

# Optional:
Translate product categories from  **english** to  **spanish**:
```
python translate_categories.py data/en-categories.csv en es data/es-categories.csv
```
