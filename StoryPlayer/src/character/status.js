export async function database(pkg, name) {
  try {
    const v = await pkg.json(`normalized/database/${name}.json`);
    return v.records || v;
  } catch {
    return [];
  }
}
export async function actorDatabase(pkg) {
  const names = ["Actors", "Classes", "Weapons", "Armors", "Skills", "States"];
  const rows = await Promise.all(names.map((n) => database(pkg, n)));
  return Object.fromEntries(names.map((n, i) => [n, rows[i]]));
}
// Database-derived previews are deliberately not installed as current execution state.
export function actorStatus(id, state, db) {
  const base = db.Actors[id];
  if (!base) return null;
  const live = state.actors?.[id],
    level = live?.level ?? base.initialLevel,
    cls = db.Classes[live?.classId ?? base.classId];
  const equipment = live?.equips ?? base.equips;
  const provenance =
    live?.level !== undefined && live?.equips !== undefined
      ? "현재 등록값 기준 — 최종 보정 미검증"
      : "초기 DB 기준 미리보기";
  let values = null,
    reason = "직업 능력치 표 없음";
  const table = cls?.params;
  if (
    Array.isArray(table) &&
    table.length === 8 &&
    table.every((row) => Array.isArray(row) && Number.isFinite(row[level]))
  ) {
    const extras = Array(8).fill(0),
      features = [
        ...(base.traits || base.features || []),
        ...(cls.traits || cls.features || []),
      ];
    if (Array.isArray(equipment))
      equipment.forEach((e, i) => {
        const item =
          typeof e === "object"
            ? e.kind === "weapon"
              ? db.Weapons[e.id]
              : db.Armors[e.id]
            : i === 0
              ? db.Weapons[e]
              : db.Armors[e];
        if (item) {
          for (let k = 0; k < 8; k++) extras[k] += item.params?.[k] || 0;
          features.push(...(item.traits || item.features || []));
        }
      });
    values = table.map((row, i) => {
      const rate = features
        .filter((f) => f.code === 21 && f.dataId === i)
        .reduce((a, f) => a * f.value, 1);
      return Math.round((row[level] + extras[i]) * rate);
    });
    reason =
      "표준 DB/장비 특성 계산. 플러그인·현재 상태이상·버프 보정은 검증되지 않음";
  }
  return {
    id,
    name: live?.name ?? base.name,
    profile: base.profile ?? base.description ?? "",
    className: cls?.name ?? "미확인",
    level,
    provenance,
    values,
    reason,
    hp: live?.hp ?? null,
    mp: live?.mp ?? null,
    tp: live?.tp ?? null,
    exp: live?.exp ?? null,
    equipment,
    skills: live?.skills ?? null,
    states: live?.states ?? null,
    graphics: state.actorGraphics?.[id] ?? base,
  };
}
export function evaluateStat(def, state) {
  const values = def.sources.map((s) =>
    s.kind === "switch"
      ? !!state.switches[s.id]
      : Number(state.variables[s.id] ?? 0),
  );
  let value;
  if (def.operation === "sum")
    value = values.reduce((a, b) => a + Number(b), 0);
  else if (def.operation === "all") value = values.every(Boolean);
  else value = values[0];
  return def.labels?.[String(value)] ?? value;
}
