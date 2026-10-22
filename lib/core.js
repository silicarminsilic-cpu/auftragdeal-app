'use strict';
// ===== Kern: Konfiguration, Datenbank, Sitzung, Hilfsfunktionen =====
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=path.join(__dirname,'..');

const BRANCHES=['Umzug','Reinigung','Maler & Gipser','Entsorgung','Gartenbau','Sanitär & Heizung','Elektro','Schreiner','Andere'];
const LEAD_STATUS={new:'Zu prüfen',open:'Im Markt',soldout:'Ausverkauft',expired:'Abgelaufen',closed:'Geschlossen',spam:'Spam'};
const CO_STATUS={pending:'Zu prüfen',active:'Aktiv',blocked:'Gesperrt'};
const DOC_STATUS={draft:'Entwurf',sent:'Versendet',accepted:'Angenommen',declined:'Abgelehnt',paid:'Bezahlt',open:'Offen',overdue:'Überfällig'};

// ---------- Konfiguration (config.json → config.local.json → Umgebungsvariablen) ----------
let _cfg=null;
function loadCfg(){
  const c={base_url:'',mail_from:'anfrage@auftragdeal.ch',notify:'anfrage@auftragdeal.ch',allowed_origins:[],free_leads:10,lead_price:29,vat:8.1,
    setup_code:'',stripe_webhook_secret:'',stripe_links:[],db_path:'',smtp_host:'mail.infomaniak.com',smtp_port:465,smtp_secure:true,smtp_user:'',smtp_pass:''};
  for(const f of ['config.json','config.local.json']){const p=path.join(ROOT,f);if(fs.existsSync(p)){try{Object.assign(c,JSON.parse(fs.readFileSync(p,'utf8')));}catch(e){console.error('Fehler in '+f+':',e.message);}}}
  const env=process.env;
  const map={BASE_URL:'base_url',MAIL_FROM:'mail_from',NOTIFY_EMAIL:'notify',SETUP_CODE:'setup_code',STRIPE_WEBHOOK_SECRET:'stripe_webhook_secret',DB_PATH:'db_path',SMTP_HOST:'smtp_host',SMTP_PORT:'smtp_port',SMTP_USER:'smtp_user',SMTP_PASS:'smtp_pass'};
  for(const k in map)if(env[k]!==undefined&&env[k]!=='')c[map[k]]=env[k];
  if(env.SMTP_SECURE!==undefined)c.smtp_secure=env.SMTP_SECURE!=='false';
  c.smtp_port=Number(c.smtp_port);
  return c;
}
function cfg(k,d){if(!_cfg)_cfg=loadCfg();const v=_cfg[k];return (v===undefined||v===null)?d:v;}

// ---------- Hilfsfunktionen ----------
const h=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const MONTHS=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const p2=n=>String(n).padStart(2,'0');
function date(fmt,ts){const d=ts instanceof Date?ts:new Date((ts===undefined?Date.now()/1000:ts)*1000);let o='';
  for(const c of fmt){switch(c){case 'Y':o+=d.getFullYear();break;case 'm':o+=p2(d.getMonth()+1);break;case 'd':o+=p2(d.getDate());break;case 'H':o+=p2(d.getHours());break;case 'i':o+=p2(d.getMinutes());break;case 's':o+=p2(d.getSeconds());break;case 'F':o+=MONTHS[d.getMonth()];break;default:o+=c;}}return o;}
