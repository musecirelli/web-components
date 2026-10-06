/**
 * <lot-card> — presentational card for a single auction lot.
 *
 * Pure attributes in, rendered HTML out. No events emitted or consumed;
 * it is a leaf in the component tree.
 *
 * Attributes:
 *   title   - lot title (e.g. "Item - 4025")
 *   sku     - SKU string
 *   bid     - current bid, numeric or preformatted string
 *   ends    - human-readable end time
 *   image   - image URL (optional)
 *   url     - click-through URL for the lot
 *   keywords - comma-separated keyword chips (optional)
 *
 * Styling: uses CSS custom properties so hosts can theme without
 * piercing shadow DOM:
 *   --lot-card-border, --lot-card-radius, --lot-card-bid-color
 */
import { WebComponent } from '../../shared/component-base.js';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
      border: 1px solid var(--lot-card-border, #e0e0e0);
      border-radius: var(--lot-card-radius, 8px);
      overflow: hidden;
      background: #fff;
    }
    a.wrap { display: block; color: inherit; text-decoration: none; }
    img {
      width: 100%; height: 150px; object-fit: cover;
      background: #fafafa; display: block;
    }
    .info { padding: 10px 12px; display: flex; flex-direction: column; gap: 3px; }
    .lot { font-weight: bold; }
    .sku { color: #777; font-size: 0.85em; }
    .bid { font-weight: bold; color: var(--lot-card-bid-color, #1b5e20); font-size: 1.05em; }
    .ends { color: #555; font-size: 0.85em; }
    .kws { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
    .kw { background: #e8f5e9; color: #2e7d32; border-radius: 10px; padding: 1px 8px; font-size: 0.75em; }
    .view { margin-top: 6px; color: #1565c0; font-weight: bold; font-size: 0.9em; }
    a.wrap:hover .view { text-decoration: underline; }
  </style>
  <a class="wrap" target="_blank" rel="noopener">
    <img loading="lazy" alt="">
    <div class="info">
      <div class="lot"></div>
      <div class="sku"></div>
      <div class="bid"></div>
      <div class="ends"></div>
      <div class="kws"></div>
      <div class="view">View lot &rarr;</div>
    </div>
  </a>
`;

export class LotCard extends WebComponent {
  static get observedAttributes() {
    return ['title', 'sku', 'bid', 'ends', 'image', 'url', 'keywords'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  connectedCallback() {
    this._render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  _render() {
    const $ = (sel) => this.shadowRoot.querySelector(sel);
    const link = $('a.wrap');
    link.href = this.getAttribute('url') || '#';

    const img = $('img');
    const imageUrl = this.getAttribute('image');
    if (imageUrl) {
      img.src = imageUrl;
      img.alt = this.getAttribute('title') || '';
    } else {
      img.removeAttribute('src');
    }

    $('.lot').textContent = this.getAttribute('title') || '';
    $('.sku').textContent = this.getAttribute('sku') || '';

    const bid = this.getAttribute('bid');
    $('.bid').textContent = bid != null && bid !== ''
      ? (String(bid).startsWith('$') ? bid : `$${bid}`)
      : '';

    const ends = this.getAttribute('ends');
    $('.ends').textContent = ends ? `Ends ${ends}` : '';
    $('.ends').style.display = ends ? '' : 'none';

    const kws = $('.kws');
    kws.innerHTML = '';
    const keywords = (this.getAttribute('keywords') || '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    for (const kw of keywords) {
      const chip = document.createElement('span');
      chip.className = 'kw';
      chip.textContent = kw;
      kws.appendChild(chip);
    }
    kws.style.display = keywords.length ? '' : 'none';
  }
}

customElements.define('lot-card', LotCard);
