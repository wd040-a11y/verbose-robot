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
  urls = [];
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
node("h1", "RPG Story Player");
node("p", "로컬 이벤트 재생 · 게임 데이터는 서버로 전송하지 않습니다.");
const top = node("section"),
  status = node("p", "추출 ZIP을 불러오세요.");
const input = node("input", undefined, top);
input.type = "file";
input.accept = ".zip";
input.setAttribute("aria-label", "추출 패키지 ZIP");
const select = node("select", undefined, top);
select.setAttribute("aria-label", "게임 선택");
select.onchange = () =>
  load(select.value).catch((e) => (status.textContent = e.message));
button("리소스 ZIP 추가", () => resource.click(), top);
const resource = node("input", undefined, top);
resource.type = "file";
resource.accept = ".zip";
resource.hidden = true;
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
const scene = node("div", undefined, right),
  dialog = node("div", "", right),
  controls = node("div", undefined, right);
const tools = node("section");
node("h2", "상태와 기록", tools);
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
      state = clone(v.state);
      await save();
      await showEvents();
      renderState();
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
      dialog.textContent = "실행 전 상태를 복원했습니다.";
    }
  },
  tools,
);
button(
  "현재 실행 중단",
  async () => {
    runner = null;
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
  scene.replaceChildren();
  maps = await pkg.json("normalized/maps.json");
  const game = await pkg.json("normalized/game.json");
  state = (await get("meta", "state:" + id)) || initial(game.system);
  pkg.assets = await pkg.json("normalized/assets.json");
  pkg.commons = await pkg.json("normalized/common_events.json");
  renderMaps();
  renderState();
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
  temporary = force;
  runner = new Interpreter({
    page: e.pages[i],
    state,
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
    dialog.textContent = `이 이벤트 실행 중단\n${w.message}\n명령: ${w.command}\n다른 이벤트는 계속 선택할 수 있습니다.`;
    button(
      "실행 전 상태 복원",
      async () => {
        state = clone(baseline);
        runner = null;
        temporary = false;
        await save();
        renderState();
        await showEvents();
      },
      controls,
    );
  } else if (w.type === "done") {
    dialog.textContent = "이벤트 종료";
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
async function pictures(s) {
  urls.forEach(URL.revokeObjectURL);
  urls = [];
  scene.replaceChildren();
  for (const [id, p] of Object.entries(s.pictures).sort(
    (a, b) => +a[0] - +b[0],
  )) {
    const b = await pkg.image("img/pictures/" + p.name);
    if (b) {
      const u = URL.createObjectURL(b);
      urls.push(u);
      const image = node("img", undefined, scene);
      image.src = u;
      image.alt = p.name;
      image.style.opacity = p.opacity / 255;
    } else
      node(
        "small",
        `그림 ${id}: ${p.name} — 리소스 미등록 (이벤트 계속 실행)`,
        scene,
      );
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
