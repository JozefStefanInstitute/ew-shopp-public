#!/bin/bash
python embedder.py build \
    data/cc.es.300.bin \
    data/kws_ESP.csv \
    data/es_embedder.json \
    --keywords_delimiter ',' \
    --keywords_column 'keywords' \
    --path_embeddings 'data/keywords_ESP_emb.npy'
