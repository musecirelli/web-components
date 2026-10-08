/**
 * <spend-category-chart> — canvas donut of spend by top-level category
 * plus an HTML legend. Click a slice or legend row to filter.
 * Listens: spend:data
 * Emits: spend:drill { category }  (empty string clears)
 */
import { WebComponent } from '../../shared/component-base.js';
import { fmtUSD, fitCanvas, CARD_CSS, PALETTE } from './spend-utils.js';

export class SpendCategoryChart extends WebComponent {
  #stats = null;
  #slices = [];
  #active = '';

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        ${CARD_CSS}
        .layout { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
        .wrap { position: relative; width: 220px; flex: none; }
        canvas { display: block; cursor: pointer; }
        .center {
          position: absolute; inset: 0; display: flex; flex-direction: column;
          align-items: center; justify-content: center; pointer-events: none;
        }
        .center b { font-size: 20px; }
        .center span { font-size: 11px; color: var(--spend-muted, #6b7280); }
        ul { list-style: none; margin: 0; padding: 0; flex: 1; min-width: 200px; }
        li {
          display: flex; align-items: center; gap: 8px; padding: 5px 8px;
          border-radius: 8px; cursor: pointer; font-size: 14px;
        }
        li:hover, li.active { background: var(--spend-bg, #f3f4f6); }
        li.active { outline: 2px solid var(--spend-accent, #4e79a7); }
        .dot { width: 12px; height: 12px; border-radius: 3px; flex: none; }
        .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .amt { font-variant-numeric: tabular-nums; color: var(--spend-muted, #6b7280); }
        .tip {
          position: absolute; pointer-events: none; display: none; z-index: 2;
          background: #111827; color: #f9fafb; font-size: 12px;
          padding: 6px 10px; border-radius: 8px; white-space: nowrap;
        }
      </style>
      <div class="card">
        <h3>Spending by category</h3>
        <div class="layout">
          <div class="wrap">
            <canvas></canvas>
            <div class="center"><b></b><span></span></div>
            <div class="tip"></div>
          </div>
          <ul></ul>
        </div>
      </div>`;

    this.on('spend:data', (e) => {
      this.#stats = e.detail.stats;
      const fcat = e.detail.filter?.category || '';
      this.#active = fcat;
      this.#draw();
    });

    const canvas = this.shadowRoot.querySelector('canvas');
    const tip = this.shadowRoot.querySelector('.tip');
    canvas.addEventListener('mousemove', (e) => {
      const s = this.#sliceAt(e);
      if (s) {
        tip.style.display = 'block';
        tip.textContent = `${s.category} — ${fmtUSD(s.total)} (${s.share.toFixed(1)}%)`;
        const r = canvas.getBoundingClientRect();
        tip.style.left = Math.min(e.clientX - r.left + 12, r.width - 170) + 'px';
        tip.style.top = (e.clientY - r.top - 10) + 'px';
      } else tip.style.display = 'none';
    });
    canvas.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    canvas.addEventListener('click', (e) => {
      const s = this.#sliceAt(e);
      if (s) this.emit('spend:drill', { category: this.#active === s.category ? '' : s.category });
    });
    this.shadowRoot.querySelector('ul').addEventListener('click', (e) => {
      const li = e.target.closest('li[data-cat]');
      if (li) this.emit('spend:drill', { category: this.#active === li.dataset.cat ? '' : li.dataset.cat });
    });
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.#draw()).observe(canvas.parentElement);
    }
  }

  #sliceAt(e) {
    const canvas = this.shadowRoot.querySelector('canvas');
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2;
    const y = e.clientY - r.top - r.height / 2;
    const dist = Math.hypot(x, y);
    const R = Math.min(r.width, r.height) / 2;
    if (dist > R || dist < R * 0.52) return null;
    let ang = Math.atan2(y, x);
    if (ang < -Math.PI / 2) ang += Math.PI * 2;
    ang += Math.PI / 2; // our arcs start at top
    return this.#slices.find((s) => ang >= s.a0 && ang < s.a1) || null;
  }

  #draw() {
    const canvas = this.shadowRoot.querySelector('canvas');
    const ul = this.shadowRoot.querySelector('ul');
    const center = this.shadowRoot.querySelector('.center');
    if (!this.#stats) return;
    const cats = this.#stats.categories.slice(0, 9);
    const rest = this.#stats.categories.slice(9);
    const rows = cats.concat(rest.length
      ? [{ category: `Other (${rest.length})`, total: rest.reduce((a, c) => a + c.total, 0),
           share: rest.reduce((a, c) => a + c.share, 0) }]
      : []);
    const total = rows.reduce((a, c) => a + c.total, 0);

    // legend + center render even when canvas is unavailable (e.g. tests)
    center.querySelector('b').textContent = fmtUSD(total);
    center.querySelector('span').textContent = 'total in view';
    ul.innerHTML = rows.map((c, i) => `
      <li data-cat="${c.category.replace(/"/g, '&quot;')}" class="${this.#active === c.category ? 'active' : ''}"
          title="Filter to ${c.category.replace(/"/g, '&quot;')}">
        <span class="dot" style="background:${PALETTE[i % PALETTE.length]}"></span>
        <span class="name">${c.category}</span>
        <span class="amt">${fmtUSD(c.total)}</span>
      </li>`).join('');

    const fit = fitCanvas(canvas, 220);
    if (!fit) return;
    const { ctx, w } = fit;
    const R = w / 2 - 6, rIn = R * 0.58, cx = w / 2, cy = 110;
    ctx.clearRect(0, 0, fit.w, fit.h);
    this.#slices = [];
    let a = -Math.PI / 2;
    rows.forEach((c, i) => {
      const sweep = total > 0 ? (c.total / total) * Math.PI * 2 : 0;
      const dim = this.#active && this.#active !== c.category;
      ctx.beginPath();
      ctx.arc(cx, cy, R, a, a + sweep);
      ctx.arc(cx, cy, rIn, a + sweep, a, true);
      ctx.closePath();
      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.globalAlpha = dim ? 0.3 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      this.#slices.push({ a0: a < 0 ? a + Math.PI * 2 : a, a1: (a + sweep) < 0 ? a + sweep + Math.PI * 2 : a + sweep, ...c });
      a += sweep;
    });
  }
}

customElements.define('spend-category-chart', SpendCategoryChart);
