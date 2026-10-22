'use strict';
const K=require('./core');
const {h,q,one,all,val,ins,upd,int,num,str,chf,dt,dtt,now,date,cfg,jcsv,emailok,go,flash,me,post,postArr,need,csrf_field,make_token,send_mail,base_url,logit,R,S,sendRaw,BRANCHES,CO_STATUS,LEAD_STATUS}=K;
const U=require('./ui');const {layout,head,tag,co_tag,lead_tag,as_tag,post_btn,opts}=U;
const M=require('./market');const {setting,wallet_add,wallet_balance,topup_ref,intake_check,publish_lead,sold_count,lead_price,lead_price_full,lead_max,housekeeping,branch_prices,nl2br}=M;
const price_for_branch=b=>{const p=branch_prices();return num(p[b]!==undefined?p[b]:setting('default_price'));};
const ci=(a,b)=>str(a).toLowerCase().includes(str(b).toLowerCase());

function pg_a_dash(){
  need('admin');const s=sql=>int(val(sql));
  const c=[['Neue Firmen (zu prüfen)',s("SELECT COUNT(*) FROM companies WHERE status='pending'")],['Aktive Partnerfirmen',s("SELECT COUNT(*) FROM companies WHERE status='active'")],['Anfragen zu prüfen',s("SELECT COUNT(*) FROM leads WHERE status='new'")],['Leads im Markt',s("SELECT COUNT(*) FROM leads WHERE status='open'")],['Verkaufte Leads',s("SELECT COUNT(*) FROM assignments WHERE status='accepted'")],['Offene Reklamationen',s("SELECT COUNT(*) FROM assignments WHERE claim_status='open'")],['Umsatz (CHF)',chf(num(val("SELECT COALESCE(SUM(price),0) FROM assignments WHERE status='accepted'")))]];housekeeping();
  let o=head('Übersicht','Aktueller Stand der Plattform')+'<div class="cards">';for(const [l,v] of c)o+='<div class="card stat"><b class="num">'+h(v)+'</b><span>'+h(l)+'</span></div>';o+='</div><div class="grid2">';
  o+='<div class="card"><h2 style="margin-bottom:10px">Neue Firmen</h2>';
  let r=all('SELECT * FROM companies ORDER BY id DESC LIMIT 6');
  if(!r.length)o+='<div class="empty">Noch keine Registrierungen.</div>';else{o+='<table>';for(const x of r)o+='<tr><td><a href="index.php?p=a_company&id='+x.id+'"><b>'+h(x.name)+'</b></a><br><span class="muted sm">'+h(x.contact)+' · '+dt(x.created)+'</span></td><td class="r">'+co_tag(x.status)+'</td></tr>';o+='</table>';}
  o+='</div><div class="card"><h2 style="margin-bottom:10px">Neue Anfragen</h2>';
  r=all('SELECT * FROM leads ORDER BY id DESC LIMIT 6');
  if(!r.length)o+='<div class="empty">Noch keine Anfragen.</div>';else{o+='<table>';for(const x of r)o+='<tr><td><a href="index.php?p=a_lead&id='+x.id+'"><b>'+h(x.branch)+'</b> in '+h(str(x.zip)+' '+str(x.city))+'</a><br><span class="muted sm">'+h(x.name)+' · '+dt(x.created)+'</span></td><td class="r">'+lead_tag(x.status)+'</td></tr>';o+='</table>';}
  layout('Übersicht',o+'</div></div>','a_dash');
}

