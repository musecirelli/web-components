/**
 * Functional test for ebidlocal-watchlist components.
 * Run: node --experimental-vm-modules test.mjs (or plain node with jsdom)
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
      ],
    },
  ],
};

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); }
  else { console.log(`  FAIL: ${msg}`); failures++; }
}

console.log('Test 1: app renders feed from watchlist:data event');
{
  document.body.innerHTML = '';
  const app = document.createElement('ebidlocal-watchlist');
  document.body.appendChild(app);
  // Simulate what _load() does after fetch (skip network).
  app.emit('watchlist:data', feed);

  const feedEl = app.shadowRoot.querySelector('watchlist-feed');
  assert(!!feedEl, 'watchlist-feed exists in app shadow DOM');
  const entries = feedEl.shadowRoot.querySelectorAll('auction-entry');
  assert(entries.length === 2, `2 auction entries rendered (got ${entries.length})`);
  const cards = feedEl.shadowRoot.querySelectorAll('auction-entry')[0]
    .shadowRoot.querySelectorAll('lot-card');
  assert(cards.length === 2, `first entry has 2 lot cards (got ${cards.length})`);
  const title = cards[0].shadowRoot.querySelector('.lot').textContent;
  assert(title === 'Sega Game Gear', `lot title rendered ("${title}")`);
  const bid = cards[0].shadowRoot.querySelector('.bid').textContent;
  assert(bid === '$25', `bid formatted ("${bid}")`);
}

console.log('Test 2: filter-bar filters entries via events');
{
  document.body.innerHTML = '';
  const app = document.createElement('ebidlocal-watchlist');
  document.body.appendChild(app);
  app.emit('watchlist:data', feed);

  const feedEl = app.shadowRoot.querySelector('watchlist-feed');
  const filterBar = app.shadowRoot.querySelector('filter-bar');

  // Simulate a filter event as the filter bar would emit (bypasses debounce).
  filterBar.emit('watchlist:filter', { query: 'sega' });
  // Feed forwards synchronously; entries filter synchronously.
  const entries = [...feedEl.shadowRoot.querySelectorAll('auction-entry')];
  assert(entries[0].hidden === false, 'auction 1 visible (has sega lot)');
  assert(entries[1].hidden === true, 'auction 2 hidden (no sega lot)');
  const cards = [...entries[0].shadowRoot.querySelectorAll('lot-card')];
  assert(cards[0].hidden === false, 'sega card visible');
  assert(cards[1].hidden === true, 'coffee card hidden');

  // Clear filter.
  filterBar.emit('watchlist:filter', { query: '' });
  assert(entries[1].hidden === false, 'auction 2 visible again after clear');
}

console.log('Test 3: event-source scoping');
{
  document.body.innerHTML = '<div id="scope-a"></div><div id="scope-b"></div>';
  const appA = document.createElement('ebidlocal-watchlist');
  const appB = document.createElement('ebidlocal-watchlist');
  document.getElementById('scope-a').appendChild(appA);
  document.getElementById('scope-b').appendChild(appB);

  // Feed in appA listens on appA (shadow host). Emit data only on appA.
  appA.emit('watchlist:data', feed);
  const entriesA = appA.shadowRoot.querySelector('watchlist-feed')
    .shadowRoot.querySelectorAll('auction-entry');
  const entriesB = appB.shadowRoot.querySelector('watchlist-feed')
    .shadowRoot.querySelectorAll('auction-entry');
  assert(entriesA.length === 2, 'appA feed rendered');
  assert(entriesB.length === 0, 'appB feed unaffected (scoped)');
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
