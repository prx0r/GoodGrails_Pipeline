import fs from 'fs';
import path from 'path';

const catalogue = JSON.parse(fs.readFileSync('./src/data/catalogue.json','utf8'));
const books = catalogue.books;

function firstSentence(text='') {
  if (!text) return '';
  const m = text.match(/^(.+?[.!?])\s/);
  return ((m ? m[1] : text).slice(0,300)).trim();
}
function extractAssumed(b) {
  const parts = [];
  parts.push(b.notes || '');
  parts.push((b.price||{}).rationale || '');
  for (const e of (b.evidence||[])) {
    parts.push(e.notes||''); parts.push(e.condition||''); parts.push(e.edition_match||'');
  }
  const txt = parts.join(' ');
  const low = txt.toLowerCase();
  const isbnM = txt.match(/97[89]\d{10}|\d{9}[\dXx]/g) || [];
  // dedupe, keep 13-digit preferentially
  const isbns = [...new Set(isbnM.map(s=>s.replace(/[^0-9X]/gi,'')))].filter(s=>[10,13].includes(s.length));
  let bindingHint = '';
  if (/hardcover|hardback|\bhb\b/i.test(txt)) bindingHint = 'Hardcover (assumed — verify)';
  else if (/paperback|\bpb\b|softcover/i.test(txt)) bindingHint = 'Paperback (assumed — verify)';
  // publisher/year hints: look for "1996 SPCK", "2001 Routledge", etc.
  const pubM = txt.match(/(19|20)\d{2}\s+[A-Z][a-zA-Z& ]{2,30}/g) || [];
  return { isbns, bindingHint, pubHints: pubM.slice(0,2) };
}

async function enrichOL(title, existingAuthor) {
  const q = encodeURIComponent(title);
  const url = `https://openlibrary.org/search.json?title=${q}&limit=1`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'GoodGrails/1.0' } });
    if (!res.ok) return null;
    const d = await res.json();
    const doc = d.docs?.[0];
    if (!doc) return null;
    return {
      olTitle: doc.title,
      olAuthor: (doc.author_name||[]).slice(0,2).join(', '),
      olYear: doc.first_publish_year,
      olPublisher: (doc.publisher||[]).slice(0,2).join('; '),
      olIsbn: (doc.isbn||[]).slice(0,1)
    };
  } catch { return null; }
}

