/**
 * <spend-sankey> — canvas Sankey diagram of money flow:
 *   Total spend → top categories → top merchants.
 * Hover for amounts, click a band to drill into that category/merchant.
 * Listens: spend:data
 * Emits: spend:drill { category } | { q }
 */
import { WebComponent } from '../../shared/component-base.js';
import { fmtUSD, fitCanvas, CARD_CSS, PALETTE } from './spend-utils.js';

const MAX_CATS = 8;
const MAX_MERCHANTS = 12;

export class SpendSankey extends WebComponent {
  #stats = null;
  #txns = [];
  #bands = [];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        ${CARD_CSS}
        .wrap { position: relative; }
        canvas { display: block; cursor: pointer; }
        .tip {
          position: absolute; pointer-events: none; display: none; z-index: 2;
          background: #111827; color: #f9fafb; font-size: 12px;
          padding: 6px 10px; border-radius: 8px; white-space: nowrap;
        }
        .hint { font-size: 12px; color: var(--spend-muted, #6b7280); margin-top: 8px; }
      </style>
      <div class="card">
        <h3>Where the money goes</h3>
        <div class="wrap">
          <canvas></canvas>
          <div class="tip"></div>
        </div>
        <div class="hint">Flow from total spend through categories to merchants. Click a band to filter.</div>
      </div>`;

    this.on('spend:data', (e) => {
      this.#stats = e.detail.stats;
      this.#txns = e.detail.transactions || [];
      this.#draw();
    });

    const canvas = this.shadowRoot.querySelector('canvas');
    const tip = this.shadowRoot.querySelector('.tip');
    canvas.addEventListener('mousemove', (e) => {
      const b = this.#bandAt(e);
      if (b) {
        tip.style.display = 'block';
        tip.textContent = b.label;
        const r = canvas.getBoundingClientRect();
        tip.style.left = Math.min(e.clientX - r.left + 12, r.width - 220) + 'px';
        tip.style.top = (e.clientY - r.top - 10) + 'px';
        canvas.style.cursor = 'pointer';
      } else {
        tip.style.display = 'none';
        canvas.style.cursor = 'default';
      }
    });
    canvas.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    canvas.addEventListener('click', (e) => {
      const b = this.#bandAt(e);
      if (!b) return;
      if (b.kind === 'category') this.emit('spend:drill', { category: b.key });
      else this.emit('spend:drill', { q: b.key });
    });
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.#draw()).observe(canvas.parentElement);
    }
  }

  #bandAt(e) {
    const canvas = this.shadowRoot.querySelector('canvas');
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    return this.#bands.find((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) || null;
  }

  #draw() {
    const canvas = this.shadowRoot.querySelector('canvas');
    if (!this.#stats) return;

    // ---- layout model (pure data, no canvas needed)
    const cats = this.#stats.categories.slice(0, MAX_CATS);
    const restCat = this.#stats.categories.slice(MAX_CATS);
    if (restCat.length) {
      cats.push({
        category: `Other (${restCat.length})`,
        total: restCat.reduce((a, c) => a + c.total, 0),
      });
    }
    const merchByCat = new Map();
    const catOf = new Map();
    for (const t of this.#txns) if (!catOf.has(t.merchant)) catOf.set(t.merchant, t.category);
    for (const m of this.#stats.merchants.slice(0, MAX_MERCHANTS * 2)) {
      const cat = catOf.get(m.merchant);
      if (!cat) continue;
      if (!merchByCat.has(cat)) merchByCat.set(cat, []);
      if (merchByCat.get(cat).length < 4) merchByCat.get(cat).push(m);
      if ([...merchByCat.values()].flat().length >= MAX_MERCHANTS) break;
    }
    // order merchants: by category order, then total desc
    const catOrder = new Map(cats.map((c, i) => [c.category, i]));
    const merchants = [...merchByCat.entries()]
      .sort((a, b) => (catOrder.get(a[0]) ?? 99) - (catOrder.get(b[0]) ?? 99))
      .flatMap(([cat, ms]) => ms.map((m) => ({ ...m, category: cat })));

    const total = this.#stats.total || 1;
    const rows = Math.max(cats.length, merchants.length, 1);
    const H = Math.max(320, rows * 34 + 90);
    const fit = fitCanvas(canvas, H);
    this.#bands = [];
    if (!fit) return; // jsdom: model computed, nothing to paint
    const { ctx, w, h } = fit;

    const padT = 30, padB = 16;
    const colX = [8, w * 0.36, w * 0.68];
    const colW = [w * 0.2, w * 0.2, w * 0.24];
    const flowH = h - padT - padB;
    const yOf = (v) => padT + (v / total) * flowH;

    const band = (x0, x1, yA0, yA1, yB0, yB1, color, alpha) => {
      ctx.beginPath();
      ctx.moveTo(x0, yA0);
      ctx.bezierCurveTo((x0 + x1) / 2, yA0, (x0 + x1) / 2, yB0, x1, yB0);
      ctx.lineTo(x1, yB1);
      ctx.bezierCurveTo((x0 + x1) / 2, yB1, (x0 + x1) / 2, yA1, x0, yA1);
      ctx.closePath();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    ctx.clearRect(0, 0, w, h);
    ctx.font = '12px system-ui';
    const label = (x, y, text, align = 'left', color = '#374151') => {
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.fillText(text, x, y, colW[2]);
      ctx.textAlign = 'left';
    };

    // column headers
    label(colX[0], 16, 'Total', 'left', '#9ca3af');
    label(colX[1], 16, 'Categories', 'left', '#9ca3af');
    label(colX[2], 16, 'Merchants', 'left', '#9ca3af');

    // total node
    ctx.fillStyle = '#111827';
    ctx.fillRect(colX[0], padT, 10, flowH);
    label(colX[0] + 16, padT + 16, fmtUSD(this.#stats.total));

    // categories: spans + flow from total
    let cy = 0;
    const catSpans = new Map();
    cats.forEach((c, i) => {
      const y0 = yOf(cy), y1 = yOf(cy + c.total);
      cy += c.total;
      catSpans.set(c.category, { y0, y1, color: PALETTE[i % PALETTE.length] });
      band(colX[0] + 10, colX[1], y0, y1, y0, y1, PALETTE[i % PALETTE.length], 0.45);
      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.fillRect(colX[1], y0, 10, Math.max(2, y1 - y0));
      label(colX[1] + 16, Math.min(y0 + 14, h - 8),
        `${c.category.length > 26 ? c.category.slice(0, 25) + '…' : c.category} · ${fmtUSD(c.total)}`);
      this.#bands.push({
        x0: colX[0], x1: colX[1] + 10, y0, y1, kind: 'category', key: c.category,
        label: `${c.category} — ${fmtUSD(c.total)}`,
      });
    });

    // merchants: spans within their category's span + flow from category
    const usedInCat = new Map();
    for (const m of merchants) {
      const span = catSpans.get(m.category);
      if (!span) continue;
      const used = usedInCat.get(m.category) || 0;
      const mh = ((span.y1 - span.y0) * m.total) / (cats.find((c) => c.category === m.category)?.total || 1);
      const y0 = span.y0 + used, y1 = y0 + mh;
      usedInCat.set(m.category, used + mh);
      band(colX[1] + 10, colX[2], y0, y1, y0, y1, span.color, 0.55);
      ctx.fillStyle = span.color;
      ctx.fillRect(colX[2], y0, 10, Math.max(2, y1 - y0));
      if (y1 - y0 > 13) {
        label(colX[2] + 16, y0 + 13,
          `${m.merchant.length > 24 ? m.merchant.slice(0, 23) + '…' : m.merchant} · ${fmtUSD(m.total)}`);
      }
      this.#bands.push({
        x0: colX[1] + 10, x1: colX[2] + colW[2], y0, y1, kind: 'merchant', key: m.merchant,
        label: `${m.merchant} — ${fmtUSD(m.total)}`,
      });
    }
  }
}

customElements.define('spend-sankey', SpendSankey);
