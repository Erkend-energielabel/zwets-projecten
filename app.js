/* Zwets Projecten — GitHub-versie. Gegevens staan in de Google Sheet (zie Code.gs), inloggen met naam + pincode. */
const $ = s => document.querySelector(s);
const eur = n => new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(n||0);
const num = (n,d=1) => new Intl.NumberFormat('nl-NL',{maximumFractionDigits:d,minimumFractionDigits:0}).format(n||0);
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => { const d=new Date(); return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,10); };
const fmtDate = d => { try{ return new Date(d+'T12:00').toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'short'}); }catch(e){ return d; } };
const PARTS = {ochtend:{label:'Ochtend',h:4},middag:{label:'Middag',h:4},dag:{label:'Hele dag',h:8}};
const API = String(window.ZWETS_API||'').trim();
const SKEY = 'zwets-sessie';

const S = { me:null, projects:[], painters:[], allMat:[], allHours:[], view:'list', pid:null, tab:'overzicht',
  crew:3, hoursPart:'dag', painterSel:'', loaded:false, confirm:null, namen:[], busy:false, editPainter:null };
const isK = () => S.me && S.me.rol==='kantoor';
const projMat = () => S.allMat.filter(m=>m.project===S.pid);
const projHours = () => S.allHours.filter(h=>h.project===S.pid);

function toast(msg){ const t=$('#toast'); t.textContent=msg; t.hidden=false; clearTimeout(toast.t); toast.t=setTimeout(()=>t.hidden=true,3000); }

/* ---------- verbinding ---------- */
function sessie(){ try{ return JSON.parse(localStorage.getItem(SKEY)||'null'); }catch(e){ return null; } }
function bewaarSessie(s){ try{ s?localStorage.setItem(SKEY,JSON.stringify(s)):localStorage.removeItem(SKEY); }catch(e){} }
async function api(action, extra={}, auth=true){
  if(!API) throw new Error('De app is nog niet gekoppeld aan de Google Sheet (config.js).');
  const ses=sessie();
  let res;
  try{ res=await fetch(API,{method:'POST',body:JSON.stringify({action,...(auth&&ses?{id:ses.id,pin:ses.pin}:{}),...extra}),redirect:'follow'}); }
  catch(e){ throw new Error('Geen verbinding. Controleer je internet en probeer het opnieuw.'); }
  let j; try{ j=await res.json(); }catch(e){ throw new Error('Onverwacht antwoord van de server.'); }
  if(!j.ok){ const err=new Error(j.error||'Er ging iets mis.'); err.code=j.code; if(auth&&(j.code==='auth'||j.code==='slot')&&action!=='login'){ bewaarSessie(null); S.me=null; S.view='login'; render(); } throw err; }
  return j;
}
async function doe(action, extra, ok){
  if(S.busy) return false; S.busy=true; document.body.classList.add('busy');
  try{ await api(action, extra); await laad(); if(ok) toast(ok); return true; }
  catch(e){ toast(e.message); return false; }
  finally{ S.busy=false; document.body.classList.remove('busy'); }
}
async function laad(){
  const j=await api('data');
  S.me=j.me;
  S.projects=j.projecten.map(p=>({id:p.id,name:p.naam,address:p.adres,budget:p.budget,rate:p.uurtarief,archived:p.afgerond,createdAt:p.aangemaakt}))
    .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  S.allMat=j.materiaal.map(m=>({id:m.id,project:m.project,date:m.datum,desc:m.omschrijving,amount:m.bedrag,by:m.door,byId:m.doorId}));
  S.allHours=j.uren.map(h=>({id:h.id,project:h.project,date:h.datum,painterId:h.schilderId,painterName:h.schilder,part:h.dagdeel,hours:h.uren}));
  S.painters=j.schilders.slice().sort((a,b)=>a.naam.localeCompare(b.naam,'nl')).map(x=>({id:x.id,name:x.naam,rol:x.rol,heeftPin:x.heeftPin,slot:x.slot}));
  S.loaded=true;
  render();
}

/* ---------- berekeningen ---------- */
function calc(p, materials, hours){
  const budget=+p.budget||0, rate=+p.rate||0;
  const mat=materials.reduce((a,m)=>a+(+m.amount||0),0);
  const labour=budget-mat;
  const avail= rate>0 ? labour/rate : 0;
  const spent=hours.reduce((a,h)=>a+(+h.hours||0),0);
  return {budget,rate,mat,labour,avail,spent,left:avail-spent};
}

