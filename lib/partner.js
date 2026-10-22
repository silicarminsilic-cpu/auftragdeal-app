'use strict';
const K=require('./core');
const {h,q,one,all,val,ins,upd,int,num,str,chf,dt,now,date,time,cfg,go,flash,post,need,csrf_field,calc_doc,next_number,R,BRANCHES,arr,jparse}=K;
const U=require('./ui');const {layout,head,as_tag,doc_tag,post_btn,opts}=U;
const M=require('./market');const {wallet_balance,housekeeping,status_banner,nl2br}=M;
const trimZ=x=>{let s=(+x||0).toFixed(2);s=s.replace(/0+$/,'').replace(/\.$/,'');return s;};

function pg_p_dash(){
  const u=need('partner'),cid=int(u.company_id);
  const s=(sql,p=[])=>val(sql,[cid,...p]);
  const open=int(s("SELECT COUNT(*) FROM assignments WHERE company_id=? AND status='offered'"));
  const acc=int(s("SELECT COUNT(*) FROM assignments WHERE company_id=? AND status='accepted'"));
  const cl=int(s('SELECT COUNT(*) FROM clients WHERE company_id=?'));
  const oq=num(s("SELECT COALESCE(SUM(total),0) FROM docs WHERE company_id=? AND kind='quote' AND status IN ('draft','sent')"));
  const oi=num(s("SELECT COALESCE(SUM(total),0) FROM docs WHERE company_id=? AND kind='invoice' AND status IN ('open','sent','overdue')"));
  const pd=num(s("SELECT COALESCE(SUM(total),0) FROM docs WHERE company_id=? AND kind='invoice' AND status='paid' AND date>=?",[date('Y-01-01')]));
  const free=int(val('SELECT free_leads FROM companies WHERE id=?',[cid]));housekeeping();
  const mk=int(val("SELECT COUNT(*) FROM leads WHERE status='open' AND (expires IS NULL OR expires>?)",[now()]));
  const c=[['Leads im Markt',mk],['Direktangebote',open],['Gekaufte Leads',acc],['Guthaben (CHF)',chf(wallet_balance(cid))],['Gratis-Leads übrig',free],['Kunden im CRM',cl],['Offene Offerten (CHF)',chf(oq)],['Offene Rechnungen (CHF)',chf(oi)],['Bezahlt '+date('Y')+' (CHF)',chf(pd)]];
  let o=head('Willkommen, '+(u.name||u.company),u.company+' · Partner-Portal')+status_banner(u)+'<div class="cards">';for(const [l,v] of c)o+='<div class="card stat"><b class="num">'+h(v)+'</b><span>'+h(l)+'</span></div>';o+='</div>';
  if(open)o+='<div class="flash ok">Sie haben '+open+' Direktangebot(e). <a href="index.php?p=p_leads">Jetzt ansehen</a></div>';if(mk&&!open)o+='<div class="flash ok">'+mk+' Lead(s) im Markt. <a href="index.php?p=p_market">Zum Lead-Markt</a></div>';
  const r=all("SELECT a.*,l.branch,l.zip,l.city FROM assignments a JOIN leads l ON l.id=a.lead_id WHERE a.company_id=? AND a.status<>'declined' ORDER BY a.id DESC LIMIT 5",[cid]);
  o+='<div class="card"><h2 style="margin-bottom:10px">Letzte Leads</h2>';if(!r.length)o+='<div class="empty">Noch keine Leads. Sobald wir passende Anfragen haben, erscheinen sie hier.</div>';else{o+='<table>';for(const a of r)o+='<tr><td><b>'+h(a.branch)+'</b> · '+h(a.zip+' '+a.city)+'</td><td>'+dt(a.created)+'</td><td class="r">'+as_tag(a.status)+'</td></tr>';o+='</table>';}
  layout('Übersicht',o+'</div>','p_dash');
}

