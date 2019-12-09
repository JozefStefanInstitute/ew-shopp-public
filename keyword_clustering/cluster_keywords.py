# Developed in Python 3.6.7

# Code for clustering sets of keywords using FastText word vectors for representation.
# FastText website: https://fasttext.cc
# FastText word vectors: https://fasttext.cc/docs/en/crawl-vectors.html

import json
import re
import csv
import random

from collections import Counter

import fasttext
import numpy as np
from tqdm import tqdm

from sklearn.decomposition import TruncatedSVD


def load_FT_model(path):
    """
    Loads FastText embeddings from (bin) file.

    Args:
        path: Path to FastText word vectors binary file.

    Returns:
        fasttext model object.
    """
    return fasttext.load_model(path)


def tokenize(keyword):
    """
    Tokenizes using default fasttext tokenizer.

    Args:
        keyword: Keyword string (can be multi-word phrase!).

    Returns:
        List of words (tokens) from the keyword.
    """
    return fasttext.tokenize(keyword)


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


def load_csv_column(path, column_name, delimiter=',', errors='raise'):
    """
    Load the contents of a column in a csv file.

    Args:
        path: Path to the csv file containing the column.
        delimiter: The delimiter used in the csv file.
        column_name: The name of the target column.

    Returns:
        A list of column fields as strings.
    """
    assert errors in ['skip', 'raise']

    fields = []
    n_skip = 0
    # go over all the csv rows
    with open(path, encoding="utf8") as csv_file:
        csv_reader = csv.reader(csv_file, delimiter=delimiter)
        line_count = 0
        for row in csv_reader:
            if line_count == 0:
                # first line - get the column index from the header
                keyword_header = row
                column_index = keyword_header.index(column_name)
            else:
                # get the correct field
                try:
                    fields.append(row[column_index])
                except Exception as e:
                    print("\n!!! ERROR !!!\nRow[%d]: %s\n" % (line_count, row))
                    n_skip += 1
                    if errors == 'raise':
                        raise e

            line_count += 1

    if n_skip > 0:
        print("Rows skipped: %d/%d " % (n_skip, line_count))
    return fields

