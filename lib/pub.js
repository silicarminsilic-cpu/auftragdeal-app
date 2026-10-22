'use strict';
const K=require('./core');
const {h,q,one,all,val,ins,upd,int,str,now,cfg,emailok,go,flash,flashGet,me,post,postArr,need,check_csrf,csrf_field,throttle,hit,make_token,find_token,hashPw,verifyPw,send_mail,base_url,logit,roles_home,regen,destroy,ip,R,redirect,BRANCHES,arr}=K;
const {layout,head,post_btn}=require('./ui');
const M=require('./market');const {setting}=M;
const flashHtml=()=>flashGet().map(f=>'<div class="flash '+(f[0]==='ok'?'ok':'err')+'">'+h(f[1])+'</div>').join('');
function authbox(title,inner,foot=''){
  return '<div class="auth"><div class="card"><a class="logo" href="index.php" style="text-decoration:none">auftrag<span style="color:var(--blue)">deal</span>.ch</a><h2 style="margin-bottom:14px">'+h(title)+'</h2>'+flashHtml()+inner+(foot?'<p class="sm muted" style="margin:16px 0 0">'+foot+'</p>':'')+'<p class="sm muted" style="margin:18px 0 0;padding-top:12px;border-top:1px solid var(--line);font-size:12px">Dritivo AG · Churerstrasse 160b · 8808 Pfäffikon SZ · CHE-332.319.246</p></div></div>';}
const rawP=k=>{const v=R().P[k];return v===undefined||typeof v==='object'?'':String(v);};

function pg_login(){
  if(me())go(roles_home(me().role));
  if(R().method==='POST'){check_csrf();const e=post('email').toLowerCase(),k='login:'+ip();
    if(throttle(k,8,600))flash('Zu viele Versuche. Bitte in 10 Minuten erneut versuchen.','err');
    else{const u=one('SELECT * FROM users WHERE email=? AND active=1',[e]);
      if(u&&u.pass&&verifyPw(rawP('pass'),u.pass)){regen();R().S.uid=int(u.id);q('UPDATE users SET last_login=? WHERE id=?',[now(),u.id]);go(roles_home(u.role));}
      hit(k);flash('E-Mail oder Passwort stimmt nicht.','err');}
    go('login');}
  layout('Anmelden',authbox('Anmelden','<form method="post" class="f" style="grid-template-columns:1fr">'+csrf_field()+'<div><label>E-Mail</label><input type="email" name="email" required autofocus autocomplete="username"></div><div><label>Passwort</label><input type="password" name="pass" required autocomplete="current-password"></div><button class="btn pri">Anmelden</button></form>','<a href="index.php?p=forgot">Passwort vergessen?</a><br><br><b>Neu hier?</b><br>Unternehmen: <a href="index.php?p=register">Partner-Konto erstellen (kostenlos)</a><br>Auftraggeber: <a href="index.php?p=signup">Anfragen stellen</a>'));
}
function pg_logout(){destroy();redirect('index.php?p=login');}

function pg_signup(){
  if(R().method==='POST'){check_csrf();const e=post('email').toLowerCase(),n=post('name'),pw=rawP('pass');
    if(post('hp')!=='')go('login');
    if(throttle('signup:'+ip(),6,3600)){flash('Zu viele Registrierungen. Bitte später erneut versuchen.','err');go('signup');}
    hit('signup:'+ip());
    if(!n||!emailok(e)||pw.length<8){flash('Bitte Name, gültige E-Mail und ein Passwort mit mind. 8 Zeichen angeben.','err');go('signup');}
    if(one('SELECT id FROM users WHERE email=?',[e])){flash('Diese E-Mail ist bereits registriert.','err');go('signup');}
    const id=ins('users',{email:e,pass:hashPw(pw),role:'customer',name:n,phone:post('phone'),created:now()});
    regen();R().S.uid=id;flash('Willkommen! Sie können jetzt Ihre erste Anfrage erfassen.');go('c_new');}
  layout('Registrieren',authbox('Konto für Auftraggeber','<form method="post" class="f" style="grid-template-columns:1fr">'+csrf_field()+'<div style="position:absolute;left:-9999px"><input name="hp" tabindex="-1" autocomplete="off"></div><div><label>Name</label><input name="name" required></div><div><label>E-Mail</label><input type="email" name="email" required></div><div><label>Telefon (optional)</label><input name="phone"></div><div><label>Passwort (mind. 8 Zeichen)</label><input type="password" name="pass" minlength="8" required autocomplete="new-password"></div><button class="btn pri">Konto erstellen</button></form>','<a href="index.php?p=login">Zurück zur Anmeldung</a>'));
}

