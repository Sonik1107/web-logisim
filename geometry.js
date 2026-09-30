import {TYPES} from './simulator.js';
export const GRID=10;
export const snap=n=>Math.round(n/GRID)*GRID;
export function localPin(node,pin,out=false){
 if(out)return {x:80,y:30};
 const inputs=TYPES[node.type].inputs;
 return {x:0,y:inputs.length===1?30:pin===inputs[0]?20:40};
}
export function pinPoint(nodes,ref,out=false){
 const n=nodes.find(n=>n.id===ref.node),p=localPin(n,ref.pin,out);
 return {x:n.x+p.x,y:n.y+p.y};
}
export function route(a,b,points=[]){
 const result=[a];let last=a;
 for(const p of points){result.push({x:p.x,y:last.y},{...p});last=p;}
 const mid=snap((last.x+b.x)/2);
 result.push({x:mid,y:last.y},{x:mid,y:b.y},b);
 return result.filter((p,i)=>!i||p.x!==result[i-1].x||p.y!==result[i-1].y);
}
export const pathFor=points=>points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ');
export function nearestPoint(points,p){
 let best={distance:Infinity,index:0,point:points[0]};
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
  const point={x:a.x+t*dx,y:a.y+t*dy},distance=Math.hypot(point.x-p.x,point.y-p.y);
  if(distance<best.distance)best={distance,index:i,point};
 }
 return best;
}

// A crossing is a junction only when the routes share an electrical source
// and at least one route has a vertex at that point.
export function junctions(wires){
 const groups=new Map(),result=[];
 for(const wire of wires){
  const key=JSON.stringify(wire.from);
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(wire);
 }
 for(const group of groups.values()){
  if(group.length<2)continue;
  const candidates=new Map();
  for(const w of group)for(const p of w.route)candidates.set(`${p.x},${p.y}`,p);
  for(const p of candidates.values()){
   const directions=new Set();
   for(const w of group)for(let i=1;i<w.route.length;i++){
    const a=w.route[i-1],b=w.route[i];
    if(a.y===b.y&&p.y===a.y&&p.x>=Math.min(a.x,b.x)&&p.x<=Math.max(a.x,b.x)){
     if(Math.min(a.x,b.x)<p.x)directions.add('left');if(Math.max(a.x,b.x)>p.x)directions.add('right');
    }
    if(a.x===b.x&&p.x===a.x&&p.y>=Math.min(a.y,b.y)&&p.y<=Math.max(a.y,b.y)){
     if(Math.min(a.y,b.y)<p.y)directions.add('up');if(Math.max(a.y,b.y)>p.y)directions.add('down');
    }
   }
   if(directions.size>=3)result.push({...p,source:group[0].from.node});
  }
 }
 return result;
}
