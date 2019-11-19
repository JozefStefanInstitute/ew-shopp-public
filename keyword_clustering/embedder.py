# Developed in Python 3.6.7

# Code for running the embedding functionality in cluster_keywords.py from command line.

import json
import argparse
import numpy as np

import cluster_keywords as ck


def main_build(args):
    # load language model
    ft_model_filename = args.path_model
    print(f"Loading language model from: {ft_model_filename}")
    model = ck.load_FT_model(ft_model_filename)
    print("Loaded embeddings!")


    # build new embedder
    es_embedder = ck.SIFEmbedder(model)
    print("Built embedder!")


    # get keywords
    keyword_filename = args.path_keywords
    print(f"Loading keywords from: {keyword_filename}")
    keywords = ck.load_csv_column(
        keyword_filename,
        args.keywords_column,
        delimiter = args.keywords_delimiter)
    print(f'Loaded {len(keywords)} keywords.')


    # run embedder
    embeddings = es_embedder.fit_embed(keywords)


    # store parameters
    embedder_params_filename = args.path_embedder_parameters
    print(f"Dumping embedder parameters to: {embedder_params_filename}")
    with open(embedder_params_filename, "w") as outfile:
        outfile.write(es_embedder.serialize())


    # if specified, store embeddings
    if args.path_embeddings is not None:
        embeddings_path = args.path_embeddings
        print(f"Dumping embeddings to: {embeddings_path}")
        np.save(open(embeddings_path, 'wb'), embeddings)


if __name__ == '__main__':
    # parse command line arguments
    argparser = argparse.ArgumentParser(description='Tool for embedding keywords using FastText models.')
    subparsers = argparser.add_subparsers()

    argparser_build = subparsers.add_parser('build', help='Build the SIF embedding parameters using given keywords.')
    argparser_build.add_argument('path_model', type=str, help='Path to FastText model binary file.')
    argparser_build.add_argument('path_keywords', type=str, help='Path to keywords file.')
    argparser_build.add_argument('path_embedder_parameters', type=str, help='Path where to store the embedder parameters into a json file.')
    argparser_build.add_argument('--keywords_delimiter', '-kd', type=str, default=',', help='Delimiter used in the keywords csv file. (default: \',\')')
    argparser_build.add_argument('--keywords_column', '-kc', type=str, default='Keyword', help='Name of column containing keywords in the keywords csv file. (default: \'Keyword\')')
    argparser_build.add_argument('--path_embeddings', type=str, help='Path to embeddings output file. If not set, the embeddings are not stored to disk.')
    argparser_build.set_defaults(command='build')

    # parse the args and call whatever function was selected
    args = argparser.parse_args()

    if args.command == 'build':
        print("Building embedding parameters")
        main_build(args)
    else:
        print("Unknown command!")


    print("Done!!!")