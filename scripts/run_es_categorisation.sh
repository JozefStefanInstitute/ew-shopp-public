#!/bin/bash
python categoriser.py \
    data/cc.es.300.bin \
    data/es_embedder.json \
    data/productsservices_ESP.csv \
    data/ESP_ES_SC_ENZ_ANS_000_TPGN_06_P_A_X_026.csv \
    data/ESP_ES_SC_ENZ_ANS_000_TPGN_06_P_A_X_026_categories.csv \
    --n_categories 3 \
    --categories_delimiter ',' \
    --categories_column 'Category_ES' \
    --categories_id_column 'Criterion ID' \
    --keywords_delimiter ';' \
    --keywords_column 'Keyword'