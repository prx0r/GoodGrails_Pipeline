import fs from 'fs';
const catalogue = JSON.parse(fs.readFileSync('./src/data/catalogue.json','utf8'));
const curated = JSON.parse(fs.readFileSync('./exports-descriptions/isbn-curated.json','utf8'));
const byCur = Object.fromEntries(curated.map(c=>[c.sku,c]));
function csvEscape(v){const s=v==null?'':String(v);return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
function firstSentence(t=''){if(!t)return'';const m=t.match(/^(.+?[.!?])\s/);return((m?m[1]:t).slice(0,300)).trim();}
function escapeHtml(s=''){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// 1. VERIFY sheet pre-filled
const verifyRows = catalogue.books.map(b=>{
  const c = byCur[b.sku]||{};
  return [
    b.sku, b.title,
    c.author || b.author || '',
    c.isbn || b.isbn || '',
    c.binding || b.binding || '',
    c.condition || '', // Actual condition pre-filled per owner defaults
    '', // jacket
    '', // edition ok
    '', // photos done
    `${c.isbnSource||''} ${c.isbnConfidence||''}${c.photoNote?' | '+c.photoNote:''}`.trim()
  ];
});
fs.writeFileSync('./exports-descriptions/VERIFY-batch-filled.csv',
  [['SKU','Title','Author_CONFIRM','ISBN_CONFIRM','Binding_CONFIRM','Condition_prefilled','Jacket_FILL','Edition_OK_FILL','Photos_DONE_FILL','Source_note'],...verifyRows].map(r=>r.map(csvEscape).join(',')).join('\r\n'));

// 2. Full descriptions v3 with conditions + most-likely ISBNs
const drafts = catalogue.books.map(b=>{
  const c = byCur[b.sku]||{};
  const priceMinor = b.price?.balanced_minor ?? null;
  const price = priceMinor?`£${(priceMinor/100).toFixed(2)}`:'';
  const author = c.author || b.author || '[Author — confirm from title page]';
  const isbn = c.isbn || b.isbn || '[ISBN — confirm from copyright page]';
  const isbnFlag = (!c.isbn && !b.isbn) || c.isbnConfidence==='low-confirm' || c.isbnConfidence==='medium' || c.isbnConfidence==='missing' ? ' (VERIFY)' : '';
  const binding = c.binding || b.binding || '[Binding — confirm]';
  const cond = c.condition || 'Very Good';
  const desc = [
    `${b.title} — ${author}.`,
    `Actual copy: ${binding}. ISBN on copy: ${isbn}${isbnFlag}.`,
    `Condition: ${cond}.${b.sku==='BOOK-002'?' Cover creasing visible in photo — priced accordingly.':''}${b.sku==='BOOK-064'?' Signed copy — verify signature; sold as Acceptable.':''} See actual-copy photos before purchase.`,
    b.notes?`Note: ${firstSentence(b.notes)}`:null,
    `Ref: ${b.sku}.${price?` Asking: ${price}.`:''}`,
    `One copy = one listing. Withdrawn if sold elsewhere.`
  ].filter(Boolean).join('\n\n');
  const ebayTitle = [author.replace(/\(ed\.\)/,'').trim(), b.title, binding.replace(/\(.*\)/,'').trim(), cond].filter(Boolean).join(' ').replace(/\s+/g,' ').slice(0,80);
  const amazonNote = [`Condition: ${cond}.`, `Binding: ${binding}.`, b.notes?firstSentence(b.notes):'', `Actual copy photographed.`].filter(Boolean).join(' ').slice(0,500);
  const ebayHtml = [
    `<h3>${escapeHtml(b.title)} — ${escapeHtml(author)}</h3>`,
    `<p><strong>Actual copy:</strong> ${escapeHtml(binding)} | ISBN: ${escapeHtml(isbn)}${escapeHtml(isbnFlag)} | Ref ${escapeHtml(b.sku)}</p>`,
    `<p><strong>Condition: ${escapeHtml(cond)}</strong>${b.sku==='BOOK-064'?' — signed copy, verify signature':''}${b.sku==='BOOK-002'?' — cover creasing as photographed':''}.</p>`,
    b.notes?`<p><em>Note:</em> ${escapeHtml(firstSentence(b.notes))}</p>`:'',
    `<h4>Photos</h4><p>[ADD: front / back / spine / title / copyright / defects]</p>`,
    `<h4>Shipping & returns</h4><p>Tracked UK post. 30-day returns if not as described.</p>`
  ].join('\n');
  return { sku:b.sku, title:b.title, author, isbn:isbn+isbnFlag, binding, condition:cond, priceMinor, price, ebayTitle, description:desc, ebayHtml, amazonConditionNote:amazonNote, source:c.isbnSource||'', confidence:c.isbnConfidence||'', photoNote:c.photoNote||'' };
});
fs.writeFileSync('./exports-descriptions/descriptions-v3.json', JSON.stringify(drafts,null,2));
const ebayRows = drafts.map(d=>[d.sku,d.ebayTitle,d.priceMinor?(d.priceMinor/100).toFixed(2):'',1,d.binding,d.isbn,d.description,d.ebayHtml]);
fs.writeFileSync('./exports-descriptions/ebay-v3.csv', [['SKU','eBay Title','Price GBP','Qty','Binding','ISBN','Description','HTML'],...ebayRows].map(r=>r.map(csvEscape).join(',')).join('\r\n'));
const amzRows = drafts.map(d=>[d.sku,d.isbn,d.title,d.condition,d.amazonConditionNote,d.priceMinor?(d.priceMinor/100).toFixed(2):'',1,'Create offer manually']);
fs.writeFileSync('./exports-descriptions/amazon-v3.csv', [['SKU','ASIN/ISBN','Title','Condition','Condition Note','Price GBP','Qty','Action'],...amzRows].map(r=>r.map(csvEscape).join(',')).join('\r\n'));
let md = `# GoodGrails v3 — 64 complete drafts with most-likely ISBN + conditions\n\n> Conditions pre-filled per owner (default Very Good, BOOK-002 Good-creased, BOOK-064 Acceptable-signed). ISBNs = price-research-assumed > OL > manual. **You confirm** — see VERIFY-batch-filled.csv.\n> Siva Sutras pictured is EXCLUDED (owner does not have it). Pre-ISBN titles (Dillon 1957, PTS 1979, Taylor, Scriven) left blank intentionally.\n\n## Photo-verified fixes (24 authors, bindings)\n\n`;
for (const c of curated.filter(c=>c.photoNote)) md+=`- ${c.sku} ${c.title.slice(0,50)} — ${c.photoNote}\n`;
md += `\n## Pictured but NOT in 64 (personal library — NOT listed unless you say so)\n\n- Siva Sutras — EXCLUDED per owner (do not have)\n- Tantrasara of Abhinavagupta, Ascent to Truth (Merton), Islands of Truth (Peterson), Chaos (Gleick), Tertium Organum, Faber Book of Science, Sapiens, Being You, etc.\n\n---\n\n`;
for (const d of drafts) {
  md += `## ${d.sku} — ${d.title}\n\nAuthor: ${d.author} | ISBN: ${d.isbn} [${d.source}/${d.confidence}] | ${d.binding} | Cond: ${d.condition} | ${d.price}\n\n**eBay:** ${d.ebayTitle}\n\n${d.description}\n\n**Amazon note:** ${d.amazonConditionNote}\n\n---\n\n`;
}
fs.writeFileSync('./exports-descriptions/DESCRIPTIONS-v3.md', md);
console.log(`v3 done: ${drafts.length} drafts, VERIFY-batch-filled.csv + ebay-v3/amazon-v3 ready`);
