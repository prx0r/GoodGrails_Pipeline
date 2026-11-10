import fs from 'fs';
// Pilot batch: putInventoryItem + createOffer (UNPUBLISHED) for 2 photo-confirmed SKUs.
// Reads secrets from .env (gitignored). Usage: node batch-ebay-pilot.mjs
function loadEnv(p) {
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^#?\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !line.startsWith('# EBAY_DEV_ID')) out[m[1]] = m[2];
  }
  return out;
}
const env = loadEnv('./.env');
const CLIENT_ID = env.EBAY_PROD_CLIENT_ID || process.env.EBAY_PROD_CLIENT_ID;
const CLIENT_SECRET = env.EBAY_PROD_CLIENT_SECRET || process.env.EBAY_PROD_CLIENT_SECRET;
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

const drafts = JSON.parse(fs.readFileSync('./exports-descriptions/descriptions-v3.json', 'utf8'));
const bySku = Object.fromEntries(drafts.map(d => [d.sku, d]));
const PILOT = ['BOOK-035', 'BOOK-049'];

const tok = await token();
for (const sku of PILOT) {
  const d = bySku[sku];
  const price = (d.priceMinor / 100).toFixed(2);
  // 1. inventory item (no photos yet — added after R2 shoot)
  const cond = d.condition === 'Like New' ? 'LIKE_NEW' : d.condition === 'Acceptable' ? 'USED_ACCEPTABLE' : d.condition === 'Good' ? 'USED_GOOD' : 'USED_VERY_GOOD';
  let res = await fetch(`${BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', 'Content-Language': 'en-GB', 'Accept-Language': 'en-GB' },
    body: JSON.stringify({
      product: { title: d.ebayTitle.slice(0, 80), description: d.description },
      condition: cond,
      availability: { shipToLocationAvailability: { quantity: 1 } },
    }),
  });
  console.log(sku, 'inventory:', res.status, res.ok ? 'OK' : (await res.text()).slice(0, 200));
  // 2. offer (unpublished)
  res = await fetch(`${BASE}/sell/inventory/v1/offer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', 'Content-Language': 'en-GB', 'Accept-Language': 'en-GB' },
    body: JSON.stringify({
      sku, marketplaceId: 'EBAY_GB', format: 'FIXED_PRICE', availableQuantity: 1,
      categoryId: '261186', listingDescription: d.ebayHtml || d.description,
      fulfillmentPolicyId: FULFILLMENT, paymentPolicyId: PAYMENT, returnPolicyId: RETURN,
      pricingSummary: { price: { value: price, currency: 'GBP' } },
    }),
  });
  const txt = await res.text();
  console.log(sku, 'offer:', res.status, res.ok ? txt.slice(0, 200) : txt.slice(0, 400));
}
console.log('Pilot done — offers UNPUBLISHED. Publish only on explicit go-ahead.');
