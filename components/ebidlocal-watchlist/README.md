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
| `<watchlist-feed>` | Feed container; one `<auction-entry>` per auction | `watchlist:data` | `watchlist:rendered` |
| `<auction-entry>` | One auction; expandable lot grid | `watchlist:filter` | — |
| `<lot-card>` | One lot; pure attributes | — | — |
| `<filter-bar>` | Search input | — | `watchlist:filter` |

All components extend `WebComponent` (`../../shared/component-base.js`):
events bubble and are composed; listeners scope to the `event-source`
attribute → parent element → `document.body`.

## Feed format

See [feed-schema.md](./feed-schema.md). Generate one from scan data with:

```bash
python3 ../../tools/export-feed.py state.json auctions.json > feed.json
```

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
