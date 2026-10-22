'use strict';
const K=require('./core');
const crypto=require('crypto');
const {q,one,ins,upd,str,int,now,chf,cfg,emailok,send_mail,base_url,throttle,hit,ip,C,Halt,jparse,arr}=K;
const M=require('./market');const {intake_check,wallet_add}=M;

function jout(d,code=200){C.r.out={status:code,body:JSON.stringify(d),type:'application/json; charset=UTF-8'};throw new Halt();}
function cors(){
  const r=C.r,o=r.req.get('origin')||'';const ok=cfg('allowed_origins',[]);
  if(o&&ok.includes(o)){r.res.set('Access-Control-Allow-Origin',o);r.res.set('Vary','Origin');}
  r.res.set('Access-Control-Allow-Methods','POST, OPTIONS');r.res.set('Access-Control-Allow-Headers','Content-Type');r.res.set('Access-Control-Max-Age','600');
  if(r.method==='OPTIONS'){r.out={status:204,body:'',type:'text/plain'};throw new Halt();}
}
function jin(){const b=C.r.req.body;if(Buffer.isBuffer(b))return jparse(b.toString('utf8'),{})||{};if(typeof b==='string')return jparse(b,{})||{};return (b&&typeof b==='object')?b:{};}
const cl=(v,n=300)=>Array.from(str(v).trim()).slice(0,n).join('');
const clArr=v=>JSON.stringify(arr(v).slice(0,60).map(x=>cl(x,80)));

const MAILS={
 de:(n,firm,link)=>["Ihre Registrierung bei auftragdeal.ch",`Guten Tag ${n}\n\nvielen Dank, wir haben Ihre Registrierung für ${firm} erhalten und melden uns in der Regel innert 1 bis 2 Werktagen.\n\nErstellen Sie jetzt Ihren kostenlosen Portal-Zugang (Lead-Markt, CRM, Offerten, Rechnungen). Bitte verwenden Sie dieselbe E-Mail-Adresse:\n${link}\n\nFreundliche Grüsse\nauftragdeal.ch · Dritivo AG`],
 fr:(n,firm,link)=>["Votre inscription chez auftragdeal.ch",`Bonjour ${n}\n\nmerci, nous avons bien reçu votre inscription pour ${firm} et vous répondons en général sous 1 à 2 jours ouvrables.\n\nCréez dès maintenant votre accès gratuit au portail (marché de leads, CRM, devis, factures). Veuillez utiliser la même adresse e-mail :\n${link}\n\nCordialement\nauftragdeal.ch · Dritivo AG`],
 it:(n,firm,link)=>["La sua registrazione su auftragdeal.ch",`Buongiorno ${n}\n\ngrazie, abbiamo ricevuto la registrazione di ${firm} e la ricontatteremo di norma entro 1-2 giorni lavorativi.\n\nCrei subito il suo accesso gratuito al portale (mercato dei lead, CRM, offerte, fatture). Usi lo stesso indirizzo e-mail:\n${link}\n\nCordiali saluti\nauftragdeal.ch · Dritivo AG`]};

