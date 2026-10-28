import {StoryCursor} from './player.js';
import {initial} from '../core.js';
export async function auditPage(page,{common=async()=>null,resource=async()=>({status:'unverified'}),maxPaths=128,maxSteps=2000,progress=async()=>{}}={}){
 const records=new Map(),seen=new Set(),branches=new Set();let limited=false,paths=0;
 async function collect(pg,chain=[]){for(const c of pg.commands||[]){const p=c.raw.parameters||[],code=c.raw.code;
  if([401,405,102,231,232,235,261].includes(code))records.set(c.id,{command_id:c.id,page_id:pg.id,kind:({401:'dialogue',405:'dialogue',102:'choice',231:'cg',232:'cg_change',235:'cg_erase',261:'movie'})[code],branch_count:code===102?p[0].length:undefined,resource:code===231?'img/pictures/'+p[1]:code===261?'movies/'+p[0]:undefined,status:'unknown',reasons:[]});
  if(code===117&&!chain.includes(p[0])&&chain.length<16){const sub=await common(p[0]);if(sub)await collect(sub,[...chain,p[0]]);}
 }}
 await collect(page);
 const queue=[[]];const effects=new Map();
 while(queue.length&&paths<maxPaths){const path=queue.shift();const r=new StoryCursor({page,rawVisuals:true,state:initial(),context:page.auditContext||{},common});let position=0,answer;
  for(let step=0;step<maxSteps;step++){
   const w=await r.advance(answer);answer=undefined;
   if(w.command)seen.add(w.command);for(const id of w.lineIds||[])seen.add(id);
   for(const f of r.fidelity)effects.set(f.command,{command_id:f.command,reason:f.message});
   if(w.type==='choice'){
    if(position>=path.length){for(let i=0;i<w.choices.length;i++)if(queue.length<maxPaths)queue.push([...path,i]);else limited=true;break;}
    answer=path[position++];branches.add(w.command+':'+answer);
   }
   if(w.type==='done')break;
   if(step===maxSteps-1)limited=true;
  }
  paths++;await progress(paths,queue.length);
 }
 if(queue.length)limited=true;
 for(const item of records.values()){
  if(seen.has(item.command_id))item.status='accessible';else item.reasons.push(limited?'inspection_limit':'not_observed');
  if(item.kind==='choice'){
   item.accessible_branches=Array.from({length:item.branch_count},(_,i)=>i).filter(i=>branches.has(item.command_id+':'+i));
   if(item.accessible_branches.length<item.branch_count){item.status=item.accessible_branches.length?'partial':'unknown';item.reasons.push('branches_not_all_observed');}
  }
  if(item.resource){const result=await resource(item.resource);item.resource_check=result;
   if(result.status==='missing'){item.status='resource_missing';item.reasons.push('not_in_connected_package');}
   else if(result.status!=='decoded'){item.status=seen.has(item.command_id)?'partial':'unknown';item.reasons.push(result.reason||'decode_unverified');}
  }
 }
 const counts={},causes={};for(const r of records.values()){counts[r.status]=(counts[r.status]||0)+1;for(const reason of r.reasons)causes[reason]=(causes[reason]||0)+1;}
 return {page_id:page.id,context:page.auditContext,paths_examined:paths,limited,counts,causes,contents:[...records.values()],uncertain_effects:[...effects.values()],policy:'Bounded static branch exploration; resource linkage is separate from decoded presentation. No game scripts executed.'};
}