function pg_a_companies(){
  need('admin');const G=R().G;const st=str(G.s),qq=str(G.q).trim();
  let w='1=1';const a=[];if(CO_STATUS[st]){w+=' AND status=?';a.push(st);}if(qq!==''){w+=' AND (name LIKE ? OR email LIKE ? OR contact LIKE ?)';a.push('%'+qq+'%','%'+qq+'%','%'+qq+'%');}
  const r=all(`SELECT c.*,(SELECT COUNT(*) FROM assignments a WHERE a.company_id=c.id AND a.status='accepted') AS acc FROM companies c WHERE ${w} ORDER BY (status='pending') DESC,id DESC`,a);
  const f='<form class="row noprint" method="get"><input type="hidden" name="p" value="a_companies"><select name="s" style="width:auto" onchange="this.form.submit()"><option value="">Alle Status</option>'+opts(CO_STATUS,st,true)+'</select><input name="q" value="'+h(qq)+'" placeholder="Suchen…" style="width:200px"><button class="btn ghost">Suchen</button></form>';
  let o=head('Firmen','Registrierte Partnerunternehmen','<a class="btn ghost" href="index.php?p=a_export&t=companies">CSV Export</a>')+f+'<div style="height:14px"></div>';
  if(!r.length)o+='<div class="card empty">Keine Firmen gefunden.</div>';else{
    o+='<div class="tw"><table><tr><th>Firma</th><th>Kontakt</th><th>Leistungen</th><th>Registriert</th><th>Gratis-Leads</th><th>Angenommen</th><th>Status</th></tr>';
    for(const x of r)o+='<tr><td><a href="index.php?p=a_company&id='+x.id+'"><b>'+h(x.name)+'</b></a></td><td>'+h(x.contact)+'<br><span class="muted sm">'+h(x.email)+'</span></td><td class="sm">'+h(jcsv(x.services))+'</td><td class="num">'+dt(x.created)+'</td><td class="num">'+int(x.free_leads)+'</td><td class="num">'+int(x.acc)+'</td><td>'+co_tag(x.status)+'</td></tr>';
    o+='</table></div>';}
  layout('Firmen',o,'a_companies');
}
const company_user=cid=>one("SELECT * FROM users WHERE company_id=? AND role='partner' ORDER BY id LIMIT 1",[cid]);
const invite_link=u=>base_url()+'/index.php?p=setpw&t='+make_token(int(u.id),'setpw');

