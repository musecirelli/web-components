/**
 * <watchlist-feed> — the feed container. New auctions become new entries,
 * like items in an RSS feed.
 *
 * Listens for: `watchlist:data` ({ auctions: [...] }) on its event source.
 * Each auction becomes an <auction-entry>. Re-renders on every data event,
 * so pointing the app at a fresh JSON file is just re-emitting the event.
 *
 * Also listens for: `watchlist:filter` — forwards nothing itself; each
 * <auction-entry> handles its own filtering (they share the event source).
 *
 * Emits: `watchlist:rendered` ({ count }) after rendering.
 *
 * Attributes: event-source (inherited)
 * Slots:
 *   <slot name="empty"> — shown when there are no auctions
 */
import { WebComponent } from '../../shared/component-base.js';
import './auction-entry.js';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host { display: block; }
    .empty { color: #888; padding: 24px; text-align: center; }
  </style>
  <div class="entries"></div>
  <div class="empty" hidden><slot name="empty">No auctions in this feed.</slot></div>
`;

export class WatchlistFeed extends WebComponent {
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
    this.shadowRoot.querySelector('.empty').hidden = auctions.length > 0;

    auctions.forEach((auction, i) => {
      const entry = document.createElement('auction-entry');
      // First entry open by default, like an RSS reader's latest item.
      entry.data = { ...auction, open: i === 0 };
      entries.appendChild(entry);
    });

    this.emit('watchlist:rendered', { count: auctions.length });
  }
}

customElements.define('watchlist-feed', WatchlistFeed);
