import { copy, changes } from "../core/changes.js";
import { selectPage, pageStatus } from "../core.js";
export function pagePlan(event, index, state, ctx) {
  const next = copy(state),
    p = event.pages[index];
  if (!p) throw Error("페이지 없음");
  const c = p.raw_metadata?.conditions || {};
  for (const n of ["switch1", "switch2"])
    if (c[n + "Valid"]) next.switches[c[n + "Id"]] = true;
  if (c.variableValid)
    next.variables[c.variableId] = Math.max(
      Number(next.variables[c.variableId] || 0),
      c.variableValue,
    );
  if (c.selfSwitchValid)
    next.self[`${ctx.map}:${ctx.event}:${c.selfSwitchCh}`] = true;
  if (c.itemValid)
    next.items[c.itemId] = Math.max(next.items[c.itemId] || 0, 1);
  if (c.actorValid && !next.party.includes(c.actorId))
    next.party.push(c.actorId);
  const selected = selectPage(event, next, ctx),
    warnings = [];
  if (selected !== index)
    warnings.push(
      "다른 상위 페이지가 우선합니다. 이 페이지를 직접 선택한 자유 감상으로만 실행합니다.",
    );
  const codes = p.commands.map((x) => x.raw.code);
  if (codes.includes(111))
    warnings.push(
      "페이지 내부 조건 분기는 적용하지 않습니다. 실행 중 현재 값을 검사합니다.",
    );
  if (codes.includes(117))
    warnings.push("공통 이벤트의 내부 조건은 자동 해결하지 않습니다.");
  if (codes.some((x) => [355, 356, 357].includes(x)))
    warnings.push("스크립트·플러그인 의존성은 별도 호환 처리가 필요합니다.");
  warnings.push(
    "다른 이벤트와의 의존 관계 및 원작에서의 도달 가능성은 검증되지 않았습니다.",
  );
  return {
    state: next,
    patch: changes(state, next),
    warnings,
    selected,
    eligible: pageStatus(p, next, ctx).length === 0,
  };
}
