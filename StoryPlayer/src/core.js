import {
  migrateState,
  character,
  direction,
  gameData,
  randomInt,
  known,
} from "./state.js";
import { applyRoute } from "./routes.js";
import { PluginRegistry } from "./plugins/registry.js";
export { migrateState, seedMap } from "./state.js";
export const clone = (x) => structuredClone(x);
export function initial(system = {}) {
  return migrateState({
    player: {
      x: system.startX || 0,
      y: system.startY || 0,
      direction: 2,
      directionKnown: true,
      positionKnown: true,
      transparent: !!system.optTransparent,
    },
    timer: { working: false, frames: 0, known: true },
    switches: {},
    variables: {},
    self: {},
    items: {},
    weapons: {},
    armors: {},
    gold: 0,
    party: system.partyMembers || [],
    map: system.startMapId || 0,
    x: system.startX || 0,
    y: system.startY || 0,
    pictures: {},
  });
}
const value = (s, id) => s.variables[id] ?? 0;
const key = (ctx, ch) => `${ctx.map}:${ctx.event}:${ch}`;
export function pageStatus(page, s, ctx) {
  const c = page.raw_metadata?.conditions || {};
  const failed = [];
  for (const n of ["switch1", "switch2"])
    if (c[n + "Valid"] && !s.switches[c[n + "Id"]])
      failed.push(`스위치 ${c[n + "Id"]} ON 필요`);
  if (c.variableValid && !(value(s, c.variableId) >= c.variableValue))
    failed.push(`변수 ${c.variableId} ≥ ${c.variableValue} 필요`);
  if (c.selfSwitchValid && !s.self[key(ctx, c.selfSwitchCh)])
    failed.push(`셀프 스위치 ${c.selfSwitchCh} ON 필요`);
  if (c.itemValid && !(s.items[c.itemId] > 0))
    failed.push(`아이템 ${c.itemId} 필요`);
  if (c.actorValid && !s.party.includes(c.actorId))
    failed.push(`파티원 ${c.actorId} 필요`);
  return failed;
}
export function selectPage(event, s, ctx) {
  for (let i = event.pages.length - 1; i >= 0; i--)
    if (!pageStatus(event.pages[i], s, ctx).length) return i;
  return -1;
}
export class Unsupported extends Error {}
export function condition(p, s, ctx) {
  const [type, a, b, c, d] = p;
  switch (type) {
    case 0:
      return !!s.switches[a] === (b === 0);
    case 1: {
      const x = value(s, a),
        y = b === 0 ? c : value(s, c);
      switch (d) {
        case 0:
          return x === y;
        case 1:
          return x >= y;
        case 2:
          return x <= y;
        case 3:
          return x > y;
        case 4:
          return x < y;
        case 5:
          return x !== y;
        default:
          throw new Unsupported("변수 비교 형식");
      }
    }
    case 2:
      return !!s.self[key(ctx, a)] === (b === 0);
    case 3:
      if (!s.timer?.working) return false;
      if (!s.timer.known)
        throw new Unsupported("타이머 실제 경과 시간이 미확정입니다");
      return b === 0
        ? Math.floor(s.timer.frames / 60) >= a
        : Math.floor(s.timer.frames / 60) <= a;
    case 4: {
      if (b === 0) return s.party.includes(a);
      const actor = s.actors?.[a];
      if (!actor) throw new Unsupported("액터 상세 상태 미등록");
      if (b === 1) return known(actor, "name") === c;
      if (b === 2) return known(actor, "classId") === c;
      const key = { 3: "skills", 4: "weapons", 5: "armors", 6: "states" }[b];
      if (!key) throw new Unsupported("액터 조건 형식 미지원");
      return known(actor, key).includes(c);
    }
    case 6:
      return direction(character(s, a, ctx)) === b;
    case 7:
      return b === 0 ? s.gold >= a : b === 1 ? s.gold <= a : s.gold < a;
    case 8:
      return (s.items[a] || 0) > 0;
    case 9:
    case 10:
      if (b) {
        if (((type === 9 ? s.weapons : s.armors)[a] || 0) > 0) return true;
        let unknown = false;
        for (const id of s.party) {
          const equipped = s.actors?.[id]?.[type === 9 ? "weapons" : "armors"];
          if (!equipped) unknown = true;
          else if (equipped.includes(a)) return true;
        }
        if (unknown) throw new Unsupported("파티원의 장착 상태 미확정");
        return false;
      }
      return ((type === 9 ? s.weapons : s.armors)[a] || 0) > 0;
    default:
      throw new Unsupported(`조건 유형 ${type}: 정확한 호환 처리 필요`);
  }
}
// Only presentation-only operations are skipped. Movement routes may change switches.
const visual = new Set([
  108, 408, 204, 212, 213, 221, 222, 223, 224, 225, 230, 236, 241, 242, 243,
  244, 245, 246, 249, 250, 251, 261,
]);
export class Interpreter {
  constructor({
    page,
    state,
    context,
    engine,
    common,
    plugins = new PluginRegistry(),
  }) {
    this.state = migrateState(clone(state));
    this.before = clone(state);
    this.engine = engine;
    this.common = common;
    this.plugins = plugins;
    this.fidelity = [];
    this.stack = [
      { commands: page.commands, pc: 0, ctx: context, branches: {} },
    ];
    this.log = [];
    this.wait = null;
    this.done = false;
    this.steps = 0;
  }
  note(entry) {
    this.log.push(entry);
    if (
      [
        "simplification",
        "state_with_simplified_visual",
        "presentation_only",
      ].includes(entry.kind)
    )
      this.fidelity.push(entry);
  }
  fail(message, c) {
    this.wait = {
      type: "blocked",
      message,
      command: c?.id,
      raw: c?.raw,
      context: this.stack.at(-1)?.ctx,
      changes: Object.keys(this.state).filter(
        (k) => JSON.stringify(this.state[k]) !== JSON.stringify(this.before[k]),
      ),
    };
    this.log.push(this.wait);
    return this.wait;
  }
  jump(f, codes, indent) {
    let i = f.pc;
    for (; i < f.commands.length; i++) {
      const r = f.commands[i].raw;
      if (r.indent < indent) break;
      if (r.indent === indent && codes.includes(r.code)) break;
    }
    f.pc = i;
  }
  async advance(answer) {
    if (this.done) return { type: "done" };
    if (this.wait?.type === "blocked") return this.wait;
    if (this.wait?.type === "choice") {
      const w = this.wait;
      let selected = answer;
      if (answer === "cancel") {
        const c = w.cancel;
        if (c.mode === "disabled") return w;
        selected = c.mode === "branch" ? "cancel" : c.index;
      }
      if (
        selected !== "cancel" &&
        (!Number.isInteger(selected) ||
          selected < 0 ||
          selected >= w.choices.length)
      )
        return w;
      w.frame.branches[w.indent] = selected;
      this.log.push({ choice: selected, command: w.command });
    }
    this.wait = null;
    for (let burst = 0; burst < 2000; burst++) {
      if (++this.steps > 100000) return this.fail("실행 명령 한도 초과");
      const f = this.stack.at(-1);
      if (!f) {
        this.done = true;
        return { type: "done" };
      }
      if (f.pc >= f.commands.length) {
        this.stack.pop();
        continue;
      }
      const command = f.commands[f.pc++],
        r = command.raw || {},
        p = r.parameters || [],
        d = r.indent;
      const s = this.state;
      this.log.push({
        command: command.id,
        code: r.code,
        category: commandCategory(r.code),
        context: f.ctx,
      });
      try {
        if (visual.has(r.code)) {
          this.log.at(-1).skipped = "presentation_only";
          this.note({ kind: "presentation_only", code: r.code });
          if (s.timer.working) s.timer.known = false;
          continue;
        }
        switch (r.code) {
          case 0:
            break;
          case 101:
          case 105: {
            if (s.timer.working) s.timer.known = false;
            let lines = [];
            const cont = r.code === 101 ? 401 : 405;
            while (f.commands[f.pc]?.raw.code === cont)
              lines.push(f.commands[f.pc++].raw.parameters[0]);
            this.wait = {
              type: "text",
              text: lines.join("\n"),
              face: r.code === 101 ? p[0] : null,
              faceIndex: p[1],
              speaker: this.engine === "MZ" ? p[4] : null,
            };
            return this.wait;
          }
          case 401:
          case 405:
            this.wait = { type: "text", text: p[0] };
            return this.wait;
          case 102: {
            if (s.timer.working) s.timer.known = false;
            let cancel;
            if (this.engine === "VXACE")
              cancel =
                p[1] === 0
                  ? { mode: "disabled" }
                  : p[1] === 5
                    ? { mode: "branch" }
                    : { mode: "choice", index: p[1] - 1 };
            else
              cancel =
                p[1] === -1
                  ? { mode: "disabled" }
                  : p[1] === -2 || p[1] >= p[0].length
                    ? { mode: "branch" }
                    : { mode: "choice", index: p[1] };
            this.wait = {
              type: "choice",
              choices: p[0],
              cancel,
              defaultIndex: this.engine === "VXACE" ? 0 : p[2],
              frame: f,
              indent: d,
              command: command.id,
            };
            return this.wait;
          }
          case 402:
            if (f.branches[d] !== p[0]) this.jump(f, [402, 403, 404], d);
            break;
          case 403:
            if (f.branches[d] !== "cancel") this.jump(f, [404], d);
            break;
          case 404:
            delete f.branches[d];
            break;
          case 111:
            f.branches[d] = condition(p, s, f.ctx);
            if (!f.branches[d]) this.jump(f, [411, 412], d);
            break;
          case 411:
            if (f.branches[d]) this.jump(f, [412], d);
            break;
          case 412:
            delete f.branches[d];
            break;
          case 121:
            if (p[1] - p[0] > 10000) throw new Unsupported("스위치 범위 한도");
            for (let id = p[0]; id <= p[1]; id++) s.switches[id] = p[2] === 0;
            break;
          case 122: {
            if (p[1] - p[0] > 10000) throw new Unsupported("변수 범위 한도");
            let operand;
            if (p[3] === 0) operand = p[4];
            else if (p[3] === 1) operand = value(s, p[4]);
            else if (p[3] === 2)
              operand = randomInt(s, p[4], p[5], (e) => this.note(e));
            else if (p[3] === 3) operand = gameData(p.slice(4), s, f.ctx);
            else
              throw new Unsupported(
                "변수 피연산자: 난수·게임 데이터·스크립트 호환 처리 필요",
              );
            if (typeof operand !== "number" || !Number.isFinite(operand))
              throw new Unsupported("숫자가 아닌 변수");
            const changes = {};
            for (let id = p[0]; id <= p[1]; id++) {
              if (p[3] === 2 && id > p[0] && this.engine !== "VXACE")
                operand = randomInt(s, p[4], p[5], (e) => this.note(e));
              let x = value(s, id),
                v;
              switch (p[2]) {
                case 0:
                  v = operand;
                  break;
                case 1:
                  v = x + operand;
                  break;
                case 2:
                  v = x - operand;
                  break;
                case 3:
                  v = x * operand;
                  break;
                case 4:
                  if (!operand) throw new Unsupported("0 나누기");
                  v = Math.floor(x / operand);
                  break;
                case 5:
                  if (!operand) throw new Unsupported("0 나머지");
                  v =
                    this.engine === "VXACE"
                      ? ((x % operand) + operand) % operand
                      : x % operand;
                  break;
                default:
                  throw new Unsupported("변수 연산");
              }
              if (!Number.isFinite(v)) throw new Unsupported("비정상 계산");
              changes[id] = this.engine === "VXACE" ? v : Math.floor(v);
            }
            Object.assign(s.variables, changes);
            break;
          }
          case 124:
            if (p[0] === 0)
              s.timer = { working: true, frames: p[1] * 60, known: true };
            else s.timer.working = false;
            break;
          case 205:
            applyRoute(s, p[0], p[1], f.ctx, (e) => this.note(e));
            break;
          case 505:
            this.note({
              kind: "continuation_metadata",
              reason: "205.list에 포함된 경로 표시 데이터. 중복 실행하지 않음",
            });
            break;
          case 211:
            s.player.transparent = p[0] === 0;
            this.note({ kind: "state_with_simplified_visual", code: 211 });
            break;
          case 322:
            s.actorGraphics[p[0]] = {
              characterName: p[1],
              characterIndex: p[2],
              faceName: p[3],
              faceIndex: p[4],
              ...(this.engine === "VXACE" ? {} : { battlerName: p[5] }),
            };
            if (s.party[0] === p[0])
              Object.assign(s.player, {
                characterName: p[1],
                characterIndex: p[2],
              });
            this.note({ kind: "state_with_simplified_visual", code: 322 });
            break;
          case 356:
          case 357: {
            const result = this.plugins.execute(
              this.engine,
              r.code,
              p,
              s,
              f.ctx,
              (e) => this.note(e),
            );
            if (result) {
              this.wait = result;
              return result;
            }
            break;
          }
          case 123:
            if (!f.ctx.event)
              throw new Unsupported("셀프 스위치 컨텍스트 없음");
            s.self[key(f.ctx, p[0])] = p[1] === 0;
            break;
          case 117: {
            if (this.stack.length >= 32)
              throw new Unsupported("공통 이벤트 호출 깊이 한도");
            const pg = await this.common(p[0]);
            if (!pg) throw new Unsupported("공통 이벤트 누락");
            this.stack.push({
              commands: pg.commands,
              pc: 0,
              ctx: { ...f.ctx },
              branches: {},
            });
            break;
          }
          case 115:
            this.stack.pop();
            break;
          case 112:
            break;
          case 413: {
            let i = f.pc - 2;
            while (
              i >= 0 &&
              !(
                f.commands[i].raw.code === 112 && f.commands[i].raw.indent === d
              )
            )
              i--;
            if (i < 0) throw new Unsupported("루프 시작 누락");
            f.pc = i + 1;
            break;
          }
          case 113: {
            let depth = 0,
              i = f.pc;
            for (; i < f.commands.length; i++) {
              const code = f.commands[i].raw.code;
              if (code === 112) depth++;
              if (code === 413) {
                if (depth === 0) break;
                depth--;
              }
            }
            if (i === f.commands.length)
              throw new Unsupported("루프 탈출 대상 없음");
            f.pc = i + 1;
            break;
          }
          case 118:
            break;
          case 119: {
            const i = f.commands.findIndex(
              (c) => c.raw.code === 118 && c.raw.parameters[0] === p[0],
            );
            if (i < 0) throw new Unsupported("라벨 누락");
            let level = d;
            for (
              let j = Math.min(f.pc - 1, i);
              j <= Math.max(f.pc - 1, i);
              j++
            ) {
              const next = f.commands[j].raw.indent;
              if (next !== level) {
                delete f.branches[level];
                level = next;
              }
            }
            f.pc = i + 1;
            break;
          }
          case 125: {
            const n = p[1] === 0 ? p[2] : value(s, p[2]);
            s.gold = Math.max(
              0,
              Math.min(99999999, s.gold + (p[0] === 0 ? n : -n)),
            );
            break;
          }
          case 126:
          case 127:
          case 128: {
            if (p[4]) throw new Unsupported("장착 장비 제거");
            const table =
              r.code === 126 ? s.items : r.code === 127 ? s.weapons : s.armors;
            const n = p[2] === 0 ? p[3] : value(s, p[3]);
            table[p[0]] = Math.min(
              99,
              Math.max(0, (table[p[0]] || 0) + (p[1] === 0 ? n : -n)),
            );
            break;
          }
          case 129:
            if (p[2]) throw new Unsupported("파티원 초기화");
            if (p[1] === 0 && !s.party.includes(p[0])) s.party.push(p[0]);
            if (p[1] === 1) s.party = s.party.filter((x) => x !== p[0]);
            break;
          case 201:
            s.map = p[0] === 0 ? p[1] : value(s, p[1]);
            s.x = p[0] === 0 ? p[2] : value(s, p[2]);
            s.y = p[0] === 0 ? p[3] : value(s, p[3]);
            Object.assign(s.player, { x: s.x, y: s.y, positionKnown: true });
            if (p[4])
              Object.assign(s.player, {
                direction: p[4],
                directionKnown: true,
              });
            return (this.wait = { type: "transfer", map: s.map });
          case 231:
            s.pictures[p[0]] = {
              name: p[1],
              origin: p[2],
              x: p[3] === 0 ? p[4] : value(s, p[4]),
              y: p[3] === 0 ? p[5] : value(s, p[5]),
              zoomX: p[6],
              zoomY: p[7],
              opacity: p[8],
              blend: p[9],
            };
            break;
          case 232:
            this.note({
              kind: "state_with_simplified_visual",
              reason: "그림 이동의 정적 최종 상태; 이동 시간/이징 생략",
            });
            if (s.pictures[p[0]])
              Object.assign(s.pictures[p[0]], {
                origin: p[2],
                x: p[3] === 0 ? p[4] : value(s, p[4]),
                y: p[3] === 0 ? p[5] : value(s, p[5]),
                zoomX: p[6],
                zoomY: p[7],
                opacity: p[8],
                blend: p[9],
              });
            break;
          case 235:
            delete s.pictures[p[0]];
            break;
          default:
            throw new Unsupported(`명령 ${r.code}: 정확한 호환 처리 필요`);
        }
      } catch (e) {
        return this.fail(e.message, command);
      }
    }
    return (this.wait = { type: "yield" });
  }
  rollback() {
    this.state = clone(this.before);
    this.done = true;
    this.wait = null;
    return this.state;
  }
}

const exact = new Set([
  0, 101, 401, 105, 405, 102, 402, 403, 404, 111, 411, 412, 121, 122, 123, 124,
  117, 115, 112, 113, 413, 118, 119, 125, 126, 127, 128, 129, 201,
]);
export function commandCategory(code) {
  return visual.has(code)
    ? "B"
    : exact.has(code)
      ? "A"
      : [205, 211, 322, 231, 232, 235, 505].includes(code)
        ? "C"
        : "D";
}
