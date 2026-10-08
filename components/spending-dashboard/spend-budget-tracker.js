/**
 * <spend-budget-tracker> — per-category monthly budget targets with
 * actual-vs-target progress bars. Targets persist in localStorage and are
 * edited inline. Shows the latest month in the current filter.
 * Listens: spend:data
 */
import { WebComponent } from '../../shared/component-base.js';
import { fmtUSD, monthLabel, CARD_CSS, PALETTE } from './spend-utils.js';

const STORE_KEY = 'spend:budgets:v1';

export class SpendBudgetTracker extends WebComponent {
  #stats = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        ${CARD_CSS}
        .sub { font-size: 12px; color: var(--spend-muted, #6b7280); margin: -8px 0 12px; }
        ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
        li { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: center; }
        .name { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .vals { font-size: 13px; font-variant-numeric: tabular-nums; color: var(--spend-muted, #6b7280); }
        .vals b { color: inherit; }
        .bar { grid-column: 1 / -1; height: 8px; border-radius: 4px; background: var(--spend-bg, #f3f4f6); overflow: hidden; }
        .bar i { display: block; height: 100%; border-radius: 4px; transition: width .3s; }
        .edit { grid-column: 1 / -1; display: flex; gap: 6px; align-items: center; font-size: 12px;
          color: var(--spend-muted, #6b7280); }
        .edit input { width: 90px; font: inherit; font-size: 13px; padding: 3px 8px;
          border: 1px solid var(--spend-border, #e5e7eb); border-radius: 6px; }
        .over { color: #b91c1c; font-weight: 600; }
        .suggested {
          font-size: 11px; font-style: italic; padding: 1px 8px; border-radius: 999px;
          background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;
        }
      </style>
      <div class="card">
        <h3>Monthly budgets</h3>
        <div class="sub"></div>
        <ul></ul>
      </div>`;
    this.on('spend:data', (e) => { this.#stats = e.detail.stats; this.#render(); });
    this.shadowRoot.querySelector('ul').addEventListener('change', (e) => {
      const input = e.target.closest('input[data-cat]');
      if (!input) return;
      const budgets = this.#stored();
      const v = parseFloat(input.value);
      // 0 (not delete) so a cleared input keeps overriding a seeded default
      budgets[input.dataset.cat] = Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
      this.#save(budgets);
      this.#render();
    });
  }

  /** Seeded defaults, e.g. window.__SPENDING_BUDGETS__ in the single-file build. */
  #defaults() {
    try { return (typeof window !== 'undefined' && window.__SPENDING_BUDGETS__) || {}; }
    catch { return {}; }
  }
  #stored() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); }
    catch { return {}; }
  }
  /** Merged view: user-saved values win over seeded defaults. */
  #load() {
    const merged = { ...this.#defaults() };
    for (const [k, v] of Object.entries(this.#stored())) merged[k] = v;
    return merged;
  }
  /** True when the effective target came from seeds, not from the user. */
  #isSuggested(cat) {
    const s = this.#stored();
    return !(cat in s && s[cat] > 0) && (this.#defaults()[cat] || 0) > 0;
  }
  #save(b) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(b)); } catch { /* private mode */ }
  }

  #render() {
    const sub = this.shadowRoot.querySelector('.sub');
    const ul = this.shadowRoot.querySelector('ul');
    if (!this.#stats || !this.#stats.months.length) {
      sub.textContent = '';
      ul.innerHTML = '<li>No data in this range.</li>';
      return;
    }
    // budget view = the latest month in the filter (per-month targets)
    const month = this.#stats.months[this.#stats.months.length - 1];
    const inMonth = this.#stats.byCategoryMonth?.[month] || {};
    const budgets = this.#load();
    const cats = Object.keys(inMonth).sort((a, b) => inMonth[b] - inMonth[a]).slice(0, 12);
    // also include categories that have a budget but no spend this month
    for (const c of Object.keys(budgets)) if (!cats.includes(c) && this.#stats.categories.some((x) => x.category === c)) cats.push(c);

    sub.textContent = `Targets vs actuals for ${monthLabel(month)}. Edit a target to save it.`;
    ul.innerHTML = cats.map((c, i) => {
      const actual = inMonth[c] || 0;
      const target = budgets[c];
      const pct = target ? Math.min(100, (actual / target) * 100) : 0;
      const over = target && actual > target;
      const color = over ? '#e15759' : PALETTE[i % PALETTE.length];
      return `<li>
        <span class="name">${c}</span>
        <span class="vals"><b>${fmtUSD(actual)}</b>${target ? ` of ${fmtUSD(target)}${over ? ' <span class="over">over</span>' : ''}` : ' · no target'}</span>
        <div class="bar"><i style="width:${pct.toFixed(1)}%;background:${color}"></i></div>
        <div class="edit">Monthly target $
          <input data-cat="${c.replace(/"/g, '&quot;')}" type="number" min="0" step="10"
                 placeholder="e.g. 400" value="${target || ''}" aria-label="Monthly budget for ${c.replace(/"/g, '&quot;')}">
          ${this.#isSuggested(c) ? '<span class="suggested" title="Seeded from your historical monthly average — edit freely">suggested</span>' : ''}
        </div>
      </li>`;
    }).join('') || '<li>No spending this month.</li>';
  }
}

customElements.define('spend-budget-tracker', SpendBudgetTracker);
