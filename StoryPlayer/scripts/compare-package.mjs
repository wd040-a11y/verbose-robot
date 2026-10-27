import fs from "node:fs/promises";
import {
  ZipReader,
  Uint8ArrayReader,
  TextWriter,
  Uint8ArrayWriter,
} from "@zip.js/zip.js";
import { Interpreter, initial, seedMap, selectPage } from "../src/core.js";
import {
  Interpreter as Old,
  initial as oldInitial,
} from "../tests/baseline/core-0.1.js";
import { buildRegistry, sha256 } from "../src/plugins/registry.js";
const bytes = await fs.readFile(process.argv[2]);
const zip = new ZipReader(new Uint8ArrayReader(bytes));
try {
  const entries = await zip.getEntries(),
    byName = new Map(entries.map((e) => [e.filename, e]));
  const read = async (p) =>
    JSON.parse(await byName.get(p).getData(new TextWriter()));
  const manifest = await read("manifest.json"),
    game = (await read("normalized/game.json")).data,
    maps = (await read("normalized/maps.json")).data;
  const commons = new Map();
  for (const c of (await read("normalized/common_events.json")).data)
    commons.set(c.id, (await read(c.file)).data.page);
  const registry = await buildRegistry(
    (await read("normalized/plugins.json")).data,
    async (p) =>
      byName.has(p)
        ? (await byName.get(p).getData(new Uint8ArrayWriter())).buffer
        : null,
  );
  const report = {
    version: "0.2.0",
    package_sha256: await sha256(bytes),
    policy: {
      initial:
        "System defaults, switches false, variables zero, per-page fresh state",
      choices: "first choice (0)",
      max_resumes: 2000,
      max_commands: 100000,
      seed: 0x52475032,
      scope:
        "all map event pages; common events only via call; not all branches",
    },
    before: { completed: 0, blocked: 0, bounded: 0, blocks: {} },
    after: {
      completed: 0,
      blocked: 0,
      bounded: 0,
      blocks: {},
      simplifiedCompleted: 0,
    },
    newlyCompleted: [],
    regressions: [],
    stateRegressions: [],
    pages: [],
    maps: maps.length,
    events: 0,
  };
  const execute = async (r) => {
    let w, answer;
    for (let i = 0; i < 2000; i++) {
      w = await r.advance(answer);
      answer = w.type === "choice" ? 0 : undefined;
      if (["done", "blocked"].includes(w.type)) break;
    }
    return {
      status:
        w.type === "done"
          ? "completed"
          : w.type === "blocked"
            ? "blocked"
            : "bounded",
      block: w.raw?.code ?? null,
      reason: w.type === "blocked" ? w.message : null,
      commands: r.log.filter((x) => x.command).map((x) => x.command),
      state: r.state,
      simplified: r.fidelity?.some((x) => x.kind === "simplification") || false,
    };
  };
  const projection = (s) =>
    Object.fromEntries(
      [
        "switches",
        "variables",
        "self",
        "items",
        "weapons",
        "armors",
        "gold",
        "party",
        "map",
        "x",
        "y",
        "pictures",
      ].map((k) => [k, s[k]]),
    );
  for (const map of maps) {
    const shard = (await read(map.file)).data;
    report.events += shard.events.length;
    for (const e of shard.events)
      for (const page of e.pages) {
        const context = { map: map.map_id, event: e.source.event_id };
        const base = {
          page,
          context,
          engine: manifest.engine,
          common: async (id) => commons.get("common_event:" + id),
        };
        const before = await execute(
          new Old({ ...base, state: oldInitial(game.system) }),
        );
        const state = initial(game.system);
        seedMap(state, shard, map.map_id, selectPage);
        const after = await execute(
          new Interpreter({ ...base, state, plugins: registry }),
        );
        for (const [name, v] of [
          ["before", before],
          ["after", after],
        ]) {
          report[name][v.status]++;
          if (v.block !== null)
            report[name].blocks[v.block] =
              (report[name].blocks[v.block] || 0) + 1;
        }
        if (after.status === "completed" && after.simplified)
          report.after.simplifiedCompleted++;
        if (before.status !== "completed" && after.status === "completed")
          report.newlyCompleted.push(page.id);
        if (before.status === "completed" && after.status !== "completed")
          report.regressions.push(page.id);
        const stateEqual =
          JSON.stringify(projection(before.state)) ===
          JSON.stringify(projection(after.state));
        if (
          before.status === "completed" &&
          after.status === "completed" &&
          !stateEqual
        )
          report.stateRegressions.push(page.id);
        report.pages.push({
          id: page.id,
          before: before.status,
          after: after.status,
          block: after.block,
          reason: after.reason,
          simplified: after.simplified,
          stateEqual: before.status === "completed" ? stateEqual : null,
          pathSha256: await sha256(
            new TextEncoder().encode(JSON.stringify(after.commands)),
          ),
        });
      }
  }
  await fs.writeFile(
    "reports/compatibility-0.2.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        ...report,
        pages: report.pages.length,
        newlyCompleted: report.newlyCompleted.length,
        regressions: report.regressions,
        stateRegressions: report.stateRegressions,
      },
      null,
      2,
    ),
  );
} finally {
  await zip.close();
}