/* ---------- render ---------- */
function render(){
  const saved={}, act=document.activeElement&&document.activeElement.id;
  document.querySelectorAll('#app input[id],#app select[id]').forEach(el=>{ if(el.id!=='crew'&&el.id!=='rateTry') saved[el.id]=el.type==='checkbox'?el.checked:el.value; });
  renderInner();
  Object.entries(saved).forEach(([id,v])=>{ const el=document.getElementById(id); if(el){ if(el.type==='checkbox') el.checked=v; else el.value=v; } });
  if(act&&act!=='crew'&&act!=='rateTry'){ const el=document.getElementById(act); if(el&&el.focus) el.focus(); }
}
function renderInner(){
  const app=$('#app'), top=$('#topActions'), cr=$('#crumb'), who=$('#who');
  const crumb=(back,label,right='')=>{ cr.hidden=false; cr.innerHTML=`<button class="ghost" data-act="${back}">← ${label}</button><div class="row-actions">${right}</div>`; };
  cr.hidden=true; cr.innerHTML=''; top.innerHTML='';
  who.innerHTML = S.me ? `<span>${esc(S.me.naam)}${isK()?' · kantoor':''}</span><button class="ghost" data-act="pin">Pincode wijzigen</button><button class="ghost" data-act="logout">Uitloggen</button>` : '';
  if(S.view==='login'){ $('#pageTitle').textContent='Inloggen'; app.innerHTML=renderLogin(); return; }
  if(S.view==='pin'){ crumb('home','Projecten'); $('#pageTitle').textContent='Pincode wijzigen'; app.innerHTML=renderPin(); return; }
  if(S.view==='list'){ $('#pageTitle').textContent='Projecten'; if(isK()) top.innerHTML=`<button data-act="painters">Schilders (${S.painters.length})</button><button class="primary" data-act="newProject">+ Nieuw project</button>`; app.innerHTML=renderList(); }
  else if(S.view==='new'||S.view==='edit'){ crumb('cancelForm',S.view==='edit'?'Terug naar project':'Projecten'); $('#pageTitle').textContent=S.view==='new'?'Nieuw project':'Project wijzigen'; app.innerHTML=renderProjectForm(); }
  else if(S.view==='painters'){ crumb(S.back?'backProject':'home',S.back?'Terug naar project':'Projecten'); $('#pageTitle').textContent='Schilders'; app.innerHTML=renderPainters(); }
  else if(S.view==='project'){ const p=S.projects.find(x=>x.id===S.pid); if(!p){S.view='list';return renderInner();} $('#pageTitle').textContent=p.name; crumb('home','Projecten',isK()?`<button data-act="editProject">Wijzigen</button>`:''); app.innerHTML=renderProject(p); }
}

function renderLogin(){
  if(!API) return `<div class="panel empty"><h3>Nog niet gekoppeld</h3><p class="muted">Vul in <b>config.js</b> de web-app-link van de Google Sheet in. Zie de README.</p></div>`;
  return `<form id="loginForm" class="panel" style="max-width:420px">
    <label class="f"><span class="lbl">Naam</span><select id="lg-id" required><option value="">${S.namen.length?'Kies je naam…':'Namen laden…'}</option>${S.namen.map(n=>`<option value="${esc(n.id)}">${esc(n.naam)}</option>`).join('')}</select></label>
    <label class="f"><span class="lbl">Pincode</span><input id="lg-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="current-password" required></label>
    <div class="row-actions"><button class="primary" type="submit">Inloggen</button></div>
    <p class="note">Geen pincode of vergeten? Vraag het kantoor.</p></form>`;
}
function renderPin(){
  return `<form id="pinForm" class="panel" style="max-width:420px">
    <label class="f"><span class="lbl">Nieuwe pincode (4–6 cijfers)</span><input id="np-1" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password" required></label>
    <label class="f"><span class="lbl">Herhaal nieuwe pincode</span><input id="np-2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password" required></label>
    <div class="row-actions"><button class="primary" type="submit">Opslaan</button></div></form>`;
}

