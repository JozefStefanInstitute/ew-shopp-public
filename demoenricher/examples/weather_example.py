"""
Example module data enrichment ( with weather features ).

Enrichment works as follows:

    1. loading data 
    Data is stored in tabular format (CSV) where each row corresponds to one day sale of cell phones from 2015-1-20 to 2015-2-10.
    Internally data is stored in Pandas dataframe (http://pandas.pydata.org/) for easier manipulation.

    2. enriching data with weather features
    Each row gets extended with additional columns which correspond to different weather features 
    (i.e. average temperature at a given day, forecast for the next two days, ...). Feature names are encoded
    using the schema described in encode_feature_name docstring.
    Weather data is stored in a pre-downloaded grib file ( jan2015-feb2015.grib ), WeatherExtractor is used for querying.
    
    3. storing enriched data
"""
import argparse
import pandas as pd
import datetime

from weather import weather


def load_csv(filepath):
    """ Reads csv file to pandas dataframe. """
    df = pd.read_csv(filepath, delimiter='\t')
    df['Date'] = pd.to_datetime(df['Date'])
    return df


def dump_csv(data, filepath):
    """ Dumps pandas dataframe to disk. """
    data.to_csv(filepath, sep='\t', index=False)


def encode_feature_name(base_datetime, offset_datetime, fc_or_ac, agg_level, param):
    """ 
    Each weather feature has a unique name which is encoded using the following schema:

        [WEATHER][FC/AC][AGG_LEVEL][OFFSET][PARAM]

        Where:

            WEATHER (str): fixed prefix used to distinguish weather feature type from others (i.e. NEWS)
            FC/AC (FC or AC): constant indicating weather forecast (FC) or actual weather (AC) 
            AGG_LEVEL (DAY, HOUR or WEEK): aggregation level
            OFFSET (sign + 2 digits): offset given the aggregation level ( 0 in encoded as +00)
            PARAM (str, variable length): ECMWF measurement parameter value (i.e. 2t for Temperature, tcc for Total cloud cover, ...)

        Examples:

            Current date-time is 2017-7-10 12:00

            WEATHERACHOUR+002t - actual temperature on 2017-7-10 at 12:00
            WEATHERACHOUR-062t - actual temperature on 2017-7-10 at 06:00 
            WEATHERACHOUR+062t - actual temperature on 2017-7-10 at 18:00 
            WEATHERACHOUR+302t - actual temperature on 2017-7-11 at 18:00 

            WEATHERFCHOUR+062t - forecasted temperature for 2017-7-10 at 18:00 
            WEATHERFCHOUR+302t - forecasted temperature for 2017-7-11 at 18:00 

            WEATHERACDAY+002t - actual daily average temperature on 2017-7-10
            WEATHERACDAY+042t - actual daily average temperature on 2017-7-14

            WEATHERFCDAY+002t - forecasted daily average temperature for 2017-7-10
            WEATHERFCDAY+042t - forecasted daily average temperature for 2017-7-14

            WEATHERACWEEK-012t - actual temperature from previous week (since 2017-7-10 is monday, this is the week from 2017-7-3 to 2017-7-9)
    """
    assert fc_or_ac in ['fc', 'ac', 'FC', 'AC']
    assert agg_level in ['hour', 'day', 'week']

    if agg_level == 'hour':
        diff = int((offset_datetime - base_datetime).total_seconds() / 3600.0)
    elif agg_level == 'day':
        diff = int((offset_datetime - base_datetime).days)
    elif agg_level == 'week':
        diff = int(offset_datetime.date().isocalendar()[
                   1] - base_datetime.date().isocalendar()[1])

    feature_name = 'WEATHER%s%s%s%02d%s' % (
        fc_or_ac.upper(), agg_level.upper(), '+' if diff >= 0 else '-', abs(diff), param)
    return feature_name


def generate_features(weather_data, curr_date, fc_or_ac, agg_level):
    weather_features = dict()

    # current (reference) datetime
    curr_datetime = datetime.datetime.combine(curr_date, datetime.time(0))

    for param in ['2t', 'tcc', 'tp']:
        param_data = weather_data[weather_data['shortName'] == param]

        for row in param_data.iterrows():
            measure = row[1]
        
            # generate feature name
            feature_name = encode_feature_name(
                curr_datetime, measure['validityDateTime'], fc_or_ac, agg_level, param)

            # add feature to collection
            weather_features[feature_name] = measure['values'][0]

    return weather_features

def enrich_weather(data, weather_file):
    """
    Each weather feature corresponds to an additional column in the data frame.

    Args:

        data (pandas.DataFrame): original data
        weather_file (str): path of a GRIB file containing weather data

    Returns:

        result (pandas.DataFrame): data with additional columns

    """
    # set up weather extractor
    we = weather.WeatherExtractor()
    we.load(weather_file)

    all_features = []
    for index, curr_date in data['Date'].iteritems():  # iterate over sales data
        """
            Each entry in the sales data is enriched with the following features (on the country level):

            WEATHERACDAY+002t: actual mean temperature on a given day
            WEATHERACDAY+00tcc: actual mean total cloud cover on a given day
            WEATHERACDAY+00tp: actual mean total precipitation on a given day

            And simillarly for an actual weather from two days ago, a week ago and a forecast for the next two days.
        """
        weather_features = {}

        # make sure curr_date is a datetime.date
        curr_date = curr_date.date()

        # actual weather on current date - base datetime is today at 00:00
        weather_result = we.get_actual(
            from_date=curr_date, to_date=curr_date, aggtime='day', aggloc='country')

        weather_features.update(generate_features(weather_result, curr_date, 'ac', 'day'))

        # actual weather from two days ago
        weather_result = we.get_actual(
            from_date=curr_date - datetime.timedelta(days=2), to_date=curr_date - datetime.timedelta(days=1), aggtime='day', aggloc='country')

        weather_features.update(generate_features(weather_result, curr_date, 'ac', 'day'))

        # actual weather from the previous week
        offset_days = curr_date.isocalendar()[2]  # day of current week
        weather_result = we.get_actual(
            from_date=curr_date + datetime.timedelta(days=-(offset_days + 6)),
            to_date=curr_date + datetime.timedelta(days=-offset_days), aggtime='week', aggloc='country')

        weather_features.update(generate_features(weather_result, curr_date, 'ac', 'week'))

        # forecast for the next two days
        weather_result = we.get_forecast(base_date=curr_date,
                                         from_date=curr_date + datetime.timedelta(days=1), to_date=curr_date + datetime.timedelta(days=2), aggtime='day', aggloc='country')

        weather_features.update(generate_features(weather_result, curr_date, 'fc', 'day'))

        # add features for current row
        all_features.append(weather_features)

    # add weather features
    return pd.concat([data, pd.DataFrame.from_dict(all_features)], axis=1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Enrich data with weather features.')
    parser.add_argument('input_file', type=str,
                        help='CSV file containing sales data.')
    parser.add_argument('weather_file', type=str,
                        help='GRIB file containing weather data.')
    args = parser.parse_args()

    # load example data to pandas dataframe
    data = load_csv(args.input_file)

    # enrich with weather features
    enriched_data = enrich_weather(data, args.weather_file)

    # dump to disk
    dump_csv(enriched_data, args.input_file[:-4] + '_enriched.csv')
