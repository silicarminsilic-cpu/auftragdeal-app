'use strict';
// Akquise-Datenbank: Kontakte importieren, Kampagnen in Tagesportionen versenden, Trichter auswerten
const K=require('./core');
const {h,q,one,all,val,ins,upd,int,str,dtt,date,time,now,go,flash,post,need,csrf_field,mail_out,send_mail,mail_ready,base_url,logit,R,S,emailok,BRANCHES,sign,sig_ok,qs,jcsv,redirect,sendHtml,sendRaw,cfg,me}=K;
const U=require('./ui');const {layout,head,tag,post_btn,opts}=U;
const CA=require('./callagent');

const GLOBAL_MAX=100;          // absolute Obergrenze pro Tag über alle Kampagnen (Schutz der Absenderdomain)
const WIN=[8,18];              // Versandfenster Mo–Fr, Uhrzeit von–bis (Zürich)

// ---------- Tabellen lesen (CSV / Excel-Einfügen) ----------
const norm=s=>String(s||'').toLowerCase().replace(/[^a-zäöüéèà]/g,'');
const ALIAS={name:['firma','firmenname','name','unternehmen','company','firmaname'],contact:['ansprechperson','kontakt','kontaktperson','contact','person','ansprechpartner'],email:['email','mail','emailadresse','emailaddress'],phone:['telefon','tel','phone','telefonnummer','mobile','handy','telefonnr'],branch:['branche','branchen','kategorie','services','bereich','dienstleistung'],lang:['sprache','lang','language'],zip:['plz','postleitzahl'],city:['ort','stadt','city'],web:['web','website','homepage','url','webseite']};
function parse_table(text){
  text=String(text||'').replace(/^﻿/,'');
  const first=text.split(/\r?\n/).find(l=>l.trim())||'';
  const cnt=c=>first.split(c).length-1;
  const cs=[[';',cnt(';')],['\t',cnt('\t')],[',',cnt(',')]];cs.sort((a,b)=>b[1]-a[1]);
  const sep=cs[0][1]?cs[0][0]:';';
  const rows=[];let row=[],cur='',inq=false;
  const push=()=>{row.push(cur);cur='';if(row.some(x=>x.trim()!==''))rows.push(row.map(x=>x.trim()));row=[];};
  for(let i=0;i<text.length;i++){const ch=text[i];
    if(inq){if(ch==='"'){if(text[i+1]==='"'){cur+='"';i++;}else inq=false;}else cur+=ch;}
    else if(ch==='"'&&cur==='')inq=true;
    else if(ch===sep){row.push(cur);cur='';}
    else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;push();}
    else cur+=ch;}
  push();
  return rows;
}
function map_header(r){const m={};r.forEach((c,i)=>{const k=norm(c);for(const f in ALIAS)if(m[f]===undefined&&ALIAS[f].includes(k))m[f]=i;});return (m.name!==undefined&&(m.email!==undefined||m.phone!==undefined))?m:null;}
const tel=p=>{let d=str(p).replace(/[^\d+]/g,'');if(d.startsWith('00'))d='+'+d.slice(2);else if(d.startsWith('0'))d='+41'+d.slice(1);return d.length>=9?d:'';};
function parse_branches(t){const parts=str(t).split(/[\/|,;]+/).map(x=>x.trim().toLowerCase()).filter(Boolean);return JSON.stringify(BRANCHES.filter(b=>parts.some(p=>b.toLowerCase().includes(p)||p.includes(b.toLowerCase().split(' ')[0]))));}
function first_mail(s){for(const p of str(s).replace(/^mailto:/i,'').split(/[\s;,]+/)){const e=p.trim().toLowerCase();if(emailok(e))return e;}return '';}

function do_import(text,list){
  const rows=parse_table(text).slice(0,5000);const res={made:0,dup:0,bad:0,phone_only:0,bad_rows:[]};
  if(!rows.length)return res;
  const map=map_header(rows[0]);const start=map?1:0;
  const exM=new Set(),exT=new Set();
  for(const r of all('SELECT email,phone FROM companies')){if(r.email)exM.add(String(r.email).toLowerCase());const t=tel(r.phone);if(t)exT.add(t);}
  for(const r of all('SELECT email FROM users'))exM.add(String(r.email).toLowerCase());
  for(let i=start;i<rows.length;i++){const c=rows[i];
    const g=f=>map?(map[f]!==undefined?str(c[map[f]]):''):'';
    let name,contact,email,phone,branch,lang,zip,city,web;
    if(map){name=g('name');contact=g('contact');email=first_mail(g('email'));phone=g('phone');branch=g('branch');lang=g('lang');zip=g('zip');city=g('city');web=g('web');}
    else{[name,contact,,phone,branch,lang]=c.map(str);email=first_mail(c[2])||first_mail(c.join(' '));zip=city=web='';}
    if(contact&&contact.includes('@'))contact='';if(phone&&phone.includes('@'))phone='';
    const t=tel(phone);
    if(!name||(!email&&!t)){res.bad++;if(res.bad_rows.length<8)res.bad_rows.push(c.join(' ; ').slice(0,120));continue;}
    if(email?exM.has(email):exT.has(t)){res.dup++;continue;}
    lang=str(lang).toLowerCase().slice(0,2);if(!['de','fr','it'].includes(lang))lang='de';
    ins('companies',{name,contact,email,phone,zip,city,web,services:parse_branches(branch),lang,status:'pending',free_leads:0,source:'import',list_name:list||null,created:now()});
    res.made++;if(!email)res.phone_only++;if(email)exM.add(email);if(t)exT.add(t);
  }
  return res;
}

