import eventregistry as ER
import json
import argparse
import pdb
import sys
import os

# map from query type name to object
QUERY_TYPE = {
    "queryEvents": ER.QueryEvents,
    "queryEventsIter": ER.QueryEventsIter,
    "queryEvent": ER.QueryEvent,
    "queryArticles": ER.QueryArticles,
    "queryArticlesIter": ER.QueryArticlesIter,
    "queryArticle": ER.QueryArticle
}


def connect_to_er(api_key, max_retries=3):
    """Establish a connection to Event Registry."""
    if api_key is not None:
        er = ER.EventRegistry(
            apiKey = api_key,
            repeatFailedRequestCount = max_retries)
    else:
        er = ER.EventRegistry(
            repeatFailedRequestCount = max_retries)

    return er


def download_event_list(er, query):
    """Query Event Registry for event URI list."""
    query.setRequestedResult(ER.RequestEventsUriList(count=300000))

    return er.execQuery(query)


def read_query(file):
    """Read query from file."""
    query_json = json.load(file)

    query_type = query_json['type']
    query_str = json.dumps(query_json['query'])
    query = QUERY_TYPE[query_type].initWithComplexQuery(query_str)

    return query


def get_events_list(query_fnm, out_fnm, api_key):
    """Get list of event URIs from saved query."""
    er = connect_to_er(api_key)

    with open(query_fnm) as query_file:
        print "Reading query from:", query_fnm
        query = read_query(query_file)

    print "Executiong query..."
    res = download_event_list(er, query)

    if "error" in res:
        raise Exception("Event Registry error: %s" % res['error'])

    with open(out_fnm, 'w') as outfile:
        print "Writing query result to:", query_fnm
        json.dump(res, outfile)


def get_events_info(events_fnm, out_fnm, api_key):
    """Get info for list of event URIs."""
    er = connect_to_er(api_key)

    with open(events_fnm) as infile:
        event_uri_res = json.load(infile)
    n_events = event_uri_res["uriList"]["count"]
    event_uri_list = event_uri_res["uriList"]["results"]

    print "Downloading info for %d events" % n_events
    print "Writing output into %s" % out_fnm

    loc = 0
    step = 200

    mode = "w"
    if os.path.isfile(out_fnm):
        print "file %s already exists - continuing from last downloaded event" % out_fnm
        with open(out_fnm) as infile:
            lines = infile.readlines()
            if len(lines) > 0:
                last_event = json.loads(lines[-1])
                # check if last event in right location
                try:
                    assert event_uri_list[len(lines)-1] == last_event['info']['uri'], \
                    "last event in file not in correct location"
                except:
                    pdb.set_trace()
                loc = len(lines)
            mode = "a"
            print "starting at event %d" % loc

    with open(out_fnm, mode) as outfile:
        while loc < n_events:
            end = min(n_events, loc + step)

            print "\rdownloading info for events: %d - %d" % (loc, end),
            sys.stdout.flush()

            batch = event_uri_list[loc:end]
            query = ER.QueryEvent(batch)
            query.setRequestedResult(
                ER.RequestEventInfo(returnInfo = ER.ReturnInfo(
                    eventInfo = ER.EventInfoFlags(
                        title=True,
                        summary = True,
                        articleCounts = True,
                        concepts = True,
                        categories = True,
                        location = True,
                        date = True,
                        commonDates = False,
                        stories = False,
                        socialScore = True,
                        imageCount = 0))))

            batch_res = er.execQuery(query)

            # dump events into files in the same order as they are in the batch
            for event_uri in batch:
                outfile.write(json.dumps(batch_res[event_uri]) + '\n')

            loc = loc + 200


if __name__ == '__main__':
    argparser = argparse.ArgumentParser()
    argparser.add_argument('--api_key', type=str, default=None, help='Event Registry API key.')

    subparsers = argparser.add_subparsers(help='commands')

    list_argparser = subparsers.add_parser("list", help='Get events URI list.')
    list_argparser.set_defaults(action='list')
    list_argparser.add_argument('query_fnm', type=str, help='Path to query file.')
    list_argparser.add_argument('out_fnm', type=str, help='Path to output file.')


    info_argparser = subparsers.add_parser("info", help='Get events info.')
    info_argparser.set_defaults(action='info')
    info_argparser.add_argument('events_fnm', type=str, help='Path to file with events uri list.')
    info_argparser.add_argument('out_fnm', type=str, help='Path to output file.')

    args = argparser.parse_args()

    if args.action == 'list':
        get_events_list(args.query_fnm, args.out_fnm, args.api_key)
    elif args.action == 'info':
        get_events_info(args.events_fnm, args.out_fnm, args.api_key)
