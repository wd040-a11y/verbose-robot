import {
  resourceIndex,
  resolveResource,
  inspectImage,
  normalizePath,
} from "./resources.js";
import { buildRegistry } from "./plugins/registry.js";
import Ajv from "ajv/dist/2020.js";
import schema from "./package.schema.json" with { type: "json" };
const validate = new Ajv({ strict: false, allErrors: false }).compile(schema);
import { ZipReader, BlobReader, BlobWriter } from "@zip.js/zip.js";
export const safe = (p) =>
  typeof p === "string" &&
  !p.startsWith("/") &&
  !p.includes("\\") &&
  !p.includes(":") &&
  !p.split("/").some((x) => x === ".." || x === "");
const db = new Promise((ok, no) => {
  const r = indexedDB.open("rpg-story-player", 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore("files");
    r.result.createObjectStore("meta");
  };
  r.onsuccess = () => ok(r.result);
  r.onerror = () => no(r.error);
});
export async function get(store, key) {
  const d = await db;
  return new Promise((ok, no) => {
    const r = d.transaction(store).objectStore(store).get(key);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}
export async function put(store, key, v) {
  const d = await db;
  return new Promise((ok, no) => {
    const t = d.transaction(store, "readwrite");
    t.objectStore(store).put(v, key);
    t.oncomplete = ok;
    t.onerror = () => no(t.error);
    t.onabort = () => no(t.error);
  });
}
export async function library() {
  const d = await db;
  return new Promise((ok) => {
    const r = d.transaction("meta").objectStore("meta").getAll();
    r.onsuccess = () => ok(r.result.filter((x) => x.manifest));
  });
}
export class Package {
  constructor(meta) {
    Object.assign(this, meta);
    this.cache = new Map();
  }
  async json(path) {
    if (!safe(path)) throw Error("안전하지 않은 참조");
    if (this.cache.has(path)) return this.cache.get(path);
    const b = await get("files", this.id + "/" + path);
    if (!b) throw Error("파일 누락: " + path);
    if (b.size > 32 * 1024 * 1024) throw Error("JSON 한도 32 MiB");
    const v = JSON.parse(await b.text());
    if (!validate(v)) throw Error("패키지 스키마 검증 실패: " + path);
    if (
      v.package_id !== this.manifest.package_id ||
      v.schema_version !== "1.1.0" ||
      v.engine !== this.manifest.engine
    )
      throw Error("패키지 식별 정보 불일치");
    if (v.data === undefined) throw Error("data 누락");
    this.cache.set(path, v.data);
    if (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value);
    return v.data;
  }
  async source(path) {
    if (!safe(path)) return null;
    const b = await get("files", this.id + "/" + path);
    return b && b.size <= 4 * 1024 * 1024 ? await b.arrayBuffer() : null;
  }
  async plugins() {
    let metadata;
    try {
      metadata = await this.json("normalized/plugins.json");
    } catch {
      return buildRegistry();
    }
    return buildRegistry(metadata, (p) => this.source(p));
  }
  async imageEntries() {
    const assets = await this.json("normalized/assets.json");
    const result = [];
    for (const a of assets.filter((x) => x.category === "images"))
      result.push({ ...a, connected: !!(await this.image(a.logical_path)) });
    return result;
  }
  async image(logical) {
    const assets = await this.json("normalized/assets.json");
    const a = assets.find((x) => x.logical_path === logical);
    if (!a) return null;
    return (
      (await get("files", this.id + "/resource/" + logical)) ||
      (a.output_path
        ? await get("files", this.id + "/" + a.output_path)
        : null) ||
      null
    );
  }
}
export async function importZip(file, progress, existing) {
  // Sequential native Streams avoid worker-pool stalls observed in WebKit.
  // CRC checks and per-entry/total size limits remain enabled.
  const zip = new ZipReader(new BlobReader(file), { useWebWorkers: false });
  try {
    const entries = await zip.getEntries();
    if (entries.length > 30000) throw Error("파일 개수 한도");
    let total = 0;
    const paths = new Set();
    for (const e of entries) {
      if (e.directory) continue;
      const entryPath = existing ? normalizePath(e.filename) : e.filename;
      if (!safe(entryPath) || paths.has(entryPath.toLowerCase()))
        throw Error("중복/안전하지 않은 ZIP 경로");
      paths.add(entryPath.toLowerCase());
      total += e.uncompressedSize;
      if (e.uncompressedSize > 128 * 1024 * 1024 || total > 2 * 1024 ** 3)
        throw Error("ZIP 처리 한도 초과");
    }
    const manifests = entries.filter(
      (e) =>
        e.filename === "manifest.json" || e.filename.endsWith("/manifest.json"),
    );
    if (existing) {
      const report = {
        scanned: 0,
        matched: 0,
        noReference: 0,
        invalid: 0,
        ambiguous: 0,
        files: [],
      };
      const index = resourceIndex(
        existing.assets || (await existing.json("normalized/assets.json")),
      );
      const targets = new Map();
      for (const e of entries.filter((e) => !e.directory)) {
        const a = resolveResource(e.filename, index).asset;
        if (a)
          targets.set(a.logical_path, (targets.get(a.logical_path) || 0) + 1);
      }
      const resolved = new Set();
      for (const e of entries) {
        if (e.directory) continue;
        report.scanned++;
        const match = resolveResource(e.filename, index);
        if (!match.asset) {
          if (match.reason === "ambiguous_reference") report.ambiguous++;
          else report.noReference++;
          report.files.push({ path: e.filename, status: match.reason });
        } else if (targets.get(match.asset.logical_path) > 1) {
          report.ambiguous++;
          report.files.push({ path: e.filename, status: "duplicate_target" });
        } else {
          try {
            const info = await inspectImage(
              await e.getData(new BlobWriter(), { checkSignature: true }),
            );
            await put(
              "files",
              existing.id + "/resource/" + match.asset.logical_path,
              info.blob,
            );
            resolved.add(match.asset.logical_path);
            report.matched++;
            report.files.push({
              path: e.filename,
              status: "connected",
              logical: match.asset.logical_path,
              mime: info.mime,
              width: info.width,
              height: info.height,
            });
          } catch (error) {
            report.invalid++;
            report.files.push({
              path: e.filename,
              status: "invalid_format",
              reason: error.message,
            });
          }
        }
        progress(report.scanned, entries.length);
      }
      existing.lastResourceImport = report;
      await put("meta", "resource-report:" + existing.id, report);
      return existing;
    }
    if (manifests.length !== 1)
      throw Error("manifest.json이 정확히 하나 필요합니다");
    const m = manifests[0];
    if (m.uncompressedSize > 1024 * 1024) throw Error("manifest 크기 제한");
    const manifest = JSON.parse(
      await (
        await m.getData(new BlobWriter(), { checkSignature: true })
      ).text(),
    );
    if (!validate(manifest)) throw Error("manifest 스키마 검증 실패");
    if (
      manifest.schema_version !== "1.1.0" ||
      !["MV", "MZ", "MV_MZ", "VXACE"].includes(manifest.engine) ||
      typeof manifest.package_id !== "string"
    )
      throw Error("지원하지 않는 패키지");
    const prefix = m.filename.slice(0, -13),
      id = crypto.randomUUID();
    let i = 0;
    for (const e of entries) {
      if (!e.directory && e.filename.startsWith(prefix)) {
        const path = e.filename.slice(prefix.length);
        if (
          /^(normalized\/|events\/|assets\/|source_archive\/js\/plugins\/|manifest.json$)/.test(
            path,
          )
        )
          await put(
            "files",
            id + "/" + path,
            await e.getData(new BlobWriter(), { checkSignature: true }),
          );
      }
      progress(++i, entries.length);
    }
    const meta = { id, manifest, created: new Date().toISOString() },
      p = new Package(meta);
    const [game, maps, events] = await Promise.all([
      p.json("normalized/game.json"),
      p.json("normalized/maps.json"),
      p.json("normalized/events.json"),
    ]);
    if (!Array.isArray(maps) || !Array.isArray(events))
      throw Error("잘못된 인덱스");
    for (const x of [...maps, ...events])
      if (!safe(x.file)) throw Error("잘못된 이벤트 파일 참조");
    Object.assign(meta, {
      title: game.title || manifest.game_id,
      maps: maps.length,
      events: events.length,
    });
    await put("meta", id, meta);
    return new Package(meta);
  } finally {
    await zip.close();
  }
}