function renderList(){
  if(!S.loaded) return `<div class="panel empty"><p class="muted">Projecten laden…</p></div>`;
  const act=S.projects.filter(p=>!p.archived), arc=S.projects.filter(p=>p.archived);
  if(!S.projects.length) return isK()
    ? `<div class="panel empty"><h2>Nog geen projecten</h2><p class="muted" style="max-width:42ch">Maak een project aan met het aangenomen budget en het uurtarief. Daarna boeken jullie materiaal en uren.</p><button class="primary" data-act="newProject">Eerste project aanmaken</button>${S.painters.length>1?'':'<p class="note">Voeg ook de schilders toe onder “Schilders”, met een eigen pincode.</p>'}</div>`
    : `<div class="panel empty"><h2>Nog geen projecten</h2><p class="muted">Het kantoor zet de projecten klaar. Daarna kun je hier je uren invullen.</p></div>`;
  const card=p=>{ const c=calc(p,S.allMat.filter(m=>m.project===p.id),S.allHours.filter(h=>h.project===p.id));
    const pctMat=c.budget?Math.min(100,c.mat/c.budget*100):0; const pctHrs=c.budget&&c.rate?Math.min(100-pctMat,c.spent*c.rate/c.budget*100):0;
    const st=c.left<0?`<span class="pill bad num">${num(c.left)} u</span>`:`<span class="pill good num">${num(c.left)} u over</span>`;
    return `<button class="pcard" data-open="${p.id}"><h3>${esc(p.name)}</h3>${st}<div class="bar" aria-hidden="true"><span style="width:${pctMat}%;background:var(--ochre)"></span><span style="width:${pctHrs}%;background:var(--accent)"></span></div><div class="meta num"><span>Budget ${eur(p.budget)}</span><span>Uurtarief ${eur(p.rate)}</span>${p.address?`<span>${esc(p.address)}</span>`:''}</div></button>`; };
  return `<div class="note" style="display:flex;gap:14px;flex-wrap:wrap"><span><span class="pill" style="background:var(--ochre)"> </span> materiaal</span><span><span class="pill" style="background:var(--accent)"> </span> gewerkte uren</span></div>
  <div class="plist">${act.map(card).join('')}</div>${arc.length?`<details><summary class="lbl" style="cursor:pointer;padding:6px 0">Afgerond (${arc.length})</summary><div class="plist" style="margin-top:8px">${arc.map(card).join('')}</div></details>`:''}`;
}

function renderProjectForm(){
  const p=S.view==='edit'?S.projects.find(x=>x.id===S.pid)||{}:{rate:55};
  return `<form id="projForm" class="panel">
    <label class="f"><span class="lbl">Projectnaam</span><input id="pf-name" required value="${esc(p.name||'')}" placeholder="Bijv. VvE Burgemeester Smitstraat"></label>
    <label class="f"><span class="lbl">Adres / opdrachtgever</span><input id="pf-addr" value="${esc(p.address||'')}" placeholder="Optioneel"></label>
    <div class="grid2">
      <label class="f"><span class="lbl">Budget (€, excl. btw)</span><input id="pf-budget" type="number" step="0.01" min="0" inputmode="decimal" required value="${p.budget??''}"></label>
      <label class="f"><span class="lbl">Uurtarief (€)</span><input id="pf-rate" type="number" step="0.01" min="0.01" inputmode="decimal" required value="${p.rate??''}"></label>
    </div>
    ${S.view==='edit'?`<label style="display:flex;gap:8px;align-items:center"><input id="pf-arch" type="checkbox" style="width:auto" ${p.archived?'checked':''}> Project afgerond (er kunnen dan geen uren meer bij)</label>`:''}
    <div class="row-actions">
      ${S.view==='edit'?`<button type="button" class="danger" data-act="delProject">${S.confirm==='delProject'?'Zeker? Tik nogmaals':'Project verwijderen'}</button>`:''}
      <button type="button" data-act="cancelForm">Annuleren</button><button class="primary" type="submit">Opslaan</button>
    </div></form>`;
}

