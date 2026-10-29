import { sourceRows, buildSources } from "../enrichment/sources.js";
import {
  el,
  button,
  input,
  select,
  details,
  modal,
  paginate,
  download,
} from "./dom.js";
import { get, put, importZip } from "../storage.js";
import {
  copy,
  changes,
  describeChanges,
  applyChanges,
} from "../core/changes.js";
import { validateSave, previewPreset } from "../core/saves.js";
import { actorStatus, evaluateStat } from "../character/status.js";
import { loadImage } from "../rendering.js";
import {
  checkResult,
  mergeResults,
  chooseConflict,
  analysisZip,
  displayText,
} from "../enrichment/manager.js";
export function statePanel(parent, c) {
  parent.replaceChildren();
  el("h2", "세계 상태", parent);
  el(
    "p",
    "기본 저장 상태를 편집합니다. 자유 감상 중의 임시 값과는 별개입니다.",
    parent,
  );
  const overview = el("div", null, parent, "cards");
  el(
    "p",
    `현재 장소: ${c.maps.find((m) => m.map_id === c.world.map)?.name || "미확인"}`,
    overview,
  );
  for (const x of Object.values(c.enrichment.items || {}).filter(
    (x) => x.reviewed && x.type === "stat",
  ))
    el(
      "p",
      `${x.value.text}: ${evaluateStat(x.value, c.world)} (검토한 분석)`,
      overview,
    );
  const presets = Object.values(c.enrichment.items || {}).filter(
    (x) => x.type === "preset",
  );
  for (const x of presets)
    button(
      `${x.reviewed ? "" : "[미검토] "}${x.value.text}`,
      () => presetDialog(c, x.value.changes, parent),
      parent,
    );
  const adv = el("details", null, parent);
  el("summary", "상세 설정 — 사건 기억(스위치)과 수치(변수)", adv);
  const type = select(adv, "상태 종류", [
      ["switches", "사건 기억 · 스위치"],
      ["variables", "수치 · 변수"],
    ]),
    search = input(adv, "이름 / 한국어 설명 / 번호 검색"),
    filter = select(adv, "상태 필터", [
      ["named", "이름 있는 항목"],
      ["all", "전체"],
      ["on", "ON / 0 아닌 값"],
      ["recent", "최근 변경"],
      ["used", "참조가 확인된 항목"],
      ["classified", "분석된 항목"],
      ["unclassified", "미분류"],
    ]),
    list = el("div", null, adv);
  let page = 0;
  const render = () => {
    list.replaceChildren();
    const names = c.game.system[type.value] || [],
      kind = type.value === "switches" ? "switch" : "variable",
      recent = new Set(
        c.edits.flatMap((e) =>
          e.patch
            .filter((p) => p.path[0] === type.value)
            .map((p) => +p.path[1]),
        ),
      );
    const rows = names
      .map((name, id) => ({
        id,
        name,
        label: c.enrichment.items?.[`label:${kind}:${id}`]?.value.text || "",
        translation:
          c.enrichment.items?.[`translation:${kind}:${id}`]?.value.text || "",
      }))
      .filter(
        (r) =>
          r.id &&
          `${r.id} ${r.name} ${r.label} ${r.translation}`
            .toLowerCase()
            .includes(search.value.toLowerCase()) &&
          (filter.value === "all" ||
            (filter.value === "named" && r.name) ||
            (filter.value === "on" && c.world[type.value][r.id]) ||
            (filter.value === "recent" && recent.has(r.id)) ||
            (filter.value === "used" &&
              c.referenceIndex?.some(
                (x) => x.kind === type.value && x.id === r.id,
              )) ||
            (filter.value === "classified" && r.label) ||
            (filter.value === "unclassified" && !r.label)),
      );
    paginate(
      list,
      rows,
      page,
      (r, p) => {
        const row = el("article", null, p);
        el("strong", r.translation || r.name || "이름 없음", row);
        el(
          "small",
          `${kind} ${r.id} · 원본: ${r.name || "없음"}${r.label ? " · 의미 추정: " + r.label : ""}`,
          row,
        );
        const edit = input(row, "새 값", "text");
        edit.value = String(
          c.world[type.value][r.id] ?? (kind === "switch" ? false : 0),
        );
        button(
          "변경 확인",
          () => {
            const value =
              kind === "switch"
                ? ["true", "on", "1"].includes(edit.value.toLowerCase())
                : Number(edit.value);
            if (kind === "variable" && !Number.isFinite(value))
              throw Error("숫자를 입력하세요.");
            presetDialog(c, [{ kind, id: r.id, value }], parent);
          },
          row,
        );
        button(
          "관련 장면",
          async () => {
            await c.ensureIndex();
            const d = modal("이 값을 검사하거나 변경하는 장면");
            const refs = Object.values(c.index).filter(
              (x) =>
                x.kind === "command" &&
                ((x.code === (kind === "switch" ? 121 : 122) &&
                  x.parameters[0] <= r.id &&
                  x.parameters[1] >= r.id) ||
                  (x.code === 111 &&
                    x.parameters[0] === (kind === "switch" ? 0 : 1) &&
                    x.parameters[1] === r.id)),
            );
            el(
              "p",
              "직접 명령 참조입니다. 스크립트의 동적 참조는 포함하지 않습니다.",
              d,
            );
            for (const x of refs.slice(0, 100))
              button(
                `${c.index[x.event]?.text || "장면"} · ${x.code === 111 ? "검사" : "변경"}`,
                () => {
                  d.close();
                  return c.openEvent(x.event);
                },
                d,
              );
            if (!refs.length) el("p", "확인된 직접 참조가 없습니다.", d);
          },
          row,
        );
      },
      {
        onPage: (n) => {
          page = n;
          render();
        },
      },
    );
  };
  for (const e of [type, search, filter])
    e.oninput = () => {
      page = 0;
      render();
    };
  render();
  const saves = el("section", null, parent);
  el("h3", "저장 슬롯과 스냅샷", saves);
  const name = input(saves, "저장 이름", "text");
  button(
    "새 슬롯 저장",
    async () => {
      const rows = (await get("meta", "snapshots:" + c.pkg.id)) || [];
      rows.push({
        id: crypto.randomUUID(),
        name: name.value || "저장 " + new Date().toLocaleString(),
        state: copy(c.world),
      });
      await put("meta", "snapshots:" + c.pkg.id, rows);
      statePanel(parent, c);
    },
    saves,
  );
  const listS = el("div", null, saves);
  get("meta", "snapshots:" + c.pkg.id).then((rows) => {
    for (const s of rows || []) {
      const r = el("article", s.name, listS);
      button(
        "차이 확인 / 복원",
        () => {
          const d = modal(s.name + " 복원");
          details(
            d,
            "변경될 상태",
            describeChanges(changes(c.world, s.state), c.game.system),
          );
          button(
            "이 상태로 복원",
            async () => {
              await c.editWorld(copy(s.state), "슬롯 복원");
              d.close();
              statePanel(parent, c);
            },
            d,
          );
        },
        r,
      );
    }
  });
  button(
    "저장 파일 내보내기",
    () =>
      download("story-save.json", {
        format: "rpg-story-save",
        version: 1,
        package_id: c.pkg.manifest.package_id,
        state: c.world,
      }),
    saves,
  );
  const f = input(saves, "저장 JSON 가져오기", "file");
  f.accept = ".json";
  f.onchange = async () => {
    try {
      const data = JSON.parse(await f.files[0].text());
      const next = validateSave(data, c.pkg.manifest.package_id),
        d = modal("저장 파일 복원 확인");
      details(
        d,
        "변경될 상태",
        describeChanges(changes(c.world, next), c.game.system),
      );
      button(
        "복원",
        async () => {
          await c.editWorld(next, "파일 복원");
          d.close();
          statePanel(parent, c);
        },
        d,
      );
    } catch (e) {
      c.error(e.message);
    }
  };
  const edits = el("details", null, parent);
  el("summary", `수동 변경 이력 (${c.edits.length})`, edits);
  for (const edit of c.edits.slice(-20).reverse()) {
    details(edits, edit.reason, describeChanges(edit.patch, c.game.system));
  }
  button(
    "최근 수동 변경 되돌리기",
    async () => {
      const e = c.edits.at(-1);
      if (!e) return;
      const next = applyChanges(copy(c.world), e.patch, true);
      await c.editWorld(next, "수동 변경 되돌리기");
      statePanel(parent, c);
    },
    edits,
  );
}
export function presetDialog(c, changesList, parent) {
  const plan = previewPreset(c.world, changesList),
    d = modal("상태 변경 확인");
  details(d, "변경 전 → 변경 후", describeChanges(plan.patch, c.game.system));
  el(
    "p",
    "이 변경이 원작에서 도달 가능한 상태인지는 별도 검증이 필요합니다.",
    d,
  );
  button(
    "기본 세계에 적용",
    async () => {
      await c.editWorld(plan.state, "프리셋/수동 편집");
      d.close();
      statePanel(parent, c);
    },
    d,
  );
}
export async function actorsPanel(parent, c) {
  parent.replaceChildren();
  el("h2", "인물과 스테이터스", parent);
  const active = c.session?.history.runner.state || c.world;
  el(
    "p",
    c.session?.temporary
      ? "자유 감상 중의 임시 상태입니다. 기본 저장 상태는 바뀌지 않습니다."
      : "기본 저장 상태 및 원본 데이터베이스",
    parent,
  );
  const actors = (c.db.Actors || []).filter(Boolean);
  if (!actors.length) el("p", "확인 가능한 인물 데이터가 없습니다.", parent);
  for (const a of actors) {
    const s = actorStatus(a.id, active, c.db),
      row = el("article", null, parent, "actor-card");
    el("h3", c.text(`actor:${a.id}`, s.name), row);
    el("p", c.text(`actor:${a.id}:description`, s.profile), row);
    el(
      "p",
      `${s.className} · 레벨 ${s.level ?? "미확인"} · ${s.provenance}`,
      row,
    );
    el(
      "p",
      `현재 HP ${s.hp ?? "미확인"} / MP ${s.mp ?? "미확인"} / TP ${s.tp ?? "미확인"} / 경험치 ${s.exp ?? "미확인"}`,
      row,
    );
    if (s.values) {
      el(
        "small",
        "표준 능력치 계산 참고값 — 최종 현재 능력치로 확정하지 않음",
        row,
      );
      el(
        "p",
        s.values
          .map(
            (v, i) =>
              `${["최대 HP", "최대 MP", "공격", "방어", "마법", "마방", "민첩", "행운"][i]} ${v}`,
          )
          .join(" · "),
        row,
      );
    }
    el("small", s.reason, row);
    details(row, "장비·스킬·상태 원본 정보", {
      equipment: s.equipment,
      skills: s.skills ?? "현재 상태 미확인",
      states: s.states ?? "현재 상태 미확인",
      party: active.party.includes(a.id),
    });
    const face = s.graphics.faceName;
    if (face) {
      try {
        const blob = await c.pkg.image("img/faces/" + face);
        if (blob) {
          const image = await loadImage(blob);
          image.alt = face;
          image.className = "actor-sheet";
          row.append(image);
        }
      } catch {}
    }
    for (const x of Object.values(c.enrichment.items || {}).filter(
      (x) => x.type === "stat" && x.value.actor_id === a.id,
    )) {
      el(
        "p",
        `${x.reviewed ? "" : "[미검토 분석] "}${x.value.text}: ${evaluateStat(x.value, active)}`,
        row,
      );
      details(row, "분석 근거", {
        evidence: x.evidence,
        confidence: x.confidence,
        uncertainties: x.uncertainties,
      });
      if (x.value.image_path) {
        const b = await c.pkg.image(x.value.image_path);
        if (b) {
          const image = await loadImage(b);
          image.alt = x.value.text;
          row.append(image);
        }
      }
    }
  }
}
export async function resourcesPanel(parent, c) {
  parent.replaceChildren();
  el("h2", "리소스 관리", parent);
  el(
    "p",
    "이미지 ZIP은 감상 화면의 CG·얼굴·아이콘을 연결합니다. 게임 데이터와 별도로 추가하며 AI 분석 파일에는 이미지 원본을 포함하지 않습니다.",
    parent,
  );
  const f = input(parent, "이미지 리소스 ZIP", "file");
  f.accept = ".zip,application/zip";
  f.onchange = async () => {
    try {
      await importZip(
        f.files[0],
        (n, t) => c.status(`이미지 검사 ${n}/${t}`),
        c.pkg,
      );
      await c.renderSession(true);
      await resourcesPanel(parent, c);
    } catch (e) {
      c.error(e.message);
    }
  };
  const report = await get("meta", "resource-report:" + c.pkg.id);
  if (report) {
    el(
      "p",
      `검사 ${report.scanned}개 · 정상 연결 ${report.matched-(report.files?.filter(x=>x.status==='linked_unverified').length||0)}개 · 참조 없음 ${report.noReference}개 · 형식 오류 ${report.invalid}개 · 모호 ${report.ambiguous}개`,
      parent,
    );
    if(report.files?.some(x=>x.status==='linked_unverified'))el("p","대용량 ZIP은 필요한 순간에 파일 형식과 무결성을 검사합니다. 연결 대기: "+report.files.filter(x=>x.status==='linked_unverified').length+"개. 재실행 후 ZIP을 다시 연결하세요.",parent);
    details(
      parent,
      "연결되지 않은 파일의 이유",
      report.files.filter((x) => x.status !== "connected"),
    );
  }
  const search = input(parent, "이미지 이름 / 경로 검색"),
    category = select(parent, "리소스 종류", [
      ["all", "전체"],
      ["faces", "얼굴"],
      ["pictures", "이벤트 CG"],
      ["system", "UI / 아이콘"],
      ["characters", "캐릭터 그래픽"],
      ["parallaxes", "배경"],
      ["animations", "애니메이션"],
      ["battle", "전투"],
      ["missing", "파일 미연결"],
    ]);
  el(
    "small",
    "분류는 경로 기반 단서이며 실제 용도는 이벤트 참조로 확인하세요.",
    parent,
  );
  const list = el("div", null, parent),
    preview = el("div", null, parent, "image-preview");
  let page = 0,
    gen = 0;
  async function render() {
    const token = ++gen;
    list.replaceChildren();
    let rows = (c.pkg.assets || []).filter(
      (a) =>
        a.category === "images" &&
        a.logical_path.toLowerCase().includes(search.value.toLowerCase()),
    );
    if (category.value === "missing") {
      const missing = [];
      for (const a of rows)
        if (!(await c.pkg.image(a.logical_path))) missing.push(a);
      rows = missing;
    } else if (category.value !== "all")
      rows = rows.filter((a) => a.logical_path.includes("/" + category.value));
    if (token !== gen) return;
    paginate(
      list,
      rows,
      page,
      (a, p) => {
        const row = el("article", a.logical_path, p);
        details(row, "원본 경로 / 관련 이벤트", {
          source: a.source_path,
          output: a.output_path,
          used_by: a.used_by,
          references: a.reference_ids,
        });
        button(
          "미리보기",
          async () => {
            preview.replaceChildren();
            const blob = await c.pkg.image(a.logical_path);
            if (!blob) {
              el("p", "파일 미연결 — 이미지 ZIP을 추가하세요.", preview);
              return;
            }
            const image = await loadImage(blob);
            image.alt = a.logical_path;
            preview.append(image);
          },
          row,
        );
      },
      {
        size: 24,
        onPage: (n) => {
          page = n;
          render();
        },
      },
    );
  }
  search.oninput = category.onchange = () => {
    page = 0;
    render();
  };
  await render();
  if (navigator.storage?.estimate) {
    const e = await navigator.storage.estimate();
    el(
      "small",
      `브라우저 저장 공간: ${Math.round((e.usage || 0) / 1048576)} / ${Math.round((e.quota || 0) / 1048576)} MiB. 기기 정책에 따라 달라집니다.`,
      parent,
    );
  }
}
export async function analysisPanel(parent, c) {
  parent.replaceChildren();
  el("h2", "AI 분석과 한국어 번역", parent);
  el(
    "p",
    "유료 API 없이 사용합니다. 작업 ZIP을 준비해 ChatGPT에 전달하고, 고정 지침에 맞춘 결과 JSON을 다시 가져오세요. 원본 명령은 수정하지 않습니다.",
    parent,
  );
  const counts = Object.values(c.enrichment.items || {});
  el(
    "p",
    `원본 분석 대상 ${c.index ? Object.keys(c.index).length : "인덱스 준비 전"} · 가져온 결과 ${counts.length} · 번역 ${counts.filter((x) => x.type === "translation").length} · 재검토 ${counts.filter((x) => !x.reviewed).length} · 충돌 ${c.enrichment.conflicts?.length || 0} · 실패 ${c.enrichment.failed || 0}`,
    parent,
  );
  button(
    "AI 분석 준비",
    async () => {
      c.cancelIndex = false;
      const sources = sourceRows(c.pkg, c.game, c.maps, c.pkg.commons, c.db, {
        progress: (n,t) => c.status(`분석 작업 분할 ${n}/${t} 맵`),
        cancelled: () => c.cancelIndex,
      });
      download(
        "story-analysis-jobs.zip",
        await analysisZip(c.pkg.manifest.package_id, sources),
      );
      analysisPanel(parent, c);
    },
    parent,
  );
  button(
    "준비 취소",
    () => {
      c.cancelIndex = true;
    },
    parent,
  );
  const f = input(parent, "분석 / 번역 JSON 가져오기", "file");
  f.accept = ".json";
  f.onchange = async () => {
    try {
      if (f.files[0].size > 24e6) throw Error("분석 파일 크기 제한");
      const data = JSON.parse(await f.files[0].text());
      const wanted = new Set();
      const collect = value => {
        if (typeof value === 'string') wanted.add(value);
        else if (Array.isArray(value)) value.forEach(collect);
        else if (value && typeof value === 'object') Object.values(value).forEach(collect);
      };
      collect(data);
      for (const item of data.items || []) {
        const v=item.value || {};
        if(v.actor_id)wanted.add(`actor:${v.actor_id}`);
        for(const ref of [...(v.sources||[]),...(v.changes||[])]) wanted.add(`${ref.kind}:${ref.id}`);
      }
      for(const asset of c.pkg.assets || []) if(wanted.has(asset.logical_path)) wanted.add(asset.id);
      const index = await buildSources(c.pkg,c.game,c.maps,c.pkg.commons,c.db,{wanted});
      const items = checkResult(data, c.pkg.manifest.package_id, index);
      c.enrichment = mergeResults(c.enrichment, items);
      await c.saveEnrichment();
      analysisPanel(parent, c);
      c.refreshNames();
    } catch (e) {
      c.enrichment.failed = (c.enrichment.failed || 0) + 1;
      await c.saveEnrichment();
      c.error(e.message);
    }
  };
  button(
    "분석 데이터 백업",
    () =>
      download("story-analysis-backup.json", {
        schema_version: "1.0.0",
        package_id: c.pkg.manifest.package_id,
        items: counts.map((x) => {
          const v = { ...x };
          delete v.reviewed;
          return v;
        }),
      }),
    parent,
  );
  for (const [i, conflict] of (c.enrichment.conflicts || []).entries()) {
    const row = el("article", conflict.key, parent);
    details(row, "기존 / 새 결과", conflict);
    button(
      "기존 유지",
      async () => {
        chooseConflict(c.enrichment, i, false);
        await c.saveEnrichment();
        analysisPanel(parent, c);
      },
      row,
    );
    button(
      "새 결과 선택 (재검토)",
      async () => {
        chooseConflict(c.enrichment, i, true);
        await c.saveEnrichment();
        analysisPanel(parent, c);
      },
      row,
    );
  }
  const search = input(parent, "분석 결과 검색"),
    list = el("div", null, parent);
  let page = 0;
  function render() {
    list.replaceChildren();
    const rows = counts.filter((x) =>
      `${x.target_id} ${x.type} ${x.value.text || ""}`.includes(search.value),
    );
    paginate(
      list,
      rows,
      page,
      (x, p) => {
        const row = el(
          "article",
          `${x.type} · ${x.value.text || x.value.category || x.target_id}`,
          p,
        );
        el(
          "small",
          `${x.reviewed ? "사용자 검토됨" : "미검토 추정"} · 확신 ${Math.round(x.confidence * 100)}%`,
          row,
        );
        details(row, "원본 근거와 불확실성", x);
        if (x.type !== "translation")
          button(
            x.reviewed ? "검토 해제" : "근거를 확인하고 검토 표시",
            async () => {
              x.reviewed = !x.reviewed;
              await c.saveEnrichment();
              render();
              c.refreshNames();
            },
            row,
          );
      },
      {
        onPage: (n) => {
          page = n;
          render();
        },
      },
    );
  }
  search.oninput = () => {
    page = 0;
    render();
  };
  render();
}
export function helpPanel(parent) {
  parent.replaceChildren();
  el("h2", "감상 안내", parent);
  for (const [name, text] of [
    [
      "시작하기",
      "추출 ZIP을 선택하고 장소 → 장면 → 감상하기를 누르세요. 이미지 ZIP은 리소스 관리에서 별도로 연결합니다.",
    ],
    [
      "진행 모드와 자유 감상",
      "진행 모드는 이벤트 결과를 기본 저장에 반영합니다. 자유 감상은 복사한 상태에서 실행합니다. 직접 반영을 누르기 전까지 기본 저장은 바뀌지 않습니다.",
    ],
    [
      "조건과 페이지",
      "같은 인물도 여러 상황별 장면(페이지)을 가질 수 있습니다. 조건 적용은 페이지의 기본 조건만 맞춥니다. 원작의 모든 의존 관계나 도달 가능성을 보장하지 않습니다.",
    ],
    [
      "이전과 기록",
      "이전 또는 기록 속 대사를 누르면 그 시점의 게임 상태도 복원합니다. 다른 선택을 하면 기존 갈래는 별도 기록으로 남습니다. 정적 원문은 실제 실행 기록이 아닙니다.",
    ],
    [
      "스위치와 변수",
      "스위치는 특정 사건이 발생했는지 기억하는 값입니다. 변수는 호감도나 진행 단계처럼 수치를 저장할 수 있습니다. 실제 의미는 게임마다 다르므로 추측을 확정 사실로 보지 마세요.",
    ],
    [
      "프리셋과 스냅샷",
      "프리셋은 여러 상태를 함께 바꾸는 목록이며 적용 전 차이를 확인합니다. 스냅샷은 현재 세계 상태를 이름을 붙여 보관한 저장 슬롯입니다.",
    ],
    [
      "AI 분석과 번역",
      "분석 작업 ZIP과 고정 지침을 ChatGPT에 전달하고 JSON 결과를 가져옵니다. 번역은 원본과 별도로 표시합니다. 의미 분석은 근거·확신·미확정 사항을 확인하세요.",
    ],
    [
      "시점과 엔딩",
      "분석 결과에 연결 이벤트가 있어야 목록이 채워집니다. 엔딩 후보는 확정 엔딩과 구분되며 즉시 감상은 임시 상태에서 실행합니다.",
    ],
    [
      "이미지와 미지원 명령",
      "이미지가 없어도 대사와 선택지는 계속됩니다. 미지원 스크립트는 성공한 것으로 처리하지 않고 해당 실행만 중단합니다. 다른 장면은 감상할 수 있습니다.",
    ],
    [
      "단축키",
      "Space / →: 다음, ←: 이전, L: 기록. 선택지에서는 자동 진행이 멈춥니다. 입력칸을 편집할 때는 단축키가 작동하지 않습니다.",
    ],
    [
      "저장 공간과 호환성",
      "기본 저장·분석은 기기의 브라우저 저장소에 남습니다. Windows와 웹은 자동 동기화하지 않으므로 저장 파일을 내보내 이동하세요. iOS 실기기는 별도 미검증입니다.",
    ],
  ])
    details(parent, name, text);
}
