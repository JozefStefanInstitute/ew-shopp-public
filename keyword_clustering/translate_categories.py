# Developed in Python 3.6.7

# Code for translating category names using Google Translate.

import json
import csv
import argparse
import pdb

# !pip install googletrans
from googletrans import Translator


def translate_categories(categories, source_language, destination_language):
    """
    Translate Google adwords category names from one language into antoher using Google translate.

    Args:
        categories: A list of category names.
        source_language: Source language of the categories. Str with the two letter (ISO 639-1) language code. (e.g. 'en')
        destination_language: Destination language of the categories. Str with the two letter (ISO 639-1) language code. (e.g. 'de')

    Returns:
        A list of translated category names.
    """
    t = Translator()

    # collect unique words
    words = set([])
    for category in categories:
        for word in category.split('/'):
            words.add(word)
    words = list(words)
    # remove blank word from start
    words = words[1:]

    word_map = {}
    current_word = 0
    # go over all words
    while current_word < len(words):
        text = ""

        # collect batches of up to 1000 words split by newlines
        freeze_position = current_word
        while current_word < len(words) and len(text) < 1000:
            text += words[current_word] + "\n"
            current_word += 1

        # send batch to translate and split the result
        translated_text = t.translate(
            text,
            src = source_language,
            dest = destination_language
        ).text.split('\n')
        # map the word to its translation
        for i in range(freeze_position, current_word):
            word_map[words[i]] = translated_text[i - freeze_position]
    # empty is empty
    word_map[''] = ''


    translated_categories = []
    for category in categories:
        translated_category = '/'.join(word_map[word] for word in category.split('/'))
        translated_categories.append(translated_category)

    return translated_categories


def main(args):
    rows = []
    # collect the csv rows
    print(f"Reading categories from: {args.path_categories}")
    with open(args.path_categories) as csv_file:
        csv_reader = csv.reader(csv_file, delimiter = args.categories_delimiter)
        line_count = 0
        for row in csv_reader:
            if line_count == 0:
                # first line - get the header
                header = row
            else:
                rows.append(row)
            line_count += 1
    print(f"Read {len(rows)} categories")

    category_names = [row[1] for row in rows]

    print("Translating...")
    translated_category_names = translate_categories(
        category_names,
        args.source_language,
        args.destination_language)

    # extend table with translations
    header.append(header[1] + '_' + (args.destination_language).upper())
    extended_rows = [row + [translated_category_names[row_i]] for row_i, row in enumerate(rows)]

    print(f"Writing translated categories to: {args.path_output}")
    with open(args.path_output, "w", encoding="utf8") as outfile:
        outwriter = csv.writer(outfile, delimiter = args.categories_delimiter)

        outwriter.writerow(header)
        for row in extended_rows:
            outwriter.writerow(row)

    print("Done!")


if __name__ == '__main__':
    # parse command line arguments
    argparser = argparse.ArgumentParser(description='Tool for translating Google adwords category names.')

    argparser.add_argument('path_categories', type=str, help='Path to input csv with categories. Assumed to contain two columns: \'category ID\' and \'category name\'.')
    argparser.add_argument('source_language', type=str, help='Source language of the categories. Str with the two letter (ISO 639-1) language code. (e.g. \'en\')')
    argparser.add_argument('destination_language', type=str, help='Destination language of the categories. Str with the two letter (ISO 639-1) language code. (e.g. \'de\')')
    argparser.add_argument('path_output', type=str, help='Path to the categories output file.')
    argparser.add_argument('--categories_delimiter', '-cd', type=str, default=',', help='Delimiter used in the categories csv file. (default: \',\')')

    args = argparser.parse_args()

    main(args)