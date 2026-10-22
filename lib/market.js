'use strict';
const K=require('./core');
const {h,q,one,all,val,ins,int,num,round2,str,chf,dt,dtt,date,time,strtotime,now,cfg,jcsv,jparse,emailok,flash,go,need,post,logit,send_mail,base_url,csrf_field,db,R,BRANCHES}=K;
const U=require('./ui');const {layout,head,tag,as_tag,post_btn}=U;
const nl2br=s=>h(s).replace(/\r?\n/g,'<br>');
const mbsub=(s,a,b)=>Array.from(str(s)).slice(a,a+b).join('');

// ===== Einstellungen =====
const SETTING_DEFAULTS={auto_approve:'0',auto_publish:'0',max_buyers:'3',expire_days:'14',excl_mult:'2.5',decay_days:'3',decay_pct:'20',claim_hours:'72',notify_partners:'1',bank_holder:'Dritivo AG',bank_name:'',bank_iban:''};
function setting(k){const v=val('SELECT v FROM settings WHERE k=?',[k]);if(v!==null&&v!==undefined)return String(v);
  if(k in SETTING_DEFAULTS)return SETTING_DEFAULTS[k];const c=cfg(k==='default_price'?'lead_price':k);return c==null?'':String(c);}
function set_setting(k,v){q('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v',[k,String(v)]);}
function branch_prices(){const j=jparse(setting('prices'),{});return (j&&typeof j==='object'&&!Array.isArray(j))?j:{};}
function price_for_branch(b){const p=branch_prices();return num(p[b]!==undefined?p[b]:setting('default_price'));}

// ===== Preislogik =====
function lead_price(l){
  let base=num(l.price)>0?num(l.price):price_for_branch(str(l.branch));
  if(l.published&&int(setting('decay_days'))>0&&(time()-strtotime(l.published))>=int(setting('decay_days'))*86400)base*=1-num(setting('decay_pct'))/100;
  return round2(base);}
const lead_price_full=l=>num(l.price)>0?num(l.price):price_for_branch(str(l.branch));
const excl_price=l=>round2(lead_price(l)*num(setting('excl_mult')));
const sold_count=lid=>int(val("SELECT COUNT(*) FROM assignments WHERE lead_id=? AND status='accepted'",[lid]));
const lead_max=l=>int(l.max_buyers||setting('max_buyers'));

// ===== Guthaben =====
const wallet_balance=cid=>round2(num(val('SELECT COALESCE(SUM(amount),0) FROM wallet WHERE company_id=?',[cid])));
function wallet_add(cid,amt,type,ref='',note='',by=null){ins('wallet',{company_id:cid,amount:round2(amt),type,ref,note,by_user:by,created:now()});}
const STRIPE_RE=/^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_\/-]+$/;
function stripe_links(){let j=jparse(setting('stripe_links_json'),null);const l=Array.isArray(j)?j:cfg('stripe_links',[]);const o=[];
  for(const x of (Array.isArray(l)?l:[])){const u=str(x&&x.url).trim();if(STRIPE_RE.test(u))o.push({amount:num(x.amount),url:u});}
  return o.sort((a,b)=>a.amount-b.amount);}
const topup_ref=cid=>'AD-'+String(cid).padStart(4,'0');
const stripe_url=(u,cid)=>u+'?client_reference_id='+encodeURIComponent(topup_ref(cid));

// ===== Matching =====
function plz_match(zip,ranges){
  ranges=str(ranges).trim();if(ranges==='')return true;const z=int(str(zip).replace(/\D/g,''));if(!z)return true;
  for(const r of ranges.split(/[,;\s]+/).filter(Boolean)){
    let m=r.match(/^(\d{4})\s*-\s*(\d{4})$/);
    if(m){if(z>=int(m[1])&&z<=int(m[2]))return true;}
    else if(/^\d{1,4}$/.test(r)){if(String(z).startsWith(r))return true;}
  }return false;}
const ci=(a,b)=>a.toLowerCase().includes(b.toLowerCase());
function branch_match(branch,services){
  const s=jparse(services,null);if(!Array.isArray(s)||!s.length)return true;
  for(let x of s){x=str(x);if(x!==''&&(ci(branch,x)||ci(x,branch)))return true;
    for(const w of branch.split(/[\s&,\/]+/).filter(Boolean))if(w.length>3&&ci(x,w))return true;}
  return false;}
const lead_matches=(l,c)=>branch_match(str(l.branch),c.services)&&plz_match(str(l.zip),c.plz_ranges);

// ===== Lead-Lebenszyklus =====
function housekeeping(){
  if(time()-int(setting('hk_ts'))<60)return;set_setting('hk_ts',time());
  q("UPDATE leads SET status='expired' WHERE status='open' AND expires IS NOT NULL AND expires<?",[now()]);}
