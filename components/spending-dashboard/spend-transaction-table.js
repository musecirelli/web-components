/**
 * <spend-transaction-table> — sortable, paginated table of the filtered
 * transactions. Refunds/credits render in green; transfers are labeled.
 * Listens: spend:data
 */
import { WebComponent } from '../../shared/component-base.js';
import { fmtUSD, dayLabel, CARD_CSS } from './spend-utils.js';

const PAGE = 50;

export class SpendTransactionTable extends WebComponent {
  #txns = [];
  #sort = { key: 'date', dir: -1 };
  #shown = PAGE;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        ${CARD_CSS}
        .scroll { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; font-size: 14px; }
        th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--spend-border, #e5e7eb); }
        th { font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
          color: var(--spend-muted, #6b7280); white-space: nowrap; }
        th button { all: unset; cursor: pointer; }
        th button:hover { color: inherit; }
        td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        td.date { white-space: nowrap; color: var(--spend-muted, #6b7280); }
        .refund { color: #15803d; }
        .cat { font-size: 12px; color: var(--spend-muted, #6b7280); }
        .tag {
          font-size: 11px; padding: 1px 7px; border-radius: 999px;
          background: var(--spend-bg, #f3f4f6); color: var(--spend-muted, #6b7280);
        }
        .foot { display: flex; justify-content: space-between; align-items: center;
          padding-top: 10px; font-size: 13px; color: var(--spend-muted, #6b7280); }
        .foot button {
          font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 8px;
          border: 1px solid var(--spend-border, #e5e7eb); background: transparent; cursor: pointer; color: inherit;
        }
      </style>
      <div class="card">
        <h3>Transactions</h3>
        <div class="scroll">
          <table>
            <thead><tr>
              <th><button data-sort="date">Date ⇅</button></th>
              <th><button data-sort="merchant">Merchant ⇅</button></th>
              <th><button data-sort="category">Category ⇅</button></th>
              <th style="text-align:right"><button data-sort="amount">Amount ⇅</button></th>
            </tr></thead>
            <tbody></tbody>
          </table>
        </div>
        <div class="foot"><span class="count"></span><button type="button" class="more">Show more</button></div>
      </div>`;

    this.on('spend:data', (e) => {
      this.#txns = [...(e.detail.transactions || [])];
      this.#shown = PAGE;
      this.#render();
    });
    this.shadowRoot.querySelectorAll('th button').forEach((b) => {
      b.addEventListener('click', () => {
        const k = b.dataset.sort;
        if (this.#sort.key === k) this.#sort.dir *= -1;
        else this.#sort = { key: k, dir: 1 };
        this.#render();
      });
    });
    this.shadowRoot.querySelector('.more').addEventListener('click', () => {
      this.#shown += PAGE;
      this.#render();
    });
  }

  #render() {
    const tb = this.shadowRoot.querySelector('tbody');
    const { key, dir } = this.#sort;
    const rows = [...this.#txns].sort((a, b) => {
      const va = key === 'category' ? `${a.category} ${a.subcategory}` : a[key];
      const vb = key === 'category' ? `${b.category} ${b.subcategory}` : b[key];
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });
    const slice = rows.slice(0, this.#shown);
    tb.innerHTML = slice.map((t) => {
      const neg = t.amount < 0;
      const cat = t.subcategory ? `${t.category} · ${t.subcategory}` : t.category;
      return `<tr title="${t.merchant_raw.replace(/"/g, '&quot;')}">
        <td class="date">${dayLabel(t.date)}</td>
        <td>${t.merchant}</td>
        <td><span class="cat">${cat}</span>${t.category === 'Transfers' ? ' <span class="tag">payment</span>' : ''}</td>
        <td class="num ${neg ? 'refund' : ''}">${neg ? '−' : ''}${fmtUSD(Math.abs(t.amount))}</td>
      </tr>`;
    }).join('');
    this.shadowRoot.querySelector('.count').textContent =
      `Showing ${slice.length} of ${rows.length}`;
    this.shadowRoot.querySelector('.more').style.display =
      rows.length > this.#shown ? '' : 'none';
  }
}

customElements.define('spend-transaction-table', SpendTransactionTable);
