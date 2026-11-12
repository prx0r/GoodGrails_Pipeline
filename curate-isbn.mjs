import fs from 'fs';
// Photo-verified truths (high confidence from IMG_2665-2673 spines/covers)
const PHOTO = {
  'BOOK-001': { author: 'N. T. Wright', binding: 'Hardback', publisher: 'SPCK', note: 'Blue SPCK HB with jacket, IMG_2671/2672' },
  'BOOK-002': { author: 'Michael Dillon', binding: 'Paperback pamphlet', publisher: 'Linden Press', isbn: '', note: 'IMG_2665 cover, pre-ISBN era, creased cover' },
  'BOOK-003': { binding: 'Paperback', note: 'User says softback; photo IMG_2667 shows 2 green vols — looks HB, CONFIRM' },
  'BOOK-005': { binding: 'Hardcover', note: 'Routledge maroon spine IMG_2671' },
  'BOOK-006': { author: 'David Michael Levin', binding: 'Hardback', publisher: 'Routledge', note: 'Red Routledge spine IMG_2669' },
  'BOOK-008': { author: 'Edward Feser', note: 'Grey spine "Locke Edward Feser" IMG_2671 — rescues from Scott Lynch OL mismatch' },
  'BOOK-009': { author: 'Michael Scriven', note: 'Blue spine "Michael Scriven REASONING" IMG_2671 — rescues from Jay Asher OL mismatch' },
  'BOOK-014': { author: 'Master Sheng-yen', binding: 'Paperback', note: 'Light-blue SUNY spine IMG_2671/2672' },
  'BOOK-015': { author: 'A. E. Taylor', publisher: 'Macmillan', note: 'Red Macmillan spine "PHILOSOPHICAL STUDIES A.E. TAYLOR" IMG_2671 — not G.E. Moore' },
  'BOOK-018': { author: 'Harold Morick (ed.)', note: 'Spine "Wittgenstein ... Morick-editor" IMG_2670' },
  'BOOK-019': { author: 'Lewis Call', note: 'White spine confirms IMG_2670' },
  'BOOK-020': { author: 'Charles Levin', publisher: 'Prentice Hall', note: 'Purple spine confirms IMG_2671' },
  'BOOK-025': { author: 'Richard Sorabji', note: 'Spine confirms IMG_2670' },
  'BOOK-028': { author: 'Douglas Hedley', note: 'Maroon spine confirms IMG_2672' },
  'BOOK-029': { author: 'J. Krishnamurti', publisher: 'Gollancz', note: 'Spine "J. KRISHNAMURTI THIS MATTER OF CULTURE" IMG_2669' },
  'BOOK-034': { author: 'B. Jack Copeland (ed.)', publisher: 'Oxford', note: 'Blue Oxford spine confirms IMG_2666' },
  'BOOK-035': { author: 'Kunzang Pelden', publisher: 'Shambhala', note: 'Blue spine confirms IMG_2671/2672' },
  'BOOK-040': { author: 'Josef Perner', note: 'White spine confirms IMG_2669' },
  'BOOK-041': { author: 'M. B. Fuller', note: 'Spine "TRUTH, VALUE AND JUSTIFICATION Fuller" IMG_2666' },
  'BOOK-044': { author: 'Mark Dooley', note: 'Spine "MARK DOOLEY MORAL MATTERS" IMG_2669 — to confirm' },
  'BOOK-046': { author: 'William S. Waldron', note: 'Spine confirms' },
  'BOOK-047': { author: 'Tsong-kha-pa', note: 'Pink spine "THE GREAT TREATISE" IMG_2672' },
  'BOOK-051': { publisher: 'Pali Text Society', year: '1979', note: 'Cream spine "KINDRED SAYINGS V ... 1979" IMG_2672 — pre-ISBN set, leave ISBN blank' },
  'BOOK-053': { note: 'Spine "The Flame and the Light HUGH..." IMG_2669 — NOT Armentrout 2022 romance, OL pick wrong' },
  'BOOK-058': { author: 'Alan Richardson', note: 'Maroon spine "THE MAGICIAN\'S TABLES" IMG_2672' },
  'BOOK-060': { author: 'Mark S. G. Dyczkowski', note: 'Pink spine confirms IMG_2666' },
  'BOOK-062': { author: 'Jae Woong Kim', note: 'Green spine "POLISHING THE DIAMOND" IMG_2671' },
  'BOOK-064': { author: 'Paul Selig', binding: 'Hardcover', condition: 'Acceptable', note: '"I Am the Word" = Paul Selig channeled text, signed copy — NOT Shakespeare, OL pick wrong' },
};
// User condition rules
const DEFAULT_CONDITION = 'Very Good'; // "mostly good / like new" — safe middle, upgrade to Like New on photos
const CONDITION_OVERRIDES = {
  'BOOK-002': 'Good', // creased cover visible IMG_2665
  'BOOK-064': 'Acceptable', // signed Selig per owner
};

