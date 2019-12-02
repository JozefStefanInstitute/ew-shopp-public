## 1. Running the server

```
python server.py <path_to_fasttext_bin> <path_to_embedder_json> <path_to_categories_file> 
```

**Example:**
```
python server.py data/cc.es.300.bin data/es-embedder.json data/productsservices_ESP.csv --categories_column 'Category_ES' --categories_id_column 'Criterion ID' --port 8500
```


