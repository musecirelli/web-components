/**
 * <spending-dashboard> — root shell for the spending dashboard.
 *
 * Data in (first wins):
 *   1. the `data` property (array of transaction objects),
 *   2. window.__SPENDING_DATA__ (used by the single-file local build),
 *   3. the `src` attribute (URL of a transactions.json feed).
 * User-uploaded CSVs (via <spend-csv-import>) merge in and persist to
 * localStorage, so new statements survive reloads.
 *
 * Owns the filter state and fan-out:
 *   emits    spend:data { all, transactions, stats, filter }
 *   consumes spend:filter / spend:drill (partial filter patches)
 *            spend:imported { added }
 *
 * Transaction shape:
 *   { id, date: "YYYY-MM-DD", merchant, merchant_raw, amount,
 *     debit, credit, category, subcategory, status, member, sources }
 * `amount` is money-out positive; refunds/credits are negative.
 */
import { WebComponent } from '../../shared/component-base.js';
import { monthLabel, monthRange, shiftMonth, fmtUSD } from './spend-utils.js';
import './spend-filter-bar.js';
import './spend-overview.js';
import './spend-timeline.js';
import './spend-category-chart.js';
import './spend-merchant-list.js';
import './spend-sankey.js';
import './spend-transaction-table.js';
import './spend-insights.js';
import './spend-budget-tracker.js';
import './spend-csv-import.js';

const IMPORTS_KEY = 'spend:imports:v1';

function loadStored() {
  try { return JSON.parse(localStorage.getItem(IMPORTS_KEY) || '[]'); }
  catch { return []; }
}
function saveStored(txns) {
  try { localStorage.setItem(IMPORTS_KEY, JSON.stringify(txns)); } catch { /* ignore */ }
}