function pg_setpw(){
  const t=str(R().G.t),tk=find_token(t,'setpw');
  if(!tk){layout('Link ungültig',authbox('Link ungültig oder abgelaufen','<p>Bitte fordern Sie bei uns einen neuen Link an: <a href="mailto:'+h(cfg('notify'))+'">'+h(cfg('notify'))+'</a></p>','<a href="index.php?p=login">Zur Anmeldung</a>'));return;}
  const u=one('SELECT * FROM users WHERE id=?',[tk.user_id]);
  if(R().method==='POST'){check_csrf();const pw=rawP('pass');
    if(pw.length<8||pw!==rawP('pass2')){flash('Passwörter müssen übereinstimmen und mind. 8 Zeichen haben.','err');go('setpw',{t});}
    q('UPDATE users SET pass=?,active=1,verified=1 WHERE id=?',[hashPw(pw),u.id]);q('DELETE FROM tokens WHERE user_id=? AND kind=?',[u.id,'setpw']);
    regen();R().S.uid=int(u.id);flash('Passwort gespeichert. Willkommen!');go(roles_home(u.role));}
  layout('Passwort setzen',authbox('Passwort festlegen','<p class="muted sm">Konto: '+h(u.email)+'</p><form method="post" class="f" style="grid-template-columns:1fr">'+csrf_field()+'<div><label>Neues Passwort</label><input type="password" name="pass" minlength="8" required autocomplete="new-password"></div><div><label>Wiederholen</label><input type="password" name="pass2" minlength="8" required autocomplete="new-password"></div><button class="btn pri">Speichern &amp; anmelden</button></form>'));
}

function pg_account(){
  const u=need();
  if(R().method==='POST'){check_csrf();
    if(post('act')==='pw'){const row=one('SELECT pass FROM users WHERE id=?',[u.id]);const n=rawP('new');
      if(!verifyPw(rawP('old'),row.pass)||n.length<8)flash('Aktuelles Passwort falsch oder neues Passwort zu kurz (mind. 8).','err');
      else{q('UPDATE users SET pass=? WHERE id=?',[hashPw(n),u.id]);flash('Passwort geändert.');}}
    else{upd('users',int(u.id),{name:post('name'),phone:post('phone')});flash('Gespeichert.');}
    go('account');}
  layout('Mein Konto',head('Mein Konto',u.email)+'<div class="grid2"><div class="card"><h2 style="margin-bottom:12px">Profil</h2><form method="post" class="f">'+csrf_field()+'<div><label>Name</label><input name="name" value="'+h(u.name)+'"></div><div><label>Telefon</label><input name="phone" value="'+h(u.phone)+'"></div><div class="full"><button class="btn">Speichern</button></div></form></div><div class="card"><h2 style="margin-bottom:12px">Passwort ändern</h2><form method="post" class="f">'+csrf_field()+'<input type="hidden" name="act" value="pw"><div class="full"><label>Aktuelles Passwort</label><input type="password" name="old" required autocomplete="current-password"></div><div class="full"><label>Neues Passwort</label><input type="password" name="new" minlength="8" required autocomplete="new-password"></div><div class="full"><button class="btn">Ändern</button></div></form></div></div>','account');
}
function pg_home(){const u=me();if(!u)go('login');go(roles_home(u.role));}

const svc_boxes_pub=()=>BRANCHES.map(b=>'<label style="display:flex;gap:6px;align-items:center;font-weight:600;margin:0 14px 6px 0"><input type="checkbox" name="svc[]" value="'+h(b)+'" style="width:auto">'+h(b)+'</label>').join('');
function verify_mail(user,firm){const t=make_token(int(user.id),'verify',72);
  send_mail(str(user.email),'Bitte bestätigen Sie Ihre E-Mail – auftragdeal.ch','Guten Tag '+user.name+'\n\nWillkommen bei auftragdeal.ch! Bitte bestätigen Sie Ihre E-Mail-Adresse für '+firm+':\n\n'+base_url()+'/index.php?p=verify&t='+t+'\n\nDanach prüfen wir Ihr Profil. Mit der Freigabe erhalten Sie '+setting('free_leads')+' Gratis-Leads und können im Lead-Markt einkaufen.\n\nauftragdeal.ch');}

