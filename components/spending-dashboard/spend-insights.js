/**
 * <spend-insights> — auto-generated observations: biggest month, top-category
 * share, detected recurring charges, largest purchase, last-month trend.
 * Listens: spend:data
 */
import { WebComponent } from '../../shared/component-base.js';
import { fmtUSD, monthLabel, dayLabel, CARD_CSS } from './spend-utils.js';

/** Find merchants billed >=3 times at ~monthly cadence with stable amounts. */
function findRecurring(txns) {
  const byMerchant = new Map();
  for (const t of txns) {
    if (t.category === 'Transfers' || t.amount <= 0) continue;
    if (!byMerchant.has(t.merchant)) byMerchant.set(t.merchant, []);
    byMerchant.get(t.merchant).push(t);
  }
  const out = [];
  for (const [merchant, list] of byMerchant) {
    if (list.length < 3) continue;
    const sorted = [...list].sort((a, b) => a.date < b.date ? -1 : 1);
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((new Date(sorted[i].date) - new Date(sorted[i - 1].date)) / 864e5);
    }
    const medGap = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    const amounts = sorted.map((t) => t.amount);
    const med = amounts.sort((a, b) => a - b)[Math.floor(amounts.length / 2)];
    const stable = amounts.every((a) => Math.abs(a - med) <= Math.max(5, med * 0.2));
    if (medGap >= 20 && medGap <= 45 && stable) {
      out.push({ merchant, monthly: med, count: sorted.length,
                 category: sorted[0].category, last: sorted[sorted.length - 1].date });
    }
  }
  return out.sort((a, b) => b.monthly - a.monthly);
}

export class SpendInsights extends WebComponent {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        ${CARD_CSS}
        ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
        li { font-size: 14px; line-height: 1.45; padding-left: 22px; position: relative; }
        li::before { content: "✦"; position: absolute; left: 0; color: var(--spend-accent, #4e79a7); }
        b { font-variant-numeric: tabular-nums; }
      </style>
      <div class="card"><h3>Insights</h3><ul></ul></div>`;
    this.on('spend:data', (e) => this.#render(e.detail));
  }

  #render({ transactions, stats }) {
    const ul = this.shadowRoot.querySelector('ul');
    if (!stats || !transactions.length) { ul.innerHTML = '<li>No data in this range.</li>'; return; }
    const notes = [];

    // biggest month
    const months = Object.entries(stats.byMonth).sort((a, b) => b[1] - a[1]);
    if (months.length > 1) {
      const [m, v] = months[0];
      const avg = stats.total / months.length;
      notes.push(`Biggest month was <b>${monthLabel(m)}</b> at <b>${fmtUSD(v)}</b> — ${((v / avg - 1) * 100).toFixed(0)}% above your monthly average.`);
    }

    // concentration
    const top = stats.categories[0];
    if (top) notes.push(`<b>${top.category}</b> is your largest category at <b>${fmtUSD(top.total)}</b> (${top.share.toFixed(0)}% of spend).`);

    // recurring
    const rec = findRecurring(transactions).slice(0, 5);
    if (rec.length) {
      const total = rec.reduce((a, r) => a + r.monthly, 0);
      notes.push(`Detected <b>${rec.length}</b> recurring charges totaling about <b>${fmtUSD(total)}/mo</b>: ` +
        rec.map((r) => `${r.merchant} (${fmtUSD(r.monthly)})`).join(', ') + '.');
    }

    // biggest single purchase
    if (stats.biggest) {
      notes.push(`Largest single purchase: <b>${fmtUSD(stats.biggest.amount)}</b> at ${stats.biggest.merchant} on ${dayLabel(stats.biggest.date)}.`);
    }

    // last full month trend
    const ms = stats.months;
    if (ms.length >= 2) {
      const last = ms[ms.length - 1], prev = ms[ms.length - 2];
      const a = stats.byMonth[last] || 0, b = stats.byMonth[prev] || 0;
      if (b > 0) {
        const pct = ((a / b - 1) * 100).toFixed(0);
        notes.push(`${monthLabel(last)}: <b>${fmtUSD(a)}</b> vs ${monthLabel(prev)} <b>${fmtUSD(b)}</b> (${a >= b ? '+' : ''}${pct}%).`);
      }
    }

    ul.innerHTML = notes.map((n) => `<li>${n}</li>`).join('');
  }
}

customElements.define('spend-insights', SpendInsights);
