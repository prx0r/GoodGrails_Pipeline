import fs from 'fs';
import path from 'path';

const catalogue = JSON.parse(fs.readFileSync('./src/data/catalogue.json','utf8'));
const books = catalogue.books;

function firstSentence(text='') {
  if (!text) return '';
  const m = text.match(/^(.+?[.!?])\s/);
  return ((m ? m[1] : text).slice(0,300)).trim();
}
function priceLabel(minor) {
  return minor ? `£${(minor/100).toFixed(2)}` : '';
}
function buildDraft(b) {
  const priceMinor = b.price?.balanced_minor ?? b.price?.patient_minor ?? null;
  const checklist = [];
  const warnings = [];
  const verified = false; // catalogue import is unverified until physical check
  warnings.push('Bibliographic/photo verification incomplete — do not publish yet.');

  const biblio = [b.title, b.author ? `by ${b.author}` : null].filter(Boolean).join(' ');
  const physical = [];
  if (b.binding) physical.push(b.binding);
  if (b.edition) physical.push(b.edition);
  if (b.condition) physical.push(`Condition: ${b.condition}`);
  if (b.jacket_condition) physical.push(`Jacket: ${b.jacket_condition}`);
  if (b.signed) physical.push(`Signed: ${b.signed}`);

  const descLines = [
    biblio + '.',
    physical.length ? physical.join('. ') + '.' : 'Physical condition not yet verified — see photos on request.',
    b.notes ? firstSentence(b.notes) : '',
    b.isbn ? `ISBN: ${b.isbn}.` : '',
    b.sku ? `Inventory reference: ${b.sku}.` : '',
    'Photographs show the actual copy offered. Please message with any questions about edition or condition.'
  ].filter(Boolean);

  if (!b.condition) checklist.push('Record exact physical condition');
  if (!b.isbn) checklist.push('Confirm edition/ISBN on title/copyright page');
  if (!b.author) checklist.push('Confirm author from title page');
  if (!b.binding) checklist.push('Confirm binding/format');
  if (b.edition && /first/i.test(b.edition)) checklist.push('Confirm first edition vs first printing');
  checklist.push('Add front, back, spine, title/copyright page and defect photos');

  const ebayTitle = [b.author||'', b.title, b.edition||'', b.binding||'', b.condition ? b.condition.split('(')[0].trim() : ''].filter(Boolean).join(' ').replace(/\s+/g,' ').slice(0,80);

  const amazonNote = [b.condition ? `Condition: ${b.condition}.` : 'Condition as photographed.', b.jacket_condition ? `Jacket: ${b.jacket_condition}.` : '', b.notes ? firstSentence(b.notes) : '', 'Actual copy photographed; see images.'].filter(Boolean).join(' ').slice(0,500);

  // eBay HTML - paste-ready, keeps factual core separate from sales context
  const ebayHtml = [
    `<h3>${escapeHtml(biblio)}</h3>`,
    `<p>${escapeHtml(physical.length ? physical.join('. ')+'.' : 'Physical condition: to be verified from actual copy — see photos.')}</p>`,
    b.notes ? `<p><em>Catalogue note:</em> ${escapeHtml(firstSentence(b.notes))}</p>` : '',
    `<p>${b.isbn ? `ISBN: ${escapeHtml(b.isbn)}<br>` : ''}Ref: ${escapeHtml(b.sku)}<br>${priceMinor ? `Our asking price: ${priceLabel(priceMinor)}.` : ''}</p>`,
    `<h4>Actual-copy photos</h4><p>[ADD: front / back / spine / title page / copyright page / defects]</p>`,
    `<h4>Shipping & returns</h4><p>Well-packed, tracked UK post. Message for international. 30-day returns if not as described.</p>`,
    `<p><small>One physical copy = one listing. If sold elsewhere this listing will be withdrawn. Photographs show the actual copy offered.</small></p>`
  ].filter(Boolean).join('\n');

  return {
    sku: b.sku,
    title: b.title,
    author: b.author || '',
    isbn: b.isbn || '',
    priceMinor,
    priceLabel: priceLabel(priceMinor),
    ebayTitle,
    description: descLines.join('\n\n'),
    ebayHtml,
    amazonConditionNote: amazonNote,
    checklist,
    warnings,
    readiness: (!b.condition || !b.isbn || !b.author) ? 'needs-verification' : 'ready-after-photos',
    evidenceCount: (b.evidence||[]).length,
    rationale: b.price?.rationale || ''
  };
}
function escapeHtml(s='') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function csvEscape(v) {
  const s = v==null?'':String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}

