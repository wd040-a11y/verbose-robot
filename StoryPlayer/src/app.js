import {nativePackage} from './native-package.js';
import {placeName} from './localization/places.js';
import "./style.css";
import {indexPlaces} from "./exploration/places.js";
import {imageViewer,movieViewer} from "./ui/media.js";
import { StoryCursor } from "./exploration/player.js";
import { openStory, inspectPackage } from "./ui/story.js";
import { Package, importZip, library, get, put, removeGame } from "./storage.js";
import { Interpreter, initial, clone, selectPage, pageStatus } from "./core.js";
import { migrateState, seedMap } from "./state.js";
import { History } from "./core/history.js";
import { changes, describeChanges } from "./core/changes.js";
import { SceneRenderer } from "./rendering.js";
import { Dialogue } from "./presentation/dialogue.js";
import { classify, friendlyName, staticText } from "./exploration/catalog.js";
import { pagePlan } from "./exploration/conditions.js";
import { actorDatabase, database } from "./character/status.js";
import { buildSources } from "./enrichment/sources.js";
import { displayText, semanticLabel } from "./enrichment/manager.js";
import { previewPreset } from "./core/saves.js";
import {
  el,
  button,
  input,
  select,
  details,
  modal,
  paginate,
  download,
} from "./ui/dom.js";
import {
  statePanel,
  actorsPanel,
  resourcesPanel,
  analysisPanel,
  helpPanel,
} from "./ui/panels.js";
const root = document.querySelector("#app");
const c = {
  pkg: null,
  world: null,
  game: null,
  maps: [],
  events: [],
  infos: new Map(),
  enrichment: { items: {}, conflicts: [], failed: 0 },
  edits: [],
  index: null,
  session: null,
  currentMap: null,
  db: {},
  cancelIndex: false,
  archives: [],
  referenceIndex: [],
};
let language = "ko",
  activeTab = "감상",
  mobileView = "장소",
  mode = "story",
  eventPage = 0,
  auto = false,
  autoTimer,
  renderEpoch = 0;
const header = el("header", null, root),
  brand = el("div", null, header);
el("span", "RPG STORY PLAYER", brand, "eyebrow");
el("h1", "당신의 속도로, 이야기 속으로", brand);
const top = el("div", null, header, "top-controls"),
  gameFile = input(top, "게임 추출 ZIP", "file");
gameFile.accept = ".zip,application/zip";
const games = select(top, "등록된 게임", []);
if(window.localGames){
 window.localGames.progress(p=>c.status(`${p.stage} · ${p.current}/${p.total} · 오류 ${p.errors}`));
 button('게임 폴더 열기',()=>importOperation(async()=>{
  stopAuto();await archiveSession();
  let result=await window.localGames.importFolder();
  if(result?.candidates){const chosen=await new Promise(resolve=>{const d=modal('여러 게임 자료를 찾았습니다');let value=null;result.candidates.forEach((x,i)=>button(`${x.name} · ${x.engine} · 맵 ${x.maps}개 · ${x.path}`,()=>{value=i;d.close();},d));d.addEventListener('close',()=>resolve(value),{once:true});});if(chosen===null)return;result=await window.localGames.importFolder(chosen);}
  if(!result)return;
  const pkg=await importZip(nativePackage(result),(n,t)=>c.status(`감상 준비 ${n}/${t}`),undefined,{onDuplicate:duplicateChoice});
  await refreshGames();await load(pkg.id);
  if(result.report.asset_failures)c.status(`감상 준비 완료 · 미디어 ${result.report.asset_failures}개 처리 실패. 가능한 대사는 감상할 수 있습니다. 리소스 화면에서 확인하세요.`);
 }),top);
}
button("게임 관리", manageGames, top);
button("콘텐츠 접근성 검사",()=>c.pkg && inspectPackage(c.pkg),top);
const modeSelect = select(top, "감상 모드", [
    ["story", "스토리 감상 (기본)"],
    ["free", "원작 진행 재현 · 임시 상태 (고급)"],
    ["progress", "원작 진행 재현 · 저장 반영 (고급)"],
  ]),
  langSelect = select(top, "표시 언어", [
    ["original", "원문"],
    ["ko", "한국어"],
    ["both", "원문 + 한국어"],
  ]);
langSelect.value = "ko";
const status = el(
  "p",
  "게임 감상 ZIP을 불러오세요. CG가 포함된 패키지는 자동으로 연결됩니다.",
  root,
  "status",
);
status.setAttribute("role", "status");
const modeHelp = el(
  "p",
  "스토리 감상: 명령 실행 없이 원본 대사와 분기를 탐색합니다.",
  root,
  "mode-help",
);
const nav = el("nav", null, root, "main-nav"),
  screens = {};
for (const name of [
  "감상",
  "인물",
  "세계 상태",
  "기록",
  "리소스",
  "AI 분석",
  "도움말",
]) {
  button(name, () => openTab(name), nav);
  screens[name] = el("section", null, root, "screen");
  screens[name].hidden = name !== "감상";
}
const explore = screens["감상"],
  filters = el("div", null, explore, "explore-filters");
const timeline = select(filters, "시점과 엔딩", [
  ["all", "모든 시점 · 분석 전"],
]);
const globalSearch = input(filters, "게임 전체 장소 / 인물 / 대사 검색");
const placeFilter=select(filters,"장소 표시",[["content","감상 가능한 장소"],["all","전체 장소"]]);
placeFilter.onchange=()=>renderMaps();
const mobileNav = el("div", null, explore, "mobile-nav");
for (const v of ["장소", "장면", "재생"])
  button(v, () => setMobile(v), mobileNav);