// ---------- Trichter ----------
const BASE="SELECT c.*,EXISTS(SELECT 1 FROM users u WHERE u.company_id=c.id AND u.role='partner') AS has_user,(SELECT COUNT(*) FROM camp_mail m WHERE m.company_id=c.id AND m.status='sent') AS n_sent,(SELECT COALESCE(MAX(m.clicks),0) FROM camp_mail m WHERE m.company_id=c.id) AS n_click,(SELECT MAX(m.sent_at) FROM camp_mail m WHERE m.company_id=c.id AND m.status='sent') AS last_sent,(SELECT COALESCE(SUM(w.amount),0) FROM wallet w WHERE w.company_id=c.id AND w.type='topup' AND w.amount>0) AS topup FROM companies c WHERE c.source='import' AND c.status<>'demo'";
const flags=c=>({mail:!!first_mail(c.email),sent:int(c.n_sent)>0||!!c.invited_at,click:int(c.n_click)>0,reg:!!int(c.has_user),active:c.status==='active',cust:Number(c.topup)>0,unsub:!!int(c.unsub),interest:c.ca_status==='interested'});
function stage(c){const f=flags(c);
  if(f.cust)return ['kunde','Kunde','ok'];if(f.active)return ['freigegeben','Freigegeben','ok'];if(f.reg)return ['registriert','Registriert','info'];
  if(f.unsub)return ['abgemeldet','Abgemeldet','bad'];if(f.click)return ['geklickt','Geklickt','info'];if(f.sent)return ['angeschrieben','Angeschrieben','warn'];
  if(!f.mail)return ['telefon','Nur Telefon',''];return ['neu','Neu',''];}
function funnel(rows){const n=k=>rows.filter(c=>flags(c)[k]).length;
  return {total:rows.length,mail:n('mail'),sent:n('sent'),click:n('click'),reg:n('reg'),active:n('active'),cust:n('cust'),unsub:n('unsub'),interest:n('interest'),phone:rows.filter(c=>!flags(c).mail).length};}
const pct=(a,b)=>b?Math.round(a*1000/b)/10+' %':'–';

// ---------- Kampagnen-Vorlagen ----------
const TPL={
 de:{subject:'{{firma}}: neue Aufträge aus Ihrer Region – {{gratis}} Leads gratis',body:'{{anrede}}\n\nauftragdeal.ch bringt Firmen und Kunden zusammen: Im Lead-Markt sehen Sie Aufträge aus Ihrer Region, dazu gibt es ein CRM sowie Offerten und Rechnungen. Die ersten {{gratis}} Leads schenken wir Ihnen.\n\nFür {{firma}} ist ein kostenloser Zugang vorbereitet. Hier Registrierung abschliessen (Daten sind vorbefüllt):\n{{link}}\n\nFreundliche Grüsse\nauftragdeal.ch · Dritivo AG'},
 fr:{subject:'{{firma}} : nouveaux mandats dans votre région – {{gratis}} leads offerts',body:'{{anrede}}\n\nauftragdeal.ch met en relation entreprises et clients : le marché de leads affiche des mandats de votre région, avec CRM, devis et factures. Les {{gratis}} premiers leads sont offerts.\n\nUn accès gratuit est prêt pour {{firma}}. Finalisez l\'inscription ici (données préremplies) :\n{{link}}\n\nCordialement\nauftragdeal.ch · Dritivo AG'},
 it:{subject:'{{firma}}: nuovi incarichi nella sua regione – {{gratis}} lead in omaggio',body:'{{anrede}}\n\nauftragdeal.ch mette in contatto aziende e clienti: il mercato dei lead mostra incarichi della sua regione, con CRM, offerte e fatture. I primi {{gratis}} lead sono in omaggio.\n\nPer {{firma}} è pronto un accesso gratuito. Completi qui la registrazione (dati precompilati):\n{{link}}\n\nCordiali saluti\nauftragdeal.ch · Dritivo AG'}};
const HELLO={de:'Guten Tag',fr:'Bonjour',it:'Buongiorno'};
const FOOT={de:'Keine weiteren Nachrichten? Hier abmelden:',fr:'Ne plus recevoir de messages ? Se désinscrire :',it:'Non desidera più messaggi? Annulla qui l\'iscrizione:'};

const trk=(k,id)=>base_url()+'/index.php?'+qs({p:k==='c'?'t_click':'t_unsub',m:id,s:sign(['t',k,id])});
function reg_link(c){const o={p:'register',firm:c.name||'',mail:str(c.email).toLowerCase()};if(c.contact)o.name=c.contact;if(c.phone)o.tel=c.phone;if(c.web)o.web=c.web;return base_url()+'/index.php?'+qs(o);}
function render(camp,c,link,unsub){
  const lang=TPL[c.lang]?c.lang:'de';
  const v={anrede:HELLO[lang]+(c.contact?' '+c.contact:''),firma:c.name,link,gratis:String(cfg('free_leads')),abmelden:unsub};
  const f=t=>String(t||'').replace(/\{\{(\w+)\}\}/g,(m,k)=>v[k]!==undefined?v[k]:m);
  let body=f(camp.body);
  if(!/\{\{abmelden\}\}/.test(camp.body||''))body+='\n\n--\nDritivo AG · auftragdeal.ch · Pfäffikon SZ\n'+FOOT[lang]+' '+unsub;
  return {subject:f(camp.subject),body};
}

