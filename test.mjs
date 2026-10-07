/**
 * Functional test for ebidlocal-watchlist components.
 * Run: node test.mjs (requires jsdom: npm install jsdom)
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

// Import components (they self-register).
await import('./shared/component-base.js');
await import('./components/ebidlocal-watchlist/ebidlocal-watchlist.js');

const feed = {
  generated: '2026-10-06T12:00:00Z',
  auctions: [
    {
      id: 'a1', number: '2066', title: 'Test Auction One', ends: '2026-10-07',
      lots: [
        { id: 'l1', title: 'Sega Game Gear', sku: 'SKU1', bid: 25.0,
          ends: '10/07 10:00', url: 'http://x/1', image: '', keywords: ['sega'], categories: ['Retro'] },
        { id: 'l2', title: 'Coffee Maker', sku: 'SKU2', bid: 3.0,
          ends: '10/07 11:00', url: 'http://x/2', image: '', keywords: ['coffee'], categories: ['Appliances'] },
      ],
    },
    {
      id: 'a2', number: '2067', title: 'Test Auction Two', ends: '2026-10-08',
      lots: [
        { id: 'l3', title: 'Violin', sku: 'SKU3', bid: 100.0,
          ends: '10/08 10:00', url: 'http://x/3', image: '', keywords: ['violin'], categories: ['Music'] },
        { id: 'l4', title: 'Retro Radio', sku: 'SKU4', bid: 15.0,
          ends: '10/08 11:00', url: 'http://x/4', image: '', keywords: ['radio'], categories: ['Retro'] },
      ],
    },
  ],
};

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); }
  else { console.log(`  FAIL: ${msg}`); failures++; }
}

console.log('Test 1: default category grouping renders collapsed lists');
{
  document.body.innerHTML = '';
  const app = document.createElement('ebidlocal-watchlist');
  document.body.appendChild(app);
  app.emit('watchlist:data', feed);

  const feedEl = app.shadowRoot.querySelector('watchlist-feed');
  assert(!!feedEl, 'watchlist-feed exists in app shadow DOM');
  const entries = [...feedEl.shadowRoot.querySelectorAll('category-entry')];
  assert(entries.length === 3, `3 category entries rendered (got ${entries.length})`);
  // Sorted by lot count desc: Retro (2), then Appliances, Music (1 each, alpha).
  const names = entries.map((e) => e.shadowRoot.querySelector('.title').textContent);
  assert(names[0] === 'Retro', `Retro first by count ("${names.join(',')}")`);
  assert(entries.every((e) => !e.shadowRoot.querySelector('details').open),
    'all categories start collapsed');
  const retroCards = entries[0].shadowRoot.querySelectorAll('lot-card');
  assert(retroCards.length === 2, `Retro has 2 cards (got ${retroCards.length})`);
  const auctionLabel = retroCards[0].shadowRoot.querySelector('.auction').textContent;
  assert(auctionLabel === 'Auction 2066', `card shows auction ("${auctionLabel}")`);
}

console.log('Test 2: group-by="auction" renders the RSS-style view');
{
  document.body.innerHTML = '';
  const app = document.createElement('ebidlocal-watchlist');
  document.body.appendChild(app);
  const feedEl = app.shadowRoot.querySelector('watchlist-feed');
  feedEl.setAttribute('group-by', 'auction');
  app.emit('watchlist:data', feed);

  const entries = feedEl.shadowRoot.querySelectorAll('auction-entry');
  assert(entries.length === 2, `2 auction entries rendered (got ${entries.length})`);
  const cards = entries[0].shadowRoot.querySelectorAll('lot-card');
  assert(cards.length === 2, `first entry has 2 lot cards (got ${cards.length})`);
}

console.log('Test 3: filter narrows categories and auto-expands matches');
{
  document.body.innerHTML = '';
  const app = document.createElement('ebidlocal-watchlist');
  document.body.appendChild(app);
  app.emit('watchlist:data', feed);

  const feedEl = app.shadowRoot.querySelector('watchlist-feed');
  const filterBar = app.shadowRoot.querySelector('filter-bar');
  filterBar.emit('watchlist:filter', { query: 'sega' });

  const entries = [...feedEl.shadowRoot.querySelectorAll('category-entry')];
  const retro = entries.find((e) => e.shadowRoot.querySelector('.title').textContent === 'Retro');
  const music = entries.find((e) => e.shadowRoot.querySelector('.title').textContent === 'Music');
  assert(retro.hidden === false, 'Retro visible (has sega lot)');
  assert(retro.shadowRoot.querySelector('details').open === true, 'Retro auto-expanded');
  assert(music.hidden === true, 'Music hidden (no sega lot)');

  filterBar.emit('watchlist:filter', { query: '' });
  assert(music.hidden === false, 'Music visible again after clear');
  assert(retro.shadowRoot.querySelector('details').open === true,
    'Retro stays as the user left it after clear (no forced collapse)');
}

console.log('Test 4: event-source scoping');
{
  document.body.innerHTML = '<div id="scope-a"></div><div id="scope-b"></div>';
  const appA = document.createElement('ebidlocal-watchlist');
  const appB = document.createElement('ebidlocal-watchlist');
  document.getElementById('scope-a').appendChild(appA);
  document.getElementById('scope-b').appendChild(appB);

  appA.emit('watchlist:data', feed);
  const entriesA = appA.shadowRoot.querySelector('watchlist-feed')
    .shadowRoot.querySelectorAll('category-entry');
  const entriesB = appB.shadowRoot.querySelector('watchlist-feed')
    .shadowRoot.querySelectorAll('category-entry');
  assert(entriesA.length === 3, 'appA feed rendered');
  assert(entriesB.length === 0, 'appB feed unaffected (scoped)');
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