function intake_check(id){
  const l=one('SELECT * FROM leads WHERE id=?',[id]);if(!l)return;const f=[];
  if(l.email&&int(val("SELECT COUNT(*) FROM leads WHERE id<>? AND lower(email)=lower(?) AND branch=? AND created>?",[id,l.email,l.branch,date('Y-m-d H:i:s',time()-7*86400)])))f.push('Mögliches Duplikat (gleiche E-Mail & Branche in 7 Tagen)');
  if(l.phone&&str(l.phone).replace(/\D/g,'').length<7)f.push('Telefonnummer unplausibel');
  if(Array.from(str(l.description)).length<15)f.push('Beschreibung sehr kurz');
  if(!l.zip||!l.city)f.push('Ort fehlt');
  q('UPDATE leads SET flag=? WHERE id=?',[f.length?f.join(' · '):null,id]);
  if(setting('auto_publish')==='1'&&!f.length)publish_lead(id,null,null);}
function publish_lead(id,price,max){
  let l=one('SELECT * FROM leads WHERE id=?',[id]);if(!l)return;
  q("UPDATE leads SET status='open',published=?,expires=?,price=?,max_buyers=? WHERE id=?",[now(),date('Y-m-d H:i:s',time()+int(setting('expire_days'))*86400),(price&&price>0)?price:null,(max&&max>0)?max:null,id]);
  logit(`Lead #${id} im Markt veröffentlicht`);
  if(setting('notify_partners')==='1'){l=one('SELECT * FROM leads WHERE id=?',[id]);let n=0;
    for(const c of all("SELECT c.*,u.email AS uemail FROM companies c JOIN users u ON u.company_id=c.id AND u.role='partner' AND u.active=1 AND u.verified=1 WHERE c.status='active' AND c.notify=1")){
      if(n>=300)break;if(!lead_matches(l,c))continue;
      send_mail(str(c.uemail),'Neuer Lead: '+l.branch+' in '+l.city,'Guten Tag\n\nNeuer Lead im Markt: '+l.branch+' in '+(str(l.zip)+' '+str(l.city)).trim()+'.\nPreis: CHF '+chf(lead_price(l))+'. Wer zuerst kauft, erhält den Kontakt (max. '+lead_max(l)+' Firmen).\n\n'+base_url()+'/index.php?p=p_market\n\nBenachrichtigungen ausschalten: Firmenprofil im Portal.\nauftragdeal.ch');n++;}}}

// ===== Kauf =====
function can_buy(u){
  if((u.co_status||'')==='blocked')return 'Ihre Firma ist gesperrt.';
  if((u.co_status||'')!=='active')return 'Ihre Firma wird noch geprüft – Käufe sind nach der Freigabe möglich.';
  if(!u.verified)return 'Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse (Link in der Willkommens-Mail).';
  return null;}
function add_client_from_lead(cid,l){if(!one('SELECT id FROM clients WHERE company_id=? AND lead_id=?',[cid,l.id]))ins('clients',{company_id:cid,name:l.name,email:l.email,phone:l.phone,zip:l.zip,city:l.city,notes:l.branch+': '+l.description,lead_id:l.id,created:now()});}

