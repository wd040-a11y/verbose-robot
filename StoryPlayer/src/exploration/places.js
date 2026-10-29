import {classify} from './catalog.js';
export async function indexPlaces(pkg,maps,common,progress=()=>{}){
 const result={};
 for(let i=0;i<maps.length;i++){
  const map=maps[i];try{
   const events=(await pkg.json(map.file)).events||[];let count=0;const contentEventIds=[];const text=[map.name||''];let uncertain=false;
   for(const event of events){text.push(event.raw_metadata?.name||'');let content=false;
    for(const page of event.pages||[]){const info=await classify(page,common);content ||= info.content;uncertain ||= info.unknown||info.warnings.length>0;text.push(...info.texts.map(t=>t.text||(t.choices||[]).join(' ')));}
    if(content){count++;contentEventIds.push(event.id);}
   }
   result[map.map_id]={count,contentEventIds,uncertain,text:text.join('\n').toLowerCase()};
  }catch(error){result[map.map_id]={count:null,uncertain:true,text:(map.name||'').toLowerCase(),error:error.message};}
  progress(i+1,maps.length);await new Promise(r=>setTimeout(r,0));
 }
 return result;
}
