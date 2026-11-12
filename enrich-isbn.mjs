import fs from 'fs';
const catalogue = JSON.parse(fs.readFileSync('./src/data/catalogue.json','utf8'));
const books = catalogue.books;

function extractAssumed(b) {
  const parts = [b.notes||'', (b.price||{}).rationale||''];
  for (const e of (b.evidence||[])) parts.push(e.notes||'');
  const txt = parts.join(' ');
  const m = txt.match(/97[89]\d{10}|\d{9}[\dXx]/g) || [];
  const isbns = [...new Set(m.map(s=>s.replace(/[^0-9X]/gi,'')))].filter(s=>[10,13].includes(s.length));
  return isbns;
}

async function olCandidates(title, author) {
  const q = encodeURIComponent(title + (author ? ' ' + author : ''));
  const url = `https://openlibrary.org/search.json?q=${q}&limit=3&fields=key,title,author_name,isbn,first_publish_year,publisher,edition_count`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'GoodGrails/1.0' } });
    if (!res.ok) return [];
    const d = await res.json();
    return (d.docs||[]).map(doc=>({
      title: doc.title,
      author: (doc.author_name||[]).slice(0,2).join(', '),
      year: doc.first_publish_year,
      publisher: (doc.publisher||[]).slice(0,2).join('; '),
      isbns: (doc.isbn||[]).filter(s=>/^\d{10}(\d{3})?$/.test(s.replace(/[^0-9]/g,''))).slice(0,3),
      editions: doc.edition_count
    }));
  } catch { return []; }
}

const cache = {};
if (fs.existsSync('./exports-descriptions/isbn-cache.json')) {
  Object.assign(cache, JSON.parse(fs.readFileSync('./exports-descriptions/isbn-cache.json','utf8')));
}

for (let i=0;i<books.length;i++) {
  const b = books[i];
  if (cache[b.sku]) { process.stdout.write(`\r${i+1}/${books.length} ${b.sku} (cached)`); continue; }
  const assumed = extractAssumed(b);
  const cands = await olCandidates(b.title, b.author||'');
  cache[b.sku] = { assumed, candidates: cands };
  process.stdout.write(`\r${i+1}/${books.length} ${b.sku}`);
  await new Promise(r=>setTimeout(r, 900));
}
fs.writeFileSync('./exports-descriptions/isbn-cache.json', JSON.stringify(cache,null,2));
console.log('\nISBN cache done');

// Build most-likely picks
const picks = books.map(b=>{
  const c = cache[b.sku]||{assumed:[],candidates:[]};
  // priority: structured isbn > assumed isbn > OL top isbn
  let pick = b.isbn || c.assumed[0] || c.candidates[0]?.isbns?.[0] || '';
  // prefer 13-digit
  if (!b.isbn && !c.assumed[0] && c.candidates[0]) {
    const thirteens = c.candidates[0].isbns.filter(s=>s.replace(/[^0-9]/g,'').length===13);
    if (thirteens[0]) pick = thirteens[0];
  }
  return { sku:b.sku, title:b.title, pick, assumed:c.assumed, topCandidate:c.candidates[0]||null };
});
fs.writeFileSync('./exports-descriptions/isbn-picks.json', JSON.stringify(picks,null,2));
console.log('Picks:');
for (const p of picks) console.log(`${p.sku} | ${p.title.slice(0,55)} | pick=${p.pick} | assumed=${p.assumed} | OL=${p.topCandidate?.isbns?.[0]} (${p.topCandidate?.author} ${p.topCandidate?.year})`);
const withPick = picks.filter(p=>p.pick).length;
console.log(`\n${withPick}/64 with ISBN pick`);