function buy_lead(lid,cid,excl=false,offer=false){
  const D=db();D.exec('BEGIN IMMEDIATE');
  try{
    const fail=m=>{D.exec('ROLLBACK');return [false,m];};
    const co=one('SELECT * FROM companies WHERE id=?',[cid]);if(!co||co.status!=='active')return fail('Firma nicht freigegeben.');
    const l=one('SELECT * FROM leads WHERE id=?',[lid]);if(!l||['spam','closed'].includes(l.status))return fail('Dieser Lead ist nicht mehr verfügbar.');
    const ex=one('SELECT * FROM assignments WHERE lead_id=? AND company_id=?',[lid,cid]);
    if(ex&&['accepted','refunded'].includes(ex.status))return fail('Diesen Lead haben Sie bereits erhalten.');
    let price,kind;
    if(offer){if(!ex||ex.status!=='offered')return fail('Angebot nicht mehr gültig.');price=num(ex.price);kind='direct';}
    else{
      if(l.status!=='open'||(l.expires&&l.expires<now()))return fail('Dieser Lead ist nicht mehr im Markt.');
      const sold=sold_count(lid);if(sold>=lead_max(l)){q("UPDATE leads SET status='soldout' WHERE id=?",[lid]);D.exec('COMMIT');return [false,'Leider ausverkauft.'];}
      if(excl){if(sold>0)return fail('Exklusivkauf nicht mehr möglich – es gibt bereits Käufer.');price=excl_price(l);kind='exclusive';}
      else{price=lead_price(l);kind='market';}
    }
    const free=!excl&&int(co.free_leads)>0;
    if(!free){const bal=wallet_balance(cid);if(bal+num(co.credit_limit)+0.0001<price)return fail('Guthaben reicht nicht: Kontostand CHF '+chf(bal)+', Preis CHF '+chf(price)+'. Bitte Guthaben aufladen.');}
    const paid=free?0:price;
    if(ex)q("UPDATE assignments SET status='accepted',kind=?,price=?,is_free=?,decided=? WHERE id=?",[kind,paid,free?1:0,now(),ex.id]);
    else ins('assignments',{lead_id:lid,company_id:cid,status:'accepted',kind,price:paid,is_free:free?1:0,created:now(),decided:now()});
    if(free)q('UPDATE companies SET free_leads=free_leads-1 WHERE id=?',[cid]);else wallet_add(cid,-price,'purchase','Lead #'+lid,l.branch+' '+l.zip+' '+l.city);
    add_client_from_lead(cid,l);
    const sold=sold_count(lid);
    if(excl)q("UPDATE leads SET status='soldout',exclusive_sold=1 WHERE id=?",[lid]);else if(!offer&&sold>=lead_max(l))q("UPDATE leads SET status='soldout' WHERE id=?",[lid]);
    D.exec('COMMIT');
    logit(`Lead #${lid} gekauft von Firma #${cid} (${kind}, CHF ${chf(paid)}${free?', gratis':''})`);
    if(l.email&&emailok(l.email))send_mail(str(l.email),'Ihre Anfrage bei auftragdeal.ch','Guten Tag '+l.name+'\n\nIhre Anfrage ('+l.branch+', '+l.city+') wurde an ein passendes Unternehmen vermittelt: '+co.name+'.\nDas Unternehmen meldet sich in Kürze bei Ihnen.\n\nFreundliche Grüsse\nauftragdeal.ch');
    return [true,free?'Lead gekauft – als Gratis-Lead verrechnet. Der Kontakt wurde ins CRM übernommen.':'Lead gekauft (CHF '+chf(paid)+'). Der Kontakt wurde ins CRM übernommen.'];
  }catch(e){console.error('buy_lead:',e);try{D.exec('ROLLBACK');}catch(x){}return [false,'Technischer Fehler beim Kauf. Bitte erneut versuchen.'];}
}
function refund_assignment(aid,by){
  const D=db();D.exec('BEGIN IMMEDIATE');
  try{const a=one("SELECT * FROM assignments WHERE id=? AND status='accepted' AND claim_status='open'",[aid]);if(!a){D.exec('ROLLBACK');return false;}
    q("UPDATE assignments SET status='refunded',claim_status='approved' WHERE id=?",[aid]);
    if(a.is_free)q('UPDATE companies SET free_leads=free_leads+1 WHERE id=?',[a.company_id]);else wallet_add(a.company_id,num(a.price),'refund','Lead #'+a.lead_id,'Reklamation anerkannt',by);
    const l=one('SELECT * FROM leads WHERE id=?',[a.lead_id]);
    if(l&&l.status==='soldout'&&(!l.expires||l.expires>now())&&sold_count(l.id)<lead_max(l)&&!int(l.exclusive_sold))q("UPDATE leads SET status='open' WHERE id=?",[l.id]);
    else if(l&&l.status==='soldout'&&int(l.exclusive_sold)&&(!l.expires||l.expires>now()))q("UPDATE leads SET status='open',exclusive_sold=0 WHERE id=?",[l.id]);
    D.exec('COMMIT');return true;}catch(e){try{D.exec('ROLLBACK');}catch(x){}return false;}}

// ===== Partner: Lead-Markt =====
function status_banner(u){
  let o='';const st=u.co_status||'';
  if(st==='pending')o+='<div class="flash err" style="background:var(--amber-bg);color:var(--amber)">Ihre Firma wird von uns geprüft. Bis zur Freigabe können Sie Profil und Markt ansehen, aber noch keine Leads kaufen.</div>';
  if(st==='blocked')o+='<div class="flash err">Ihre Firma ist gesperrt. Bitte kontaktieren Sie uns: '+h(cfg('notify'))+'</div>';
  if(!u.verified)o+='<div class="flash err" style="background:var(--amber-bg);color:var(--amber)">Bitte bestätigen Sie Ihre E-Mail-Adresse (Link in der Willkommens-Mail). '+post_btn('Mail erneut senden','resend',{},{},'btn ghost sm')+'</div>';
  return o;}
