import argparse
from flask import Flask, Response, json, request
import cluster_keywords as ck
from flask_caching import Cache


app = Flask(__name__)

cache = Cache(app, config={
    'CACHE_TYPE': 'simple',
    'DEBUG': True,
    'CACHE_DEFAULT_TIMEOUT': 922337203685477580,
    'CACHE_THRESHOLD': 922337203685477580
})


@app.route('/categorise_keywords/<keyword>/<int:candidates>', methods=['POST'])
@cache.cached()
def categorize(keyword, candidates):

    n_categories = candidates

    if n_categories is None:
        n_categories = 3

    result = categorizer.categorize([keyword], n_categories=n_categories)

    response = []
    for i, categories in enumerate(result):
        response.append({
            'keyword': keyword,
            'categories': [
                {
                    'category': c[0],
                    'id': c[1],
                    'distance': c[2]
                } for c in sorted(categories, key=lambda x: x[2])
            ] 
        })
       
    resp = Response(json.dumps(response), status=200,
                    mimetype='application/json')
    resp.headers["Content-Type"] = "application/json; charset=utf-8"
    return resp

# @app.route('/categorize', methods=['POST'])
# def categorize():
#     req = request.get_json()
    
#     keywords = req['keywords']
#     n_keywords = req['n_keywords'] if 'n_keywords' in req else 1000

#     result = categorizer.closest_keywords(keywords, n_keywords)

#     response = []
#     for i, categories in enumerate(result):
#         response.append({
#             'keyword': keywords[i],
#             'categories': [
#                 {
#                     'category': c[0],
#                     'id': c[1],
#                     'distance': c[2]
#                 } for c in sorted(categories, key=lambda x: x[2])
#             ] 
#         })
       
#     resp = Response(json.dumps(response), status=200,
#                     mimetype='application/json')
#     resp.headers["Content-Type"] = "application/json; charset=utf-8"
#     return resp

if __name__ == "__main__":
    # parse command line arguments
    argparser = argparse.ArgumentParser(description='Server for categorising keywords using FastText models.')
    
    argparser.add_argument('path_model', type=str, help='Path to the FastText model binary file.')
    argparser.add_argument('path_embedder_parameters', type=str, help='Path to the embedder parameters json file.')
    argparser.add_argument('path_categories', type=str, help='Path to the categories file.')
    argparser.add_argument('--categories_delimiter', '-cd', type=str, default=',', help='Delimiter used in the categories csv file. (default: \',\')')
    argparser.add_argument('--categories_column', '-cc', type=str, default='Category', help='Name of column containing categories in the categories csv file. (default: \'Category\')')
    argparser.add_argument('--categories_id_column', '-cic', type=str, default='CategoryID', help='Name of column containing category ids in the categories csv file. (default: \'CategoryID\')')
    argparser.add_argument("-p", "--port", type=int, default=5000)
    args = argparser.parse_args()


    # load language model
    ft_model_filename = args.path_model
    print(f"Loading language model from: {ft_model_filename}")
    model = ck.load_FT_model(ft_model_filename)
    print("Loaded embeddings!")


    # build embedder
    embedder_parameters_filename = args.path_embedder_parameters
    print(f"Loading embedder parameters from: {embedder_parameters_filename}")
    de_embedder_parameters_json = open(embedder_parameters_filename).read()
    de_embedder = ck.SIFEmbedder(model)
    de_embedder.load(de_embedder_parameters_json)
    print("Built embedder!")


    # get categories
    categories_filename = args.path_categories
    print(f"Loading categories from: {categories_filename}")
    categories = ck.load_csv_column(categories_filename, args.categories_column, delimiter=',')
    category_ids = ck.load_csv_column(categories_filename, args.categories_id_column, delimiter=',')
    print(f'Loaded {len(categories)} categories.')


    # build categorizer
    categorizer = ck.Categorizer(de_embedder)
    categorizer.fit(categories, category_ids=category_ids)
    print("Categorizer built!")

    # run server
    app.run(host='0.0.0.0', port=args.port)
