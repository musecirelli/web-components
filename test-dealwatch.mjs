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

console.log('Test 8: clicking a thumbnail opens the lightbox; click closes it');
{
  // Give the first item an image so a thumbnail renders.
  feed.items[0].image = 'http://x/img-a.jpg';
  const el = makeTable();
  const thumb = el.shadowRoot.querySelector('.thumb img');
  assert(!!thumb, 'thumbnail rendered for item with image');
  thumb.click();
  const lightbox = el.shadowRoot.getElementById('lightbox');
  assert(lightbox.classList.contains('open'), 'lightbox opens on thumbnail click');
  assert(el.shadowRoot.getElementById('lightbox-img').getAttribute('src') === 'http://x/img-a.jpg',
    'lightbox shows the full-size image URL');
  lightbox.click();
  assert(!lightbox.classList.contains('open'), 'lightbox closes on click');
  feed.items[0].image = '';
}

console.log('Test 9: ctrl+click adds a secondary sort column');
{
  const el = makeTable();
  const priceTh = [...el.shadowRoot.querySelectorAll('thead th')]
    .find((th) => th.textContent.includes('Price'));
  priceTh.click(); // primary: price asc
  const retailerTh = [...el.shadowRoot.querySelectorAll('thead th')]
    .find((th) => th.textContent.includes('Retailer'));
  retailerTh.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, ctrlKey: true }));
  const names = firstColText(el);
  // price asc primary: DLX 2 (148), C2 Pro (239.99), Aigo (null last)
  assert(names[0] === 'Segway DLX 2', `multi-sort keeps price primary ("${names.join(',')}")`);
  const prio = [...el.shadowRoot.querySelectorAll('thead th')]
    .map((th) => th.innerHTML);
  assert(prio.some((h) => h.includes('sort-prio')), 'sort priority indicator shown');
}

console.log('Test 10: Columns menu hides a column');
{
  const el = makeTable();
  const btn = el.shadowRoot.getElementById('colmenu-btn');
  btn.click();
  const menu = el.shadowRoot.getElementById('colmenu');
  assert(!menu.hasAttribute('hidden'), 'columns menu opens');
  const stockBox = [...menu.querySelectorAll('label')]
    .find((l) => l.textContent.includes('Stock')).querySelector('input');
  stockBox.checked = false;
  stockBox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const headers = [...el.shadowRoot.querySelectorAll('thead th')].map((th) => th.textContent);
  assert(!headers.some((h) => h.includes('Stock')), 'Stock column hidden after uncheck');
}

console.log('Test 11: unverified spec cell renders red with hover icon');
{
  feed.items[0].spec_verification = {
    motor: { status: 'conflict', note: 'Brand lists 400W nominal; ad claims 500W' },
  };
  const el = makeTable();
  const icon = el.shadowRoot.querySelector('.verify-icon');
  assert(!!icon, 'verification icon rendered');
  assert(icon.getAttribute('title').includes('400W nominal'), 'icon carries the note');
  assert(icon.closest('td').classList.contains('spec-unverified'), 'cell marked unverified (red)');
  delete feed.items[0].spec_verification;
}

console.log('Test 12: category column appears when an item has a category');
{
  feed.items[1].category = 'off-road';
  const el = makeTable();
  const headers = [...el.shadowRoot.querySelectorAll('thead th')].map((th) => th.textContent);
  assert(headers.some((h) => h.includes('Category')), 'Category column rendered');
  delete feed.items[1].category;
}

console.log('Test 13: rating column renders with gradient, default sort is rating desc');
{
  feed.items[0].rating = 92; feed.items[1].rating = 78; feed.items[2].rating = 85;
  const el = makeTable();
  const headers = [...el.shadowRoot.querySelectorAll('thead th')]
    .map((th) => th.textContent.replace(/[▲▼]/g, '').trim());
  assert(headers.includes('Rating'), 'Rating column rendered');
  const names = firstColText(el);
  assert(names[0] === 'Segway C2 Pro' && names[1] === 'Aigo E3' && names[2] === 'Segway DLX 2',
    `default sort by rating desc ("${names.join(',')}")`);
  const ratingCell = rows(el)[0].querySelector('.rating');
  assert(!!ratingCell && ratingCell.textContent.trim() === '92', 'rating cell shows rounded score');
  assert((ratingCell.getAttribute('style') || '').includes('hsl('), 'rating cell has gradient background');
  delete feed.items[0].rating; delete feed.items[1].rating; delete feed.items[2].rating;
}