function lead_card(l,u,buy=true){
  const sold=sold_count(l.id),max=lead_max(l),p=lead_price(l),full=lead_price_full(l),err=can_buy(u);
  const age=Math.max(0,Math.floor((time()-strtotime(l.published||l.created))/3600));const ages=age<24?`vor ${age} Std.`:'vor '+Math.floor(age/24)+' Tg.';
  const free=int(u.free_leads)>0;
  let o='<div class="card" style="margin-bottom:14px"><div class="top" style="margin-bottom:8px"><div><h2>'+h(l.branch)+' · '+h((str(l.zip)+' '+str(l.city)).trim())+'</h2><div class="sub">'+ages+(l.when_?' · Termin: '+h(l.when_):'')+(l.budget?' · Budget: '+h(l.budget):'')+' · Auftraggeber: '+h(mbsub(l.name,0,1))+'.</div></div><div style="text-align:right"><b class="num" style="font-size:22px">'+(free?'Gratis':'CHF '+chf(p))+'</b>'+(p<full?'<div class="sm muted"><s>CHF '+chf(full)+'</s> Preisnachlass</div>':'')+'<div class="sm muted">'+(max-sold)+' von '+max+' Plätzen frei</div></div></div><p style="margin:0 0 12px">'+nl2br(l.description)+'</p>';
  if(buy){o+='<div class="row">';
    if(err)o+='<span class="muted sm">'+h(err)+'</span>';
    else{o+=post_btn(free?'Gratis-Lead holen':'Lead kaufen (CHF '+chf(p)+')','p_market',{},{act:'buy',lid:l.id},'btn pri');
      if(sold===0)o+=post_btn('Exklusiv kaufen (CHF '+chf(excl_price(l))+')','p_market',{},{act:'excl',lid:l.id},'btn ghost','Exklusiv: nur Sie erhalten diesen Lead. Jetzt kaufen?');
      o+='<span class="muted sm">Kontaktdaten erhalten Sie sofort nach dem Kauf.</span>';}
    o+='</div>';}
  return o+'</div>';}

function pg_p_market(){
  const u=need('partner'),cid=int(u.company_id);housekeeping();const r=R();
  if(r.method==='POST'){const err=can_buy(u);if(err){flash(err,'err');go('p_market');}
    const [ok,m]=buy_lead(int(post('lid')),cid,post('act')==='excl');flash(m,ok?'ok':'err');go(ok?'p_leads':'p_market');}
  const co=one('SELECT * FROM companies WHERE id=?',[cid]);const allm=r.G.all!==undefined;
  let rows=all("SELECT * FROM leads WHERE status='open' AND (expires IS NULL OR expires>?) AND id NOT IN (SELECT lead_id FROM assignments WHERE company_id=? AND status IN ('accepted','refunded')) ORDER BY published DESC LIMIT 200",[now(),cid]);
  if(!allm)rows=rows.filter(l=>lead_matches(l,co));
  const bal=wallet_balance(cid);
  let o=head('Lead-Markt','Aktuelle Anfragen – wer zuerst kauft, erhält den Kontakt','<a class="btn ghost" href="index.php?p=p_wallet">Guthaben: CHF '+chf(bal)+'</a>')+status_banner(u)+'<div class="row" style="margin-bottom:14px"><span class="tag ok">Gratis-Leads: '+int(u.free_leads)+'</span>'+(allm?'<a class="btn ghost sm" href="index.php?p=p_market">Nur passende zeigen</a>':'<a class="btn ghost sm" href="index.php?p=p_market&all=1">Alle Leads zeigen</a>')+'<span class="muted sm">Filter: '+h(jcsv(co.services)||'alle Branchen')+' · '+h(co.plz_ranges||'ganze Schweiz')+' <a href="index.php?p=p_profile">ändern</a></span></div>';
  if(!rows.length)o+='<div class="card empty">Aktuell keine passenden Leads im Markt. Wir informieren Sie per E-Mail, sobald neue verfügbar sind.</div>';
  for(const l of rows)o+=lead_card(l,u);
  layout('Lead-Markt',o,'p_market');
}

