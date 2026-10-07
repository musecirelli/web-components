/**
 * <ebidlocal-watchlist> — app shell for the ebidlocal auction watchlist.
 *
 * Fetches a JSON feed (see feed-schema.md) and emits it as
 * `watchlist:data`, which <watchlist-feed> renders. Composes:
 *
 *   <ebidlocal-watchlist src="feed.json.gz">
 *     <filter-bar> + <watchlist-feed> (default light-DOM children,
 *     replaceable via slots)
 *   </ebidlocal-watchlist>
 *
 * Attributes:
 *   src          - URL of the JSON feed to load (.json or .json.gz;
 *                  gzip is detected by magic bytes and decompressed)
 *   event-source - inherited (defaults resolve to this element's parent,
 *                  so a page wrapping the app is the scope)
 *
 * Emits: `watchlist:data` ({ auctions, generated }) on load;
 *        `watchlist:error` ({ error }) on fetch failure.
 *
 * Slots:
 *   <slot name="header">  — above the filter bar
 *   <slot name="controls"> — defaults to <filter-bar>
 *   <slot name="feed">     — defaults to <watchlist-feed>
 *   <slot name="footer">  — below the feed
 */
import { WebComponent } from '../../shared/component-base.js';
import './filter-bar.js';
import './watchlist-feed.js';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host { display: block; font-family: Arial, sans-serif; }
    .page { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .filterbar { position: sticky; top: 0; padding: 10px 0; z-index: 10; }
    .error { background: #ffebee; border: 1px solid #ef9a9a; border-radius: 8px;
             padding: 16px; margin: 16px 0; color: #c62828; }
    .meta { color: #555; font-size: 0.9em; margin: 8px 0; }
  </style>
  <div class="page">
    <slot name="header"></slot>
    <div class="filterbar"><slot name="controls"><filter-bar></filter-bar></slot></div>
    <div class="meta" hidden></div>
    <div class="error" hidden></div>
    <slot name="feed"><watchlist-feed></watchlist-feed></slot>
    <slot name="footer"></slot>
  </div>
`;

/**
 * Load a feed response, transparently handling gzipped feeds.
 *
 * Feeds are stored as `.json.gz` (the raw JSON is hundreds of KB; gzip
 * shrinks it ~8x). GitHub Pages serves the .gz bytes as-is without a
 * Content-Encoding, so the browser won't decompress automatically — detect
 * the gzip magic bytes and run DecompressionStream ourselves. Plain JSON
 * responses pass through untouched.
 */
async function loadFeed(res) {
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGzip) {
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  const stream = new Blob([buf])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  const text = await new Response(stream).text();
  return JSON.parse(text);
}

export class EbayLocalWatchlist extends WebComponent {
  static get observedAttributes() {
    return ['src', 'event-source'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  connectedCallback() {
    if (this.hasAttribute('src')) this._load();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'src' && oldValue !== newValue && this.isConnected) {
      this._load();
    }
    if (name === 'event-source') {
      // Event source scope changed; children re-resolve on their own
      // connectedCallback, but an already-connected tree needs a nudge.
      this._rebindEventSource();
    }
  }

  async _load() {
    const src = this.getAttribute('src');
    const errorEl = this.shadowRoot.querySelector('.error');
    const metaEl = this.shadowRoot.querySelector('.meta');
    errorEl.hidden = true;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status} loading ${src}`);
      const feed = await loadFeed(res);
      const count = (feed.auctions || []).length;
      metaEl.hidden = false;
      metaEl.textContent =
        `${count} auction${count === 1 ? '' : 's'}` +
        (feed.generated ? ` · feed generated ${feed.generated}` : '');
      // Emit on the event source scope so <watchlist-feed> picks it up.
      // Dispatch from here: it bubbles to parent/body per the convention.
      this.emit('watchlist:data', feed);
    } catch (err) {
      errorEl.hidden = false;
      errorEl.textContent = `Could not load watchlist feed: ${err.message}`;
      this.emit('watchlist:error', { error: err.message, src });
    }
  }

  /** Public API: reload the feed (e.g. on a timer for new auctions). */
  refresh() {
    return this._load();
  }
}

customElements.define('ebidlocal-watchlist', EbayLocalWatchlist);