// ---------- Versand ----------
function today_sent(camp){return int(val("SELECT COUNT(*) FROM camp_mail WHERE campaign_id=? AND sent_at>=?",[camp.id,date('Y-m-d')+' 00:00:00']));}
function global_sent(){return int(val("SELECT COUNT(*) FROM camp_mail WHERE sent_at>=?",[date('Y-m-d')+' 00:00:00']));}
function send_cm(cm,camp){
  const c=one('SELECT * FROM companies WHERE id=?',[cm.company_id]);
  const skip=why=>{q("UPDATE camp_mail SET status='skipped',note=? WHERE id=?",[why,cm.id]);return 'skip';};
  if(!c)return skip('Firma gelöscht');
  if(int(c.unsub))return skip('abgemeldet');
  if(c.status==='blocked'||c.status==='demo')return skip('gesperrt');
  if(val("SELECT COUNT(*) FROM users WHERE company_id=? AND role='partner'",[c.id]))return skip('hat bereits Konto');
  const to=first_mail(c.email);if(!to)return skip('keine gültige E-Mail');
  const un=trk('u',cm.id),link=trk('c',cm.id);
  const t=render(camp,c,link,un);
  const id=mail_out(to,t.subject,t.body,{'List-Unsubscribe':'<'+un+'>'});
  if(!id)return 'nomail';
  q("UPDATE camp_mail SET status='sent',sent_at=?,outbox_id=?,to_addr=? WHERE id=?",[now(),id,to,cm.id]);
  if(!c.invited_at)upd('companies',c.id,{invited_at:now()});
  return 'sent';
}
function next_queued(camp){return one("SELECT * FROM camp_mail WHERE campaign_id=? AND status='queued' ORDER BY id LIMIT 1",[camp.id]);}
function finish_if_empty(camp){if(!next_queued(camp)){q("UPDATE campaigns SET status='done',finished_at=? WHERE id=? AND status='running'",[now(),camp.id]);return true;}return false;}
// n Mails sofort senden (für den Pilotversand), ohne Zeitfenster und Abstand
function send_batch(camp,n){let sent=0;for(let i=0;i<n;i++){if(global_sent()>=GLOBAL_MAX||today_sent(camp)>=camp.daily_limit)break;const cm=next_queued(camp);if(!cm)break;const r=send_cm(cm,camp);if(r==='nomail')break;if(r==='sent')sent++;}finish_if_empty(camp);return sent;}
function tick(o={}){
  try{
    if(!mail_ready())return 0;
    const d=new Date();
    if(!o.force&&(d.getDay()===0||d.getDay()===6||d.getHours()<WIN[0]||d.getHours()>=WIN[1]))return 0;
    let n=0;
    for(const camp of all("SELECT * FROM campaigns WHERE status='running' ORDER BY id")){
      if(finish_if_empty(camp))continue;
      if(today_sent(camp)>=camp.daily_limit||global_sent()>=GLOBAL_MAX)continue;
      const gap=Math.max(60,Math.floor(25200/Math.max(1,camp.daily_limit)));
      const last=val("SELECT MAX(sent_at) FROM camp_mail WHERE campaign_id=?",[camp.id]);
      if(!o.force&&last&&last>date('Y-m-d H:i:s',time()-gap))continue;
      const cm=next_queued(camp);if(!cm)continue;
      if(send_cm(cm,camp)==='sent')n++;
      finish_if_empty(camp);
    }
    return n;
  }catch(e){console.error('Akquise-Versand:',e.message);return 0;}
}
function start_scheduler(){const t=setInterval(tick,60000);if(t.unref)t.unref();}

// ---------- Oberfläche ----------
function tabs(a){return '<div class="row" style="margin:-6px 0 18px;gap:8px">'+[['a_acq','Trichter &amp; Kontakte'],['a_camps','Kampagnen']].map(([p,l])=>'<a class="btn '+(a===p?'pri':'ghost')+' sm" href="index.php?p='+p+'">'+l+'</a>').join('')+'</div>';}
function bar(label,n,tot,prev,col){const w=tot?Math.max(n?2:0,Math.round(n*100/tot)):0;
  return '<div style="display:grid;grid-template-columns:150px 1fr 150px;gap:12px;align-items:center;margin:7px 0"><div class="sm"><b>'+h(label)+'</b></div><div style="background:#EEEAE1;border-radius:6px;height:20px;overflow:hidden"><div style="width:'+w+'%;height:100%;background:'+col+'"></div></div><div class="sm num"><b>'+n+'</b> <span class="muted">· '+pct(n,prev)+' vom Schritt davor</span></div></div>';}

const STAGES=[['','Alle'],['neu','Neu (nicht angeschrieben)'],['angeschrieben','Angeschrieben'],['geklickt','Geklickt'],['registriert','Registriert'],['freigegeben','Freigegeben'],['kunde','Kunde'],['abgemeldet','Abgemeldet'],['telefon','Nur Telefon']];
function lists(){return all("SELECT COALESCE(list_name,'') AS l,COUNT(*) AS n FROM companies WHERE source='import' AND status<>'demo' GROUP BY COALESCE(list_name,'') ORDER BY MAX(id) DESC");}
const listLabel=l=>l?l:'(ohne Liste)';

const UPLOAD_JS=`<script>
(function(){var f=document.getElementById('acqfile'),t=document.getElementById('acqtext'),m=document.getElementById('acqmsg');if(!f)return;
function say(s){m.textContent=s}
function dec(buf){try{return new TextDecoder('utf-8',{fatal:true}).decode(buf)}catch(e){return new TextDecoder('windows-1252').decode(buf)}}
function fin(txt){t.value=txt;var n=txt.split(/\\r?\\n/).filter(function(x){return x.trim()}).length;say(n+' Zeilen geladen – prüfen und unten auf «Importieren» klicken.')}
f.addEventListener('change',function(){var file=f.files[0];if(!file)return;var rd=new FileReader();say('Lese Datei …');
rd.onload=function(){var buf=rd.result;if(/\\.xlsx?$/i.test(file.name)){var s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
s.onload=function(){try{var wb=XLSX.read(new Uint8Array(buf),{type:'array'});var ws=wb.Sheets[wb.SheetNames[0]];fin(XLSX.utils.sheet_to_csv(ws,{FS:';'}))}catch(e){say('Excel-Datei konnte nicht gelesen werden. Bitte als CSV speichern.')}};
s.onerror=function(){say('Excel-Reader nicht ladbar. Bitte die Datei in Excel als CSV speichern.')};document.head.appendChild(s)}else fin(dec(buf))};
rd.readAsArrayBuffer(file)})})();
</script>`;