def sif_embedding(keywords, model, word_frequencies, n_principal_components=1, alpha=1e-3, principal_components=None,
    return_components=False, n_all_words=None, word2weight=None):
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
    if n_all_words is None:
        n_all_words = float(sum(freq for _, freq in word_frequencies.items()))
    if word2weight is None:
        word2weight = {word: alpha / (alpha + freq / n_all_words) for word, freq in word_frequencies.items()}

    # calculate weighted average of word embeddings
    embs = np.zeros((len(keywords), 300))
    for i, keyword in enumerate(tqdm(keywords, desc='Average embedding', leave=False)):
        words = tokenize(keyword)

        # What should be the weight of a word not present in the training corpus (in word_frequencies table)?
        # Pretend in only appears once - has a frequency of 1.
        # This favours the unseen words...
        for word in words:
            if word not in word2weight:
                word2weight[word] = alpha / (alpha + 1 / (n_all_words + 1))

        ws = sum(word2weight[word] * model.get_word_vector(word) for word in words)
        embs[i] = ws  / len(words)

    if principal_components is None and n_principal_components > 0:
        # calculate principal components
        svd = TruncatedSVD(n_components=n_principal_components, n_iter=7, random_state=0)
        svd.fit(embs)
        principal_components = svd.components_

    # remove principal components
    if n_principal_components > 0:
        batch_size = 1000
        for i in tqdm(range(0, embs.shape[0], batch_size), desc='Remove principal component', leave=False):
            if n_principal_components == 1:
                embs[i:i + batch_size] -= embs[i:i + batch_size].dot(principal_components.transpose()) * principal_components
            else:
                embs[i:i + batch_size] -= embs[i:i + batch_size].dot(principal_components.transpose()).dot(principal_components)

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

        self.n_all_words = None             # sum of all word frequencies
        self.word2weight = None             # word to weight mapping
        
    def fit(self, keywords, sample_size=1000000):
        """
        Fit the embedder to a set of keywords, computing the word frequencies and principal components, and embed them.

        Args:
            keywords: A list of keywords (i.e. multi-word strings) to fit to and embed.

        Returns:
            Embeddings of the given keywords.
        """
        # first count the word frequencies in the given keywords
        self.word_frequencies = count_word_frequencies(keywords)
        self.n_all_words = float(sum(freq for _, freq in self.word_frequencies.items()))
        self.word2weight = {word: self.alpha / (self.alpha + freq / self.n_all_words) for word, freq in self.word_frequencies.items()}

        # it is enough to fit on a random sample of keywords
        if len(keywords) > sample_size:
            print("Random sampling 1000000 keywords")
            keywords = random.sample(keywords, sample_size)

        # then compute the SIF embeddings (computing the principal components along the way)
        embeddings, self.principal_components = sif_embedding(
            keywords,
            self.model,
            self.word_frequencies,
            n_principal_components = self.n_principal_components,
            alpha = self.alpha,
            principal_components = None,
            return_components = True,
            n_all_words=self.n_all_words,
            word2weight=self.word2weight)

        self.fitted = True


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
            return_components = False,
            n_all_words=self.n_all_words,
            word2weight=self.word2weight)

        return embeddings


    def serialize(self):
        """
        Save the embedding parameters. Serializes word frequencies and principal components to JSON.
        Does NOT serialize the fasttext model.

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
        self.n_all_words = float(sum(freq for _, freq in self.word_frequencies.items()))
        self.word2weight = {word: self.alpha / (self.alpha + freq / self.n_all_words) for word, freq in self.word_frequencies.items()}

        self.principal_components = np.array(parameters["principal_components"])

        self.fitted = True


def _compute_distances_raw(l1, l2, embedder, n_closest=-1, return_distances=False):
    """
    Compute cosine distances between rows from ``m1`` to those from ``m2`` while return only indices and distances of ``n_closest``
    rows from m2.

    Args:
        m1: A numpy array of dimensions A x d
        m2: A numpy array of dimensions B x d
        n_closest: Number of closest rows of m2 to return (n_closest=-1 returns all rows)
        
    Returns:
        A numpy array of distances of dimensions A x ``n_closest``.
    """
    assert n_closest <= len(l2)
    inds = np.zeros((len(l1), n_closest), dtype=int)
    if return_distances:
        dists = np.zeros((len(l1), n_closest))
    
    batch_size = 4000
    # if one of the lists is short enough, precompute its embeddings
    # and normalize them
    m1_pre, m2_pre = None, None
    if len(l1) < batch_size:
        m1_pre = embedder.embed(l1)
        m1_pre = m1_pre / np.linalg.norm(m1_pre, ord=2, axis=-1, keepdims=True)
    if len(l2) < batch_size:
        m2_pre = embedder.embed(l2)
        m2_pre = m2_pre / np.linalg.norm(m2_pre, ord=2, axis=-1, keepdims=True)
    
    for m1_start in tqdm(range(0, len(l1), batch_size), desc='Calculating distances'):
        # normalize a batch of rows from m1
        if m1_pre is not None:
            m1_norm = m1_pre
        else:
            m1_norm = embedder.embed(l1[m1_start:m1_start + batch_size])
            m1_norm = m1_norm / np.linalg.norm(m1_norm, ord=2, axis=-1, keepdims=True)

        m1_size = min(batch_size, len(l1) - m1_start)
        curr = [[] for i in range(m1_size)] # set of closest rows
        for m2_start in tqdm(range(0, len(l2), batch_size), leave=False):
            # normalize a batch of rows from m2
            if m2_pre is not None:
                m2_norm = m2_pre            
            else:
                m2_norm = embedder.embed(l2[m2_start:m2_start + batch_size])
                m2_norm = m2_norm / np.linalg.norm(m2_norm, ord=2, axis=-1, keepdims=True)
            # calculate and sort distances
            curr_dists =  1. - np.matmul(m1_norm, m2_norm.T)
            s_ids = m2_start + np.argsort(curr_dists, axis=-1)[:, :n_closest]
            s_dists = np.sort(curr_dists, axis=-1)[:, :n_closest]
            # merge to keep 'n_closest' rows from m2
            for i in range(0, m1_size):
                curr[i] = sorted(curr[i] + list(zip(s_ids[i], s_dists[i])), key=lambda x: x[1])[:n_closest] 
            
        # store the indices of n closest targets
        inds[m1_start:m1_start + batch_size] = np.array([[x[0] for x in row] for row in curr])
        if return_distances:
            dists[m1_start:m1_start + batch_size] = np.array([[x[1] for x in row] for row in curr])
    if return_distances:
        return inds, dists
    return inds


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
        self.clean_categories = None

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
        clean_categories = [cat.lower() for cat in clean_categories]

        self.clean_categories = clean_categories
        self.category_embeddings = self.embedder.embed(clean_categories)
        self.fitted = True


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
        
        # calculate raw
        inds, dists = _compute_distances_raw(keywords, self.clean_categories, embedder=self.embedder, n_closest=n_categories, return_distances=True)

        # collect top closest keywords
        results = []
        for i in range(0, dists.shape[0]):
            results.append([(self.category_names[ind], dist) for ind, dist in zip(inds[i], dists[i])])
        
        # if ids are available, add them to the output
        if self.category_ids is not None:
            for row_i, row in enumerate(results):
                results[row_i] = [
                    (category_name, self.category_ids[category_name], distance)
                    for category_name, distance in row
                ]

        return results

    def closest_keywords(self, keywords, n_keywords, lowercase=True):
        """
        For each keyword k return the list of all categories where k is
        among 'n_keywords' closest keywords.
        
        Args:
            keywords: A list of keywords (str).
            n_keywords: The number of closest keywords per category. (default: 1000)

        Returns:
            A list of lists of category/distance pairs.
        """
        if lowercase:
            # transform the keywords to lower case
            keywords = [kw.lower() for kw in keywords]
        
        # 'n_keywords' cannot be more then the actual number of keywords
        n_keywords = min(len(keywords), n_keywords)
        # calculate raw
        inds, dists = _compute_distances_raw(self.clean_categories, keywords, embedder=self.embedder, n_closest=n_keywords, return_distances=True)

        # collect top n closest keywords for each category
        results = [[] for i in range(len(keywords))]
        for j in range(0, dists.shape[0]):
            # top n keywords closest to category
            for i, dist in zip(inds[j], dists[j]):
                results[i].append((self.category_names[j], dist))
                
        # if ids are available, add them to the output
        if self.category_ids is not None:
            for row_i, row in enumerate(results):
                results[row_i] = [
                    (category_name, self.category_ids[category_name], distance)
                    for category_name, distance in row
                ]
        
        return results
