const $=id=>document.getElementById(id);const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t=v=>v?new Date(v).toLocaleString('bg-BG'):'';const GST={armed:'Включена',armed_partial:'Частично',disarmed:'Изключена'};
let editing=false;
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x===b));for(const k of['status','log','names'])$('tab-'+k).hidden=b.dataset.tab!==k;if(b.dataset.tab==='names')loadNames();});
function render(s){$('module').textContent=`${s.panel.name} · ${s.panel.module} · ${s.panel.receiver}`;$('mode').textContent=s.panel.mode;$('events').textContent=s.stats.events;$('acks').textContent=s.stats.acks;$('session').textContent=s.panel.session?'Активна':'Няма';$('ha').textContent=s.panel.ha;$('bad').textContent=`${s.stats.badCrc} / ${s.stats.unknown}`;$('last').textContent=s.panel.lastMessageAt?new Date(s.panel.lastMessageAt).toLocaleTimeString('bg-BG'):'Няма';
 const zones=Object.values(s.zones||{});const byG={};for(const z of zones)(byG[z.group||'-']=byG[z.group||'-']||[]).push(z);
 $('groups').innerHTML=[...Object.keys(s.groups),'-'].filter(g=>byG[g]).map(g=>{const G=s.groups[g]||{};const st=G.state;
  return `<div class="grp"><h3>${g==='-'?'Без група':esc(G.name)+' ('+g+')'}</h3>${g!=='-'?`<span class="gst ${st==='disarmed'?'disarmed':st?'armed':''}">${st?GST[st]:'няма данни'}</span>`:''}</div><div class="zgrid">`+
  byG[g].map(z=>{const c=z.alarm?'alarm':z.omitted?'omit':z.armed?'armed':'ok';const txt=z.alarm?esc(z.alarm_type||'Аларма'):z.omitted?'Пропусната':z.armed?'Под охрана':'Нормално';
   return `<div class="z ${c}"><b>${esc(z.name)}</b><span>${esc(z.zone)}${z.type?' · '+esc(z.type):''}</span><em>${txt}</em></div>`}).join('')+'</div>'}).join('');
 $('rows').innerHTML=(s.events||[]).map(e=>`<tr><td>${t(e.time)}</td><td>${esc(e.title)}</td><td>${esc(e.code||'')}</td><td>${esc(e.group_name||e.group||'')}</td><td>${esc(e.zone_name||e.point||'')}</td><td>${esc(e.user||'')}</td><td>${esc(e.panel_time||'')}</td></tr>`).join('')||'<tr><td colspan="7">Все още няма получени пакети.</td></tr>'}
async function load(){render(await fetch('api/state').then(r=>r.json()))}
function zrow(n,z){const opts=['',1,2,3,4,5,6,7,8].map(g=>`<option value="${g}" ${String(z.group||'')===String(g)?'selected':''}>${g||'-'}</option>`).join('');
 return `<tr><td class="n"><input value="${esc(n)}" class="zn" inputmode="numeric"></td><td><input value="${esc(z.name)}" class="zname" maxlength="40"></td><td class="g"><select class="zg">${opts}</select></td><td class="t"><input value="${esc(z.type||'')}" class="zt" maxlength="20"></td><td><button class="del" title="Изтрий">✕</button></td></tr>`}
async function loadNames(){const n=await fetch('api/names').then(r=>r.json());
 $('gnames').innerHTML=[1,2,3,4,5,6,7,8].map(g=>`<div><span>Група ${g}</span><input data-g="${g}" value="${esc(n.groups[g]||'')}" maxlength="40" placeholder="Група ${g}"></div>`).join('');
 $('znames').innerHTML=Object.keys(n.zones).sort((a,b)=>a-b).map(k=>zrow(k,n.zones[k])).join('');bindDel();$('saveMsg').textContent='';}
function bindDel(){document.querySelectorAll('.del').forEach(b=>b.onclick=()=>b.closest('tr').remove());}
$('addz').onclick=()=>{$('znames').insertAdjacentHTML('beforeend',zrow('',{name:'',group:'',type:''}));bindDel();};
$('saveNames').onclick=async()=>{const groups={},zones={};document.querySelectorAll('#gnames input').forEach(i=>{if(i.value.trim())groups[i.dataset.g]=i.value.trim();});
 for(const tr of document.querySelectorAll('#znames tr')){const n=tr.querySelector('.zn').value.trim();if(!/^\d{1,4}$/.test(n))continue;zones[n]={name:tr.querySelector('.zname').value.trim(),group:tr.querySelector('.zg').value,type:tr.querySelector('.zt').value.trim()};}
 const r=await fetch('api/names',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({groups,zones})}).then(r=>r.json());
 $('saveMsg').textContent=r.ok?`Запазено: ${r.zones} зони, ${r.groups} групи. Home Assistant е обновен.`:'Грешка: '+r.error;load();};
$('resetNames').onclick=async()=>{if(!confirm('Да се върнат ли имената от панела? Вашите промени ще се загубят.'))return;await fetch('api/names/reset',{method:'POST'});loadNames();load();};
$('refresh').onclick=load;load();const es=new EventSource('api/stream');es.addEventListener('galaxy',load);setInterval(load,15000);
