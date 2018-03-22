from datetime import datetime

import random
from random import randint

from sys import argv

import pandas as pd

if __name__ == '__main__':
    random.seed(1)

    num_products = 50
    num_sales = 240

    products = []
    for i in range(num_products):
        products.append({
            "ProductId": i,
            "ProductType": 'AC' if randint(0, 1) == 1 else 'TV'
        })

    sales = []
    for i in range(num_sales):
        product = products[randint(0, num_products - 1)]

        sales.append({
            "ProductId": product['ProductId'],
            "Timestamp": datetime(2017, 11, randint(1, 30), randint(8, 16), randint(0,59), randint(0,59)),
            "Quantity": randint(1, 3)
        })

    pd.DataFrame.from_dict(products).to_csv(argv[1], sep='\t', index=False)
    pd.DataFrame.from_dict(sales).to_csv(argv[2], sep='\t', index=False)
