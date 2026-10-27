import { migrateState, seedMap } from "./state.js";
import { SceneRenderer, loadImage } from "./rendering.js";
import "./style.css";
import { Package, importZip, library, get, put } from "./storage.js";
import { initial, clone, selectPage, pageStatus, Interpreter } from "./core.js";
const root = document.querySelector("#app");
let pkg,
  state,
  maps = [],
  events = [],
  currentMap,
  runner,
  temporary = false,
  baseline,
  urls = [],
  lastMessage = null,
  currentEventName = "",
  registry;
function node(tag, text, parent = root) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  parent.append(e);
  return e;
}
function button(text, fn, parent = root) {
  const b = node("button", text, parent);
  b.onclick = async () => {
    try {
      await fn();
    } catch (e) {
      status.textContent = e.message;
    }
  };
  return b;
}
node("h1", "RPG Story Player 0.2.0");
node("p", "로컬 이벤트 재생 · 게임 데이터는 서버로 전송하지 않습니다.");
const top = node("section"),
  status = node("p", "추출 ZIP을 불러오세요.");
const input = node("input", undefined, top);
input.type = "file";
input.accept = ".zip,application/zip,application/x-zip-compressed";
input.setAttribute("aria-label", "추출 패키지 ZIP");
const select = node("select", undefined, top);
select.setAttribute("aria-label", "게임 선택");
select.onchange = () =>
  load(select.value).catch((e) => (status.textContent = e.message));
button("리소스 ZIP 추가", () => resource.click(), top);
const resource = node("input", undefined, top);
resource.type = "file";
resource.accept = ".zip,application/zip,application/x-zip-compressed";
resource.hidden = true;
const nav = node("nav");
nav.setAttribute("aria-label", "화면 이동");
const grid = node("main"),
  left = node("section", undefined, grid),
  middle = node("section", undefined, grid),
  right = node("section", undefined, grid);
node("h2", "장소", left);
const search = node("input", undefined, left);
search.placeholder = "맵 이름 / ID";
const mapList = node("div", undefined, left);
node("h2", "이벤트", middle);
const eventList = node("div", undefined, middle);
node("h2", "재생", right);
const eventTitle = node("h3", "이벤트를 선택하세요", right);
right.className = "player-panel";
const scene = node("div", undefined, right),
  dialog = node("div", "", right),
  controls = node("div", undefined, right);
scene.setAttribute("aria-label", "CG 표시 영역");
const face = node("div", undefined, right);
face.className = "face";
right.insertBefore(face, dialog);
dialog.className = "dialogue";
controls.className = "play-controls";
const renderer = new SceneRenderer(scene, face);
const tools = node("section");
node("h2", "상태와 기록", tools);
const gallery = node("section");
node("h2", "이미지 연결 / 미리보기", gallery);
const resourceSummary = node(
  "p",
  "리소스 ZIP을 추가하면 연결 결과를 확인할 수 있습니다.",
  gallery,
);
const resourceDetails = node("details", undefined, gallery);
node("summary", "파일별 연결 결과", resourceDetails);
const resourceReport = node("pre", "", resourceDetails);
const imageSearch = node("input", undefined, gallery);
imageSearch.placeholder = "이미지 이름 / 경로 검색";
const imageList = node("div", undefined, gallery),
  imagePreview = node("div", undefined, gallery);
imagePreview.className = "image-preview";
imageSearch.oninput = () => renderGallery();
for (const [label, target] of [
  ["장소", left],
  ["이벤트", middle],
  ["재생", right],
  ["이미지", gallery],
  ["상태", tools],
])
  button(
    label,
    () => target.scrollIntoView({ behavior: "smooth", block: "start" }),
    nav,
  );
const actorPanel = node("details", undefined, tools);
node("summary", "변경된 액터 그래픽", actorPanel);
const actorList = node("div", undefined, actorPanel);

