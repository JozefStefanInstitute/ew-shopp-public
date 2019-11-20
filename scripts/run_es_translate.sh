#!/bin/bash
python translate_categories.py \
    data/productsservices.csv \
    en \
    es \
    data/productsservices_ESP.csv \
    --categories_delimiter ','
