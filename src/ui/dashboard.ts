/**
 * Mobile-first seller dashboard, served by the Worker as a single page.
 * No build step: plain HTML/CSS/JS, token entered once and kept in
 * localStorage. All data comes from the authenticated admin API.
 */
export function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>GoodGrails Seller</title>
<style>
:root{--bg:#0e1116;--panel:#161b22;--panel2:#1c232d;--line:#2a3340;--text:#e6edf3;--muted:#8b98a8;--accent:#c9a227;--good:#3fb950;--warn:#d29922;--bad:#f85149;--blue:#58a6ff}
*{box-sizing:border-box}
body{margin:0;font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text)}
header{position:sticky;top:0;z-index:10;background:rgba(14,17,22,.96);border-bottom:1px solid var(--line);padding:10px 14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
h1{font-size:17px;margin:0;letter-spacing:.02em}
h1 span{color:var(--accent)}
nav{display:flex;gap:6px;flex-wrap:wrap}
button{background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px 12px;font:inherit;cursor:pointer}
button:hover{border-color:var(--accent)}
button.primary{background:var(--accent);color:#151006;border-color:var(--accent);font-weight:600}
button.danger{color:var(--bad);border-color:#5a2320}
input,select,textarea{background:var(--panel2);border:1px solid var(--line);color:var(--text);border-radius:8px;padding:9px 10px;font:inherit;width:100%}
main{padding:14px;max-width:1200px;margin:0 auto}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px}
.card .k{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em}
.card .v{font-size:24px;font-weight:700;margin-top:4px}
.card .s{color:var(--muted);font-size:12px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.between{justify-content:space-between}
.muted{color:var(--muted)}
.small{font-size:12px}
.tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;border:1px solid var(--line);background:var(--panel2)}
.tag.needs_verification,.tag.draft{color:var(--warn);border-color:#5a4a1e}
.tag.ready,.tag.active{color:var(--good);border-color:#1f4a2a}
.tag.sold,.tag.withdrawn{color:var(--muted)}
.tag.error,.tag.reserved{color:var(--bad);border-color:#5a2320}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:600}
tr.click{cursor:pointer}
tr.click:hover td{background:var(--panel2)}
.hide{display:none!important}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:14px}
.panel h2{font-size:15px;margin:0 0 10px}
label{display:block;font-size:12px;color:var(--muted);margin:10px 0 4px}
.drawer{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:50;display:flex;justify-content:flex-end}
.drawer .inner{background:var(--bg);width:min(720px,100%);height:100%;overflow:auto;border-left:1px solid var(--line);padding:16px}
.close{position:sticky;top:0;float:right}
pre{white-space:pre-wrap;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:12px;font-size:12px;max-height:260px;overflow:auto}
.bar{height:8px;background:var(--panel2);border-radius:999px;overflow:hidden;margin-top:6px}
.bar>i{display:block;height:100%;background:var(--accent)}
.toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:var(--panel2);border:1px solid var(--line);padding:10px 16px;border-radius:10px;z-index:100;max-width:92vw}
.toast.err{border-color:var(--bad);color:var(--bad)}
.thumb{width:84px;height:84px;object-fit:cover;border-radius:8px;border:1px solid var(--line);margin:3px}
@media(max-width:640px){.col-hide{display:none}main{padding:10px}}
</style>
</head>
<body>
<header>
  <h1>Good<span>Grails</span> Seller</h1>
  <nav>
    <button data-tab="overview">Overview</button>
    <button data-tab="inventory">Inventory</button>
    <button data-tab="orders">Orders</button>
    <button data-tab="channels">Channels</button>
  </nav>
  <span style="flex:1"></span>
  <span id="authstate" class="small muted"></span>
  <button id="logout" class="hide small">Sign out</button>
</header>
<main>
  <section id="login" class="panel" style="max-width:520px;margin:40px auto">
    <h2>Sign in</h2>
    <p class="muted small">Paste the admin token configured as the <code>ADMIN_TOKEN</code> secret. It is stored only in this browser (localStorage).</p>
    <label for="token">Admin token</label>
    <input id="token" type="password" autocomplete="current-password" placeholder="Bearer token">
    <div class="row" style="margin-top:12px"><button class="primary" id="loginbtn">Sign in</button></div>
    <p id="loginmsg" class="small muted" style="margin-top:10px"></p>
  </section>

  <section id="app" class="hide">
    <div id="tab-overview"></div>
    <div id="tab-inventory" class="hide"></div>
    <div id="tab-orders" class="hide"></div>
    <div id="tab-channels" class="hide"></div>
  </section>
</main>
<div id="drawer"></div>
<script>
(function(){
  var token = localStorage.getItem('gg_admin_token') || '';
  var state = {tab:'overview', inventory:[], selected:null, overview:null};

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function money(m){return m==null?'—':'£'+(m/100).toFixed(2);}
  function pct(a,b){return b?Math.round(a*100/b):0;}
  function fmtDate(s){if(!s)return '—';var d=new Date(s);return isNaN(d)?s:d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});}

  function api(path, opts){
    opts = opts || {};
    var headers = opts.headers || {};
    if(token) headers['Authorization'] = 'Bearer ' + token;
    if(opts.body && !(opts.body instanceof FormData)) headers['Content-Type']='application/json';
    return fetch(path,{method:opts.method||'GET',headers:headers,body:opts.body}).then(function(r){
      return r.text().then(function(t){
        var data; try{data=JSON.parse(t);}catch(e){data={raw:t};}
        if(!r.ok) throw new Error((data&&data.error)||('HTTP '+r.status));
        return (data && data.data !== undefined) ? data.data : data;
      });
    });
  }
  function toast(msg, isErr){
    var el=document.createElement('div'); el.className='toast'+(isErr?' err':''); el.textContent=msg;
    document.body.appendChild(el); setTimeout(function(){el.remove();},3200);
  }

  function setAuth(has){
    document.getElementById('login').classList.toggle('hide',has);
    document.getElementById('app').classList.toggle('hide',!has);
    document.getElementById('logout').classList.toggle('hide',!has);
    document.getElementById('authstate').textContent = has ? 'signed in' : '';
  }

  function login(){
    token=(document.getElementById('token').value||'').trim();
    if(!token){document.getElementById('loginmsg').textContent='Enter a token.';return;}
    api('/api/admin/overview').then(function(){
      localStorage.setItem('gg_admin_token',token); setAuth(true); refresh(); toast('Signed in');
    }).catch(function(e){
      document.getElementById('loginmsg').textContent=e.message;
      document.getElementById('loginmsg').style.color='var(--bad)';
    });
  }
  function logout(){localStorage.removeItem('gg_admin_token');token='';setAuth(false);}

  function switchTab(tab){
    state.tab=tab;
    ['overview','inventory','orders','channels'].forEach(function(t){
      document.getElementById('tab-'+t).classList.toggle('hide',t!==tab);
    });
    if(tab==='overview') renderOverview();
    if(tab==='inventory') renderInventory();
    if(tab==='orders') renderOrders();
    if(tab==='channels') renderChannels();
  }

  function refresh(){ loadOverview(); }

  function loadOverview(){
    api('/api/admin/overview').then(function(d){state.overview=d; if(state.tab==='overview') renderOverview();}).catch(function(e){
      if(/Authentication|credential|configured/i.test(e.message)){setAuth(false);}
      toast(e.message,true);
    });
  }

  function renderOverview(){
    var el=document.getElementById('tab-overview');
    var d=state.overview; if(!d){el.innerHTML='<p class="muted">Loading…</p>'; return;}
    var st=d.stats||{}; var val=st.value||{};
    var total=st.copies||0;
    var byStatus={}; (st.by_status||[]).forEach(function(x){byStatus[x.status]=x.count;});
    var verified=(st.verification||[]).reduce(function(a,x){return a+(x.verification_status==='fully_verified'?x.count:0);},0);
    var listed=(st.listings||[]).filter(function(x){return x.status==='active';}).reduce(function(a,x){return a+x.count;},0);
    var html='';
    html+='<div class="grid">';
    html+=card('Physical copies',total,'of 64 in the handoff catalogue');
    html+=card('Potential value',money(val.potential_minor),'acquisition ' + money(val.acquisition_minor));
    html+=card('Needs verification',(byStatus.needs_verification||0),'verify edition, condition, photos');
    html+=card('Listed / active',listed,'across all channels');
    html+=card('Sold',(byStatus.sold||0),'completed sales');
    html+=card('Fully verified',verified,'ready to publish safely');
    html+='</div>';

    html+='<div class="panel" style="margin-top:14px"><h2>Verification & photo queue</h2>';
    var nv=(byStatus.needs_verification||0)+(byStatus.draft||0);
    html+='<p class="small muted">' + nv + ' copies still need bibliographic or photo verification. The app never publishes an unverified claim.</p>';
    html+='<div class="bar"><i style="width:'+pct(total-nv,total)+'%"></i></div>';
    html+='</div>';

    html+='<div class="panel"><h2>Pending sync jobs</h2>';
    if(!d.jobs||!d.jobs.length){html+='<p class="small muted">No pending jobs.</p>';}
    else{html+='<table><thead><tr><th>Action</th><th>Marketplace</th><th>State</th><th class="col-hide">Created</th></tr></thead><tbody>';
      d.jobs.forEach(function(j){html+='<tr><td>'+esc(j.action)+'</td><td>'+esc(j.marketplace)+'</td><td><span class="tag '+(j.state==='failed'?'error':'')+'">'+esc(j.state)+'</span></td><td class="col-hide">'+fmtDate(j.created_at)+'</td></tr>';});
      html+='</tbody></table>';}
    html+='</div>';

    html+='<div class="panel"><h2>Quick actions</h2><div class="row">';
    html+='<button onClick="window.ggImport()">Import 64-book catalogue (idempotent)</button>';
    html+='<button onClick="window.ggExport(\\'biblio\\')">Export Biblio CSV</button>';
    html+='<button onClick="window.ggExport(\\'amazon\\')">Export Amazon manual sheet</button>';
    html+='<button onClick="window.ggExport(\\'abebooks\\')">Export AbeBooks XML</button>';
    html+='</div></div>';
    el.innerHTML=html;
  }
  function card(k,v,s){return '<div class="card"><div class="k">'+esc(k)+'</div><div class="v">'+esc(v)+'</div><div class="s">'+esc(s||'')+'</div></div>';}

  function renderInventory(){
    var el=document.getElementById('tab-inventory');
    el.innerHTML='<div class="panel"><div class="row between"><h2 style="margin:0">Inventory</h2><button class="primary" onClick="window.ggAddForm()">Add copy</button></div>'
      +'<div class="row" style="margin:10px 0"><input id="q" placeholder="Search title, author, SKU, ISBN" style="flex:1;min-width:180px" oninput="window.ggFilter()">'
      +'<select id="status" style="width:auto" onchange="window.ggFilter()"><option value="">All statuses</option><option>draft</option><option>needs_verification</option><option>ready</option><option>active</option><option>reserved</option><option>sold</option><option>withdrawn</option></select></div>'
      +'<div id="tablewrap" class="muted small">Loading…</div></div>';
    loadInventory();
  }
  function loadInventory(){
    var q=encodeURIComponent((document.getElementById('q')||{}).value||'');
    var st=encodeURIComponent((document.getElementById('status')||{}).value||'');
    api('/api/admin/inventory?q='+q+'&status='+st).then(function(d){
      state.inventory=d.copies||[];
      var w=document.getElementById('tablewrap'); if(!w)return;
      if(!state.inventory.length){w.innerHTML='<p class="muted">No copies match. Use “Import 64-book catalogue” on Overview if the database is empty.</p>';return;}
      var h='<table><thead><tr><th>SKU</th><th>Title</th><th class="col-hide">ISBN</th><th>Status</th><th>Price</th><th class="col-hide">Photos</th></tr></thead><tbody>';
      state.inventory.forEach(function(c){
        h+='<tr class="click" onClick="window.ggOpen(\\''+c.id+'\\')"><td>'+esc(c.sku)+'</td><td><b>'+esc(c.work_title||'')+'</b><br><span class="small muted">'+esc(c.work_author||'')+'</span></td>'
          +'<td class="col-hide small">'+esc(c.isbn13||c.isbn10||'—')+'</td>'
          +'<td><span class="tag '+esc(c.status)+'">'+esc(c.status.replace(/_/g,' '))+'</span></td>'
          +'<td>'+money(c.approved_price_minor||c.suggested_price_minor)+'</td>'
          +'<td class="col-hide">'+esc(c.photo_count||0)+'</td></tr>';
      });
      h+='</tbody></table>';
      w.innerHTML=h;
    }).catch(function(e){toast(e.message,true);});
  }

  function addForm(){
    document.getElementById('drawer').innerHTML='<div class="drawer" onClick="window.ggClose(event)"><div class="inner" onClick="event.stopPropagation()"><button class="close" onClick="window.ggClose()">Close</button>'
      +'<h2>Add a physical copy</h2><p class="small muted">For books without a barcode, or a quick manual record. The SKU is assigned automatically.</p>'
      +'<label>Title *</label><input id="f_title">'
      +'<label>Author</label><input id="f_author">'
      +'<label>ISBN (optional)</label><input id="f_isbn" inputmode="numeric">'
      +'<label>Binding</label><input id="f_binding" placeholder="Hardcover / Paperback">'
      +'<label>Condition</label><input id="f_condition" placeholder="Good (owner-stated)">'
      +'<label>Cost paid (pence)</label><input id="f_cost" inputmode="numeric" placeholder="e.g. 1200">'
      +'<label>Notes</label><textarea id="f_notes" rows="3"></textarea>'
      +'<div class="row" style="margin-top:12px"><button class="primary" onClick="window.ggCreate()">Create copy</button></div></div></div>';
  }
  function createCopy(){
    var body={title:document.getElementById('f_title').value,author:document.getElementById('f_author').value,isbn:document.getElementById('f_isbn').value,binding:document.getElementById('f_binding').value,condition:document.getElementById('f_condition').value,notes:document.getElementById('f_notes').value};
    var c=parseInt(document.getElementById('f_cost').value,10); if(!isNaN(c)) body.acquisition_cost_minor=c;
    api('/api/admin/inventory',{method:'POST',body:JSON.stringify(body)}).then(function(){closeDrawer();toast('Copy created');loadInventory();}).catch(function(e){toast(e.message,true);});
  }

  function openCopy(id){
    api('/api/admin/inventory/'+id).then(function(d){state.selected=d.copy;renderCopy(d);}).catch(function(e){toast(e.message,true);});
  }
  function renderCopy(d){
    var c=d.copy, rec=c.recommendation||{}, dr=d.draft;
    var h='<div class="drawer" onClick="window.ggClose(event)"><div class="inner" onClick="event.stopPropagation()"><button class="close" onClick="window.ggClose()">Close</button>';
    h+='<h2>'+esc(c.work_title)+' <span class="tag '+esc(c.status)+'">'+esc(c.status)+'</span></h2>';
    h+='<p class="small muted">'+esc(c.sku)+' · '+esc(c.work_author||'')+' · ISBN '+(esc(c.isbn13||c.isbn10)||'—')+'</p>';
    h+='<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">';
    h+=card('Cost',money(c.acquisition_cost_minor),'');
    h+=card('Quick',money(rec.quick_minor),'');
    h+=card('Balanced',money(rec.balanced_minor),'');
    h+=card('Patient',money(rec.patient_minor),'');
    h+='</div>';
    h+='<div class="panel" style="margin-top:14px"><h2>Recommendation</h2>';
    h+='<p class="small muted">Confidence: '+esc(rec.confidence||'—')+' · floor '+money(rec.offer_floor_minor)+' · approved '+money(rec.approved_minor)+'</p>';
    h+='<div class="row"><input id="approve_price" inputmode="numeric" placeholder="Approve price in pence" style="max-width:220px"><button class="primary" onClick="window.ggApprove(\\''+c.id+'\\')">Approve price</button></div></div>';

    h+='<div class="panel"><h2>Physical copy & verification</h2>';
    h+='<label>Condition</label><input id="e_condition" value="'+esc(c.condition||'')+'">';
    h+='<label>Jacket</label><input id="e_jacket" value="'+esc(c.jacket_condition||'')+'">';
    h+='<label>Signed</label><input id="e_signed" value="'+esc(c.signed||'')+'">';
    h+='<label>Shelf location</label><input id="e_shelf" value="'+esc(c.shelf_location||'')+'">';
    h+='<label>Status</label><select id="e_status">'+['draft','needs_verification','ready','active','reserved','sold','withdrawn','returned'].map(function(s){return '<option '+(s===c.status?'selected':'')+'>'+s+'</option>';}).join('')+'</select>';
    h+='<label>Verification</label><select id="e_ver">'+['unverified','bibliographic_verified','photo_verified','fully_verified'].map(function(s){return '<option '+(s===c.verification_status?'selected':'')+'>'+s+'</option>';}).join('')+'</select>';
    h+='<label>Notes</label><textarea id="e_notes" rows="3">'+esc(c.notes||'')+'</textarea>';
    h+='<div class="row" style="margin-top:10px"><button class="primary" onClick="window.ggSave(\\''+c.id+'\\')">Save changes</button></div></div>';

    h+='<div class="panel"><h2>Photos</h2><div id="photos">';
    if(c.media&&c.media.length){c.media.forEach(function(m){h+='<img class="thumb" src="/media/'+esc(m.r2_key)+'" alt="'+esc(m.kind)+'">';});}
    else{h+='<p class="small muted">No actual-copy photos yet.</p>';}
    h+='</div><div class="row" style="margin-top:8px"><input id="photo_kind" style="max-width:160px" value="front"><input id="photo_file" type="file" accept="image/*" style="flex:1"><button onClick="window.ggUpload(\\''+c.id+'\\')">Upload</button></div></div>';

    h+='<div class="panel"><h2>Listing draft</h2>';
    if(dr.warnings&&dr.warnings.length){h+='<p class="small" style="color:var(--warn)">'+esc(dr.warnings.join(' '))+'</p>';}
    h+='<label>eBay title ('+dr.ebayTitle.length+' chars)</label><pre>'+esc(dr.ebayTitle)+'</pre>';
    h+='<label>Description</label><pre>'+esc(dr.description)+'</pre>';
    h+='<label>Amazon condition note</label><pre>'+esc(dr.amazonConditionNote)+'</pre>';
    if(dr.checklist&&dr.checklist.length){h+='<label>Before publishing</label><ul class="small muted">'+dr.checklist.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul>';}
    h+='<div class="row"><button onClick="window.ggListing(\\''+c.id+'\\',\\'biblio\\')">Draft Biblio listing</button><button onClick="window.ggListing(\\''+c.id+'\\',\\'ebay\\')">Draft eBay listing</button><button onClick="window.ggListing(\\''+c.id+'\\',\\'abebooks\\')">Draft AbeBooks listing</button><button onClick="window.ggListing(\\''+c.id+'\\',\\'amazon\\')">Draft Amazon manual</button></div></div>';

    h+='<div class="panel"><h2>Existing listings</h2>';
    if(c.listings&&c.listings.length){h+='<table><thead><tr><th>Channel</th><th>Status</th><th>Price</th><th>Error</th></tr></thead><tbody>';c.listings.forEach(function(l){h+='<tr><td>'+esc(l.marketplace)+'</td><td>'+esc(l.status)+'</td><td>'+money(l.price_minor)+'</td><td class="small">'+esc(l.last_error||'')+'</td></tr>';});h+='</tbody></table>';}
    else{h+='<p class="small muted">Not listed anywhere yet.</p>';}
    h+='</div>';

    h+='<div class="panel"><h2>Market evidence</h2>';
    if(c.comps&&c.comps.length){h+='<table><thead><tr><th>Type</th><th>Price</th><th>Source</th><th class="col-hide">Date</th></tr></thead><tbody>';c.comps.forEach(function(m){h+='<tr><td>'+esc(m.evidence_type)+'</td><td>'+money(m.price_minor)+'</td><td class="small">'+esc(m.source)+'</td><td class="col-hide small">'+esc(m.observed_at||'')+'</td></tr>';});h+='</tbody></table>';}
    else{h+='<p class="small muted">No market evidence recorded.</p>';}
    h+='<p class="small muted">Asking prices are never treated as completed sales.</p></div>';

    h+='</div></div>';
    document.getElementById('drawer').innerHTML=h;
  }

  function saveCopy(id){
    var body={condition:document.getElementById('e_condition').value,jacket_condition:document.getElementById('e_jacket').value,signed:document.getElementById('e_signed').value,shelf_location:document.getElementById('e_shelf').value,status:document.getElementById('e_status').value,verification_status:document.getElementById('e_ver').value,notes:document.getElementById('e_notes').value};
    api('/api/admin/inventory/'+id,{method:'PATCH',body:JSON.stringify(body)}).then(function(d){state.selected=d.copy;renderCopy(d);toast('Saved');loadInventory();}).catch(function(e){toast(e.message,true);});
  }
  function approvePrice(id){
    var v=parseInt(document.getElementById('approve_price').value,10);
    if(isNaN(v)||v<=0){toast('Enter pence, e.g. 1299',true);return;}
    api('/api/admin/inventory/'+id+'/price',{method:'POST',body:JSON.stringify({approved_minor:v})}).then(function(){toast('Price approved');openCopy(id);}).catch(function(e){toast(e.message,true);});
  }
  function uploadPhoto(id){
    var f=document.getElementById('photo_file').files[0]; if(!f){toast('Choose an image',true);return;}
    var kind=document.getElementById('photo_kind').value||'front';
    api('/api/admin/inventory/'+id+'/media?kind='+encodeURIComponent(kind),{method:'POST',body:f,headers:{'Content-Type':f.type}}).then(function(){toast('Photo uploaded');openCopy(id);}).catch(function(e){toast(e.message,true);});
  }
  function draftListing(id, marketplace){
    api('/api/admin/inventory/'+id+'/listing',{method:'POST',body:JSON.stringify({marketplace:marketplace})}).then(function(){toast('Draft '+marketplace+' listing created (not published)');openCopy(id);}).catch(function(e){toast(e.message,true);});
  }

  function renderOrders(){
    var el=document.getElementById('tab-orders');
    el.innerHTML='<div class="panel"><h2>Record a manual / in-person sale</h2><div class="row"><input id="m_sku" placeholder="SKU e.g. BOOK-001" style="max-width:200px"><input id="m_price" inputmode="numeric" placeholder="Price pence" style="max-width:160px"><button class="primary" onClick="window.ggManual()">Record sale</button></div><p class="small muted">A manual sale reserves the copy and queues withdrawals on other channels.</p></div>'
      +'<div class="panel"><h2>Orders</h2><div id="orderswrap" class="small muted">Loading…</div></div>';
    api('/api/admin/orders').then(function(d){
      var w=document.getElementById('orderswrap');
      if(!d.orders.length){w.innerHTML='<p class="muted">No orders yet.</p>';return;}
      var h='<table><thead><tr><th>Market</th><th>SKU</th><th>Price</th><th>Net</th><th>State</th><th>Date</th><th>Action</th></tr></thead><tbody>';
      d.orders.forEach(function(o){
        h+='<tr><td>'+esc(o.marketplace)+'</td><td>'+esc(o.sku||'')+'</td><td>'+money(o.price_minor)+'</td><td>'+money(o.net_minor)+'</td><td><span class="tag '+(o.fulfillment_state==='delivered'?'active':o.fulfillment_state==='cancelled'||o.fulfillment_state==='returned'?'error':'')+'">'+esc(o.fulfillment_state)+'</span></td><td class="small">'+fmtDate(o.ordered_at)+'</td>'
          +'<td><select onchange="window.ggFulfil(\\''+o.id+'\\',this.value)"><option value="">Update…</option><option>packing</option><option>dispatched</option><option>delivered</option><option>cancelled</option><option>returned</option></select></td></tr>';
      });
      w.innerHTML=h+'</tbody></table>';
    }).catch(function(e){toast(e.message,true);});
  }
  function manualSale(){
    var sku=document.getElementById('m_sku').value.trim(); var p=parseInt(document.getElementById('m_price').value,10);
    if(!sku||isNaN(p)){toast('SKU and price in pence are required',true);return;}
    api('/api/admin/orders/manual',{method:'POST',body:JSON.stringify({sku:sku,price_minor:p})}).then(function(d){toast(d.result&&d.result.message||"Sale recorded");renderOrders();}).catch(function(e){toast(e.message,true);});
  }
  function fulfil(id,state){
    if(!state)return;
    api('/api/admin/orders/'+id,{method:'PATCH',body:JSON.stringify({state:state})}).then(function(){toast('Order updated');renderOrders();}).catch(function(e){toast(e.message,true);});
  }

  function renderChannels(){
    var el=document.getElementById('tab-channels');
    var d=state.overview;
    if(!d){el.innerHTML='<p class="muted">Loading…</p>';loadOverview();return;}
    var h='<div class="panel"><h2>Marketplace adapters</h2><p class="small muted">Honest status only. Nothing is marked live without a real seller response.</p><table><thead><tr><th>Channel</th><th>Status</th><th>Can publish</th><th>Credentials</th></tr></thead><tbody>';
    d.marketplaces.forEach(function(m){
      h+='<tr><td><b>'+esc(m.marketplace)+'</b><br><span class="small muted">'+esc(m.notes)+'</span></td><td><span class="tag '+(m.status==='production_enabled'?'active':m.status==='not_implemented'?'error':'needs_verification')+'">'+esc(m.status)+'</span></td><td>'+esc(m.canPublish?'yes':'no')+'</td><td class="small">'+esc((m.requiresCredentials||[]).join(', ')||'—')+'</td></tr>';
    });
    h+='</tbody></table></div>';
    h+='<div class="panel"><h2>Exports</h2><div class="row"><button onClick="window.ggExport(\\'biblio\\')">Biblio CSV</button><button onClick="window.ggExport(\\'alibris\\')">Alibris CSV</button><button onClick="window.ggExport(\\'amazon\\')">Amazon manual sheet</button><button onClick="window.ggExport(\\'abebooks\\')">AbeBooks XML</button></div><p class="small muted">File exports are fully usable now. eBay/AbeBooks live publishing stays gated until the account is connected and a real response is verified.</p></div>';
    el.innerHTML=h;
  }

  window.ggOpen=openCopy; window.ggSave=saveCopy; window.ggApprove=approvePrice; window.ggUpload=uploadPhoto;
  window.ggListing=draftListing; window.ggAddForm=addForm; window.ggCreate=createCopy; window.ggManual=manualSale; window.ggFulfil=fulfil;
  window.ggFilter=function(){loadInventory();};
  window.ggClose=function(e){if(e&&e.target&&e.target.className!=='drawer')return;document.getElementById('drawer').innerHTML='';};
  function closeDrawer(){document.getElementById('drawer').innerHTML='';}
  window.ggImport=function(){api('/api/admin/import',{method:'POST'}).then(function(d){toast('Imported '+d.report.copiesImported+', skipped '+d.report.copiesSkipped+' (already present)');loadOverview();loadInventory();}).catch(function(e){toast(e.message,true);});};
  window.ggExport=function(kind){
    var urls={biblio:'/api/admin/export/biblio.csv',alibris:'/api/admin/export/alibris.csv',amazon:'/api/admin/export/amazon.csv',abebooks:'/api/admin/export/abebooks.xml'};
    fetch(urls[kind],{headers:{'Authorization':'Bearer '+token}}).then(function(r){if(!r.ok)throw new Error('Export failed');return r.blob();}).then(function(b){
      var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=kind;document.body.appendChild(a);a.click();a.remove();toast('Export downloaded');
    }).catch(function(e){toast(e.message,true);});
  };

  document.querySelectorAll('nav button').forEach(function(b){b.addEventListener('click',function(){switchTab(b.getAttribute('data-tab'));});});
  document.getElementById('loginbtn').addEventListener('click',login);
  document.getElementById('token').addEventListener('keydown',function(e){if(e.key==='Enter')login();});
  document.getElementById('logout').addEventListener('click',logout);

  if(token){setAuth(true);refresh();}else{setAuth(false);}
})();
</script>
</body>
</html>`;
}