const time=()=>Math.floor(Date.now()/1000);
function strtotime(s){if(!s)return 0;const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);if(!m)return 0;return Math.floor(new Date(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0)).getTime()/1000);}
const now=()=>date('Y-m-d H:i:s');
const inDays=n=>time()+Math.round(n*86400);
const chf=n=>{const v=(Math.round((Number(n)||0)*100)/100).toFixed(2);const [a,b]=v.split('.');const neg=a.startsWith('-');const x=a.replace('-','').replace(/\B(?=(\d{3})+(?!\d))/g,"'");return (neg?'-':'')+x+'.'+b;};
const dt=s=>s?date('d.m.Y',strtotime(s)):'';
const dtt=s=>s?date('d.m.Y H:i',strtotime(s)):'';
const int=x=>{const n=parseInt(x,10);return Number.isFinite(n)?n:0;};
const num=x=>{const n=parseFloat(String(x==null?'':x).replace(',','.'));return Number.isFinite(n)?n:0;};
const round2=n=>Math.round(n*100)/100;
const str=x=>x==null?'':String(x);
const ucTrim=x=>str(x).trim();
function emailok(e){return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(str(e))&&str(e).length<255;}
function jcsv(v){let a=v;if(!Array.isArray(a)){try{a=JSON.parse(str(v));}catch(e){a=[];}}if(!Array.isArray(a))a=[];return a.join(', ');}
function jparse(v,d){try{const j=JSON.parse(str(v));return j==null?d:j;}catch(e){return d;}}
const randHex=n=>crypto.randomBytes(n).toString('hex');
const sha256=s=>crypto.createHash('sha256').update(s).digest('hex');
function safeEq(a,b){a=Buffer.from(str(a));b=Buffer.from(str(b));return a.length===b.length&&crypto.timingSafeEqual(a,b);}
function qs(o){return Object.entries(o).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');}
const arr=v=>Array.isArray(v)?v:(v===undefined||v===null?[]:[v]);

// ---------- Datenbank (node:sqlite oder better-sqlite3) ----------
let DB=null;
function openDb(){
  let f=cfg('db_path');if(!f){const dir=path.join(ROOT,'data');fs.mkdirSync(dir,{recursive:true});f=path.join(dir,'app.sqlite');}else fs.mkdirSync(path.dirname(f),{recursive:true});
  let lastErr;
  try{if(process.env.DB_DRIVER==='better-sqlite3')throw new Error('better-sqlite3 erzwungen');const {DatabaseSync}=require('node:sqlite');DB=new DatabaseSync(f);}
  catch(e1){lastErr=e1;try{const B=require('better-sqlite3');DB=new B(f);}catch(e2){throw new Error('Weder node:sqlite (Node 22+) noch better-sqlite3 verfügbar. '+e1.message+' / '+e2.message);}}
  DB.exec('PRAGMA foreign_keys=ON');DB.exec('PRAGMA journal_mode=WAL');DB.exec('PRAGMA busy_timeout=5000');
  migrate();
}
function db(){if(!DB)openDb();return DB;}
const norm=p=>p.map(x=>x===undefined?null:(typeof x==='boolean'?(x?1:0):x));
function q(sql,p=[]){const st=db().prepare(sql);return st.run(...norm(p));}
function one(sql,p=[]){const r=db().prepare(sql).get(...norm(p));return r?Object.assign({},r):null;}
function all(sql,p=[]){return db().prepare(sql).all(...norm(p)).map(r=>Object.assign({},r));}
function val(sql,p=[]){const r=db().prepare(sql).get(...norm(p));if(!r)return null;const v=Object.values(r)[0];return typeof v==='bigint'?Number(v):v;}
function ins(t,d){const k=Object.keys(d);const r=q(`INSERT INTO ${t} (${k.join(',')}) VALUES (${k.map(()=>'?').join(',')})`,k.map(x=>d[x]));return Number(r.lastInsertRowid);}
function upd(t,id,d){const k=Object.keys(d);q(`UPDATE ${t} SET ${k.map(x=>x+'=?').join(',')} WHERE id=?`,[...k.map(x=>d[x]),id]);}
function exec(sql){db().exec(sql);}

function migrate(){
  db().exec(`
CREATE TABLE IF NOT EXISTS companies(id INTEGER PRIMARY KEY,name TEXT NOT NULL,contact TEXT,email TEXT,phone TEXT,uid TEXT,web TEXT,address TEXT,zip TEXT,city TEXT,services TEXT,cantons TEXT,radius TEXT,capacity TEXT,locations TEXT,lang TEXT DEFAULT 'de',status TEXT DEFAULT 'pending',free_leads INTEGER DEFAULT 0,notes TEXT,source TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,pass TEXT,role TEXT NOT NULL,name TEXT,phone TEXT,company_id INTEGER REFERENCES companies(id),active INTEGER DEFAULT 1,created TEXT,last_login TEXT);
CREATE TABLE IF NOT EXISTS tokens(id INTEGER PRIMARY KEY,hash TEXT UNIQUE,user_id INTEGER,kind TEXT,expires TEXT);
CREATE TABLE IF NOT EXISTS attempts(id INTEGER PRIMARY KEY,k TEXT,ts INTEGER);
CREATE TABLE IF NOT EXISTS leads(id INTEGER PRIMARY KEY,customer_id INTEGER,name TEXT,email TEXT,phone TEXT,branch TEXT,zip TEXT,city TEXT,description TEXT,when_ TEXT,budget TEXT,status TEXT DEFAULT 'new',source TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS assignments(id INTEGER PRIMARY KEY,lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,company_id INTEGER NOT NULL REFERENCES companies(id),status TEXT DEFAULT 'offered',price REAL DEFAULT 0,is_free INTEGER DEFAULT 0,created TEXT,decided TEXT,UNIQUE(lead_id,company_id));
CREATE TABLE IF NOT EXISTS clients(id INTEGER PRIMARY KEY,company_id INTEGER NOT NULL,name TEXT,email TEXT,phone TEXT,address TEXT,zip TEXT,city TEXT,notes TEXT,lead_id INTEGER,created TEXT);
CREATE TABLE IF NOT EXISTS docs(id INTEGER PRIMARY KEY,company_id INTEGER NOT NULL,client_id INTEGER,kind TEXT NOT NULL,number TEXT,date TEXT,due TEXT,status TEXT DEFAULT 'draft',items TEXT,vat REAL,net REAL,total REAL,note TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS log(id INTEGER PRIMARY KEY,ts TEXT,user_id INTEGER,msg TEXT);
CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY,v TEXT);
CREATE TABLE IF NOT EXISTS wallet(id INTEGER PRIMARY KEY,company_id INTEGER NOT NULL,amount REAL NOT NULL,type TEXT,ref TEXT,note TEXT,by_user INTEGER,created TEXT);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,data TEXT,ts INTEGER);
CREATE TABLE IF NOT EXISTS outbox(id INTEGER PRIMARY KEY,ts TEXT,to_addr TEXT,subject TEXT,body TEXT,sent INTEGER DEFAULT 0,error TEXT);
CREATE INDEX IF NOT EXISTS i_w ON wallet(company_id);
CREATE INDEX IF NOT EXISTS i_as ON assignments(company_id,status);CREATE INDEX IF NOT EXISTS i_cl ON clients(company_id);CREATE INDEX IF NOT EXISTS i_dc ON docs(company_id,kind);
`);
  const add=(t,c,d)=>{const cols=db().prepare(`PRAGMA table_info(${t})`).all().map(r=>r.name);if(!cols.includes(c))db().exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`);};
  [['users','verified','INTEGER DEFAULT 0'],['companies','plz_ranges','TEXT'],['companies','notify','INTEGER DEFAULT 1'],['companies','credit_limit','REAL DEFAULT 0'],['companies','approved_at','TEXT'],['companies','invited_at','TEXT'],
   ['leads','price','REAL'],['leads','max_buyers','INTEGER'],['leads','published','TEXT'],['leads','expires','TEXT'],['leads','flag','TEXT'],['leads','exclusive_sold','INTEGER DEFAULT 0'],
   ['assignments','kind',"TEXT DEFAULT 'market'"],['assignments','claim_status','TEXT'],['assignments','claim_reason','TEXT'],['assignments','claim_at','TEXT'],['assignments','claim_note','TEXT']].forEach(a=>add(...a));
}

// ---------- Anfrage-Kontext (synchron, pro Anfrage genau einer) ----------
const C={r:null}; // C.r = {req,res,S,P,G,method,out,sid,newSid}
class Halt extends Error{}
const R=()=>C.r;
const S=()=>C.r.S;
const P=()=>C.r.P;
const G=()=>C.r.G;
function setCtx(r){C.r=r;}
function exit(body,status){C.r.out={status:status||C.r.out&&C.r.out.status||200,body:String(body==null?'':body),type:'text/plain; charset=UTF-8'};throw new Halt();}
function sendHtml(html,status){C.r.out={status:status||200,body:html,type:'text/html; charset=UTF-8'};}
function sendRaw(body,type,headers){C.r.out={status:200,body,type,headers:headers||{}};}
function redirect(url){C.r.out={status:302,location:url,body:''};throw new Halt();}
function go(p,qq={}){redirect('index.php?'+qs(Object.assign({p},qq)));}
function regen(){C.r.regen=true;}
function destroy(){C.r.S={};C.r.destroy=true;}
function ip(){return (C.r&&C.r.ip)||'0';}

function logit(m){try{ins('log',{ts:now(),user_id:(C.r&&C.r.S&&C.r.S.uid)||null,msg:m});}catch(e){}}

// Benutzer der Sitzung
function me(){
  const s=S();if(!s.uid)return null;
  if(C.r._me&&C.r._me.id===s.uid)return C.r._me;
  const u=one('SELECT u.*,c.name AS company,c.status AS co_status,c.free_leads FROM users u LEFT JOIN companies c ON c.id=u.company_id WHERE u.id=? AND u.active=1',[s.uid]);
  if(!u){delete s.uid;C.r._me=null;return null;}
  C.r._me=u;return u;
}
function csrf(){const s=S();if(!s.csrf)s.csrf=randHex(24);return s.csrf;}
const csrf_field=()=>`<input type="hidden" name="_c" value="${h(csrf())}">`;
function check_csrf(){const r=C.r;if(r.method==='POST'&&!safeEq(r.S.csrf||'',str(r.P._c)))exit('Ungültige Anfrage (CSRF). Bitte Seite neu laden.',400);}
function flash(m,t='ok'){const s=S();(s.fl=s.fl||[]).push([t,m]);}
function flashGet(){const s=S();const f=s.fl||[];delete s.fl;return f;}
function post(k,d=''){const v=C.r.P[k];return str(v===undefined||Array.isArray(v)||typeof v==='object'?d:v).trim();}
function postArr(k){return arr(C.r.P[k]).map(str);}
function need(...roles){const u=me();if(!u)go('login');if(roles.length&&!roles.includes(u.role))exit('Kein Zugriff.',403);return u;}
const roles_home=r=>({admin:'a_dash',partner:'p_dash',customer:'c_dash'}[r]||'login');

// ---------- Drosselung, Tokens ----------
function throttle(k,max,sec){q('DELETE FROM attempts WHERE ts<?',[time()-86400]);return int(val('SELECT COUNT(*) FROM attempts WHERE k=? AND ts>?',[k,time()-sec]))>=max;}
function hit(k){ins('attempts',{k,ts:time()});}
function make_token(uid,kind,hours=168){const t=randHex(24);q('DELETE FROM tokens WHERE user_id=? AND kind=?',[uid,kind]);ins('tokens',{hash:sha256(t),user_id:uid,kind,expires:date('Y-m-d H:i:s',time()+hours*3600)});return t;}
function find_token(t,kind){return one('SELECT * FROM tokens WHERE hash=? AND kind=? AND expires>?',[sha256(str(t)),kind,now()]);}

// ---------- Passwörter (scrypt) ----------
function hashPw(pw){const salt=crypto.randomBytes(16);const k=crypto.scryptSync(pw,salt,64,{N:16384,r:8,p:1});return 'scrypt$'+salt.toString('hex')+'$'+k.toString('hex');}
function verifyPw(pw,hash){if(!hash||!String(hash).startsWith('scrypt$'))return false;const [,s,k]=String(hash).split('$');try{const d=crypto.scryptSync(String(pw),Buffer.from(s,'hex'),64,{N:16384,r:8,p:1});return crypto.timingSafeEqual(d,Buffer.from(k,'hex'));}catch(e){return false;}}

// ---------- Mail (SMTP, Fallback: Postausgang in der Datenbank) ----------
let _tr=null;
function transport(){
  if(_tr!==null)return _tr||null;
  if(!cfg('smtp_user')||!cfg('smtp_pass')){_tr=false;return null;}
  try{const nm=require('nodemailer');_tr=nm.createTransport({host:cfg('smtp_host'),port:cfg('smtp_port'),secure:!!cfg('smtp_secure'),auth:{user:cfg('smtp_user'),pass:cfg('smtp_pass')}});}catch(e){console.error('nodemailer:',e.message);_tr=false;}
  return _tr||null;
}
function mail_ready(){return !!transport();}
function send_mail(to,subj,body){
  if(!emailok(to))return false;
  let id=0;try{id=ins('outbox',{ts:now(),to_addr:to,subject:subj,body,sent:0});}catch(e){}
  const tr=transport();
  if(!tr){return false;}
  const from=cfg('mail_from');
  tr.sendMail({from:`auftragdeal.ch <${from}>`,to,replyTo:from,subject:subj,text:body}).then(()=>{try{q('UPDATE outbox SET sent=1 WHERE id=?',[id]);}catch(e){}}).catch(e=>{console.error('Mail-Fehler an',to,e.message);try{q('UPDATE outbox SET error=? WHERE id=?',[String(e.message).slice(0,300),id]);}catch(x){}});
  return true;
}

// ---------- Dokumente ----------
function calc_doc(items,vat){let net=0;const clean=[];for(const i of items){const d=str(i.d).trim();const qn=num(i.q),pr=num(i.p);if(d===''&&!qn&&!pr)continue;clean.push({d,q:qn,p:pr});net+=qn*pr;}net=round2(net);return [clean,net,round2(net*(1+vat/100))];}
function next_number(co,kind){const y=date('Y');const pre=(kind==='quote'?'O':'R')+`-${y}-`;const n=int(val('SELECT COUNT(*) FROM docs WHERE company_id=? AND kind=? AND number LIKE ?',[co,kind,pre+'%']))+1;return pre+String(n).padStart(3,'0');}

function base_url(){
  const b=cfg('base_url');if(b)return String(b).replace(/\/+$/,'');
  const r=C.r&&C.r.req;if(!r)return 'http://localhost:3000';
  return (r.protocol||'http')+'://'+(r.get('host')||'localhost');
}

module.exports={ROOT,BRANCHES,LEAD_STATUS,CO_STATUS,DOC_STATUS,cfg,h,date,time,strtotime,now,inDays,chf,dt,dtt,int,num,round2,str,emailok,jcsv,jparse,randHex,sha256,safeEq,qs,arr,
  db,q,one,all,val,ins,upd,exec,C,Halt,R,S,P,G,setCtx,exit,sendHtml,sendRaw,redirect,go,regen,destroy,ip,logit,me,csrf,csrf_field,check_csrf,flash,flashGet,post,postArr,need,roles_home,
  throttle,hit,make_token,find_token,hashPw,verifyPw,send_mail,mail_ready,calc_doc,next_number,base_url};
