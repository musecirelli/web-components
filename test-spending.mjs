/**
 * Functional test for spending-dashboard components.
 * Run: node test-spending.mjs (requires jsdom)
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost/',
  runScripts: 'dangerously',
});

global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.CustomEvent = dom.window.CustomEvent;
global.ShadowRoot = dom.window.ShadowRoot;
global.customElements = dom.window.customElements;
global.localStorage = dom.window.localStorage;
// canvas is unavailable in jsdom without node-canvas: stub it so fitCanvas skips drawing
dom.window.HTMLCanvasElement.prototype.getContext = () => null;

await import('./components/spending-dashboard/spending-dashboard.js');
const { SAMPLE_TRANSACTIONS } = await import('./components/spending-dashboard/sample-data.js');
const rules = await import('./components/spending-dashboard/rules.js');

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  PASS: ${msg}`);
  else { console.log(`  FAIL: ${msg}`); failures++; }
}
const q = (root, sel) => root.shadowRoot.querySelector(sel);
const qa = (root, sel) => [...root.shadowRoot.querySelectorAll(sel)];

console.log('Test 1: dashboard boots and fans out spend:data');
{
  document.body.innerHTML = '';
  const dash = document.createElement('spending-dashboard');
  document.body.appendChild(dash);
  dash.data = SAMPLE_TRANSACTIONS;

  assert(qa(dash, 'spend-overview').length === 1, 'overview present');
  const stats = qa(q(dash, 'spend-overview'), '.stat');
  assert(stats.length === 4, `4 stat cards rendered (got ${stats.length})`);
  assert(stats[0].querySelector('.value').textContent.startsWith('$'),
    `total looks like money ("${stats[0].querySelector('.value').textContent}")`);

  const legend = qa(q(dash, 'spend-category-chart'), 'ul li');
  assert(legend.length > 3, `category legend has rows (got ${legend.length})`);

  const merchants = qa(q(dash, 'spend-merchant-list'), 'ol li');
  assert(merchants.length === 10, `10 merchants listed (got ${merchants.length})`);

  const rows = qa(q(dash, 'spend-transaction-table'), 'tbody tr');
  assert(rows.length === 50, `table paginated at 50 rows (got ${rows.length})`);

  const notes = qa(q(dash, 'spend-insights'), 'ul li');
  assert(notes.length >= 3, `insights generated (got ${notes.length})`);

  const sub = q(dash, '.subtitle').textContent;
  assert(/transactions/.test(sub), `subtitle summarizes data ("${sub}")`);
}

console.log('Test 2: drill-down from category chart narrows the table');
{
  document.body.innerHTML = '';
  const dash = document.createElement('spending-dashboard');
  document.body.appendChild(dash);
  dash.data = SAMPLE_TRANSACTIONS;

  const chart = q(dash, 'spend-category-chart');
  const countText = () => q(dash, 'spend-transaction-table').shadowRoot.querySelector('.count').textContent;
  const totalOf = (s) => parseInt(s.match(/of ([\d,]+)/)[1].replace(/,/g, ''), 10);
  const before = totalOf(countText());
  chart.emit('spend:drill', { category: 'Food & Dining' });
  const rows = qa(q(dash, 'spend-transaction-table'), 'tbody tr');
  const after = totalOf(countText());
  assert(after > 0 && after < before,
    `table narrowed after drill (${before} -> ${after})`);
  const cats = new Set(rows.map((r) => r.querySelectorAll('td')[2].textContent.split('·')[0].trim()));
  assert(cats.size === 1 && cats.has('Food & Dining'),
    `all visible rows are Food & Dining (${[...cats].join(',')})`);
  // filter bar adopted the drill
  const bar = q(dash, 'spend-filter-bar');
  assert(bar.shadowRoot.querySelector('select[data-k="category"]').value === 'Food & Dining',
    'filter bar category select reflects drill');
}

console.log('Test 3: search filter via spend:filter');
{
  document.body.innerHTML = '';
  const dash = document.createElement('spending-dashboard');
  document.body.appendChild(dash);
  dash.data = SAMPLE_TRANSACTIONS;

  q(dash, 'spend-filter-bar').emit('spend:filter', { q: 'cineplex' });
  const rows = qa(q(dash, 'spend-transaction-table'), 'tbody tr');
  assert(rows.length > 0, `search returned rows (got ${rows.length})`);
  assert(rows.every((r) => /cineplex/i.test(r.querySelectorAll('td')[1].textContent)),
    'every row matches the search');
}

console.log('Test 4: rules.js matches the Python pipeline');
{
  assert(rules.normalizeMerchant('COSTCO WHSE #1089 RICHMOND VA') === 'Costco', 'costco normalized');
  assert(rules.normalizeMerchant('SQ *MOBIUS STRIP TECHNOLOgosq.com OH') === 'Mobius Strip Technologies', 'mobius normalized');
  const c1 = rules.categorizeTransaction('Costco', 'COSTCO WHSE #1089 RICHMOND VA');
  assert(c1.category === 'Food & Dining' && c1.subcategory === 'Groceries',
    `costco categorized (${c1.category}/${c1.subcategory})`);
  const c2 = rules.categorizeTransaction('Costco Gas', 'COSTCO GAS #1089 RICHMOND VA');
  assert(c2.category === 'Gas & Fuel', `costco gas categorized (${c2.category})`);
  const c3 = rules.categorizeTransaction('Payment Thank You', 'PAYMENT THANK YOU');
  assert(c3.category === 'Transfers', `payment categorized (${c3.category})`);
}

console.log('Test 5: budget tracker renders latest month with editable targets');
{
  document.body.innerHTML = '';
  const dash = document.createElement('spending-dashboard');
  document.body.appendChild(dash);
  dash.data = SAMPLE_TRANSACTIONS;
  const bt = q(dash, 'spend-budget-tracker');
  const items = qa(bt, 'ul li');
  assert(items.length > 0, `budget rows rendered (got ${items.length})`);
  const input = bt.shadowRoot.querySelector('input[data-cat]');
  assert(!!input, 'target input present');
  input.value = '500';
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const stored = JSON.parse(dom.window.localStorage.getItem('spend:budgets:v1') || '{}');
  assert(Object.values(stored).includes(500), 'budget target persisted to localStorage');
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
