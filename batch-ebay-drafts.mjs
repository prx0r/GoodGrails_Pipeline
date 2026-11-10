import fs from 'fs';
// Full batch DRAFTS: putInventoryItem + createOffer (UNPUBLISHED, invisible) for every SKU.
// Reads secrets from .env (gitignored). Usage: node batch-ebay-drafts.mjs
function loadEnv(p) {
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^#?\s*([A-Z0-9_]+)=(.*)$/);
    if (m && m[1] !== 'EBAY_DEV_ID') out[m[1]] = m[2];
  }
  return out;
}
const env = loadEnv('./.env');
const CLIENT_ID = env.EBAY_PROD_CLIENT_ID;
const CLIENT_SECRET = env.EBAY_PROD_CLIENT_SECRET;
const REFRESH = env.EBAY_PROD_REFRESH_TOKEN;
const FULFILLMENT = env.EBAY_FULFILLMENT_POLICY_ID;
const PAYMENT = env.EBAY_PAYMENT_POLICY_ID;
const RETURN = env.EBAY_RETURN_POLICY_ID;
if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH) throw new Error('Missing eBay prod creds in .env');
const BASE = 'https://api.ebay.com';

async function token() {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${BASE}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: REFRESH,
      scope: 'https://api.ebay.com/oauth/api_scope/sell.inventory' }).toString(),
  });
  if (!res.ok) throw new Error('token: ' + res.status + ' ' + (await res.text()).slice(0, 200));
  return (await res.json()).access_token;
}

function condFor(d) {
  if (d.condition === 'Like New') return 'LIKE_NEW';
  if (d.condition === 'Acceptable') return 'USED_ACCEPTABLE';
  if (d.condition === 'Good') return 'USED_GOOD';
  return 'USED_VERY_GOOD';
}

const drafts = JSON.parse(fs.readFileSync('./exports-descriptions/descriptions-v3.json', 'utf8'));
const H = (tok) => ({ Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', 'Content-Language': 'en-GB', 'Accept-Language': 'en-GB' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tok = await token();
const results = [];
for (const d of drafts) {
  const price = (d.priceMinor / 100).toFixed(2);
  const row = { sku: d.sku, price };
  try {
    let res = await fetch(`${BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(d.sku)}`, {
      method: 'PUT', headers: H(tok),
      body: JSON.stringify({
        product: { title: d.ebayTitle.slice(0, 80), description: d.description },
        condition: condFor(d),
        availability: { shipToLocationAvailability: { quantity: 1 } },
      }),
    });
    row.inventory = res.status;
    if (!res.ok) row.invErr = (await res.text()).slice(0, 200);
    await sleep(400);
    res = await fetch(`${BASE}/sell/inventory/v1/offer`, {
      method: 'POST', headers: H(tok),
      body: JSON.stringify({
        sku: d.sku, marketplaceId: 'EBAY_GB', format: 'FIXED_PRICE', availableQuantity: 1,
        categoryId: '261186', listingDescription: d.ebayHtml || d.description,
        fulfillmentPolicyId: FULFILLMENT, paymentPolicyId: PAYMENT, returnPolicyId: RETURN,
        pricingSummary: { price: { value: price, currency: 'GBP' } },
      }),
    });
    const txt = await res.text();
    row.offer = res.status;
    if (res.ok) { try { row.offerId = JSON.parse(txt).offerId; } catch {} }
    else row.offerErr = txt.slice(0, 300);
  } catch (e) {
    row.error = String(e).slice(0, 200);
  }
  results.push(row);
  console.log(row.sku, 'inv:', row.inventory, 'offer:', row.offer, row.offerId || row.offerErr || '');
  await sleep(400);
}
fs.writeFileSync('./exports-descriptions/ebay-draft-offers.json', JSON.stringify(results, null, 2));
const ok = results.filter((r) => r.offerId).length;
console.log(`\nDone: ${ok}/${results.length} draft offers staged (UNPUBLISHED, invisible). IDs in exports-descriptions/ebay-draft-offers.json`);