export class SpendingDashboard extends WebComponent {
  #all = [];
  #filter = { from: null, to: null, q: '', category: '', includeTransfers: false };
  #ready = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  set data(txns) {
    if (Array.isArray(txns)) {
      this.#all = this.#merge(txns, loadStored());
      this.#seedFilter();
      this.#publish();
    }
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          --spend-bg: #f8fafc;
          --spend-card: #ffffff;
          --spend-border: #e5e7eb;
          --spend-muted: #6b7280;
          --spend-accent: #4e79a7;
          background: var(--spend-bg);
          color: #111827;
          font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
          padding: 20px;
          border-radius: 16px;
        }
        .wrap { max-width: 1120px; margin: 0 auto; display: grid; gap: 14px; }
        header h1 { margin: 0 0 4px; font-size: 22px; }
        header p { margin: 0; font-size: 13px; color: var(--spend-muted); }
        .grid2 { display: grid; grid-template-columns: 1.35fr 1fr; gap: 14px; }
        @media (max-width: 860px) { .grid2 { grid-template-columns: 1fr; } }
        footer { font-size: 12px; color: var(--spend-muted); text-align: center; padding: 8px; }
      </style>
      <div class="wrap">
        <header>
          <h1>Spending dashboard</h1>
          <p class="subtitle"></p>
        </header>
        <spend-filter-bar></spend-filter-bar>
        <spend-overview></spend-overview>
        <spend-timeline></spend-timeline>
        <div class="grid2">
          <spend-category-chart></spend-category-chart>
          <spend-merchant-list></spend-merchant-list>
        </div>
        <spend-sankey></spend-sankey>
        <div class="grid2">
          <spend-insights></spend-insights>
          <spend-budget-tracker></spend-budget-tracker>
        </div>
        <spend-transaction-table></spend-transaction-table>
        <spend-csv-import></spend-csv-import>
        <footer>All data stays in this browser. Uploaded statements are stored locally only.</footer>
      </div>`;

    // children bubble these up to us
    this.addEventListener('spend:filter', (e) => {
      this.#filter = { ...this.#filter, ...e.detail };
      this.#publish();
    });
    this.addEventListener('spend:drill', (e) => {
      this.#filter = { ...this.#filter, ...e.detail };
      this.#publish();
    });
    this.addEventListener('spend:imported', (e) => {
      const { added } = e.detail;
      const have = new Set(this.#all.map((t) => t.id));
      const fresh = added.filter((t) => !have.has(t.id));
      if (fresh.length) {
        this.#all = this.#merge(this.#all, fresh);
        saveStored([...loadStored(), ...fresh]);
        this.#seedFilter(true);
        this.#publish();
      }
    });

    this.#boot();
  }

  async #boot() {
    let base = [];
    if (Array.isArray(window.__SPENDING_DATA__)) {
      base = window.__SPENDING_DATA__;
    } else if (this.hasAttribute('src')) {
      try {
        const res = await fetch(this.getAttribute('src'));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        base = await res.json();
      } catch (err) {
        console.error('[spending-dashboard] failed to load src:', err);
        this.shadowRoot.querySelector('.subtitle').textContent =
          'Could not load transaction data. Upload a statement CSV below to get started.';
      }
    }
    this.#all = this.#merge(base, loadStored());
    this.#seedFilter();
    this.#ready = true;
    this.#publish();
  }

  #merge(a, b) {
    const seen = new Set(a.map((t) => t.id));
    const out = [...a];
    for (const t of b) if (!seen.has(t.id)) { seen.add(t.id); out.push(t); }
    return out.sort((x, y) => (x.date < y.date ? -1 : 1));
  }

  #seedFilter(keep = false) {
    const months = [...new Set(this.#all.map((t) => t.date.slice(0, 7)))].sort();
    if (!months.length) return;
    if (!keep || !this.#filter.from) this.#filter.from = months[0];
    if (!keep || !this.#filter.to) this.#filter.to = months[months.length - 1];
  }

  #matches(t, f) {
    const ym = t.date.slice(0, 7);
    if (f.from && ym < f.from) return false;
    if (f.to && ym > f.to) return false;
    if (f.category && t.category !== f.category) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      const hay = `${t.merchant} ${t.merchant_raw} ${t.category} ${t.subcategory}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  #publish() {
    if (!this.#ready && !this.#all.length) return;
    const f = this.#filter;
    const inScope = this.#all.filter((t) => this.#matches(t, f));
    const spend = f.includeTransfers ? inScope : inScope.filter((t) => t.category !== 'Transfers');
    const stats = this.#computeStats(spend, inScope, f);
    const sub = this.shadowRoot.querySelector('.subtitle');
    if (sub && this.#all.length) {
      const days = [...new Set(this.#all.map((t) => t.date))].sort();
      sub.textContent =
        `${this.#all.length.toLocaleString()} transactions · ` +
        `${monthLabel(days[0].slice(0, 7))} – ${monthLabel(days[days.length - 1].slice(0, 7))}`;
    }
    this.emit('spend:data', { all: this.#all, transactions: spend, stats, filter: { ...f } });
  }

  #computeStats(spend, inScope, f) {
    const total = spend.reduce((a, t) => a + t.amount, 0);
    const count = spend.length;
    const from = f.from || (spend.length ? spend[0].date.slice(0, 7) : null);
    const to = f.to || (spend.length ? spend[spend.length - 1].date.slice(0, 7) : null);
    const months = from && to ? monthRange(from, to) : [];
    const byMonth = Object.fromEntries(months.map((m) => [m, 0]));
    const byCategoryMonth = {};
    const catTotals = new Map();
    const merchTotals = new Map();
    let biggest = null;
    for (const t of spend) {
      const m = t.date.slice(0, 7);
      if (m in byMonth) byMonth[m] += t.amount;
      (byCategoryMonth[m] ||= {})[t.category] =
        ((byCategoryMonth[m] || {})[t.category] || 0) + t.amount;
      catTotals.set(t.category, (catTotals.get(t.category) || 0) + t.amount);
      merchTotals.set(t.merchant, (merchTotals.get(t.merchant) || 0) + t.amount);
      if (!biggest || t.amount > biggest.amount) biggest = t;
    }
    const categories = [...catTotals.entries()]
      .map(([category, cTotal]) => ({ category, total: cTotal, share: total ? (cTotal / total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);
    const merchants = [...merchTotals.entries()]
      .map(([merchant, mTotal]) => ({ merchant, total: mTotal }))
      .sort((a, b) => b.total - a.total);
    const days = [...new Set(spend.map((t) => t.date))].length || 1;
    const spanDays = spend.length
      ? Math.max(1, Math.round((new Date(spend[spend.length - 1].date) - new Date(spend[0].date)) / 864e5) + 1)
      : 1;

    // previous equal-length period, same category/search scope
    let prevTotal = null, deltaPct = null;
    if (months.length) {
      const n = months.length;
      const pFrom = shiftMonth(months[0], -n), pTo = shiftMonth(months[0], -1);
      const prevTxns = this.#all.filter((t) => {
        const ym = t.date.slice(0, 7);
        return ym >= pFrom && ym <= pTo && this.#matches(t, { ...f, from: pFrom, to: pTo });
      }).filter((t) => f.includeTransfers || t.category !== 'Transfers');
      if (prevTxns.length) {
        const prev = prevTxns.reduce((a, t) => a + t.amount, 0);
        prevTotal = prev;
        deltaPct = prev !== 0 ? ((total - prev) / Math.abs(prev)) * 100 : null;
      }
    }

    const transfersTotal = inScope
      .filter((t) => t.category === 'Transfers')
      .reduce((a, t) => a + t.amount, 0);

    return {
      total, count, months, byMonth, byCategoryMonth,
      categories, merchants,
      topCategory: categories[0] || null,
      biggest,
      avgPerDay: total / spanDays,
      periodMonths: months.length,
      prevTotal, deltaPct,
      transfersTotal,
      activeDays: days,
    };
  }
}

customElements.define('spending-dashboard', SpendingDashboard);
