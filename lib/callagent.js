'use strict';
// Call Agent: Telefon-Vertrieb für B2B-Firmen (nur Anrufe, keine E-Mails)
const K=require('./core');
const {h,q,one,all,val,ins,upd,int,str,dtt,date,time,now,go,flash,me,post,need,csrf_field,make_token,send_mail,base_url,logit,R,emailok}=K;
const U=require('./ui');const {layout,head,tag,post_btn}=U;
const M=require('./market');

// Ergebnis eines Anrufs: [Beschriftung, Tag-Farbe]
const OUT={no_answer:['Nicht erreicht','warn'],callback:['Rückruf vereinbart','warn'],interested:['Interessiert','ok'],not_interested:['Kein Interesse','bad'],wrong:['Falsche Nummer / inaktiv','bad'],note:['Nur Notiz','']};
const OUT_ORDER=['interested','callback','no_answer','not_interested','wrong','note'];
const outTag=k=>OUT[k]?tag(OUT[k][0],OUT[k][1]):tag('Noch nicht angerufen','');
const tel=p=>{let d=str(p).replace(/[^\d+]/g,'');if(d.startsWith('00'))d='+'+d.slice(2);else if(d.startsWith('0'))d='+41'+d.slice(1);return d;};
const trunc=(s,n)=>{s=str(s).replace(/\s+/g,' ').trim();return Array.from(s).length>n?Array.from(s).slice(0,n).join('')+'…':s;};

// Stand der Firma im Portal
function portal(c){
  if(c.status==='blocked')return ['Gesperrt','bad'];
  if(c.status==='active')return ['Gewonnen (aktiv)','ok'];
  if(int(c.has_user))return ['Registriert – wartet auf Freigabe','warn'];
  if(c.invited_at)return ['Per Mail eingeladen',''];
  return ['Noch nicht eingeladen',''];
}
const portalTag=c=>{const p=portal(c);return tag(p[0],p[1]);};

const BASE_SQL="SELECT c.*,EXISTS(SELECT 1 FROM users u WHERE u.company_id=c.id AND u.role='partner') AS has_user FROM companies c";
const dueSql="(c.ca_next IS NOT NULL AND c.ca_next<=? AND c.status<>'active')";
const FILTERS={
  open:['Offen',"c.status<>'active' AND c.status<>'blocked' AND IFNULL(c.ca_status,'new') NOT IN ('not_interested','wrong')"],
  due:['Rückruf fällig',"c.ca_next IS NOT NULL AND c.ca_next<=? AND c.status<>'active' AND c.status<>'blocked'"],
  interested:['Interessiert',"c.ca_status='interested' AND c.status<>'active' AND c.status<>'blocked'"],
  no:['Kein Interesse',"c.ca_status IN ('not_interested','wrong') AND c.status<>'active' AND c.status<>'blocked'"],
  won:['Gewonnen',"c.status='active'"],
  all:['Alle',"c.status<>'blocked'"]
};
const scope=demo=>demo?" AND c.source='demo'":" AND c.status<>'demo'";
function list(filter,qs,demo){
  const f=FILTERS[filter]||FILTERS.open;const params=[];let where=f[1]+scope(demo);
  if(f[1].includes('?'))params.push(now());
  if(qs){where+=" AND (c.name LIKE ? OR c.contact LIKE ? OR c.phone LIKE ? OR c.services LIKE ?)";const l='%'+qs+'%';params.push(l,l,l,l);}
  params.push(now());
  return all(BASE_SQL+' WHERE '+where+" ORDER BY CASE WHEN "+dueSql+" THEN 0 WHEN IFNULL(c.ca_status,'new')='new' AND IFNULL(c.phone,'')<>'' THEN 1 WHEN c.ca_status='no_answer' THEN 2 WHEN c.ca_status='callback' THEN 3 WHEN c.ca_status='interested' THEN 4 ELSE 5 END,COALESCE(c.ca_last,'') ASC,c.id ASC LIMIT 500",params);
}
function counts(demo){
  const o={};for(const k of Object.keys(FILTERS)){const f=FILTERS[k];o[k]=int(val('SELECT COUNT(*) FROM companies c WHERE '+f[1]+scope(demo),f[1].includes('?')?[now()]:[]));}
  return o;
}
const nDue=demo=>int(val("SELECT COUNT(*) FROM companies c WHERE c.ca_next IS NOT NULL AND c.ca_next<=? AND c.status<>'active' AND c.status<>'blocked'"+scope(demo),[now()]));