function pg_a_company(){
  need('admin');const r0=R();const id=int(r0.G.id);const c=one('SELECT * FROM companies WHERE id=?',[id]);if(!c){flash('Firma nicht gefunden.','err');go('a_companies');}
  if(r0.method==='POST'){const act=post('act');
    if(act==='approve'||act==='invite'){
      let usr=company_user(id);
      if(usr&&act==='approve'){upd('companies',id,{status:'active',free_leads:c.approved_at?int(c.free_leads):int(setting('free_leads')),approved_at:c.approved_at||now()});logit('Firma freigegeben: '+c.name);
        send_mail(str(usr.email),'Ihre Firma ist freigeschaltet – auftragdeal.ch','Guten Tag '+c.contact+'\n\nIhre Firma '+c.name+' ist freigeschaltet.'+(c.approved_at?'':' Sie haben '+setting('free_leads')+' Gratis-Leads erhalten.')+'\n\nZum Lead-Markt:\n'+base_url()+'/index.php?p=p_market\n\nauftragdeal.ch');
        flash('Firma freigegeben. Die Firma wurde per E-Mail informiert.');go('a_company',{id});}
      if(!usr){if(!emailok(str(c.email))){flash('Firma hat keine gültige E-Mail.','err');go('a_company',{id});}
        if(one('SELECT id FROM users WHERE email=?',[str(c.email).toLowerCase()])){flash('Diese E-Mail ist bereits einem anderen Konto zugeordnet.','err');go('a_company',{id});}
        const uid=ins('users',{email:str(c.email).toLowerCase(),pass:null,role:'partner',name:c.contact,phone:c.phone,company_id:id,created:now()});usr=one('SELECT * FROM users WHERE id=?',[uid]);}
      if(act==='approve'){const fl=c.approved_at?int(c.free_leads):int(setting('free_leads'));upd('companies',id,{status:'active',free_leads:fl,approved_at:c.approved_at||now()});logit('Firma freigegeben: '+c.name);}
      const link=invite_link(usr);
      const sent=send_mail(str(usr.email),'Ihr Zugang zu auftragdeal.ch','Guten Tag '+c.contact+'\n\nIhre Firma '+c.name+' wurde bei auftragdeal.ch freigeschaltet.\nBitte legen Sie hier Ihr Passwort fest (Link 7 Tage gültig):\n\n'+link+'\n\nIm Partner-Portal finden Sie Ihre Leads, CRM, Offerten und Rechnungen – kostenlos. Die ersten '+cfg('free_leads')+' Leads schenken wir Ihnen.\n\nFreundliche Grüsse\nauftragdeal.ch');
      S()['invite_'+id]=link;flash(act==='approve'?'Firma freigegeben. '+(sent?'Einladung wurde per E-Mail gesendet.':'E-Mail konnte nicht gesendet werden – bitte Link unten manuell versenden.'):'Neuer Zugangslink erstellt.');}
    else if(act==='block'){upd('companies',id,{status:'blocked'});logit('Firma gesperrt: '+c.name);flash('Firma gesperrt.');}
    else if(act==='unblock'){upd('companies',id,{status:'active'});flash('Firma entsperrt.');}
    else if(act==='save'){upd('companies',id,{name:post('name'),contact:post('contact'),phone:post('phone'),web:post('web'),notes:post('notes'),free_leads:Math.max(0,int(post('free_leads')))});flash('Gespeichert.');}
    else if(act==='wallet'){const amt=num(post('amount'));if(!amt){flash('Betrag fehlt.','err');go('a_company',{id});}const type=post('type')==='adjust'?'adjust':'topup';wallet_add(id,amt,type,topup_ref(id),post('note'),int(me().id));logit('Guthaben gebucht '+chf(amt)+' für '+c.name);flash('Gebucht: CHF '+chf(amt)+'. Neuer Kontostand CHF '+chf(wallet_balance(id))+'.');}
    else if(act==='credit'){upd('companies',id,{credit_limit:Math.max(0,num(post('credit_limit')))});flash('Kreditlimite gespeichert.');}
    else if(act==='delete'){for(const t of ['wallet','assignments','users','clients','docs'])q(`DELETE FROM ${t} WHERE company_id=?`,[id]);q('DELETE FROM companies WHERE id=?',[id]);logit('Firma gelöscht: '+c.name);flash('Firma gelöscht.');go('a_companies');}
    go('a_company',{id});}
  const usr=company_user(id);const link=S()['invite_'+id]||null;delete S()['invite_'+id];
  const ac=all('SELECT a.*,l.branch,l.zip,l.city FROM assignments a JOIN leads l ON l.id=a.lead_id WHERE a.company_id=? ORDER BY a.id DESC LIMIT 20',[id]);
  const kv=[['Status',co_tag(c.status)],['Ansprechperson',h(c.contact)],['E-Mail',h(c.email)],['Telefon',h(c.phone)],['UID',h(c.uid)],['Website',h(c.web)],['Leistungen',h(jcsv(c.services))],['Kantone',h(jcsv(c.cantons))],['Radius',h(c.radius==='0'?'schweizweit':str(c.radius)+' km')],['Kapazität',h(c.capacity)],['Standorte',h(jcsv(c.locations))],['Sprache',h(str(c.lang).toUpperCase())],['Registriert',dtt(c.created)],['Quelle',h(c.source)],['Zugang',usr?h(usr.email)+(usr.pass?' · Passwort gesetzt, letzter Login '+dtt(usr.last_login):' · Passwort noch nicht gesetzt'):'noch nicht erstellt']];
  let o=head(c.name,'Firmenprofil','<a class="btn ghost" href="index.php?p=a_companies">← Alle Firmen</a>');
  if(link)o+='<div class="card" style="margin-bottom:16px"><h3>Zugangslink für die Firma</h3><p class="sm muted">Falls die Mail nicht ankommt, diesen Link direkt senden (7 Tage gültig):</p><div class="link">'+h(link)+'</div></div>';
  o+='<div class="grid2"><div class="card"><h2 style="margin-bottom:12px">Angaben</h2><dl class="kv">';for(const [k,v] of kv)o+='<dt>'+h(k)+'</dt><dd>'+v+'</dd>';o+='</dl><hr style="border:0;border-top:1px solid var(--line);margin:16px 0"><div class="row">';
  if(c.status==='pending')o+=post_btn('Freigeben &amp; Zugang senden','a_company',{id},{act:'approve'},'btn pri');
  else if(c.status==='active')o+=post_btn('Zugangslink neu erstellen','a_company',{id},{act:'invite'},'btn ghost sm')+post_btn('Sperren','a_company',{id},{act:'block'},'btn red sm','Firma wirklich sperren?');
  else o+=post_btn('Entsperren','a_company',{id},{act:'unblock'},'btn');
  o+=post_btn('Löschen','a_company',{id},{act:'delete'},'btn ghost sm','Firma mit allen Daten unwiderruflich löschen?')+'</div></div>';
  o+='<div class="card"><h2 style="margin-bottom:12px">Bearbeiten</h2><form method="post" class="f">'+csrf_field()+'<input type="hidden" name="act" value="save"><div><label>Firma</label><input name="name" value="'+h(c.name)+'" required></div><div><label>Ansprechperson</label><input name="contact" value="'+h(c.contact)+'"></div><div><label>Telefon</label><input name="phone" value="'+h(c.phone)+'"></div><div><label>Website</label><input name="web" value="'+h(c.web)+'"></div><div><label>Gratis-Leads (Guthaben)</label><input type="number" min="0" name="free_leads" value="'+int(c.free_leads)+'"></div><div class="full"><label>Interne Notizen</label><textarea name="notes">'+h(c.notes)+'</textarea></div><div class="full"><button class="btn">Speichern</button></div></form></div></div>';
  const bal=wallet_balance(id);
  o+='<div class="card" style="margin-top:16px"><h2 style="margin-bottom:6px">Guthaben: CHF '+chf(bal)+' <span class="muted sm" style="font-weight:400">· Referenz '+h(topup_ref(id))+' · Kreditlimite CHF '+chf(c.credit_limit)+'</span></h2><div class="grid2"><form method="post" class="f">'+csrf_field()+'<input type="hidden" name="act" value="wallet"><div><label>Betrag CHF (negativ = abziehen)</label><input name="amount" required></div><div><label>Art</label><select name="type"><option value="topup">Einzahlung</option><option value="adjust">Korrektur</option></select></div><div class="full"><label>Notiz</label><input name="note" placeholder="z.B. Überweisung vom 22.10."></div><div class="full"><button class="btn">Buchen</button></div></form><form method="post" class="f">'+csrf_field()+'<input type="hidden" name="act" value="credit"><div class="full"><label>Kreditlimite CHF (erlaubt Käufe ins Minus)</label><input name="credit_limit" value="'+h(c.credit_limit)+'"></div><div class="full"><button class="btn ghost">Speichern</button></div></form></div></div>';
  o+='<h2 style="margin:22px 0 10px">Leads dieser Firma</h2>';
  if(!ac.length)o+='<div class="card empty">Noch keine Leads zugewiesen.</div>';else{o+='<div class="tw"><table><tr><th>Lead</th><th>Status</th><th class="r">Preis</th><th>Datum</th></tr>';for(const a of ac)o+='<tr><td><a href="index.php?p=a_lead&id='+a.lead_id+'">#'+a.lead_id+' '+h(a.branch)+' · '+h(a.zip+' '+a.city)+'</a></td><td>'+as_tag(a.status)+(a.is_free?' '+tag('Gratis','ok'):'')+'</td><td class="r num">'+chf(a.price)+'</td><td class="num">'+dt(a.created)+'</td></tr>';o+='</table></div>';}
  layout(c.name,o,'a_companies');
}

