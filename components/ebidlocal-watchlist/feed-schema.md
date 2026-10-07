# ebidlocal watchlist feed schema

The `<ebidlocal-watchlist>` component loads a JSON feed. Point `src` at any
URL serving this shape — a static file, or a script that regenerates it
after each scrape (like an RSS feed where new auctions become new entries).

```json
{
  "generated": "2026-10-06T12:17:06Z",
  "auctions": [
    {
      "id": "QnGT3BhftWOEo8RNlRZKwA==",
      "number": "2066",
      "title": "Multi Seller Auction: 7700 Advantage Storage Dr, Chester VA",
      "ends": "2026-10-07",
      "url": "https://auction.ebidlocal.com/Public/Auction/...",
      "lots": [
        {
          "id": "wWNOnj7JPkwXX2/LhCCAAw==",
          "title": "Item - 4025",
          "sku": "SKU# : 785262",
          "bid": 3.0,
          "ends": "10/07/2026 09:07:00",
          "url": "https://auction.ebidlocal.com/...",
          "image": "https://s3.amazonaws.com/...",
          "keywords": ["coffee"],
          "categories": ["Appliances"]
        }
      ]
    }
  ]
}
```

Field notes:
- `generated` — ISO timestamp of the scrape. Displayed in the app header.
- `auctions[].number` — human display number (not unique across internal
  auctions; `id` is the encrypted AuctionId and is the identity).
- `lots[].bid` — number or preformatted string (`"$3.00"` also accepted).
- `lots[].keywords` / `lots[].categories` — used for filter chips and search.
- All URL fields should be absolute.
- `image` may be omitted; the card renders without it.

See `tools/export-feed.py` for a converter from the ebidlocal-scan
`state.json` format to this schema.

## Archive format

Expired auctions are frozen to `archive/auction-<number>-<idhash>.json.gz` —
one file each, gzipped, in exactly the feed shape above for a single
auction, plus a `closed` date field on the auction entry.
`archive/index.json` lists them for feed pickers:

```json
{
  "archived": [
    {
      "id": "QnGT3BhftWOEo8RNlRZKwA==",
      "number": "2066",
      "title": "Multi Seller Auction: 7700 Advantage Storage Dr, Chester VA",
      "ends": "2026-10-07",
      "closed": "2026-10-08",
      "lots": 242,
      "file": "archive/auction-2066-ed1a13cb.json.gz",
      "archived_at": "2026-10-08T12:00:00Z"
    }
  ]
}
```

Newest-closed first. Any page can offer feed paging by listing
`archive/index.json` next to `feed.json.gz` and switching the `src`
attribute — see `demo.html`. The component sniffs the gzip magic bytes,
so `.json` and `.json.gz` both work as `src`.