function pg_register(){
  if(me())go(roles_home(me().role));
  const r0=R();
  if(r0.method==='POST'){check_csrf();
    if(post('hp')!=='')go('login');
    const firm=post('firm'),name=post('name'),mail=post('mail').toLowerCase(),pw=rawP('pass');
    const keep=()=>{const c=Object.assign({},r0.P);delete c.pass;delete c._c;r0.S.reg=c;};
    if(throttle('reg:'+ip(),6,3600)){flash('Zu viele Registrierungen. Bitte später erneut versuchen.','err');go('register');}
    if(firm===''||name===''||!emailok(mail)||pw.length<8||r0.P.agb===undefined){keep();flash('Bitte Firma, Ansprechperson, gültige E-Mail, Passwort (mind. 8 Zeichen) angeben und die Bedingungen akzeptieren.','err');go('register');}
    if(one('SELECT id FROM users WHERE email=?',[mail])){flash('Diese E-Mail ist bereits registriert. Bitte melden Sie sich an.','err');go('login');}
    hit('reg:'+ip());
    const svc=JSON.stringify(BRANCHES.filter(b=>arr(r0.P['svc[]']!==undefined?r0.P['svc[]']:r0.P.svc).map(str).includes(b)));
    const row={name:firm,contact:name,email:mail,phone:post('tel'),uid:post('uid'),web:post('web'),plz_ranges:post('plz_ranges'),lang:'de'};
    const ex=one("SELECT c.id,c.services FROM companies c WHERE lower(c.email)=? AND NOT EXISTS(SELECT 1 FROM users u WHERE u.company_id=c.id)",[mail]);
    let cid;
    if(ex){row.services=(svc!=='[]')?svc:ex.services;upd('companies',int(ex.id),row);cid=int(ex.id);}
    else cid=ins('companies',Object.assign({},row,{services:svc,status:'pending',free_leads:0,source:'portal',created:now()}));
    const uid=ins('users',{email:mail,pass:hashPw(pw),role:'partner',name,phone:post('tel'),company_id:cid,verified:0,created:now()});
    verify_mail({id:uid,email:mail,name},firm);
    send_mail(cfg('notify'),'Neue Firma im Portal: '+firm,firm+' hat sich im Portal registriert ('+name+', '+mail+').\n\nPrüfen & freigeben:\n'+base_url()+'/index.php?p=a_company&id='+cid);
    delete r0.S.reg;regen();r0.S.uid=uid;logit('Firma registriert: '+firm);
    flash('Willkommen! Wir haben Ihnen eine Bestätigungs-Mail gesendet. Vervollständigen Sie inzwischen Ihr Profil.');go('p_profile');}
  const r=r0.S.reg||{};const v=k=>h(str(r[k]!==undefined?r[k]:(r0.G[k]!==undefined?r0.G[k]:'')));
  const inner='<form method="post" class="f">'+csrf_field()+'<div style="position:absolute;left:-9999px"><input name="hp" tabindex="-1" autocomplete="off"></div><div class="full"><label>Firma</label><input name="firm" value="'+v('firm')+'" required></div><div><label>Ansprechperson</label><input name="name" value="'+v('name')+'" required></div><div><label>Telefon</label><input name="tel" value="'+v('tel')+'"></div><div><label>E-Mail</label><input type="email" name="mail" value="'+v('mail')+'" required autocomplete="username"></div><div><label>Passwort (mind. 8 Zeichen)</label><input type="password" name="pass" minlength="8" required autocomplete="new-password"></div><div><label>UID (optional)</label><input name="uid" value="'+v('uid')+'" placeholder="CHE-123.456.789"></div><div><label>Website (optional)</label><input name="web" value="'+v('web')+'"></div><div class="full"><label>Ihre Branchen</label><div class="row">'+svc_boxes_pub()+'</div></div><div class="full"><label>Einsatzgebiet: PLZ-Bereiche (optional)</label><input name="plz_ranges" value="'+v('plz_ranges')+'" placeholder="z.B. 8000-8999, 6300-6499 – leer = ganze Schweiz"></div><div class="full"><label style="display:flex;gap:10px;align-items:flex-start;font-weight:500"><input type="checkbox" name="agb" style="width:auto;margin-top:4px" required> <span>Ich akzeptiere die <a href="https://auftragdeal.ch/" target="_blank" rel="noopener">AGB, Partnerbedingungen und die Datenschutzerklärung</a> von auftragdeal.ch.</span></label></div><div class="full"><button class="btn pri" style="width:100%;justify-content:center">Kostenlos registrieren</button></div></form>';
  layout('Partner-Konto erstellen','<div class="auth"><div class="card" style="max-width:620px;padding:28px"><a class="logo" href="index.php" style="text-decoration:none;color:var(--navy)">auftrag<span style="color:var(--blue)">deal</span>.ch</a><h2 style="margin-bottom:4px">Partner-Konto erstellen</h2><p class="muted sm" style="margin:0 0 16px">Kostenlos: Lead-Markt, CRM, Offerten &amp; Rechnungen. Die ersten '+h(setting('free_leads'))+' Leads schenken wir Ihnen.</p>'+flashHtml()+inner+'<p class="sm muted" style="margin:16px 0 0">Schon registriert? <a href="index.php?p=login">Anmelden</a></p></div></div>');
}

