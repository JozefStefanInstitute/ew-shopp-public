# Developed in Python 3.6.7

# Code for clustering sets of keywords using FastText word vectors for representation.
# FastText website: https://fasttext.cc
# FastText word vectors: https://fasttext.cc/docs/en/crawl-vectors.html

import json
import re
import csv
from collections import Counter

import fastText
import numpy as np
from tqdm import tqdm

from sklearn.decomposition import TruncatedSVD


def load_FT_model(path):
    """
    Loads FastText embeddings from (bin) file.

    Args:
        path: Path to FastText word vectors binary file.

    Returns:
        fastText model object.
    """
    return fastText.load_model(path)


def tokenize(keyword):
    """
    Tokenizes using default fastText tokenizer.

    Args:
        keyword: Keyword string (can be multi-word phrase!).

    Returns:
        List of words (tokens) from the keyword.
    """
    return fastText.tokenize(keyword)


def count_word_frequencies(keywords):
    """
    Counts frequencies of words over all given keywords.

    Args:
        keywords: List of keywords strings.

    Returns:
        Dictionary of word:frequency mappings.
    """
    word_frequencies = Counter()
    for keyword in tqdm(keywords):
        word_frequencies.update(tokenize(keyword))
    return dict(word_frequencies)


def load_csv_column(path, column_name, delimiter=','):
    """
    Load the contents of a column in a csv file.

    Args:
        path: Path to the csv file containing the column.
        delimiter: The delimiter used in the csv file.
        column_name: The name of the target column.

    Returns:
        A list of column fields as strings.
    """
    fields = []
    # go over all the csv rows
    with open(path) as csv_file:
        csv_reader = csv.reader(csv_file, delimiter=delimiter)
        line_count = 0
        for row in csv_reader:
            if line_count == 0:
                # first line - get the column index from the header
                keyword_header = row
                column_index = keyword_header.index(column_name)
            else:
                # get the correct field
                fields.append(row[column_index])
            line_count += 1
    return fields


def sif_embedding(keywords, model, word_frequencies, n_principal_components=1, alpha=1e-3, principal_components=None,
    return_components=False):
    """
    Compute a sentence/phrase embedding using the SIF approach.
    Details in: https://openreview.net/pdf?id=SyK00v5xx

    Args:
        keywords: List of keywords.
        model: FastText model with get_word_vector function.
        word_frequencies: Dictionary containing (word, frequency) maapings.
        n_principal_components: Number of principal components to remove. (default=1)
        alpha: Smoothing parameter from the SIF paper. (default=1e-3)
        principal_components: A numpy array of principal components. (default=None)
        return_components: Flag to return also the principal components. (default=False)

    Returns:
        Embeddings of keywords following the SIF principle. If return_components is True,
        principal components computed during the embedding process using SVD are also returned.
    """
    # calculate word weights
    n_all_words = float(sum(freq for _, freq in word_frequencies.items()))
    word2weight = {word: alpha / (alpha + freq / n_all_words) for word, freq in word_frequencies.items()}

    # calculate weighted average of word embeddings
    embs = np.zeros((len(keywords), 300))
    for i, keyword in enumerate(keywords):
        words = tokenize(keyword)

        # What should be the weight of a word not present in the training corpus (in word_frequencies table)?
        # Pretend in only appears once - has a frequency of 1.
        # This favours the unseen words...
        for word in words:
            if word not in word2weight:
                word2weight[word] = alpha / (alpha + 1 / (n_all_words + 1))

        w = np.array([word2weight[word] * model.get_word_vector(word) for word in words])
        embs[i] = (w.sum(axis=0) / len(words))

    # remove principal components
    if principal_components is not None:
        # use precalculated
        if n_principal_components == 1:
            embs = embs - embs.dot(principal_components.transpose()) * principal_components
        else:
            embs = embs - embs.dot(principal_components.transpose()).dot(principal_components)
    else:
        # calculate new
        if n_principal_components > 0:
            svd = TruncatedSVD(n_components=n_principal_components, n_iter=7, random_state=0)
            svd.fit(embs)
            principal_components = svd.components_

            if n_principal_components == 1:
                embs = embs - embs.dot(principal_components.transpose()) * principal_components
            else:
                embs = embs - embs.dot(principal_components.transpose()).dot(principal_components)

    if return_components:
        return embs, principal_components
    return embs