function csv_cell(v){v=str(v);return /[";\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}

function pg_a_acq(){
  need('admin');const r=R();
  if(r.method==='POST'){
    const act=post('act');
    if(act==='import'){const list=post('list_name')||('Import '+date('d.m.Y'));const res=do_import(String(r.P.data||''),list);
      logit(`Akquise-Import «${list}»: ${res.made} neu, ${res.dup} Duplikate, ${res.bad} ungültig`);
      flash(`Liste «${list}»: ${res.made} Firma(en) neu erfasst`+(res.phone_only?` (${res.phone_only} nur mit Telefon)`:'')+(res.dup?`, ${res.dup} bereits vorhanden`:'')+(res.bad?`, ${res.bad} Zeile(n) ohne Firma oder Kontaktdaten übersprungen`:'')+'.',res.made||res.dup?'ok':'err');
      if(res.bad_rows.length)S().acq_bad=res.bad_rows;}
    go('a_acq');}
  const G=r.G,fl=str(G.l),fs=str(G.s),fq=str(G.q).toLowerCase();
  const rows=all(BASE+' ORDER BY c.id DESC');
  if(G.export==='1'){const sel=filt(rows,G);
    const hd=['Firma','Kontakt','E-Mail','Telefon','PLZ','Ort','Branchen','Sprache','Liste','Stufe','Mails gesendet','Klicks','Letzter Versand','Aufladungen CHF','Anruf-Status'];
    let o='﻿'+hd.join(';')+'\r\n';for(const c of sel)o+=[c.name,c.contact,c.email,c.phone,c.zip,c.city,jcsv(c.services),c.lang,c.list_name,stage(c)[1],c.n_sent,c.n_click,c.last_sent,c.topup,c.ca_status].map(csv_cell).join(';')+'\r\n';
    sendRaw(o,'text/csv; charset=UTF-8',{'Content-Disposition':'attachment; filename="akquise-'+date('Y-m-d')+'.csv"'});return;}
  const F=funnel(rows);const bad=S().acq_bad||[];delete S().acq_bad;
  let o=head('Akquise','Kontakte importieren, anschreiben und auswerten','<a class="btn ghost" href="index.php?p=a_camps">Kampagnen →</a>')+tabs('a_acq');
  if(bad.length)o+='<div class="flash err" style="background:var(--amber-bg);color:var(--amber)"><b>Übersprungene Zeilen (Beispiele):</b><br>'+bad.map(h).join('<br>')+'</div>';
  // Trichter
  o+='<div class="card" style="margin-bottom:18px"><h2 style="margin-bottom:10px">Trichter</h2>';
  if(!F.total)o+='<p class="muted">Noch keine Kontakte. Unten eine Liste importieren.</p>';else{
    o+=bar('Erfasst',F.total,F.total,F.total,'#9C9588')+bar('Mit E-Mail',F.mail,F.total,F.total,'#9C9588')+bar('Angeschrieben',F.sent,F.total,F.mail,'#D9A441')+bar('Geklickt',F.click,F.total,F.sent,'#E07A3D')+bar('Registriert',F.reg,F.total,F.click||F.sent,'#D9440F')+bar('Freigegeben',F.active,F.total,F.reg,'#15935A')+bar('Kunde (aufgeladen)',F.cust,F.total,F.active||F.reg,'#0E6B42');
    o+='<p class="sm muted" style="margin:12px 0 0">Abgemeldet: <b>'+F.unsub+'</b> · Beim Anruf interessiert: <b>'+F.interest+'</b> · Nur Telefon (nicht mailbar): <b>'+F.phone+'</b>. «Geklickt» zählt Klicks auf den Registrierungs-Link in der Mail; Öffnungen werden bewusst nicht gezählt, weil Mail-Programme sie verfälschen. Spam-Scanner können einzelne Klicks auslösen.</p>';}
  o+='</div>';
  // Import
  o+='<div class="card" style="margin-bottom:18px"><h2 style="margin-bottom:6px">Liste importieren</h2><p class="sm muted" style="margin-top:0">Excel- oder CSV-Datei wählen, oder Zeilen einfügen. Mit Kopfzeile werden die Spalten erkannt (<b>Firma, Ansprechperson, E-Mail, Telefon, Branche, Sprache, PLZ, Ort, Website</b>). Ohne Kopfzeile gilt die Reihenfolge Firma; Ansprechperson; E-Mail; Telefon; Branche; Sprache. Pflicht: Firma und E-Mail oder Telefon. Doppelte werden erkannt.</p>'
   +'<form method="post">'+csrf_field()+'<input type="hidden" name="act" value="import"><label>Name der Liste (zur Auswertung)</label><input name="list_name" placeholder="z. B. Umzug Zürich Oktober" style="margin-bottom:10px"><input type="file" id="acqfile" accept=".csv,.txt,.tsv,.xlsx,.xls" style="margin-bottom:6px"><div id="acqmsg" class="sm muted" style="margin-bottom:8px"></div><textarea id="acqtext" name="data" style="min-height:140px" placeholder="Muster Umzüge AG; Hans Muster; info@muster.ch; 044 123 45 67; Umzug; de" required></textarea><div style="margin-top:12px"><button class="btn pri">Importieren</button></div></form></div>';
  const L=lists();
  o+='<div class="card" style="margin-bottom:6px"><h2 style="margin-bottom:10px">Listen</h2>';
  if(!L.length)o+='<p class="muted sm">Noch keine Listen.</p>';else{o+='<div class="tw"><table><tr><th>Liste</th><th class="r">Kontakte</th><th class="r">Angeschr.</th><th class="r">Geklickt</th><th class="r">Registr.</th><th class="r">Kunde</th></tr>';
    for(const x of L){const sub=rows.filter(c=>str(c.list_name)===x.l);const f=funnel(sub);o+='<tr><td><a href="index.php?'+h(qs({p:'a_acq',l:x.l||'-'}))+'">'+h(listLabel(x.l))+'</a></td><td class="r num">'+f.total+'</td><td class="r num">'+f.sent+'</td><td class="r num">'+f.click+'</td><td class="r num">'+f.reg+'</td><td class="r num">'+f.cust+'</td></tr>';}
    o+='</table></div>';}
  o+='</div>';
  // Kontakte
  const sel=filt(rows,G);const show=sel.slice(0,300);
  o+='<h2 style="margin:24px 0 10px">Kontakte ('+sel.length+')</h2><form method="get" class="row" style="margin-bottom:12px;gap:8px;flex-wrap:wrap"><input type="hidden" name="p" value="a_acq"><select name="l" style="width:auto"><option value="">Alle Listen</option>'+L.map(x=>'<option value="'+h(x.l||'-')+'"'+((fl===(x.l||'-'))?' selected':'')+'>'+h(listLabel(x.l))+'</option>').join('')+'</select><select name="s" style="width:auto">'+STAGES.map(([k,l])=>'<option value="'+k+'"'+(fs===k?' selected':'')+'>'+h(l)+'</option>').join('')+'</select><input name="q" value="'+h(G.q||'')+'" placeholder="Suchen (Firma, E-Mail, Ort)" style="width:220px"><button class="btn ghost sm">Filtern</button><a class="btn ghost sm" href="index.php?'+h(qs({p:'a_acq',l:fl,s:fs,q:str(G.q),export:1}))+'">Export CSV</a></form>';
  if(!show.length)o+='<div class="card empty">Keine Kontakte für diesen Filter.</div>';else{
    o+='<div class="tw"><table><tr><th>Firma</th><th>Kontakt</th><th>Liste</th><th>Stufe</th><th class="r">Mails</th><th class="r">Klicks</th><th>Letzter Versand</th><th>Anruf</th></tr>';
    for(const c of show){const st=stage(c);o+='<tr><td><a href="index.php?p=a_company&id='+c.id+'"><b>'+h(c.name)+'</b></a><br><span class="muted sm">'+h([c.zip,c.city].filter(Boolean).join(' '))+'</span></td><td>'+h(c.contact)+'<br><span class="muted sm">'+h(c.email||c.phone||'')+'</span></td><td class="sm">'+h(listLabel(c.list_name))+'</td><td>'+tag(st[1],st[2])+'</td><td class="r num">'+int(c.n_sent)+'</td><td class="r num">'+int(c.n_click)+'</td><td class="num sm">'+(c.last_sent?dtt(c.last_sent):'–')+'</td><td>'+(c.ca_status?CA.outTag(c.ca_status):'<span class="muted sm">–</span>')+'</td></tr>';}
    o+='</table></div>'+(sel.length>show.length?'<p class="sm muted">Die ersten 300 von '+sel.length+' werden angezeigt. «Export CSV» enthält alle.</p>':'');}
  layout('Akquise',o+UPLOAD_JS,'a_acq');
}
function filt(rows,G){const fl=str(G.l),fs=str(G.s),fq=str(G.q).toLowerCase();
  return rows.filter(c=>(!fl||str(c.list_name)===(fl==='-'?'':fl))&&(!fs||stage(c)[0]===fs)&&(!fq||[c.name,c.email,c.city,c.contact,c.phone].some(x=>str(x).toLowerCase().includes(fq))));}

// ----- Kampagnen -----
function camp_stats(camp){const id=camp.id;const s=sql=>int(val(sql,[id]));
  const ids="SELECT company_id FROM camp_mail WHERE campaign_id=? AND status='sent'";
  return {queued:s("SELECT COUNT(*) FROM camp_mail WHERE campaign_id=? AND status='queued'"),sent:s("SELECT COUNT(*) FROM camp_mail m JOIN outbox o ON o.id=m.outbox_id WHERE m.campaign_id=? AND m.status='sent' AND o.sent=1"),
    pending:s("SELECT COUNT(*) FROM camp_mail m JOIN outbox o ON o.id=m.outbox_id WHERE m.campaign_id=? AND m.status='sent' AND o.sent=0 AND o.error IS NULL"),
    err:s("SELECT COUNT(*) FROM camp_mail m JOIN outbox o ON o.id=m.outbox_id WHERE m.campaign_id=? AND m.status='sent' AND o.sent=0 AND o.error IS NOT NULL"),
    skipped:s("SELECT COUNT(*) FROM camp_mail WHERE campaign_id=? AND status='skipped'"),click:s("SELECT COUNT(*) FROM camp_mail WHERE campaign_id=? AND clicks>0"),
    reg:s("SELECT COUNT(DISTINCT company_id) FROM users WHERE role='partner' AND company_id IN ("+ids+")"),
    cust:s("SELECT COUNT(DISTINCT company_id) FROM wallet WHERE type='topup' AND amount>0 AND company_id IN ("+ids+")"),
    unsub:s("SELECT COUNT(*) FROM companies WHERE unsub=1 AND id IN ("+ids+")")};}
const CAMP_ST={draft:['Entwurf',''],running:['Läuft','ok'],paused:['Pausiert','warn'],done:['Abgeschlossen','info']};
const cTag=s=>tag((CAMP_ST[s]||[s])[0],(CAMP_ST[s]||[0,''])[1]);

function audience(p){
  let sql="SELECT c.id,c.email FROM companies c WHERE c.source='import' AND c.status NOT IN ('blocked','demo') AND c.unsub=0 AND c.email IS NOT NULL AND c.email<>'' AND c.lang=? AND NOT EXISTS(SELECT 1 FROM users u WHERE u.company_id=c.id)";const a=[p.lang];
  if(p.list!==''&&p.list!==undefined){if(p.list==='-')sql+=" AND (c.list_name IS NULL OR c.list_name='')";else{sql+=' AND c.list_name=?';a.push(p.list);}}
  if(p.fresh)sql+=" AND c.invited_at IS NULL AND NOT EXISTS(SELECT 1 FROM camp_mail m WHERE m.company_id=c.id)";
  return all(sql+' ORDER BY c.id',a).filter(x=>first_mail(x.email));
}

function pg_a_camps(){
  need('admin');const r=R();
  if(r.method==='POST'&&post('act')==='create'){
    const lang=['de','fr','it'].includes(post('lang'))?post('lang'):'de';const name=post('name'),subject=post('subject'),body=String(r.P.body||'').trim();
    const list=post('list');const aud=audience({lang,list,fresh:r.P.fresh!==undefined});
    if(!name||!subject||!body){flash('Name, Betreff und Text sind Pflicht.','err');go('a_camps');}
    if(!/\{\{link\}\}/.test(body)){flash('Im Text muss {{link}} vorkommen (Registrierungs-Link).','err');go('a_camps');}
    if(!aud.length){flash('Keine passenden Empfänger (Sprache, Liste, bereits angeschrieben oder ohne E-Mail).','err');go('a_camps');}
    const id=ins('campaigns',{name,subject,body,lang,src:list===''?null:list,daily_limit:Math.min(Math.max(int(post('daily_limit'))||30,1),GLOBAL_MAX),status:'draft',created:now()});
    for(const a of aud)ins('camp_mail',{campaign_id:id,company_id:a.id,to_addr:first_mail(a.email),status:'queued'});
    logit(`Kampagne «${name}» angelegt: ${aud.length} Empfänger`);flash(`Kampagne angelegt: ${aud.length} Empfänger in der Warteschlange. Prüfen, Test-Mail senden und dann starten.`);go('a_camp',{id});}
  const L=lists();const cs=all('SELECT * FROM campaigns ORDER BY id DESC');
  let o=head('Kampagnen','E-Mail-Versand an Listen, in kleinen Tagesportionen','<a class="btn ghost" href="index.php?p=a_acq">← Trichter &amp; Kontakte</a>')+tabs('a_camps');
  if(!mail_ready())o+='<div class="flash err" style="background:var(--amber-bg);color:var(--amber)"><b>E-Mail-Versand ist nicht eingerichtet.</b> Kampagnen lassen sich anlegen, aber erst senden, wenn der Mailserver funktioniert (Menü «E-Mails»).</div>';
  if(!cs.length)o+='<div class="card empty" style="margin-bottom:18px">Noch keine Kampagne.</div>';else{
    o+='<div class="tw" style="margin-bottom:22px"><table><tr><th>Kampagne</th><th>Status</th><th class="r">Wartet</th><th class="r">Gesendet</th><th class="r">Fehler</th><th class="r">Geklickt</th><th class="r">Registriert</th><th class="r">Kunde</th><th class="r">Abgemeldet</th></tr>';
    for(const c of cs){const s=camp_stats(c);o+='<tr><td><a href="index.php?p=a_camp&id='+c.id+'"><b>'+h(c.name)+'</b></a><br><span class="muted sm">'+h(c.lang.toUpperCase())+' · '+h(c.src===null||c.src===undefined?'alle Listen':listLabel(c.src==='-'?'':c.src))+'</span></td><td>'+cTag(c.status)+'</td><td class="r num">'+s.queued+'</td><td class="r num">'+(s.sent+s.pending)+'</td><td class="r num">'+(s.err?'<span style="color:var(--red)"><b>'+s.err+'</b></span>':0)+'</td><td class="r num">'+s.click+' <span class="muted sm">'+pct(s.click,s.sent+s.pending)+'</span></td><td class="r num">'+s.reg+'</td><td class="r num">'+s.cust+'</td><td class="r num">'+s.unsub+'</td></tr>';}
    o+='</table></div>';}
  const T=JSON.stringify(TPL).replace(/</g,'\\u003c');
  o+='<div class="card"><h2 style="margin-bottom:6px">Neue Kampagne</h2><form method="post">'+csrf_field()+'<input type="hidden" name="act" value="create"><div class="grid2"><div><label>Name</label><input name="name" placeholder="z. B. Umzug Zürich – Welle 1" required></div><div><label>Liste</label><select name="list"><option value="">Alle Listen</option>'+L.map(x=>'<option value="'+h(x.l||'-')+'">'+h(listLabel(x.l))+' ('+x.n+')</option>').join('')+'</select></div><div><label>Sprache der Empfänger</label><select name="lang" id="clang"><option value="de">Deutsch</option><option value="fr">Französisch</option><option value="it">Italienisch</option></select></div><div><label>Höchstens pro Tag</label><input name="daily_limit" type="number" min="1" max="'+GLOBAL_MAX+'" value="30"></div></div>'
   +'<label style="display:flex;gap:10px;font-weight:600;margin:12px 0"><input type="checkbox" name="fresh" style="width:auto" checked> Nur Firmen, die noch nie angeschrieben wurden</label>'
   +'<label>Betreff</label><input name="subject" id="csub" value="'+h(TPL.de.subject)+'" required><label style="margin-top:10px">Text</label><textarea name="body" id="cbody" style="min-height:230px" required>'+h(TPL.de.body)+'</textarea>'
   +'<p class="sm muted">Platzhalter: <b>{{anrede}}</b> (Guten Tag + Name), <b>{{firma}}</b>, <b>{{gratis}}</b> (Gratis-Leads), <b>{{link}}</b> (Pflicht: persönlicher Registrierungs-Link), <b>{{abmelden}}</b> (optional – sonst wird Absender und Abmelde-Link automatisch angehängt). Versand Mo–Fr '+WIN[0]+'–'+WIN[1]+' Uhr, gleichmässig über den Tag verteilt.</p><button class="btn pri">Kampagne anlegen</button></form></div>'
   +'<script>(function(){var T='+T+',l=document.getElementById("clang"),s=document.getElementById("csub"),b=document.getElementById("cbody"),cur="de";l.addEventListener("change",function(){if(s.value===T[cur].subject&&b.value===T[cur].body){cur=l.value;s.value=T[cur].subject;b.value=T[cur].body}else cur=l.value})})();</script>';
  layout('Kampagnen',o,'a_acq');
}

function pg_a_camp(){
  need('admin');const r=R();const id=int(r.G.id);const camp=one('SELECT * FROM campaigns WHERE id=?',[id]);
  if(!camp){flash('Kampagne nicht gefunden.','err');go('a_camps');}
  if(r.method==='POST'){const act=post('act');
    if(act==='save'&&camp.status!=='running'){const body=String(r.P.body||'').trim();
      if(!/\{\{link\}\}/.test(body))flash('Im Text muss {{link}} vorkommen.','err');
      else{upd('campaigns',id,{subject:post('subject'),body,daily_limit:Math.min(Math.max(int(post('daily_limit'))||30,1),GLOBAL_MAX)});flash('Gespeichert.');}}
    else if(act==='limit'){upd('campaigns',id,{daily_limit:Math.min(Math.max(int(post('daily_limit'))||30,1),GLOBAL_MAX)});flash('Tageslimit gespeichert.');}
    else if(act==='start'||act==='resume'){if(!mail_ready())flash('Mailserver ist nicht eingerichtet (siehe Menü «E-Mails»).','err');else{upd('campaigns',id,{status:'running',started_at:camp.started_at||now()});logit('Kampagne gestartet: '+camp.name);flash('Kampagne läuft. Versand Mo–Fr '+WIN[0]+'–'+WIN[1]+' Uhr.');}}
    else if(act==='pause'){upd('campaigns',id,{status:'paused'});flash('Pausiert.');}
    else if(act==='now'){if(!mail_ready())flash('Mailserver ist nicht eingerichtet.','err');else{const n=send_batch(camp,3);flash(n+' Mail(s) sofort gesendet.');}}
    else if(act==='test'){const u=me();const fake={name:'Muster Umzüge AG',contact:'Hans Muster',email:u.email,lang:camp.lang,phone:'',web:''};
      const t=render(camp,fake,reg_link(fake),base_url()+'/index.php?p=t_unsub');
      const okm=send_mail(u.email,'[TEST] '+t.subject,t.body);flash(okm?'Test-Mail an '+u.email+' gesendet.':'Test-Mail nicht gesendet (Mailserver prüfen).',okm?'ok':'err');}
    else if(act==='cancel'){q("UPDATE camp_mail SET status='skipped',note='Kampagne abgebrochen' WHERE campaign_id=? AND status='queued'",[id]);upd('campaigns',id,{status:'done',finished_at:now()});flash('Kampagne beendet, wartende Mails verworfen.');}
    go('a_camp',{id});}
  const s=camp_stats(camp);const sentAll=s.sent+s.pending;
  let o=head(camp.name,'Kampagne · '+camp.lang.toUpperCase()+' · bis zu '+camp.daily_limit+' pro Tag','<a class="btn ghost" href="index.php?p=a_camps">← Kampagnen</a>')+tabs('a_camps');
  o+='<div class="row" style="margin-bottom:16px;gap:8px;flex-wrap:wrap">'+cTag(camp.status)+' ';
  if(camp.status==='draft')o+=post_btn('Kampagne starten','a_camp',{id},{act:'start'},'btn pri',s.queued+' Empfänger anschreiben? Der Versand läuft in Tagesportionen.');
  if(camp.status==='running')o+=post_btn('Pausieren','a_camp',{id},{act:'pause'},'btn ghost');
  if(camp.status==='paused')o+=post_btn('Fortsetzen','a_camp',{id},{act:'resume'},'btn pri');
  if(camp.status!=='done'){o+=post_btn('Jetzt 3 senden (Pilot)','a_camp',{id},{act:'now'},'btn ghost sm','Jetzt bis zu 3 Mails sofort versenden?');}
  o+=post_btn('Test-Mail an mich','a_camp',{id},{act:'test'},'btn ghost sm');
  if(camp.status!=='done')o+=post_btn('Beenden','a_camp',{id},{act:'cancel'},'btn ghost sm','Kampagne beenden? Wartende Mails werden verworfen.');
  o+='</div><div class="cards">'+[['Wartet',s.queued],['Gesendet',sentAll],['Fehler',s.err],['Geklickt',s.click+' · '+pct(s.click,sentAll)],['Registriert',s.reg],['Kunde',s.cust],['Abgemeldet',s.unsub],['Übersprungen',s.skipped]].map(([l,v])=>'<div class="card stat"><b>'+v+'</b><span>'+l+'</span></div>').join('')+'</div>';
  if(s.err)o+='<div class="flash err">'+s.err+' Mail(s) konnten nicht zugestellt werden – Ursache siehe Menü «E-Mails».</div>';
  // Text bearbeiten
  const lock=camp.status==='running';
  o+='<details class="card" style="margin-bottom:18px"'+(camp.status==='draft'?' open':'')+'><summary style="cursor:pointer;font-weight:700">Betreff, Text und Tageslimit'+(lock?' (während des Laufs gesperrt – erst pausieren)':'')+'</summary><form method="post" style="margin-top:12px">'+csrf_field()+'<input type="hidden" name="act" value="save"><label>Betreff</label><input name="subject" value="'+h(camp.subject)+'"'+(lock?' disabled':'')+'><label style="margin-top:10px">Text</label><textarea name="body" style="min-height:220px"'+(lock?' disabled':'')+'>'+h(camp.body)+'</textarea><div class="row" style="margin-top:10px"><div><label>Höchstens pro Tag</label><input name="daily_limit" type="number" min="1" max="'+GLOBAL_MAX+'" value="'+camp.daily_limit+'" style="width:110px"'+(lock?' disabled':'')+'></div><div style="align-self:end">'+(lock?'':'<button class="btn pri sm">Speichern</button>')+'</div></div></form>'+(lock?'<form method="post" class="row" style="margin-top:10px">'+csrf_field()+'<input type="hidden" name="act" value="limit"><input name="daily_limit" type="number" min="1" max="'+GLOBAL_MAX+'" value="'+camp.daily_limit+'" style="width:110px"><button class="btn ghost sm">Nur Tageslimit ändern</button></form>':'')+'</details>';
  // Empfänger
  const rec=all("SELECT m.*,c.name,c.contact,c.email AS cemail,c.unsub,c.status AS cstatus,o.sent AS osent,o.error AS oerr,(SELECT COUNT(*) FROM users u WHERE u.company_id=c.id AND u.role='partner') AS has_user,(SELECT COALESCE(SUM(w.amount),0) FROM wallet w WHERE w.company_id=c.id AND w.type='topup' AND w.amount>0) AS topup FROM camp_mail m JOIN companies c ON c.id=m.company_id LEFT JOIN outbox o ON o.id=m.outbox_id WHERE m.campaign_id=? ORDER BY (m.status='sent') DESC,m.sent_at DESC,m.id LIMIT 300",[id]);
  o+='<h2 style="margin:6px 0 10px">Empfänger</h2>';
  if(!rec.length)o+='<div class="card empty">Keine Empfänger.</div>';else{o+='<div class="tw"><table><tr><th>Firma</th><th>Gesendet</th><th>Zustellung</th><th>Reaktion</th></tr>';
    for(const m of rec){let z=m.status==='queued'?tag('Wartet'):m.status==='skipped'?tag('Übersprungen: '+str(m.note),'warn'):(m.osent?tag('Gesendet','ok'):(m.oerr?'<span title="'+h(m.oerr)+'">'+tag('Fehler','bad')+'</span>':tag('Wird gesendet','warn')));
      let rx='';if(m.topup>0)rx+=tag('Kunde','ok')+' ';else if(m.has_user)rx+=tag('Registriert','info')+' ';if(int(m.clicks))rx+=tag('Geklickt'+(m.clicks>1?' ×'+m.clicks:''),'info')+' ';if(int(m.unsub))rx+=tag('Abgemeldet','bad');
      o+='<tr><td><a href="index.php?p=a_company&id='+m.company_id+'"><b>'+h(m.name)+'</b></a><br><span class="muted sm">'+h(m.contact?m.contact+' · ':'')+h(m.to_addr||m.cemail)+'</span></td><td class="num sm">'+(m.sent_at?dtt(m.sent_at):'–')+'</td><td>'+z+'</td><td>'+(rx||'<span class="muted sm">–</span>')+'</td></tr>';}
    o+='</table></div>';}
  layout(camp.name,o,'a_acq');
}

// ----- Öffentliche Links aus der Mail -----
function pg_t_click(){
  const r=R();const m=int(r.G.m);
  if(sig_ok(['t','c',m],r.G.s)){const cm=one('SELECT * FROM camp_mail WHERE id=?',[m]);
    if(cm){q("UPDATE camp_mail SET clicks=clicks+1,clicked_at=COALESCE(clicked_at,?) WHERE id=?",[now(),m]);
      const c=one('SELECT * FROM companies WHERE id=?',[cm.company_id]);
      if(c){if(val("SELECT COUNT(*) FROM users WHERE company_id=? AND role='partner'",[c.id]))redirect(base_url()+'/index.php?p=login');redirect(reg_link(c));}}}
  redirect(base_url()+'/index.php?p=register');
}
function pg_t_unsub(){
  const r=R();const m=int(r.G.m);const ok=sig_ok(['t','u',m],r.G.s);const cm=ok?one('SELECT * FROM camp_mail WHERE id=?',[m]):null;
  const box=(t,b)=>sendHtml('<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Abmelden – auftragdeal.ch</title></head><body style="font:16px/1.5 system-ui,sans-serif;background:#F5F3EE;color:#1B1D22;margin:0;padding:40px 16px"><div style="max-width:460px;margin:0 auto;background:#fff;border:1px solid #E3DFD6;border-radius:12px;padding:26px"><h1 style="font-size:21px;margin:0 0 12px">'+t+'</h1>'+b+'<p style="color:#6B665C;font-size:13px;margin-top:20px">auftragdeal.ch · Dritivo AG · Pfäffikon SZ</p></div></body></html>');
  if(!cm){box('Link ungültig','<p>Dieser Abmelde-Link ist nicht (mehr) gültig. Schreiben Sie uns an '+h(cfg('notify'))+', dann tragen wir Sie aus.</p>');return;}
  if(r.method==='POST'){q("UPDATE companies SET unsub=1,unsub_at=? WHERE id=?",[now(),cm.company_id]);q("UPDATE camp_mail SET status='skipped',note='abgemeldet' WHERE company_id=? AND status='queued'",[cm.company_id]);logit('Abmeldung von Mails: Firma #'+cm.company_id);
    box('Abgemeldet','<p>Sie erhalten von uns keine weiteren Nachrichten mehr.</p>');return;}
  box('Keine weiteren Mails?','<p>Möchten Sie keine Nachrichten von auftragdeal.ch mehr erhalten?</p><form method="post">'+csrf_field()+'<button style="background:#D9440F;color:#fff;border:0;border-radius:9px;padding:10px 18px;font:inherit;font-weight:700;cursor:pointer">Ja, abmelden</button></form>');
}

module.exports={parse_table,do_import,tick,send_batch,start_scheduler,pages:{a_acq:pg_a_acq,a_camps:pg_a_camps,a_camp:pg_a_camp,t_click:pg_t_click,t_unsub:pg_t_unsub}};