function pg_p_leads(){
  const u=need('partner'),cid=int(u.company_id);housekeeping();const r=R();
  if(r.method==='POST'){const act=post('act'),aid=int(post('aid'));const a=one('SELECT * FROM assignments WHERE id=? AND company_id=?',[aid,cid]);
    if(a){
      if(act==='accept'){const err=can_buy(u);if(err)flash(err,'err');else{const [ok,m]=buy_lead(int(a.lead_id),cid,false,true);flash(m,ok?'ok':'err');}}
      else if(act==='decline'&&a.status==='offered'){q("UPDATE assignments SET status='declined',decided=? WHERE id=?",[now(),aid]);flash('Angebot abgelehnt.');}
      else if(act==='claim'&&a.status==='accepted'&&!a.claim_status){
        if(time()-strtotime(a.decided)>int(setting('claim_hours'))*3600)flash('Reklamationsfrist ('+setting('claim_hours')+' Std.) abgelaufen.','err');
        else if(post('reason')==='')flash('Bitte Grund angeben.','err');
        else{q("UPDATE assignments SET claim_status='open',claim_reason=?,claim_note=?,claim_at=? WHERE id=?",[post('reason'),post('note'),now(),aid]);send_mail(cfg('notify'),'Reklamation Lead #'+a.lead_id,u.company+' reklamiert Lead #'+a.lead_id+': '+post('reason')+'\n'+post('note')+'\n\n'+base_url()+'/index.php?p=a_claims');flash('Reklamation eingereicht. Wir prüfen sie umgehend.');}}}
    go('p_leads');}
  const rr=all("SELECT a.id AS aid,a.status AS astatus,a.price AS aprice,a.is_free,a.kind,a.decided,a.claim_status,a.claim_reason,a.created AS acreated,l.* FROM assignments a JOIN leads l ON l.id=a.lead_id WHERE a.company_id=? AND a.status<>'declined' ORDER BY (a.status='offered') DESC,a.id DESC",[cid]);
  let o=head('Meine Leads','Gekaufte Leads und Direktangebote')+status_banner(u);
  if(!rr.length)o+='<div class="card empty">Noch keine Leads. Im <a href="index.php?p=p_market">Lead-Markt</a> finden Sie aktuelle Anfragen.</div>';
  const CS={open:'in Prüfung',approved:'anerkannt',rejected:'abgelehnt'},CC={open:'warn',approved:'ok',rejected:'bad'};
  for(const x of rr){const acc=x.astatus==='accepted';
    o+='<div class="card" style="margin-bottom:14px"><div class="top" style="margin-bottom:8px"><div><h2>'+h(x.branch)+' · '+h((str(x.zip)+' '+str(x.city)).trim())+'</h2><div class="sub">'+dtt(x.acreated)+(x.when_?' · Termin: '+h(x.when_):'')+(x.budget?' · Budget: '+h(x.budget):'')+'</div></div><div>'+as_tag(x.astatus)+(x.is_free?' '+tag('Gratis','ok'):(acc?' '+tag('CHF '+chf(x.aprice)):''))+(x.kind==='exclusive'?' '+tag('Exklusiv','info'):'')+(x.claim_status?' '+tag('Reklamation: '+CS[x.claim_status],CC[x.claim_status]):'')+'</div></div><p style="margin:0 0 12px">'+nl2br(x.description)+'</p>';
    if(acc){o+='<dl class="kv"><dt>Kontakt</dt><dd>'+h(x.name)+'</dd><dt>E-Mail</dt><dd><a href="mailto:'+h(x.email)+'">'+h(x.email)+'</a></dd><dt>Telefon</dt><dd>'+h(x.phone)+'</dd></dl>';
      if(!x.claim_status&&time()-strtotime(x.decided)<=int(setting('claim_hours'))*3600)o+='<details style="margin-top:12px"><summary class="sm muted" style="cursor:pointer">Lead reklamieren (innerhalb '+h(setting('claim_hours'))+' Std.)</summary><form method="post" class="f" style="margin-top:10px">'+csrf_field()+'<input type="hidden" name="act" value="claim"><input type="hidden" name="aid" value="'+x.aid+'"><div><label>Grund</label><select name="reason"><option>Telefonnummer ungültig</option><option>Kunde nicht erreichbar</option><option>Kein Bedarf / Anfrage nicht ernst gemeint</option><option>Doppelte Anfrage</option><option>Sonstiges</option></select></div><div><label>Bemerkung</label><input name="note"></div><div class="full"><button class="btn ghost sm">Reklamation senden</button></div></form></details>';}
    else if(x.astatus==='offered')o+='<div class="row">'+post_btn(int(u.free_leads)>0?'Annehmen (gratis)':'Annehmen (CHF '+chf(x.aprice)+')','p_leads',{},{act:'accept',aid:x.aid},'btn pri')+post_btn('Ablehnen','p_leads',{},{act:'decline',aid:x.aid},'btn ghost')+'<span class="muted sm">Direktangebot von uns – Kontakt nach Annahme.</span></div>';
    o+='</div>';}
  layout('Meine Leads',o,'p_leads');
}