function csvEscape(v){const s=v==null?'':String(v);return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
function escapeHtml(s=''){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

const enriched = [];
for (let i=0;i<books.length;i++) {
  const b = books[i];
  const assumed = extractAssumed(b);
  let ol = null;
  // only lookup if missing author/isbn to save time, but do all for completeness in batches
  try {
    ol = await enrichOL(b.title, b.author);
  } catch {}
  enriched.push({ b, assumed, ol });
  process.stdout.write(`\r${i+1}/${books.length} ${b.sku}`);
  await new Promise(r=>setTimeout(r, 900));
}
console.log('\nEnrichment done');
fs.writeFileSync('./exports-descriptions/enrichment-cache.json', JSON.stringify(enriched.map(e=>({sku:e.b.sku,title:e.b.title,assumed:e.assumed,ol:e.ol})),null,2));

// Build drafts v2
function buildV2({b, assumed, ol}) {
  const priceMinor = b.price?.balanced_minor ?? null;
  const price = priceMinor ? `£${(priceMinor/100).toFixed(2)}` : '';
  const author = b.author || ol?.olAuthor || '[Author — confirm from title page]';
  const isbnDisplay = b.isbn || assumed.isbns[0] || ol?.olIsbn?.[0] || '[ISBN — confirm from copyright page]';
  const isbnIsAssumed = !b.isbn;
  const bindingDisplay = b.binding || assumed.bindingHint || '[Binding — confirm hardcover/paperback]';
  const yearDisplay = ol?.olYear ? ` (first published ${ol.olYear})` : '';
  const publisherDisplay = ol?.olPublisher ? ` ${ol.olPublisher}.` : '';

  const biblioLine = `${b.title} — ${author}${yearDisplay}.`;
  const salesContext = b.notes ? firstSentence(b.notes) : '';
  const marketNote = (b.price?.rationale || '').slice(0,220);

  const description = [
    `${biblioLine}`,
    publisherDisplay ? `Publisher info (Open Library, verify):${publisherDisplay}` : null,
    `Actual copy: ${bindingDisplay}. ISBN on copy: ${isbnDisplay}${isbnIsAssumed?' (assumed — VERIFY)':''}.`,
    `Condition: {{CONDITION}} — to be confirmed on physical check. See actual-copy photos before purchase.`,
    salesContext ? `About this copy/market: ${salesContext}` : null,
    `Ref: ${b.sku}.${price?` Asking: ${price}.`:''}`,
    `One physical copy = one listing. If sold elsewhere this listing is withdrawn. Message with edition/condition questions.`
  ].filter(Boolean).join('\n\n');

  const ebayTitle = [b.author||ol?.olAuthor||'', b.title, b.edition||'', assumed.bindingHint?assumed.bindingHint.replace(' (assumed — verify)',''):b.binding||'', '{{COND}}'].filter(Boolean).join(' ').replace(/\s+/g,' ').slice(0,80);

  const amazonNote = [`Condition: {{CONDITION}}.`, `Binding: ${bindingDisplay}.`, salesContext, `Actual copy photographed.`].filter(Boolean).join(' ').slice(0,500);

  const ebayHtml = [
    `<h3>${escapeHtml(b.title)} — ${escapeHtml(author)}</h3>`,
    `<p><strong>Actual copy:</strong> ${escapeHtml(bindingDisplay)} | ISBN: ${escapeHtml(isbnDisplay)}${isbnIsAssumed?' (to be verified)':''} | Ref ${escapeHtml(b.sku)}</p>`,
    `<p><strong>Condition: {{CONDITION}}</strong> — confirmed on physical check. Photos show the actual copy.</p>`,
    salesContext?`<p><em>Note:</em> ${escapeHtml(salesContext)}</p>`:'',
    marketNote?`<p><small>Market context: ${escapeHtml(marketNote)}</small></p>`:'',
    `<h4>Photos</h4><p>[ADD: front / back / spine / title page / copyright page / defects]</p>`,
    `<h4>Shipping & returns</h4><p>Tracked UK post, well-packed. International on request. 30-day returns if not as described.</p>`
  ].filter(Boolean).join('\n');

  return {
    sku: b.sku, title: b.title, author, isbnDisplay, isbnIsAssumed,
    bindingDisplay, olYear: ol?.olYear||null, olPublisher: ol?.olPublisher||'',
    priceMinor, price,
    ebayTitle, description, ebayHtml, amazonConditionNote: amazonNote,
    checklist: [
      b.condition?'':'Fill CONDITION (batch verification sheet)',
      isbnIsAssumed?'Confirm ISBN/binding on physical copy':'',
      !b.author&&!ol?.olAuthor?'Confirm author from title page':'',
      'Add 6 photos: front/back/spine/title/copyright/defects'
    ].filter(Boolean)
  };
}

const drafts = enriched.map(buildV2);
fs.writeFileSync('./exports-descriptions/descriptions-v2.json', JSON.stringify(drafts,null,2));

// eBay + Amazon sheets v2 with {{CONDITION}} placeholder
const ebayRows = drafts.map(d=>[d.sku,d.ebayTitle,d.priceMinor?(d.priceMinor/100).toFixed(2):'',1,d.bindingDisplay,d.isbnDisplay,d.description,d.ebayHtml]);
fs.writeFileSync('./exports-descriptions/ebay-v2.csv', [['SKU','eBay Title','Price GBP','Qty','Binding','ISBN','Description','HTML'],...ebayRows].map(r=>r.map(csvEscape).join(',')).join('\r\n'));
const amzRows = drafts.map(d=>[d.sku,d.isbnDisplay,d.title,'{{CONDITION}}',d.amazonConditionNote,d.priceMinor?(d.priceMinor/100).toFixed(2):'',1,'Create offer manually']);
fs.writeFileSync('./exports-descriptions/amazon-v2.csv', [['SKU','ASIN/ISBN','Title','Condition','Condition Note','Price GBP','Qty','Action'],...amzRows].map(r=>r.map(csvEscape).join(',')).join('\r\n'));

// Batch verification sheet — THE simple batch process
const verifyRows = enriched.map(({b, assumed, ol})=>[
  b.sku, b.title,
  b.author||ol?.olAuthor||'',
  b.isbn||assumed.isbns[0]||'',
  b.binding||assumed.bindingHint||'',
  '', // actual_condition
  '', // jacket
  '', // edition_confirmed Y/N
  '', // photos_done Y/N
  (b.price?.rationale||'').slice(0,120)
]);
fs.writeFileSync('./exports-descriptions/VERIFY-batch.csv', [['SKU','Title','Assumed Author','Assumed ISBN','Assumed Binding','Actual_Condition_FILL','Jacket_FILL','Edition_OK_FILL','Photos_DONE_FILL','Price rationale hint'],...verifyRows].map(r=>r.map(csvEscape).join(',')).join('\r\n'));

// Readable MD
let md = `# GoodGrails v2 — 64 complete drafts (condition = batch-fill)\n\n> Bibliographic enriched via Open Library + assumed ISBN/binding parsed from rationale. **{{CONDITION}} is the only batch variable left.** Fill VERIFY-batch.csv, re-run finaliser.\n\n`;
for (const d of drafts) {
  md += `---\n\n## ${d.sku} — ${d.title}\n\nAuthor: ${d.author} | ISBN: ${d.isbnDisplay}${d.isbnIsAssumed?' (VERIFY)':''} | Binding: ${d.bindingDisplay} | Price: ${d.price}\n\n**eBay title:** ${d.ebayTitle}\n\n${d.description}\n\n**Amazon note:**\n\n${d.amazonConditionNote}\n\n**To verify:** ${d.checklist.join(' / ')}\n\n`;
}
fs.writeFileSync('./exports-descriptions/DESCRIPTIONS-v2.md', md);
console.log(`v2 done: ${drafts.length} drafts, VERIFY-batch.csv ready`);
console.log('Sample BOOK-005: ' + JSON.stringify(drafts.find(d=>d.sku==='BOOK-005'), null, 2).slice(0,600));