function filterBar(base,cur,cn,qs){
  let o='<div class="row" style="margin-bottom:14px;gap:8px;flex-wrap:wrap">';
  for(const k of Object.keys(FILTERS))o+='<a class="btn '+(k===cur?'pri':'ghost')+' sm" href="index.php?p='+base+'&f='+k+'">'+h(FILTERS[k][0])+' <b>'+cn[k]+'</b></a>';
  o+='<form method="get" action="index.php" style="margin-left:auto;display:flex;gap:6px"><input type="hidden" name="p" value="'+base+'"><input type="hidden" name="f" value="'+h(cur)+'"><input name="s" value="'+h(qs)+'" placeholder="Suchen: Firma, Name, Telefon …" style="min-width:230px"><button class="btn ghost sm">Suchen</button></form></div>';
  return o;
}
function dueText(c){
  if(!c.ca_next)return '<span class="muted">–</span>';
  const over=c.ca_next<=now()&&c.status!=='active';
  return '<span class="num"'+(over?' style="color:var(--red,#B42318);font-weight:700"':'')+'>'+h(dtt(c.ca_next))+(over?' · fällig':'')+'</span>';
}
function table(rows,base,admin){
  if(!rows.length)return '<div class="card empty">Keine Firmen in dieser Ansicht.</div>';
  let o='<div class="tw"><table><tr><th>Firma</th><th>Telefon</th><th>Portal</th><th>Anruf-Status</th><th>Rückruf</th><th>Letzte Notiz</th><th></th></tr>';
  for(const c of rows){
    const note=one('SELECT note FROM call_log WHERE company_id=? AND IFNULL(note,\'\')<>\'\' ORDER BY id DESC LIMIT 1',[c.id]);
    const nt=trunc(c.ca_note||(note&&note.note)||'',90);
    o+='<tr><td><a href="index.php?p='+(admin?'ca_firm&back=a_calls&id=':'ca_firm&id=')+c.id+'"><b>'+h(c.name)+'</b></a><br><span class="muted sm">'+h(c.contact)+(c.services&&c.services!=='[]'?' · '+h(K.jcsv(c.services)):'')+'</span></td>'
     +'<td>'+(c.phone?'<a href="tel:'+h(tel(c.phone))+'"><b>'+h(c.phone)+'</b></a>':'<span class="muted">keine Nummer</span>')+'</td>'
     +'<td>'+portalTag(c)+'</td><td>'+outTag(c.ca_status)+(int(c.ca_calls)?'<br><span class="muted sm">'+int(c.ca_calls)+'× angerufen'+(c.ca_last?' · '+h(dtt(c.ca_last)):'')+'</span>':'')+'</td><td>'+dueText(c)+'</td>'
     +'<td class="sm" style="max-width:280px">'+(nt?h(nt):'<span class="muted">–</span>')+'</td>'
     +'<td class="r"><a class="btn pri sm" href="index.php?p=ca_firm&id='+c.id+(admin?'&back=a_calls':'')+'">Öffnen</a></td></tr>';}
  return o+'</table></div>';
}

// ===== Anrufliste (Call Agent und Admin) =====
function pg_ca_list(){
  const u=need('callagent','admin');const g=R().G;
  const cur=FILTERS[g.f]?str(g.f):'open';const qs=str(g.s).trim().slice(0,60);
  const dm=int(u.demo)===1;const cn=counts(dm);const rows=list(cur,qs,dm);
  const first=rows.find(c=>c.phone&&c.status!=='active');
  let o=head('Anrufliste','Alle Firmen, die wir eingeladen oder hochgeladen haben – bitte nur telefonisch kontaktieren, keine E-Mails.',first?'<a class="btn pri" href="index.php?p=ca_firm&id='+first.id+'">▶ Nächste Firma anrufen</a>':'')
   +(dm?'<div class="flash" style="background:var(--blue-bg,#E8F1FE);color:var(--blue,#1D4ED8)"><b>Probe-Zugang.</b> Alle Firmen und Nummern hier sind erfunden. Sie können alles gefahrlos ausprobieren, es wird niemand angerufen.</div>':'')+(nDue(dm)?'<div class="flash err" style="background:var(--amber-bg);color:var(--amber)"><b>'+nDue(dm)+' Rückruf(e) fällig.</b> Diese stehen ganz oben.</div>':'')
   +filterBar('ca_list',cur,cn,qs)+table(rows,'ca_list',false);
  layout('Anrufliste',o,u.role==='admin'?'a_calls':'ca_list');
}

