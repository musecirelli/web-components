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
 * Toolbar: text filter, retailer chips, deals-only checkbox, a "show ruled-out"
 * checkbox (only when the feed flags ruled-out items), and a Columns
 * menu to show/hide individual columns (choice persists in localStorage).
 *
 * Rating: when feed items carry a numeric `rating` (automatic quality/spec
 * fit score, price excluded), a Rating column renders with a red→green
 * gradient and the table sorts by rating descending by default. Items with
 * `ruled_out: true` render dimmed at the bottom; the toolbar toggle hides
 * them entirely.
 *
 * Brand links: an item's `brand_url` turns the Brand column into a link to
 * the brand/model information or sales page.
 *
 * Cert links: `feed.cert_links` maps certification values (e.g. "UL 2272")
 * to documentation URLs; matching spec cells render as links.
 *
 * Images: items without an image get a blank placeholder square so rows
 * stay aligned with items that have thumbnails.
 *
 * Sorting: click a header to sort by that column (click again to reverse).
 * Ctrl/Cmd+click adds columns to a multi-column sort; the header arrows show
 * each column's priority (▲1, ▼2, …).
 *
 * Spec verification: a feed item may carry `spec_verification: { <key>:
 * { status: 'verified'|'unverified'|'conflict', note } }`. Unverified or
 * conflicting spec cells render in red with a ⓘ hover icon explaining why.
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
  #sortKeys = [{ key: 'change', dir: 1 }]; // [{key, dir}] — multi-column sort
  #query = '';
  #retailer = 'all';
  #dealsOnly = false;
  #showRuledOut = true;
  #hiddenCols = new Set(); // column keys hidden via the Columns menu

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
      const hasRating = (this.#feed.items || [])
        .some((it) => typeof it.rating === 'number');
      this.#sortKeys = hasRating ? [{ key: 'rating', dir: -1 }] : [{ key: 'change', dir: 1 }];
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
      const hasRating = (feed.items || []).some((it) => typeof it.rating === 'number');
      this.#sortKeys = hasRating ? [{ key: 'rating', dir: -1 }] : [{ key: 'change', dir: 1 }];
      this.#query = '';
      this.#retailer = 'all';
      this.#dealsOnly = false;
      this.#showRuledOut = true;
      this.#loadHiddenCols();
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

  // -- columns ------------------------------------------------------------

  /** All renderable columns for the current feed, in display order. */
  #allColumns() {
    const items = this.#feed.items || [];
    const cols = [
      { key: 'name', label: 'Item' },
    ];
    if (items.some((it) => it.brand)) {
      cols.push({ key: 'brand', label: 'Brand' });
    }
    if (items.some((it) => typeof it.rating === 'number')) {
      cols.push({ key: 'rating', label: 'Rating' });
    }
    cols.push(
      { key: 'retailer', label: 'Retailer' },
      { key: 'price', label: 'Price' },
      { key: 'change', label: 'vs baseline' },
      { key: 'stock', label: 'Stock' },
    );
    if (items.some((it) => it.category)) {
      cols.push({ key: 'category', label: 'Category' });
    }
    for (const c of (this.#feed.spec_columns || [])) {
      cols.push({ key: 'spec:' + c.key, label: c.label });
    }
    return cols;
  }

  #visibleColumns() {
    return this.#allColumns().filter((c) => !this.#hiddenCols.has(c.key));
  }

  #colsStorageKey() {
    const hunt = (this.#feed && this.#feed.hunt) || this.getAttribute('src') || 'default';
    return `dealwatch-cols:${hunt}`;
  }

  #loadHiddenCols() {
    try {
      const raw = localStorage.getItem(this.#colsStorageKey());
      this.#hiddenCols = new Set(raw ? JSON.parse(raw) : []);
    } catch {
      this.#hiddenCols = new Set();
    }
  }

  #saveHiddenCols() {
    try {
      localStorage.setItem(this.#colsStorageKey(), JSON.stringify([...this.#hiddenCols]));
    } catch { /* private mode etc. — menu still works for the session */ }
  }

  // -- filtering / sorting -------------------------------------------------

  #visibleItems() {
    if (!this.#feed || !Array.isArray(this.#feed.items)) return [];
    const q = this.#query.trim().toLowerCase();
    return this.#feed.items.filter((it) => {
      if (this.#retailer !== 'all' && (it.retailer || '') !== this.#retailer) return false;
      if (this.#dealsOnly && !(typeof it.change === 'number' && it.change < 0)) return false;
      if (!this.#showRuledOut && it.ruled_out) return false;
      if (q) {
        const hay = [it.name, it.brand, it.retailer, it.id, it.category,
          ...Object.values(it.specs || {})].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => this.#compare(a, b));
  }

  #cellValue(item, key) {
    if (key === 'name') return (item.name || '').toLowerCase();
    if (key === 'brand') return (item.brand || '').toLowerCase();
    if (key === 'rating') return typeof item.rating === 'number' ? item.rating : -1;
    if (key === 'retailer') return (item.retailer || '').toLowerCase();
    if (key === 'category') return (item.category || '').toLowerCase();
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
    for (const { key, dir } of this.#sortKeys) {
      const va = this.#cellValue(a, key);
      const vb = this.#cellValue(b, key);
      let cmp;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb));
      }
      if (cmp !== 0) return cmp * dir;
    }
    return 0;
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
      .colmenu-wrap { position: relative; }
      .colmenu { position: absolute; top: calc(100% + 4px); right: 0; z-index: 100;
        background: #fff; border: 1px solid var(--dealwatch-border, #ccc);
        border-radius: 8px; padding: 8px 12px; min-width: 170px;
        box-shadow: 0 4px 12px rgba(0,0,0,.15); }
      .colmenu label { display: block; font-size: 13px; padding: 3px 0;
        cursor: pointer; white-space: nowrap; }
      .colmenu .colmenu-title { font-size: 12px; font-weight: 600;
        color: var(--dealwatch-muted, #666); margin-bottom: 4px; }
      .table-wrap { overflow-x: auto; }
      table { border-collapse: collapse; width: 100%; font-size: 14px; }
      th, td { padding: 8px 10px; border-bottom: 1px solid var(--dealwatch-border, #e0e0e0);
        text-align: left; vertical-align: middle; }
      th { white-space: nowrap; user-select: none; }
      th.sortable { cursor: pointer; }
      th.sortable:hover { text-decoration: underline; }
      .sort-prio { font-size: 11px; color: var(--dealwatch-muted, #666); }
      .item-cell { display: flex; gap: 10px; align-items: center; min-width: 220px; }
      .item-cell img { width: 56px; height: 56px; object-fit: contain;
        border: 1px solid var(--dealwatch-border, #e0e0e0); border-radius: 6px;
        background: #fff; flex: none; cursor: zoom-in; }
      .item-cell .thumb { position: relative; flex: none; line-height: 0; }
      .item-cell .thumb::after { content: "🔍"; position: absolute; right: 2px; bottom: 2px;
        font-size: 12px; line-height: 1; opacity: 0; transition: opacity .15s;
        background: rgba(255,255,255,.85); border-radius: 4px; padding: 1px 2px; }
      .item-cell .thumb:hover::after { opacity: 1; }
      .lightbox { position: fixed; inset: 0; z-index: 9999; display: none;
        align-items: center; justify-content: center;
        background: rgba(0,0,0,.8); cursor: zoom-out; }
      .lightbox.open { display: flex; }
      .lightbox img { max-width: 92vw; max-height: 92vh; object-fit: contain;
        background: #fff; border-radius: 8px; }
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
      .spec-unverified { color: var(--dealwatch-bad, #b3261e); }
      .verify-icon { cursor: help; font-size: 12px; }
      .rating { font-weight: 700; text-align: center; white-space: nowrap;
        border-radius: 4px; }
      tr.ruled-out { opacity: 0.55; }
      .brand-link { color: var(--dealwatch-accent, #1a73e8); }
      .item-cell .thumb.placeholder { display: block; width: 56px; height: 56px;
        border: 1px solid var(--dealwatch-border, #e0e0e0); border-radius: 6px;
        background: var(--dealwatch-placeholder-bg, #f1f3f4); }
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
        <label class="meta" id="ruledout-wrap" hidden><input type="checkbox" id="ruledout" checked> show ruled-out</label>
        <div class="colmenu-wrap">
          <button type="button" class="chip" id="colmenu-btn"
            aria-haspopup="true" aria-expanded="false">Columns ▾</button>
          <div class="colmenu" id="colmenu" hidden>
            <div class="colmenu-title">Show columns</div>
            <div id="colmenu-items"></div>
          </div>
        </div>
        <span class="meta" id="count"></span>
      </div>
      <div class="meta" id="generated"></div>
      <div class="table-wrap"><div id="body"></div></div>
      <div class="lightbox" id="lightbox" role="dialog" aria-label="Product image">
        <img id="lightbox-img" alt="">
      </div>
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
    this.shadowRoot.getElementById('ruledout').addEventListener('change', (e) => {
      this.#showRuledOut = e.target.checked;
      this.#renderTable();
    });

    // Columns menu: toggle panel, close on outside click / Escape.
    const colBtn = this.shadowRoot.getElementById('colmenu-btn');
    const colMenu = this.shadowRoot.getElementById('colmenu');
    colBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = colMenu.hasAttribute('hidden');
      if (open) colMenu.removeAttribute('hidden');
      else colMenu.setAttribute('hidden', '');
      colBtn.setAttribute('aria-expanded', String(open));
    });
    this.shadowRoot.addEventListener('click', (e) => {
      if (!e.composedPath().includes(colMenu) && !colMenu.hasAttribute('hidden')) {
        colMenu.setAttribute('hidden', '');
        colBtn.setAttribute('aria-expanded', 'false');
      }
    });

    // Lightbox: click a thumbnail to zoom, click/Esc to close.
    const lightbox = this.shadowRoot.getElementById('lightbox');
    lightbox.addEventListener('click', () => lightbox.classList.remove('open'));
    this.shadowRoot.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        lightbox.classList.remove('open');
        colMenu.setAttribute('hidden', '');
        colBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  #zoom(src) {
    const lightbox = this.shadowRoot.getElementById('lightbox');
    this.shadowRoot.getElementById('lightbox-img').src = src;
    lightbox.classList.add('open');
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
    // Ruled-out toggle: only relevant when the feed flags ruled-out items.
    const roWrap = this.shadowRoot.getElementById('ruledout-wrap');
    const roBox = this.shadowRoot.getElementById('ruledout');
    if ((feed.items || []).some((it) => it.ruled_out)) {
      roWrap.removeAttribute('hidden');
    } else {
      roWrap.setAttribute('hidden', '');
    }
    roBox.checked = true;
    this.#showRuledOut = true;
    this.#renderColumnMenu();
    this.#renderTable();
  }

  #renderColumnMenu() {
    const box = this.shadowRoot.getElementById('colmenu-items');
    box.innerHTML = '';
    for (const col of this.#allColumns()) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !this.#hiddenCols.has(col.key);
      input.addEventListener('change', () => {
        if (input.checked) this.#hiddenCols.delete(col.key);
        else this.#hiddenCols.add(col.key);
        this.#saveHiddenCols();
        this.#renderTable();
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + col.label));
      box.appendChild(label);
    }
  }

  #sortIndicator(key) {
    const i = this.#sortKeys.findIndex((s) => s.key === key);
    if (i < 0) return '';
    const arrow = this.#sortKeys[i].dir === 1 ? '▲' : '▼';
    const prio = this.#sortKeys.length > 1 ? `<span class="sort-prio">${i + 1}</span>` : '';
    return ` ${arrow}${prio}`;
  }

  #onHeaderSort(key, evt) {
    const multi = !!(evt.ctrlKey || evt.metaKey);
    const existing = this.#sortKeys.findIndex((s) => s.key === key);
    if (!multi) {
      if (existing === 0 && this.#sortKeys.length === 1) {
        this.#sortKeys[0].dir *= -1; // toggle direction
      } else {
        this.#sortKeys = [{ key, dir: 1 }];
      }
    } else if (existing >= 0) {
      this.#sortKeys[existing].dir *= -1; // toggle this key's direction
    } else {
      this.#sortKeys.push({ key, dir: 1 });
    }
    this.#renderTable();
  }

  /** Render one spec cell, with verification affordance when the feed flags it. */
  #specCell(it, specKey) {
    const specs = it.specs || {};
    const ver = (it.spec_verification || {})[specKey];
    let cls = '';
    let icon = '';
    if (ver && (ver.status === 'unverified' || ver.status === 'conflict')) {
      cls = ' class="spec-unverified"';
      const note = ver.note || (ver.status === 'unverified'
        ? 'Could not be verified against the brand\u2019s website'
        : 'Conflicts with the brand\u2019s website');
      icon = ` <span class="verify-icon" title="${this.#esc(note)}">ⓘ</span>`;
    }
    const raw = specs[specKey] ?? '—';
    const certLinks = this.#feed.cert_links || {};
    const val = (specKey === 'cert' && raw !== '—' && certLinks[raw])
      ? `<a href="${this.#esc(certLinks[raw])}" target="_blank" rel="noopener">${this.#esc(raw)}</a>`
      : this.#esc(raw);
    return `<td${cls}>${val}${icon}</td>`;
  }

  #renderTable() {
    const feed = this.#feed;
    const body = this.shadowRoot.getElementById('body');
    const items = this.#visibleItems();
    const cols = this.#visibleColumns();
    const specCols = Array.isArray(feed.spec_columns) ? feed.spec_columns : [];

    this.shadowRoot.getElementById('count').textContent =
      `${items.length} of ${(feed.items || []).length} items`;

    if (!items.length) {
      body.innerHTML = '<div class="status">No items match the current filters.</div>';
      return;
    }

    const th = (key, label) =>
      `<th class="sortable" data-key="${key}" role="columnheader" tabindex="0" ` +
      `title="Click to sort. Ctrl/Cmd+click adds to a multi-column sort.">${this.#esc(label)}${this.#sortIndicator(key)}</th>`;

    const cellFor = (it, key) => {
      if (key === 'name') {
        const badges = (it.badges || []).map((b) => `<span class="badge">${this.#esc(b)}</span>`).join('');
        const img = it.image
          ? `<span class="thumb"><img loading="lazy" src="${this.#esc(it.image)}" alt="" data-full="${this.#esc(it.image)}"></span>`
          : `<span class="thumb placeholder" aria-hidden="true"></span>`;
        return `<td><div class="item-cell">${img}<div><a href="${this.#esc(it.url)}" target="_blank" rel="noopener">${this.#esc(it.name)}</a><div>${badges}</div></div></div></td>`;
      }
      if (key === 'brand') {
        const label = this.#esc(it.brand || '—');
        return it.brand_url
          ? `<td><a class="brand-link" href="${this.#esc(it.brand_url)}" target="_blank" rel="noopener">${label}</a></td>`
          : `<td>${label}</td>`;
      }
      if (key === 'rating') {
        if (typeof it.rating !== 'number') return '<td>—</td>';
        const r = it.rating;
        const hue = Math.round(Math.max(0, Math.min(100, r)) * 1.2); // 0=red → 120=green
        const title = `Quality/spec fit score (price excluded)` +
          (it.ruled_out ? `; ruled out: max load below 220 lb rider weight` : '');
        const flag = it.ruled_out ? ' ⚠' : '';
        return `<td class="rating" style="background:hsl(${hue},75%,88%)" title="${this.#esc(title)}">${r.toFixed(0)}${flag}</td>`;
      }
      if (key === 'retailer') return `<td>${this.#esc(it.retailer || '—')}</td>`;
      if (key === 'category') return `<td>${this.#esc(it.category || '—')}</td>`;
      if (key === 'price') {
        return `<td class="price">${this.#fmtPrice(it.price)}` +
          `${it.was != null && it.was !== it.price ? `<span class="was">${this.#fmtPrice(it.was)}</span>` : ''}</td>`;
      }
      if (key === 'change') {
        const changeCls = typeof it.change === 'number'
          ? (it.change < 0 ? 'change-neg' : it.change > 0 ? 'change-pos' : 'change-flat')
          : 'change-flat';
        const changeTxt = typeof it.change === 'number'
          ? `${it.change < 0 ? '−' : it.change > 0 ? '+' : ''}$${Math.abs(it.change).toFixed(2)}`
          : '—';
        return `<td class="${changeCls}">${changeTxt}</td>`;
      }
      if (key === 'stock') {
        const stockCls = it.in_stock === true ? 'stock-in'
          : it.in_stock === false ? 'stock-out' : 'stock-unknown';
        const stockTxt = it.in_stock === true ? 'In stock'
          : it.in_stock === false ? 'Out of stock' : 'Unknown';
        return `<td class="${stockCls}">${stockTxt}</td>`;
      }
      if (key.startsWith('spec:')) return this.#specCell(it, key.slice(5));
      return '<td>—</td>';
    };

    let html = '<table><thead><tr>';
    for (const c of cols) html += th(c.key, c.label);
    html += '</tr></thead><tbody>';
    for (const it of items) {
      html += it.ruled_out ? '<tr class="ruled-out">' : '<tr>';
      for (const c of cols) html += cellFor(it, c.key);
      html += '</tr>';
    }
    html += '</tbody></table>';
    body.innerHTML = html;

    body.querySelectorAll('th.sortable').forEach((el) => {
      const go = (evt) => this.#onHeaderSort(el.getAttribute('data-key'), evt || {});
      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go({}); }
      });
    });

    body.querySelectorAll('.thumb img').forEach((img) => {
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        this.#zoom(img.getAttribute('data-full'));
      });
    });
  }
}

customElements.define('deal-watch-table', DealWatchTable);
