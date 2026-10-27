import { copy, changes, applyChanges } from "./changes.js";
export function validateSave(file, packageId) {
  if (
    !file ||
    file.format !== "rpg-story-save" ||
    file.version !== 1 ||
    file.package_id !== packageId
  )
    throw Error("다른 게임 또는 지원하지 않는 저장 파일");
  if (JSON.stringify(file).length > 24e6) throw Error("저장 파일 크기 제한");
  const walk = (x) => {
    if (!x || typeof x !== "object") return;
    for (const k of Object.keys(x)) {
      if (["__proto__", "constructor", "prototype"].includes(k))
        throw Error("안전하지 않은 저장 키");
      walk(x[k]);
    }
  };
  walk(file);
  const s = file.state;
  if (
    !s ||
    !Array.isArray(s.party) ||
    !s.switches ||
    !s.variables ||
    !s.self ||
    !s.pictures
  )
    throw Error("필수 상태 누락");
  if (
    Object.values(s.switches).some((x) => typeof x !== "boolean") ||
    Object.values(s.variables).some(
      (x) => typeof x !== "number" || !Number.isFinite(x),
    )
  )
    throw Error("스위치/변수 값 오류");
  return copy(s);
}
export function previewPreset(state, changesList) {
  const next = copy(state);
  for (const c of changesList) {
    if (
      !["switch", "variable"].includes(c.kind) ||
      !Number.isInteger(c.id) ||
      c.id < 1
    )
      throw Error("프리셋 참조 오류");
    if (
      (c.kind === "switch" && typeof c.value !== "boolean") ||
      (c.kind === "variable" && !Number.isFinite(c.value))
    )
      throw Error("프리셋 값 오류");
    next[c.kind === "switch" ? "switches" : "variables"][c.id] = c.value;
  }
  return { state: next, patch: changes(state, next) };
}