// ===== Firma: Anruf, Notizen, Verlauf =====
function next_company(cur,demo){
  const rows=list('open','',demo);for(const c of rows){if(int(c.id)!==int(cur)&&c.phone&&c.status!=='active')return int(c.id);}return 0;}
function pg_ca_firm(){
  const u=need('callagent','admin');const r=R();const id=int(r.G.id);
  const c=one(BASE_SQL+' WHERE c.id=?',[id]);const admin=u.role==='admin',back=admin&&r.G.back==='a_calls'?'a_calls':'ca_list';
  const dm=int(u.demo)===1;
  if(!c||(dm&&c.source!=='demo')||(!dm&&c.status==='demo'&&!admin)){flash('Firma nicht gefunden.','err');go(back);}
  const dest=i=>back==='a_calls'?{id:i,back:'a_calls'}:{id:i};const stay=dest(id);
  if(r.method==='POST'){const act=post('act');
    if(act==='log'||act==='log_next'){
      const out=post('outcome');let note=post('note').slice(0,2000);let next=post('next').replace('T',' ');
      if(!OUT[out]){flash('Bitte ein Ergebnis wählen.','err');go('ca_firm',stay);}
      if(out==='callback'){if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(next)){flash('Bitte Datum und Uhrzeit für den Rückruf angeben.','err');go('ca_firm',stay);}next=next.slice(0,16)+':00';}else next=null;
      if(out==='note'&&note===''){flash('Bitte eine Notiz eingeben.','err');go('ca_firm',stay);}
      if(out==='not_interested'&&note===''){flash('Bitte kurz den Grund für «Kein Interesse» notieren.','err');go('ca_firm',stay);}
      ins('call_log',{company_id:id,user_id:int(u.id),ts:now(),outcome:out,note,next_at:next});
      if(out!=='note'){q('UPDATE companies SET ca_status=?,ca_next=?,ca_last=?,ca_calls=IFNULL(ca_calls,0)+1 WHERE id=?',[out,next,now(),id]);}
      logit('Call Agent: '+c.name+' – '+OUT[out][0]);
      flash('Gespeichert: '+OUT[out][0]+'.');
      if(act==='log_next'){const n=next_company(id,dm);if(n)go('ca_firm',dest(n));flash('Keine weitere Firma offen.');go(back);}
      go('ca_firm',stay);}
    else if(act==='pin'){q('UPDATE companies SET ca_note=?,ca_note_by=?,ca_note_ts=? WHERE id=?',[post('ca_note').slice(0,4000),str(u.name||u.email),now(),id]);flash('Notiz gespeichert.');go('ca_firm',stay);}
    else if(act==='fix'){q('UPDATE companies SET phone=?,contact=? WHERE id=?',[post('phone').slice(0,40),post('contact').slice(0,80),id]);logit('Call Agent: Kontaktdaten korrigiert für '+c.name);flash('Kontaktdaten gespeichert.');go('ca_firm',stay);}
    go('ca_firm',stay);}
  const hist=all("SELECT l.*,u.name AS uname,u.email AS uemail FROM call_log l LEFT JOIN users u ON u.id=l.user_id WHERE l.company_id=? ORDER BY l.id DESC LIMIT 100",[id]);
  const free=M.setting('free_leads'),price=M.setting('default_price');
  const tmr=date('Y-m-d',time()+86400)+'T09:00';
  const nx=next_company(id,dm);
  let o=head(c.name,'Telefon-Gespräch','<a class="btn ghost" href="index.php?p='+back+'">← Zur Liste</a>')+'<div class="grid2">';
  // linke Spalte
  o+='<div><div class="card" style="margin-bottom:16px"><div class="row" style="justify-content:space-between;align-items:center;gap:12px"><div><div class="muted sm">Telefon</div>'
   +(c.phone?'<a href="tel:'+h(tel(c.phone))+'" style="font-size:26px;font-weight:700;text-decoration:none">'+h(c.phone)+'</a>':'<b style="font-size:20px">Keine Nummer hinterlegt</b>')+'</div>'+(c.phone?'<a class="btn pri" href="tel:'+h(tel(c.phone))+'">Anrufen</a>':'')+'</div>'
   +'<dl class="kv" style="margin-top:14px"><dt>Ansprechperson</dt><dd>'+h(c.contact||'–')+'</dd><dt>Branchen</dt><dd>'+h(K.jcsv(c.services)||'–')+'</dd><dt>Einsatzgebiet</dt><dd>'+h(c.plz_ranges||'–')+'</dd>'+(c.web?'<dt>Website</dt><dd>'+h(c.web)+'</dd>':'')+'<dt>Portal</dt><dd>'+portalTag(c)+'</dd><dt>Anruf-Status</dt><dd>'+outTag(c.ca_status)+(int(c.ca_calls)?' <span class="muted sm">'+int(c.ca_calls)+'× angerufen</span>':'')+'</dd>'+(c.ca_next?'<dt>Rückruf</dt><dd>'+dueText(c)+'</dd>':'')+'</dl>'
   +'<details style="margin-top:12px"><summary class="sm muted" style="cursor:pointer">Nummer oder Ansprechperson korrigieren</summary><form method="post" class="f" style="margin-top:10px">'+csrf_field()+'<input type="hidden" name="act" value="fix"><div><label>Telefon</label><input name="phone" value="'+h(c.phone||'')+'"></div><div><label>Ansprechperson</label><input name="contact" value="'+h(c.contact||'')+'"></div><div class="full"><button class="btn ghost sm">Speichern</button></div></form></details></div>';
  // Leitfaden
  o+='<div class="card"><h2 style="margin-bottom:8px">Gesprächsleitfaden</h2><div class="sm" style="line-height:1.6">'
   +'<p style="margin:0 0 8px"><b>1. Einstieg</b><br>«Guten Tag, hier ist … von auftragdeal.ch. Wir vermitteln Anfragen von Privat- und Geschäftskunden an Firmen wie die Ihre. Haben Sie zwei Minuten?»</p>'
   +'<p style="margin:0 0 8px"><b>2. Nutzen</b><br>Sie erhalten vorgeprüfte Anfragen aus Ihrem Gebiet direkt per E-Mail, mit allen Kontaktdaten. Die ersten <b>'+h(free)+' Leads sind gratis</b>. Danach bezahlen Sie nur Leads, die Sie wirklich wollen (ab CHF '+h(K.chf(M.setting('default_price')||price))+' pro Lead), vom Guthaben. Kein Abo.</p>'
   +'<p style="margin:0 0 8px"><b>3. Fragen</b><br>Welche Aufträge suchen Sie? Welches Einsatzgebiet? Wie viele Anfragen pro Woche könnten Sie bearbeiten?</p>'
   +'<p style="margin:0 0 8px"><b>4. Einwände</b><br>«Keine Zeit» → «Die Leads kommen per Mail, Sie entscheiden jeweils mit einem Klick.» · «Zu teuer» → «Die ersten '+h(free)+' sind gratis, so sehen Sie die Qualität.» · «Schon genug Aufträge» → «Dann rufen wir bei Bedarf wieder an – wann passt es?»</p>'
   +'<p style="margin:0"><b>5. Abschluss</b><br>Interesse? Notieren Sie unten <b>«Interessiert»</b>. Wir senden die Einladung. Kein Interesse? Bitte den Grund notieren.</p></div></div></div>';
  // rechte Spalte
  o+='<div><div class="card" style="margin-bottom:16px"><h2 style="margin-bottom:10px">Anruf erfassen</h2><form method="post" class="f" style="grid-template-columns:1fr">'+csrf_field()
   +'<div><label>Ergebnis</label><div class="row" style="gap:8px;flex-wrap:wrap">'+OUT_ORDER.map((k,i)=>'<label style="display:flex;gap:6px;align-items:center;font-weight:600;margin:0 10px 6px 0"><input type="radio" name="outcome" value="'+k+'" style="width:auto"'+(i===0?' required':'')+'>'+h(OUT[k][0])+'</label>').join('')+'</div></div>'
   +'<div><label>Notiz (was wurde besprochen?)</label><textarea name="note" rows="4" placeholder="z. B. Herr Muster ist interessiert, möchte Einladung bis Freitag; sucht vor allem Büroumzüge im Raum Zürich."></textarea></div>'
   +'<div><label>Rückruf am (nur bei «Rückruf vereinbart»)</label><input type="datetime-local" name="next" value="'+tmr+'"></div>'
   +'<div class="row"><button class="btn pri" name="act" value="log">Speichern</button>'+(nx?'<button class="btn ghost" name="act" value="log_next">Speichern &amp; nächste Firma</button>':'')+'</div></form></div>'
   +'<div class="card" style="margin-bottom:16px"><h2 style="margin-bottom:4px">Firmennotiz</h2><p class="sm muted" style="margin:0 0 10px">Bleibt immer sichtbar, z. B. «Chef ist nur dienstags erreichbar».'+(c.ca_note_ts?' Zuletzt: '+h(c.ca_note_by||'')+', '+h(dtt(c.ca_note_ts))+'.':'')+'</p><form method="post">'+csrf_field()+'<input type="hidden" name="act" value="pin"><textarea name="ca_note" rows="3" style="width:100%">'+h(c.ca_note||'')+'</textarea><div style="margin-top:8px"><button class="btn ghost sm">Notiz speichern</button></div></form></div></div></div>';
  // Verlauf
  o+='<h2 style="margin:22px 0 10px">Verlauf</h2>';
  if(!hist.length)o+='<div class="card empty">Noch kein Anruf erfasst.</div>';
  else{o+='<div class="tw"><table><tr><th>Zeit</th><th>Von</th><th>Ergebnis</th><th>Notiz</th></tr>';
    for(const x of hist)o+='<tr><td class="num sm">'+h(dtt(x.ts))+'</td><td class="sm">'+h(x.uname||x.uemail||'–')+'</td><td>'+(OUT[x.outcome]?tag(OUT[x.outcome][0],OUT[x.outcome][1]):h(x.outcome))+(x.next_at?'<br><span class="muted sm">Rückruf '+h(dtt(x.next_at))+'</span>':'')+'</td><td class="sm" style="white-space:pre-wrap">'+h(x.note||'')+'</td></tr>';
    o+='</table></div>';}
  layout(c.name,o,admin?'a_calls':'ca_list');
}

