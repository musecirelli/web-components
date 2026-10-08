/**
 * <spend-overview> — stat cards for the filtered set:
 * total spend, transactions, avg/day, top category, largest purchase,
 * and the total-vs-previous-period delta.
 * Listens: spend:data
 */
import { WebComponent } from '../../shared/component-base.js';
import { fmtUSD, dayLabel } from './spend-utils.js';

export class SpendOverview extends WebComponent {
  #stats = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.on('spend:data', (e) => { this.#stats = e.detail.stats; this.#render(); });
    this.#render();
  }

  #render() {
    const s = this.#stats;
    const cards = s ? [
      { label: 'Total spent', value: fmtUSD(s.total),
        sub: s.deltaPct != null ? `${s.deltaPct >= 0 ? '▲' : '▼'} ${Math.abs(s.deltaPct).toFixed(1)}% vs prior ${s.periodMonths} mo` : `${s.periodMonths} mo in view` },
      { label: 'Transactions', value: String(s.count),
        sub: `${fmtUSD(s.avgPerDay)} / day avg` },
      { label: 'Top category', value: s.topCategory?.category || '—',
        sub: s.topCategory ? `${fmtUSD(s.topCategory.total)} · ${s.topCategory.share.toFixed(0)}% of spend` : '' },
      { label: 'Largest purchase', value: s.biggest ? fmtUSD(s.biggest.amount) : '—',
        sub: s.biggest ? `${s.biggest.merchant} · ${dayLabel(s.biggest.date)}` : '' },
    ] : [
      { label: 'Total spent', value: '—', sub: '' },
      { label: 'Transactions', value: '—', sub: '' },
      { label: 'Top category', value: '—', sub: '' },
      { label: 'Largest purchase', value: '—', sub: '' },
    ];

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
        .stat {
          background: var(--spend-card, #fff);
          border: 1px solid var(--spend-border, #e5e7eb);
          border-radius: 12px; padding: 14px 16px;
        }
        .label { font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
          color: var(--spend-muted, #6b7280); margin-bottom: 6px; }
        .value { font-size: 24px; font-weight: 700; white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis; }
        .sub { font-size: 12px; color: var(--spend-muted, #6b7280); margin-top: 4px; }
      </style>
      <div class="grid">
        ${cards.map((c) => `
          <div class="stat">
            <div class="label">${c.label}</div>
            <div class="value" title="${String(c.value).replace(/"/g, '&quot;')}">${c.value}</div>
            <div class="sub">${c.sub}</div>
          </div>`).join('')}
      </div>`;
  }
}

customElements.define('spend-overview', SpendOverview);