function renderPainters(){
  const e=S.editPainter?S.painters.find(x=>x.id===S.editPainter):null;
  return `<form id="painterForm" class="panel"><h3>${e?'Schilder wijzigen':'Schilder toevoegen'}</h3>
    <div class="grid2">
      <label class="f"><span class="lbl">Naam</span><input id="pn-name" required value="${esc(e?e.name:'')}" placeholder="Naam"></label>
      <label class="f"><span class="lbl">${e?'Nieuwe pincode':'Pincode'} (4–6 cijfers)</span><input id="pn-pin" type="text" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" required autocomplete="off"></label>
    </div>
    <label class="f" style="max-width:240px"><span class="lbl">Rol</span><select id="pn-rol"><option value="schilder">Schilder</option><option value="kantoor" ${e&&e.rol==='kantoor'?'selected':''}>Kantoor (mag alles beheren)</option></select></label>
    <div class="row-actions">${e?'<button type="button" data-act="cancelPainter">Annuleren</button>':''}<button class="primary" type="submit">${e?'Opslaan':'Toevoegen'}</button></div>
    <p class="note">Geef de schilder zijn naam en pincode door. Met een nieuwe pincode wordt een vergrendeld account ook weer vrijgegeven.</p></form>
  <div class="panel"><h3>Iedereen met toegang</h3>
  ${S.painters.length?`<div class="tbl"><table><tbody>${S.painters.map(x=>`<tr><td>${esc(x.name)}<div class="note">${x.rol==='kantoor'?'Kantoor':'Schilder'}${x.slot?' · <span style="color:var(--bad)">vergrendeld</span>':''}${x.heeftPin===false?' · geen pincode':''}</div></td><td class="r" style="white-space:nowrap"><button class="ghost" data-editpainter="${x.id}">Wijzigen</button>${x.id===S.me.id?'':`<button class="ghost danger" data-delpainter="${x.id}">${S.confirm==='p'+x.id?'Zeker?':'Verwijderen'}</button>`}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Nog niemand toegevoegd.</p>'}
  <p class="note">Bij verwijderen blijven de ingevulde uren bewaard.</p></div>`;
}

function renderProject(p){
  const mats=projMat(), hrs=projHours();
  const c=calc(p,mats,hrs);
  const tabs=[['overzicht','Overzicht'],['materiaal','Materiaal'],['uren','Uren'],['verdeling','Verdeling']];
  let body='';
  if(S.tab==='overzicht'){
    const r=(S.rateTry!=null&&+S.rateTry>0)?+S.rateTry:c.rate; const avail=r>0?c.labour/r:0; const changed=r!==c.rate;
    const crew=Math.max(1,+S.crew||1); const perMan=avail/crew; const days=avail/(crew*8);
    body=`<div class="kpis">
      <div class="kpi" style="--sw:var(--muted)"><span class="lbl">Budget</span><b class="num">${eur(c.budget)}</b></div>
      <div class="kpi" style="--sw:var(--ochre)"><span class="lbl">Materiaal</span><b class="num">${eur(c.mat)}</b></div>
      <div class="kpi" style="--sw:${c.labour<0?'var(--bad)':'var(--good)'}"><span class="lbl">Over voor arbeid</span><b class="num" style="color:${c.labour<0?'var(--bad)':'var(--good)'}">${eur(c.labour)}</b></div>
    </div>
    <div class="panel"><h3>Berekening</h3><div class="calc num">
      <div class="row"><span>Budget</span><span>${eur(c.budget)}</span></div>
      <div class="row"><span>− Materiaal</span><span>${eur(c.mat)}</span></div>
      <div class="row"><span>= Beschikbaar voor arbeid</span><span>${eur(c.labour)}</span></div>
      <div class="row"><span>÷ Uurtarief ${eur(r)}${changed?' <span class="pill">aangepast</span>':''}</span><span style="color:${avail<0?'var(--bad)':'var(--good)'}">${num(avail)} uur</span></div>
    </div>
    <div class="f"><span class="lbl">Uurtarief aanpassen</span>
      <div class="stepper">
        <button type="button" data-rstep="-5" aria-label="5 euro lager">− 5</button>
        <input id="rateTry" type="number" min="1" step="0.5" inputmode="decimal" value="${r}">
        <button type="button" data-rstep="5" aria-label="5 euro hoger">+ 5</button>
        ${changed?`<button type="button" class="ghost" data-act="rateReset">Terug naar ${eur(c.rate)}</button>${isK()?'<button type="button" class="primary" data-act="rateSave">Opslaan als projecttarief</button>':''}`:''}
      </div>
      <span class="note">Probeer een ander tarief; de uren en dagen hieronder rekenen direct mee.${isK()?' Pas na “Opslaan” geldt het voor het hele project.':''}</span>
    </div></div>
    <div class="panel"><h3>Verdelen over de ploeg</h3>
      <div class="f"><span class="lbl">Aantal man</span><div class="stepper"><button type="button" data-cstep="-1" aria-label="1 man minder">− 1</button><input id="crew" type="number" min="1" step="1" inputmode="numeric" value="${crew}"><button type="button" data-cstep="1" aria-label="1 man meer">+ 1</button></div></div>
      <div class="calc num"><div class="row"><span>Uren per man</span><span>${num(perMan)} uur</span></div>
      <div class="row"><span>Dat is per man</span><span>${num(perMan/8)} dagen</span></div>
      <div class="row"><span>Werkdagen met ${crew} man</span><span style="color:${days<0?'var(--bad)':'inherit'}">${num(days)} dagen</span></div></div>
      ${avail<0?`<p class="note" style="color:var(--bad)">Het materiaal is duurder dan het budget.</p>`:''}
    </div>`;
  } else if(S.tab==='materiaal'){
    const ms=[...mats].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    const magWeg=m=>isK()||m.byId===S.me.id;
    body=`<form id="matForm" class="panel"><h3>Materiaal boeken</h3>
      <label class="f"><span class="lbl">Omschrijving</span><input id="mf-desc" required placeholder="Bijv. Sikkens Rubbol BL Satura 2,5 L × 6"></label>
      <div class="grid2"><label class="f"><span class="lbl">Bedrag (€)</span><input id="mf-amt" type="number" step="0.01" inputmode="decimal" required></label>
      <label class="f"><span class="lbl">Datum</span><input id="mf-date" type="date" value="${today()}" required></label></div>
      <div class="row-actions"><button class="primary" type="submit">Afboeken van budget</button></div></form>
    <div class="panel"><h3>Geboekt materiaal</h3>${ms.length?`<div class="tbl"><table><thead><tr><th>Datum</th><th>Omschrijving</th><th class="r">Bedrag</th><th></th></tr></thead><tbody>
      ${ms.map(m=>`<tr><td class="num" style="white-space:nowrap">${fmtDate(m.date)}</td><td>${esc(m.desc)}<div class="note">${esc(m.by||'')}</div></td><td class="r num">${eur(m.amount)}</td><td class="r">${magWeg(m)?`<button class="ghost danger" data-delmat="${m.id}">${S.confirm==='m'+m.id?'Zeker?':'×'}</button>`:''}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="2">Totaal</td><td class="r num">${eur(c.mat)}</td><td></td></tr></tfoot></table></div>`:'<p class="muted">Nog geen materiaal geboekt.</p>'}</div>`;
  } else if(S.tab==='uren'){
    const hs=[...hrs].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(a.painterName||'').localeCompare(b.painterName||''));
    const magWeg=h=>isK()||h.painterId===S.me.id;
    const wie = isK()
      ? `<label class="f"><span class="lbl">Schilder</span><select id="hf-p" required>${S.painters.map(x=>`<option value="${x.id}" ${(S.painterSel||S.me.id)===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>`
      : `<div class="f"><span class="lbl">Schilder</span><b>${esc(S.me.naam)}</b></div>`;
    body= p.archived
      ? `<div class="panel"><p class="muted">Dit project is afgerond; er kunnen geen uren meer bij.</p></div>`
      : `<form id="hrsForm" class="panel"><h3>Uren invullen</h3>${wie}
      <label class="f"><span class="lbl">Datum</span><input id="hf-date" type="date" value="${today()}" required></label>
      <div class="f"><span class="lbl">Dagdeel</span><div class="seg">${Object.entries(PARTS).map(([k,v])=>`<button type="button" data-part="${k}" aria-pressed="${S.hoursPart===k}">${v.label}<small>${v.h} uur</small></button>`).join('')}</div></div>
      <div class="row-actions"><button class="primary" type="submit">Uren opslaan</button></div></form>`;
    body+=`<div class="panel"><h3>Ingevulde uren</h3>${hs.length?`<div class="tbl"><table><thead><tr><th>Datum</th><th>Schilder</th><th>Dagdeel</th><th class="r">Uren</th><th></th></tr></thead><tbody>
      ${hs.map(h=>`<tr><td class="num" style="white-space:nowrap">${fmtDate(h.date)}</td><td>${esc(h.painterName)}</td><td>${PARTS[h.part]?.label||''}</td><td class="r num">${h.hours}</td><td class="r">${magWeg(h)?`<button class="ghost danger" data-delhrs="${h.id}">${S.confirm==='h'+h.id?'Zeker?':'×'}</button>`:''}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="3">Totaal</td><td class="r num">${num(c.spent)}</td><td></td></tr></tfoot></table></div>`:'<p class="muted">Nog geen uren ingevuld.</p>'}
      ${isK()?'':'<p class="note">Je ziet de uren van iedereen, maar kunt alleen je eigen uren verwijderen.</p>'}</div>`;
  } else {
    const by={}; hrs.forEach(h=>{ const k=h.painterId; by[k]=by[k]||{name:h.painterName,h:0,days:new Set()}; by[k].h+=+h.hours||0; by[k].days.add(h.date); });
    const rows=Object.values(by).sort((a,b)=>b.h-a.h); const tot=c.spent;
    const pool=Math.max(0,c.labour); const result=c.left*c.rate; const eff=tot?pool/tot:0; const effCol=eff<c.rate?'var(--bad)':'var(--good)';
    const diffH=c.avail-c.spent;
    body=(!tot?`<div class="panel"><h3>Nacalculatie</h3><p class="muted">Zodra er uren zijn ingevuld, zie je hier de werkelijke uren en het verdiende uurtarief.</p></div>`
      :`<div class="panel"><h3>${p.archived?'Eindafrekening':'Nacalculatie (tot nu toe)'}</h3><div class="calc num">
        <div class="row"><span>Begrote uren (${eur(c.rate)}/u)</span><span>${num(c.avail)} uur</span></div>
        <div class="row"><span>Werkelijk gewerkt</span><span>${num(c.spent)} uur</span></div>
        <div class="row"><span>Verschil</span><span style="color:${diffH<0?'var(--bad)':'var(--good)'}">${diffH<0?'':'+'}${num(diffH)} uur</span></div>
        <div class="row"><span>Verdiend uurtarief</span><span style="color:${effCol}">${eur(eff)} per uur</span></div>
      </div>${p.archived?'':'<p class="note">Zet het project op “afgerond” (via Wijzigen) voor de definitieve eindafrekening.</p>'}</div>`)
    +`<div class="panel"><h3>Verdeling naar rato van gewerkte uren</h3>
      <p class="note">Het arbeidsbudget (budget − materiaal = ${eur(c.labour)}) wordt verdeeld op basis van het aandeel uren per schilder. De kolom “Resultaat” is het aandeel in wat er over (of tekort) is.</p>
      ${rows.length?`<div class="tbl"><table><thead><tr><th>Schilder</th><th class="r">Uren</th><th class="r">Aandeel</th><th class="r hide-m">Arbeidsbudget</th><th class="r hide-m">Uurtarief</th><th class="r">Resultaat</th></tr></thead><tbody>
      ${rows.map(r=>{const sh=tot?r.h/tot:0; return `<tr><td>${esc(r.name)}<div class="note num">${r.days.size} ${r.days.size===1?'dag':'dagen'}</div></td><td class="r num">${num(r.h)}</td><td class="r"><div class="share"><div class="sbar hide-m"><span style="width:${sh*100}%"></span></div><span class="num" style="margin-left:auto">${num(sh*100,0)}%</span></div></td><td class="r num hide-m">${eur(pool*sh)}</td><td class="r num hide-m" style="color:${effCol}">${eur(r.h?pool*sh/r.h:0)}</td><td class="r num" style="color:${result<0?'var(--bad)':'var(--good)'}">${eur(result*sh)}</td></tr>`}).join('')}
      </tbody><tfoot><tr><td>Totaal</td><td class="r num">${num(tot)}</td><td class="r">100%</td><td class="r num hide-m">${eur(pool)}</td><td class="r num hide-m">${eur(eff)}</td><td class="r num">${eur(result)}</td></tr></tfoot></table></div>`:'<p class="muted">Zodra er uren zijn ingevuld, verschijnt hier de verdeling.</p>'}
    </div>`;
  }
  return `<div class="note num">${p.address?esc(p.address)+' · ':''}Budget ${eur(p.budget)} · ${eur(p.rate)}/u${p.archived?' · <span class="pill">Afgerond</span>':''}</div>
  <nav class="tabs" role="tablist">${tabs.map(([k,l])=>`<button role="tab" data-tab="${k}" aria-selected="${S.tab===k}">${l}</button>`).join('')}</nav>${body}`;
}

/* ---------- navigatie ---------- */
function openProject(pid){ S.pid=pid; S.view='project'; S.tab='overzicht'; S.rateTry=null; S.confirm=null; render(); }
function goHome(){ S.view='list'; S.pid=null; S.confirm=null; render(); }

/* ---------- events ---------- */
document.addEventListener('click', async e=>{
  const t=e.target.closest('button'); if(!t) return;
  const a=t.dataset.act;
  const confirmTwice=key=>{ if(S.confirm===key){ S.confirm=null; return true; } S.confirm=key; render(); setTimeout(()=>{ if(S.confirm===key){S.confirm=null;render();} },3500); return false; };
  if(t.dataset.open) return openProject(t.dataset.open);
  if(t.dataset.tab){ S.tab=t.dataset.tab; S.confirm=null; return render(); }
  if(t.dataset.cstep){ S.crew=Math.max(1,(+S.crew||1)+(+t.dataset.cstep)); return render(); }
  if(t.dataset.rstep){ const p=S.projects.find(x=>x.id===S.pid); const cur=(S.rateTry!=null&&+S.rateTry>0)?+S.rateTry:(+p.rate||0); S.rateTry=Math.max(1,cur+(+t.dataset.rstep)); return render(); }
  if(t.dataset.part){ S.hoursPart=t.dataset.part; document.querySelectorAll('[data-part]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.part===S.hoursPart)); return; }
  if(t.dataset.delmat){ if(confirmTwice('m'+t.dataset.delmat)) doe('matWeg',{mid:t.dataset.delmat},'Materiaal verwijderd'); return; }
  if(t.dataset.delhrs){ if(confirmTwice('h'+t.dataset.delhrs)) doe('urenWeg',{uid:t.dataset.delhrs},'Uren verwijderd'); return; }
  if(t.dataset.delpainter){ if(confirmTwice('p'+t.dataset.delpainter)) doe('schilderWeg',{sid:t.dataset.delpainter},'Schilder verwijderd'); return; }
  if(t.dataset.editpainter){ S.editPainter=t.dataset.editpainter; render(); const el=$('#pn-name'); if(el){ el.value=S.painters.find(x=>x.id===S.editPainter)?.name||''; el.scrollIntoView({block:'center'}); } return; }
  if(a==='cancelPainter'){ S.editPainter=null; ['pn-name','pn-pin'].forEach(i=>{const el=document.getElementById(i); if(el) el.value='';}); return render(); }
  if(a==='rateReset'){ S.rateTry=null; return render(); }
  if(a==='rateSave'){ const p=S.projects.find(x=>x.id===S.pid); const v=+S.rateTry; if(await doe('projectOpslaan',{pid:p.id,naam:p.name,adres:p.address,budget:p.budget,uurtarief:v,afgerond:p.archived},`Uurtarief ${eur(v)} opgeslagen`)){ S.rateTry=null; render(); } return; }
  if(a==='home') return goHome();
  if(a==='logout'){ bewaarSessie(null); S.me=null; S.loaded=false; S.view='login'; render(); laadNamen(); return; }
  if(a==='pin'){ S.view='pin'; return render(); }
  if(a==='backProject'){ const pid=S.back; S.back=null; openProject(pid); S.tab='uren'; return render(); }
  if(a==='painters'){ S.back=S.view==='project'?S.pid:null; S.editPainter=null; S.view='painters'; return render(); }
  if(a==='newProject'){ S.view='new'; return render(); }
  if(a==='editProject'){ S.view='edit'; return render(); }
  if(a==='cancelForm'){ return S.view==='edit'?openProject(S.pid):goHome(); }
  if(a==='delProject'){ if(confirmTwice('delProject')){ if(await doe('projectWeg',{pid:S.pid},'Project verwijderd')) goHome(); } return; }
});
document.addEventListener('input', e=>{ if(e.target.id==='crew'||e.target.id==='rateTry'){ const id=e.target.id, v=e.target.value; clearTimeout(render.t); if(v===''||!(+v>0)) return; if(id==='crew') S.crew=Math.round(+v); else S.rateTry=v; render.t=setTimeout(()=>{ render(); const el=document.getElementById(id); if(el) el.focus(); },400); } });
document.addEventListener('change', e=>{ if(e.target.id==='hf-p') S.painterSel=e.target.value; });
document.addEventListener('submit', async e=>{
  e.preventDefault(); const f=e.target;
  if(f.id==='loginForm'){
    const id=$('#lg-id').value, pin=$('#lg-pin').value.trim(); if(!id) return toast('Kies je naam.');
    try{ document.body.classList.add('busy'); const j=await api('login',{id,pin},false); bewaarSessie({id,pin}); S.me=j.me; S.view='list'; S.loaded=false; render(); await laad(); }
    catch(err){ toast(err.message); } finally{ document.body.classList.remove('busy'); }
  }
  if(f.id==='pinForm'){
    const a=$('#np-1').value.trim(), b=$('#np-2').value.trim();
    if(!/^\d{4,6}$/.test(a)) return toast('De pincode moet 4 tot 6 cijfers zijn.');
    if(a!==b) return toast('De pincodes zijn niet gelijk.');
    if(await doe('pinWijzigen',{nieuwePin:a},'Pincode gewijzigd')){ const s=sessie(); bewaarSessie({...s,pin:a}); goHome(); }
  }
  if(f.id==='projForm'){
    const d={ naam:$('#pf-name').value.trim(), adres:$('#pf-addr').value.trim(), budget:+$('#pf-budget').value, uurtarief:+$('#pf-rate').value };
    if(!(d.uurtarief>0)) return toast('Vul een uurtarief groter dan 0 in.');
    if(S.view==='edit'){ d.pid=S.pid; d.afgerond=$('#pf-arch').checked; if(await doe('projectOpslaan',d,'Project bijgewerkt')) openProject(S.pid); }
    else { if(S.busy) return; S.busy=true; try{ const j=await api('projectOpslaan',d); await laad(); toast('Project aangemaakt'); openProject(j.id); }catch(err){ toast(err.message); } finally{ S.busy=false; } }
  }
  if(f.id==='painterForm'){
    const d={ naam:$('#pn-name').value.trim(), pin:$('#pn-pin').value.trim(), rol:$('#pn-rol').value };
    if(!/^\d{4,6}$/.test(d.pin)) return toast('De pincode moet 4 tot 6 cijfers zijn.');
    if(S.editPainter) d.sid=S.editPainter;
    if(await doe('schilderOpslaan',d,S.editPainter?`${d.naam} bijgewerkt`:`${d.naam} toegevoegd`)){ S.editPainter=null; ['pn-name','pn-pin'].forEach(i=>{const el=document.getElementById(i); if(el) el.value='';}); render(); }
  }
  if(f.id==='matForm'){
    const d={project:S.pid,omschrijving:$('#mf-desc').value.trim(),bedrag:+$('#mf-amt').value,datum:$('#mf-date').value};
    if(await doe('matToevoegen',d,'Materiaal afgeboekt')) ['mf-desc','mf-amt'].forEach(i=>{const el=document.getElementById(i); if(el) el.value='';});
  }
  if(f.id==='hrsForm'){
    const sid=isK()?($('#hf-p').value||S.me.id):S.me.id, date=$('#hf-date').value, part=S.hoursPart;
    const naam=(S.painters.find(x=>x.id===sid)||{}).name||S.me.naam;
    if(projHours().some(h=>h.painterId===sid&&h.date===date&&(h.part==='dag'||part==='dag'||h.part===part))) return toast(`${naam} heeft op deze dag dit dagdeel al ingevuld.`);
    S.painterSel=sid;
    await doe('urenToevoegen',{project:S.pid,schilderId:sid,datum:date,dagdeel:part},`${PARTS[part].h} uur opgeslagen`);
  }
});

/* ---------- start ---------- */
async function laadNamen(){ if(!API) return; try{ const j=await api('namen',{},false); S.namen=j.namen; if(S.view==='login') render(); }catch(e){ toast(e.message); } }
(async()=>{
  if(!sessie()){ S.view='login'; render(); laadNamen(); return; }
  S.view='list'; render();
  try{ await laad(); }catch(e){ if(S.view!=='login'){ toast(e.message); } }
  // elke minuut verversen zolang de app open staat
  setInterval(()=>{ if(document.visibilityState==='visible'&&S.me&&!S.busy) laad().catch(()=>{}); },60000);
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'&&S.me&&!S.busy) laad().catch(()=>{}); });
})();
