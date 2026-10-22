'use strict';
// auftragdeal.ch – Dashboard (Node.js). Start: npm start   (Port aus Umgebungsvariable PORT, sonst 3000)
process.env.TZ=process.env.TZ||'Europe/Zurich';
const express=require('express');
const K=require('./lib/core');
const {h,q,one,val,int,str,now,time,cfg,randHex,go,flash,me,post,csrf_field,check_csrf,hashPw,emailok,safeEq,Halt,C,setCtx,regen}=K;
const U=require('./lib/ui');const {layout,head}=U;
const pub=require('./lib/pub'),admin=require('./lib/admin'),partner=require('./lib/partner'),customer=require('./lib/customer'),market=require('./lib/market'),api=require('./lib/api');

const PAGES=Object.assign({},pub.pages,admin.pages,partner.pages,customer.pages,market.pages);
const ROUTES=['home','login','logout','signup','setpw','account','a_dash','a_companies','a_company','a_leads','a_lead','a_users','a_log','a_export','register','forgot','verify','resend','a_claims','a_finance','a_settings','a_backup','p_dash','p_market','p_leads','p_wallet','p_clients','p_client','p_quotes','p_invoices','p_doc','p_docedit','p_profile','c_dash','c_new'];
const COOKIE='adsess',TTL=30*86400;

const app=express();
app.disable('x-powered-by');app.set('trust proxy',true);
app.use((req,res,next)=>{res.set({'X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'});next();});
app.get('/robots.txt',(req,res)=>res.type('text/plain').send('User-agent: *\nDisallow: /\n'));
app.get('/healthz',(req,res)=>res.type('text/plain').send('ok'));

// ---- Sitzungen (SQLite) ----
function parseCookies(req){const o={};for(const p of str(req.headers.cookie).split(';')){const i=p.indexOf('=');if(i>0)o[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim());}return o;}
function loadSession(req){const sid=parseCookies(req)[COOKIE];
  if(sid&&/^[a-f0-9]{48}$/.test(sid)){const r=one('SELECT data,ts FROM sessions WHERE id=?',[sid]);if(r&&r.ts>time()-TTL){try{return {sid,S:JSON.parse(r.data)||{}};}catch(e){}}}
  return {sid:null,S:{}};}
let lastGc=0;
function saveSession(ctx,res){
  const gc=()=>{if(time()-lastGc>3600){lastGc=time();q('DELETE FROM sessions WHERE ts<?',[time()-TTL]);}};
  const opts=['Path=/','HttpOnly','SameSite=Lax','Max-Age='+TTL];if(ctx.req.secure)opts.push('Secure');
  if(ctx.destroy){if(ctx.sid)q('DELETE FROM sessions WHERE id=?',[ctx.sid]);res.append('Set-Cookie',COOKIE+'=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');return;}
  const empty=!Object.keys(ctx.S).length;
  if(empty&&!ctx.sid)return;
  let sid=ctx.sid;
  if(ctx.regen||!sid){if(sid)q('DELETE FROM sessions WHERE id=?',[sid]);sid=randHex(24);}
  q('INSERT INTO sessions(id,data,ts) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,ts=excluded.ts',[sid,JSON.stringify(ctx.S),time()]);
  if(sid!==ctx.sid||ctx.regen)res.append('Set-Cookie',COOKIE+'='+sid+'; '+opts.join('; '));
  gc();
}

function run(req,res,fn){
  const ss=loadSession(req);
  const ctx={req,res,S:ss.S,sid:ss.sid,P:(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body))?req.body:{},G:req.query||{},method:req.method,ip:req.ip||'0',out:null,regen:false,destroy:false};
  setCtx(ctx);
  try{fn();}catch(e){
    if(!(e instanceof Halt)){console.error('Fehler:',e);ctx.out={status:500,body:'<!doctype html><meta charset="utf-8"><title>Fehler</title><p style="font:16px system-ui;padding:30px">Technischer Fehler. Bitte später erneut versuchen.</p>',type:'text/html; charset=UTF-8'};}
  }
  try{saveSession(ctx,res);}catch(e){console.error('Sitzung:',e);}
  const o=ctx.out||{status:500,body:'',type:'text/plain'};
  if(o.headers)res.set(o.headers);
  if(o.location){res.redirect(302,o.location);return;}
  res.status(o.status||200).type(o.type||'text/html; charset=UTF-8').send(o.body);
  setCtx(null);
}

