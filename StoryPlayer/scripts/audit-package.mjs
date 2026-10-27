import fs from "node:fs/promises";
import { ZipReader, Uint8ArrayReader, TextWriter } from "@zip.js/zip.js";
import { Interpreter, initial } from "../src/core.js";
const zip = new ZipReader(
  new Uint8ArrayReader(await fs.readFile(process.argv[2])),
);
try {
  const entries = await zip.getEntries();
  const read = async (path) =>
    JSON.parse(
      await entries.find((e) => e.filename === path).getData(new TextWriter()),
    );
  const manifest = await read("manifest.json"),
    game = (await read("normalized/game.json")).data;
  const commonIndex = (await read("normalized/common_events.json")).data,
    commons = new Map();
  for (const c of commonIndex)
    commons.set(c.id, (await read(c.file)).data.page);
  const report = {
    engine: manifest.engine,
    maps: 0,
    events: 0,
    pages: 0,
    completed: 0,
    blocked: 0,
    bounded: 0,
    textSteps: 0,
    choices: 0,
    blocks: {},
    notes: [
      "Initial-state traversal with first choice; not exhaustive path coverage.",
      "No scripts or plugins executed. Images intentionally absent.",
      "No proprietary dialogue or filenames included.",
    ],
  };
  for (const map of (await read("normalized/maps.json")).data) {
    report.maps++;
    const shard = (await read(map.file)).data;
    for (const event of shard.events) {
      report.events++;
      for (const page of event.pages) {
        report.pages++;
        const r = new Interpreter({
          page,
          state: initial(game.system),
          context: { map: map.map_id, event: event.source.event_id },
          engine: manifest.engine,
          common: async (id) => commons.get("common_event:" + id),
        });
        let result, answer;
        for (let i = 0; i < 2000; i++) {
          result = await r.advance(answer);
          answer = undefined;
          if (result.type === "text") report.textSteps++;
          else if (result.type === "choice") {
            report.choices++;
            answer = 0;
          } else if (["done", "blocked"].includes(result.type)) break;
        }
        if (result.type === "done") report.completed++;
        else if (result.type === "blocked") {
          report.blocked++;
          const code = String(result.raw?.code ?? "limit");
          report.blocks[code] = (report.blocks[code] || 0) + 1;
        } else report.bounded++;
      }
    }
  }
  await fs.writeFile(
    "reports/actual-package.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await zip.close();
}

