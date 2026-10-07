/**
 * <watchlist-feed> — the feed container. New auctions become new entries,
 * like items in an RSS feed.
 *
 * Listens for: `watchlist:data` ({ auctions: [...] }) on its event source.
 * Renders according to the `group-by` attribute (default `category`):
 *   - `category`: lots from all auctions grouped into Steve's named
 *     keyword lists — one collapsed <category-entry> per list.
 *   - `auction`: one <auction-entry> per auction (the RSS-style view).
 * Re-renders on every data event, so pointing the app at a fresh JSON
 * file is just re-emitting the event.
 *
 * Also listens for: `watchlist:filter` — forwards nothing itself; each
 * entry handles its own filtering (they share the event source).
 *
 * Emits: `watchlist:rendered` ({ count }) after rendering.
 *
 * Attributes: event-source (inherited), group-by ("category"|"auction")
 * Slots:
 *   <slot name="empty"> — shown when there are no lots
 */
import { WebComponent } from '../../shared/component-base.js';
import './auction-entry.js';
import './category-entry.js';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host { display: block; }
    .empty { color: #888; padding: 24px; text-align: center; }
  </style>
  <div class="entries"></div>
  <div class="empty" hidden><slot name="empty">No lots in this feed.</slot></div>
`;

export class WatchlistFeed extends WebComponent {
  static get observedAttributes() {
    return ['group-by', 'event-source'];
  }
  #dataHandler = null;
  #filterHandler = null;
  #forwarding = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  connectedCallback() {
    this.#dataHandler = (e) => this._render(e.detail);
    this.on('watchlist:data', this.#dataHandler);
    // <auction-entry> children scope to this feed (their shadow host),
    // but `watchlist:filter` arrives here via bubbling from the filter bar.
    // Forward it on ourselves as a non-bubbling event so entries hear it.
    // The re-entrancy flag guards against runtimes that deliver composed
    // events to the shadow host even when bubbles:false (target retargeting
    // makes an e.target check unreliable).
    this.#filterHandler = (e) => {
      if (this.#forwarding) return;
      this.#forwarding = true;
      try {
        this.dispatchEvent(
          new CustomEvent('watchlist:filter', {
            detail: e.detail,
            bubbles: false, // entries listen directly on this feed
            composed: true,
            cancelable: true,
          })
        );
        // Entries filter synchronously; show a "no matches" note when
        // the filter hides every entry.
        const query = e.detail?.query || '';
        const entries = [...this.shadowRoot.querySelectorAll('category-entry, auction-entry')];
        const anyVisible = entries.some((en) => !en.hidden);
        const emptyEl = this.shadowRoot.querySelector('.empty');
        if (query && !anyVisible) {
          emptyEl.hidden = false;
          emptyEl.innerHTML = `No lots match "<strong></strong>".`;
          emptyEl.querySelector('strong').textContent = query;
        } else if (!query) {
          // Restore the default empty slot content.
          emptyEl.innerHTML = '<slot name="empty">No lots in this feed.</slot>';
          emptyEl.hidden = entries.length > 0;
        } else {
          emptyEl.hidden = true;
        }
      } finally {
        this.#forwarding = false;
      }
    };
    this.on('watchlist:filter', this.#filterHandler);
  }

  disconnectedCallback() {
    if (this.#dataHandler) this.off('watchlist:data', this.#dataHandler);
    if (this.#filterHandler) this.off('watchlist:filter', this.#filterHandler);
    super.disconnectedCallback();
  }

  /**
   * @param {{ auctions?: Array, generated?: string }} feed
   */
  _render(feed) {
    const auctions = feed?.auctions || [];
    const entries = this.shadowRoot.querySelector('.entries');
    entries.innerHTML = '';

    const groupBy = (this.getAttribute('group-by') || 'category').toLowerCase();
    let count = 0;
    if (groupBy === 'auction') {
      count = this._renderByAuction(auctions, entries);
    } else {
      count = this._renderByCategory(auctions, entries);
    }

    this.shadowRoot.querySelector('.empty').hidden = count > 0;
    this.emit('watchlist:rendered', { count, groupBy });
  }

  _renderByAuction(auctions, entries) {
    auctions.forEach((auction, i) => {
      const entry = document.createElement('auction-entry');
      // First entry open by default, like an RSS reader's latest item.
      entry.data = { ...auction, open: i === 0 };
      entries.appendChild(entry);
    });
    return auctions.length;
  }

  /**
   * Steve's watchlist view: flatten lots across auctions, group by his
   * named keyword lists. A lot in N categories appears in N lists.
   * Worst case O(L*C) time, O(L*C) space for L lots and C categories —
   * fine for feed sizes (hundreds of lots, tens of categories).
   */
  _renderByCategory(auctions, entries) {
    const byCategory = new Map();
    for (const auction of auctions) {
      for (const lot of auction.lots || []) {
        const cats = lot.categories?.length ? lot.categories : ['Uncategorized'];
        for (const cat of cats) {
          if (!byCategory.has(cat)) byCategory.set(cat, []);
          byCategory.get(cat).push({
            ...lot,
            auctionNumber: auction.number || '',
            auctionTitle: auction.title || '',
          });
        }
      }
    }
    // Most lots first — the lists Steve checks most are on top.
    const sorted = [...byCategory.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    for (const [name, lots] of sorted) {
      const entry = document.createElement('category-entry');
      entry.data = { name, lots };
      entries.appendChild(entry);
    }
    return sorted.length;
  }
}

customElements.define('watchlist-feed', WatchlistFeed);