function pg_p_wallet(){
  const u=need('partner'),cid=int(u.company_id);const co=one('SELECT * FROM companies WHERE id=?',[cid]);const bal=wallet_balance(cid);
  let rows=all('SELECT * FROM wallet WHERE company_id=? ORDER BY id',[cid]);let run=0;for(const r of rows){run+=r.amount;r.saldo=run;}rows.reverse();
  const tn={topup:'Einzahlung',purchase:'Lead-Kauf',refund:'Rückerstattung',adjust:'Korrektur'};
  let o=head('Guthaben','Lead-Käufe werden vom Guthaben abgebucht')+status_banner(u)+'<div class="cards"><div class="card stat"><b class="num">CHF '+chf(bal)+'</b><span>Aktuelles Guthaben</span></div><div class="card stat"><b class="num">'+int(co.free_leads)+'</b><span>Gratis-Leads übrig</span></div><div class="card stat"><b class="num">CHF '+chf(co.credit_limit)+'</b><span>Kreditlimite</span></div></div>';
  const sl=stripe_links(),auto=str(cfg('stripe_webhook_secret',''))!=='';
  if(sl.length){o+='<div class="card" style="margin-bottom:18px"><h2 style="margin-bottom:6px">Online aufladen (Karte / TWINT)</h2><p class="sm muted" style="margin-top:0">Sichere Zahlung über Stripe. '+(auto?'Das Guthaben wird nach der Zahlung automatisch gutgeschrieben (meist innert Minuten).':'Das Guthaben wird nach Zahlungseingang von uns gutgeschrieben (in der Regel innert 1 Arbeitstag).')+'</p><div class="row">';for(const x of sl)o+='<a class="btn pri" target="_blank" rel="noopener" href="'+h(stripe_url(x.url,cid))+'">'+(x.amount>0?'CHF '+chf(x.amount)+' aufladen':'Guthaben aufladen')+'</a>';o+='</div></div>';}
  o+='<div class="card" style="margin-bottom:18px"><h2 style="margin-bottom:10px">Guthaben per Überweisung aufladen</h2><p class="sm muted" style="margin-top:0">Überweisen Sie einen beliebigen Betrag. Wir schreiben ihn nach Zahlungseingang gut (in der Regel innerhalb 1 Arbeitstag).</p><dl class="kv"><dt>Empfänger</dt><dd>'+h(setting('bank_holder'))+'</dd><dt>Bank</dt><dd>'+h(setting('bank_name')||'wird nach Freigabe mitgeteilt')+'</dd><dt>IBAN</dt><dd>'+h(setting('bank_iban')||'–')+'</dd><dt>Zahlungsreferenz</dt><dd><b>'+h(topup_ref(cid))+'</b> (bitte unbedingt angeben)</dd></dl></div>';
  o+='<h2 style="margin-bottom:10px">Buchungen</h2>';
  if(!rows.length)o+='<div class="card empty">Noch keine Buchungen.</div>';else{o+='<div class="tw"><table><tr><th>Datum</th><th>Art</th><th>Text</th><th class="r">Betrag CHF</th><th class="r">Saldo CHF</th></tr>';for(const r of rows)o+='<tr><td class="num">'+dtt(r.created)+'</td><td>'+h(tn[r.type]||r.type)+'</td><td class="sm">'+h((str(r.ref)+' '+str(r.note)).trim())+'</td><td class="r num" style="color:'+(r.amount<0?'var(--red)':'var(--green)')+'">'+(r.amount>0?'+':'')+chf(r.amount)+'</td><td class="r num">'+chf(r.saldo)+'</td></tr>';o+='</table></div>';}
  layout('Guthaben',o,'p_wallet');
}

