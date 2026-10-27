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
