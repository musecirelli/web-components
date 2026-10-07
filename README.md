# web-components

A monorepo/store of vanilla web components. Web standards only —
no frameworks, no third-party libraries, no web-component library.
Just HTML, CSS, and JavaScript.

GitHub Pages serves this repo; [the landing page](https://musecirelli.github.io/web-components/)
is a table of contents grouping components by how they're used.

## Layout

```
index.html                  # landing page / TOC (GH Pages root)
manifest.json               # repo index: groups + items (TOC source of truth)
shared/component-base.js    # WebComponent base class (event conventions)
components/<name>/         # one directory per component or component family
  <name>.js                # the element(s), as ES modules
  demo.html                # working demo
  README.md                # usage docs
  feed-schema.md           # (when applicable) data format docs
  feed.json                # (when applicable) live data feed, active entries
  archive/                 # (when applicable) one file per expired feed entry
    index.json             # manifest of archived entries, for pickers
tools/                     # helper scripts (exporters, etc.)
```

## manifest.json

The landing page's table of contents is data, not hand-edited HTML.
`manifest.json` lists **groups** (id, title, blurb) and **items**
(title, kind, groups, path, description, optional demo/source links).
`index.html` fetches it at runtime and renders the grouped TOC —
no build step, and the manifest doubles as a machine-readable index
for programmatic discovery (`fetch('./manifest.json')`).

## Communication conventions

Components talk to each other and to pages through three channels,
in this order of preference:

### 1. Message passing (events)

The primary channel. Components dispatch `CustomEvent`s and listen for
them — never call each other's methods directly.

- Event names use the `namespace:action` convention: `watchlist:data`,
  `watchlist:filter`, `watchlist:rendered`.
- All emitted events set `bubbles: true, composed: true`, so they cross
  shadow DOM boundaries.
- Payloads go in `event.detail` as plain data.

### 2. DOM attributes

Configuration flows in through attributes: `src`, `title`, `bid`,
`placeholder`. Scalar values only — structured data goes through events
or properties.

### 3. Slots

Customizable content flows in through `<slot>` elements. A component
ships sensible defaults in its slots so `<my-el></my-el>` works with
zero configuration, and hosts override by slotting their own elements.

### Event scoping

Components listen for events on a scoped source, resolved in this order:

1. the `event-source` attribute — a CSS selector, e.g.
   `<watchlist-feed event-source="#app">`;
2. the shadow host, if the component lives in a shadow tree
   (the host is the containing element);
3. the component's parent element;
4. `document.body` (the default).

Prefer scoping to the parent: it's usually the thing using the component
and passing it data. Widen with `event-source` when the component needs
to be useful outside its parent.

The `WebComponent` base class (`shared/component-base.js`) implements
all of this: `on()` / `off()` with automatic listener cleanup on
disconnect, `emit()` with the right event init, and `eventSource`
resolution.

## Component lifecycle

Components don't have to be generic. Build for the specific app in front
of you. When a second use case appears, generalize the component to fit
both — then update the original use to the generic version. The index
groups components by how they're used, not by abstraction level.

## Engineering standards

- Vanilla HTML/CSS/JS. No dependencies, including no component library.
- Shadow DOM for encapsulation; style via CSS custom properties so hosts
  can theme without piercing.
- `customElements.define()` with hyphenated tag names.
- ES modules, `type="module"`. Serve over HTTP (modules don't load from
  `file://`).
- JSDoc on public API. README per component family with an events table.
- Semantic HTML and `aria-label`s where components render controls.

## Adding a component

1. Create `components/<name>/` with the element module(s), `demo.html`,
   and `README.md`.
2. Extend `WebComponent`; follow the communication conventions above.
3. Add an entry to `manifest.json` under the right group (or add a group).
   The landing page renders itself from the manifest.
4. Demo must run from the repo root over plain HTTP with no build step.
