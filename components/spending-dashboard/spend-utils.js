/**
 * spend-utils — tiny shared helpers for the spending-dashboard components.
 * No dependencies. In the single-file build this is concatenated, so it
 * must not import anything.
 */

export const PALETTE = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
];

const _usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const _usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** 1234.5 -> "$1,234.50" */
export function fmtUSD(n) {
  return _usd.format(n || 0);
}

/** 1234.5 -> "$1,235" (axis labels) */
export function fmtUSD0(n) {
  return _usd0.format(n || 0);
}

/** "2025-11" -> "Nov 2025" */
export function monthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

/** "2025-11-03" -> "Nov 3, 2025" */
export function dayLabel(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** add n months to a "YYYY-MM" string */
export function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** list of "YYYY-MM" from a..b inclusive */
export function monthRange(a, b) {
  const out = [];
  let cur = a;
  while (cur <= b) { out.push(cur); cur = shiftMonth(cur, 1); }
  return out;
}

export function debounce(fn, ms) {
  let t = 0;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Set up a canvas for crisp rendering; returns ctx or null (e.g. jsdom). */
export function fitCanvas(canvas, cssHeight) {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 600;
  const h = cssHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = '100%';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx ? { ctx, w, h } : null;
}

export const CARD_CSS = `
  :host { display: block; }
  .card {
    background: var(--spend-card, #fff);
    border: 1px solid var(--spend-border, #e5e7eb);
    border-radius: 12px;
    padding: 16px;
  }
  .card h3 {
    margin: 0 0 12px;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--spend-muted, #6b7280);
  }
`;
