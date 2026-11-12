import fs from 'fs';
// Usage: fill exports-descriptions/VERIFY-batch.csv columns F-I, then: node finalize-after-verify.mjs
function parseCSV(text) {
  const rows=[]; let cur=[''], inQ=false, field='';
  // simple parse using splitlines with quote handling
  const lines = text.split(/\r?\n/).filter(l=>l.length);
  // use basic CSV split (our generator escapes properly)
  const out=[];
  for (const line of lines) {
    const row=[]; let f='', q=false;
    for (let i=0;i<line.length;i++){
      const c=line[i];
      if(q){ if(c==='"'){ if(line[i+1]==='"'){f+='"';i++;} else q=false; } else f+=c; }
      else { if(c==='"') q=true; else if(c===','){row.push(f);f='';} else f+=c; }
    }
    row.push(f); out.push(row);
  }
  return out;
}
const drafts = JSON.parse(fs.readFileSync('./exports-descriptions/descriptions-v2.json','utf8'));
const verifyText = fs.readFileSync('./exports-descriptions/VERIFY-batch.csv','utf8');
const rows = parseCSV(verifyText);
const header = rows[0];
const idx = Object.fromEntries(header.map((h,i)=>[h,i]));
const verifyMap = {};
for (let i=1;i<rows.length;i++){
  const r=rows[i];
  verifyMap[r[idx['SKU']]] = {
    condition: r[idx['Actual_Condition_FILL']]||'',
    jacket: r[idx['Jacket_FILL']]||'',
    editionOk: r[idx['Edition_OK_FILL']]||'',
    photosDone: r[idx['Photos_DONE_FILL']]||''
  };
}
let filled=0;
const finals = drafts.map(d=>{
  const v = verifyMap[d.sku]||{};
  const cond = v.condition || '{{CONDITION}}';
  if (v.condition) filled++;
  const replace = s=>s.replaceAll('{{CONDITION}}',cond).replaceAll('{{COND}}',cond.slice(0,20));
  return {...d,
    ebayTitle: replace(d.ebayTitle),
    description: replace(d.description) + (v.jacket?`\n\nDust-jacket: ${v.jacket}.`:''),
    ebayHtml: replace(d.ebayHtml) + (v.jacket?`<p>Dust-jacket: ${v.jacket}.</p>`:''),
    amazonConditionNote: replace(d.amazonConditionNote),
    verified: !!v.condition,
    photosDone: v.photosDone
  };
});
fs.writeFileSync('./exports-descriptions/descriptions-FINAL.json', JSON.stringify(finals,null,2));
function csvEscape(v){const s=v==null?'':String(v);return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
const ebayFinal = finals.filter(f=>f.verified).map(f=>[f.sku,f.ebayTitle,f.priceMinor?(f.priceMinor/100).toFixed(2):'',1,f.bindingDisplay,f.isbnDisplay,f.description,f.ebayHtml]);
fs.writeFileSync('./exports-descriptions/ebay-FINAL-ready.csv', [['SKU','eBay Title','Price GBP','Qty','Binding','ISBN','Description','HTML'],...ebayFinal].map(r=>r.map(csvEscape).join(',')).join('\r\n'));
const amzFinal = finals.filter(f=>f.verified).map(f=>[f.sku,f.isbnDisplay,f.title,f.verified?verifyMap[f.sku].condition:'',f.amazonConditionNote,f.priceMinor?(f.priceMinor/100).toFixed(2):'',1,'Create offer manually']);
fs.writeFileSync('./exports-descriptions/amazon-FINAL-ready.csv', [['SKU','ASIN/ISBN','Title','Condition','Condition Note','Price GBP','Qty','Action'],...amzFinal].map(r=>r.map(csvEscape).join(',')).join('\r\n'));
console.log(`Finalised: ${filled}/${finals.length} verified. Ready files only include verified copies.`);
console.log(`- descriptions-FINAL.json (all, with verified flag)`);
console.log(`- ebay-FINAL-ready.csv (${ebayFinal.length} ready)`);
console.log(`- amazon-FINAL-ready.csv (${amzFinal.length} ready)`);
console.log(`Fill VERIFY-batch.csv columns F-I, re-run this script.`);
