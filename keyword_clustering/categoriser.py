# Developed in Python 3.6.7

# Code for running the categorisation functionality in cluster_keywords.py from command line.

import cluster_keywords as ck
import json
import csv
import re
import argparse
import pdb

from tqdm import tqdm


def main_categorise(args):
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


    # get keywords
    keyword_filename = args.path_keywords
    print(f"Loading keywords from: {keyword_filename}")
    keywords = ck.load_csv_column(
        keyword_filename,
        args.keywords_column,
        delimiter = args.keywords_delimiter)
    print(f'Loaded {len(keywords)} keywords.')


    # assigning closest 'n_categories' to each keyword
    if args.mode == "categorise_keywords":
        n_categories = args.n_categories
        keyword_categories = categorizer.categorize(keywords, n_categories=n_categories)
        output_filename = args.path_output
        print(f"Writing categories to: {output_filename}")
        with open(output_filename, "w", encoding="utf8") as outfile:
            outwriter = csv.writer(outfile, delimiter=",", quotechar='"')
            # write header
            out_header = ["keyword"]
            for cat_i in range(1, n_categories + 1):
                out_header.extend([f"category{cat_i}_id", f"category{cat_i}", f"category{cat_i}_distance"])
            outwriter.writerow(out_header)

            # write results row by row
            for keyword, categories in zip(keywords, keyword_categories):
                row = [f"{keyword}"]
                for category, id, distance in categories:
                    row.extend([f"{id}", f"{category}", f"{distance}"])
                outwriter.writerow(row)
    # assigning closest 'n_keywords' to each category
    elif args.mode == "relevance_to_category":
        n_keywords = args.n_keywords
        keyword_categories = categorizer.closest_keywords(keywords, n_keywords=n_keywords)
        output_filename = args.path_output
        print(f"Writing categories to: {output_filename}")
        with open(output_filename, "w", encoding="utf8") as outfile:
            outwriter = csv.writer(outfile, delimiter="\t", quotechar='"')
            # write header
            out_header = ["keyword", "categories"]
            outwriter.writerow(out_header)
            
            # write results row by row
            for keyword, categories in tqdm(zip(keywords, keyword_categories), desc='Writting to file'):
                row = [f"{keyword}"]
                if len(categories) == 0:
                    row += ["none"]
                else:
                    row += [",".join([f"{category}({id})" for category, id, distance in categories])]
                outwriter.writerow(row)
                
    print("DONE!")


if __name__ == '__main__':
    # parse command line arguments
    argparser = argparse.ArgumentParser(description='Tool for categorising keywords using FastText models.')

    argparser.add_argument('mode', type=str, choices=['categorise_keywords', 'relevance_to_category'], help='Categorization mode.')
    argparser.add_argument('path_model', type=str, help='Path to the FastText model binary file.')
    argparser.add_argument('path_embedder_parameters', type=str, help='Path to the embedder parameters json file.')
    argparser.add_argument('path_categories', type=str, help='Path to the categories file.')
    argparser.add_argument('path_keywords', type=str, help='Path to the input keywords csv file.')
    argparser.add_argument('path_output', type=str, help='Path to the output csv file.')
    argparser.add_argument('--n_categories', type=int, default=3, help='Number of closest categories to return. (default: 3)')
    argparser.add_argument('--n_keywords', type=int, default=1000, help='Number of closest keywords to return. (default: 1000)')
    argparser.add_argument('--categories_delimiter', '-cd', type=str, default=',', help='Delimiter used in the categories csv file. (default: \',\')')
    argparser.add_argument('--categories_column', '-cc', type=str, default='Category', help='Name of column containing categories in the categories csv file. (default: \'Category\')')
    argparser.add_argument('--categories_id_column', '-cic', type=str, default='CategoryID', help='Name of column containing category ids in the categories csv file. (default: \'CategoryID\')')
    argparser.add_argument('--keywords_delimiter', '-kd', type=str, default=',', help='Delimiter used in the keywords csv file. (default: \',\')')
    argparser.add_argument('--keywords_column', '-kc', type=str, default='Keyword', help='Name of column containing keywords in the keywords csv file. (default: \'Keyword\')')

    args = argparser.parse_args()

    main_categorise(args)
