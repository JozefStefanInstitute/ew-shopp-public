"""
Example of data enrichment.

Todo:
    * ...
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


def encode_feature_name(base_datetime, offset_datetime, agg_level, param):
    """ 
    Each weather feature has a unique name which is encoded using the following schema:

        [WEATHER][AGG_LEVEL][OFFSET][PARAM][LOC_INDEX]

        Where:

            WEATHER (str): fixed prefix used to distinguish weather feature type from others (i.e. NEWS)
            AGG_LEVEL (DAY or HOUR): aggregation level
            OFFSET (sign + 2 digits): offset given the aggregation level
            PARAM (str, variable length): ECMWF measurement parameter value (i.e. 2t for Temperature, tcc for Total cloud cover)
            LOC_INDEX (2 digits): index of a measurement location point

            * zero is encoded as +0

        Examples:
            Current date-time is 2017-7-10 12:00

            Aggregation by HOUR:

            WEATHERHOUR+002t01 - temperature on 2017-7-10 at 12:00 at location 1
            WEATHERHOUR+062t01 - temperature on 2017-7-10 at 18:00 at location 1
            WEATHERHOUR+302t01 - temperature on 2017-7-11 at 18:00 at location 1
            WEATHERHOUR+30tcc03 - total cloud cover on 2017-7-11 at 18:00 at location 3

            Aggregation by day:

            WEATHERDAY+002t01 - average temperature on 2017-7-10 at location 1
            WEATHERDAY+042t01 - average temperature on 2017-7-14 at location 1
    """
    assert agg_level in ['hour', 'day']

    if agg_level == 'hour':
        diff = int((offset_datetime - base_datetime).total_seconds() / 3600.0)
    elif agg_level == 'day':
        diff = int((offset_datetime - base_datetime).days)

    feature_name = 'WEATHER%s%s%02d%s' % (
        agg_level.upper(), '+' if diff >= 0 else '-', abs(diff), param)
    return feature_name


def enrich_weather(data, weather_file):
    """
    Each weather feature is represented as additional column in the data frame
    (and in the csv file at the end). 
        
        Args:

        Returns:
           
    """
    # set up weather extractor
    we = weather.WeatherExtractor()
    we.load(weather_file)

    all_features = []
    for index, curr_date in data['Date'].iteritems(): # iterate over sales data
        """
            Each entry in the sales data is enriched with the following features (on the country level):

            WEATHERDAY+002t: actual mean temperature on a given day
            WEATHERDAY+00tp: actual mean total precipitation on a given day
            WEATHERDAY+00tcc: actual mean total cloud cover on a given day
        
            And simillarly for an actual weather from two days ago, actual weather from previous week and forecasted
            weather for two days after and for the next week.
        """
        weather_features = {}

        # make sure curr_date is a datetime.date
        curr_date = curr_date.date() 

        # actual weather on current date - base datetime is today at 00:00
        weather_result = we.get_actual(from_date=curr_date, to_date=curr_date, aggtime='day', aggloc='country')
        
        for datetime_range, param, values in weather_result:
            if param in ['2t', 'tp', 'tcc']:
                feature_name = encode_feature_name(
                    datetime.datetime.combine(curr_date, datetime.time(0)),
                    datetime_range[0],
                    'day',
                    param)
                weather_features[feature_name] = values[0]

        # actual weather from two days ago
        weather_result = we.get_actual(
            from_date=curr_date - datetime.timedelta(days=2), to_date=curr_date - datetime.timedelta(days=1), aggtime='day', aggloc='country')
        
        for datetime_range, param, values in weather_result:
            if param in ['2t', 'tp', 'tcc']:
                feature_name = encode_feature_name(
                    datetime.datetime.combine(curr_date, datetime.time(0)),
                    datetime_range[0],
                    'day',
                    param)
                weather_features[feature_name] = values[0]


        # forecast for the next two days
        weather_result = we.get_forecast(base_date=curr_date, 
            from_date=curr_date + datetime.timedelta(days=1), to_date=curr_date + datetime.timedelta(days=2), aggtime='day', aggloc='country')
        
        for datetime_range, param, values in weather_result:
            if param in ['2t', 'tp', 'tcc']:
                feature_name = encode_feature_name(
                    datetime.datetime.combine(curr_date, datetime.time(0)),
                    datetime_range[0],
                    'day',
                    param)
                weather_features[feature_name] = values[0]

        all_features.append(weather_features)
    
    return pd.concat([data, pd.DataFrame.from_dict(all_features)], axis=1) # add weather features


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Enrich data with weather features.')
    parser.add_argument('input_file', type=str, help='CSV file containing sales data.')
    parser.add_argument('weather_file', type=str, help='GRIB file containing weather data.')
    args = parser.parse_args()

    # load example data to pandas dataframe
    data = load_csv(args.input_file)

    # enrich with weather
    enriched_data = enrich_weather(data, args.weather_file)

    # dump to disk
    dump_csv(enriched_data, args.input_file[:-4] + '_enriched.csv')
