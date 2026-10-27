import {auditPage} from '../exploration/access-audit.js';
import {Interpreter,initial} from '../core.js';
import {loadImage} from '../rendering.js';
import {storyPage,auditContent} from '../exploration/story.js';
import {el,button,details,modal,download} from './dom.js';
export async function openStory(event, common, pkg) {
  const d=modal('스토리 감상 · 원본 분기 탐색');
  el('p','명령을 실행하지 않습니다. 각 페이지와 분기는 서로 다른 상황입니다. 아래 순서를 실제 진행 경로로 간주하지 마세요. 변수·스크립트로 생성되는 내용은 확정하지 않습니다.',d);
  function render(tree,parent){
    details(parent,'페이지 조건 · 실행하지 않음',tree.conditions||{});
    for(const n of tree.nodes){
      if(n.kind==='command')continue;
      const box=el('section',null,parent);box.style.marginLeft=`${Math.min(n.indent,8)*12}px`;
      if(n.kind==='dialogue')el('p',n.parameters[0],box);
      else if(n.kind==='choices'){el('strong','선택지 — 각 분기는 아래에서 따로 확인',box);for(const text of n.parameters[0]||[])el('p',text,box);}
      else if(n.kind==='branch')details(box,`분기 경계 · 명령 ${n.code} · 깊이 ${n.indent}`,n.parameters);
      else if(n.kind==='picture') {
        details(box,`CG 참조 · ${n.parameters[1]??n.parameters[0]} · 명령 ${n.code}`,n.parameters);
        if(n.code===231) button('이 CG 보기',async()=>{
          const blob=await pkg.image('img/pictures/'+n.parameters[1]);
          if(!blob){el('p','이미지 미등록 — 리소스 ZIP을 추가한 뒤 다시 열어 주세요.',box);return;}
          const image=await loadImage(blob);image.alt=n.parameters[1];image.style.maxWidth='100%';box.append(image);
        },box);
      }
      else if(n.kind==='unresolved')details(box,'실행하지 않은 플러그인/스크립트 · 이후 내용의 연결은 미확정',n.parameters);
      else if(n.kind==='common'){const sub=el('details',null,box);el('summary',`공통 이벤트 ${n.parameters[0]} · 별도 원본`,sub);if(n.content)render(n.content,sub);else el('p',n.warning,sub);}
    }
  }
  for(let i=0;i<event.pages.length;i++){const section=el('details',null,d);el('summary',`페이지 ${i+1} — 독립된 조건`,section);render(await storyPage(event.pages[i],common),section);}
  button('이 이벤트 콘텐츠 검사 JSON',async()=>download('content-audit.json',await auditContent(event.pages,common)),d);
}

export async function inspectPackage(pkg) {
 const d=modal('게임 전체 콘텐츠 접근성 검사'), status=el('p','검사 준비 중',d), pages=[];
 const common=async id=>{const row=pkg.commons.find(x=>x.id===`common_event:${id}`);return row?(await pkg.json(row.file)).page:null;};
 for(const map of await pkg.json("normalized/maps.json"))for(const event of (await pkg.json(map.file)).events||[])for(const page of event.pages)pages.push({...page,auditContext:{map:map.map_id,event:event.source.event_id}});
 const report={schema_version:'1.0.0',package_id:pkg.manifest.package_id,pages:[],counts:{},causes:{},effect_causes:{},dialoguePages:0,original_folder_checked:false};
 const cache=new Map();
 const resource=async path=>{
  if(cache.has(path))return cache.get(path);
  const blob=await pkg.image(path);let result={status:'missing'};
  if(blob){result={status:'unverified',mime:blob.type,reason:'codec_or_decode_unverified'};
   if(blob.type.startsWith('image/'))try{await loadImage(blob);result={status:'decoded',mime:blob.type};}catch{result={status:'invalid',reason:'image_decode_failed'};}
  }
  cache.set(path,result);return result;
 };
 for(let i=0;i<pages.length;i++){
  const page=await auditPage(pages[i],{common,resource,progress:async(paths,pending)=>{status.textContent=`페이지 ${i+1}/${pages.length} · 검사 경로 ${paths} · 대기 ${pending}`;await new Promise(r=>setTimeout(r,0));}});
  for(const effect of page.uncertain_effects)report.effect_causes[effect.reason]=(report.effect_causes[effect.reason]||0)+1;
  report.pages.push(page);if(page.contents.some(c=>c.kind==='dialogue'))report.dialoguePages++;
  for(const [k,v] of Object.entries(page.counts))report.counts[k]=(report.counts[k]||0)+v;
  for(const [k,v] of Object.entries(page.causes))report.causes[k]=(report.causes[k]||0)+v;
 }
 status.textContent=`검사 완료 · ${pages.length}페이지 · 미확정 항목은 성공으로 집계하지 않았습니다.`;
 report.policy='페이지당 최대 128경로 / 경로당 2000 표시 경계. 모든 경로 도달 가능성이나 원작 실행 재현을 보장하지 않음. 원본 폴더 미검사. 미디어 바이너리·암호화 키 제외.';
 details(d,'검사 결과',report);button('보고서 저장',()=>download('package-content-audit.json',report),d);
}
