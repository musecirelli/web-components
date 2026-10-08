/**
 * Synthetic demo transactions for the spending-dashboard demo page.
 * Fake merchants, fake amounts — no real personal data.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MERCHANTS = [
  ['Harvest Market', 'Food & Dining', 'Groceries', 40, 180, 0.9],
  ['Blue Bottle Copy', 'Food & Dining', 'Coffee Shops', 3, 9, 0.5],
  ['Taco Libre', 'Food & Dining', 'Restaurants', 12, 60, 0.4],
  ['Noodle House', 'Food & Dining', 'Restaurants', 15, 55, 0.35],
  ['Speedway Fuel', 'Gas & Fuel', 'Gas', 25, 65, 0.55],
  ['Metro Power & Light', 'Bills & Utilities', 'Electric', 90, 160, 0.12],
  ['Clearwave Internet', 'Bills & Utilities', 'Internet', 79, 79, 0.12],
  ['StreamFlix', 'Subscriptions', 'Streaming', 15.99, 15.99, 0.12],
  ['CodeForge Pro', 'Subscriptions', 'Software', 8, 8, 0.12],
  ['Gadget Galaxy', 'Shopping', 'Electronics & Online', 20, 400, 0.12],
  ['Thread & Co', 'Shopping', 'Clothing', 25, 120, 0.15],
  ['Kids Zone Play', 'Kids & Family', 'Activities', 15, 45, 0.3],
  ['Bright Minds Tutoring', 'Education', 'Tutoring', 299, 299, 0.12],
  ['Cineplex 12', 'Entertainment', 'Movies', 18, 40, 0.25],
  ['PixelPlay Store', 'Entertainment', 'Video Games', 10, 70, 0.2],
  ['Green Thumb Nursery', 'Home', 'Lawn & Garden', 15, 90, 0.15],
  ['FixIt Hardware', 'Home', 'Improvement', 10, 150, 0.25],
  ['WellCare Clinic', 'Health & Fitness', 'Medical', 25, 120, 0.1],
  ['SafeDrive Insurance', 'Auto & Transport', 'Insurance', 110, 110, 0.12],
  ['Grand Vista Hotel', 'Travel', 'Hotels', 120, 320, 0.06],
  ['Paws & Claws Vet', 'Pets', 'Vet', 40, 180, 0.06],
];

function buildSample() {
  const rnd = mulberry32(20261007);
  const txns = [];
  let n = 0;
  const start = new Date(2025, 4, 1); // May 2025
  for (let mi = 0; mi < 18; mi++) {
    const d = new Date(start.getFullYear(), start.getMonth() + mi, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const daysIn = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    for (const [merchant, category, subcategory, lo, hi, freq] of MERCHANTS) {
      const expected = freq * 4.3;
      const count = Math.floor(expected) + (rnd() < expected % 1 ? 1 : 0);
      for (let k = 0; k < count; k++) {
        const day = 1 + Math.floor(rnd() * daysIn);
        const amount = Math.round((lo + rnd() * (hi - lo)) * 100) / 100;
        n++;
        txns.push({
          id: `demo-${n}`,
          date: `${ym}-${String(day).padStart(2, '0')}`,
          merchant,
          merchant_raw: `${merchant.toUpperCase()} #${1000 + Math.floor(rnd() * 9000)}`,
          amount,
          debit: amount,
          credit: 0,
          category,
          subcategory,
          status: 'Cleared',
          member: 'DEMO USER',
          sources: ['demo'],
        });
      }
    }
    // monthly card payment
    n++;
    txns.push({
      id: `demo-${n}`, date: `${ym}-05`, merchant: 'Payment Thank You',
      merchant_raw: 'PAYMENT THANK YOU', amount: -1800, debit: 0, credit: -1800,
      category: 'Transfers', subcategory: 'Card Payments',
      status: 'Cleared', member: 'DEMO USER', sources: ['demo'],
    });
  }
  return txns.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export const SAMPLE_TRANSACTIONS = buildSample();