const client_form=(c={})=>'<div><label>Name / Firma</label><input name="name" value="'+h(c.name)+'" required></div><div><label>E-Mail</label><input type="email" name="email" value="'+h(c.email)+'"></div><div><label>Telefon</label><input name="phone" value="'+h(c.phone)+'"></div><div><label>Adresse</label><input name="address" value="'+h(c.address)+'"></div><div><label>PLZ</label><input name="zip" value="'+h(c.zip)+'"></div><div><label>Ort</label><input name="city" value="'+h(c.city)+'"></div><div class="full"><label>Notizen</label><textarea name="notes">'+h(c.notes)+'</textarea></div>';
const client_data=()=>({name:post('name'),email:post('email'),phone:post('phone'),address:post('address'),zip:post('zip'),city:post('city'),notes:post('notes')});

function pg_p_clients(){
  const u=need('partner'),cid=int(u.company_id),r0=R();
  if(r0.method==='POST'){if(post('name')===''){flash('Name fehlt.','err');go('p_clients');}const id=ins('clients',Object.assign(client_data(),{company_id:cid,created:now()}));flash('Kunde angelegt.');go('p_client',{id});}
  const qq=str(r0.G.q).trim();const like='%'+qq+'%';
  const r=all('SELECT c.*,(SELECT COUNT(*) FROM docs d WHERE d.client_id=c.id) AS nd FROM clients c WHERE company_id=? AND (name LIKE ? OR email LIKE ? OR city LIKE ?) ORDER BY id DESC',[cid,like,like,like]);
  let o=head('Kunden (CRM)','Ihre Kunden und Kontakte')+'<form class="row noprint" method="get" style="margin-bottom:14px"><input type="hidden" name="p" value="p_clients"><input name="q" value="'+h(qq)+'" placeholder="Suchen…" style="width:240px"><button class="btn ghost">Suchen</button></form>';
  if(!r.length)o+='<div class="card empty" style="margin-bottom:18px">Noch keine Kunden. Angenommene Leads erscheinen hier automatisch.</div>';else{o+='<div class="tw" style="margin-bottom:22px"><table><tr><th>Name</th><th>Kontakt</th><th>Ort</th><th class="r">Dokumente</th></tr>';for(const c of r)o+='<tr><td><a href="index.php?p=p_client&id='+c.id+'"><b>'+h(c.name)+'</b></a></td><td>'+h(c.email)+'<br><span class="muted sm">'+h(c.phone)+'</span></td><td>'+h(str(c.zip)+' '+str(c.city))+'</td><td class="r num">'+c.nd+'</td></tr>';o+='</table></div>';}
  o+='<div class="card"><h2 style="margin-bottom:12px">Neuer Kunde</h2><form method="post" class="f">'+csrf_field()+client_form()+'<div class="full"><button class="btn pri">Anlegen</button></div></form></div>';
  layout('Kunden',o,'p_clients');
}
function pg_p_client(){
  const u=need('partner'),cid=int(u.company_id),r0=R();const id=int(r0.G.id);const c=one('SELECT * FROM clients WHERE id=? AND company_id=?',[id,cid]);if(!c)go('p_clients');
  if(r0.method==='POST'){if(post('act')==='delete'){q('UPDATE docs SET client_id=NULL WHERE client_id=?',[id]);q('DELETE FROM clients WHERE id=?',[id]);flash('Kunde gelöscht.');go('p_clients');}upd('clients',id,client_data());flash('Gespeichert.');go('p_client',{id});}
  const d=all('SELECT * FROM docs WHERE client_id=? AND company_id=? ORDER BY id DESC',[id,cid]);
  let o=head(c.name,'Kunde seit '+dt(c.created),'<a class="btn ghost" href="index.php?p=p_clients">← Alle Kunden</a><a class="btn" href="index.php?p=p_docedit&kind=quote&client='+id+'">Offerte erstellen</a><a class="btn pri" href="index.php?p=p_docedit&kind=invoice&client='+id+'">Rechnung erstellen</a>')+'<div class="card" style="margin-bottom:20px"><form method="post" class="f">'+csrf_field()+client_form(c)+'<div class="full row"><button class="btn">Speichern</button></div></form><div style="margin-top:10px">'+post_btn('Kunde löschen','p_client',{id},{act:'delete'},'btn ghost sm','Kunde wirklich löschen?')+'</div></div><h2 style="margin-bottom:10px">Dokumente</h2>';
  o+=docs_table(d);layout(c.name,o,'p_clients');
}
function docs_table(d){if(!d.length)return '<div class="card empty">Noch keine Dokumente.</div>';let o='<div class="tw"><table><tr><th>Nr.</th><th>Art</th><th>Datum</th><th>Status</th><th class="r">Total CHF</th><th></th></tr>';for(const x of d)o+='<tr><td><a href="index.php?p=p_doc&id='+x.id+'"><b>'+h(x.number)+'</b></a></td><td>'+(x.kind==='quote'?'Offerte':'Rechnung')+'</td><td class="num">'+dt(x.date)+'</td><td>'+doc_tag(x.status)+'</td><td class="r num">'+chf(x.total)+'</td><td class="r"><a class="btn ghost sm" href="index.php?p=p_docedit&id='+x.id+'">Bearbeiten</a></td></tr>';return o+'</table></div>';}
function doclist(kind,page,title){
  const u=need('partner'),cid=int(u.company_id);
  const r=all('SELECT d.*,c.name AS cname FROM docs d LEFT JOIN clients c ON c.id=d.client_id WHERE d.company_id=? AND d.kind=? ORDER BY d.id DESC',[cid,kind]);
  const tot=num(val('SELECT COALESCE(SUM(total),0) FROM docs WHERE company_id=? AND kind=?',[cid,kind]));
  let o=head(title,r.length+' Dokument(e) · Total CHF '+chf(tot),'<a class="btn pri" href="index.php?p=p_docedit&kind='+kind+'">'+(kind==='quote'?'Neue Offerte':'Neue Rechnung')+'</a>');
  if(!r.length)o+='<div class="card empty">Noch keine '+h(title)+'.</div>';else{o+='<div class="tw"><table><tr><th>Nr.</th><th>Kunde</th><th>Datum</th><th>'+(kind==='quote'?'Gültig bis':'Fällig')+'</th><th>Status</th><th class="r">Total CHF</th><th></th></tr>';
    for(const x of r){let st=x.status;if(kind==='invoice'&&['open','sent'].includes(st)&&x.due&&x.due<date('Y-m-d'))st='overdue';o+='<tr><td><a href="index.php?p=p_doc&id='+x.id+'"><b>'+h(x.number)+'</b></a></td><td>'+h(x.cname)+'</td><td class="num">'+dt(x.date)+'</td><td class="num">'+dt(x.due)+'</td><td>'+doc_tag(st)+'</td><td class="r num">'+chf(x.total)+'</td><td class="r"><a class="btn ghost sm" href="index.php?p=p_docedit&id='+x.id+'">Bearbeiten</a></td></tr>';}o+='</table></div>';}
  layout(title,o,page);
}
const pg_p_quotes=()=>doclist('quote','p_quotes','Offerten');
const pg_p_invoices=()=>doclist('invoice','p_invoices','Rechnungen');
const plusDays=n=>date('Y-m-d',time()+n*86400);

