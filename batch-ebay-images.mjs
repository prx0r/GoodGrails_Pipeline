import fs from 'fs';
// Attach manifest image URLs to eBay draft inventory items (unpublished — free, invisible).
// Refuses nothing: every manifest entry gets attached; imageless SKUs are reported for the photo shoot.
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
const BASE = 'https://api.ebay.com';
async function token() {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${BASE}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: REFRESH,
      scope: 'https://api.ebay.com/oauth/api_scope/sell.inventory' }).toString(),
  });
  if (!res.ok) throw new Error('token: ' + res.status);
  return (await res.json()).access_token;
}
const manifest = JSON.parse(fs.readFileSync('./exports-descriptions/photo-manifest.json', 'utf8'));
const drafts = JSON.parse(fs.readFileSync('./exports-descriptions/descriptions-v3.json', 'utf8'));
const bySku = Object.fromEntries(drafts.map((d) => [d.sku, d]));
const H = (tok) => ({ Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', 'Content-Language': 'en-GB', 'Accept-Language': 'en-GB' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function condFor(d) {
  if (d.condition === 'Like New') return 'LIKE_NEW';
  if (d.condition === 'Acceptable') return 'USED_ACCEPTABLE';
  if (d.condition === 'Good') return 'USED_GOOD';
  return 'USED_VERY_GOOD';
}
const tok = await token();
let ok = 0;
for (const [sku, m] of Object.entries(manifest)) {
  const d = bySku[sku];
  if (!d) continue;
  const res = await fetch(`${BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
    method: 'PUT', headers: H(tok),
    body: JSON.stringify({
      product: { title: d.ebayTitle.slice(0, 80), description: d.description, imageUrls: m.urls },
      condition: condFor(d),
      availability: { shipToLocationAvailability: { quantity: 1 } },
    }),
  });
  if (res.ok) ok++;
  else console.log(sku, 'ERR', res.status, (await res.text()).slice(0, 150));
  await sleep(300);
}
const imageless = drafts.map((d) => d.sku).filter((s) => !manifest[s]);
fs.writeFileSync('./exports-descriptions/photo-status.json', JSON.stringify({ attached: ok, imageless }, null, 1));
console.log(`Images attached: ${ok}/${Object.keys(manifest).length}. Imageless (${imageless.length}): ${imageless.join(', ')}`);