// ===== Admin: Übersicht Call Agent =====
function pg_a_calls(){
  const u=need('admin');const r=R();
  if(r.method==='POST'&&['demo_on','demo_reset','demo_off'].includes(post('act'))){const a=post('act');if(a==='demo_off'||a==='demo_reset')demo_remove();if(a!=='demo_off')demo_create();flash(a==='demo_off'?'Probe-Zugang entfernt.':'Probe-Zugang bereit. Den Link finden Sie unten.');go('a_calls');}
  if(r.method==='POST'&&post('act')==='add'){
    const e=post('email').toLowerCase(),n=post('name');
    if(!emailok(e)||!n){flash('Name und gültige E-Mail angeben.','err');go('a_calls');}
    if(one('SELECT id FROM users WHERE email=?',[e])){flash('Diese E-Mail ist bereits vergeben.','err');go('a_calls');}
    const uid=ins('users',{email:e,pass:null,role:'callagent',name:n,verified:1,created:now()});
    const link=base_url()+'/index.php?p=setpw&t='+make_token(uid,'setpw',168);
    const sent=send_mail(e,'Ihr Zugang als Call Agent – auftragdeal.ch','Guten Tag '+n+'\n\nSie wurden als Call Agent bei auftragdeal.ch eingerichtet.\nBitte legen Sie hier Ihr Passwort fest (7 Tage gültig):\n\n'+link+'\n\nDanach sehen Sie unter «Anrufliste» alle Firmen, die Sie telefonisch kontaktieren.\n\nauftragdeal.ch');
    r.S.ca_link=[n,e,link];logit('Call Agent angelegt: '+e);flash(sent?'Call Agent angelegt. Zugangslink wurde per Mail gesendet (und steht unten).':'Call Agent angelegt. Mail nicht möglich – bitte Link unten manuell senden.');go('a_calls');}
  const g=r.G;const cur=FILTERS[g.f]?str(g.f):'open';const qs=str(g.s).trim().slice(0,60);const cn=counts(false);const rows=list(cur,qs,false);
  const today=date('Y-m-d');
  const t=sql=>int(val(sql,[today+' 00:00:00']));
  const real=" AND company_id IN (SELECT id FROM companies WHERE status<>'demo')";
  const calls=t("SELECT COUNT(*) FROM call_log WHERE outcome<>'note' AND ts>=?"+real),reached=t("SELECT COUNT(*) FROM call_log WHERE outcome IN ('callback','interested','not_interested') AND ts>=?"+real);
  const kp=[['Anrufe heute',calls],['davon erreicht',reached],['Interessiert (offen)',cn.interested],['Kein Interesse',cn.no],['Rückrufe fällig',cn.due],['Gewonnen (aktiv)',cn.won]];
  const lk=r.S.ca_link||null;delete r.S.ca_link;
  let o=head('Call Agent','Telefon-Vertrieb: Überblick, Notizen und Ergebnisse','<a class="btn ghost" href="index.php?p=ca_list">Anrufliste öffnen</a>')
   +'<div class="cards">'+kp.map(([l,v])=>'<div class="card stat"><b class="num">'+v+'</b><span>'+h(l)+'</span></div>').join('')+'</div>'
   +filterBar('a_calls',cur,cn,qs)+table(rows,'a_calls',true);
  const act=all("SELECT l.*,c.name AS cname,u.name AS uname,u.email AS uemail FROM call_log l JOIN companies c ON c.id=l.company_id LEFT JOIN users u ON u.id=l.user_id WHERE c.status<>'demo' ORDER BY l.id DESC LIMIT 30");
  o+='<h2 style="margin:24px 0 10px">Letzte Aktivitäten</h2>';
  if(!act.length)o+='<div class="card empty">Noch keine Anrufe erfasst.</div>';
  else{o+='<div class="tw"><table><tr><th>Zeit</th><th>Call Agent</th><th>Firma</th><th>Ergebnis</th><th>Notiz</th></tr>';
    for(const x of act)o+='<tr><td class="num sm">'+h(dtt(x.ts))+'</td><td class="sm">'+h(x.uname||x.uemail||'–')+'</td><td><a href="index.php?p=ca_firm&back=a_calls&id='+x.company_id+'">'+h(x.cname)+'</a></td><td>'+(OUT[x.outcome]?tag(OUT[x.outcome][0],OUT[x.outcome][1]):'')+'</td><td class="sm" style="white-space:pre-wrap">'+h(trunc(x.note,220))+'</td></tr>';
    o+='</table></div>';}
  const ag=all("SELECT * FROM users WHERE role='callagent' AND demo=0 ORDER BY id");const demoU=one("SELECT * FROM users WHERE role='callagent' AND demo=1 ORDER BY id LIMIT 1");
  o+='<div class="grid2" style="margin-top:24px"><div class="card"><h2 style="margin-bottom:10px">Call Agent anlegen</h2><form method="post" class="f">'+csrf_field()+'<input type="hidden" name="act" value="add"><div><label>Name</label><input name="name" required></div><div><label>E-Mail</label><input type="email" name="email" required></div><div class="full"><button class="btn pri">Call Agent anlegen &amp; Zugang senden</button></div></form>'
   +(lk?'<p class="sm muted" style="margin:14px 0 4px">Zugangslink für '+h(lk[0])+' ('+h(lk[1])+'):</p><div class="link">'+h(lk[2])+'</div>':'')+'</div>'
   +'<div class="card"><h2 style="margin-bottom:10px">Call Agents</h2>'+(ag.length?'<table>'+ag.map(a=>'<tr><td>'+h(a.name)+'<br><span class="muted sm">'+h(a.email)+'</span></td><td class="sm">'+(a.last_login?'zuletzt '+h(dtt(a.last_login)):'noch nie angemeldet')+'</td><td>'+(a.active?tag('aktiv','ok'):tag('gesperrt','bad'))+'</td></tr>').join('')+'</table><p class="sm muted" style="margin:10px 0 0">Zugang erneuern oder sperren: unter «Benutzer».</p>':'<p class="muted sm" style="margin:0">Noch kein Call Agent angelegt.</p>')+'</div></div>';
  const du=demoU;
  o+='<div class="card" style="margin-top:16px"><h2 style="margin-bottom:6px">Probe-Link für neue Call Agents</h2><p class="sm muted" style="margin:0 0 12px">Zum Ausprobieren: ein Zugang mit erfundenen Demo-Firmen. Der Call Agent kann anrufen (nicht wirklich), Ergebnisse und Notizen erfassen und sieht keine echten Firmen. Echte Daten bleiben unberührt.</p>'
   +(du?'<p class="sm" style="margin:0 0 4px"><b>Probe-Link</b> (7 Tage gültig, ohne Passwort):</p><div class="link" id="probe">'+h(K.magic_link(du,'ca_list',168))+'</div><div class="row" style="margin-top:10px"><button type="button" class="btn pri sm" onclick="var t=document.getElementById(\'probe\').textContent.trim(),b=this;navigator.clipboard.writeText(t).then(function(){b.textContent=\'Kopiert ✓\'},function(){window.prompt(\'Link kopieren (Cmd+C):\',t)})">Link kopieren</button>'+post_btn('Demo zurücksetzen','a_calls',{},{act:'demo_reset'},'btn ghost sm','Demo-Daten und Notizen zurücksetzen?')+post_btn('Probe-Zugang entfernen','a_calls',{},{act:'demo_off'},'btn ghost sm','Probe-Zugang wirklich entfernen?')+'</div>'
     :post_btn('Probe-Zugang erstellen','a_calls',{},{act:'demo_on'},'btn pri'))+'</div>';
  layout('Call Agent',o,'a_calls');
}
const DEMO=[['Demo Umzüge AG','Hans Beispiel','044 000 00 01','Umzug'],['Probe Reinigung GmbH','Eva Muster','079 000 00 02','Reinigung'],['Beispiel Malerei AG','Luca Test','091 000 00 03','Maler & Gipser'],['Muster Garten GmbH','Peter Probe','041 000 00 04','Gartenbau'],['Test Elektro AG','Anna Demo','052 000 00 05','Elektro']];
function demo_remove(){
  for(const c of all("SELECT id FROM companies WHERE status='demo'")){q('DELETE FROM call_log WHERE company_id=?',[c.id]);}
  q("DELETE FROM companies WHERE status='demo'");q("DELETE FROM tokens WHERE user_id IN (SELECT id FROM users WHERE demo=1)");q('DELETE FROM users WHERE demo=1');
}
function demo_create(){
  DEMO.forEach((d,i)=>{ins('companies',{name:d[0],contact:d[1],email:'demo'+(i+1)+'@probe.invalid',phone:d[2],services:JSON.stringify([d[3]]),status:'demo',source:'demo',free_leads:0,created:now()});});
  const u=ins('users',{email:'probe-'+K.randHex(4)+'@probe.invalid',pass:null,role:'callagent',name:'Probe Call Agent',verified:1,demo:1,created:now()});
  const first=one("SELECT id FROM companies WHERE status='demo' ORDER BY id LIMIT 1");
  if(first){ins('call_log',{company_id:first.id,user_id:u,ts:now(),outcome:'no_answer',note:'Beispiel: Mailbox, später nochmals versuchen.',next_at:null});q("UPDATE companies SET ca_status='no_answer',ca_last=?,ca_calls=1 WHERE id=?",[now(),first.id]);}
  logit('Call Agent: Probe-Zugang erstellt');
}
module.exports={outTag,portalTag,nDue,OUT,pages:{ca_list:pg_ca_list,ca_firm:pg_ca_firm,a_calls:pg_a_calls}};
