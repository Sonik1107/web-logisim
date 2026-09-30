import {TYPES,simulate,validate} from './simulator.js';
import {GRID,snap,localPin,pinPoint,route,pathFor,nearestPoint,junctions} from './geometry.js';
import {halfAdder,rsLatch} from './examples.js';

const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID();
let model,values={},selected=null,tool='select',placing=null,pending=null,drag=null;
let space=false,paused=false,dirty=true,result={stable:true,oscillating:[]};
let history=[],future=[],zoom=1,offset={x:0,y:0},toastTimer,lastPointer={x:200,y:150};
const canvas=$('#canvas');
const pin=(ref,out=false)=>pinPoint(model.nodes,ref,out);
const wireRoute=w=>route(pin(w.from,true),pin(w.to),w.points);
function notify(message){
 $('#toast').textContent=message;$('#toast').style.display='block';
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',4000);
}
function snapshot(){return JSON.stringify({model,values});}
function checkpoint(){history.push(snapshot());if(history.length>100)history.shift();future=[];}
function documentData(){return {...model,state:Object.fromEntries(model.nodes.filter(n=>Object.hasOwn(values,n.id)).map(n=>[n.id,values[n.id]]))};}
function save(){
 try{localStorage.setItem('web-logisim-v1',JSON.stringify(documentData()));$('#saved').textContent='Сохранено локально';}
 catch{$('#saved').textContent='Не удалось сохранить';}
}
function commit(electrical=true){dirty ||= electrical;render();save();}
function shape(type){
 if(type==='INPUT')return '<rect class="body" x="10" y="10" width="50" height="40"/>';
 if(type==='OUTPUT')return '<path class="body" d="M10 10 H50 L65 30 L50 50 H10 Z"/>';
 if(type==='NOT')return '<path class="body" d="M10 5 V55 L60 30 Z"/><circle class="body" cx="65" cy="30" r="5"/>';
 if(type==='NMOS'||type==='PMOS')return `<path fill="none" stroke="currentColor" stroke-width="2" d="M0 20 H25 M25 8 V50 M34 8 V50 M34 10 H60 V30 H80 M34 45 H50 V60 H5 V40 H0"/>${type==='PMOS'?'<circle class="body" cx="20" cy="20" r="4"/>':''}<path fill="currentColor" d="${type==='NMOS'?'M45 40 L37 45 L45 50':'M38 40 L46 45 L38 50'}"/>`;
 const or=['OR','NOR','XOR'].includes(type);
 return `<path class="body" d="${or?'M10 5 Q34 30 10 55 Q50 55 65 30 Q50 5 10 5 Z':'M10 5 H35 A25 25 0 0 1 35 55 H10 Z'}"/>${type==='XOR'?'<path d="M3 5 Q27 30 3 55" fill="none" stroke="currentColor" stroke-width="1.8"/>':''}${['NAND','NOR'].includes(type)?'<circle class="body" cx="70" cy="30" r="5"/>':''}`;
}
const color=v=>v===1?'#00b000':v===0?'#006400':v==='Z'?'#999':'#155acc';
function nodeMarkup(n,ghost=false){
 const t=TYPES[n.type],v=values[n.id]??'X';
 const inputs=t.inputs.map(p=>{
  const q=localPin(n,p),wire=model.wires.find(w=>w.to.node===n.id&&w.to.pin===p);
  return `<g data-pin="${p}" data-direction="in"><path d="M0 ${q.y} H${['OR','NOR','XOR'].includes(n.type)?17:10}" stroke="${color(wire?values[wire.from.node]:'Z')}"/><circle class="pin-hit" cx="0" cy="${q.y}" r="9"/><circle class="pin" cx="0" cy="${q.y}" r="3"/><text x="-5" y="${q.y-5}" text-anchor="end" style="font-size:8px">${n.type.endsWith('MOS')?(p==='gate'?'G':'S'):''}</text></g>`;
 }).join('');
 const outputs=t.outputs.map(p=>`<g data-pin="${p}" data-direction="out"><path d="M${n.type==='INPUT'?60:['NAND','NOR'].includes(n.type)?75:70} 30 H80" stroke="${color(v)}"/><circle class="pin-hit" cx="80" cy="30" r="9"/><circle class="pin" cx="80" cy="30" r="3"/></g>`).join('');
 return `<g class="node" data-id="${esc(n.id)}" transform="translate(${n.x},${n.y})">${!ghost&&selected===n.id?'<rect class="selection" x="-8" y="-22" width="96" height="94"/>':''}<text x="35" y="-9" text-anchor="middle">${esc(n.label)}</text>${shape(n.type)}${['INPUT','OUTPUT'].includes(n.type)?`<text class="value" x="35" y="38" text-anchor="middle" style="fill:${color(v)}">${v}</text>`:''}${inputs}${outputs}</g>`;
}
function renderWires(){
 $('#wires').innerHTML=model.wires.map(w=>{
  const v=values[w.from.node],d=pathFor(wireRoute(w));
  return `<g><path class="wire-hit" data-wire="${esc(w.id)}" d="${d}"/><path class="wire ${v===1?'high-wire':v===0?'':v==='Z'?'floating-wire':'unknown-wire'} ${selected===w.id?'selected':''}" d="${d}"/></g>`;
 }).join('');
 $('#wires').innerHTML+=junctions(model.wires.map(w=>({...w,route:wireRoute(w)}))).map(p=>`<circle class="junction" cx="${p.x}" cy="${p.y}" r="3" fill="${color(values[p.source])}"/>`).join('');
 const w=model.wires.find(w=>w.id===selected);
 const handles=w?(w.points?.length?w.points:[{x:snap((pin(w.from,true).x+pin(w.to).x)/2),y:snap((pin(w.from,true).y+pin(w.to).y)/2)}]):[];
 $('#wire-handles').innerHTML=handles.map((p,i)=>`<circle class="wire-handle" data-wire="${esc(w.id)}" data-handle="${i}" cx="${p.x}" cy="${p.y}" r="5"><title>Перетащить; двойной щелчок — удалить точку</title></circle>`).join('');
}
function render(){
 if(dirty&&!paused){result=simulate(model.nodes,model.wires,values);values=result.values;dirty=false;}
 $('#sim-status').textContent=paused?'Пауза':result.stable?'Симуляция активна':'Колебания · X';
 $('.live-dot').className='live-dot'+(paused?' paused':!result.stable?' error':'');
 $('#nodes').innerHTML=model.nodes.map(n=>nodeMarkup(n)).join('');renderWires();renderProperties();
 $('#counts').textContent=`Элементов: ${model.nodes.length} · Проводов: ${model.wires.length}`;
 $('#undo').disabled=!history.length;$('#redo').disabled=!future.length;$('#delete').disabled=!selected;
 $('#signals').innerHTML=model.nodes.filter(n=>['INPUT','OUTPUT'].includes(n.type)).map(n=>`<div class="signal"><span>${esc(n.label)}<small>${n.type==='INPUT'?'вход':'выход'}</small></span>${n.type==='INPUT'?`<button data-toggle="${esc(n.id)}" class="bit ${values[n.id]===1?'on':''}" aria-label="Переключить ${esc(n.label)}">${n.value}</button>`:`<span class="bit ${values[n.id]===1?'on':values[n.id]===0?'':'unknown'}">${values[n.id]??'X'}</span>`}</div>`).join('')||'<p class="property-note">Нет входов и выходов.</p>';
}
function renderProperties(){
 const n=model.nodes.find(n=>n.id===selected),w=model.wires.find(w=>w.id===selected);
 if(n){
  $('#properties').innerHTML=`<div class="property-title">${TYPES[n.type].name}</div><table class="property-table"><tr><td>Метка</td><td><input id="label" aria-label="Метка компонента" maxlength="40" value="${esc(n.label)}"></td></tr><tr><td>Выход</td><td>${values[n.id]??'X'}</td></tr><tr><td>Положение</td><td>${n.x}, ${n.y}</td></tr></table>${n.type==='INPUT'?'<button class="property-action" id="toggle-selected">Переключить 0 / 1</button>':''}${n.type.endsWith('MOS')?'<p class="property-note">G — управление, S — сигнал. n-MOS открыт при G=1, p-MOS при G=0; закрытый ключ выдаёт Z. Цифровая однонаправленная модель.</p>':''}`;
 }else if(w){
  $('#properties').innerHTML='<div class="property-title">Провод</div><p class="property-note">Перетащите участок, чтобы изменить маршрут. Двойной щелчок по круглой точке удаляет её.</p><button class="property-action" id="reset-wire">Сбросить маршрут</button><button class="property-action" id="reconnect-wire">Переподключить вход</button>';
 }else{
  $('#properties').innerHTML=`<div class="property-title">${placing?TYPES[placing].name:'Ничего не выбрано'}</div><p class="property-note">${placing?'Нажмите на поле для размещения. Shift — разместить несколько компонентов. Escape — отмена.':'Выберите компонент или провод, чтобы изменить его свойства.'}</p>`;
 }
}
function library(query=''){
 const groups=new Map();
 for(const [type,t] of Object.entries(TYPES)){
  if(!(type+' '+t.name).toLowerCase().includes(query.toLowerCase()))continue;
  if(!groups.has(t.group))groups.set(t.group,[]);groups.get(t.group).push([type,t]);
 }
 $('#components').innerHTML=[...groups].map(([group,entries])=>`<details class="component-group" open><summary>${{'ВХОДЫ И ВЫХОДЫ':'Входы и выходы','ЛОГИЧЕСКИЕ ВЕНТИЛИ':'Логические вентили','ТРАНЗИСТОРЫ':'Транзисторы'}[group]}</summary><div class="component-list">${entries.map(([type,t])=>`<button class="component ${placing===type?'active':''}" data-add="${type}" title="Разместить ${t.name}"><svg viewBox="0 0 84 65">${shape(type)}</svg><span>${t.name}</span></button>`).join('')}</div></details>`).join('')||'<p class="empty-library">Ничего не найдено</p>';
}
function view(){
 $('#viewport').setAttribute('transform',`translate(${offset.x},${offset.y}) scale(${zoom})`);
 $('#grid').setAttribute('patternTransform',`translate(${offset.x},${offset.y}) scale(${zoom})`);
 $('#zoom-reset').textContent=`${Math.round(zoom*100)}%`;
}
function point(e){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left-offset.x)/zoom,y:(e.clientY-r.top-offset.y)/zoom};}
function fit(){
 const r=canvas.getBoundingClientRect();
 if(!model.nodes.length){zoom=1;offset={x:0,y:0};view();return;}
 const bounds=[...model.nodes,...model.wires.flatMap(w=>w.points||[])];
 const minX=Math.min(...bounds.map(n=>n.x))-30,minY=Math.min(...bounds.map(n=>n.y))-35;
 const maxX=Math.max(...bounds.map(n=>n.x))+110,maxY=Math.max(...bounds.map(n=>n.y))+90;
 zoom=Math.max(.15,Math.min(1.25,(r.width-60)/(maxX-minX),(r.height-60)/(maxY-minY)));
 offset={x:(r.width-(maxX-minX)*zoom)/2-minX*zoom,y:(r.height-(maxY-minY)*zoom)/2-minY*zoom};view();
}
function zoomAt(factor,cx,cy){
 const r=canvas.getBoundingClientRect();cx??=r.width/2;cy??=r.height/2;
 const next=Math.max(.15,Math.min(4,zoom*factor));
 offset={x:cx-(cx-offset.x)*next/zoom,y:cy-(cy-offset.y)*next/zoom};zoom=next;view();
}
function cancel(){pending=null;$('#preview').setAttribute('d','');}
function setTool(next){
 cancel();placing=null;tool=next;$('#placement').innerHTML='';canvas.dataset.tool=tool;
 for(const name of ['select','poke','wire','pan']){
  const button=$(`#${name}-tool`);button.classList.toggle('active',name===tool);button.setAttribute('aria-pressed',String(name===tool));
 }
 $('#tool-hint').textContent={select:'Выбор: перемещение элементов и проводов. Двойной щелчок по входу — 0 / 1.',poke:'Входы: нажмите на входной контакт, чтобы переключить 0 / 1.',wire:'Провод: пин → углы на поле → пин. Нажмите на провод для ответвления.',pan:'Обзор: перетаскивайте поле. Колесо — масштаб.'}[tool];
 library($('#search').value);renderProperties();
}
function drawPreview(p){
 if(!pending)return;
 const points=pending.points||[];
 const routePoints=pending.ref.direction==='out'?route(pin(pending.ref,true),p,points):route(pin(pending.ref),p,points);
 $('#preview').setAttribute('d',pathFor(routePoints));
}
function toggle(id){
 const n=model.nodes.find(n=>n.id===id);if(n?.type!=='INPUT')return;
 checkpoint();n.value=1-n.value;commit();
}
function finishConnection(ref){
 if(!pending)return;
 if(ref.direction===pending.ref.direction){notify('Соедините выход со входом');return;}
 const from=ref.direction==='out'?ref:pending.ref,to=ref.direction==='in'?ref:pending.ref;
 checkpoint();
 const points=pending.ref.direction==='out'?pending.points:[...(pending.points||[])].reverse();
 const editing=pending.editing;
 model.wires=model.wires.filter(w=>w.id!==editing&&!(w.to.node===to.node&&w.to.pin===to.pin));
 const w={id:editing||uid(),from:{node:from.node,pin:from.pin},to:{node:to.node,pin:to.pin},...(points?.length?{points}: {})};
 model.wires.push(w);selected=w.id;cancel();commit();
}
function refAt(target){
 const pinEl=target?.closest('[data-pin]'),nodeEl=target?.closest('.node');
 return pinEl&&nodeEl?{node:nodeEl.dataset.id,pin:pinEl.dataset.pin,direction:pinEl.dataset.direction}:null;
}
function place(p,repeat){
 checkpoint();const type=placing,n={id:uid(),type,x:snap(p.x-40),y:snap(p.y-30),label:TYPES[type].name,value:0};
 model.nodes.push(n);selected=n.id;if(!repeat)setTool('select');commit();
}
canvas.addEventListener('pointerdown',e=>{
 if(e.button!==0&&e.button!==1)return;
 e.preventDefault();canvas.focus({preventScroll:true});
 if(drag)return;
 const p=point(e);lastPointer=p;
 if(space||e.button===1||tool==='pan'){
  drag={pan:true,x:e.clientX,y:e.clientY,start:{...offset}};canvas.setPointerCapture(e.pointerId);return;
 }
 if(placing){place(p,e.shiftKey);return;}
 const nodeEl=e.target.closest('.node'),wireEl=e.target.closest('[data-wire]'),ref=refAt(e.target);
 if(tool==='poke'){
  selected=nodeEl?.dataset.id||null;
  if(selected)toggle(selected);render();return;
 }
 if(ref){
  if(pending)finishConnection(ref);
  else{pending={ref,points:[]};drag={connection:true,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);drawPreview(p);}
  return;
 }
 if(pending){
  pending.points.push({x:snap(p.x),y:snap(p.y)});drawPreview(p);return;
 }
 if(tool==='wire'&&wireEl){
  const w=model.wires.find(w=>w.id===wireEl.dataset.wire),path=wireRoute(w),nearest=nearestPoint(path,p);
  pending={ref:{...w.from,direction:'out'},points:[...path.slice(1,nearest.index),nearest.point]};
  selected=w.id;drawPreview(p);render();return;
 }
 selected=nodeEl?.dataset.id||wireEl?.dataset.wire||null;
 if(nodeEl){
  const n=model.nodes.find(n=>n.id===selected);drag={node:n.id,x:p.x,y:p.y,start:{x:n.x,y:n.y},saved:false};
 }else if(wireEl){
  const w=model.wires.find(w=>w.id===selected),handle=wireEl.dataset.handle;
  drag={wire:w.id,x:p.x,y:p.y,saved:false,index:handle===undefined?null:Number(handle),start:handle===undefined?p:(w.points?.[Number(handle)]||{x:snap((pin(w.from,true).x+pin(w.to).x)/2),y:snap((pin(w.from,true).y+pin(w.to).y)/2)})};
 }
 if(drag)canvas.setPointerCapture(e.pointerId);render();
});
function insertRoutePoint(w,p){
 let last=pin(w.from,true),best=Infinity,index=0;
 for(let i=0;i<=w.points.length;i++){
  const next=w.points[i],part=next?[last,{x:next.x,y:last.y},next]:route(last,pin(w.to));
  const d=nearestPoint(part,p).distance;if(d<best){best=d;index=i;}if(next)last=next;
 }
 w.points.splice(index,0,{...p});return index;
}
canvas.addEventListener('pointermove',e=>{
 const p=point(e);lastPointer=p;$('#pointer').textContent=`X: ${snap(p.x)} Y: ${snap(p.y)}`;
 if(placing)$('#placement').innerHTML=nodeMarkup({id:'ghost',type:placing,x:snap(p.x-40),y:snap(p.y-30),label:TYPES[placing].name},true);
 drawPreview({x:snap(p.x),y:snap(p.y)});
 if(!drag||drag.connection)return;
 if(drag.pan){offset={x:drag.start.x+e.clientX-drag.x,y:drag.start.y+e.clientY-drag.y};view();return;}
 if(!drag.saved&&Math.hypot(p.x-drag.x,p.y-drag.y)*zoom<4)return;
 if(!drag.saved){checkpoint();drag.saved=true;}
 if(drag.wire){
  const w=model.wires.find(w=>w.id===drag.wire);w.points??=[];
  if(drag.index===null)drag.index=insertRoutePoint(w,drag.start);
  w.points[drag.index]={x:snap(drag.start.x+p.x-drag.x),y:snap(drag.start.y+p.y-drag.y)};
 }else{
  const n=model.nodes.find(n=>n.id===drag.node);n.x=snap(drag.start.x+p.x-drag.x);n.y=snap(drag.start.y+p.y-drag.y);
 }
 render();
});
function endDrag(e){
 if(drag?.connection&&e&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5){
  const ref=refAt(document.elementFromPoint(e.clientX,e.clientY));
  if(ref&&pending&&ref.direction!==pending.ref.direction)finishConnection(ref);
 }
 if(drag?.saved)save();drag=null;
 if(e&&canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
}
canvas.addEventListener('pointerup',endDrag);
canvas.addEventListener('pointercancel',e=>{endDrag();cancel();});
canvas.addEventListener('lostpointercapture',()=>{if(drag)endDrag();});
canvas.addEventListener('pointerleave',()=>{$('#placement').innerHTML='';});
canvas.addEventListener('dblclick',e=>{
 if(tool!=='select'||pending)return;
 const handle=e.target.closest('.wire-handle');
 if(handle){const w=model.wires.find(w=>w.id===handle.dataset.wire);if(w.points?.length){checkpoint();w.points.splice(Number(handle.dataset.handle),1);commit(false);}return;}
 const n=e.target.closest('.node');if(n&&!refAt(e.target))toggle(n.dataset.id);
});
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoomAt(Math.exp(-e.deltaY*.001),e.clientX-r.left,e.clientY-r.top);},{passive:false});
$('#components').addEventListener('click',e=>{
 const type=e.target.closest('[data-add]')?.dataset.add;if(!type)return;
 setTool('select');placing=type;selected=null;canvas.dataset.tool='place';
 $('#tool-hint').textContent=`${TYPES[type].name}: нажмите на поле для размещения. Shift — несколько. Escape — отмена.`;
 library($('#search').value);renderProperties();
});
$('#search').addEventListener('input',e=>library(e.target.value));
$('#signals').addEventListener('click',e=>{const id=e.target.closest('[data-toggle]')?.dataset.toggle;if(id)toggle(id);});
$('#properties').addEventListener('click',e=>{
 if(e.target.id==='toggle-selected')toggle(selected);
 if(e.target.id==='reset-wire'){
  const w=model.wires.find(w=>w.id===selected);if(w?.points?.length){checkpoint();delete w.points;commit(false);}
 }
 if(e.target.id==='reconnect-wire'){
  const w=model.wires.find(w=>w.id===selected);setTool('wire');
  pending={ref:{...w.from,direction:'out'},points:structuredClone(w.points||[]),editing:w.id};
  notify('Выберите новый вход. Escape — оставить прежнее соединение.');
 }
});
$('#properties').addEventListener('change',e=>{
 if(e.target.id!=='label')return;const n=model.nodes.find(n=>n.id===selected);if(!n)return;
 checkpoint();n.label=e.target.value.trim()||TYPES[n.type].name;commit(false);
});
$('#project-name').addEventListener('change',e=>{checkpoint();model.name=e.target.value.trim()||'Без названия';e.target.value=model.name;commit(false);});
function remove(){
 if(!selected)return;checkpoint();model.nodes=model.nodes.filter(n=>n.id!==selected);
 model.wires=model.wires.filter(w=>w.id!==selected&&w.from.node!==selected&&w.to.node!==selected);
 selected=null;cancel();commit();
}
function restore(direction){
 const source=direction==='undo'?history:future,target=direction==='undo'?future:history;if(!source.length)return;
 endDrag();target.push(snapshot());const restored=JSON.parse(source.pop());model=restored.model;values=restored.values;
 selected=null;cancel();$('#project-name').value=model.name;commit();
}
for(const name of ['select','poke','wire','pan'])$(`#${name}-tool`).onclick=()=>setTool(name);
$('#undo').onclick=()=>restore('undo');$('#redo').onclick=()=>restore('redo');$('#delete').onclick=remove;
$('#pause').onclick=()=>{paused=!paused;$('#pause').textContent=paused?'▶':'Ⅱ';$('#pause').title=paused?'Продолжить симуляцию':'Приостановить симуляцию';render();save();};
$('#reset-sim').onclick=()=>{checkpoint();values={};commit();notify('Состояние сброшено. Для инициализации RS-триггера подайте S или R.');};
$('#zoom-in').onclick=()=>zoomAt(1.2);$('#zoom-out').onclick=()=>zoomAt(1/1.2);$('#zoom-reset').onclick=()=>zoomAt(1/zoom);$('#fit').onclick=fit;
function replace(data){
 endDrag();checkpoint();values=data.state||{};model={version:data.version,name:data.name,nodes:data.nodes,wires:data.wires};
 paused=false;$('#pause').textContent='Ⅱ';selected=null;setTool('select');$('#project-name').value=model.name;commit();fit();
}
$('#new').onclick=()=>replace({version:1,name:'Новая схема',nodes:[],wires:[]});
$('#example').onclick=()=>replace(halfAdder());
$('#rs-example').onclick=()=>{replace(rsLatch());setTool('poke');notify('R=1 сбрасывает Q. Выключите R, затем включите и выключите S: Q сохранит 1.');};
$('#export').onclick=()=>{
 const blob=new Blob([JSON.stringify(documentData(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=(model.name.replace(/[^\p{L}\p{N}_-]/gu,'_')||'circuit')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Схема сохранена в JSON');
};
$('#import').onclick=()=>$('#file').click();
$('#file').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{if(file.size>2e6)throw Error('Файл больше 2 МБ');replace(validate(JSON.parse(await file.text())));notify('Схема открыта');}
 catch(err){notify('Не удалось открыть: '+err.message);}e.target.value='';
};
// Close menus after an action and keep only one menu open.
document.addEventListener('click',e=>{
 const action=e.target.closest('[data-action]');if(action)$(`#${action.dataset.action}`).click();
 if(e.target.closest('.menu button')||!e.target.closest('nav'))document.querySelectorAll('nav details[open]').forEach(d=>d.open=false);
});
document.querySelectorAll('nav details').forEach(d=>d.addEventListener('toggle',()=>{if(d.open)document.querySelectorAll('nav details').forEach(other=>{if(other!==d)other.open=false;});}));
window.addEventListener('keydown',e=>{
 if(['INPUT','TEXTAREA'].includes(e.target.tagName))return;
 if(e.code==='Space'){space=true;e.preventDefault();}
 if(e.key==='Escape'){endDrag();setTool('select');selected=null;render();}
 if(drag)return;
 if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();}
 const modifier=e.ctrlKey||e.metaKey;
 if(modifier&&e.key.toLowerCase()==='z'){e.preventDefault();restore(e.shiftKey?'redo':'undo');}
 if(modifier&&e.key.toLowerCase()==='s'){e.preventDefault();$('#export').click();}
 if(modifier&&e.altKey&&e.key.toLowerCase()==='n'){e.preventDefault();$('#new').click();}
 if(!modifier&&['1','2','3','4'].includes(e.key))setTool(['select','poke','wire','pan'][Number(e.key)-1]);
 if(e.key==='/'){e.preventDefault();$('#search').focus();}
});
window.addEventListener('keyup',e=>{if(e.code==='Space')space=false;});
window.addEventListener('blur',()=>{space=false;endDrag();});
try{
 const saved=localStorage.getItem('web-logisim-v1'),data=saved?validate(JSON.parse(saved)):rsLatch();
 values=data.state||{};model={version:data.version,name:data.name,nodes:data.nodes,wires:data.wires};
}catch{model=rsLatch();notify('Сохранение недоступно или повреждено. Открыт пример RS-триггера.');}
$('#project-name').value=model.name;setTool('select');render();save();requestAnimationFrame(fit);