const drafts = books.map(buildDraft);
fs.mkdirSync('./exports-descriptions', {recursive:true});
fs.writeFileSync('./exports-descriptions/descriptions.json', JSON.stringify(drafts,null,2));

// eBay CSV - for manual / bulk reference (Inventory API uses JSON, this is paste sheet)
const ebayHeaders = ['SKU','eBay Title (80ch)','Price GBP','Quantity','Condition','ISBN','Description (text)','eBay HTML'];
const ebayRows = drafts.map(d=>{
  const src = books.find(b=>b.sku===d.sku);
  return [d.sku,d.ebayTitle,d.priceMinor?(d.priceMinor/100).toFixed(2):'',1,src.condition||'',d.isbn,d.description,d.ebayHtml];
});
fs.writeFileSync('./exports-descriptions/ebay.csv', [ebayHeaders,...ebayRows].map(r=>r.map(csvEscape).join(',')).join('\r\n'));

// Amazon manual sheet - matches buildAmazonManualSheet()
const amzHeaders = ['SKU','ASIN/ISBN','Title','Condition','Condition Note','Price GBP','Quantity','Action'];
const amzRows = drafts.map(d=>{
  const src = books.find(b=>b.sku===d.sku);
  return [d.sku,d.isbn,d.title,src.condition||'',d.amazonConditionNote,d.priceMinor?(d.priceMinor/100).toFixed(2):'',1,'Create offer manually'];
});
fs.writeFileSync('./exports-descriptions/amazon-manual-sheet.csv', [amzHeaders,...amzRows].map(r=>r.map(csvEscape).join(',')).join('\r\n'));

// Readable markdown for review
let md = `# GoodGrails — 64 draft descriptions (auto-generated, unverified)\n\n> Conservative drafts: only catalogue facts used. Condition/edition NOT invented. Do not publish until physical check + photos.\n\n`;
for (const d of drafts) {
  md += `---\n\n## ${d.sku} — ${d.title}\n\n**eBay title (${d.ebayTitle.length}ch):** ${d.ebayTitle}\n\n**Price:** ${d.priceLabel} | **Readiness:** ${d.readiness}\n\n**Description:**\n\n${d.description}\n\n**Amazon note (${d.amazonConditionNote.length}ch):**\n\n${d.amazonConditionNote}\n\n**Checklist:**\n${d.checklist.map(c=>`- [ ] ${c}`).join('\n')}\n\n`;
}
fs.writeFileSync('./exports-descriptions/DESCRIPTIONS.md', md);

// Summary
const needCond = books.filter(b=>!b.condition).length;
const needIsbn = books.filter(b=>!b.isbn).length;
const needAuthor = books.filter(b=>!b.author).length;
console.log(`Done: ${drafts.length} drafts`);
console.log(`Missing condition: ${needCond}, missing ISBN: ${needIsbn}, missing author: ${needAuthor}`);
console.log(`Files in ./exports-descriptions/: descriptions.json, ebay.csv, amazon-manual-sheet.csv, DESCRIPTIONS.md`);
console.log('\nSample BOOK-001 eBay title: ' + drafts[0].ebayTitle);
console.log('Sample BOOK-001 Amazon note: ' + drafts[0].amazonConditionNote.slice(0,200));
