// Additive migration: never replace existing 0.1 world/snapshot values.
export function migrateState(s) {
  s.characters ??= {};
  s.actorGraphics ??= {};
  s.actors ??= {};
  s.player ??= {
    x: s.x,
    y: s.y,
    direction: 2,
    directionKnown: false,
    positionKnown: true,
    transparent: null,
  };
  s.rng ??= { seed: 0x52475032, draws: 0 };
  s.timer ??= { working: false, frames: 0, known: false };
  s.modelVersion = 2;
  return s;
}
export function characterKey(target, ctx) {
  return target === -1
    ? "player"
    : `${ctx.map}:${target === 0 ? ctx.event : target}`;
}
export function character(s, target, ctx) {
  const k = characterKey(target, ctx),
    c = k === "player" ? s.player : s.characters[k];
  if (!c) throw Error(`캐릭터 ${k} 상태가 없어 정확하게 처리할 수 없습니다`);
  return c;
}
export function seedMap(s, shard, mapId, selectPage) {
  migrateState(s);
  for (const e of shard.events) {
    const id = e.source.event_id,
      ctx = { map: mapId, event: id },
      pi = selectPage(e, s, ctx);
    const key = `${mapId}:${id}`;
    let c = s.characters[key];
    if (!c)
      c = s.characters[key] = {
        x: e.raw_metadata.x,
        y: e.raw_metadata.y,
        positionKnown: true,
        direction: 2,
        directionKnown: true,
        directionFix: false,
        opacity: 255,
        transparent: false,
        moveSpeed: 4,
        moveFrequency: 6,
        walkAnime: true,
        stepAnime: false,
        blend: 0,
      };
    if (pi < 0) {
      c.page = null;
      c.through = true;
      c.characterName = "";
      c.characterIndex = 0;
      continue;
    }
    const p = e.pages[pi],
      r = p.raw_metadata || {},
      img = r.image || {};
    if (c.page !== p.id) {
      Object.assign(c, {
        page: p.id,
        direction: img.direction ?? 2,
        directionKnown: true,
        directionFix: !!r.directionFix,
        through: !!r.through,
        walkAnime: !!r.walkAnime,
        stepAnime: !!r.stepAnime,
        moveSpeed: r.moveSpeed ?? 3,
        moveFrequency: r.moveFrequency ?? 3,
        characterName: img.characterName || "",
        characterIndex: img.characterIndex || 0,
        transparent: false,
        opacity: 255,
        blend: 0,
      });
    }
    // Autonomous movement isn't simulated; do not claim its live coordinates.
    if (r.moveType) c.positionKnown = false;
  }
}
export function randomInt(s, min, max, log = () => {}) {
  if (
    !Number.isSafeInteger(min) ||
    !Number.isSafeInteger(max) ||
    max < min ||
    max - min > 0xffffffff - 1
  )
    throw Error("잘못된 난수 범위");
  let x = s.rng.seed >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  s.rng.seed = x >>> 0;
  s.rng.draws++;
  const result = min + Math.floor(((x >>> 0) / 4294967296) * (max - min + 1));
  log({ kind: "seeded_random", draw: s.rng.draws, result });
  return result;
}
export function known(c, key) {
  if (c[key] === undefined || c[key] === null)
    throw Error(`${key} 상태를 알 수 없습니다`);
  return c[key];
}
export function coordinate(c, key) {
  if (!c.positionKnown)
    throw Error("충돌/비동기 이동의 실제 좌표를 확정할 수 없습니다");
  return known(c, key);
}
export function direction(c) {
  if (!c.directionKnown)
    throw Error("비동기 이동의 현재 방향을 확정할 수 없습니다");
  return c.direction;
}
export function gameData(p, s, ctx) {
  const [type, a, b] = p;
  if (type <= 2 && type >= 0)
    return s[["items", "weapons", "armors"][type]][a] || 0;
  if (type === 3) {
    const actor = s.actors[a];
    if (!actor) throw Error("액터 상태 미등록");
    const key = ["level", "exp", "hp", "mp"][b];
    return key ? known(actor, key) : known(known(actor, "params"), b - 4);
  }
  if (type === 5) {
    const c = character(s, a, ctx);
    if (b === 0) return coordinate(c, "x");
    if (b === 1) return coordinate(c, "y");
    if (b === 2) return direction(c);
    throw Error("화면 좌표/카메라 상태 미지원");
  }
  if (type === 6) return s.party[a] ?? 0;
  if (type === 7) {
    if (a === 0) return s.map;
    if (a === 1) return s.party.length;
    if (a === 2) return s.gold;
    if (a === 5) {
      if (!s.timer.known) throw Error("타이머 경과 시간 미확정");
      return Math.floor(s.timer.frames / 60);
    }
    const key = {
      3: "steps",
      4: "playtime",
      6: "saveCount",
      7: "battleCount",
      8: "winCount",
      9: "escapeCount",
    }[a];
    if (key) return known(s, key);
  }
  throw Error("해당 게임 데이터는 정확한 상태가 없어 지원하지 않습니다");
}
