#!/usr/bin/env python3
"""
Change-aware feed exporter for the ebidlocal-watchlist web component.

Reads the ebidlocal scan state:
  state.json    -- lots keyed by auction_item_id (each has auction_id)
  auctions.json -- auction metadata keyed by encrypted AuctionId; watch.py sets
                   `closed` (a date) when an auction leaves the public list

and maintains the feed files consumed by <ebidlocal-watchlist>:
  feed.json.gz         -- active auctions only (the "current" feed), gzipped
  archive/<slug>.json.gz -- one file per expired auction, frozen at last sight
  archive/index.json   -- manifest of archived auctions, for the feed picker
                         (small, stored uncompressed)

Feeds are gzipped: the raw JSON is ~600KB and GitHub's file API is only
practical for smaller payloads, so the exporter writes .gz and the
component transparently decompresses (DecompressionStream) on load.

Change rule: feed.json.gz is regenerated only when a scan causes a change --
a new auction appears, or an old one expires (closed). Otherwise the files
are left untouched, so content and mtimes stay stable for caching.

Usage:
    export-feed.py state.json auctions.json --feed-dir <dir>

Prints a JSON summary to stdout:
    {"changed": bool, "new": [nums], "expired": [nums], "feed": path}

Exit 0 unless the inputs are unreadable; the caller decides whether to push.
"""

import argparse
import gzip
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


def parse_auction_title(auction_str):
    """'Auction : #2066: Multi Seller Auction: ...' -> ('2066', 'Multi Seller Auction: ...')."""
    m = re.match(r'Auction\s*:\s*#?(\S+):\s*(.*)', auction_str or '')
    if m:
        return m.group(1), m.group(2).strip()
    return '', auction_str or ''


def slug_for(aid, number):
    """Filesystem-safe, unique archive slug. Display numbers are not unique
    across internal auctions, so the AuctionId hash disambiguates."""
    num = re.sub(r'[^0-9A-Za-z_-]+', '_', number or 'nonum')
    digest = hashlib.sha1(aid.encode('utf-8')).hexdigest()[:8]
    return f'auction-{num}-{digest}.json.gz'


def write_gz(path, obj):
    """Write obj as gzipped JSON."""
    path.write_bytes(gzip.compress(
        (json.dumps(obj, indent=1) + '\n').encode('utf-8'), mtime=0))


def read_gz_json(path):
    return json.loads(gzip.decompress(path.read_bytes()).decode('utf-8'))


def build_auction_entry(aid, lots, auctions_meta):
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
    ends = ''
    try:
        ends_dates = [l.get('ends_iso', '') for l in lots if l.get('ends_iso')]
        if ends_dates:
            ends = min(ends_dates)[:10]
    except Exception:
        pass
    return {
        'id': aid,
        'number': number or meta.get('num', ''),
        'title': title or meta.get('title', '') or number,
        'ends': ends or meta.get('ends', ''),
        'url': lots[0].get('url', ''),
        'lots': feed_lots,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('state_json')
    ap.add_argument('auctions_json')
    ap.add_argument('--feed-dir', required=True,
                    help='directory holding feed.json and archive/')
    args = ap.parse_args()

    feed_dir = Path(args.feed_dir)
    feed_dir.mkdir(parents=True, exist_ok=True)
    archive_dir = feed_dir / 'archive'
    archive_dir.mkdir(exist_ok=True)

    state = json.loads(Path(args.state_json).read_text())
    auctions_meta = json.loads(Path(args.auctions_json).read_text())

    items = state.get('items', {})
    by_auction = {}
    for item in items.values():
        aid = item.get('auction_id', '')
        if aid:
            by_auction.setdefault(aid, []).append(item)

    # Active = tracked, not closed, with at least one scanned lot.
    active_ids = {
        aid for aid, meta in auctions_meta.items()
        if not aid.startswith('_') and not meta.get('closed') and aid in by_auction
    }

    feed_path = feed_dir / 'feed.json.gz'
    prev_feed = read_gz_json(feed_path) if feed_path.exists() else {'auctions': []}
    prev_by_id = {a['id']: a for a in prev_feed.get('auctions', [])}
    prev_ids = set(prev_by_id)

    new_ids = active_ids - prev_ids
    expired_ids = prev_ids - active_ids
    changed = bool(new_ids or expired_ids)

    now = datetime.now(timezone.utc).isoformat(timespec='seconds')
    summary = {'changed': changed, 'new': [], 'expired': [],
               'archive_files': [],
               'feed': str(feed_path), 'generated': now}

    # Archive expired auctions: freeze their last feed entry in its own file.
    index_path = archive_dir / 'index.json'
    index = json.loads(index_path.read_text()) if index_path.exists() else {'archived': []}
    archived_ids = {e['id'] for e in index['archived']}

    for aid in sorted(expired_ids):
        entry = prev_by_id[aid]
        meta = auctions_meta.get(aid, {})
        entry = dict(entry)
        entry['closed'] = meta.get('closed', '')
        slug = slug_for(aid, entry.get('number', ''))
        write_gz(archive_dir / slug, entry)
        summary['expired'].append(entry.get('number', ''))
        summary['archive_files'].append(f'archive/{slug}')
        if aid not in archived_ids:
            index['archived'].append({
                'id': aid,
                'number': entry.get('number', ''),
                'title': entry.get('title', ''),
                'ends': entry.get('ends', ''),
                'closed': entry.get('closed', ''),
                'lots': len(entry.get('lots', [])),
                'file': f'archive/{slug}',
                'archived_at': now,
            })
            archived_ids.add(aid)

    if expired_ids:
        # Newest-closed first, for the feed picker.
        index['archived'].sort(key=lambda e: e.get('closed', ''), reverse=True)
        index_path.write_text(json.dumps(index, indent=1) + '\n')

    if changed:
        feed_auctions = [
            build_auction_entry(aid, by_auction[aid], auctions_meta)
            for aid in sorted(active_ids)
        ]
        write_gz(feed_path, {'generated': now, 'auctions': feed_auctions})
        for aid in sorted(new_ids):
            meta = auctions_meta.get(aid, {})
            summary['new'].append(meta.get('num', ''))

    json.dump(summary, sys.stdout, indent=1)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
