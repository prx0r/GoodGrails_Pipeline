import fs from 'fs';
// ISBN review sheet: default pick + 3 alternatives per book for owner selection.
const v3 = JSON.parse(fs.readFileSync('./exports-descriptions/descriptions-v3.json', 'utf8'));
const cache = JSON.parse(fs.readFileSync('./exports-descriptions/isbn-cache.json', 'utf8'));
const curated = JSON.parse(fs.readFileSync('./exports-descriptions/isbn-curated.json', 'utf8'));
const byCur = Object.fromEntries(curated.map(c => [c.sku, c]));
let covers = {};
try { covers = JSON.parse(fs.readFileSync('./exports-descriptions/stock-covers.json', 'utf8')); } catch {}
const SPOTTED = new Set(['BOOK-001','BOOK-002','BOOK-003','BOOK-005','BOOK-006','BOOK-008','BOOK-009','BOOK-014','BOOK-015','BOOK-018','BOOK-019','BOOK-020','BOOK-022','BOOK-023','BOOK-025','BOOK-028','BOOK-029','BOOK-034','BOOK-035','BOOK-040','BOOK-041','BOOK-044','BOOK-046','BOOK-047','BOOK-049','BOOK-051','BOOK-052','BOOK-053','BOOK-058','BOOK-059','BOOK-060','BOOK-062','BOOK-064']);
// Verified edition alternates (web-researched)
const MANUAL_ALTS = {
  'BOOK-001': [
    ['9780281047178', 'SPCK 1996 (Tom Wright imprint — likely your blue HB)'],
    ['9780800630898', 'Fortress 1997 hardcover (US)'],
    ['9780800626822', 'Fortress 1997 paperback (US)'],
  ],
  'BOOK-003': [
    ['9781847062734', 'Continuum 2008 paperback (default — softback confirmed)'],
    ['9780826448477', 'Continuum 2005 hardcover (if yours is actually HB)'],
    ['9781441122780', 'Bloomsbury 2008 reprint'],
  ],
  'BOOK-049': [
    ['9780886950446', 'Concord Grove 1986 lexhide w/ Udanavarga (default — blue/gold gorgeous)'],
    ['9780911500394', 'Theosophical Univ Press hardcover (alt)'],
    ['9781681722733', 'Pariyatti pocket paperback (cheap alt — NOT yours)'],
  ],
};
function cleanIsbn(s) { return (s || '').replace(/[^0-9X]/gi, ''); }
function csvEsc(v) { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function esc(s = '') { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

const rows = v3.map(d => {
  const c = byCur[d.sku] || {};
  const defRaw = cleanIsbn((c.isbn || '').split(' ')[0]);
  const seen = new Set([defRaw]);
  const alts = [];
  const pushAlt = (isbn, label) => {
    isbn = cleanIsbn(isbn);
    if (!isbn || seen.has(isbn)) return;
    if (![10, 13].includes(isbn.length)) return;
    seen.add(isbn);
    alts.push([isbn, label]);
  };
  for (const [isbn, label] of (MANUAL_ALTS[d.sku] || [])) {
    if (cleanIsbn(isbn) === defRaw) continue;
    pushAlt(isbn, label);
  }
  const ch = cache[d.sku];
  if (ch) {
    for (const a of (ch.assumed || [])) pushAlt(a, 'price-research assumed');
    for (const cand of (ch.candidates || [])) {
      for (const isbn of (cand.isbns || [])) {
        pushAlt(isbn, `${cand.author || '?'} ${cand.year || ''}`.trim());
        if (alts.length >= 3) break;
      }
      if (alts.length >= 3) break;
    }
  }
  while (alts.length < 3) alts.push(['', '—']);
  const photo = covers[d.sku] ? 'stock cover' : (SPOTTED.has(d.sku) ? 'spine photo' : 'none yet');
  return {
    sku: d.sku, title: d.title, author: d.author, binding: d.binding, condition: d.condition,
    price: d.price, def: defRaw || '[none — title page check]',
    defSrc: c.isbnSource || '', photo,
    alt1: alts[0][0], alt1note: alts[0][1], alt2: alts[1][0], alt2note: alts[1][1], alt3: alts[2][0], alt3note: alts[2][1],
  };
});
fs.writeFileSync('./exports-descriptions/ISBN-REVIEW.csv',
  [['SKU','Title','Author','Binding','Condition','Price','Default ISBN','Default source','Photos','Alt 1','Alt 1 note','Alt 2','Alt 2 note','Alt 3','Alt 3 note','YOUR PICK (fill)'],
   ...rows.map(r => [r.sku, r.title, r.author, r.binding, r.condition, r.price, r.def, r.defSrc, r.photo, r.alt1, r.alt1note, r.alt2, r.alt2note, r.alt3, r.alt3note, ''])].map(r => r.map(csvEsc).join(',')).join('\r\n'));

let html = '';
for (const r of rows) {
  const opt = (isbn, note, tag) => isbn
    ? `<li><strong>${tag}:</strong> <code>${esc(isbn)}</code> <span style="color:#555">${esc(note)}</span></li>`
    : '';
  html += `<section style="border:1px solid #ccc;margin:16px;padding:16px;max-width:760px;font-family:sans-serif">
    <div style="font-size:12px;color:#666">${r.sku} | ${esc(r.condition)} | ${r.price} | photos: ${r.photo}</div>
    <h2 style="margin:6px 0">${esc(r.title)}</h2>
    <div style="color:#333;margin-bottom:8px">${esc(r.author)} — ${esc(r.binding)}</div>
    <ul><li><strong>DEFAULT:</strong> <code>${esc(r.def)}</code> <span style="color:#555">${esc(r.defSrc)}</span></li>
    ${opt(r.alt1, r.alt1note, 'ALT 1')}${opt(r.alt2, r.alt2note, 'ALT 2')}${opt(r.alt3, r.alt3note, 'ALT 3')}</ul>
    <div style="color:#888">Reply with e.g. <code>${r.sku}: alt2</code> to change, or nothing to keep default.</div>
  </section>`;
}
fs.writeFileSync('./exports-descriptions/ISBN-REVIEW.html',
  `<!doctype html><html><head><meta charset="utf8"><title>ISBN review — pick one per book (${rows.length})</title></head><body style="background:#f5f5f5">` +
  `<h1 style="font-family:sans-serif">ISBN review — ${rows.length} books. Reply "<code>SKU: altN</code>" to change, silence keeps default.</h1>` + html + `</body></html>`);
console.log(`Review sheet done: ${rows.length} books`);
