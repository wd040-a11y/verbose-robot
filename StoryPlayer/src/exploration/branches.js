import {previewText} from '../presentation/text.js';
export function branchSummary(commands,start,indent){
 const paths=[[],[]];let side=0,end=start;
 for(;end<commands.length;end++){
  const r=commands[end].raw;
  if(r.indent<indent)break;
  if(r.indent===indent&&r.code===412)break;
  if(r.indent===indent&&r.code===411){side=1;continue;}
  paths[side].push(r);
 }
 const describe=rows=>{
  const text=rows.find(r=>[401,405].includes(r.code)&&String(r.parameters?.[0]||'').trim());
  const visuals=rows.some(r=>[231,232,235,261].includes(r.code));
  const linked=rows.some(r=>[117,112,113,413,118,119,115].includes(r.code));
  const choices=rows.some(r=>r.code===102);
  return {content:!!text||visuals||linked||choices,preview:text?previewText(text.parameters[0]).slice(0,60):visuals?'CG·영상 변화':linked?'연결된 원문 구간':choices?'선택지':'저장된 대사·CG 없음'};
 };
 return {paths:paths.map(describe),end};
}