class SIFEmbedder(object):
    """An object for fitting SIF embeddings to a set of keywords. """
    def __init__(self, model, n_principal_components=1, alpha=1e-3):
        """
        Initialize the embedder.

        Args:
            model: FastText model of word embeddings for target language
            n_principal_components: see Args of sif_embedding above
            alpha: see Args of sif_embedding above
        """
        self.model = model
        self.n_principal_components = n_principal_components
        self.alpha = alpha

        self.fitted = False                 # has the embedder been fit to data
        self.word_frequencies = None        # frequencies of individual words in a given set of keywords
        self.principal_components = None    # principal components of the embeddings of a given set of keywords


    def fit_embed(self, keywords):
        """
        Fit the embedder to a set of keywords, computing the word frequencies and principal components, and embed them.

        Args:
            keywords: A list of keywords (i.e. multi-word strings) to fit to and embed.

        Returns:
            Embeddings of the given keywords.
        """
        # first count the word frequencies in the given keywords
        self.word_frequencies = count_word_frequencies(keywords)
        # then compute the SIF embeddings (computing the principal components along the way)
        embeddings, self.principal_components = sif_embedding(
            keywords,
            self.model,
            self.word_frequencies,
            n_principal_components = self.n_principal_components,
            alpha = self.alpha,
            principal_components = None,
            return_components = True)

        self.fitted = True

        return embeddings


    def embed(self, keywords):
        """
        Embed given keywords using previously fit parameters (i.e. word_frequencies and principal components).

        Args:
            keywords: A list of keywords (i.e. multi-word strings) to embed.

        Returns:
            Embeddings of the given keywords.
        """
        if not self.fitted:
            raise RuntimeError("Embedder must be fitted to data before embedding.")

        embeddings = sif_embedding(
            keywords,
            self.model,
            self.word_frequencies,
            n_principal_components = self.n_principal_components,
            alpha = self.alpha,
            principal_components = self.principal_components,
            return_components = False)

        return embeddings


    def serialize(self):
        """
        Save the embedding parameters. Serializes word frequencies and principal components to JSON.
        Does NOT serialize the fastText model.

        Returns:
            String with JSON containing fitted SIFembedder parameters.
        """
        if not self.fitted:
            raise RuntimeError("Embedder not fitted. Nothing to serialize")

        json_string = json.dumps({
            "word_frequencies": self.word_frequencies,
            "principal_components": self.principal_components.tolist()
        })

        return json_string


    def load(self, json_string):
        """
        Load the embedding parameters from given json string. Loads word frequencies and principal components.

        Args:
            json_string: String with JSON containing fitted SIFembedder parameters.
        """
        parameters = json.loads(json_string)

        self.word_frequencies = parameters["word_frequencies"]
        self.principal_components = np.array(parameters["principal_components"])

        self.fitted = True


def compute_all_distances(keywords, target_keywords, target_keyword_embeddings, embedder):
    """
    Compute and return all distances between keywords from ``keywords`` to those from ``target_keywords``.

    Args:
        keywords: A list of keywords
        target_keywords: The list of target keywords to compute the distances to.
        target_keyword_embeddings: The embeddings of keywords from target_keywords (numpy array).
            Expected to be in the same order than target_keywords.
        embedder: The SIFEmbedder object used for computing the embeddings.

    Returns:
        A numpy array of distances of dimensions |keywords| x |target_keywords|.
    """
    # compute embeddings
    ke = embedder.embed(keywords)
    # normalize
    ke = ke / np.sqrt((ke * ke).sum(axis=-1, keepdims=True))
    keyword_embeddings = ke

    # process target keywords in batches
    step_size = 10000
    for step_start in range(0, target_keyword_embeddings.shape[0], step_size):
        # take a batch of target keyword embeddings
        embedding_batch = target_keyword_embeddings[step_start:step_start + step_size]
        # normalize them
        embedding_batch = embedding_batch / np.sqrt((embedding_batch * embedding_batch).sum(axis=-1, keepdims=True))
        # compute cosine similarity
        sims = np.matmul(keyword_embeddings, embedding_batch.T) # query vector cosine similarity
        # invert the similarities into distances and collect them
        if step_start == 0:
            dists = 1. - sims
        else:
            dists = np.concatenate((dists, 1. - sims), axis=1)

    return dists