const body=[express.urlencoded({extended:true,limit:'1mb',parameterLimit:2000})];

// ---- API ----
app.options('/api/:n.php',(req,res)=>run(req,res,api.cors));
app.post('/api/stripe.php',express.raw({type:()=>true,limit:'1mb'}),(req,res)=>run(req,res,api.stripe));
const jsonish=express.text({type:()=>true,limit:'200kb'});
app.all('/api/register.php',jsonish,(req,res)=>run(req,res,api.register));
app.all('/api/request.php',jsonish,(req,res)=>run(req,res,api.request));

// ---- Installation ----
function install(){
  if(val("SELECT COUNT(*) FROM users WHERE role='admin'")){layout('Installiert',pub.authbox('Bereits installiert','<p>Das Dashboard ist eingerichtet.</p>','<a href="index.php">Zur Anmeldung</a>'));return;}
  let err='';const r=C.r;
  if(r.method==='POST'){check_csrf();
    const code=str(cfg('setup_code',''));const e=post('email').toLowerCase();const pw=str(r.P.pass);
    if(!code||!safeEq(code,post('code')))err='Setup-Code stimmt nicht (siehe config.json oder Variable SETUP_CODE).';
    else if(!emailok(e)||pw.length<10)err='Gültige E-Mail und Passwort mit mind. 10 Zeichen angeben.';
    else{const id=K.ins('users',{email:e,pass:hashPw(pw),role:'admin',name:post('name')||'Admin',created:now(),verified:1});regen();r.S.uid=id;flash('Installation abgeschlossen. Das Dashboard ist bereit.');K.redirect('index.php?p=a_dash');}
  }
  layout('Installation',pub.authbox('Dashboard einrichten',(err?'<div class="flash err">'+h(err)+'</div>':'')+'<form method="post" class="f" style="grid-template-columns:1fr">'+csrf_field()+'<div><label>Setup-Code (aus config.json)</label><input name="code" required></div><div><label>Name</label><input name="name"></div><div><label>Admin E-Mail</label><input type="email" name="email" required></div><div><label>Passwort (mind. 10 Zeichen)</label><input type="password" name="pass" minlength="10" required autocomplete="new-password"></div><button class="btn pri">Einrichten</button></form>'));
}
app.all('/install.php',body,(req,res)=>run(req,res,install));

// ---- Dashboard ----
function dashboard(){
  const r=C.r;
  if(!val("SELECT COUNT(*) FROM users WHERE role='admin'"))K.redirect('install.php');
  let p=str(r.G.p||'home');if(!ROUTES.includes(p))p='home';
  if(r.method==='POST'&&p!=='login')check_csrf();
  const u=me();
  if(u&&u.role==='partner'&&u.co_status==='blocked'&&!['logout','account','home'].includes(p)){layout('Gesperrt',head('Konto gesperrt')+'<div class="card"><p>Ihre Firma ist gesperrt. Bitte kontaktieren Sie uns: '+h(cfg('notify'))+'</p></div>');return;}
  PAGES[p]();
}
app.all(['/','/index.php'],body,(req,res)=>run(req,res,dashboard));

app.use((req,res)=>res.status(404).type('text/plain').send('Nicht gefunden'));
app.use((err,req,res,next)=>{console.error(err.message);res.status(err.status||400).type('text/plain').send('Ungültige Anfrage');});

const port=parseInt(process.env.PORT||'3000',10);
try{K.db();}catch(e){console.error('Datenbank-Fehler:',e.message);process.exit(1);}
if(require.main===module)app.listen(port,'0.0.0.0',()=>console.log('auftragdeal Dashboard läuft auf Port '+port));
module.exports=app;
