# Usage example

## 0. 
Directory data/ contains:
* **cc.de.300.bin** - german fasttext model
* **cc.es.300.bin** - spanish fasttext model
* **de_keywords.csv** - sample of file ***1cuenta_001.csv***
* **es_keywords.csv** - sample of file ***1cuenta_001_es.csv***
* **productsservices.csv** - categories in english

## 1. Generate de de_embedder.json
#### Step 1 
Download german **bin** fasttext model from https://fasttext.cc/docs/en/crawl-vectors.html and save it
under ***data/cc.de.300.bin***
#### Step 2
Create keyword embeddings model with
```
python embedder.py build data/cc.de.300.bin <path_to_de_keywords_file> data/de_embedder.json
```
With optional parameters:
* ```--keywords_delimiter ','```
* ```--keywords_column 'keywords'``` 
* ```--path_embeddings 'data/keywords_DE_emb.npy'```

## 2. Categorize one file containing Spanish keywords

#### Step 1
Translate **english** product categories from ***data/productsservices.csv*** to **spanish** using
```
python translate_categories.py data/productsservices.csv en es data/productsservices_ESP.csv
```
#### Step 2
Run keyword categorization 
```
python categoriser.py data/cc.es.300.bin data/es_embedder.json data/productsservices_ESP.csv \
    <path_to_es_keyword_file> <output_path> 
```