function pg_verify(){
  const t=str(R().G.t),tk=find_token(t,'verify');
  if(!tk){flash('Der Bestätigungs-Link ist ungültig oder abgelaufen. Melden Sie sich an und lassen Sie die Mail erneut senden.','err');go(me()?'home':'login');}
  const uid=int(tk.user_id);q('UPDATE users SET verified=1 WHERE id=?',[uid]);q('DELETE FROM tokens WHERE user_id=? AND kind=?',[uid,'verify']);
  const u=one('SELECT * FROM users WHERE id=?',[uid]);
  if(u&&u.company_id&&setting('auto_approve')==='1'){const c=one('SELECT * FROM companies WHERE id=?',[u.company_id]);if(c&&c.status==='pending'){upd('companies',int(c.id),{status:'active',free_leads:int(setting('free_leads')),approved_at:now()});logit('Firma automatisch freigegeben: '+c.name);}}
  flash('E-Mail bestätigt. Vielen Dank!');go(me()?'home':'login');
}
function pg_resend(){
  const u=need('partner');if(R().method!=='POST')go('home');
  if(!throttle('resend:'+u.id,3,3600)){hit('resend:'+u.id);verify_mail(u,str(u.company));flash('Bestätigungs-Mail wurde erneut gesendet.');}else flash('Bitte warten Sie, bevor Sie erneut senden.','err');
  go('home');
}
function pg_forgot(){
  if(R().method==='POST'){check_csrf();const e=post('email').toLowerCase(),k='forgot:'+ip();
    if(!throttle(k,5,3600)){hit(k);const u=one('SELECT * FROM users WHERE email=? AND active=1',[e]);
      if(u){const t=make_token(int(u.id),'setpw',2);send_mail(e,'Passwort zurücksetzen – auftragdeal.ch','Guten Tag\n\nSie haben ein neues Passwort angefordert. Link (2 Stunden gültig):\n\n'+base_url()+'/index.php?p=setpw&t='+t+'\n\nFalls Sie das nicht waren, ignorieren Sie diese Mail.\nauftragdeal.ch');}}
    flash('Falls ein Konto mit dieser E-Mail existiert, haben wir einen Link gesendet.');go('forgot');}
  layout('Passwort vergessen',authbox('Passwort vergessen','<form method="post" class="f" style="grid-template-columns:1fr">'+csrf_field()+'<div><label>E-Mail</label><input type="email" name="email" required autofocus></div><button class="btn pri">Link senden</button></form>','<a href="index.php?p=login">Zurück zur Anmeldung</a>'));
}
module.exports={verify_mail,svc_boxes_pub,authbox,pages:{login:pg_login,logout:pg_logout,signup:pg_signup,setpw:pg_setpw,account:pg_account,home:pg_home,register:pg_register,verify:pg_verify,resend:pg_resend,forgot:pg_forgot}};
