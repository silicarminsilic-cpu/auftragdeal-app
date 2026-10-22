'use strict';
const K=require('./core');
const {h,q,one,all,ins,int,str,dtt,now,cfg,go,flash,post,need,csrf_field,throttle,hit,send_mail,base_url,R,BRANCHES}=K;
const U=require('./ui');const {layout,head,tag,opts}=U;
const M=require('./market');const {intake_check}=M;
const strim=(s,n)=>{const a=Array.from(str(s));return a.length>n?a.slice(0,n-1).join('')+'…':a.join('');};
function pg_c_dash(){
  const u=need('customer');const r=all("SELECT l.*,(SELECT COUNT(*) FROM assignments a WHERE a.lead_id=l.id AND a.status='accepted') AS acc FROM leads l WHERE customer_id=? ORDER BY id DESC",[u.id]);
  let o=head('Meine Anfragen','Verfolgen Sie den Stand Ihrer Anfragen','<a class="btn pri" href="index.php?p=c_new">Neue Anfrage</a>');
  if(!r.length)o+='<div class="card empty">Sie haben noch keine Anfrage erfasst.</div>';else{o+='<div class="tw"><table><tr><th>Eingang</th><th>Branche</th><th>Ort</th><th>Beschreibung</th><th>Stand</th></tr>';
    for(const x of r){const st=x.acc>0?tag(x.acc+' Firma(en) melden sich','ok'):(x.status==='open'||x.status==='soldout'?tag('Wird vermittelt','info'):tag('Eingegangen','warn'));o+='<tr><td class="num">'+dtt(x.created)+'</td><td><b>'+h(x.branch)+'</b></td><td>'+h(str(x.zip)+' '+str(x.city))+'</td><td class="sm">'+h(strim(x.description,90))+'</td><td>'+st+'</td></tr>';}o+='</table></div>';}
  layout('Meine Anfragen',o,'c_dash');
}
function pg_c_new(){
  const u=need('customer');
  if(R().method==='POST'){if(!post('zip')||!post('city')||post('description')===''||!BRANCHES.includes(post('branch'))){flash('Bitte Branche, PLZ, Ort und Beschreibung ausfüllen.','err');go('c_new');}
    if(throttle('lead:'+u.id,10,3600)){flash('Zu viele Anfragen in kurzer Zeit.','err');go('c_new');}hit('lead:'+u.id);
    const id=ins('leads',{customer_id:u.id,name:u.name,email:u.email,phone:post('phone')||u.phone,branch:post('branch'),zip:post('zip'),city:post('city'),description:post('description'),when_:post('when'),budget:post('budget'),status:'new',source:'kundenportal',created:now()});
    intake_check(id);
    send_mail(cfg('notify'),'Neue Anfrage #'+id+': '+post('branch')+' in '+post('city'),'Neue Anfrage im Dashboard:\n'+post('branch')+', '+post('zip')+' '+post('city')+'\n\n'+post('description')+'\n\n'+base_url()+'/index.php?p=a_lead&id='+id);
    flash('Danke! Ihre Anfrage ist bei uns eingegangen. Passende Firmen melden sich bei Ihnen.');go('c_dash');}
  const o=head('Neue Anfrage','Beschreiben Sie Ihren Auftrag – kostenlos und unverbindlich')+'<div class="card" style="max-width:760px"><form method="post" class="f">'+csrf_field()+'<div><label>Branche</label><select name="branch">'+opts(BRANCHES)+'</select></div><div><label>Telefon</label><input name="phone" value="'+h(u.phone)+'"></div><div><label>PLZ</label><input name="zip" required></div><div><label>Ort</label><input name="city" required></div><div><label>Wunschtermin</label><input name="when" placeholder="z.B. Ende November"></div><div><label>Budget (optional)</label><input name="budget" placeholder="z.B. CHF 2000"></div><div class="full"><label>Beschreibung</label><textarea name="description" required placeholder="Was soll gemacht werden? Je genauer, desto besser die Offerten."></textarea></div><div class="full"><button class="btn pri">Anfrage senden</button></div></form></div>';
  layout('Neue Anfrage',o,'c_new');
}
module.exports={pages:{c_dash:pg_c_dash,c_new:pg_c_new}};
