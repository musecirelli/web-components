/**
 * <deal-watch-table> — sortable, filterable results table for deal-watch feeds.
 *
 * Feed schema is documented in feed-schema.md. The component fetches the
 * JSON feed from `src` (plain .json or .json.gz — gzip is detected by magic
 * bytes, since GH Pages doesn't send Content-Encoding) and renders one row
 * per item: thumbnail + linked name, retailer, price, baseline, change vs
 * baseline, stock status, badges, then one column per entry in the feed's
 * `spec_columns` list.
 *
 *   <deal-watch-table src="./feeds/kids-scooter.json.gz"></deal-watch-table>
 *
 * Attributes:
 *   src          - URL of the JSON feed to load
 *   event-source - inherited (defaults resolve to this element's parent)
 *
 * Emits: `dealwatch:data` ({ feed }) on load; `dealwatch:error` ({ error })
 *        on fetch/parse failure. Both bubble and are composed.
 *
 * Slots:
 *   <slot name="header"> — rendered above the toolbar
 *   <slot name="footer"> — rendered below the table
 */
import { WebComponent } from '../../shared/component-base.js';

const GZIP_MAGIC_1 = 0x1f;
const GZIP_MAGIC_2 = 0x8b;

export class DealWatchTable extends WebComponent {
  static get observedAttributes() {
    return ['src'];
  }

