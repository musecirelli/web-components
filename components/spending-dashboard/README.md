# spending-dashboard

Vanilla web-components spending analyzer: stat cards, a monthly/cumulative
timeline chart (canvas), a category donut (canvas), top merchants, auto
insights (biggest month, recurring-charge detection, trends), per-category
monthly budget targets, a sortable transaction table, and a client-side CSV
statement importer with duplicate detection.

No frameworks, no chart libraries — charts are hand-drawn on `<canvas>`.
Real transaction data never leaves the browser: the importer parses CSVs
locally and persists them to `localStorage`.

## Components

| Element | Role |
|---|---|
| `<spending-dashboard>` | Root shell. Owns data + filter state, fans out `spend:data`. |
| `<spend-filter-bar>` | Month range, search, category picker, card-payments toggle. Emits `spend:filter`. |
| `<spend-overview>` | Stat cards: total, count, top category, largest purchase, vs-prior-period delta. |
| `<spend-timeline>` | Monthly bars / cumulative line. Click a bar to drill into that month. |
| `<spend-category-chart>` | Donut + legend. Click to filter by category. |
| `<spend-merchant-list>` | Top merchants with bars. Click to search that merchant. |
| `<spend-sankey>` | Canvas Sankey: total → categories → merchants. Click a band to filter. |
| `<spend-insights>` | Auto observations: biggest month, concentration, recurring charges, trends. |
| `<spend-budget-tracker>` | Editable per-category monthly targets with actual-vs-target bars (localStorage). |
| `<spend-transaction-table>` | Sortable, paginated table of the filtered transactions. |
| `<spend-csv-import>` | Drag-and-drop statement CSVs → `spend:imported`. Same rules as the Python pipeline. |

## Events

- `spend:data { all, transactions, stats, filter }` — emitted by the dashboard
  on itself; every child listens (event-source scoping: parent element).
- `spend:filter { from, to, q, category, includeTransfers }` — from the filter
  bar; merged into dashboard state.
- `spend:drill { …same patch shape }` — chart/table drill-downs.
- `spend:imported { added, skipped }` — from the importer after parsing CSVs.

## Data

```js
document.querySelector('spending-dashboard').data = [
  { id: 'abc123', date: '2026-10-05', merchant: 'Costco',
    merchant_raw: 'COSTCO WHSE #1089 RICHMOND VA',
    amount: 31.26, debit: 31.26, credit: 0,
    category: 'Food & Dining', subcategory: 'Groceries',
    status: 'Cleared', member: '…', sources: ['Statement…CSV'] },
];
```

Or point `src` at a `transactions.json` feed (same shape, produced by
`~/workspace/spending/ingest.py`), or rely on `window.__SPENDING_DATA__`
(the single-file local build inlines the data that way).

## Files

- `rules.js` — merchant normalization + categorization rules, generated from
  `~/workspace/spending/rules.py` by `ingest.py`. Contains no personal data;
  safe to commit.
- `sample-data.js` — synthetic demo transactions for `demo.html`.
- `demo.html` — runnable demo (GH Pages).

## Theming

Override on the `<spending-dashboard>` element or a wrapper:

```css
spending-dashboard {
  --spend-bg: #f8fafc; --spend-card: #ffffff;
  --spend-border: #e5e7eb; --spend-muted: #6b7280;
  --spend-accent: #4e79a7;
}
```
