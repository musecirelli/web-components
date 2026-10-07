# ebidlocal-watchlist

A web-component watchlist for ebidlocal auctions. Point it at a JSON feed
and it renders auctions as a feed — new scrapes become new entries, like
RSS.

## Usage

```html
<script type="module" src="./ebidlocal-watchlist.js"></script>

<ebidlocal-watchlist src="./feed.json"></ebidlocal-watchlist>
```

That's it. The component fetches the feed, emits `watchlist:data`, and the
bundled `<watchlist-feed>` renders it. A `<filter-bar>` is included by
default (override via the `controls` slot).

## Components

| Element | Role | Events in | Events out |
|---|---|---|---|
| `<ebidlocal-watchlist>` | App shell; fetches `src` | — | `watchlist:data`, `watchlist:error` |
| `<watchlist-feed>` | Feed container; groups lots by `group-by` | `watchlist:data` | `watchlist:rendered` |
| `<category-entry>` | One named keyword list; collapsed, click to expand | `watchlist:filter` | — |
| `<auction-entry>` | One auction; expandable lot grid (used when `group-by="auction"`) | `watchlist:filter` | — |
| `<lot-card>` | One lot; pure attributes | — | — |
| `<filter-bar>` | Search input | — | `watchlist:filter` |

`<watchlist-feed group-by="category">` (the default) flattens lots across
auctions into Steve's named keyword lists — one collapsed `<category-entry>`
per list, most lots first. A lot in N categories appears in N lists.
`<watchlist-feed group-by="auction">` renders the RSS-style per-auction view.

All components extend `WebComponent` (`../../shared/component-base.js`):
events bubble and are composed; listeners scope to the `event-source`
attribute → parent element → `document.body`.

## Feed format and lifecycle

See [feed-schema.md](./feed-schema.md). The feed is RSS-like with paging:

- `feed.json.gz` — **active auctions only** (the "current" feed), gzipped.
- `archive/<slug>.json.gz` — one file per **expired** auction, frozen with
  its lots as last seen. Slugs are `auction-<number>-<id-hash>.json.gz`
  because display numbers aren't unique.
- `archive/index.json` — manifest of archived auctions (number, title,
  closed date, lot count, file) backing the feed picker in `demo.html`.
  Small, stored uncompressed.

Feeds are gzipped (the raw JSON runs ~600KB; gzip shrinks it ~8x).
`<ebidlocal-watchlist>` detects the gzip magic bytes on load and
decompresses transparently via `DecompressionStream` — `src` can point
at `.json` or `.json.gz`.

`demo.html` has a feed picker: "Current auctions" plus every archived
auction. Switching feeds just sets `src` on `<ebidlocal-watchlist>`,
which reloads.

Generate and maintain the feed from scan data with the change-aware
exporter — it regenerates `feed.json` only when the auction set changes
(new auction appears, old one expires) and archives the expired ones:

```bash
python3 ../../tools/export-feed.py state.json auctions.json \
    --feed-dir .
# → {"changed": true, "new": ["2071"], "expired": ["2066"], ...}
```

On a quiet day it prints `"changed": false` and touches nothing, so the
files stay cache-stable.

## Theming

Components expose CSS custom properties (no shadow-DOM piercing needed):

- `--lot-card-border`, `--lot-card-radius`, `--lot-card-bid-color`
- `--filter-bar-border`, `--filter-bar-focus`

## Demo

`demo.html` loads `./feed.json` (generate it with the exporter above).
Serve the repo root over HTTP — ES module imports don't work from
`file://`:

```bash
python3 -m http.server 8000
# → http://localhost:8000/components/ebidlocal-watchlist/demo.html
```

## Tests

`test.mjs` (repo root) exercises the event flow in jsdom: data rendering,
filtering, and event-source scoping.

```bash
npm install jsdom  # one-time
node test.mjs
```
