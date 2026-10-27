import { test } from "node:test";
import assert from "node:assert/strict";
import { Interpreter, initial, selectPage } from "../src/core.js";
import { History } from "../src/core/history.js";
import { changes, applyChanges } from "../src/core/changes.js";
import { pagePlan } from "../src/exploration/conditions.js";
import { classify } from "../src/exploration/catalog.js";
import {
  tokenize,
  resolveTokens,
  compatibleTranslation,
  palettePoint,
} from "../src/presentation/text.js";
import {
  checkResult,
  mergeResults,
  chooseConflict,
  analysisZip,
  displayText,
} from "../src/enrichment/manager.js";
import { actorStatus, evaluateStat } from "../src/character/status.js";
import { validateSave, previewPreset } from "../src/core/saves.js";
import { ZipReader, BlobReader, TextWriter } from "@zip.js/zip.js";
const cmd = (code, p = [], indent = 0, id) => ({
  id: id || `c:${code}:${Math.random()}`,
  raw: { code, parameters: p, indent },
});
const run = (commands, opts = {}) =>
  new Interpreter({
    page: { commands },
    state: initial(),
    context: { map: 1, event: 1 },
    engine: "MV",
    common: async () => null,
    ...opts,
  });
test("history restores switches, variables, pictures and choices; alternate branch has no old side effects", async () => {
  const r = run([
    cmd(401, ["start"]),
    cmd(102, [["A", "B"], -2, 0]),
    cmd(402, [0]),
    cmd(121, [1, 1, 0], 1),
    cmd(122, [2, 2, 0, 0, 9], 1),
    cmd(231, [1, "CG", 0, 0, 10, 20, 100, 100, 255, 0], 1),
    cmd(401, ["A"], 1),
    cmd(402, [1]),
    cmd(401, ["B"], 1),
    cmd(404),
    cmd(401, ["end"]),
  ]);
  const h = new History(r);
  await h.next();
  await h.next();
  await h.next(0);
  assert.equal(r.state.switches[1], true);
  assert.ok(r.state.pictures[1]);
  h.back();
  assert.equal(h.current.display.type, "choice");
  assert.equal(r.state.switches[1], undefined);
  assert.equal(r.state.variables[2], undefined);
  assert.deepEqual(r.state.pictures, {});
  await h.next(1);
  assert.equal(h.current.display.text, "B");
  assert.equal(r.state.switches[1], undefined);
  assert.equal(h.branches.length, 1);
  assert.ok(h.text().includes("선택: B"));
  assert.ok(!h.text().includes("선택: A"));
});
test("history restores common event frames, RNG and transfer state deterministically", async () => {
  const page = {
    commands: [cmd(122, [1, 1, 0, 2, 1, 100]), cmd(401, ["inside"])],
  };
  const r = run(
    [
      cmd(401, ["before"]),
      cmd(117, [1]),
      cmd(201, [0, 2, 3, 4, 2, 0]),
      cmd(401, ["after"]),
    ],
    { common: async () => page },
  );
  const h = new History(r);
  await h.next();
  await h.next();
  const n = r.state.variables[1],
    seed = r.state.rng.seed;
  h.back();
  await h.next();
  assert.equal(r.state.variables[1], n);
  assert.equal(r.state.rng.seed, seed);
  await h.next();
  assert.equal(r.state.map, 2);
  h.seek(1);
  assert.equal(r.state.map, 0);
  await h.next();
  assert.equal(r.state.map, 2);
});
test("history stores changes at presentation boundaries, not copies of large unchanged state", async () => {
  const state = initial();
  state.variables = Object.fromEntries(
    Array.from({ length: 10000 }, (_, i) => [i, i]),
  );
  const h = new History(
    run(
      Array.from({ length: 20 }, (_, i) => cmd(401, ["line " + i])),
      { state },
    ),
  );
  for (let i = 0; i < 20; i++) await h.next();
  assert.ok(h.points.every((p) => p.patch.length === 0));
  assert.ok(h.bytes < 20000);
});
test("history prevents concurrent advances and enforces a bounded record budget", async () => {
  const h = new History(run([cmd(401, ["one"]), cmd(401, ["two"])]), {
    maxPoints: 1,
  });
  await h.next();
  await assert.rejects(() => h.next(), /한도/);
});
test("condition planner changes only page conditions and reports higher-page/inner dependencies", () => {
  const state = initial();
  const event = {
    pages: [
      {
        id: "p0",
        raw_metadata: {
          conditions: {
            switch1Valid: true,
            switch1Id: 3,
            variableValid: true,
            variableId: 7,
            variableValue: 5,
          },
        },
        commands: [cmd(111, [0, 9, 0]), cmd(117, [1])],
      },
      { id: "p1", raw_metadata: { conditions: {} }, commands: [] },
    ],
  };
  const p = pagePlan(event, 0, state, { map: 1, event: 2 });
  assert.equal(p.state.switches[3], true);
  assert.equal(p.state.variables[7], 5);
  assert.equal(p.state.switches[9], undefined);
  assert.equal(state.switches[3], undefined);
  assert.equal(p.selected, 1);
  assert.ok(p.warnings.length >= 3);
});
test("classification follows common events and reports recursive references without inventing dialogue", async () => {
  const common = { commands: [cmd(401, ["actual"]), cmd(117, [1])] };
  const r = await classify({ commands: [cmd(117, [1])] }, async () => common);
  assert.equal(r.dialogue, true);
  assert.ok(r.warnings.length);
  const s = await classify({ commands: [cmd(121, [1, 1, 0])] });
  assert.equal(s.category, "시스템 처리");
  assert.equal(s.texts.length, 0);
});
test("text tokens preserve literals and unknown effects, resolve standard state references", () => {
  const t = tokenize(
    String.raw`\C[14]親密\C[0] \V[3] \N[1] \P[1] \G \I[2] \\ \WC[9]`,
  );
  const s = initial();
  s.variables[3] = 65;
  s.party = [1];
  const r = resolveTokens(t, {
    state: s,
    actors: [null, { name: "A" }],
    currency: "G",
  });
  assert.ok(r.some((x) => x.text === "65"));
  assert.ok(r.some((x) => x.type === "unsupported" && x.raw === "\\WC[9]"));
  assert.ok(r.some((x) => x.type === "text" && x.text.includes("\\")));
  assert.deepEqual(palettePoint("MV", 14), { x: 174, y: 162 });
  assert.deepEqual(palettePoint("VXACE", 14), { x: 116, y: 108 });
});
test("translation rejects damaged control tokens but supports contextual distinct IDs", () => {
  assert.equal(compatibleTranslation("\\V[3]人", "\\V[3]명"), true);
  assert.equal(compatibleTranslation("\\V[3]人", "\\V[4]명"), false);
  const s = {
    items: {
      "translation:a": { value: { text: "가" } },
      "translation:b": { value: { text: "나" } },
    },
  };
  assert.equal(displayText(s, "a", "同じ", "ko"), "가");
  assert.equal(displayText(s, "b", "同じ", "ko"), "나");
});
const index = {
  "event:1": { kind: "event" },
  "line:1": { kind: "command", text: "\\C[14]話\\C[0]" },
  "switch:3": { kind: "switch" },
  "variable:7": { kind: "variable" },
  "actor:1": { kind: "actor" },
  "asset:1": { kind: "asset", logical_path: "img/pictures/A" },
};
const item = (type = "translation", value = { text: "\\C[14]대화\\C[0]" }) => ({
  target_id: "line:1",
  type,
  value,
  evidence: ["line:1"],
  confidence: 0.8,
  uncertainties: [],
});
const file = (items) => ({ schema_version: "1.0.0", package_id: "pkg", items });
test("analysis validator rejects invented IDs, wrong package, unsafe fields and broken translation tokens", () => {
  assert.equal(checkResult(file([item()]), "pkg", index).length, 1);
  assert.throws(() =>
    checkResult(file([{ ...item(), target_id: "invented" }]), "pkg", index),
  );
  assert.throws(() => checkResult(file([item()]), "other", index));
  assert.throws(() =>
    checkResult(file([{ ...item(), raw: { code: 121 } }]), "pkg", index),
  );
  assert.throws(() =>
    checkResult(file([item("translation", { text: "대화" })]), "pkg", index),
  );
});
test("analysis merge retains conflicts until explicit selection; semantic review is local", () => {
  const a = mergeResults(null, [item("label", { text: "첫 해석" })]),
    b = mergeResults(a, [item("label", { text: "다른 해석" })]);
  assert.equal(b.items["label:line:1"].value.text, "첫 해석");
  assert.equal(b.conflicts.length, 1);
  chooseConflict(b, 0, true);
  assert.equal(b.items["label:line:1"].value.text, "다른 해석");
  assert.equal(b.items["label:line:1"].reviewed, false);
});
test("analysis export contains schema and fixed instructions, splits tasks, excludes binary images", async () => {
  const blob = await analysisZip("pkg", index, { maxChars: 100 });
  const z = new ZipReader(new BlobReader(blob));
  const es = await z.getEntries();
  assert.ok(es.some((x) => x.filename === "result.schema.json"));
  assert.ok(es.filter((x) => x.filename.startsWith("jobs/")).length > 1);
  assert.ok(!es.some((x) => x.filename.endsWith(".png")));
  const instruction = await es
    .find((x) => x.filename === "INSTRUCTIONS.ko.txt")
    .getData(new TextWriter());
  assert.ok(instruction.includes("코드를 실행하지"));
  await z.close();
});
test("presets/custom stats use exact source values and reject unknown references", () => {
  const s = initial();
  const plan = previewPreset(s, [
    { kind: "variable", id: 7, value: 65 },
    { kind: "switch", id: 3, value: true },
  ]);
  assert.equal(s.variables[7], undefined);
  assert.equal(
    evaluateStat(
      { sources: [{ kind: "variable", id: 7 }], operation: "value" },
      plan.state,
    ),
    65,
  );
  assert.throws(() =>
    checkResult(
      file([
        item("stat", {
          text: "호감",
          operation: "value",
          sources: [{ kind: "variable", id: 999 }],
        }),
      ]),
      "pkg",
      index,
    ),
  );
  applyChanges(plan.state, plan.patch, true);
  assert.deepEqual(plan.state, s);
});
test("actor preview distinguishes initial database calculations and unknown live HP", () => {
  const s = initial();
  const db = {
    Actors: [
      null,
      { id: 1, name: "A", initialLevel: 2, classId: 1, equips: [1] },
    ],
    Classes: [
      null,
      { name: "Knight", params: Array.from({ length: 8 }, () => [0, 10, 20]) },
    ],
    Weapons: [null, { params: Array(8).fill(2) }],
    Armors: [],
  };
  const a = actorStatus(1, s, db);
  assert.equal(a.hp, null);
  assert.ok(a.provenance.includes("초기"));
  assert.deepEqual(a.values, Array(8).fill(22));
  assert.equal(s.actors[1], undefined);
});
test("save import requires matching game identity and preserves unrecognized compatible state fields", () => {
  const s = initial();
  s.pluginState = { reviewed: { x: 1 } };
  const data = {
    format: "rpg-story-save",
    version: 1,
    package_id: "pkg",
    state: s,
  };
  assert.deepEqual(validateSave(data, "pkg"), s);
  assert.throws(() => validateSave(data, "other"));
  assert.throws(() =>
    validateSave({ ...data, state: { ...s, variables: { 1: "oops" } } }, "pkg"),
  );
});