const picks = JSON.parse(fs.readFileSync('./exports-descriptions/isbn-picks.json','utf8'));
const byPick = Object.fromEntries(picks.map(p=>[p.sku,p]));

// ISBNs to DISCARD (known OL mismatches)
const DISCARD_ISBN = new Set([
  'BOOK-008','BOOK-009','BOOK-015','BOOK-051','BOOK-053','BOOK-059','BOOK-064','BOOK-003'
]);
// Manual most-likely ISBNs (assumed from rationale = price research, else curated)
const MANUAL_ISBN = {
  'BOOK-003': '', // Encyclopedia 2-vol set — needs edition check (Continuum 1847062733? or 082644847X?). Leave blank, user confirms softback.
  'BOOK-008': '', // Feser Locke — look up: 9781851683728? Leave blank for confirmation (Oneworld?)
  'BOOK-009': '', // Scriven Reasoning — McGraw-Hill 1966, pre-ISBN? Leave blank.
  'BOOK-015': '', // A.E. Taylor Philosophical Studies — Macmillan 1930s, pre-ISBN. Leave blank.
  'BOOK-051': '', // PTS 1979 set — pre-ISBN. Leave blank.
  'BOOK-053': '', // old religious HB — leave blank.
  'BOOK-059': '', // Gita — too many translations, need translator from title page. Leave blank.
  'BOOK-064': '', // Selig I Am the Word — Tarcher 9780399159817? Most likely 9780399159817 (2004 HB). Set as candidate with low confidence.
};
MANUAL_ISBN['BOOK-064'] = '9780399159817'; // Paul Selig, Tarcher 2004 hardcover — CONFIRM

const curated = picks.map(p=>{
  const sku = p.sku;
  const photo = PHOTO[sku]||{};
  let isbn = p.pick, source = 'openlibrary', confidence = 'medium';
  if (p.assumed?.length || (p.topCandidate===null)) {}
  // assumed from price rationale outranks OL
  if (byPick[sku] && JSON.parse(fs.readFileSync('./exports-descriptions/isbn-cache.json','utf8'))[sku]?.assumed?.[0]) {
    isbn = JSON.parse(fs.readFileSync('./exports-descriptions/isbn-cache.json','utf8'))[sku].assumed[0];
    source = 'price-research-assumed'; confidence = 'high';
  }
  if (DISCARD_ISBN.has(sku)) {
    isbn = MANUAL_ISBN[sku] ?? '';
    source = isbn ? 'manual-curated' : 'needs-title-page';
    confidence = isbn ? 'low-confirm' : 'missing';
  }
  if (sku==='BOOK-002' || sku==='BOOK-051') { isbn=''; source='pre-ISBN-era'; confidence='high-none'; }
  return {
    sku, title: p.title,
    isbn, isbnSource: source, isbnConfidence: confidence,
    author: photo.author || null,
    binding: photo.binding || null,
    condition: CONDITION_OVERRIDES[sku] || DEFAULT_CONDITION,
    photoNote: photo.note || '',
    needsConfirm: confidence!=='high' || !!photo.author || DISCARD_ISBN.has(sku)
  };
});

fs.writeFileSync('./exports-descriptions/isbn-curated.json', JSON.stringify(curated,null,2));
const withIsbn = curated.filter(c=>c.isbn).length;
console.log(`${withIsbn}/${curated.length} with ISBN after curation`);
console.log('Photo-fixed authors:', Object.entries(PHOTO).filter(([k,v])=>v.author).map(([k,v])=>`${k}=${v.author}`).join('; '));
console.log('Conditions: default Very Good, BOOK-002=Good (creased), BOOK-064=Acceptable (signed)');
console.log('Needs confirm:', curated.filter(c=>c.needsConfirm).length);