function pg_p_docedit(){
  const u=need('partner'),cid=int(u.company_id),r0=R();const id0=int(r0.G.id);let id=id0;const d=id?one('SELECT * FROM docs WHERE id=? AND company_id=?',[id,cid]):null;if(id&&!d)go('p_dash');
  const kind=d?d.kind:(str(r0.G.kind)==='invoice'?'invoice':'quote'),isq=kind==='quote';
  if(r0.method==='POST'){
    if(post('act')==='delete'&&d){q('DELETE FROM docs WHERE id=?',[id]);flash('Dokument gelöscht.');go(isq?'p_quotes':'p_invoices');}
    if(post('act')==='toinvoice'&&d&&isq){const nid=ins('docs',{company_id:cid,client_id:d.client_id,kind:'invoice',number:next_number(cid,'invoice'),date:date('Y-m-d'),due:plusDays(30),status:'open',items:d.items,vat:d.vat,net:d.net,total:d.total,note:d.note,created:now()});q("UPDATE docs SET status='accepted' WHERE id=?",[id]);flash('Rechnung aus Offerte erstellt.');go('p_docedit',{id:nid});}
    const vat=num(post('vat',str(cfg('vat'))));
    const D=arr(r0.P.d),Q=arr(r0.P.q),Pp=arr(r0.P.p);const items=D.map((desc,i)=>({d:desc,q:Q[i]!==undefined?Q[i]:0,p:Pp[i]!==undefined?Pp[i]:0}));
    const [cl,net,tot]=calc_doc(items,vat);
    let client=int(post('client'));if(client&&!one('SELECT id FROM clients WHERE id=? AND company_id=?',[client,cid]))client=0;
    const row={client_id:client||null,date:post('date',date('Y-m-d')),due:post('due')||null,status:post('status',isq?'draft':'open'),items:JSON.stringify(cl),vat,net,total:tot,note:post('note')};
    if(d){upd('docs',id,row);flash('Gespeichert.');}else{id=ins('docs',Object.assign(row,{company_id:cid,kind,number:next_number(cid,kind),created:now()}));flash((isq?'Offerte':'Rechnung')+' erstellt.');}
    go('p_doc',{id});}
  let items=d?jparse(d.items,[]):[{d:'',q:1,p:''}];if(!items||!items.length)items=[{d:'',q:1,p:''}];
  const clients=all('SELECT id,name FROM clients WHERE company_id=? ORDER BY name',[cid]);const selc=int(d?d.client_id:(r0.G.client||0));
  const stat=isq?{draft:'Entwurf',sent:'Versendet',accepted:'Angenommen',declined:'Abgelehnt'}:{open:'Offen',sent:'Versendet',paid:'Bezahlt',overdue:'Überfällig'};
  let cl='<option value="">– wählen –</option>';for(const c of clients)cl+='<option value="'+c.id+'"'+(c.id==selc?' selected':'')+'>'+h(c.name)+'</option>';
  let rows='';for(const i of items)rows+='<tr><td><input name="d[]" value="'+h(i.d)+'" placeholder="Beschreibung"></td><td style="width:90px"><input name="q[]" value="'+h(i.q)+'" inputmode="decimal"></td><td style="width:120px"><input name="p[]" value="'+h(i.p)+'" inputmode="decimal"></td><td style="width:40px"><button type="button" class="btn ghost sm" onclick="this.closest(\'tr\').remove()">×</button></td></tr>';
  let o=head((d?'':'Neue ')+(isq?'Offerte':'Rechnung')+(d?' '+d.number:''),'','<a class="btn ghost" href="index.php?p='+(isq?'p_quotes':'p_invoices')+'">← Zurück</a>')+'<div class="card"><form method="post">'+csrf_field()+'<div class="f" style="margin-bottom:16px"><div><label>Kunde</label><select name="client">'+cl+'</select></div><div><label>Status</label><select name="status">'+opts(stat,d?d.status:Object.keys(stat)[0],true)+'</select></div><div><label>Datum</label><input type="date" name="date" value="'+h(d?d.date:date('Y-m-d'))+'"></div><div><label>'+(isq?'Gültig bis':'Zahlbar bis')+'</label><input type="date" name="due" value="'+h(d&&d.due!==undefined&&d.due!==null?d.due:plusDays(30))+'"></div></div><div class="tw" style="margin-bottom:12px"><table class="items" id="it"><tr><th>Position</th><th>Menge</th><th>Preis CHF</th><th></th></tr>'+rows+'</table></div><button type="button" class="btn ghost sm" onclick="addRow()">+ Position</button><div class="f" style="margin-top:16px"><div><label>MwSt %</label><input name="vat" value="'+h(d?d.vat:cfg('vat'))+'"></div><div class="full"><label>Bemerkung / Zahlungsbedingungen</label><textarea name="note">'+h(d?d.note:'')+'</textarea></div></div><div class="row" style="margin-top:16px"><button class="btn pri">Speichern</button></div></form>'
   +'<div class="row" style="margin-top:12px">'+(d&&isq?post_btn('In Rechnung umwandeln','p_docedit',{id},{act:'toinvoice'},'btn'):'')+(d?post_btn('Löschen','p_docedit',{id},{act:'delete'},'btn ghost sm','Dokument wirklich löschen?'):'')+'</div></div><script>function addRow(){var t=document.getElementById("it"),r=t.insertRow(-1);r.innerHTML=\'<td><input name="d[]" placeholder="Beschreibung"></td><td style="width:90px"><input name="q[]" value="1" inputmode="decimal"></td><td style="width:120px"><input name="p[]" inputmode="decimal"></td><td style="width:40px"><button type="button" class="btn ghost sm" onclick="this.closest(\\\'tr\\\').remove()">×</button></td>\'}</script>';
  layout('Dokument',o,isq?'p_quotes':'p_invoices');
}
function pg_p_doc(){
  const u=need('partner'),cid=int(u.company_id),r0=R();const id=int(r0.G.id);const d=one('SELECT * FROM docs WHERE id=? AND company_id=?',[id,cid]);if(!d)go('p_dash');
  const co=one('SELECT * FROM companies WHERE id=?',[cid]);const cl=d.client_id?one('SELECT * FROM clients WHERE id=?',[d.client_id]):null;const items=jparse(d.items,[])||[];const isq=d.kind==='quote';
  let o=head((isq?'Offerte ':'Rechnung ')+d.number,'','<a class="btn ghost noprint" href="index.php?p='+(isq?'p_quotes':'p_invoices')+'">← Zurück</a><a class="btn ghost noprint" href="index.php?p=p_docedit&id='+id+'">Bearbeiten</a><button class="btn pri noprint" onclick="window.print()">Drucken / PDF</button>');
  o+='<div class="card" style="max-width:820px"><div class="row" style="justify-content:space-between;align-items:flex-start;margin-bottom:28px"><div><h2>'+h(co.name)+'</h2><div class="sm muted">'+h(co.address)+'<br>'+h((str(co.zip)+' '+str(co.city)).trim())+'<br>'+h(co.phone)+' · '+h(co.email)+(co.uid?'<br>UID: '+h(co.uid):'')+'</div></div><div style="text-align:right"><h1>'+(isq?'Offerte':'Rechnung')+'</h1><div class="sm muted">Nr. '+h(d.number)+'<br>Datum: '+dt(d.date)+'<br>'+(isq?'Gültig bis: ':'Zahlbar bis: ')+dt(d.due)+'</div></div></div>';
  if(cl)o+='<p style="margin:0 0 22px"><b>'+h(cl.name)+'</b><br>'+h(cl.address)+'<br>'+h((str(cl.zip)+' '+str(cl.city)).trim())+'</p>';
  o+='<table><tr><th>Position</th><th class="r">Menge</th><th class="r">Preis</th><th class="r">Betrag</th></tr>';for(const i of items)o+='<tr><td>'+nl2br(i.d)+'</td><td class="r num">'+h(trimZ(i.q))+'</td><td class="r num">'+chf(i.p)+'</td><td class="r num">'+chf(i.q*i.p)+'</td></tr>';
  o+='<tr><td colspan="3" class="r">Zwischensumme</td><td class="r num">'+chf(d.net)+'</td></tr><tr><td colspan="3" class="r">MwSt '+h(trimZ(d.vat))+'%</td><td class="r num">'+chf(d.total-d.net)+'</td></tr><tr><td colspan="3" class="r"><b>Total CHF</b></td><td class="r num"><b>'+chf(d.total)+'</b></td></tr></table>';
  if(d.note)o+='<p class="sm" style="margin-top:20px">'+nl2br(d.note)+'</p>';
  layout('Dokument',o+'</div>',isq?'p_quotes':'p_invoices');
}
function svc_boxes(services){const sel=jparse(services,[])||[];return BRANCHES.map(b=>'<label style="display:flex;gap:6px;align-items:center;font-weight:600;margin:0 14px 6px 0"><input type="checkbox" name="svc[]" value="'+h(b)+'" style="width:auto"'+(sel.includes(b)?' checked':'')+'>'+h(b)+'</label>').join('');}
function pg_p_profile(){
  const u=need('partner'),cid=int(u.company_id),r0=R();const c=one('SELECT * FROM companies WHERE id=?',[cid]);
  if(r0.method==='POST'){const sv=arr(r0.P['svc[]']!==undefined?r0.P['svc[]']:r0.P.svc).map(str);
    upd('companies',cid,{name:post('name')||c.name,contact:post('contact'),phone:post('phone'),uid:post('uid'),web:post('web'),address:post('address'),zip:post('zip'),city:post('city'),plz_ranges:post('plz_ranges'),notify:r0.P.notify!==undefined?1:0,services:JSON.stringify(BRANCHES.filter(b=>sv.includes(b)))});
    flash('Firmenprofil gespeichert. Diese Angaben erscheinen auf Offerten und Rechnungen.');go('p_profile');}
  const o=head('Firmenprofil','Diese Angaben erscheinen auf Ihren Offerten und Rechnungen')+'<div class="card"><form method="post" class="f">'+csrf_field()+'<div><label>Firma</label><input name="name" value="'+h(c.name)+'" required></div><div><label>Ansprechperson</label><input name="contact" value="'+h(c.contact)+'"></div><div><label>Telefon</label><input name="phone" value="'+h(c.phone)+'"></div><div><label>UID / MwSt-Nr.</label><input name="uid" value="'+h(c.uid)+'" placeholder="CHE-123.456.789"></div><div><label>Website</label><input name="web" value="'+h(c.web)+'"></div><div><label>Strasse &amp; Nr.</label><input name="address" value="'+h(c.address)+'"></div><div><label>PLZ</label><input name="zip" value="'+h(c.zip)+'"></div><div><label>Ort</label><input name="city" value="'+h(c.city)+'"></div><div class="full"><label>Leistungen / Branchen (bestimmt, welche Leads Sie sehen)</label><div class="row">'+svc_boxes(c.services)+'</div></div><div class="full"><label>Einsatzgebiet (PLZ-Bereiche, leer = ganze Schweiz)</label><input name="plz_ranges" value="'+h(c.plz_ranges)+'" placeholder="z.B. 8000-8999, 6300-6499"></div><div class="full"><label style="display:flex;gap:10px;align-items:center"><input type="checkbox" name="notify" style="width:auto"'+(c.notify?' checked':'')+'> Bei neuen passenden Leads per E-Mail informieren</label></div><div class="full"><button class="btn pri">Speichern</button></div></form></div>';
  layout('Firmenprofil',o,'p_profile');
}
module.exports={pages:{p_dash:pg_p_dash,p_clients:pg_p_clients,p_client:pg_p_client,p_quotes:pg_p_quotes,p_invoices:pg_p_invoices,p_docedit:pg_p_docedit,p_doc:pg_p_doc,p_profile:pg_p_profile}};
