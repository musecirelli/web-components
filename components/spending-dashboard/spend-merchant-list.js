/**
 * <spend-merchant-list> — top merchants by spend with proportional bars.
 * Click a row to search for that merchant.
 * Listens: spend:data
 * Emits: spend:drill { q }
 */
import { WebComponent } from '../../shared/component-base.js';
import { fmtUSD, CARD_CSS, PALETTE } from './spend-utils.js';

export class SpendMerchantList extends WebComponent {
  #stats = null;
  #limit = 10;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        ${CARD_CSS}
        ol { list-style: none; margin: 0; padding: 0; }
        li { margin-bottom: 8px; }
        button {
          all: unset; display: block; width: 100%; cursor: pointer;
          border-radius: 8px; padding: 2px 6px; margin: 0 -6px; box-sizing: border-box;
        }
        button:hover, button:focus-visible { background: var(--spend-bg, #f3f4f6); }
        .row { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 3px; }
        .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 8px; }
        .amt { font-variant-numeric: tabular-nums; color: var(--spend-muted, #6b7280); flex: none; }
        .bar { height: 6px; border-radius: 3px; background: var(--spend-bg, #f3f4f6); overflow: hidden; }
        .bar i { display: block; height: 100%; border-radius: 3px; }
        .more { font-size: 13px; margin-top: 6px; }
        .more button { all: unset; color: var(--spend-accent, #4e79a7); cursor: pointer; }
      </style>
      <div class="card">
        <h3>Top merchants</h3>
        <ol></ol>
        <div class="more"></div>
      </div>`;

    this.on('spend:data', (e) => { this.#stats = e.detail.stats; this.#limit = 10; this.#render(); });
    this.shadowRoot.querySelector('ol').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-q]');
      if (b) this.emit('spend:drill', { q: b.dataset.q });
    });
    this.shadowRoot.querySelector('.more').addEventListener('click', () => {
      this.#limit += 10;
      this.#render();
    });
  }

  #render() {
    const ol = this.shadowRoot.querySelector('ol');
    const more = this.shadowRoot.querySelector('.more');
    if (!this.#stats) { ol.innerHTML = ''; return; }
    const list = this.#stats.merchants.slice(0, this.#limit);
    const max = list[0]?.total || 1;
    ol.innerHTML = list.map((m, i) => `
      <li>
        <button data-q="${m.merchant.replace(/"/g, '&quot;')}" title="Show only ${m.merchant.replace(/"/g, '&quot;')}">
          <div class="row">
            <span class="name">${i + 1}. ${m.merchant}</span>
            <span class="amt">${fmtUSD(m.total)}</span>
          </div>
          <div class="bar"><i style="width:${(m.total / max * 100).toFixed(1)}%;background:${PALETTE[i % PALETTE.length]}"></i></div>
        </button>
      </li>`).join('');
    more.innerHTML = this.#stats.merchants.length > this.#limit
      ? `<button type="button">Show ${Math.min(10, this.#stats.merchants.length - this.#limit)} more…</button>` : '';
  }
}

customElements.define('spend-merchant-list', SpendMerchantList);
