'use strict';
const K=require('./core');const {h,val,int,date,time,me,flashGet,csrf_field,qs,sendHtml}=K;
const CSS=`:root{--navy:#1B1D22;--blue:#D9440F;--blue-d:#B3350A;--sky:#FCE9E0;--bg:#F5F3EE;--line:#E3DFD6;--muted:#6B665C;--green:#15935A;--green-bg:#E6F6EE;--red:#C0392B;--red-bg:#FBE9E7;--amber:#B7791F;--amber-bg:#FDF3DC;--card:#fff;--r:12px}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font:15px/1.5 'Plus Jakarta Sans',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--navy)}
a{color:var(--blue-d)}h1,h2,h3{line-height:1.2;margin:0}h1{font-size:24px}h2{font-size:18px}h3{font-size:15px}
.app{display:grid;grid-template-columns:240px 1fr;min-height:100vh}
.side{background:var(--navy);color:#fff;padding:20px 14px;display:flex;flex-direction:column;gap:6px;position:sticky;top:0;height:100vh;overflow:auto}
.logo{font-weight:800;font-size:19px;padding:4px 10px 18px;letter-spacing:-.01em;color:#fff;text-decoration:none}.logo span{color:#FF7A3D}
.side a.nv{display:flex;align-items:center;gap:10px;color:#D8D5CE;text-decoration:none;padding:10px 12px;border-radius:9px;font-weight:600;font-size:14px}
.side a.nv:hover{background:rgba(255,255,255,.07);color:#fff}.side a.nv.on{background:var(--blue);color:#fff}
.side .grow{flex:1}.side .who{font-size:12px;color:#A9A59C;padding:8px 12px;border-top:1px solid rgba(255,255,255,.12);margin-top:8px;word-break:break-word}
.side .badge{margin-left:auto;background:#FF7A3D;color:#fff;border-radius:99px;font-size:11px;padding:1px 8px}
main{padding:28px;min-width:0;max-width:1180px;width:100%}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:20px}
.top .sub{color:var(--muted);font-size:14px;margin-top:4px}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:18px;min-width:0}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:20px}
.stat b{display:block;font-size:28px;line-height:1.1}.stat span{color:var(--muted);font-size:13px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.btn{display:inline-flex;align-items:center;gap:6px;background:var(--navy);color:#fff;border:0;border-radius:9px;padding:9px 16px;font:inherit;font-weight:700;font-size:14px;cursor:pointer;text-decoration:none}
.btn:hover{background:var(--blue)}.btn.pri{background:var(--blue)}.btn.pri:hover{background:var(--blue-d)}
.btn.ghost{background:#fff;color:var(--navy);border:1px solid var(--line)}.btn.ghost:hover{background:var(--sky)}
.btn.red{background:var(--red)}.btn.sm{padding:5px 11px;font-size:13px}
.tw{overflow-x:auto;border:1px solid var(--line);border-radius:var(--r);background:#fff}
table{border-collapse:collapse;width:100%;font-size:14px}
th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);padding:10px 14px;background:#FBFAF7;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:top}tr:last-child td{border-bottom:0}tr:hover td{background:#FDFCFA}
td.r,th.r{text-align:right}.num{font-variant-numeric:tabular-nums}
.tag{display:inline-block;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:700;background:#EEEAE1;color:var(--muted);white-space:nowrap}
.tag.ok{background:var(--green-bg);color:var(--green)}.tag.warn{background:var(--amber-bg);color:var(--amber)}.tag.bad{background:var(--red-bg);color:var(--red)}.tag.info{background:var(--sky);color:var(--blue-d)}
form.f{display:grid;grid-template-columns:1fr 1fr;gap:14px}.f .full{grid-column:1/-1}
label{display:block;font-size:13px;font-weight:700;margin-bottom:5px}
input,select,textarea{width:100%;font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--navy)}
input:focus,select:focus,textarea:focus{outline:2px solid var(--blue);outline-offset:-1px}textarea{min-height:90px;resize:vertical}
.flash{padding:11px 14px;border-radius:9px;margin-bottom:14px;font-weight:600}.flash.ok{background:var(--green-bg);color:var(--green)}.flash.err{background:var(--red-bg);color:var(--red)}
.muted{color:var(--muted)}.sm{font-size:13px}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.empty{padding:34px;text-align:center;color:var(--muted)}
.kv{display:grid;grid-template-columns:150px 1fr;gap:6px 14px;font-size:14px}.kv dt{color:var(--muted)}.kv dd{margin:0;word-break:break-word}
.link{word-break:break-all;background:#FBFAF7;border:1px dashed var(--line);border-radius:9px;padding:10px 12px;font-size:13px}
.auth{min-height:100vh;display:grid;place-items:center;padding:20px}.auth .card{width:100%;max-width:420px;padding:28px}
.auth .logo{color:var(--navy);padding:0 0 18px;display:block;font-size:22px}
.items td{padding:6px 8px}.items input{padding:8px}
.mtop{display:none}
@media(max-width:860px){.app{grid-template-columns:1fr}.side{position:static;height:auto;flex-direction:row;flex-wrap:wrap;align-items:center;padding:10px}.side .logo{padding:0 10px 0 4px;width:100%}.side .grow,.side .who{display:none}.side a.nv{padding:7px 10px;font-size:13px}main{padding:18px 16px}.grid2{grid-template-columns:1fr}form.f{grid-template-columns:1fr}.kv{grid-template-columns:1fr}}
@media print{.side,.noprint{display:none!important}.app{display:block}main{padding:0;max-width:none}.card{border:0;padding:0}body{background:#fff}}`;
const css=()=>CSS;
function layout(title,body,active=''){
  const u=me();let nav=[];
  if(u){
    if(u.role==='admin'){const pc=int(val("SELECT COUNT(*) FROM companies WHERE status='pending'")),ni=int(val("SELECT COUNT(*) FROM companies c WHERE c.invited_at IS NULL AND NOT EXISTS(SELECT 1 FROM users u WHERE u.company_id=c.id)")),nl=int(val("SELECT COUNT(*) FROM leads WHERE status='new'")),ncl=int(val("SELECT COUNT(*) FROM assignments WHERE claim_status='open'"));
      nav=[['a_dash','Übersicht',0],['a_companies','Firmen',pc],['a_import','Firmen einladen',ni],['a_leads','Anfragen / Leads',nl],['a_claims','Reklamationen',ncl],['a_finance','Finanzen',0],['a_users','Benutzer',0],['a_settings','Einstellungen',0],['a_log','Protokoll',0]];}
    else if(u.role==='partner'){const no=int(val("SELECT COUNT(*) FROM assignments WHERE company_id=? AND status='offered'",[u.company_id]));
      const nm=int(val("SELECT COUNT(*) FROM leads WHERE status='open' AND published>?",[date('Y-m-d H:i:s',time()-2*86400)]));
      nav=[['p_dash','Übersicht',0],['p_market','Lead-Markt',nm],['p_leads','Meine Leads',no],['p_wallet','Guthaben',0],['p_clients','Kunden (CRM)',0],['p_quotes','Offerten',0],['p_invoices','Rechnungen',0],['p_profile','Firmenprofil',0]];}
    else nav=[['c_dash','Meine Anfragen',0],['c_new','Neue Anfrage',0]];
  }
  let o='<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>'+h(title)+' – auftragdeal.ch</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap"><style>'+css()+'</style></head><body>';
  if(!u){sendHtml(o+body+'</body></html>');return;}
  o+='<div class="app"><aside class="side"><a class="logo" href="index.php">auftrag<span>deal</span>.ch</a>';
  for(const [p,l,b] of nav)o+='<a class="nv'+(active===p?' on':'')+'" href="index.php?p='+p+'">'+h(l)+(b?'<span class="badge">'+b+'</span>':'')+'</a>';
  o+='<div class="grow"></div><a class="nv" href="index.php?p=account">Mein Konto</a><a class="nv" href="index.php?p=logout">Abmelden</a><div class="who">'+h(u.name||u.email)+'<br>'+h({admin:'Administrator',partner:(u.company||'Partner'),customer:'Kunde'}[u.role])+'</div></aside><main>';
  for(const [t,m] of flashGet())o+='<div class="flash '+(t==='ok'?'ok':'err')+'">'+h(m)+'</div>';
  sendHtml(o+body+'</main></div></body></html>');
}
const tag=(txt,cls='')=>'<span class="tag '+cls+'">'+h(txt)+'</span>';
const co_tag=s=>tag(K.CO_STATUS[s]||s,{pending:'warn',active:'ok',blocked:'bad'}[s]||'');
const lead_tag=s=>tag(K.LEAD_STATUS[s]||s,{new:'warn',open:'info',soldout:'ok',closed:'',expired:'',spam:'bad'}[s]||'');
function as_tag(s){const m={offered:['Angeboten','warn'],accepted:['Angenommen','ok'],declined:['Abgelehnt',''],refunded:['Erstattet','bad']};return tag((m[s]||[s])[0],(m[s]||[0,''])[1]);}
const doc_tag=s=>tag(K.DOC_STATUS[s]||s,{paid:'ok',accepted:'ok',sent:'info',open:'warn',overdue:'bad',declined:'bad'}[s]||'');
const head=(t,sub='',actions='')=>'<div class="top"><div><h1>'+h(t)+'</h1>'+(sub?'<div class="sub">'+h(sub)+'</div>':'')+'</div><div class="row">'+actions+'</div></div>';
function post_btn(label,page,q,fields={},cls='btn sm',confirm=''){
  let o='<form method="post" action="index.php?'+h(qs(Object.assign({p:page},q||{})))+'" style="display:inline"'+(confirm?' onsubmit="return confirm(\''+h(String(confirm).replace(/['\\]/g,'\\$&'))+'\')"':'')+'>'+csrf_field();
  for(const k in fields)o+='<input type="hidden" name="'+h(k)+'" value="'+h(fields[k])+'">';
  return o+'<button class="'+cls+'">'+h(label)+'</button></form>';}
// opts: Liste (Array) oder assoc-Objekt
function opts(list,sel='',assoc=false){let o='';const ent=Array.isArray(list)?list.map((v,i)=>[assoc?i:v,v]):Object.entries(list);
  for(const [k,v] of ent){const vv=assoc?k:v;o+='<option value="'+h(vv)+'"'+(String(vv)===String(sel)?' selected':'')+'>'+h(v)+'</option>';}return o;}
module.exports={css,layout,tag,co_tag,lead_tag,as_tag,doc_tag,head,post_btn,opts};
