import {buildSources} from './sources.js';
import {checkResult,mergeResults} from './manager.js';
export function portableSettings(packageId,title,placeNames,hidden,enrichment){
 return {format:'rpg-player-settings',version:1,package_id:packageId,title,placeNames,hidden,
 analysis:{schema_version:'1.0.0',package_id:packageId,items:Object.values(enrichment?.items||{}).map(x=>{const v={...x};delete v.reviewed;return v;})}};
}
export function checkSettings(data,id){
 if(!data||data.format!=='rpg-player-settings'||data.version!==1||data.package_id!==id)throw Error('다른 게임 또는 지원하지 않는 개인 설정');
 if(JSON.stringify(data).length>24e6)throw Error('개인 설정 크기 제한 24MB');
 const clean=Object.create(null);
 if(typeof data.title!=='string'||data.title.length>300)throw Error('게임 이름 형식 오류');
 for(const [key,value] of Object.entries(data.placeNames||{})){
  if(!/^\d+$/.test(key)||typeof value!=='string'||value.length>300)throw Error('장소 이름 형식 오류');clean[key]=value;
 }
 const hidden=data.hidden||{maps:[],events:[]};
 if(!Array.isArray(hidden.maps)||!hidden.maps.every(Number.isInteger)||!Array.isArray(hidden.events)||!hidden.events.every(x=>typeof x==='string'&&x.length<300))throw Error('숨김 목록 형식 오류');
 return {...data,placeNames:clean,hidden};
}
export async function checkedAnalysis(data,c){
 const wanted=new Set();
 const collect=x=>{if(typeof x==='string')wanted.add(x);else if(Array.isArray(x))x.forEach(collect);else if(x&&typeof x==='object')Object.values(x).forEach(collect);};collect(data);
 for(const item of data.items||[]){const v=item.value||{};if(v.actor_id)wanted.add(`actor:${v.actor_id}`);for(const ref of [...(v.sources||[]),...(v.changes||[])])wanted.add(`${ref.kind}:${ref.id}`);}
 for(const a of c.pkg.assets||[])if(wanted.has(a.logical_path))wanted.add(a.id);
 const index=await buildSources(c.pkg,c.game,c.maps,c.pkg.commons,c.db,{wanted});
 return checkResult(data,c.pkg.manifest.package_id,index);
}
