/**
 * <spend-timeline> — canvas bar chart of spending per month with a
 * cumulative line overlay. Hover for values, click a bar to drill into
 * that month.
 * Listens: spend:data
 * Emits: spend:drill { from, to } (single month)
 */
import { WebComponent } from '../../shared/component-base.js';
import { fmtUSD, fmtUSD0, monthLabel, monthRange, fitCanvas, CARD_CSS, PALETTE } from './spend-utils.js';

export class SpendTimeline extends WebComponent {
  #stats = null;
  #bars = [];
  #mode = 'monthly'; // or 'cumulative'

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        ${CARD_CSS}
        .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
        .head h3 { margin: 0; }
        .toggle { display: flex; gap: 4px; }
        .toggle button {
          font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 999px;
          border: 1px solid var(--spend-border, #e5e7eb); background: transparent;
          color: var(--spend-muted, #6b7280); cursor: pointer;
        }
        .toggle button[aria-pressed="true"] {
          background: var(--spend-accent, #4e79a7); border-color: var(--spend-accent, #4e79a7); color: #fff;
        }
        .wrap { position: relative; }
        canvas { display: block; cursor: pointer; }
        .tip {
          position: absolute; pointer-events: none; display: none;
          background: #111827; color: #f9fafb; font-size: 12px;
          padding: 6px 10px; border-radius: 8px; white-space: nowrap; z-index: 2;
        }
        .hint { font-size: 12px; color: var(--spend-muted, #6b7280); margin-top: 8px; }
      </style>
      <div class="card">
        <div class="head">
          <h3>Spending over time</h3>
          <div class="toggle" role="group" aria-label="Chart mode">
            <button data-mode="monthly" aria-pressed="true">Monthly</button>
            <button data-mode="cumulative" aria-pressed="false">Cumulative</button>
          </div>
        </div>
        <div class="wrap">
          <canvas></canvas>
          <div class="tip"></div>
        </div>
        <div class="hint">Click a bar to zoom into that month. Reset the filter bar to zoom back out.</div>
      </div>`;

    this.on('spend:data', (e) => { this.#stats = e.detail.stats; this.#draw(); });
    this.shadowRoot.querySelectorAll('.toggle button').forEach((b) => {
      b.addEventListener('click', () => {
        this.#mode = b.dataset.mode;
        this.shadowRoot.querySelectorAll('.toggle button')
          .forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        this.#draw();
      });
    });

    const canvas = this.shadowRoot.querySelector('canvas');
    const tip = this.shadowRoot.querySelector('.tip');
    canvas.addEventListener('mousemove', (e) => {
      const hit = this.#hitTest(e);
      if (hit) {
        tip.style.display = 'block';
        tip.textContent = `${monthLabel(hit.month)} — ${fmtUSD(hit.value)}`;
        const r = canvas.getBoundingClientRect();
        tip.style.left = Math.min(e.clientX - r.left + 12, r.width - 150) + 'px';
        tip.style.top = (e.clientY - r.top - 34) + 'px';
        canvas.style.cursor = 'pointer';
      } else {
        tip.style.display = 'none';
        canvas.style.cursor = 'default';
      }
    });
    canvas.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    canvas.addEventListener('click', (e) => {
      const hit = this.#hitTest(e);
      if (hit) this.emit('spend:drill', { from: hit.month, to: hit.month });
    });
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.#draw()).observe(canvas.parentElement);
    }
  }

  #hitTest(e) {
    const canvas = this.shadowRoot.querySelector('canvas');
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    return this.#bars.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null;
  }

  #draw() {
    const canvas = this.shadowRoot.querySelector('canvas');
    const fit = fitCanvas(canvas, 260);
    if (!fit || !this.#stats) return;
    const { ctx, w, h } = fit;
    const s = this.#stats;
    const months = s.months;
    if (!months.length) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '14px system-ui';
      ctx.fillText('No data in this range.', 16, 40);
      this.#bars = [];
      return;
    }

    const padL = 56, padR = 12, padT = 16, padB = 34;
    const iw = w - padL - padR, ih = h - padT - padB;
    const values = months.map((m) => s.byMonth[m] || 0);
    const series = this.#mode === 'cumulative'
      ? values.reduce((acc, v, i) => (acc.push((acc[i - 1] || 0) + v), acc), [])
      : values;
    const max = Math.max(...series, 1);
    const n = months.length;
    const slot = iw / n;
    const bw = Math.min(slot * 0.62, 64);

    ctx.clearRect(0, 0, w, h);
    // gridlines + y labels
    ctx.font = '11px system-ui';
    ctx.fillStyle = '#9ca3af';
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const v = (max * i) / 4;
      const y = padT + ih - (ih * i) / 4;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.fillText(fmtUSD0(v), 6, y + 4);
    }

    this.#bars = [];
    const baseY = padT + ih;
    series.forEach((v, i) => {
      const bh = (v / max) * ih;
      const x = padL + slot * i + (slot - bw) / 2;
      const y = baseY - bh;
      const grad = ctx.createLinearGradient(0, y, 0, baseY);
      grad.addColorStop(0, PALETTE[0]);
      grad.addColorStop(1, '#9db8d4');
      ctx.fillStyle = grad;
      const r = Math.min(5, bw / 2, bh);
      ctx.beginPath();
      ctx.roundRect(x, y, bw, Math.max(bh, 2), [r, r, 0, 0]);
      ctx.fill();
      this.#bars.push({ x, y: 0, w: slot, h: baseY, month: months[i], value: values[i] });

      // x labels: show every kth to avoid crowding
      const every = Math.ceil(n / 12);
      if (i % every === 0 || i === n - 1) {
        ctx.fillStyle = '#9ca3af';
        ctx.textAlign = 'center';
        ctx.fillText(months[i].slice(5), padL + slot * i + slot / 2, baseY + 18);
        ctx.textAlign = 'left';
      }
    });

    if (this.#mode === 'cumulative') {
      ctx.strokeStyle = '#e15759';
      ctx.lineWidth = 2;
      ctx.beginPath();
      series.forEach((v, i) => {
        const x = padL + slot * i + slot / 2;
        const y = padT + ih - (v / max) * ih;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
  }
}

customElements.define('spend-timeline', SpendTimeline);
