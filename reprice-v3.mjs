import fs from 'fs';
const v3 = JSON.parse(fs.readFileSync('./exports-descriptions/descriptions-v3.json','utf8'));

// Reprice BOOK-049 Dhammapada Iyer
const dham = v3.find(d=>d.sku==='BOOK-049');
dham.priceMinor = 4499; dham.price = '£44.99';
dham.description += '\n\nRepriced: Concord Grove 1986 lexhide with Udanavarga (551pp, blue/gold) — premium theosophical edition, not generic Dhammapada. Very Good, beautiful copy.';
dham.amazonConditionNote = dham.amazonConditionNote.slice(0,400);

// Add NEW leads with prices
const news = [
  {
    sku: 'NEW-RAINBOW', title: 'The Rainbow and the Worm: The Physics of Organisms', author: 'Mae-Wan Ho',
    isbn: '9789812832603 (VERIFY — 3rd ed 2008? check title page, 2nd ed = 9789810234270)',
    binding: 'Paperback', condition: 'Good',
    priceMinor: 1999, price: '£19.99',
    ebayTitle: 'Mae-Wan Ho Rainbow and the Worm Physics of Organisms Good'.slice(0,80),
    description: `The Rainbow and the Worm: The Physics of Organisms — Mae-Wan Ho.\n\nActual copy: Paperback. ISBN on copy: 9789812832603 (VERIFY — check 2nd vs 3rd ed on title page).\n\nCondition: Good. Markings inside — see photos. Priced accordingly (used Good comps ~£21, new ~£34-43).\n\nRef: NEW-RAINBOW. Asking: £19.99.\n\nOne copy = one listing.`,
    ebayHtml: `<h3>The Rainbow and the Worm — Mae-Wan Ho</h3><p><strong>Actual copy:</strong> Paperback | ISBN: verify 2nd/3rd ed | Ref NEW-RAINBOW</p><p><strong>Condition: Good</strong> — markings inside, see photos.</p><h4>Photos</h4><p>[ADD: front/back/spine/title/copyright/markings]</p>`,
    amazonConditionNote: 'Condition: Good. Markings inside. Actual copy photographed.'.slice(0,500),
    source: 'new-lead-photo', confidence: 'medium', photoNote: 'Pink spine IMG_2668_top; owner notes markings inside'
  },
  {
    sku: 'NEW-PHILFREEDOM', title: 'The Philosophy of Freedom', author: 'Rudolf Steiner',
    isbn: '9781855842564 (VERIFY — RSP 2011 cloth white/green? alternatives 9780910142526 / 9780880103855)',
    binding: 'Hardcover? Paperback? — VERIFY (white cover green writing)',
    condition: 'Very Good',
    priceMinor: 1899, price: '£18.99',
    ebayTitle: 'Rudolf Steiner Philosophy of Freedom White Green'.slice(0,80),
    description: `The Philosophy of Freedom — Rudolf Steiner.\n\nActual copy: white cover green writing. ISBN on copy: 9781855842564 (VERIFY on title page — RSP 2011 cloth most likely).\n\nCondition: Very Good (pending photos).\n\nRef: NEW-PHILFREEDOM. Asking: £18.99.\n\nOne copy = one listing.`,
    ebayHtml: `<h3>The Philosophy of Freedom — Rudolf Steiner</h3><p><strong>Actual copy:</strong> white/green | ISBN: verify | Ref NEW-PHILFREEDOM</p><p><strong>Condition: Very Good</strong>.</p>`,
    amazonConditionNote: 'Condition: Very Good. White/green edition. Actual copy photographed.'.slice(0,500),
    source: 'new-lead-photo', confidence: 'low-confirm', photoNote: 'White spine IMG_2667_top; white cover green writing per owner'
  }
];

const all = [...v3, ...news];
fs.writeFileSync('./exports-descriptions/descriptions-v3.json', JSON.stringify(all,null,2));

function csvEscape(v){const s=v==null?'':String(v);return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
const ebayRows = all.map(d=>[d.sku,d.ebayTitle,d.priceMinor?(d.priceMinor/100).toFixed(2):'',1,d.binding,d.isbn,d.description,d.ebayHtml||'']);
fs.writeFileSync('./exports-descriptions/ebay-v3.csv', [['SKU','eBay Title','Price GBP','Qty','Binding','ISBN','Description','HTML'],...ebayRows].map(r=>r.map(csvEscape).join(',')).join('\r\n'));
const amzRows = all.map(d=>[d.sku,d.isbn,d.title,d.condition,d.amazonConditionNote,d.priceMinor?(d.priceMinor/100).toFixed(2):'',1,'Create offer manually']);
fs.writeFileSync('./exports-descriptions/amazon-v3.csv', [['SKU','ASIN/ISBN','Title','Condition','Condition Note','Price GBP','Qty','Action'],...amzRows].map(r=>r.map(csvEscape).join(',')).join('\r\n'));
console.log('Repriced BOOK-049 £12.99 -> £44.99; added NEW-RAINBOW £19.99 (Good, markings), NEW-PHILFREEDOM £18.99 (verify printing). Total: '+all.length);