const layout = el("div", null, explore, "explorer"),
  locations = el("section", null, layout, "locations"),
  scenes = el("section", null, layout, "scenes"),
  viewer = el("section", null, layout, "viewer");
el("h2", "장소", locations);
button("장소 이름 바꾸기",()=>{
 if(!c.currentMap)return c.status('먼저 장소를 선택하세요.');
 const d=modal('한국어 장소 이름');el('p',`원문: ${c.currentMap.name}`,d);
 const name=input(d,'표시할 장소 이름','text');name.value=c.placeNames[c.currentMap.map_id]||'';
 button('저장',async()=>{const value=name.value.trim();if(value)c.placeNames[c.currentMap.map_id]=value;else delete c.placeNames[c.currentMap.map_id];await put('meta','place-names:'+c.pkg.id,c.placeNames);renderMaps();d.close();},d);
},locations);
const mapList = el("div", null, locations);
el("h2", "인물과 장면", scenes);
const eventFilter = select(scenes, "장면 종류", [
  ["content", "감상 콘텐츠 전체"],
  ["dialogue", "대화가 있는 장면"],
  ["choices", "선택지가 있는 장면"],
  ["pictures", "CG · 영상 장면"],
  ["movies", "동영상 장면"],
  ["all", "모든 장면"],
  ["system", "시스템 / 자동 처리"],
]);
const eventList = el("div", null, scenes);
const title = el("h2", "보고 싶은 장면을 선택하세요", viewer),
  sessionBadge = el("small", "", viewer),
  scene = el("div", null, viewer, "scene");
scene.setAttribute("aria-label", "장면 CG");
scene.hidden = true;
const dialogueBox = el("div", null, viewer, "dialogue-viewport"),
  face = el("div", null, dialogueBox, "face"),
  dialogue = el(
    "div",
    "장소와 장면을 선택하고 감상하기를 누르세요.",
    dialogueBox,
    "dialogue",
  );
dialogue.setAttribute("aria-live", "polite");
const effectNotice = el("small", "", viewer, "effect-notice"),
  choices = el("div", null, viewer, "choices");
const toolbar = el("div", null, viewer, "playbar");
const previous = button(
    "이전",
    () => seek((c.session?.history.cursor || 0) - 1),
    toolbar,
  ),
  next = button("다음", () => advance(), toolbar),
  logButton = button("기록", () => openTab("기록"), toolbar),
  autoButton = button("자동", () => toggleAuto(), toolbar);
const playbackOptions = el("details", null, viewer, "playback-options");
el("summary", "감상 설정 / 실행 정보", playbackOptions);
const size = select(playbackOptions, "글자 크기", [
  ["22", "보통 글자"],
  ["28", "큰 글자"],
  ["34", "매우 큰 글자"],
]);
const speed = select(playbackOptions, "출력 속도", [
  ["normal", "순차 출력"],
  ["instant", "즉시 출력"],
]);
button(
  "일시 정지",
  () => {
    stopAuto();
    textPlayer.stop();
  },
  playbackOptions,
);
button(
  "대사 영역 확대",
  () => viewer.classList.toggle("expanded"),
  playbackOptions,
);
button("실행 전 상태 복원", () => rollback(), playbackOptions);
button("감상 결과를 기본 저장에 반영", () => commitSession(), playbackOptions);
button(
  "전체 이벤트 원문 (미실행 분기 포함)",
  () => showStatic(),
  playbackOptions,
);
button("지나간 CG 기록",()=>{if(!c.session)return;const d=modal("CG 감상 기록");for(const frame of c.session.history.runner.log.filter(x=>x.type==="visual"&&Object.keys(x.pictures).length))button("CG 열기",()=>imageViewer(c.pkg,frame.pictures),d);},playbackOptions);
button("CG 전체 보기",()=>c.session && imageViewer(c.pkg,c.session.history.runner.state.pictures),playbackOptions);
button("현재 동영상 열기",()=>c.session?.history.runner.state.storyMovie && movieViewer(c.pkg,c.session.history.runner.state.storyMovie),playbackOptions);
const pictureMode=select(playbackOptions,"CG 표시",[["auto","자동 맞춤"],["original","원본 장면"],["focus","CG 집중"]]);
pictureMode.onchange=()=>{renderer.mode=pictureMode.value;renderSession(true);};
const diagnostics = el("div", null, playbackOptions);
const renderer = new SceneRenderer(scene, face),
  textPlayer = new Dialogue(dialogue, effectNotice);
