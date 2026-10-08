/**
 * <spend-filter-bar> — month range, text search, category picker, transfers toggle.
 * Emits: spend:filter { from, to, q, category, includeTransfers }
 * Listens: spend:data (to populate month options / category list)
 */
import { WebComponent } from '../../shared/component-base.js';
import { monthLabel, monthRange, debounce } from './spend-utils.js';

export class SpendFilterBar extends WebComponent {
  static get observedAttributes() { return []; }

  #filter = { from: null, to: null, q: '', category: '', includeTransfers: false };
  #months = [];
  #categories = [];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.#render();
    this.on('spend:data', (e) => this.#onData(e.detail));
  }

  #onData(detail) {
    const { stats, filter } = detail;
    const months = stats?.months || [];
    const cats = (stats?.categories || []).map((c) => c.category);
    const structChanged =
      JSON.stringify(months) !== JSON.stringify(this.#months) ||
      JSON.stringify(cats) !== JSON.stringify(this.#categories);
    this.#months = months;
    this.#categories = cats;
    // adopt the dashboard's canonical filter (drill-downs from charts land here)
    if (filter) this.#filter = { ...filter };
    if (structChanged || !this.shadowRoot.querySelector('.bar')) this.#render();
    else this.#syncControls();
  }

  /** Push adopted filter values into the existing controls (keeps focus). */
  #syncControls() {
    const root = this.shadowRoot;
    const f = this.#filter;
    for (const k of ['from', 'to', 'category']) {
      const el = root.querySelector(`select[data-k="${k}"]`);
      if (el && el.value !== (f[k] || '')) el.value = f[k] || '';
    }
    const q = root.querySelector('input[data-k="q"]');
    if (q && document.activeElement !== q && q.value !== (f.q || '')) q.value = f.q || '';
    const t = root.querySelector('input[data-k="includeTransfers"]');
    if (t) t.checked = !!f.includeTransfers;
  }

  #emit() {
    this.emit('spend:filter', { ...this.#filter });
  }

  #render() {
    const f = this.#filter;
    const monthOpts = (sel) => this.#months
      .map((m) => `<option value="${m}" ${m === sel ? 'selected' : ''}>${monthLabel(m)}</option>`)
      .join('');
    const catOpts = [`<option value="">All categories</option>`]
      .concat(this.#categories.map((c) => `<option value="${c}" ${c === f.category ? 'selected' : ''}>${c}</option>`))
      .join('');

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .bar {
          display: flex; flex-wrap: wrap; gap: 10px; align-items: end;
          background: var(--spend-card, #fff);
          border: 1px solid var(--spend-border, #e5e7eb);
          border-radius: 12px; padding: 12px 16px;
        }
        label { display: flex; flex-direction: column; gap: 4px; font-size: 11px;
          color: var(--spend-muted, #6b7280); text-transform: uppercase; letter-spacing: .04em; }
        select, input[type="search"] {
          font: inherit; font-size: 14px; padding: 7px 10px;
          border: 1px solid var(--spend-border, #e5e7eb); border-radius: 8px;
          background: var(--spend-bg, #fff); color: inherit; min-width: 0;
        }
        input[type="search"] { width: 190px; }
        .check { flex-direction: row; align-items: center; gap: 6px; text-transform: none;
          letter-spacing: 0; font-size: 14px; color: inherit; padding-bottom: 8px; }
        button {
          font: inherit; font-size: 14px; padding: 7px 14px; border-radius: 8px;
          border: 1px solid var(--spend-border, #e5e7eb); background: var(--spend-bg, #f9fafb);
          cursor: pointer; color: inherit;
        }
        button:hover { background: var(--spend-border, #e5e7eb); }
      </style>
      <div class="bar" role="search">
        <label>From
          <select data-k="from">${monthOpts(f.from)}</select>
        </label>
        <label>To
          <select data-k="to">${monthOpts(f.to)}</select>
        </label>
        <label>Category
          <select data-k="category">${catOpts}</select>
        </label>
        <label>Search
          <input type="search" data-k="q" placeholder="merchant, category…" value="${(f.q || '').replace(/"/g, '&quot;')}">
        </label>
        <label class="check"><input type="checkbox" data-k="includeTransfers" ${f.includeTransfers ? 'checked' : ''}> card payments</label>
        <button data-k="reset" type="button">Reset</button>
      </div>`;

    const root = this.shadowRoot;
    root.querySelectorAll('select[data-k]').forEach((el) => {
      el.addEventListener('change', () => {
        this.#filter[el.dataset.k] = el.value || null;
        if (el.dataset.k === 'category' && !el.value) this.#filter.category = '';
        this.#emit();
      });
    });
    const q = root.querySelector('input[data-k="q"]');
    q.addEventListener('input', debounce(() => {
      this.#filter.q = q.value.trim();
      this.#emit();
    }, 250));
    root.querySelector('input[data-k="includeTransfers"]').addEventListener('change', (e) => {
      this.#filter.includeTransfers = e.target.checked;
      this.#emit();
    });
    root.querySelector('button[data-k="reset"]').addEventListener('click', () => {
      this.#filter = {
        from: this.#months[0] || null,
        to: this.#months[this.#months.length - 1] || null,
        q: '', category: '', includeTransfers: false,
      };
      this.#render();
      this.#emit();
    });
  }
}

customElements.define('spend-filter-bar', SpendFilterBar);
