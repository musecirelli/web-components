# Steve's old ebidlocal components — inventory

Source: https://github.com/scirelli/auction-ebidlocal-extension/tree/master/extension/contentScripts/watchlist/js
Inventoried 2026-10-06. His old watchlist code from the browser extension, for reference while building the new web-components repo.

## The one component (components/)

**AuctionWatchListControls.js** — `class AuctionWatchListControls extends HTMLElement`

- Tag: `auction-watch-list-controls` (static `TAG_NAME`), registered via static `__register(doc)` which also injects `styles` and the `template`.
- Light-DOM component (no shadow DOM): clones a static `template` into itself, injects static `styles` into the document.
- Links to the watch list element via `data-watch-list-id` (observed attribute): `document.body.querySelector('auction-watch-list#<id>')`, throws if unlinked.
- Event-driven, matching the new repo's message-passing convention:
  - Listens for `add-item` events (detail: `{items}`) on itself.
  - Dispatches `all-items-added` (detail: `{items}`) after adding.
  - Adds items by dispatching `add-item` (detail: `{src: url}`) onto the linked `auction-watch-list` element, one item per 500ms via his `__addAllToWatchList` chain/delay.
- URL validation: `new URL(item)` try/catch filter; dedupe via `auctionWatchList.containsItem(url)`.
- Refresh-rate form submits → sets `data-refresh-rate` attribute on the linked watch list (attribute-driven config, as the new convention prefers).
- Raw file: https://raw.githubusercontent.com/scirelli/auction-ebidlocal-extension/master/extension/contentScripts/watchlist/js/components/AuctionWatchListControls.js

## Supporting files (same tree)

- `main.js` (2.9 KB), `replacer.js` (2.5 KB) — wiring at the watchlist level.
- `extras/Array.js`, `extras/Function.js`, `extras/String.js`, `extras/index.js` — his old prototype-extension helpers (e.g. `Array.prototype.chain`, `Function.prototype.delay/.defer`, which AuctionWatchListControls relies on).
- `utils/` dir — more helpers.
- `custom-elements.min.js` (19 KB) — a polyfill shim for older browsers.

## Conventions worth adopting (or deliberately changing) in the new repo

1. Event-first communication already native to his style: `add-item` in, `all-items-added` out. New event names (`watchlist:filter`, etc.) could mirror this namespaced vs bare naming — ask him which he prefers.
2. Attribute-driven config (`data-watch-list-id`, `data-refresh-rate`) — same as the new repo's plan.
3. Static `TAG_NAME` + static `template`/`styles` pattern on the class.
4. `__doubleUnderscore` private-method naming convention.
5. His old code leans on prototype extensions (`chain`, `delay`); the new repo should avoid those (vanilla only, per his preference) and use native async/queue.
