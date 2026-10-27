import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Interpreter,
  initial,
  condition,
  selectPage,
  commandCategory,
} from "../src/core.js";
import { migrateState, seedMap, gameData } from "../src/state.js";
import {
  faceRect,
  pictureStyle,
  resourceIndex,
  resolveResource,
} from "../src/resources.js";
import { PluginRegistry, buildRegistry } from "../src/plugins/registry.js";
const c = (code, parameters = [], indent = 0) => ({
  id: `cmd:${code}`,
  raw: { code, parameters, indent },
});
const move = (code, ...parameters) => ({ code, parameters });
const state = () => {
  const s = initial();
  s.characters["1:2"] = {
    x: 2,
    y: 3,
    direction: 2,
    directionKnown: true,
    positionKnown: true,
    directionFix: false,
  };
  return s;
};
const run = (list, opts = {}) =>
  new Interpreter({
    page: { commands: list },
    state: state(),
    context: { map: 1, event: 2 },
    engine: "MV",
    common: async () => null,
    ...opts,
  });
const route = (list, extra = {}) =>
  c(205, [
    0,
    {
      list: [...list, move(0)],
      wait: true,
      repeat: false,
      skippable: true,
      ...extra,
    },
  ]);
test("A pure movement reaches dialogue but never treats commanded coordinates as collision-resolved", async () => {
  const r = run([route([move(3), move(1)]), c(401, ["next"])]);
  assert.equal((await r.advance()).text, "next");
  assert.equal(r.state.characters["1:2"].requestedX, 3);
  assert.equal(r.state.characters["1:2"].positionKnown, false);
  assert.throws(
    () => gameData([5, 0, 0], r.state, { map: 1, event: 2 }),
    /좌표/,
  );
  assert.ok(r.fidelity.some((x) => x.kind === "simplification"));
});
test("B route switch is applied once, then used by another event/page", async () => {
  const r = run([
    route([move(27, 8)]),
    c(111, [0, 8, 0]),
    c(122, [1, 1, 0, 0, 9], 1),
    c(412),
  ]);
  assert.equal((await r.advance()).type, "done");
  assert.equal(r.state.variables[1], 9);
  assert.equal(
    selectPage(
      {
        pages: [
          {
            raw_metadata: { conditions: { switch1Valid: true, switch1Id: 8 } },
          },
        ],
      },
      r.state,
      {},
    ),
    0,
  );
});
test("C script route is preflight-blocked without any evaluation or partial switch effect", async () => {
  const r = run([route([move(27, 8), move(45, "globalThis.pwned=true")])]);
  assert.equal((await r.advance()).type, "blocked");
  assert.equal(globalThis.pwned, undefined);
  assert.equal(r.state.switches[8], undefined);
});
test("D 505 is a serialized editor continuation and never replays route commands", async () => {
  const r = run([
    route([move(27, 8)]),
    c(505, [move(28, 8)]),
    c(401, ["after"]),
  ]);
  assert.equal((await r.advance()).text, "after");
  assert.equal(r.state.switches[8], true);
});
test("E 211 targets player, not current event", async () => {
  const r = run([c(211, [0]), c(401, ["visible"])]);
  assert.equal((await r.advance()).text, "visible");
  assert.equal(r.state.player.transparent, true);
  assert.equal(r.state.characters["1:2"].transparent, undefined);
});
test("F 322 preserves graphics and updates party leader sprite, VX Ace lacks battler slot", async () => {
  for (const engine of ["MV", "MZ", "VXACE"]) {
    const s = state();
    s.party = [1];
    const r = run([c(322, [1, "walk", 2, "portrait", 5, "battler"])], {
      state: s,
      engine,
    });
    await r.advance();
    assert.equal(r.state.actorGraphics[1].faceIndex, 5);
    assert.equal(r.state.player.characterName, "walk");
    assert.equal(
      r.state.actorGraphics[1].battlerName,
      engine === "VXACE" ? undefined : "battler",
    );
  }
});
test("G face crops use engine cell size and 4 columns / 2 rows", () => {
  assert.deepEqual(faceRect("MV", 5, 576, 288), {
    x: 144,
    y: 144,
    width: 144,
    height: 144,
  });
  assert.deepEqual(faceRect("VXACE", 7, 384, 192), {
    x: 288,
    y: 96,
    width: 96,
    height: 96,
  });
  assert.throws(() => faceRect("MZ", 8, 576, 288));
});
test("H picture static transforms, alpha, origin and deletion survive interpreter", async () => {
  const r = run([
    c(231, [1, "a", 1, 0, 100, 200, 50, 75, 128, 0]),
    c(232, [1, 0, 0, 0, 30, 40, 200, 150, 64, 2, 60, true]),
    c(231, [2, "b", 0, 0, 0, 0, 100, 100, 255, 0]),
    c(235, [2]),
  ]);
  await r.advance();
  assert.equal(r.state.pictures[2], undefined);
  const style = pictureStyle(r.state.pictures[1]);
  assert.equal(style.left, "30px");
  assert.equal(style.transform, "translate(0, 0) scale(2, 1.5)");
  assert.equal(style.mixBlendMode, "multiply");
  assert.equal(style.opacity, String(64 / 255));
});
test("I wrapped hashed and canonical resource paths resolve, bare filename and collisions never guessed", () => {
  const a = {
    id: "asset:abcd",
    category: "images",
    logical_path: "img/pictures/a",
    source_path: "img/pictures/a.rpgmvp",
    output_path: null,
  };
  const index = resourceIndex([a]);
  assert.equal(
    resolveResource("Export/assets/images/abcd/a.rpgmvp.png", index).asset.id,
    a.id,
  );
  assert.equal(
    resolveResource("Game/img/pictures/a.PNG", index).asset.id,
    a.id,
  );
  assert.equal(resolveResource("a.png", index).reason, "no_reference");
  assert.equal(
    resolveResource(
      "img/pictures/a.png",
      resourceIndex([a, { ...a, id: "asset:ef12" }]),
    ).reason,
    "ambiguous_reference",
  );
});
test("J missing pictures do not block text, choice and switch", async () => {
  const r = run([
    c(231, [1, "missing", 0, 0, 0, 0, 100, 100, 255, 0]),
    c(102, [["yes"], -1, 0]),
    c(402, [0]),
    c(121, [1, 1, 0], 1),
    c(404),
    c(401, ["after"]),
  ]);
  assert.equal((await r.advance()).type, "choice");
  assert.equal((await r.advance(0)).text, "after");
  assert.equal(r.state.switches[1], true);
});
test("K names alone or unreviewed hashes cannot authorize plugin adapters", async () => {
  const reg = await buildRegistry(
    [{ name: "TMBalloonLoop", enabled: true, archive_path: "fake.js" }],
    async () => new TextEncoder().encode("setBalloonLoop harmless?").buffer,
  );
  const r = run([c(356, ["setBalloonLoop 0 1"])], { plugins: reg });
  assert.equal((await r.advance()).type, "blocked");
  assert.equal(r.state.characters["1:2"].balloonLoop, undefined);
});
test("K reviewed adapter registry has explicit limited behavior, unknown commands still block", async () => {
  const reg = new PluginRegistry(new Map([["TMBalloonLoop", {}]]));
  const r = run([c(356, ["setBalloonLoop 0 3"]), c(356, ["UnknownPlugin"])], {
    plugins: reg,
  });
  assert.equal((await r.advance()).type, "blocked");
  assert.equal(r.state.characters["1:2"].balloonLoop, 3);
});
test("L isolated execution and rollback preserve original state", async () => {
  const s = state(),
    before = structuredClone(s);
  const r = run([route([move(27, 8)]), c(322, [1, "a", 0, "b", 0])], {
    state: s,
  });
  await r.advance();
  assert.deepEqual(s, before);
  assert.notDeepEqual(r.state, s);
  assert.deepEqual(r.rollback(), before);
});
test("seeded random is repeatable, MV rolls each variable while Ace shares operand", async () => {
  for (const engine of ["MV", "VXACE"]) {
    const a = run([c(122, [1, 5, 0, 2, -20, 20])], { engine }),
      b = run([c(122, [1, 5, 0, 2, -20, 20])], { engine });
    await a.advance();
    await b.advance();
    assert.deepEqual(a.state, b.state);
    assert.equal(a.state.rng.draws, engine === "MV" ? 5 : 1);
  }
});
test("known inventory, direction and timer conditions work; unknown time and equipment block", async () => {
  const s = state();
  s.items[8] = 2;
  assert.equal(gameData([0, 8], s, {}), 2);
  assert.equal(condition([6, 0, 2], s, { map: 1, event: 2 }), true);
  s.timer = { working: true, frames: 600, known: true };
  assert.equal(condition([3, 10, 0], s, {}), true);
  s.timer.known = false;
  assert.throws(() => condition([3, 10, 0], s, {}));
  s.party = [1];
  assert.throws(() => condition([9, 3, true], s, {}));
});
test("asynchronous route state changes and nonterminating repeat are not reported as successes", async () => {
  for (const r of [
    route([move(27, 1)], { wait: false }),
    route([move(16)], { repeat: true }),
  ]) {
    assert.equal((await run([r]).advance()).type, "blocked");
  }
  const r = run([route([move(18)], { wait: false }), c(111, [6, 0, 6])]);
  assert.equal((await r.advance()).type, "blocked");
});
test("old state migrates additively and unknown old direction is never guessed", () => {
  const old = {
    switches: { 2: true },
    variables: { 3: 7 },
    self: {},
    items: {},
    weapons: {},
    armors: {},
    gold: 0,
    party: [],
    map: 1,
    x: 4,
    y: 5,
    pictures: {},
  };
  const s = migrateState(structuredClone(old));
  assert.equal(s.variables[3], 7);
  assert.throws(() => condition([6, -1, 2], s, {}));
  assert.equal(s.modelVersion, 2);
});
test("four command categories distinguish execution from unsupported and skipped presentation", () => {
  assert.equal(commandCategory(121), "A");
  assert.equal(commandCategory(224), "B");
  assert.equal(commandCategory(205), "C");
  assert.equal(commandCategory(355), "D");
});

