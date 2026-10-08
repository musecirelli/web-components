/**
 * Functional test for the deal-watch-table component.
 * Run: node test-dealwatch.mjs (requires jsdom: npm install jsdom)
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost/',
  runScripts: 'dangerously',
});

// Expose jsdom globals like a browser.
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.CustomEvent = dom.window.CustomEvent;
global.ShadowRoot = dom.window.ShadowRoot;
global.customElements = dom.window.customElements;

await import('./shared/component-base.js');
await import('./components/deal-watch-table/deal-watch-table.js');

const feed = {
  hunt: 'kids-scooter',
  title: 'Kids Electric Scooter Hunt',
  generated: '2026-10-08T12:00:00Z',
  spec_columns: [
    { key: 'motor', label: 'Motor' },
    { key: 'speed', label: 'Top speed' },
  ],
  items: [
    { id: 'a', name: 'Segway C2 Pro', url: 'http://x/a', image: '',
      retailer: 'Amazon', brand: 'Segway', price: 239.99, baseline: 249.99,
      was: 279.99, change: -10.0, in_stock: true, badges: ['sale'],
      confidence: 'high', specs: { motor: '150W brushless', speed: '12.4 mph' } },
    { id: 'b', name: 'Segway DLX 2', url: 'http://x/b', image: '',
      retailer: 'Walmart', brand: 'Segway', price: 148.0, baseline: 148.0,
      was: null, change: 0.0, in_stock: true, badges: ['clearance'],
      confidence: 'high', specs: { motor: '150W brushless', speed: '12.4 mph' } },
    { id: 'c', name: 'Aigo E3', url: 'http://x/c', image: '',
      retailer: 'Costco', brand: 'Aigo', price: null, baseline: 149.99,
      was: null, change: null, in_stock: null, badges: [],
      confidence: 'low', specs: { motor: '130W', speed: '9 mph' } },
  ],
};

function pushFeed() {
  // A page pushing data: dispatch on body (the component's event source).
  document.body.dispatchEvent(new CustomEvent('dealwatch:data', {
    detail: { feed }, bubbles: true, composed: true,
  }));
}

function makeTable() {
  document.body.innerHTML = '';
  const el = document.createElement('deal-watch-table');
  document.body.appendChild(el);
  pushFeed();
  return el;
}

const rows = (el) => [...el.shadowRoot.querySelectorAll('tbody tr')];
const firstColText = (el) => rows(el).map((r) =>
  r.querySelector('.item-cell a').textContent);

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); }
  else { console.log(`  FAIL: ${msg}`); failures++; }
}

console.log('Test 1: renders one row per item, default sort by change asc');
{
  const el = makeTable();
  const names = firstColText(el);
  assert(names.length === 3, `3 rows rendered (got ${names.length})`);
  assert(names[0] === 'Segway C2 Pro', `cheapest-vs-baseline first ("${names.join(',')}")`);
  assert(names[2] === 'Aigo E3', `null change sorts last ("${names.join(',')}")`);
}

console.log('Test 2: spec columns render from feed spec_columns');
{
  const el = makeTable();
  const headers = [...el.shadowRoot.querySelectorAll('thead th')]
    .map((th) => th.textContent.replace(/[▲▼]/g, '').trim());
  assert(headers.includes('Motor') && headers.includes('Top speed'),
    `spec headers present (${headers.join('|')})`);
  const firstRowCells = [...rows(el)[0].querySelectorAll('td')].map((td) => td.textContent);
  assert(firstRowCells.some((t) => t.includes('150W brushless')), 'spec value rendered');
}

console.log('Test 3: clicking a header sorts by that column');
{
  const el = makeTable();
  const priceTh = [...el.shadowRoot.querySelectorAll('thead th')]
    .find((th) => th.textContent.includes('Price'));
  priceTh.click();
  const names = firstColText(el);
  assert(names[0] === 'Segway DLX 2', `sorted by price asc ("${names.join(',')}")`);
  priceTh.click(); // toggle desc
  const names2 = firstColText(el);
  assert(names2[0] === 'Aigo E3', `toggled to price desc ("${names2.join(',')}")`);
}

console.log('Test 4: text filter narrows rows');
{
  const el = makeTable();
  const input = el.shadowRoot.getElementById('q');
  input.value = 'aigo';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const names = firstColText(el);
  assert(names.length === 1 && names[0] === 'Aigo E3', `filter matched one row ("${names.join(',')}")`);
  assert(el.shadowRoot.getElementById('count').textContent.includes('1 of 3'), 'count updated');
}

console.log('Test 5: retailer chip filters rows');
{
  const el = makeTable();
  const chip = [...el.shadowRoot.querySelectorAll('.chip')]
    .find((c) => c.textContent === 'Walmart');
  chip.click();
  const names = firstColText(el);
  assert(names.length === 1 && names[0] === 'Segway DLX 2', `chip filtered to Walmart ("${names.join(',')}")`);
}

console.log('Test 6: deals-only shows only negative changes');
{
  const el = makeTable();
  const box = el.shadowRoot.getElementById('deals');
  box.checked = true;
  box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const names = firstColText(el);
  assert(names.length === 1 && names[0] === 'Segway C2 Pro', `deals-only matched one row ("${names.join(',')}")`);
}

console.log('Test 7: change cell coloring and stock labels');
{
  const el = makeTable();
  const cells = rows(el)[0].querySelectorAll('td');
  const changeCell = [...cells].find((td) => td.classList.contains('change-neg'));
  assert(!!changeCell && changeCell.textContent.includes('10.00'), 'negative change styled + shown');
  const stockCell = rows(el)[0].querySelector('.stock-in');
  assert(!!stockCell && stockCell.textContent === 'In stock', 'stock label rendered');
  const nullPrice = [...rows(el)[2].querySelectorAll('td')].find((td) => td.classList.contains('price'));
  assert(nullPrice.textContent.trim() === '—', 'null price renders as dash');
}

if (failures) { console.log(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nAll deal-watch-table tests passed.');