  #feed = null;
  #sortKey = 'change';
  #sortDir = 1; // 1 = asc, -1 = desc
  #query = '';
  #retailer = 'all';
  #dealsOnly = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.#renderShell();
    // Event-driven data input (repo convention): a page or parent shell can
    // push a feed via `dealwatch:data` instead of setting src. Ignore our
    // own bubbled load events to avoid a double render.
    this.on('dealwatch:data', (e) => {
      if (e.target === this || !e.detail || !e.detail.feed) return;
      this.#feed = e.detail.feed;
      this.#render();
    });
  }

  connectedCallback() {
    this.#load();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'src' && oldValue !== newValue && this.isConnected) {
      this.#load();
    }
  }

  // -- data loading -------------------------------------------------------

  async #load() {
    const src = this.getAttribute('src');
    if (!src) {
      this.#showStatus('No feed configured (missing src attribute).');
      return;
    }
    this.#showStatus('Loading…');
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status} loading ${src}`);
      let buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length >= 2 && buf[0] === GZIP_MAGIC_1 && buf[1] === GZIP_MAGIC_2) {
        const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
        buf = new Uint8Array(await new Response(stream).arrayBuffer());
      }
      const feed = JSON.parse(new TextDecoder().decode(buf));
      this.#feed = feed;
      this.#sortKey = 'change';
      this.#sortDir = 1;
      this.#query = '';
      this.#retailer = 'all';
      this.#dealsOnly = false;
      this.#render();
      this.emit('dealwatch:data', { feed });
    } catch (err) {
      this.#showStatus(`Could not load feed: ${err.message}`);
      this.emit('dealwatch:error', { error: String(err && err.message || err) });
    }
  }

  /** Re-fetch the current src (e.g. on a timer). */
  refresh() {
    return this.#load();
  }

  // -- filtering / sorting -------------------------------------------------

  #visibleItems() {
    if (!this.#feed || !Array.isArray(this.#feed.items)) return [];
    const q = this.#query.trim().toLowerCase();
    return this.#feed.items.filter((it) => {
      if (this.#retailer !== 'all' && (it.retailer || '') !== this.#retailer) return false;
      if (this.#dealsOnly && !(typeof it.change === 'number' && it.change < 0)) return false;
      if (q) {
        const hay = [it.name, it.brand, it.retailer, it.id,
          ...Object.values(it.specs || {})].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => this.#compare(a, b));
  }

  #cellValue(item, key) {
    if (key === 'name') return (item.name || '').toLowerCase();
    if (key === 'retailer') return (item.retailer || '').toLowerCase();
    if (key === 'price') return item.price ?? Number.POSITIVE_INFINITY;
    if (key === 'baseline') return item.baseline ?? Number.POSITIVE_INFINITY;
    if (key === 'change') return item.change ?? Number.POSITIVE_INFINITY;
    if (key === 'stock') return item.in_stock === true ? 0 : item.in_stock === false ? 2 : 1;
    if (key.startsWith('spec:')) {
      const v = (item.specs || {})[key.slice(5)];
      const n = v != null ? parseFloat(String(v).replace(/[^0-9.]/g, '')) : NaN;
      return Number.isNaN(n) ? String(v || '').toLowerCase() : n;
    }
    return '';
  }

  #compare(a, b) {
    const va = this.#cellValue(a, this.#sortKey);
    const vb = this.#cellValue(b, this.#sortKey);
    let cmp;
    if (typeof va === 'number' && typeof vb === 'number') {
      cmp = va - vb;
    } else {
      cmp = String(va).localeCompare(String(vb));
    }
    return cmp * this.#sortDir;
  }

  // -- rendering -----------------------------------------------------------

  #renderShell() {
    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; font-family: system-ui, -apple-system, sans-serif; }
      .toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
        margin: 8px 0; }
      .toolbar input[type="search"] { flex: 1 1 200px; padding: 6px 10px;
        border: 1px solid var(--dealwatch-border, #ccc); border-radius: 6px; }
      .chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .chip { padding: 4px 10px; border: 1px solid var(--dealwatch-border, #ccc);
        border-radius: 999px; background: var(--dealwatch-chip-bg, #fff);
        cursor: pointer; font-size: 13px; }
      .chip[aria-pressed="true"] { background: var(--dealwatch-accent, #1a73e8);
        color: #fff; border-color: var(--dealwatch-accent, #1a73e8); }
      .meta { color: var(--dealwatch-muted, #666); font-size: 13px; }
      .table-wrap { overflow-x: auto; }
      table { border-collapse: collapse; width: 100%; font-size: 14px; }
      th, td { padding: 8px 10px; border-bottom: 1px solid var(--dealwatch-border, #e0e0e0);
        text-align: left; vertical-align: middle; }
      th { white-space: nowrap; user-select: none; }
      th.sortable { cursor: pointer; }
      th.sortable:hover { text-decoration: underline; }
      .item-cell { display: flex; gap: 10px; align-items: center; min-width: 220px; }
      .item-cell img { width: 56px; height: 56px; object-fit: contain;
        border: 1px solid var(--dealwatch-border, #e0e0e0); border-radius: 6px;
        background: #fff; flex: none; }
      .item-cell a { color: inherit; font-weight: 600; }
      .price { font-weight: 700; white-space: nowrap; }
      .was { color: var(--dealwatch-muted, #666); text-decoration: line-through;
        font-size: 12px; display: block; font-weight: 400; }
      .change-neg { color: var(--dealwatch-good, #1b5e20); font-weight: 700; white-space: nowrap; }
      .change-pos { color: var(--dealwatch-bad, #b3261e); white-space: nowrap; }
      .change-flat { color: var(--dealwatch-muted, #666); white-space: nowrap; }
      .stock-in { color: var(--dealwatch-good, #1b5e20); font-weight: 600; white-space: nowrap; }
      .stock-out { color: var(--dealwatch-bad, #b3261e); font-weight: 600; white-space: nowrap; }
      .stock-unknown { color: var(--dealwatch-muted, #666); white-space: nowrap; }
      .badge { display: inline-block; font-size: 11px; padding: 1px 7px; margin: 1px 2px 1px 0;
        border-radius: 999px; background: var(--dealwatch-badge-bg, #e8f0fe);
        color: var(--dealwatch-badge-fg, #1a73e8); white-space: nowrap; }
      .status { padding: 24px; text-align: center; color: var(--dealwatch-muted, #666); }
    `;
    this.shadowRoot.appendChild(style);

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <slot name="header"></slot>
      <div class="toolbar">
        <input type="search" id="q" placeholder="Filter items…" aria-label="Filter items">
        <div class="chips" id="retailers"></div>
        <label class="meta"><input type="checkbox" id="deals"> deals only</label>
        <span class="meta" id="count"></span>
      </div>
      <div class="meta" id="generated"></div>
      <div class="table-wrap"><div id="body"></div></div>
      <slot name="footer"></slot>
    `;
    this.shadowRoot.appendChild(wrap);

    this.shadowRoot.getElementById('q').addEventListener('input', (e) => {
      this.#query = e.target.value;
      this.#renderTable();
    });
    this.shadowRoot.getElementById('deals').addEventListener('change', (e) => {
      this.#dealsOnly = e.target.checked;
      this.#renderTable();
    });
  }

  #showStatus(msg) {
    const body = this.shadowRoot.getElementById('body');
    if (body) body.innerHTML = `<div class="status">${this.#esc(msg)}</div>`;
  }

  #esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  #fmtPrice(v) {
    return typeof v === 'number' ? `$${v.toFixed(2)}` : '—';
  }

  #render() {
    const feed = this.#feed;
    const gen = this.shadowRoot.getElementById('generated');
    if (feed.generated) {
      const d = new Date(feed.generated);
      gen.textContent = `Prices checked ${Number.isNaN(d.getTime()) ? feed.generated : d.toLocaleString()}.`;
    } else {
      gen.textContent = '';
    }
    // Retailer chips.
    const chips = this.shadowRoot.getElementById('retailers');
    chips.innerHTML = '';
    const retailers = [...new Set((feed.items || []).map((it) => it.retailer).filter(Boolean))].sort();
    const mk = (value, label) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = label;
      b.setAttribute('aria-pressed', String(this.#retailer === value));
      b.addEventListener('click', () => {
        this.#retailer = value;
        chips.querySelectorAll('.chip').forEach((c) =>
          c.setAttribute('aria-pressed', String(c === b)));
        this.#renderTable();
      });
      chips.appendChild(b);
    };
    mk('all', 'All retailers');
    retailers.forEach((r) => mk(r, r));
    this.#renderTable();
  }

  #renderTable() {
    const feed = this.#feed;
    const body = this.shadowRoot.getElementById('body');
    const items = this.#visibleItems();
    const specCols = Array.isArray(feed.spec_columns) ? feed.spec_columns : [];

    this.shadowRoot.getElementById('count').textContent =
      `${items.length} of ${(feed.items || []).length} items`;

    if (!items.length) {
      body.innerHTML = '<div class="status">No items match the current filters.</div>';
      return;
    }

    const arrow = (key) =>
      this.#sortKey === key ? (this.#sortDir === 1 ? ' ▲' : ' ▼') : '';
    const th = (key, label) =>
      `<th class="sortable" data-key="${key}" role="columnheader" tabindex="0">${this.#esc(label)}${arrow(key)}</th>`;

    let html = '<table><thead><tr>';
    html += th('name', 'Item');
    html += th('retailer', 'Retailer');
    html += th('price', 'Price');
    html += th('change', 'vs baseline');
    html += th('stock', 'Stock');
    for (const c of specCols) html += th('spec:' + c.key, c.label);
    html += '</tr></thead><tbody>';

    for (const it of items) {
      const changeCls = typeof it.change === 'number'
        ? (it.change < 0 ? 'change-neg' : it.change > 0 ? 'change-pos' : 'change-flat')
        : 'change-flat';
      const changeTxt = typeof it.change === 'number'
        ? `${it.change < 0 ? '−' : it.change > 0 ? '+' : ''}$${Math.abs(it.change).toFixed(2)}`
        : '—';
      const stockCls = it.in_stock === true ? 'stock-in'
        : it.in_stock === false ? 'stock-out' : 'stock-unknown';
      const stockTxt = it.in_stock === true ? 'In stock'
        : it.in_stock === false ? 'Out of stock' : 'Unknown';
      const badges = (it.badges || []).map((b) => `<span class="badge">${this.#esc(b)}</span>`).join('');
      const img = it.image
        ? `<img loading="lazy" src="${this.#esc(it.image)}" alt="">`
        : '';
      html += '<tr>';
      html += `<td><div class="item-cell">${img}<div><a href="${this.#esc(it.url)}" target="_blank" rel="noopener">${this.#esc(it.name)}</a><div>${badges}</div></div></div></td>`;
      html += `<td>${this.#esc(it.retailer || '—')}</td>`;
      html += `<td class="price">${this.#fmtPrice(it.price)}${it.was != null && it.was !== it.price ? `<span class="was">${this.#fmtPrice(it.was)}</span>` : ''}</td>`;
      html += `<td class="${changeCls}">${changeTxt}</td>`;
      html += `<td class="${stockCls}">${stockTxt}</td>`;
      const specs = it.specs || {};
      for (const c of specCols) {
        html += `<td>${this.#esc(specs[c.key] ?? '—')}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    body.innerHTML = html;

    body.querySelectorAll('th.sortable').forEach((el) => {
      const go = () => {
        const key = el.getAttribute('data-key');
        if (this.#sortKey === key) {
          this.#sortDir *= -1;
        } else {
          this.#sortKey = key;
          this.#sortDir = key === 'change' || key === 'price' ? 1 : 1;
        }
        this.#renderTable();
      };
      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });
  }
}

customElements.define('deal-watch-table', DealWatchTable);
