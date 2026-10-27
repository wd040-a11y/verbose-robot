import { copy, changes, applyChanges } from "./changes.js";
function machine(r) {
  const w = r.wait ? { ...r.wait } : null;
  if (w?.frame) {
    w.frameIndex = r.stack.indexOf(w.frame);
    delete w.frame;
  }
  return {
    stack: r.stack.map((f) => ({
      ...f,
      commands: f.commands,
      ctx: copy(f.ctx),
      branches: copy(f.branches),
    })),
    wait: w ? copy(w) : null,
    done: r.done,
    steps: r.steps,
  };
}
function restore(r, m) {
  r.stack = m.stack.map((f) => ({
    ...f,
    commands: f.commands,
    ctx: copy(f.ctx),
    branches: copy(f.branches),
  }));
  r.wait = copy(m.wait);
  if (r.wait?.frameIndex !== undefined) {
    r.wait.frame = r.stack[r.wait.frameIndex];
    delete r.wait.frameIndex;
  }
  r.done = m.done;
  r.steps = m.steps;
}
export class History {
  constructor(runner, { maxPoints = 1500, maxBytes = 24 * 1024 * 1024 } = {}) {
    this.runner = runner;
    this.root = copy(runner.state);
    this.previous = copy(runner.state);
    this.points = [];
    this.cursor = -1;
    this.branches = [];
    this.maxPoints = maxPoints;
    this.maxBytes = maxBytes;
    this.bytes = 0;
    this.busy = false;
    this.logLength = runner.log.length;
    this.fidelityLength = runner.fidelity.length;
  }
  async next(answer) {
    if (this.busy) return this.current?.display;
    if (this.points.length >= this.maxPoints || this.bytes >= this.maxBytes)
      throw Error(
        "대화 기록 한도에 도달했습니다. 기록을 내보낸 뒤 새 감상을 시작하세요.",
      );
    this.busy = true;
    try {
      if (this.cursor < this.points.length - 1) {
        const future = this.points.slice(this.cursor + 1);
        this.branches.push({ at: this.cursor, points: future });
        this.points.length = this.cursor + 1;
      }
      const selected =
        this.current?.display.type === "choice"
          ? {
              command: this.current.display.command,
              index: answer,
              text:
                answer === "cancel"
                  ? "취소"
                  : this.current.display.choices[answer],
            }
          : null;
      const display = await this.runner.advance(answer);
      // The choice frame is live interpreter state, never part of the visible record.
      const visible = { ...display };
      delete visible.frame;
      const patch = changes(this.previous, this.runner.state);
      const p = {
        display: copy(visible),
        patch,
        machine: machine(this.runner),
        selected,
        log: copy(this.runner.log.slice(this.logLength)),
        fidelity: copy(this.runner.fidelity.slice(this.fidelityLength)),
      };
      this.bytes +=
        JSON.stringify({
          display: p.display,
          patch,
          log: p.log,
          fidelity: p.fidelity,
        }).length * 2;
      this.points.push(p);
      this.cursor++;
      this.previous = copy(this.runner.state);
      this.logLength = this.runner.log.length;
      this.fidelityLength = this.runner.fidelity.length;
      return p.display;
    } finally {
      this.busy = false;
    }
  }
  get current() {
    return this.points[this.cursor];
  }
  seek(index) {
    if (this.busy) throw Error("실행 중에는 기록을 이동할 수 없습니다.");
    if (!Number.isInteger(index) || index < 0 || index >= this.points.length)
      throw Error("잘못된 기록 위치");
    if (index < this.cursor)
      for (let i = this.cursor; i > index; i--)
        applyChanges(this.runner.state, this.points[i].patch, true);
    else
      for (let i = this.cursor + 1; i <= index; i++)
        applyChanges(this.runner.state, this.points[i].patch);
    this.cursor = index;
    restore(this.runner, this.points[index].machine);
    this.runner.log = this.points
      .slice(0, index + 1)
      .flatMap((p) => copy(p.log));
    this.runner.fidelity = this.points
      .slice(0, index + 1)
      .flatMap((p) => copy(p.fidelity));
    this.previous = copy(this.runner.state);
    this.logLength = this.runner.log.length;
    this.fidelityLength = this.runner.fidelity.length;
    return this.current.display;
  }
  back() {
    return this.seek(Math.max(0, this.cursor - 1));
  }
  archive() {
    return {
      version: 1,
      created: new Date().toISOString(),
      root: copy(this.root),
      cursor: this.cursor,
      points: this.points.map(({ display, patch, selected }) => ({
        display,
        patch,
        selected,
      })),
      branches: this.branches.map((b) => ({
        at: b.at,
        points: b.points.map(({ display, patch, selected }) => ({
          display,
          patch,
          selected,
        })),
      })),
    };
  }
  text() {
    return this.points
      .slice(0, this.cursor + 1)
      .flatMap((p) =>
        [
          p.selected ? `선택: ${p.selected.text}` : null,
          p.display.type === "text"
            ? `${p.display.speaker ? p.display.speaker + ":\n" : ""}${p.display.text}`
            : null,
        ].filter(Boolean),
      )
      .join("\n\n");
  }
}