function pg_a_leads(){
  need('admin');const r0=R();
  if(r0.method==='POST'){
    const n=post('name');if(!n||post('branch')===''){flash('Name und Branche angeben.','err');go('a_leads');}
    const id=ins('leads',{name:n,email:post('email'),phone:post('phone'),branch:post('branch'),zip:post('zip'),city:post('city'),description:post('description'),when_:post('when'),budget:post('budget'),status:'new',source:'admin',created:now()});
    intake_check(id);logit(`Lead #${id} erfasst`);flash('Anfrage erfasst.');go('a_lead',{id});}
  const st=str(r0.G.s);let w='1=1';const a=[];if(LEAD_STATUS[st]){w='l.status=?';a.push(st);}
  const r=all(`SELECT l.*,(SELECT COUNT(*) FROM assignments x WHERE x.lead_id=l.id) AS n,(SELECT COUNT(*) FROM assignments x WHERE x.lead_id=l.id AND x.status='accepted') AS acc FROM leads l WHERE ${w} ORDER BY l.id DESC LIMIT 300`,a);
  let o=head('Anfragen / Leads','Aufträge von Auftraggebern','<a class="btn ghost" href="index.php?p=a_export&t=leads">CSV Export</a>')+'<form class="row noprint" method="get" style="margin-bottom:14px"><input type="hidden" name="p" value="a_leads"><select name="s" style="width:auto" onchange="this.form.submit()"><option value="">Alle Status</option>'+opts(LEAD_STATUS,st,true)+'</select></form>';
  if(!r.length)o+='<div class="card empty" style="margin-bottom:18px">Keine Anfragen.</div>';else{o+='<div class="tw" style="margin-bottom:22px"><table><tr><th>#</th><th>Branche</th><th>Ort</th><th>Kontakt</th><th>Eingang</th><th>Verkauft</th><th>Status</th></tr>';
    for(const x of r)o+='<tr><td class="num">'+x.id+'</td><td><a href="index.php?p=a_lead&id='+x.id+'"><b>'+h(x.branch)+'</b></a></td><td>'+h(str(x.zip)+' '+str(x.city))+'</td><td>'+h(x.name)+'<br><span class="muted sm">'+h(x.email)+'</span></td><td class="num">'+dtt(x.created)+'</td><td class="num">'+x.acc+'/'+x.n+'</td><td>'+lead_tag(x.status)+'</td></tr>';o+='</table></div>';}
  o+='<div class="card"><h2 style="margin-bottom:12px">Anfrage manuell erfassen</h2><form method="post" class="f">'+csrf_field()+'<div><label>Name</label><input name="name" required></div><div><label>Branche</label><select name="branch">'+opts(BRANCHES)+'</select></div><div><label>E-Mail</label><input type="email" name="email"></div><div><label>Telefon</label><input name="phone"></div><div><label>PLZ</label><input name="zip"></div><div><label>Ort</label><input name="city"></div><div><label>Wunschtermin</label><input name="when"></div><div><label>Budget</label><input name="budget"></div><div class="full"><label>Beschreibung</label><textarea name="description"></textarea></div><div class="full"><button class="btn pri">Erfassen</button></div></form></div>';
  layout('Anfragen',o,'a_leads');
}

