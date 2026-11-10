import fs from 'fs';
// Static listing previews: renders every draft exactly as buyers would see it
// (title, gallery, price, condition, description) — no eBay involvement, nothing live.
const drafts = JSON.parse(fs.readFileSync('./exports-descriptions/descriptions-v3.json', 'utf8'));
let covers = {};
try { covers = JSON.parse(fs.readFileSync('./exports-descriptions/stock-covers.json', 'utf8')); } catch {}
function esc(s = '') { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
let cards = '';
for (const d of drafts) {
  const img = covers[d.sku]
    ? `<img src="${covers[d.sku]}" style="max-height:220px" alt="stock cover — replace with actual">`
    : `<div style="width:160px;height:220px;background:#eee;display:flex;align-items:center;justify-content:center;color:#888">NO PHOTO YET</div>`;
  cards += `<section style="border:1px solid #ccc;margin:16px;padding:16px;max-width:720px;font-family:sans-serif">
    <div style="font-size:12px;color:#666">${d.sku} | ${esc(d.condition)} | ${d.price} ${covers[d.sku] ? '| STOCK COVER' : '| AWAITING PHOTOS'}</div>
    <h2>${esc(d.ebayTitle)}</h2>
    <div style="display:flex;gap:16px"><div>${img}</div>
    <div><p><strong>Price:</strong> ${d.price}</p><p><strong>Binding:</strong> ${esc(d.binding)}</p><p><strong>ISBN:</strong> ${esc(d.isbn)}</p></div></div>
    <div style="white-space:pre-wrap;margin-top:12px">${esc(d.description)}</div>
  </section>`;
}
fs.writeFileSync('./exports-descriptions/PREVIEWS.html',
  `<!doctype html><html><head><meta charset="utf8"><title>GoodGrails listing previews (${drafts.length}) — NOT LIVE</title></head><body style="background:#f5f5f5">` +
  `<h1 style="font-family:sans-serif">Listing previews — ${drafts.length} drafts, nothing published</h1>` + cards + `</body></html>`);
console.log(`Previews written for ${drafts.length} drafts (stock covers: ${Object.keys(covers).length})`);
