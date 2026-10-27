import {el,button,modal} from './dom.js';
import {loadImage} from '../rendering.js';
export async function imageViewer(pkg,pictures){
 const d=modal('이미지 전체 보기 — 개별 원본'),stage=el('div',null,d);stage.style.cssText='overflow:auto;max-height:65dvh;max-width:85vw';
 for(const p of Object.values(pictures))button(p.name,async()=>{
  stage.replaceChildren();const blob=await pkg.image('img/pictures/'+p.name);if(!blob){el('p','연결 자료에 이미지 없음',stage);return;}
  const img=await loadImage(blob);img.alt=p.name;img.style.cssText='max-width:100%;height:auto';stage.append(img);
  const zoom=el('input',null,stage);zoom.type='range';zoom.min=25;zoom.max=300;zoom.value=100;zoom.setAttribute('aria-label','이미지 확대율');zoom.oninput=()=>{img.style.maxWidth='none';img.style.width=zoom.value+'%';};
 },d);
 el('p','확대 후 이미지 영역을 스크롤하거나 터치로 이동하세요. 원본 장면 배치는 바뀌지 않습니다.',d);
}
export async function movieViewer(pkg,name){
 const d=modal('동영상 · '+name),blob=await pkg.image('movies/'+name);
 if(!blob){el('p','연결 자료에 동영상이 없습니다. 원본 게임 파일의 존재 여부는 확인하지 않았습니다.',d);return;}
 const video=el('video',null,d);video.controls=true;video.style.maxWidth='100%';
 const url=URL.createObjectURL(blob);video.src=url;
 video.onerror=()=>el('p','이 브라우저에서 코덱을 재생할 수 없거나 파일이 손상되었습니다. 대사는 계속 감상할 수 있습니다.',d);
 d.addEventListener('close',()=>{video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);});
}