def find_closest(keywords, target_keywords, target_keyword_embeddings, embedder, n_top_keywords=20):
    """
    Compute and return keywords from ``target_keywords`` closest to those from ``keywords``.

    Args:
        keywords: A list of keywords
        target_keywords: The list of target keywords to search for the closest from.
        target_keyword_embeddings: The embeddings of keywords from target_keywords (numpy array).
            Expected to be in the same order than target_keywords.
        embedder: The SIFEmbedder object used for computing the embeddings.
        n_top_keywords: The number of closest target keywords to return per keyword.

    Returns:
        A list of lists of closest keywords and their distances for keywords from ``keywords``.
        Results can be matched by index.
    """
    # compute distances
    dists = compute_all_distances(keywords, target_keywords, target_keyword_embeddings, embedder)

    # collect top closest keywords and sort them
    top_kws = []
    for i in range(0, dists.shape[0]):
        top_ids = np.argsort(dists[i,:])[:n_top_keywords]
        top_kws.append([(target_keywords[j], dists[i,j]) for j in top_ids])

    return top_kws


class Categorizer(object):
    """Categorize (classify) keywords based on distance in embedding space."""
    def __init__(self, embedder):
        """
        Initialize the categorizer.

        Args:
            embedder: The SIFEmbedder object
        """
        if not embedder.fitted:
            raise ValueError('Embedder need to be fitted before initializing categorizer.')

        self.embedder = embedder

        self.fitted = False                 # Has the categorizer been fitted to categories?
        self.category_names = None          # A list of names (str) of categories
        self.category_ids = None            # A mapping of category ids (dict: str -> str)
        self.category_embeddings = None     # A numpy array of category embeddings - i-th row corresponds
                                            # to the i-th category name


    def fit(self, categories, category_ids=None):
        """
        Build embeddings of given categories to use for categorization.

        Args:
            categories: A list of category names (str).
            category_ids: A list of category ids (str) in the same order as the categories. Optional (default: None).
        """
        self.category_names = categories
        if category_ids is not None:
            self.category_ids = dict(zip(categories, category_ids))
        # compute embeddings
        # first clean categories
        clean_categories = [category_name.replace("/", " ").replace("&", " ") for category_name in self.category_names]
        clean_categories = [re.sub(" +", " ", category_name.strip().lower()) for category_name in clean_categories]

        self.category_embeddings = self.embedder.embed([cat.lower() for cat in clean_categories])
        self.fitted = True


    def get_all_distances(self, keywords, lowercase=True):
        """
        Return distances to all categories for given keywords.

        Args:
            keywords: A list of target keywords (str) to return distances for.

        Returns:
            A numpy array of distances of dimensions |keywords| x |categories|.
        """
        if lowercase :
            # transform the keywords to lower case
            keywords = [kw.lower() for kw in keywords]
        return compute_all_distances(keywords, self.category_names, self.category_embeddings, self.embedder)


    def categorize(self, keywords, n_categories = 3, lowercase=True):
        """
        Return the closest categories. The number of how many categories to return is a parameter.

        Args:
            keywords: A list of target keywords (str) to return distances for.
            n_categories: The number of categories to return. If -1, return all categories. (default: 3)

        Returns:
            A list of lists of category/distance pairs.
        """
        if lowercase:
            # transform the keywords to lower case
            keywords = [kw.lower() for kw in keywords]
        results = find_closest(keywords, self.category_names, self.category_embeddings, self.embedder,
            n_top_keywords=n_categories)

        # if ids are available, add them to the output
        if self.category_ids is not None:
            for row_i, row in enumerate(results):
                results[row_i] = [
                    (f"{category_name}[{self.category_ids[category_name]}]", distance)
                    for category_name, distance in row
                ]

        return results
