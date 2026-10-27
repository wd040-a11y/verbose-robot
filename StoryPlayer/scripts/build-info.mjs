import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
async function files(dir) {
  const all = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.posix.join(dir, e.name);
    if (e.isDirectory()) all.push(...(await files(p)));
    else all.push(p);
  }
  return all;
}
const hash = createHash("sha256");
for (const file of [
  ...(await files("src")),
  "index.html",
  "package.json",
  "package-lock.json",
  "vite.config.js",
].sort()) {
  hash.update(file + "\n");
  hash.update((await fs.readFile(file, "utf8")).replaceAll("\r\n", "\n"));
}
await fs.mkdir("public", { recursive: true });
await fs.writeFile(
  "public/build-info.json",
  JSON.stringify(
    { version: "0.3.0", source_sha256: hash.digest("hex") },
    null,
    2,
  ),
);

