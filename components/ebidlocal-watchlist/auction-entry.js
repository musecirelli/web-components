/**
 * <auction-entry> — one entry in the watchlist feed (one auction).
 *
 * Like an RSS <item>: a titled, expandable entry whose body is the
 * auction's lots. Data arrives via the `data` property (a plain object)
 * or via attributes for the scalar fields.
 *
 * Listens for: `watchlist:filter` ({ query }) on its event source —
 * hides itself when neither its own text nor any lot matches.
 * Emits: nothing (leaf-ish; lots are rendered as <lot-card> children).
 *
 * Data shape (property `data`):
 *   { id, number, title, ends, url, lots: [{ id, title, sku, bid,
 *     ends, url, image, keywords: [], categories: [] }] }
 *
 * Slots:
 *   <slot name="header-extra"> — extra content in the entry header
 */
import { WebComponent } from '../../shared/component-base.js';
import './lot-card.js';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host { display: block; }
    details {
      background: white; border: 1px solid #ddd; border-radius: 8px;
      padding: 14px 16px; margin: 14px 0;
    }
    summary { font-size: 1.15em; font-weight: bold; cursor: pointer; }
    summary .meta { font-weight: normal; font-size: 0.8em; color: #555; margin-left: 8px; }
    .cards {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: 12px; padding: 12px 0;
    }
    :host([hidden]) { display: none; }
  </style>
  <details>
    <summary><span class="title"></span><span class="meta"></span><slot name="header-extra"></slot></summary>
    <div class="cards"></div>
  </details>
`;

export class AuctionEntry extends WebComponent {
  #data = null;
  #filterHandler = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  /** @param {{id,title,lots:Array}} data */
  set data(data) {
    this.#data = data;
    if (this.isConnected) this._render();
  }
  get data() { return this.#data; }

  connectedCallback() {
    this.#filterHandler = (e) => this._applyFilter(e.detail?.query || '');
    this.on('watchlist:filter', this.#filterHandler);
    // Re-bind if event-source was set after listeners were attached.
    if (this.isConnected) this._render();
  }

  disconnectedCallback() {
    if (this.#filterHandler) this.off('watchlist:filter', this.#filterHandler);
    super.disconnectedCallback();
  }

  _render() {
    const d = this.#data;
    if (!d) return;
    const $ = (sel) => this.shadowRoot.querySelector(sel);
    $('.title').textContent = d.title || `Auction ${d.number || d.id || ''}`;
    const lotCount = (d.lots || []).length;
    $('.meta').textContent =
      `${lotCount} lot${lotCount === 1 ? '' : 's'}` + (d.ends ? ` · ends ${d.ends}` : '');
    this.shadowRoot.querySelector('details').open = !!d.open;

    const cards = $('.cards');
    cards.innerHTML = '';
    for (const lot of d.lots || []) {
      const card = document.createElement('lot-card');
      card.setAttribute('title', lot.title || '');
      card.setAttribute('sku', lot.sku || '');
      if (lot.bid != null) card.setAttribute('bid', String(lot.bid));
      card.setAttribute('ends', lot.ends || '');
      card.setAttribute('image', lot.image || '');
      card.setAttribute('url', lot.url || '');
      card.setAttribute('keywords', (lot.keywords || []).join(', '));
      // Stash searchable text for filtering.
      card.dataset.search = [
        lot.title, lot.sku, ...(lot.keywords || []), ...(lot.categories || []),
      ].join(' ').toLowerCase();
      cards.appendChild(card);
    }
  }

  _applyFilter(query) {
    const cards = [...this.shadowRoot.querySelectorAll('lot-card')];
    if (!query) {
      this.hidden = false;
      cards.forEach((c) => (c.hidden = false));
      return;
    }
    let visible = 0;
    for (const card of cards) {
      const match = (card.dataset.search || '').includes(query);
      card.hidden = !match;
      if (match) visible++;
    }
    this.hidden = visible === 0;
  }
}

customElements.define('auction-entry', AuctionEntry);