previous.disabled = next.disabled = true;
c.status = (t) => (status.textContent = t);
c.error = (t) => {
  status.textContent = "확인 필요: " + t;
  status.classList.add("error");
};
window.addEventListener("player-error", (e) => c.error(e.detail));
c.text = (id, raw) => displayText(c.enrichment, id, raw, language);
c.refreshNames = () => {
  renderMaps();
  renderEvents();
  renderTimeline();
};
c.saveEnrichment = async () => {
  await put("meta", "enrichment:" + c.pkg.id, c.enrichment);
};
c.ensureIndex = async () => {
  if (c.index) return c.index;
  c.cancelIndex = false;
  c.status("AI 분석 자료 준비 중 — 이미지는 포함하지 않습니다.");
  c.index = await buildSources(c.pkg, c.game, c.maps, c.pkg.commons, c.db, {
    progress: (n, t) => c.status(`분석 자료 준비 ${n}/${t} 맵`),
    cancelled: () => c.cancelIndex,
  });
  c.referenceIndex = Object.values(c.index)
    .filter((x) => x.kind === "command" && [111, 121, 122].includes(x.code))
    .flatMap((x) =>
      x.code === 111 && [0, 1].includes(x.parameters[0])
        ? [
            {
              kind: x.parameters[0] === 0 ? "switches" : "variables",
              id: x.parameters[1],
            },
          ]
        : [121, 122].includes(x.code)
          ? Array.from(
              {
                length: Math.min(10001, x.parameters[1] - x.parameters[0] + 1),
              },
              (_, i) => ({
                kind: x.code === 121 ? "switches" : "variables",
                id: x.parameters[0] + i,
              }),
            )
          : [],
    );
  c.status("분석 자료 준비 완료");
  return c.index;
};
c.editWorld = async (next, reason) => {
  stopAuto();
  await archiveSession();
  const patch = changes(c.world, next);
  c.edits.push({ reason, at: new Date().toISOString(), patch });
  c.edits = c.edits.slice(-100);
  c.world = migrateState(next);
  await saveWorld();
  await put("meta", "edits:" + c.pkg.id, c.edits);
  c.session = null;
  await clearPlayer();
  await renderEvents();
};
c.openEvent = async (id) => {
  await c.ensureIndex();
  const e = c.index[id];
  if (!e || e.kind !== "event") throw Error("장면 참조를 찾을 수 없습니다.");
  await chooseMap(c.maps.find((m) => m.map_id === e.map));
  openTab("감상");
  const event = c.events.find((x) => x.id === id);
  if (event) await watch(event);
};
c.renderSession = renderSession;
function stopAuto() {
  auto = false;
  clearTimeout(autoTimer);
  autoButton.textContent = "자동";
}
function toggleAuto() {
  auto = !auto;
  autoButton.textContent = auto ? "자동 중지" : "자동";
  if (auto) scheduleAuto();
  else clearTimeout(autoTimer);
}
function scheduleAuto() {
  clearTimeout(autoTimer);
  if (!auto) return;
  autoTimer = setTimeout(async () => {
    const w = c.session?.history.current?.display;
    if (!auto || !w) return;
    if (w.type === "text" && !textPlayer.running && !textPlayer.paused)
      await advance();
    if (auto && c.session?.history.current?.display.type === "text")
      scheduleAuto();
  }, 1200);
}
async function saveWorld() {
  if (c.pkg) await put("meta", "state:" + c.pkg.id, c.world);
}
async function archiveSession() {
  if (!c.session) return;
  const h = c.session.history;
  if (!h.points.length) return;
  const item = {
    id: c.session.id,
    name: title.textContent,
    temporary: c.session.temporary,
    ...h.archive(),
  };
  const at = c.archives.findIndex((a) => a.id === item.id);
  if (at >= 0) c.archives[at] = item;
  else c.archives.push(item);
  c.archives = c.archives.slice(-12);
  await put("meta", "history:" + c.pkg.id, c.archives);
}
function duplicateChoice(rows){return new Promise(resolve=>{
 const d=modal('이미 등록한 게임입니다');let result='cancel';
 el('p',`${rows[0].title} · 같은 패키지 ${rows.length}개. 교체하면 기존 감상 상태를 유지합니다.`,d);
 for(const [value,label] of [['replace','기존 게임 교체 · 저장 유지'],['keep','별도 버전으로 보관']])button(label,()=>{result=value;d.close();},d);
 d.addEventListener('close',()=>resolve(result),{once:true});
});}
async function manageGames(){
 const d=modal('게임 관리'),rows=await library();
 if(!rows.length)el('p','등록된 게임이 없습니다.',d);
 for(const row of rows){const box=el('article',null,d);el('h3',row.title,box);
 const duplicates=rows.filter(x=>x.manifest.package_id===row.manifest.package_id).length;
 el('p',`${row.manifest.engine} · ${row.created?.slice(0,10)||''} · ${row.maps}개 장소${duplicates>1?' · 같은 패키지 '+duplicates+'개':''}`,box);
 const keep=el('label',null,box),check=input(keep,'감상 상태 보관','checkbox');check.checked=true;el('span','삭제 후에도 저장·번역·기록 보관 (동일 패키지 재등록 시 복원)',keep);
 button('이 게임 삭제',async()=>{
 const confirm=modal('게임을 삭제할까요?');el('p',`${row.title}의 등록 데이터와 연결 미디어를 삭제합니다. 원본 게임 폴더와 가져온 ZIP 파일은 삭제하지 않습니다.`,confirm);
 button('삭제 확인',async()=>{
 if(c.pkg?.id===row.id){stopAuto();textPlayer.stop();await archiveSession();}
 await removeGame(row.id,{keepSaves:check.checked});confirm.close();d.close();
 const left=await refreshGames();
 if(c.pkg?.id===row.id){c.session=null;c.pkg=null;c.maps=[];c.events=[];c.currentMap=null;await clearPlayer();mapList.replaceChildren();eventList.replaceChildren();if(left.length)await load(left[0].id);else c.status('게임을 삭제했습니다. 새 게임을 추가하세요.');}
 },confirm);
 },box);
 }
}
async function refreshGames() {
  const rows = await library();
  games.replaceChildren();
  for (const r of rows) el("option", r.title, games).value = r.id;
  return rows;
}
async function load(id) {
  stopAuto();
  textPlayer.stop();
  const m = await get("meta", id);
  c.pkg = new Package(m);
  if(m.lazyArchive&&!m.nativeToken)c.status("대용량 ZIP 지연 로딩: 원본 ZIP을 보관하세요. 앱 재실행 후 다시 선택해야 합니다. 저장 상태는 유지됩니다.");
  c.session = null;
  c.index = null;
  c.infos.clear();
  c.events = [];
  c.currentMap = null;
  c.referenceIndex = [];
  c.placeNames = (await get("meta", "place-names:"+id)) || {};
  c.maps = await c.pkg.json("normalized/maps.json");
  c.game = await c.pkg.json("normalized/game.json");
  c.world = migrateState(
    (await get("meta", "state:" + id)) || initial(c.game.system),
  );
  c.enrichment = (await get("meta", "enrichment:" + id)) || {
    items: {},
    conflicts: [],
    failed: 0,
  };
  c.edits = (await get("meta", "edits:" + id)) || [];
  c.archives = (await get("meta", "history:" + id)) || [];
  c.registry = await c.pkg.plugins();
  c.pkg.assets = await c.pkg.json("normalized/assets.json");
  c.pkg.commons = await c.pkg.json("normalized/common_events.json");
  c.placeIndex=(await get("meta","places-v2:"+id)) || await indexPlaces(c.pkg,c.maps,common,(n,total)=>c.status(`장소 콘텐츠 확인 ${n}/${total}`));
  await put("meta","places-v2:"+id,c.placeIndex);
  c.db = await actorDatabase(c.pkg);
  c.db.Items = await database(c.pkg, "Items");
  const s = c.game.system.advanced || {};
  renderer.setSize(
    s.screenWidth || (m.manifest.engine === "VXACE" ? 544 : 816),
    s.screenHeight || (m.manifest.engine === "VXACE" ? 416 : 624),
  );
  games.value = id;
  await put("meta", "last-game", id);
  await clearPlayer();
  renderMaps();
  renderTimeline();
  eventList.replaceChildren();
  c.status(`${m.title} · 맵 ${c.maps.length}개 · 자유롭게 장소를 선택하세요.`);
  openTab("감상");
}
async function clearPlayer() {
  scene.hidden = true;
  renderer.layer.replaceChildren();
  face.replaceChildren();
  choices.replaceChildren();
  diagnostics.replaceChildren();
  previous.disabled = next.disabled = true;
  title.textContent = "보고 싶은 장면을 선택하세요";
  dialogue.textContent = "장소와 장면을 선택하고 감상하기를 누르세요.";
  sessionBadge.textContent = "";
}
function renderMaps() {
  mapList.replaceChildren();
  const query=globalSearch.value.toLowerCase();
  const rows=c.maps.filter(m=>{const info=c.placeIndex?.[m.map_id];return (placeFilter.value==='all'||!info||info.uncertain||info.count>0)&&(!query||((info?.text||m.name||'')+' '+placeName(m,c.placeNames,c.text('map:'+m.map_id,m.name)).text).toLowerCase().includes(query));});
  if(!rows.length&&c.maps.length)el('p','감상 콘텐츠가 확인된 장소가 없습니다. 전체 장소 또는 다른 검색어를 확인하세요.',mapList);
  let shown = 0;
  const more = button("장소 더 보기", appendMaps, mapList);
  function appendMaps() {
  for (const m of rows.slice(shown, shown + 100)) {
    const b = button(
      placeName(m,c.placeNames,c.text("map:"+m.map_id,m.name)).text+` · ${c.placeIndex?.[m.map_id]?.count ?? "미확정"}장면${c.placeIndex?.[m.map_id]?.uncertain ? " · 분석 미확정" : ""}`,
      () => chooseMap(m),
      mapList,
    );
    b.classList.toggle("selected", m === c.currentMap);
    b.dataset.mapId = m.map_id;
    const label=placeName(m,c.placeNames,c.text("map:"+m.map_id,m.name));
    b.title=`${label.source} · 원문: ${label.raw}`;
  }
  shown += Math.min(100, rows.length - shown);
  more.hidden = shown >= rows.length;
  more.textContent = `장소 더 보기 · ${shown}/${rows.length}개 표시`;
  mapList.append(more);
  }
  appendMaps();
  if (!c.maps.length) el("p", "게임을 먼저 선택하세요.", mapList);
}
async function common(id) {
  const row = c.pkg.commons.find((x) => x.id === `common_event:${id}`);
  return row ? (await c.pkg.json(row.file)).page : null;
}
async function chooseMap(m) {
  if (!m) return;
  c.currentMap = m;
  c.events = (await c.pkg.json(m.file)).events;
  eventPage = 0;
  c.infos.clear();
  for (const e of c.events) {
    const entries = await Promise.all(e.pages.map((p) => classify(p, common)));
    const info = {
      entries,
      dialogue:entries.some(x=>x.dialogue),choices:entries.some(x=>x.choices),pictures:entries.some(x=>x.pictures),movies:entries.some(x=>x.movies),
      content: entries.some((x) => x.content),
      category:
        entries.find((x) => x.content)?.category ||
        entries[0]?.category ||
        "미분류",
      texts: entries.flatMap((x) => x.texts),
    };
    c.infos.set(e.id, info);
  }
  renderMaps();
  await renderEvents();
  setMobile("장면");
}
async function renderEvents() {
  eventList.replaceChildren();
  if (!c.currentMap) return;
  const search = globalSearch.value.toLowerCase();
  let rows = c.events.filter(
    (e) =>
      !search ||
      JSON.stringify([e.raw_metadata.name, c.infos.get(e.id)?.texts])
        .toLowerCase()
        .includes(search) ||
      placeName(c.currentMap,c.placeNames,c.text("map:"+c.currentMap.map_id,c.currentMap.name)).text.toLowerCase().includes(search),
  );
  if (["content","dialogue","choices","pictures","movies"].includes(eventFilter.value))
    rows = rows.filter((e) => c.infos.get(e.id)?.[eventFilter.value]);
  if(!rows.length)el("p","이 장소에 검색 조건과 맞는 장면이 없습니다. 검색어를 지우거나 전체 이벤트를 확인하세요.",eventList);
  if (eventFilter.value === "system")
    rows = rows.filter((e) => !c.infos.get(e.id)?.content);
  paginate(
    eventList,
    rows,
    eventPage,
    (e, p) => {
      const info = c.infos.get(e.id),
        row = el("article", null, p, "event-card");
      const name = friendlyName(
        e,
        info,
        semanticLabel(c.enrichment, e.id) ||
          (language !== "original"
            ? c.enrichment.items?.["translation:" + e.id]?.value.text
            : null),
      );
      el("strong", name, row);
      const first=info.texts.find(t=>typeof t.text==='string'&&t.text.trim());
      if(first)el('p','미리보기: '+first.text.slice(0,160),row,'scene-preview');
      el('small',`${info.dialogue?'대화 · ':''}${info.choices?'선택지 · ':''}${info.pictures?'CG/영상 · ':''}감상 가능한 상황 ${info.entries.filter(x=>x.content).length}개`,row);
      const ctx = { map: c.currentMap.map_id, event: e.source.event_id },
        active = selectPage(e, c.world, ctx);
      el(
        "small",
        `${info.category} · ${active >= 0 ? "현재 조건에 맞는 장면 있음" : "조건 선택 필요"}${info.content ? "" : " · 대사 없는 처리일 수 있음"}`,
        row,
      );
      button("감상하기", () => watch(e), row, "primary");
      button("상황 선택", () => { if(mode!=="story") return conditionDialog(e); const d=modal("감상할 상황 선택");e.pages.forEach((p,i)=>button(`상황 ${i+1} · ${c.infos.get(e.id)?.entries[i]?.category||"미분류"}${c.infos.get(e.id)?.entries[i]?.content?"":" · 감상 콘텐츠 없음"}`,async()=>{d.close();await start(e,i,clone(c.world),true,["페이지 직접 감상 · 도달 가능성 미확정"]);},d)); }, row, "subtle");
      details(row, "고급 · 원본 식별 정보", {
        map: c.currentMap.map_id,
        event: e.id,
        name: e.raw_metadata.name,
        pages: e.pages.map((p, i) => ({
          page: i + 1,
          id: p.id,
          conditions: pageStatus(p, c.world, ctx),
        })),
      });
    },
    {
      size: 20,
      onPage: (n) => {
        eventPage = n;
        renderEvents();
      },
    },
  );
}
async function watch(e) {
  if (mode === "story") {
 const index=c.infos.get(e.id)?.entries.findIndex(x=>x.content) ?? -1;
 return start(e, Math.max(0,index),clone(c.world),true,["정적 감상: 세계 상태를 변경하지 않습니다. 조건은 경로를 직접 선택합니다."]);
 }
  const ctx = { map: c.currentMap.map_id, event: e.source.event_id },
    index = selectPage(e, c.world, ctx);
  if (index < 0) return conditionDialog(e);
  return start(e, index, clone(c.world), mode === "free", []);
}
function conditionDialog(e) {
  const d = modal("어떤 상황으로 감상할까요?");
  el(
    "p",
    "페이지 조건만 적용하며 내부 분기·공통 이벤트·스크립트 조건까지 해결한 것으로 보지 않습니다. 이 감상은 기본 저장을 바꾸지 않습니다.",
    d,
  );
  const s = select(
    d,
    "장면 상황",
    e.pages.map((p, i) => [
      String(i),
      `상황 ${i + 1} · ${pageStatus(p, c.world, { map: c.currentMap.map_id, event: e.source.event_id }).join(", ") || "페이지 조건 충족"}`,
    ]),
  );
  const box = el("div", null, d);
  const show = () => {
    box.replaceChildren();
    const plan = pagePlan(e, +s.value, c.world, {
      map: c.currentMap.map_id,
      event: e.source.event_id,
    });
    details(
      box,
      "적용할 조건과 변경값",
      describeChanges(plan.patch, c.game.system),
    );
    for (const w of plan.warnings) el("p", w, box);
  };
  s.onchange = show;
  show();
  button(
    "조건을 적용하여 감상",
    () => {
      const p = pagePlan(e, +s.value, c.world, {
        map: c.currentMap.map_id,
        event: e.source.event_id,
      });
      d.close();
      return start(e, +s.value, p.state, true, p.warnings);
    },
    d,
    "primary",
  );
  button(
    "특정 페이지 직접 감상",
    () => {
      d.close();
      return start(e, +s.value, clone(c.world), true, [
        "페이지 조건도 적용하지 않은 직접 감상입니다. 원작 진행 결과가 아닙니다.",
      ]);
    },
    d,
  );
}
async function start(e, index, state, temporary, warnings) {
  stopAuto();
  await archiveSession();
  textPlayer.stop();
  const ctx = { map: c.currentMap.map_id, event: e.source.event_id };
  if (state.map !== ctx.map) {
    temporary = true;
    state.map = ctx.map;
    state.player.positionKnown = false;
    warnings.push(
      "다른 장소로 즉시 접근한 자유 감상입니다. 플레이어 실제 좌표는 미확정입니다.",
    );
  }
  seedMap(state, { events: c.events }, ctx.map, selectPage);
  const ch = state.characters[`${ctx.map}:${ctx.event}`],
    image = e.pages[index].raw_metadata?.image;
  if (ch && image) {
    ch.characterName = image.characterName || "";
    ch.characterIndex = image.characterIndex || 0;
  }
  const runner = new (mode === "story" ? StoryCursor : Interpreter)({
    page: e.pages[index],
    state,
    context: ctx,
    engine: c.pkg.manifest.engine,
    common,
    plugins: c.registry,
  });
  c.session = {
    id: crypto.randomUUID(),
    event: e,
    page: e.pages[index],
    baseline: clone(c.world),
    temporary,
    staticStory: mode === "story",
    warnings,
    history: new History(runner),
  };
  title.textContent = friendlyName(
    e,
    c.infos.get(e.id),
    semanticLabel(c.enrichment, e.id) ||
      (language !== "original"
        ? c.enrichment.items?.["translation:" + e.id]?.value.text
        : null),
  );
  await c.session.history.next();
  setMobile("재생");
  await renderSession();
}
function translatedMessage(w) {
  if (!w.lineIds?.length) return w.text || "";
  const originals = String(w.text).split("\n");
  return w.lineIds.map((id, i) => c.text(id, originals[i] ?? "")).join("\n");
}
async function renderSession(instant = false) {
  if (!c.session) return;
  const epoch = ++renderEpoch,
    session = c.session,
    h = session.history,
    w = h.current.display;
  choices.replaceChildren();
  textPlayer.stop();
  sessionBadge.textContent = session.staticStory ? `스토리 감상 · 세계 상태 변경 없음 · 실행 효과 미확정 ${h.runner.fidelity.length}건` : session.temporary
    ? "자유 감상 · 기본 저장은 그대로"
    : "진행 모드 · 변경 상태 자동 저장";
  if (!session.temporary) {
    c.world = clone(h.runner.state);
    await saveWorld();
  }
  scene.hidden = Object.keys(h.runner.state.pictures).length === 0;
  await renderer.pictures(c.pkg, h.runner.state);
  await renderer.portrait(c.pkg, w.type === "text" ? w : null);
  if (epoch !== renderEpoch) return;
  previous.disabled = h.cursor <= 0;
  next.disabled = !["text", "yield", "transfer", "visual", "movie"].includes(w.type);
  diagnostics.replaceChildren();
  details(diagnostics, "원본 실행 정보 / 주의 사항", {
    command: w.command,
    context: w.context,
    warnings: session.warnings,
    fidelity: h.runner.fidelity,
    changes: describeChanges(
      changes(session.baseline, h.runner.state),
      c.game.system,
    ),
  });
  if (w.type === "text") {
    textPlayer
      .render(
        translatedMessage(w),
        {
          pkg: c.pkg,
          state: h.runner.state,
          actors: c.db.Actors,
          currency: c.game.system.currencyUnit || "",
          engine: c.pkg.manifest.engine,
        },
        {
          instant: instant || speed.value === "instant",
          fontSize: +size.value,
        },
      )
      .catch((e) => c.error(e.message));
  } else if (w.type === "choice") {
    stopAuto();
    dialogue.textContent = "어떻게 답할까요?";
    w.choices.forEach((text, i) =>
      button(
        c.text(`${w.command}:choice:${i}`, text),
        () => advance(i),
        choices,
        "choice",
      ),
    );
    if (w.cancel.mode !== "disabled")
      button("선택 취소", () => advance("cancel"), choices);
  } else if (w.type === "visual") {
    dialogue.textContent = w.action==="gallery"?"CG 장면":"장면";
  } else if (w.type === "movie") {
    dialogue.textContent="동영상 장면 · "+w.name;
    button("동영상 재생",()=>movieViewer(c.pkg,w.name),choices);
  } else if (w.type === "blocked") {
    stopAuto();
    dialogue.textContent = `이 장면은 호환 처리가 필요합니다.\n${w.message}\n다른 장면은 계속 감상할 수 있습니다.`;
    button("실행 전으로 복원", () => rollback(), choices);
    details(diagnostics, "중단 명령", w);
  } else if (w.type === "done") {
    stopAuto();
    const patch = changes(h.root, h.runner.state),
      seen = h.points.some((p) => p.display.type === "text"),
      pictures = Object.keys(h.runner.state.pictures).length > 0;
    dialogue.textContent = `장면 감상 완료${session.temporary ? " · 원래 상태 유지" : ""}\n${!seen && !pictures ? "이번 실행 경로에는 대사 또는 표시 중인 CG가 없습니다.\n" : ""}${describeChanges(patch, c.game.system).slice(0, 12).join("\n") || "표시할 상태 변경이 없습니다."}`;
    if (h.runner.fidelity.some((x) => x.kind === "simplification"))
      el(
        "small",
        "이동/시간 간소화 포함 — 원작과 같은 결과인지 미검증",
        choices,
      );
  } else {
    dialogue.textContent =
      w.type === "transfer"
        ? "장소 이동을 기록했습니다. 계속 진행할 수 있습니다."
        : "긴 이벤트를 나누어 처리 중입니다. 계속을 누르세요.";
  }
  await archiveSession();
  if (auto) scheduleAuto();
}
async function advance(answer) {
  if (!c.session) return;
  if (answer === undefined && textPlayer.running) {
    textPlayer.continue();
    return;
  }
  await c.session.history.next(answer);
  await renderSession();
}
async function seek(index) {
  stopAuto();
  if (!c.session || index < 0) return;
  c.session.history.seek(index);
  await renderSession(true);
}
async function rollback() {
  if (!c.session) return;
  stopAuto();
  await archiveSession();
  c.world = clone(c.session.baseline);
  await saveWorld();
  c.session = null;
  await clearPlayer();
  dialogue.textContent = "실행 전 상태를 복원했습니다.";
  await renderEvents();
}
function commitSession() {
  if (!c.session?.temporary || c.session.staticStory) return;
  const d = modal("감상 결과 반영 확인");
  details(
    d,
    "기본 저장에 반영할 차이",
    describeChanges(
      changes(c.world, c.session.history.runner.state),
      c.game.system,
    ),
  );
  el(
    "p",
    "조건 조작이나 미지원 중단이 포함된 결과는 정상적인 원작 도달 상태로 검증된 것이 아닙니다.",
    d,
  );
  button(
    "이 결과를 기본 저장에 반영",
    async () => {
      const next = clone(c.session.history.runner.state);
      await c.editWorld(next, "자유 감상 결과 명시적 반영");
      d.close();
    },
    d,
  );
}
function showStatic() {
  if (!c.session) return;
  return openStory(c.session.event,common,c.pkg);
}
async function historyPanel() {
  const parent = screens["기록"];
  parent.replaceChildren();
  el("h2", "대화 기록", parent);
  el(
    "p",
    "현재 감상의 기록을 선택하면 대사뿐 아니라 게임 상태·CG·선택지도 그 시점으로 복원합니다. 종료한 감상 기록은 열람용입니다.",
    parent,
  );
  const search = input(parent, "기록 검색");
  const list = el("div", null, parent);
  const h = c.session?.history;
  function render() {
    list.replaceChildren();
    if (h)
      for (const [i, p] of h.points.slice(0, h.cursor + 1).entries()) {
        if (p.selected)
          el("p", "선택: " + p.selected.text, list, "choice-record");
        if (
          p.display.type === "text" &&
          p.display.text.toLowerCase().includes(search.value.toLowerCase())
        )
          button(
            p.display.text,
            async () => {
              await seek(i);
              openTab("감상");
              setMobile("재생");
            },
            list,
            "log-entry",
          );
      }
    if (h)
      details(
        list,
        "다른 선택으로 갈라진 기록 (별도 경로)",
        h.branches.map((b) => ({
          from: b.at,
          dialogue: b.points
            .filter((p) => p.display.type === "text")
            .map((p) => p.display.text),
        })),
      );
  }
  search.oninput = render;
  render();
  button(
    "대화 기록 텍스트 내보내기",
    () => download("dialogue-log.txt", h?.text() || "", "text/plain"),
    parent,
  );
  button(
    "분기별 기록 JSON 내보내기",
    () => download("dialogue-history.json", h?.archive() || c.archives),
    parent,
  );
  for (const item of c.archives
    .filter((x) => x.id !== c.session?.id)
    .slice()
    .reverse()) {
    const d = details(
      parent,
      `${item.name} · ${item.temporary ? "자유 감상" : "진행"} · ${item.created}`,
      item.points
        .filter((p) => p.display.type === "text")
        .map((p) => p.display.text)
        .join("\n\n"),
    );
    button(
      "이 기록의 끝 상태와 비교",
      () => {
        const end = clone(item.root);
        for (const point of item.points.slice(0, item.cursor + 1))
          for (const change of point.patch) {
            let o = end;
            for (const key of change.path.slice(0, -1)) o = o[key] ??= {};
            if (change.after === undefined) delete o[change.path.at(-1)];
            else o[change.path.at(-1)] = clone(change.after);
          }
        const m = modal("저장 상태 비교");
        details(
          m,
          "현재 기본 저장 → 이 감상 끝 상태",
          describeChanges(changes(c.world, end), c.game.system),
        );
      },
      d,
    );
  }
}
function renderTimeline() {
  const previous = timeline.value;
  timeline.replaceChildren();
  el("option", "모든 시점", timeline).value = "all";
  for (const [key, x] of Object.entries(c.enrichment.items || {}).filter(
    ([, x]) => ["timeline", "ending"].includes(x.type),
  )) {
    el(
      "option",
      `${x.type === "ending" ? "엔딩 후보" : x.value.axis === "clock" ? "게임 시간" : "스토리 시점"} · ${x.value.text}${x.reviewed ? "" : " (미검토)"}`,
      timeline,
    ).value = key;
  }
  timeline.value = previous || "all";
  if (!timeline.value) timeline.value = "all";
}
timeline.onchange = async () => {
  if (timeline.value === "all") return;
  await c.ensureIndex();
  const x = c.enrichment.items[timeline.value],
    d = modal(x.value.text);
  el(
    "p",
    `${x.reviewed ? "사용자가 근거를 검토한 분석" : "미검토 후보"} · 원작 도달 가능성은 별도 검증이 필요합니다.`,
    d,
  );
  details(d, "근거 / 미확정 사항", {
    evidence: x.evidence,
    uncertainties: x.uncertainties,
    confidence: x.confidence,
  });
  const preset = c.enrichment.items["preset:" + x.target_id];
  for (const id of x.value.event_ids || [])
    button(
      c.index[id]?.text || "연결 장면",
      async () => {
        const ref = c.index[id];
        await chooseMap(c.maps.find((m) => m.map_id === ref.map));
        const event = c.events.find((e) => e.id === id);
        if (!event) throw Error("장면을 찾을 수 없습니다.");
        if (preset) {
          const plan = previewPreset(c.world, preset.value.changes),
            p = modal("프리셋으로 자유 감상");
          details(p, "변경값", describeChanges(plan.patch, c.game.system));
          button(
            "임시 상태에 적용하여 감상",
            async () => {
              p.close();
              d.close();
              openTab("감상");
              const idx = selectPage(event, plan.state, {
                map: ref.map,
                event: ref.event_id,
              });
              if (idx < 0) return conditionDialog(event);
              await start(event, idx, plan.state, true, [
                "분석 프리셋으로 직접 접근한 감상입니다.",
              ]);
            },
            p,
          );
        } else {
          d.close();
          openTab("감상");
          const idx = selectPage(event, c.world, {
            map: ref.map,
            event: ref.event_id,
          });
          if (idx < 0) return conditionDialog(event);
          await start(event, idx, clone(c.world), true, [
            "시점/엔딩 후보에 직접 접근한 자유 감상입니다.",
          ]);
        }
      },
      d,
    );
};
async function openTab(name) {
  activeTab = name;
  for (const [key, screen] of Object.entries(screens))
    screen.hidden = key !== name;
  if (name !== "감상") stopAuto();
  if (name === "도움말") return helpPanel(screens[name]);
  if (!c.pkg) {
    if (name !== "감상") {
      screens[name].replaceChildren();
      el("p", "먼저 게임 추출 ZIP을 불러오세요.", screens[name]);
    }
    return;
  }
  if (name === "인물") await actorsPanel(screens[name], c);
  if (name === "세계 상태") statePanel(screens[name], c);
  if (name === "기록") await historyPanel();
  if (name === "리소스") await resourcesPanel(screens[name], c);
  if (name === "AI 분석") await analysisPanel(screens[name], c);
}
function setMobile(v) {
  mobileView = v;
  layout.dataset.mobile = v;
  if(matchMedia("(max-width: 850px)").matches) layout.scrollIntoView({block:"start"});
}
let importBusy=false;
async function importOperation(action){
 if(importBusy)return;
 importBusy=true;
 const controls=[...top.querySelectorAll('button,input,select')];
 controls.forEach(x=>x.disabled=true);
 try{return await action();}finally{importBusy=false;controls.forEach(x=>x.disabled=false);gameFile.value='';}
}
gameFile.onchange = () => importOperation(async () => {
  try {
    stopAuto();await archiveSession();
    status.classList.remove("error");
    const p = await importZip(gameFile.files[0], (n, t) =>
      c.status(`게임 자료 읽는 중 ${n}/${t}`), undefined, {onDuplicate:duplicateChoice}
    );
    await refreshGames();
    await load(p.id);
  } catch (e) {
    c.error(
      e.name === "QuotaExceededError"
        ? "저장 공간이 부족합니다. 브라우저 공간을 확인하고 작은 리소스 묶음부터 추가하세요."
        : e.message,
    );
  } finally {
    gameFile.value = "";
  }
});
games.onchange = () => load(games.value).catch((e) => c.error(e.message));
langSelect.onchange = async () => {
  language = langSelect.value;
  c.refreshNames();
  await renderSession(true);
};
modeSelect.onchange = async () => {
  stopAuto();
  await archiveSession();
  c.session = null;
  mode = modeSelect.value;
  modeHelp.textContent =
    mode === "story" ? "스토리 감상: 명령 실행 없이 원본 대사와 분기를 탐색합니다." : mode === "free"
      ? "자유 감상: 원래 저장 상태에 영향을 주지 않습니다."
      : "진행 모드: 장면의 상태 변경을 기본 저장에 반영합니다. 이전 버튼은 기본 상태도 복원합니다.";
  await clearPlayer();
};
globalSearch.oninput = () => {
  renderMaps();
  renderEvents();
};
eventFilter.onchange = () => {
  eventPage = 0;
  renderEvents();
};
size.onchange = speed.onchange = () => renderSession(true);
document.addEventListener("keydown", (e) => {
  if (
    ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName) ||
    document.querySelector("dialog[open]") ||
    activeTab !== "감상"
  )
    return;
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    seek((c.session?.history.cursor || 0) - 1);
  }
  if (e.key === "ArrowRight" || e.code === "Space") {
    e.preventDefault();
    if (c.session?.history.current?.display.type !== "choice") advance();
  }
  if (e.key.toLowerCase() === "l") openTab("기록");
});
setMobile("장소");
refreshGames()
  .then(async (rows) => {
    const last = await get("meta", "last-game");
    if (rows.length)
      await load(rows.find((x) => x.id === last)?.id || rows[0].id);
  })
  .catch((e) => c.error(e.message));