const type = node("select", undefined, tools);
for (const v of ["switches", "variables", "self", "items", "party"]) {
  const o = node(
    "option",
    {
      switches: "스위치",
      variables: "변수",
      self: "셀프 스위치",
      items: "아이템",
      party: "파티",
    }[v],
    type,
  );
  o.value = v;
}
const stateSearch = node("input", undefined, tools);
stateSearch.placeholder = "ID 또는 이름 검색";
const editor = node("div", undefined, tools);
const snapshotName = node("input", undefined, tools);
snapshotName.placeholder = "스냅샷 이름";
const snapshots = node("select", undefined, tools);
button(
  "스냅샷 저장",
  async () => {
    if (!pkg) return;
    const list = (await get("meta", "snapshots:" + pkg.id)) || [];
    list.push({
      id: crypto.randomUUID(),
      name: snapshotName.value || new Date().toLocaleString(),
      state: clone(state),
    });
    await put("meta", "snapshots:" + pkg.id, list);
    await refreshSnapshots();
  },
  tools,
);
button(
  "스냅샷 복원",
  async () => {
    const list = (await get("meta", "snapshots:" + pkg.id)) || [];
    const v = list.find((x) => x.id === snapshots.value);
    if (v) {
      runner = null;
      temporary = false;
      state = migrateState(clone(v.state));
      await save();
      await showEvents();
      renderState();
      await resetPresentation();
      dialog.textContent = "세계 상태 복원 완료";
    }
  },
  tools,
);
button(
  "실행 전으로 되돌리기",
  async () => {
    if (baseline) {
      state = clone(baseline);
      runner = null;
      temporary = false;
      await save();
      renderState();
      await showEvents();
      await resetPresentation();
      dialog.textContent = "실행 전 상태를 복원했습니다.";
    }
  },
  tools,
);
button(
  "현재 실행 중단",
  async () => {
    runner = null;
    controls.replaceChildren();
    dialog.textContent =
      "중단됨. 이미 적용한 상태는 되돌리기로 복원할 수 있습니다.";
  },
  tools,
);
button(
  "실행 기록 내보내기",
  () => {
    if (!runner) return;
    const u = URL.createObjectURL(
      new Blob([JSON.stringify(runner.log, null, 2)], {
        type: "application/json",
      }),
    );
    const a = node("a", "기록 다운로드", tools);
    a.href = u;
    a.download = "event-log.json";
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(u);
      a.remove();
    }, 1000);
  },
  tools,
);
async function refreshLibrary() {
  const list = await library();
  select.replaceChildren();
  for (const p of list) {
    const o = node("option", p.title, select);
    o.value = p.id;
  }
  return list;
}
async function save() {
  if (pkg && !temporary) await put("meta", "state:" + pkg.id, state);
}
async function refreshSnapshots() {
  snapshots.replaceChildren();
  for (const s of (await get("meta", "snapshots:" + pkg.id)) || []) {
    const o = node("option", s.name, snapshots);
    o.value = s.id;
  }
}
async function load(id) {
  const m = await get("meta", id);
  pkg = new Package(m);
  runner = null;
  temporary = false;
  currentMap = null;
  baseline = null;
  eventList.replaceChildren();
  dialog.textContent = "맵과 이벤트를 선택하세요.";
  controls.replaceChildren();
  renderer.layer.replaceChildren();
  face.replaceChildren();
  lastMessage = null;
  maps = await pkg.json("normalized/maps.json");
  const game = await pkg.json("normalized/game.json");
  state = migrateState(
    (await get("meta", "state:" + id)) || initial(game.system),
  );
  registry = await pkg.plugins();
  const screen = game.system.advanced || {};
  renderer.setSize(
    screen.screenWidth || (pkg.manifest.engine === "VXACE" ? 544 : 816),
    screen.screenHeight || (pkg.manifest.engine === "VXACE" ? 416 : 624),
  );
  pkg.assets = await pkg.json("normalized/assets.json");
  pkg.commons = await pkg.json("normalized/common_events.json");
  renderMaps();
  renderState();
  await renderGallery();
  await showResourceReport();
  await refreshSnapshots();
  status.textContent = `${m.title} · ${m.manifest.engine} · 맵 ${maps.length} · 이벤트 ${m.events} · 이미지는 선택 사항`;
}
function renderMaps() {
  mapList.replaceChildren();
  for (const m of maps.filter((x) =>
    (x.name + " " + x.map_id)
      .toLowerCase()
      .includes(search.value.toLowerCase()),
  ))
    button(
      `${m.map_id} · ${m.name || "(이름 없음)"}`,
      async () => {
        currentMap = m;
        await showEvents();
      },
      mapList,
    );
}
search.oninput = renderMaps;
async function showEvents() {
  eventList.replaceChildren();
  if (!currentMap) return;
  const shard = await pkg.json(currentMap.file);
  events = shard.events;
  for (const e of events) {
    const ctx = { map: currentMap.map_id, event: e.source.event_id };
    const active = selectPage(e, state, ctx);
    const row = node("article", undefined, eventList);
    node(
      "strong",
      `${e.source.event_id} · ${e.raw_metadata.name || e.id}`,
      row,
    );
    node(
      "small",
      active < 0 ? "현재 조건 불충족" : `활성 페이지 ${active + 1}`,
      row,
    );
    if (active >= 0)
      button("일반 실행", () => start(e, active, false, ctx), row);
    const pages = node("select", undefined, row);
    e.pages.forEach((p, i) => {
      const o = node(
        "option",
        `페이지 ${i + 1} — ${pageStatus(p, state, ctx).join(", ") || "조건 충족"}`,
        pages,
      );
      o.value = i;
    });
    button(
      "임시 상태로 강제 감상",
      () => start(e, +pages.value, true, ctx),
      row,
    );
  }
}
async function start(e, i, force, ctx) {
  baseline = clone(state);
  currentEventName = `${e.raw_metadata.name || e.id} · 페이지 ${i + 1}`;
  eventTitle.textContent = currentEventName;
  temporary = force;
  runner = new Interpreter({
    page: e.pages[i],
    state: seededState(e, i, ctx),
    plugins: registry,
    context: ctx,
    engine: pkg.manifest.engine,
    common: async (id) => {
      const c = pkg.commons.find((x) => x.id === `common_event:${id}`);
      return c ? (await pkg.json(c.file)).page : null;
    },
  });
  await advance();
}
async function advance(answer) {
  if (!runner) return;
  const active = runner;
  let w = await active.advance(answer);
  if (runner !== active) return;
  controls.replaceChildren();
  state = temporary ? state : clone(active.state);
  await save();
  renderState();
  await pictures(active.state);
  status.textContent = temporary
    ? "임시 감상 — 기본 세계 상태 유지"
    : "일반 진행 — 변경 상태 자동 저장";
  dialog.className =
    w.type === "blocked"
      ? "dialogue blocked"
      : w.type === "choice"
        ? "dialogue choice-prompt"
        : "dialogue";
  lastMessage = w.type === "text" ? w : null;
  await renderer.portrait(pkg, lastMessage);
  if (w.type === "text") {
    dialog.textContent =
      (w.speaker ? w.speaker + "\n" : "") +
      String(w.text).replace(/\\V\[(\d+)\]/gi, (_, id) =>
        String(active.state.variables[id] ?? 0),
      );
    button("다음", () => advance(), controls);
  } else if (w.type === "choice") {
    dialog.textContent = "선택하세요";
    w.choices.forEach((c, i) => {
      const b = button(c, () => advance(i), controls);
      if (i === w.defaultIndex) b.focus();
    });
    if (w.cancel.mode !== "disabled")
      button("취소 선택", () => advance("cancel"), controls);
  } else if (w.type === "blocked") {
    dialog.textContent = `이 이벤트 실행 중단\n${currentEventName}\n${w.message}\n다른 이벤트는 계속 선택할 수 있습니다.`;
    const details = node("details", undefined, dialog);
    node("summary", "명령 위치와 상태 변경 상세", details);
    node(
      "pre",
      JSON.stringify(
        {
          command: w.command,
          raw: w.raw,
          context: w.context,
          changes: w.changes,
          before: baseline,
          after: active.state,
        },
        null,
        2,
      ),
      details,
    );
    button(
      "실행 전 상태 복원",
      async () => {
        state = clone(baseline);
        runner = null;
        temporary = false;
        await save();
        renderState();
        await showEvents();
        await resetPresentation();
        dialog.textContent = "실행 전 상태를 복원했습니다.";
      },
      controls,
    );
  } else if (w.type === "done") {
    dialog.textContent = active.fidelity.some(
      (x) => x.kind === "simplification",
    )
      ? "이벤트 종료 — 이동/시간 간소화 포함 (원작 결과 동일성 미검증)"
      : "이벤트 종료";
    if (temporary)
      button(
        "감상 결과를 기본 세계에 반영",
        async () => {
          state = clone(active.state);
          temporary = false;
          await save();
          renderState();
          await showEvents();
        },
        controls,
      );
    await showEvents();
  } else if (w.type === "transfer") {
    dialog.textContent = `게임 위치가 맵 ${w.map}로 변경됐습니다. 자동/병렬 이벤트는 수동 실행 정책입니다.`;
    button("계속", () => advance(), controls);
  } else {
    dialog.textContent = "연속 실행 한도에 도달해 일시 정지했습니다.";
    button("계속", () => advance(), controls);
  }
}
function seededState(event, index, ctx) {
  const copy = migrateState(clone(state));
  seedMap(copy, { events }, ctx.map, selectPage);
  // Force viewing changes page graphics only in the isolated execution copy.
  const c = copy.characters[`${ctx.map}:${ctx.event}`];
  const image = event.pages[index].raw_metadata?.image;
  if (c && image && c.page !== event.pages[index].id)
    Object.assign(c, {
      direction: image.direction ?? 2,
      directionKnown: true,
      characterName: image.characterName || "",
      characterIndex: image.characterIndex || 0,
    });
  return copy;
}
async function resetPresentation() {
  controls.replaceChildren();
  lastMessage = null;
  await renderer.portrait(pkg, null);
  await pictures(state);
}
async function pictures(s) {
  await renderer.pictures(pkg, s);
  renderActors(s);
}
function renderActors(s) {
  actorList.replaceChildren();
  for (const [id, g] of Object.entries(s.actorGraphics || {})) {
    const row = node("div", undefined, actorList);
    node(
      "p",
      `액터 ${id}: ${g.characterName} / 얼굴 ${g.faceName} [${g.faceIndex}]`,
      row,
    );
    button("얼굴 미리보기", () => previewImage("img/faces/" + g.faceName), row);
  }
}
async function showResourceReport() {
  const r =
    pkg.lastResourceImport || (await get("meta", "resource-report:" + pkg.id));
  if (!r) {
    resourceSummary.textContent =
      "이미지는 선택 사항입니다. 연결된 이미지는 아래에서 미리 볼 수 있습니다.";
    resourceReport.textContent = "";
    return;
  }
  resourceSummary.textContent = `이미지 연결 결과 · 검사 ${r.scanned}개 · 정상 연결 ${r.matched}개 · 참조 대상 없음 ${r.noReference || 0}개 · 형식 오류 ${r.invalid || 0}개 · 모호/중복 ${r.ambiguous || 0}개`;
  resourceReport.textContent = (r.files || [])
    .map((x) => `${x.status} | ${x.path} | ${x.reason || x.logical || ""}`)
    .join("\n");
}
let galleryRevision = 0;
async function renderGallery() {
  const rev = ++galleryRevision;
  imageList.replaceChildren();
  if (!pkg?.assets) return;
  const found = pkg.assets.filter(
    (a) =>
      a.category === "images" &&
      `${a.logical_path} ${a.source_path}`
        .toLowerCase()
        .includes(imageSearch.value.toLowerCase()),
  );
  node(
    "small",
    `${found.length}개 중 최대 60개 표시. 검색으로 범위를 좁힐 수 있습니다.`,
    imageList,
  );
  for (const a of found.slice(0, 60)) {
    const blob = await pkg.image(a.logical_path);
    if (rev !== galleryRevision) return;
    const row = node("div", undefined, imageList);
    row.className = "image-row";
    node("small", `${blob ? "연결됨" : "미등록"} · ${a.logical_path}`, row);
    const details = node("details", undefined, row);
    node("summary", "원본 참조 / 연결 이벤트", details);
    node(
      "pre",
      JSON.stringify(
        {
          source: a.source_path,
          output: a.output_path,
          events: a.used_by || [],
          references: a.reference_ids || [],
        },
        null,
        2,
      ),
      details,
    );
    button("미리보기", () => previewImage(a.logical_path), row);
  }
}
async function previewImage(logical) {
  imagePreview.replaceChildren();
  node("p", logical, imagePreview);
  try {
    const blob = await pkg.image(logical);
    if (!blob) throw Error("연결된 이미지가 없습니다");
    const img = await loadImage(blob);
    img.alt = logical;
    imagePreview.append(img);
  } catch (e) {
    node("p", e.message, imagePreview);
  }
}
async function renderState() {
  editor.replaceChildren();
  if (!state || !pkg) return;
  const kind = type.value;
  if (kind === "party") {
    node("p", "파티 ID: " + state.party.join(", "), editor);
    return;
  }
  let names = [];
  if (kind === "switches" || kind === "variables")
    names = await pkg.json("normalized/" + kind + ".json");
  else names = Object.keys(state[kind]).map((id) => ({ number: id, name: id }));
  for (const n of names
    .filter((x) => (x.number + " " + x.name).includes(stateSearch.value))
    .slice(0, 80)) {
    const row = node("label", `${n.number} ${n.name || ""}`, editor);
    const input = node("input", undefined, row);
    input.type = kind === "switches" || kind === "self" ? "checkbox" : "number";
    if (input.type === "checkbox") input.checked = !!state[kind][n.number];
    else input.value = state[kind][n.number] ?? 0;
    input.onchange = async () => {
      runner = null;
      temporary = false;
      state[kind][n.number] =
        input.type === "checkbox" ? input.checked : Number(input.value);
      await save();
      await showEvents();
    };
  }
}
type.onchange = renderState;
stateSearch.oninput = renderState;
input.onchange = async () => {
  try {
    status.textContent = "패키지 검사 중…";
    const p = await importZip(
      input.files[0],
      (i, n) => (status.textContent = `가져오는 중 ${i}/${n}`),
    );
    await refreshLibrary();
    select.value = p.id;
    await load(p.id);
  } catch (e) {
    status.textContent = "가져오기 실패: " + e.message;
  }
};
resource.onchange = async () => {
  if (!pkg) return;
  try {
    await importZip(
      resource.files[0],
      (i, n) => (status.textContent = `리소스 연결 ${i}/${n}`),
      pkg,
    );
    await pictures(runner?.state || state);
    await renderer.portrait(pkg, lastMessage);
    await showResourceReport();
    await renderGallery();
    status.textContent = `이미지 ${pkg.lastResourceImport.matched}개 연결 / 파일 ${pkg.lastResourceImport.scanned}개 검사`;
  } catch (e) {
    status.textContent = e.message;
  }
};
refreshLibrary()
  .then((list) => {
    if (list.length) load(list[0].id);
  })
  .catch((e) => (status.textContent = "저장소 접근 실패: " + e.message));