function pg_a_lead(){
  need('admin');const r0=R();const id=int(r0.G.id);const l=one('SELECT * FROM leads WHERE id=?',[id]);if(!l){flash('Anfrage nicht gefunden.','err');go('a_leads');}
  if(r0.method==='POST'){const act=post('act');
    if(act==='assign'){const ids=postArr('co[]').concat(postArr('co')).map(int);const price=num(post('price','0'));let n=0;
      for(const cid of ids){if(!one("SELECT id FROM companies WHERE id=? AND status='active'",[cid]))continue;if(one('SELECT id FROM assignments WHERE lead_id=? AND company_id=?',[id,cid]))continue;ins('assignments',{lead_id:id,company_id:cid,status:'offered',price,created:now()});n++;
        const u=company_user(cid);if(u)send_mail(str(u.email),'Neuer Lead: '+l.branch+' in '+l.city,'Guten Tag\n\nFür Sie steht ein neuer Lead bereit: '+l.branch+' in '+(str(l.zip)+' '+str(l.city)).trim()+'.\nBitte im Partner-Portal ansehen und annehmen:\n'+base_url()+'/index.php?p=p_leads\n\nauftragdeal.ch');}
      logit(`Lead #${id} direkt angeboten an ${n} Firma(en)`);flash(n?`Direktangebot an ${n} Firma(en) gesendet.`:'Keine Firma ausgewählt (oder bereits zugewiesen).',n?'ok':'err');}
    else if(act==='publish'){publish_lead(id,num(post('price')),int(post('max')));flash('Lead ist jetzt im Markt. Passende Firmen werden informiert.');}
    else if(act==='unpublish'){q("UPDATE leads SET status='closed' WHERE id=?",[id]);flash('Lead aus dem Markt genommen.');}
    else if(act==='status'&&LEAD_STATUS[post('status')]){upd('leads',id,{status:post('status')});flash('Status geändert.');}
    else if(act==='unassign'){q("DELETE FROM assignments WHERE id=? AND lead_id=? AND status='offered'",[int(post('aid')),id]);flash('Zuweisung entfernt.');}
    else if(act==='delete'){q('DELETE FROM leads WHERE id=?',[id]);logit(`Lead #${id} gelöscht`);flash('Anfrage gelöscht.');go('a_leads');}
    go('a_lead',{id});}
  const as=all('SELECT a.*,c.name FROM assignments a JOIN companies c ON c.id=a.company_id WHERE a.lead_id=? ORDER BY a.id',[id]);
  const taken=as.map(a=>a.company_id);
  const cos=all("SELECT * FROM companies WHERE status='active' ORDER BY name");
  let o=head('Anfrage #'+id+' · '+l.branch,dtt(l.created)+' · Quelle: '+(l.source||'Website'),'<a class="btn ghost" href="index.php?p=a_leads">← Alle Anfragen</a>')+'<div class="grid2"><div class="card"><h2 style="margin-bottom:12px">Details</h2><dl class="kv"><dt>Status</dt><dd>'+lead_tag(l.status)+'</dd><dt>Name</dt><dd>'+h(l.name)+'</dd><dt>E-Mail</dt><dd>'+h(l.email)+'</dd><dt>Telefon</dt><dd>'+h(l.phone)+'</dd><dt>Ort</dt><dd>'+h(str(l.zip)+' '+str(l.city))+'</dd><dt>Wunschtermin</dt><dd>'+h(l.when_)+'</dd><dt>Budget</dt><dd>'+h(l.budget)+'</dd><dt>Beschreibung</dt><dd>'+nl2br(l.description)+'</dd></dl><hr style="border:0;border-top:1px solid var(--line);margin:16px 0"><form method="post" class="row">'+csrf_field()+'<input type="hidden" name="act" value="status"><select name="status" style="width:auto">'+opts(LEAD_STATUS,l.status,true)+'</select><button class="btn ghost sm">Status setzen</button></form><div style="margin-top:10px">'+post_btn('Anfrage löschen','a_lead',{id},{act:'delete'},'btn ghost sm','Anfrage wirklich löschen?')+'</div></div>';
  const sold=sold_count(id);let pub='<div class="card"><h2 style="margin-bottom:6px">Lead-Markt</h2>';
  if(l.flag)pub+='<div class="flash err" style="background:var(--amber-bg);color:var(--amber)">Auffälligkeit: '+h(l.flag)+'</div>';
  if(l.status==='open')pub+='<p>Im Markt seit '+dtt(l.published)+' · läuft ab '+dtt(l.expires)+'<br>Preis aktuell <b>CHF '+chf(lead_price(l))+'</b> (Basis CHF '+chf(lead_price_full(l))+') · Verkauft '+sold+' von '+lead_max(l)+'</p>'+post_btn('Aus Markt nehmen','a_lead',{id},{act:'unpublish'},'btn ghost sm');
  else if(['new','expired','closed'].includes(l.status))pub+='<form method="post" class="f">'+csrf_field()+'<input type="hidden" name="act" value="publish"><div><label>Preis CHF (leer = '+chf(price_for_branch(str(l.branch)))+')</label><input name="price" value="'+h(l.price)+'"></div><div><label>Max. Käufer (leer = '+h(setting('max_buyers'))+')</label><input type="number" min="1" name="max" value="'+h(l.max_buyers)+'"></div><div class="full"><button class="btn pri">Im Markt veröffentlichen</button></div></form>';
  else pub+='<p class="muted">Dieser Lead ist ausverkauft ('+sold+' Käufer).</p>';
  o+=pub+'</div><div class="card"><h2 style="margin-bottom:12px">Direktangebot an Partner</h2>';
  let cand=cos.filter(c=>!taken.includes(c.id));
  if(!cand.length)o+='<p class="muted">Keine weiteren aktiven Firmen verfügbar.</p>';else{
    cand=cand.map(c=>[c,ci(c.services,l.branch)?0:1]).sort((a,b)=>a[1]-b[1]).map(x=>x[0]);
    o+='<form method="post">'+csrf_field()+'<input type="hidden" name="act" value="assign"><div style="max-height:260px;overflow:auto;margin-bottom:12px">';
    for(const c of cand){const m=ci(c.services,l.branch);o+='<label style="display:flex;gap:10px;align-items:flex-start;font-weight:600;padding:6px 0;margin:0"><input type="checkbox" name="co[]" value="'+c.id+'" style="width:auto;margin-top:4px"'+(m?' checked':'')+'><span>'+h(c.name)+(m?' '+tag('passt zur Branche','ok'):'')+'<br><span class="muted sm" style="font-weight:400">'+h(jcsv(c.services))+' · Gratis-Leads: '+int(c.free_leads)+'</span></span></label>';}
    o+='</div><div class="row"><div><label>Preis pro Lead (CHF)</label><input name="price" value="'+h(price_for_branch(str(l.branch)))+'" style="width:130px"></div><div style="align-self:end"><button class="btn pri">Anbieten</button></div></div><p class="sm muted">Privates Angebot nur an die gewählten Firmen (ausserhalb des offenen Markts). Bei Annahme zählt ein Gratis-Lead, solange vorhanden.</p></form>';}
  o+='</div></div><h2 style="margin:22px 0 10px">Käufer &amp; Angebote</h2>';
  if(!as.length)o+='<div class="card empty">Noch an niemanden verteilt.</div>';else{o+='<div class="tw"><table><tr><th>Firma</th><th>Status</th><th class="r">Preis</th><th>Entscheid</th><th></th></tr>';for(const a of as)o+='<tr><td><a href="index.php?p=a_company&id='+a.company_id+'">'+h(a.name)+'</a></td><td>'+as_tag(a.status)+(a.is_free?' '+tag('Gratis','ok'):'')+'</td><td class="r num">'+chf(a.price)+'</td><td class="num">'+dtt(a.decided)+'</td><td class="r">'+(a.status==='offered'?post_btn('Entfernen','a_lead',{id},{act:'unassign',aid:a.id},'btn ghost sm'):'')+'</td></tr>';o+='</table></div>';}
  layout('Anfrage #'+id,o,'a_leads');
}