function register(){
  cors();const r=C.r;if(r.method!=='POST')jout({ok:false},405);
  const d=jin();if(d.hp)jout({ok:true});
  const k='api_reg:'+ip();if(throttle(k,10,3600))jout({ok:false,error:'rate'},429);hit(k);
  const firm=cl(d.firm),mail=cl(d.mail).toLowerCase();
  if(firm===''||!emailok(mail))jout({ok:false,error:'invalid'},422);
  const ex=one("SELECT id FROM companies WHERE lower(email)=? AND status='pending'",[mail]);
  const row={name:firm,contact:cl(d.name),email:mail,phone:cl(d.tel,40),uid:cl(d.uid,40),web:cl(d.web),services:clArr(d.svcs),cantons:clArr(d.cantons),radius:cl(d.radius,10),capacity:cl(d.cap,40),locations:clArr(d.locs),lang:['de','fr','it'].includes(d.lang)?d.lang:'de',source:'website'};
  let id;if(ex){upd('companies',int(ex.id),row);id=int(ex.id);}else id=ins('companies',Object.assign({},row,{status:'pending',free_leads:0,created:now()}));
  send_mail(cfg('notify'),'Neue Registrierung (Dashboard): '+firm,'Neue Firma registriert: '+firm+'\nKontakt: '+row.contact+' · '+mail+'\n\nPrüfen & freigeben:\n'+base_url()+'/index.php?p=a_company&id='+id);
  // Bestätigungs-Mail an die Firma mit Link zur Portal-Registrierung (max. 1x pro Tag und Adresse)
  if(!throttle('regmail:'+mail,1,86400)){hit('regmail:'+mail);
    const link=base_url()+'/index.php?p=register&mail='+encodeURIComponent(mail)+'&firm='+encodeURIComponent(firm)+'&name='+encodeURIComponent(row.contact);
    const T=(MAILS[row.lang]||MAILS.de)(row.contact,firm,link);send_mail(mail,T[0],T[1]);}
  jout({ok:true});
}
function request(){
  cors();const r=C.r;if(r.method!=='POST')jout({ok:false},405);
  const d=jin();if(d.hp)jout({ok:true});
  const k='api_req:'+ip();if(throttle(k,10,3600))jout({ok:false,error:'rate'},429);hit(k);
  const name=cl(d.name),mail=cl(d.mail).toLowerCase(),br=cl(d.branch,60);
  if(name===''||!emailok(mail)||br===''||cl(d.description)==='')jout({ok:false,error:'invalid'},422);
  const id=ins('leads',{name,email:mail,phone:cl(d.tel,40),branch:br,zip:cl(d.zip,10),city:cl(d.city,80),description:cl(d.description,3000),when_:cl(d.when,80),budget:cl(d.budget,80),status:'new',source:'website',created:now()});
  intake_check(id);
  send_mail(cfg('notify'),`Neue Anfrage #${id}: ${br}`,name+' · '+mail+'\n'+br+' '+cl(d.zip,10)+' '+cl(d.city,80)+'\n\n'+cl(d.description,3000)+'\n\n'+base_url()+'/index.php?p=a_lead&id='+id);
  jout({ok:true});
}
function plain(code,body){C.r.out={status:code,body:body||'',type:'text/plain; charset=UTF-8'};throw new Halt();}
function stripe(){
  const r=C.r;if(r.method!=='POST')plain(405);
  const secret=str(cfg('stripe_webhook_secret',''));if(secret==='')plain(503,'webhook not configured');
  const raw=Buffer.isBuffer(r.req.body)?r.req.body:Buffer.from(typeof r.req.body==='string'?r.req.body:JSON.stringify(r.req.body||{}));
  const sig=str(r.req.get('stripe-signature'));
  let t=null;const v1=[];for(const p of sig.split(',')){const i=p.trim().indexOf('=');const kk=i<0?p.trim():p.trim().slice(0,i),v=i<0?'':p.trim().slice(i+1);if(kk==='t')t=int(v);if(kk==='v1')v1.push(v);}
  if(!t||Math.abs(K.time()-t)>600)plain(400,'timestamp');
  const exp=crypto.createHmac('sha256',secret).update(t+'.'+raw.toString('utf8')).digest('hex');
  if(!v1.some(x=>K.safeEq(exp,x)))plain(400,'signature');
  const ev=jparse(raw.toString('utf8'),null);if(!ev||typeof ev!=='object')plain(400);
  const type=str(ev.type),o=(ev.data&&ev.data.object)||{};
  if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(type)&&o.payment_status==='paid'){
    const sid=str(o.id),ref=str(o.client_reference_id),cur=str(o.currency).toLowerCase(),amt=int(o.amount_total)/100;
    const m=ref.match(/^AD-(\d{1,8})$/);
    if(sid!==''&&cur==='chf'&&amt>0&&m){
      const cid=int(m[1]);const co=one('SELECT * FROM companies WHERE id=?',[cid]);
      if(co&&!one("SELECT id FROM wallet WHERE type='topup' AND ref=?",[sid])){
        wallet_add(cid,amt,'topup',sid,'Stripe-Zahlung');
        send_mail(cfg('notify'),'Stripe-Aufladung: '+co.name+' CHF '+chf(amt),'Automatisch gutgeschrieben: CHF '+chf(amt)+' für '+co.name+' ('+ref+').\nStripe-Sitzung: '+sid);
      }else if(!co)send_mail(cfg('notify'),'Stripe-Zahlung nicht zuordenbar','Zahlung CHF '+chf(amt)+' mit Referenz '+ref+' – Firma nicht gefunden. Sitzung: '+sid);
    }else if(sid!=='')send_mail(cfg('notify'),'Stripe-Zahlung ohne gültige Referenz','Zahlung ('+(o.amount_total||0)+' '+cur+') ohne Firmenreferenz. Bitte manuell zuordnen. Sitzung: '+sid);
  }
  plain(200,'ok');
}
module.exports={register,request,stripe,cors};
