#!/usr/bin/env python3
"""
Export ebidlocal-scan state.json to the web-components feed schema.

Usage:
    python3 export-feed.py /path/to/state.json /path/to/auctions.json > feed.json

Reads the scan's state.json (items keyed by auction_item_id) and auctions.json
(auction metadata), groups lots by auction, and emits the feed JSON consumed
by <ebidlocal-watchlist>.
"""
import json
import re
import sys
from datetime import datetime, timezone


def parse_auction_title(auction_str):
    """'Auction : #2066: Multi Seller Auction: ...' -> ('2066', 'Multi Seller Auction: ...')."""
    m = re.match(r'Auction\s*:\s*#?(\S+):\s*(.*)', auction_str or '')
    if m:
        return m.group(1), m.group(2).strip()
    return '', auction_str or ''


def main(state_path, auctions_path):
    with open(state_path) as f:
        state = json.load(f)
    with open(auctions_path) as f:
        auctions_meta = json.load(f)

    items = state.get('items', {})
    by_auction = {}
    for item in items.values():
        aid = item.get('auction_id', '')
        by_auction.setdefault(aid, []).append(item)

    feed_auctions = []
    for aid, lots in sorted(by_auction.items()):
        number, title = parse_auction_title(lots[0].get('auction', ''))
        meta = auctions_meta.get(aid, {}) if isinstance(auctions_meta, dict) else {}
        feed_lots = []
        for lot in sorted(lots, key=lambda l: l.get('title', '')):
            feed_lots.append({
                'id': lot.get('auction_item_id', ''),
                'title': lot.get('title') or lot.get('lot_title', ''),
                'sku': lot.get('sku', ''),
                'bid': lot.get('current_bid'),
                'ends': lot.get('ends_raw', ''),
                'url': lot.get('url', ''),
                'image': lot.get('image', ''),
                'keywords': lot.get('keywords', []),
                'categories': lot.get('categories', []),
            })
        # Earliest lot end as the auction end approximation.
        ends = ''
        try:
            ends_dates = [l.get('ends_iso', '') for l in lots if l.get('ends_iso')]
            if ends_dates:
                ends = min(ends_dates)[:10]
        except Exception:
            pass
        feed_auctions.append({
            'id': aid,
            'number': number,
            'title': title or number,
            'ends': ends or meta.get('ends', ''),
            'url': lots[0].get('url', ''),
            'lots': feed_lots,
        })

    feed = {
        'generated': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'auctions': feed_auctions,
    }
    json.dump(feed, sys.stdout, indent=1)
    sys.stdout.write('\n')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(f'Usage: {sys.argv[0]} state.json auctions.json > feed.json', file=sys.stderr)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