function pg_a_users(){
  const m=need('admin');const r0=R();
  if(r0.method==='POST'){const act=post('act');
    if(act==='add'){const e=post('email').toLowerCase();if(!emailok(e)||one('SELECT id FROM users WHERE email=?',[e])){flash('E-Mail ungültig oder bereits vorhanden.','err');go('a_users');}
      const uid=ins('users',{email:e,role:'admin',name:post('name'),created:now()});S().newlink=invite_link(one('SELECT * FROM users WHERE id=?',[uid]));flash('Admin angelegt. Zugangslink unten.');}
    else if(act==='toggle'){const id=int(post('id'));if(id!==int(m.id)){q('UPDATE users SET active=1-active WHERE id=?',[id]);flash('Status geändert.');}}
    else if(act==='reset'){const u=one('SELECT * FROM users WHERE id=?',[int(post('id'))]);if(u){S().newlink=invite_link(u);flash('Neuer Link für '+u.email+' erstellt.');}}
    go('a_users');}
  const link=S().newlink||null;delete S().newlink;
  const r=all('SELECT u.*,c.name AS company FROM users u LEFT JOIN companies c ON c.id=u.company_id ORDER BY u.role,u.id');const rn={admin:'Admin',partner:'Partner',customer:'Kunde'};
  let o=head('Benutzer','Alle Konten der Plattform');
  if(link)o+='<div class="card" style="margin-bottom:16px"><h3>Zugangslink</h3><div class="link">'+h(link)+'</div></div>';
  o+='<div class="tw"><table><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th>Firma</th><th>Letzter Login</th><th></th></tr>';
  for(const u of r)o+='<tr><td>'+h(u.name)+'</td><td>'+h(u.email)+'</td><td>'+tag(rn[u.role])+(u.active?'':' '+tag('inaktiv','bad'))+'</td><td>'+h(u.company)+'</td><td class="num">'+dtt(u.last_login)+'</td><td class="r"><div class="row" style="justify-content:flex-end">'+post_btn('Link','a_users',{},{act:'reset',id:u.id},'btn ghost sm')+(u.id!=m.id?post_btn(u.active?'Sperren':'Aktivieren','a_users',{},{act:'toggle',id:u.id},'btn ghost sm'):'')+'</div></td></tr>';
  o+='</table></div><div class="card" style="margin-top:20px"><h2 style="margin-bottom:12px">Weiteren Admin hinzufügen</h2><form method="post" class="f">'+csrf_field()+'<input type="hidden" name="act" value="add"><div><label>Name</label><input name="name"></div><div><label>E-Mail</label><input type="email" name="email" required></div><div class="full"><button class="btn">Admin anlegen</button></div></form></div>';
  layout('Benutzer',o,'a_users');
}
function pg_a_log(){need('admin');const r=all('SELECT l.*,u.email FROM log l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT 200');let o=head('Protokoll','Letzte 200 Aktionen');
  if(!r.length)o+='<div class="card empty">Noch keine Einträge.</div>';else{o+='<div class="tw"><table><tr><th>Zeit</th><th>Benutzer</th><th>Aktion</th></tr>';for(const x of r)o+='<tr><td class="num">'+dtt(x.ts)+'</td><td>'+h(x.email||'System')+'</td><td>'+h(x.msg)+'</td></tr>';o+='</table></div>';}layout('Protokoll',o,'a_log');}

