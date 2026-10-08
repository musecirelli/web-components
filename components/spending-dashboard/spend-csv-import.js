/**
 * <spend-csv-import> — drag-and-drop / file picker for new statement CSVs.
 * Parses client-side with the same rules.js the Python pipeline uses,
 * dedupes against already-loaded transactions, and emits:
 *   spend:imported { added: [...], skipped: n }
 * The dashboard merges and persists the result.
 *
 * Accepted columns (case-insensitive): Date, Description, Debit, Credit
 * (Chase-style exports), or Date, Description, Amount.
 */
import { WebComponent } from '../../shared/component-base.js';
import { normalizeMerchant, categorizeTransaction } from './rules.js';
import { CARD_CSS } from './spend-utils.js';

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

function toISO(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let y = +m[3]; if (y < 100) y += 2000;
    return `${y}-${String(+m[1]).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return s.slice(0, 10);
  return null;
}

function num(s) {
  const v = parseFloat(String(s || '').replace(/[$,]/g, ''));
  return Number.isFinite(v) ? v : 0;
}

function fingerprint(date, desc, debit, credit) {
  const key = `${date}|${String(desc).trim().toUpperCase()}|${debit}|${credit}`;
  let h1 = 0x811c9dc5, h2 = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h1 = Math.imul(h1 ^ key.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 ^ key.charCodeAt(key.length - 1 - i), 16777619);
  }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}

export class SpendCsvImport extends WebComponent {
  #existingIds = new Set();

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        ${CARD_CSS}
        .drop {
          border: 2px dashed var(--spend-border, #e5e7eb); border-radius: 10px;
          padding: 22px; text-align: center; font-size: 14px;
          color: var(--spend-muted, #6b7280); cursor: pointer;
        }
        .drop.over { border-color: var(--spend-accent, #4e79a7); background: var(--spend-bg, #f3f4f6); }
        .drop input { display: none; }
        .msg { font-size: 13px; margin-top: 10px; }
        .msg.ok { color: #15803d; }
        .msg.err { color: #b91c1c; }
      </style>
      <div class="card">
        <h3>Add statements</h3>
        <div class="drop" role="button" tabindex="0" aria-label="Upload statement CSV files">
          <input type="file" accept=".csv,text/csv" multiple>
          Drop new statement CSVs here, or click to choose.<br>
          Duplicates are detected and skipped automatically.
        </div>
        <div class="msg" aria-live="polite"></div>
      </div>`;

    this.on('spend:data', (e) => {
      this.#existingIds = new Set((e.detail.all || []).map((t) => t.id));
    });

    const drop = this.shadowRoot.querySelector('.drop');
    const input = this.shadowRoot.querySelector('input');
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') input.click(); });
    ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => {
      e.preventDefault(); drop.classList.add('over');
    }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => {
      e.preventDefault(); drop.classList.remove('over');
    }));
    drop.addEventListener('drop', (e) => this.#handle(e.dataTransfer.files));
    input.addEventListener('change', () => { this.#handle(input.files); input.value = ''; });
  }

  async #handle(files) {
    const msg = this.shadowRoot.querySelector('.msg');
    const added = [];
    let skipped = 0, errors = 0;
    for (const f of files) {
      try {
        const text = await f.text();
        const { txns, dupes } = this.#ingest(text);
        added.push(...txns);
        skipped += dupes;
      } catch (err) {
        console.error('[spend-csv-import]', err);
        errors++;
      }
    }
    if (added.length) this.emit('spend:imported', { added, skipped });
    msg.className = 'msg ' + (errors ? 'err' : 'ok');
    msg.textContent = errors && !added.length
      ? `Couldn't parse ${errors} file(s). Expected Date, Description, Debit, Credit columns.`
      : `Imported ${added.length} new transaction${added.length === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : ''}.`;
  }

  #ingest(text) {
    const rows = parseCSV(text.replace(/^\uFEFF/, ''));
    if (rows.length < 2) throw new Error('empty csv');
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (names) => {
      for (const n of names) {
        const i = header.findIndex((h) => h === n || h.includes(n));
        if (i !== -1) return i;
      }
      return -1;
    };
    const iDate = col(['date']), iDesc = col(['description', 'merchant', 'payee', 'name']);
    const iDebit = col(['debit']), iCredit = col(['credit']), iAmt = col(['amount']);
    if (iDate === -1 || iDesc === -1 || (iAmt === -1 && (iDebit === -1 || iCredit === -1))) {
      throw new Error('unrecognized columns');
    }
    const txns = [];
    let dupes = 0;
    for (const r of rows.slice(1)) {
      const date = toISO(r[iDate]);
      const desc = (r[iDesc] || '').trim();
      if (!date || !desc) continue;
      const debit = iDebit === -1 ? 0 : num(r[iDebit]);
      const credit = iCredit === -1 ? 0 : num(r[iCredit]);
      // credits in these exports are already negative; tolerate positive ones too
      const creditSigned = credit > 0 && iAmt === -1 ? -credit : credit;
      const amount = iAmt === -1
        ? Math.round((debit + creditSigned) * 100) / 100
        : Math.round(num(r[iAmt]) * 100) / 100;
      const id = fingerprint(r[iDate], desc, r[iDebit] || '', r[iCredit] || '');
      if (this.#existingIds.has(id)) { dupes++; continue; }
      this.#existingIds.add(id);
      const merchant = normalizeMerchant(desc);
      const { category, subcategory } = categorizeTransaction(merchant, desc);
      txns.push({ id, date, merchant_raw: desc, merchant, amount,
                  debit, credit: creditSigned, category, subcategory,
                  status: 'Cleared', member: '', sources: ['user-upload'] });
    }
    return { txns, dupes };
  }
}

customElements.define('spend-csv-import', SpendCsvImport);