console.log('Test 14: ruled-out rows dim and the toggle hides them');
{
  feed.items[0].rating = 90; feed.items[1].rating = 80; feed.items[2].rating = 70;
  feed.items[2].ruled_out = true;
  const el = makeTable();
  assert(!!rows(el).find((r) => r.classList.contains('ruled-out')), 'ruled-out row dimmed');
  assert(!el.shadowRoot.getElementById('ruledout-wrap').hasAttribute('hidden'),
    'show ruled-out toggle visible');
  const box = el.shadowRoot.getElementById('ruledout');
  box.checked = false;
  box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const names = firstColText(el);
  assert(names.length === 2 && !names.includes('Aigo E3'), `toggle hides ruled-out ("${names.join(',')}")`);
  delete feed.items[0].rating; delete feed.items[1].rating; delete feed.items[2].rating;
  delete feed.items[2].ruled_out;
}

console.log('Test 15: brand cell links to brand_url');
{
  feed.items[0].brand_url = 'http://brand.example/segway';
  const el = makeTable();
  const link = el.shadowRoot.querySelector('.brand-link');
  assert(!!link && link.getAttribute('href') === 'http://brand.example/segway', 'brand link rendered');
  assert(link.textContent === 'Segway', 'brand link shows the brand name');
  delete feed.items[0].brand_url;
}

console.log('Test 16: cert cell links via feed.cert_links');
{
  feed.spec_columns = [...feed.spec_columns, { key: 'cert', label: 'Certification' }];
  feed.cert_links = { 'UL 2272': 'http://example.com/ul2272' };
  feed.items[0].specs.cert = 'UL 2272';
  const el = makeTable();
  const cell = [...rows(el)[0].querySelectorAll('td')]
    .find((td) => td.textContent.includes('UL 2272'));
  const link = cell.querySelector('a');
  assert(!!link && link.getAttribute('href') === 'http://example.com/ul2272', 'cert value linked');
  delete feed.items[0].specs.cert;
  delete feed.cert_links;
  feed.spec_columns = feed.spec_columns.filter((c) => c.key !== 'cert');
}

console.log('Test 17: imageless items get a placeholder square');
{
  const el = makeTable(); // all test items have image: ''
  const placeholders = el.shadowRoot.querySelectorAll('.thumb.placeholder');
  assert(placeholders.length === 3, `placeholder per imageless row (got ${placeholders.length})`);
  const styleText = el.shadowRoot.querySelector('style').textContent;
  assert(styleText.includes('.thumb.placeholder') && styleText.includes('width: 56px'),
    'placeholder styled 56x56 like thumbnails');
}

console.log('Test 18: stale fetch responses never render over fresher data');
{
  // Simulates the page-refresh race: connectedCallback starts fetching the
  // default src, then the hunt restore sets src to the saved feed. If the
  // first response arrives last, it must be ignored.
  const item = (id, name) => ({ id, name, url: `http://x/${id}`, image: '',
    retailer: 'X', brand: 'X', price: 1, baseline: 1, was: null, change: 0,
    in_stock: true, badges: [], confidence: 'high', specs: {} });
  const feedA = { ...feed, hunt: 'a', title: 'Feed A', items: [item('a1', 'Alpha Scooter')] };
  const feedB = { ...feed, hunt: 'b', title: 'Feed B', items: [item('b1', 'Beta Scooter')] };
  const enc = (o) => new TextEncoder().encode(JSON.stringify(o)).buffer;
  let resolveA, resolveB;
  const realFetch = global.fetch;
  global.fetch = (url) => new Promise((resolve) => {
    const res = { ok: true, arrayBuffer: async () => enc(url.includes('feed-a.json') ? feedA : feedB) };
    if (url.includes('feed-a.json')) resolveA = () => resolve(res);
    else resolveB = () => resolve(res);
  });
  document.body.innerHTML = '';
  const el = document.createElement('deal-watch-table');
  el.setAttribute('src', 'http://x/feed-a.json');
  document.body.appendChild(el);          // starts fetching feed A
  el.setAttribute('src', 'http://x/feed-b.json'); // superseded by feed B
  resolveB();                            // fresh response arrives first
  await new Promise((r) => setTimeout(r, 10));
  resolveA();                            // stale response arrives last
  await new Promise((r) => setTimeout(r, 10));
  const names = firstColText(el);
  assert(names.length === 1 && names[0] === 'Beta Scooter',
    `stale feed ignored, fresh feed rendered ("${names.join(',')}")`);
  global.fetch = realFetch;
}

if (failures) { console.log(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nAll extended deal-watch-table tests passed.');