function csvCell(v,sep=';'){v=v==null?'':String(v);if(/^[=+\-@]/.test(v))v="'"+v;return /[";\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}
function pg_a_export(){
  need('admin');const t=str(R().G.t);let r;
  if(t==='companies')r=all('SELECT id,name,contact,email,phone,uid,web,services,cantons,radius,capacity,status,free_leads,lang,created FROM companies ORDER BY id');
  else if(t==='sales')r=all("SELECT a.decided AS datum,a.lead_id,l.branch,l.zip,l.city,c.name AS firma,a.kind AS art,a.is_free AS gratis,a.price AS preis_chf,a.status FROM assignments a JOIN leads l ON l.id=a.lead_id JOIN companies c ON c.id=a.company_id WHERE a.status IN ('accepted','refunded') ORDER BY a.decided");
  else if(t==='wallet')r=all("SELECT w.created AS datum,c.name AS firma,w.type AS art,w.amount AS betrag_chf,w.ref,w.note FROM wallet w JOIN companies c ON c.id=w.company_id ORDER BY w.id");
  else if(t==='leads')r=all('SELECT id,created,branch,zip,city,name,email,phone,when_,budget,status,source,description FROM leads ORDER BY id');
  else go('a_dash');
  let out='﻿';
  if(r.length){const keys=Object.keys(r[0]);out+=keys.map(k=>csvCell(k)).join(';')+'\r\n';
    for(const x of r)out+=keys.map(k=>csvCell(['services','cantons'].includes(k)?jcsv(x[k]):x[k])).join(';')+'\r\n';}
  sendRaw(out,'text/csv; charset=UTF-8',{'Content-Disposition':'attachment; filename="auftragdeal-'+t+'-'+date('Ymd')+'.csv"'});
}
function pg_a_backup(){
  need('admin');const fs=require('fs'),os=require('os'),path=require('path');
  const f=path.join(os.tmpdir(),'ad-backup-'+K.randHex(6)+'.sqlite');
  K.db().exec("VACUUM INTO '"+f.replace(/'/g,"''")+"'");const buf=fs.readFileSync(f);try{fs.unlinkSync(f);}catch(e){}
  logit('Datenbank-Backup heruntergeladen');
  sendRaw(buf,'application/octet-stream',{'Content-Disposition':'attachment; filename="auftragdeal-backup-'+date('Ymd-Hi')+'.sqlite"'});
}
module.exports={company_user,invite_link,pages:{a_backup:pg_a_backup,a_dash:pg_a_dash,a_companies:pg_a_companies,a_company:pg_a_company,a_leads:pg_a_leads,a_lead:pg_a_lead,a_users:pg_a_users,a_log:pg_a_log,a_export:pg_a_export}};
