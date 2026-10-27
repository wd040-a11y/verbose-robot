import { character, coordinate, direction, randomInt } from "./state.js";
const moves = {
  1: [0, 1, 2],
  2: [-1, 0, 4],
  3: [1, 0, 6],
  4: [0, -1, 8],
  5: [-1, 1],
  6: [1, 1],
  7: [-1, -1],
  8: [1, -1],
};
const turns = { 16: 2, 17: 4, 18: 6, 19: 8 };
export function applyRoute(s, target, route, ctx, note) {
  if (!route || !Array.isArray(route.list) || route.list.length > 10000)
    throw Error("잘못된 이동 경로");
  const c = character(s, target, ctx),
    list = route.list.slice(
      0,
      route.list.findIndex((x) => x.code === 0) < 0
        ? undefined
        : route.list.findIndex((x) => x.code === 0),
    );
  if (list.some((x) => x.code === 45))
    throw Error("이동 경로 안의 스크립트는 실행하지 않습니다");
  if (list.some((x) => !Number.isInteger(x.code) || x.code < 1 || x.code > 44))
    throw Error("알 수 없는 이동 경로 명령");
  if (route.repeat && route.wait)
    throw Error(
      "반복 이동을 완료까지 기다리는 경로는 종료를 확정할 수 없습니다",
    );
  if (!route.wait) {
    if (list.some((x) => x.code === 27 || x.code === 28))
      throw Error("비동기 이동 경로의 스위치 변경 시점을 확정할 수 없습니다");
    c.pendingRoute = structuredClone(route);
    c.directionKnown = false;
    c.positionKnown = false;
    if (list.some((x) => x.code === 35 || x.code === 36)) c.directionFix = null;
    note({
      kind: "simplification",
      reason:
        "비동기/반복 경로 등록. 현재 위치·방향은 미확정이며 최종 상태로 가장하지 않음",
      target,
    });
    return;
  }
  delete c.pendingRoute;
  let uncertainProgress = false;
  const face = (d) => {
    if (c.directionFix === null)
      throw Error("비동기 경로의 방향 고정 상태 미확정");
    if (!c.directionFix) {
      c.direction = d;
      c.directionKnown = true;
    }
  };
  const step = (dx, dy, d) => {
    if (d) face(d);
    c.requestedX = (c.requestedX ?? c.x) + dx;
    c.requestedY = (c.requestedY ?? c.y) + dy;
    c.positionKnown = false;
    uncertainProgress ||= !route.skippable;
  };
  for (let index = 0; index < list.length; index++) {
    const { code, parameters: p = [] } = list[index];
    note({ kind: "route_command", index, code, target });
    if (moves[code]) {
      const [dx, dy, d] = moves[code];
      step(dx, dy, d);
      if (!d && c.directionKnown) {
        if (c.direction === 10 - (dx < 0 ? 4 : 6)) face(dx < 0 ? 4 : 6);
        if (c.direction === 10 - (dy < 0 ? 8 : 2)) face(dy < 0 ? 8 : 2);
      }
      continue;
    }
    if (turns[code]) {
      face(turns[code]);
      continue;
    }
    switch (code) {
      case 9: {
        const d = 2 + 2 * randomInt(s, 0, 3, note);
        const [dx, dy] =
          d === 2 ? [0, 1] : d === 4 ? [-1, 0] : d === 6 ? [1, 0] : [0, -1];
        step(dx, dy, d);
        c.directionKnown = false;
        break;
      }
      case 10:
      case 11:
        throw Error("접근/도피 이동은 통행·충돌 판정이 필요합니다");
      case 12:
      case 13: {
        const d = direction(c),
          md = code === 12 ? d : 10 - d;
        const [dx, dy] =
          md === 2 ? [0, 1] : md === 4 ? [-1, 0] : md === 6 ? [1, 0] : [0, -1];
        step(dx, dy, code === 12 ? d : null);
        break;
      }
      case 14: {
        const [dx, dy] = p;
        if (Math.abs(dx) > Math.abs(dy)) {
          if (dx) face(dx < 0 ? 4 : 6);
        } else if (dy) face(dy < 0 ? 8 : 2);
        if (c.positionKnown) {
          c.x += dx;
          c.y += dy;
        } else {
          c.requestedX = (c.requestedX ?? c.x) + dx;
          c.requestedY = (c.requestedY ?? c.y) + dy;
        }
        break;
      }
      case 15:
        if (s.timer.working) s.timer.known = false;
        break;
      case 20:
        face({ 2: 4, 4: 8, 8: 6, 6: 2 }[direction(c)]);
        break;
      case 21:
        face({ 2: 6, 6: 8, 8: 4, 4: 2 }[direction(c)]);
        break;
      case 22:
        face(10 - direction(c));
        break;
      case 23: {
        const d = direction(c);
        face(
          (randomInt(s, 0, 1, note)
            ? { 2: 4, 4: 8, 8: 6, 6: 2 }
            : { 2: 6, 6: 8, 8: 4, 4: 2 })[d],
        );
        break;
      }
      case 24:
        face(2 + 2 * randomInt(s, 0, 3, note));
        break;
      case 25:
      case 26: {
        const dx = coordinate(c, "x") - coordinate(s.player, "x"),
          dy = coordinate(c, "y") - coordinate(s.player, "y");
        let d;
        if (Math.abs(dx) > Math.abs(dy)) d = dx > 0 ? 4 : 6;
        else if (dy) d = dy > 0 ? 8 : 2;
        if (d) face(code === 25 ? d : 10 - d);
        break;
      }
      case 27:
      case 28:
        if (uncertainProgress)
          throw Error(
            "앞선 비통과 이동의 완료 여부가 불명확하여 뒤의 스위치 변경을 실행할 수 없습니다",
          );
        s.switches[p[0]] = code === 27;
        break;
      case 29:
        c.moveSpeed = p[0];
        break;
      case 30:
        c.moveFrequency = p[0];
        break;
      case 31:
      case 32:
        c.walkAnime = code === 31;
        break;
      case 33:
      case 34:
        c.stepAnime = code === 33;
        break;
      case 35:
      case 36:
        c.directionFix = code === 35;
        break;
      case 37:
      case 38:
        c.through = code === 37;
        break;
      case 39:
      case 40:
        c.transparent = code === 39;
        break;
      case 41:
        c.characterName = p[0];
        c.characterIndex = p[1];
        break;
      case 42:
        c.opacity = p[0];
        break;
      case 43:
        c.blend = p[0];
        break;
      case 44:
        note({ kind: "presentation_only", reason: "이동 SE 생략" });
        break;
    }
  }
  if (uncertainProgress) c.directionKnown = false;
  if (!c.positionKnown)
    note({
      kind: "simplification",
      reason:
        "이동 연출 생략, 통행·충돌·종료 가능성 미검증. 요청 좌표와 실제 좌표를 구분",
      target,
    });
  else
    note({
      kind: "state_with_simplified_visual",
      reason: "경로 순서대로 상태 적용, 애니메이션 시간 생략",
      target,
    });
  if (target === -1 && c.positionKnown) {
    s.x = c.x;
    s.y = c.y;
  }
}
