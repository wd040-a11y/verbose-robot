export const copy = (x) => structuredClone(x);
const plain = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const safe = (k) => !["__proto__", "prototype", "constructor"].includes(k);
export function changes(a, b, path = []) {
  if (Object.is(a, b)) return [];
  if (plain(a) && plain(b))
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => {
      if (!safe(k)) throw Error("안전하지 않은 상태 키");
      return changes(a[k], b[k], [...path, k]);
    });
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  return [{ path, before: copy(a), after: copy(b) }];
}
export function applyChanges(state, patch, reverse = false) {
  for (const d of patch) {
    if (!d.path.length || d.path.some((k) => typeof k !== "string" || !safe(k)))
      throw Error("잘못된 상태 변경 경로");
    let obj = state;
    for (const key of d.path.slice(0, -1)) obj = obj[key] ??= {};
    const key = d.path.at(-1),
      v = reverse ? d.before : d.after;
    if (v === undefined) delete obj[key];
    else obj[key] = copy(v);
  }
  return state;
}
export function describeChanges(patch, names = {}) {
  return patch
    .filter((x) =>
      [
        "switches",
        "variables",
        "self",
        "map",
        "x",
        "y",
        "party",
        "gold",
        "items",
        "actorGraphics",
        "pluginState",
      ].includes(x.path[0]),
    )
    .map((x) => {
      const [kind, id] = x.path,
        label =
          names[kind]?.[id] ||
          {
            switches: "사건 기억",
            variables: "수치",
            self: "개별 사건 기억",
            map: "장소",
            gold: "소지금",
            party: "동료",
            items: "소지품",
          }[kind] ||
          kind;
      const show = (v) =>
        v === undefined
          ? "미설정"
          : typeof v === "boolean"
            ? v
              ? "ON"
              : "OFF"
            : JSON.stringify(v);
      return `${label}${id ? " (" + id + ")" : ""}: ${show(x.before)} → ${show(x.after)}`;
    });
}