// ===== Admin: Reklamationen / Finanzen / Einstellungen =====
function pg_a_claims(){
  const me=need('admin');const r=R();
  if(r.method==='POST'){const aid=int(post('aid'));
    if(post('act')==='approve')flash(refund_assignment(aid,int(me.id))?'Reklamation anerkannt – Betrag gutgeschrieben, Lead wieder im Markt (falls Plätze frei).':'Nicht möglich.','ok');
    else if(post('act')==='reject'){q("UPDATE assignments SET claim_status='rejected' WHERE id=? AND claim_status='open'",[aid]);flash('Reklamation abgelehnt.');}
    go('a_claims');}
  const rr=all("SELECT a.*,l.branch,l.city,l.zip,c.name AS cname FROM assignments a JOIN leads l ON l.id=a.lead_id JOIN companies c ON c.id=a.company_id WHERE a.claim_status IS NOT NULL ORDER BY (a.claim_status='open') DESC,a.claim_at DESC LIMIT 100");
  let o=head('Reklamationen','Prüfen Sie, ob der Lead ungültig war');
  const CN={open:'Offen',approved:'Anerkannt',rejected:'Abgelehnt'},CC={open:'warn',approved:'ok',rejected:'bad'};
  if(!rr.length)o+='<div class="card empty">Keine Reklamationen.</div>';else{o+='<div class="tw"><table><tr><th>Lead</th><th>Firma</th><th>Grund</th><th class="r">Preis</th><th>Status</th><th></th></tr>';
    for(const a of rr)o+='<tr><td><a href="index.php?p=a_lead&id='+a.lead_id+'">#'+a.lead_id+' '+h(a.branch)+' · '+h(a.zip+' '+a.city)+'</a></td><td><a href="index.php?p=a_company&id='+a.company_id+'">'+h(a.cname)+'</a></td><td class="sm">'+h(a.claim_reason)+'<br><span class="muted">'+h(a.claim_note)+'</span></td><td class="r num">'+(a.is_free?'Gratis':chf(a.price))+'</td><td>'+tag(CN[a.claim_status],CC[a.claim_status])+'</td><td class="r">'+(a.claim_status==='open'?'<div class="row" style="justify-content:flex-end">'+post_btn('Anerkennen','a_claims',{},{act:'approve',aid:a.id},'btn pri sm','Rückerstattung buchen?')+post_btn('Ablehnen','a_claims',{},{act:'reject',aid:a.id},'btn ghost sm')+'</div>':'')+'</td></tr>';o+='</table></div>';}
  layout('Reklamationen',o,'a_claims');
}
function pg_a_finance(){
  need('admin');const m=date('Y-m-01');
  const rev=(w='',p=[])=>num(val("SELECT COALESCE(SUM(price),0) FROM assignments WHERE status='accepted' "+w,p));
  const c=[['Umsatz gesamt (CHF)',chf(rev())],['Umsatz '+date('F Y')+' (CHF)',chf(rev('AND decided>=?',[m]))],['Verkaufte Leads',int(val("SELECT COUNT(*) FROM assignments WHERE status='accepted'"))],['davon Gratis-Leads',int(val("SELECT COUNT(*) FROM assignments WHERE status='accepted' AND is_free=1"))],['Rückerstattet (CHF)',chf(num(val("SELECT COALESCE(SUM(amount),0) FROM wallet WHERE type='refund'")))],['Einzahlungen gesamt (CHF)',chf(num(val("SELECT COALESCE(SUM(amount),0) FROM wallet WHERE type='topup'")))],['Kundenguthaben offen (CHF)',chf(num(val('SELECT COALESCE(SUM(amount),0) FROM wallet')))],['Offene Reklamationen',int(val("SELECT COUNT(*) FROM assignments WHERE claim_status='open'"))]];
  let o=head('Finanzen','Umsatz, Guthaben und Verkäufe','<a class="btn ghost" href="index.php?p=a_export&t=sales">CSV Verkäufe</a><a class="btn ghost" href="index.php?p=a_export&t=wallet">CSV Buchungen</a>')+'<div class="cards">';
  for(const [l,v] of c)o+='<div class="card stat"><b class="num">'+h(v)+'</b><span>'+h(l)+'</span></div>';o+='</div>';
  const r=all("SELECT a.*,l.branch,l.city,c.name AS cname FROM assignments a JOIN leads l ON l.id=a.lead_id JOIN companies c ON c.id=a.company_id WHERE a.status IN ('accepted','refunded') ORDER BY a.decided DESC LIMIT 100");
  o+='<h2 style="margin-bottom:10px">Letzte Verkäufe</h2>';
  if(!r.length)o+='<div class="card empty">Noch keine Verkäufe.</div>';else{o+='<div class="tw"><table><tr><th>Datum</th><th>Lead</th><th>Firma</th><th>Art</th><th class="r">CHF</th><th>Status</th></tr>';
    for(const a of r)o+='<tr><td class="num">'+dtt(a.decided)+'</td><td><a href="index.php?p=a_lead&id='+a.lead_id+'">#'+a.lead_id+' '+h(a.branch)+' '+h(a.city)+'</a></td><td>'+h(a.cname)+'</td><td>'+h({market:'Markt',exclusive:'Exklusiv',direct:'Direkt'}[a.kind]||a.kind)+(a.is_free?' · gratis':'')+'</td><td class="r num">'+chf(a.price)+'</td><td>'+as_tag(a.status)+'</td></tr>';o+='</table></div>';}
  layout('Finanzen',o,'a_finance');
}
function pg_a_settings(){
  need('admin');const r=R();
  if(r.method==='POST'){
    for(const k of ['max_buyers','expire_days','decay_days','claim_hours'])set_setting(k,Math.max(0,int(post(k))));
    for(const k of ['excl_mult','decay_pct','default_price','free_leads'])set_setting(k,Math.max(0,num(post(k))));
    for(const k of ['auto_approve','auto_publish','notify_partners'])set_setting(k,r.P[k]!==undefined?'1':'0');
    for(const k of ['bank_holder','bank_name','bank_iban'])set_setting(k,post(k));
    const sl=[];for(let i=0;i<8;i++){const u=post('su'+i);if(u==='')continue;if(!STRIPE_RE.test(u)){flash('Ungültiger Stripe-Link in Zeile '+(i+1)+' (muss mit https://buy.stripe.com/ beginnen).','err');go('a_settings');}sl.push({amount:num(post('sa'+i)),url:u});}
    set_setting('stripe_links_json',JSON.stringify(sl));
    const pr={};BRANCHES.forEach((b,i)=>{const v=num(post('pr'+i));if(v>0)pr[b]=v;});set_setting('prices',JSON.stringify(pr));
    logit('Einstellungen geändert');flash('Einstellungen gespeichert.');go('a_settings');}
  const ck=k=>setting(k)==='1'?' checked':'';const pr=branch_prices();
  let o=head('Einstellungen','Regeln für Preise, Markt und Freigaben','<a class="btn ghost" href="index.php?p=a_backup">Datenbank-Backup laden</a>')+'<form method="post">'+csrf_field()+'<div class="grid2"><div class="card"><h2 style="margin-bottom:12px">Markt &amp; Preise</h2><div class="f"><div><label>Standardpreis pro Lead (CHF)</label><input name="default_price" value="'+h(setting('default_price'))+'"></div><div><label>Max. Käufer pro Lead</label><input type="number" min="1" name="max_buyers" value="'+h(setting('max_buyers'))+'"></div><div><label>Exklusiv-Aufschlag (Faktor)</label><input name="excl_mult" value="'+h(setting('excl_mult'))+'"></div><div><label>Lead läuft ab nach (Tagen)</label><input type="number" name="expire_days" value="'+h(setting('expire_days'))+'"></div><div><label>Preisnachlass ab Alter (Tage, 0 = aus)</label><input type="number" name="decay_days" value="'+h(setting('decay_days'))+'"></div><div><label>Nachlass (%)</label><input name="decay_pct" value="'+h(setting('decay_pct'))+'"></div><div><label>Reklamationsfrist (Std.)</label><input type="number" name="claim_hours" value="'+h(setting('claim_hours'))+'"></div><div><label>Gratis-Leads pro neue Firma</label><input name="free_leads" value="'+h(setting('free_leads'))+'"></div></div></div>';
  o+='<div class="card"><h2 style="margin-bottom:12px">Automatik</h2><label style="display:flex;gap:10px;font-weight:600"><input type="checkbox" name="auto_approve" style="width:auto"'+ck('auto_approve')+'> Firmen nach E-Mail-Bestätigung automatisch freigeben</label><p class="sm muted" style="margin:4px 0 14px 28px">Aus = Sie geben jede Firma manuell frei (empfohlen gegen Missbrauch der Gratis-Leads).</p><label style="display:flex;gap:10px;font-weight:600"><input type="checkbox" name="auto_publish" style="width:auto"'+ck('auto_publish')+'> Saubere Anfragen automatisch im Markt veröffentlichen</label><p class="sm muted" style="margin:4px 0 14px 28px">Anfragen mit Auffälligkeiten (Duplikat, kurze Beschreibung …) bleiben immer zur Prüfung.</p><label style="display:flex;gap:10px;font-weight:600"><input type="checkbox" name="notify_partners" style="width:auto"'+ck('notify_partners')+'> Passende Firmen per E-Mail über neue Leads informieren</label><hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><h2 style="margin-bottom:12px">Bankverbindung für Einzahlungen</h2><div class="f"><div><label>Empfänger</label><input name="bank_holder" value="'+h(setting('bank_holder'))+'"></div><div><label>Bank</label><input name="bank_name" value="'+h(setting('bank_name'))+'"></div><div class="full"><label>IBAN</label><input name="bank_iban" value="'+h(setting('bank_iban'))+'" placeholder="CH00 0000 0000 0000 0000 0"></div></div></div></div>';
  o+='<div class="card" style="margin-top:16px"><h2 style="margin-bottom:6px">Preise pro Branche (CHF)</h2><p class="sm muted" style="margin-top:0">Leer = Standardpreis. Beim Veröffentlichen eines Leads kann der Preis einzeln überschrieben werden.</p><div class="f" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">';
  BRANCHES.forEach((b,i)=>{o+='<div><label>'+h(b)+'</label><input name="pr'+i+'" value="'+h(pr[b]!==undefined?pr[b]:'')+'" placeholder="'+h(setting('default_price'))+'"></div>';});
  o+='</div></div>';
  const cur=stripe_links();
  o+='<div class="card" style="margin-top:16px"><h2 style="margin-bottom:6px">Stripe-Zahlungslinks (Guthaben aufladen)</h2><p class="sm muted" style="margin-top:0">Betrag = so wie im Stripe-Link festgelegt (nur Beschriftung des Buttons, gutgeschrieben wird der tatsächlich bezahlte Betrag). Automatische Gutschrift: Webhook-URL <b>'+h(base_url())+'/api/stripe.php</b> in Stripe hinterlegen (Ereignis <i>checkout.session.completed</i>) und das Geheimnis <i>whsec_…</i> als Umgebungsvariable STRIPE_WEBHOOK_SECRET (oder in config.local.json) auf dem Server eintragen. Status: '+(str(cfg('stripe_webhook_secret',''))!==''?'<span class="tag ok">Webhook-Geheimnis hinterlegt</span>':'<span class="tag warn">Webhook-Geheimnis fehlt – Gutschrift nur manuell</span>')+'</p><div class="f" style="grid-template-columns:140px 1fr">';
  for(let i=0;i<8;i++){const x=cur[i]||{amount:'',url:''};o+='<div><label>Betrag CHF</label><input name="sa'+i+'" value="'+h(x.amount||'')+'"></div><div><label>Link</label><input name="su'+i+'" value="'+h(x.url)+'" placeholder="https://buy.stripe.com/…"></div>';}
  o+='</div></div><div style="margin-top:16px"><button class="btn pri">Einstellungen speichern</button></div></form>';
  layout('Einstellungen',o,'a_settings');
}
module.exports={setting,set_setting,branch_prices,lead_price,lead_price_full,excl_price,sold_count,lead_max,wallet_balance,wallet_add,stripe_links,topup_ref,plz_match,branch_match,lead_matches,housekeeping,intake_check,publish_lead,can_buy,add_client_from_lead,buy_lead,refund_assignment,status_banner,lead_card,nl2br,mbsub,pages:{p_market:pg_p_market,p_leads:pg_p_leads,p_wallet:pg_p_wallet,a_claims:pg_a_claims,a_finance:pg_a_finance,a_settings:pg_a_settings}};
