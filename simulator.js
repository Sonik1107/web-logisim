export const TYPES = {
 INPUT:{name:'Вход',group:'ВХОДЫ И ВЫХОДЫ',inputs:[],outputs:['out']},
 OUTPUT:{name:'Выход',group:'ВХОДЫ И ВЫХОДЫ',inputs:['in'],outputs:[]},
 AND:{name:'AND',group:'ЛОГИЧЕСКИЕ ВЕНТИЛИ',inputs:['a','b'],outputs:['out']},
 OR:{name:'OR',group:'ЛОГИЧЕСКИЕ ВЕНТИЛИ',inputs:['a','b'],outputs:['out']},
 XOR:{name:'XOR',group:'ЛОГИЧЕСКИЕ ВЕНТИЛИ',inputs:['a','b'],outputs:['out']},
 NOT:{name:'NOT',group:'ЛОГИЧЕСКИЕ ВЕНТИЛИ',inputs:['in'],outputs:['out']},
 NAND:{name:'NAND',group:'ЛОГИЧЕСКИЕ ВЕНТИЛИ',inputs:['a','b'],outputs:['out']},
 NOR:{name:'NOR',group:'ЛОГИЧЕСКИЕ ВЕНТИЛИ',inputs:['a','b'],outputs:['out']},
 NMOS:{name:'n-MOS',group:'ТРАНЗИСТОРЫ',inputs:['gate','source'],outputs:['out']},
 PMOS:{name:'p-MOS',group:'ТРАНЗИСТОРЫ',inputs:['gate','source'],outputs:['out']}
};
export function evaluate(type, inputs, value=0){
 const [a,b]=inputs; const bit=x=>x===0||x===1; const inv=x=>bit(x)?1-x:'X';
 switch(type){case 'INPUT':return value;case 'OUTPUT':return a;
 case 'AND':case 'NAND':{const v=a===0||b===0?0:a===1&&b===1?1:'X';return type==='NAND'?inv(v):v;}
 case 'OR':case 'NOR':{const v=a===1||b===1?1:a===0&&b===0?0:'X';return type==='NOR'?inv(v):v;}
 case 'XOR':return bit(a)&&bit(b)?a^b:'X';case 'NOT':return inv(a);
 case 'NMOS':case 'PMOS':return a===(type==='NMOS'?1:0)?b:bit(a)?'Z':'X';default:return 'X';}
}
// A propagation run starts from the previous settled state. This is essential
// for circuits with feedback: releasing S/R must not erase a latch's state.
export function simulate(nodes,wires,previous={}){
 let values=Object.fromEntries(nodes.map(n=>[n.id,n.type==='INPUT'?n.value:
  Object.hasOwn(previous,n.id)&&[0,1,'X','Z'].includes(previous[n.id])?previous[n.id]:'X']));
 const incoming=new Map(wires.map(w=>[`${w.to.node}:${w.to.pin}`,w.from.node]));
 const compute=(state,frozen=new Set())=>Object.fromEntries(nodes.map(n=>[n.id,
  frozen.has(n.id)?'X':evaluate(n.type,TYPES[n.type].inputs.map(p=>{
   const id=incoming.get(`${n.id}:${p}`);return id===undefined?'Z':state[id];
  }),n.value)]));
 const seen=new Map(),states=[];
 const limit=Math.max(32,nodes.length*4+8);
 for(let step=0;step<limit;step++){
  const key=nodes.map(n=>values[n.id]).join(',');
  if(seen.has(key)){
   // Only mark changing signals unknown; unrelated circuits keep working.
   const cycle=states.slice(seen.get(key)),oscillating=new Set(nodes.filter(n=>
    cycle.some(state=>state[n.id]!==values[n.id])).map(n=>n.id));
   for(const id of oscillating)values[id]='X';
   for(let i=0;i<nodes.length+1;i++){
    const next=compute(values,oscillating);
    if(nodes.every(n=>next[n.id]===values[n.id]))break;
    values=next;
   }
   return {values,stable:false,oscillating:[...oscillating]};
  }
  seen.set(key,states.length);states.push(values);
  const next=compute(values);
  if(nodes.every(n=>next[n.id]===values[n.id]))return {values:next,stable:true,oscillating:[]};
  values=next;
 }
 const recent=states.slice(-Math.max(2,nodes.length));
 const unstable=new Set(nodes.filter(n=>recent.some(s=>s[n.id]!==values[n.id])).map(n=>n.id));
 for(const id of unstable)values[id]='X';
 for(let i=0;i<nodes.length+1;i++)values=compute(values,unstable);
 return {values,stable:false,oscillating:[...unstable]};
}

export function validate(data){
 if(!data||data.version!==1||typeof data.name!=='string'||!Array.isArray(data.nodes)||!Array.isArray(data.wires)||data.nodes.length>1000||data.wires.length>5000)throw Error('Некорректный формат схемы');
 const ids=new Set();for(const n of data.nodes){if(typeof n.id!=='string'||ids.has(n.id)||!Object.hasOwn(TYPES,n.type)||!Number.isFinite(n.x)||!Number.isFinite(n.y)||Math.abs(n.x)>1e6||Math.abs(n.y)>1e6||typeof n.label!=='string'||![0,1].includes(n.value))throw Error('Некорректный компонент');ids.add(n.id);}
 const occupied=new Set(),wireIds=new Set();for(const w of data.wires){const a=data.nodes.find(n=>n.id===w.from?.node),b=data.nodes.find(n=>n.id===w.to?.node);const key=`${w.to?.node}:${w.to?.pin}`;if(typeof w.id!=='string'||wireIds.has(w.id)||!a||!b||!TYPES[a.type].outputs.includes(w.from.pin)||!TYPES[b.type].inputs.includes(w.to.pin)||occupied.has(key))throw Error('Некорректное соединение');if(w.points!==undefined&&(!Array.isArray(w.points)||w.points.length>1000||w.points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>1e6||Math.abs(p.y)>1e6)))throw Error('Некорректный маршрут провода');occupied.add(key);wireIds.add(w.id);}
 if(data.state!==undefined&&(data.state===null||typeof data.state!=='object'||Array.isArray(data.state)||Object.values(data.state).some(v=>![0,1,'X','Z'].includes(v))))throw Error('Некорректное состояние симуляции');
 return data;
}
