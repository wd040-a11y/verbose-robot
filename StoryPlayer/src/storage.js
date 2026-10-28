import {mountZip,mountResource,lazyFile,lazyResource,readEntry} from './lazy-zip.js';
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
    r.onsuccess = () => {
      const value = r.result;
      // 0.1 stores remain readable; new records avoid browser-specific Blob persistence.
      ok(
        store === "files" && value?.kind === "rpg-bytes-v1"
          ? new Blob([value.bytes], { type: value.mime })
          : value,
      );
    };
    r.onerror = () => no(r.error);
  });
}
export async function put(store, key, v) {
  // Read bytes before opening the transaction: awaiting Blob IO inside an IDB
  // transaction can also make it inactive. Existing file-size limits bound this copy.
  if (store === "files" && v instanceof Blob)
    v = {
      kind: "rpg-bytes-v1",
      mime: v.type,
      bytes: new Uint8Array(await v.arrayBuffer()),
    };
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
    r.onsuccess = () => ok(r.result.filter((x) => x?.manifest));
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
    const b = (await get("files", this.id + "/" + path)) || await lazyFile(this.id,path,32*1024**2);
    if (!b) throw Error(this.lazyArchive ? "지연 로딩 ZIP을 다시 선택해 주세요. 원본 ZIP은 저장소에 복사하지 않았습니다: "+path : "파일 누락: " + path);
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
    const b = (await get("files", this.id + "/" + path)) || await lazyFile(this.id,path,4*1024**2);
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
    const blob = (
      (await get("files", this.id + "/resource/" + logical)) || await lazyResource(this.id,logical) ||
      (a.output_path
        ? (await get("files", this.id + "/" + a.output_path)) || await lazyFile(this.id,a.output_path,128*1024**2)
        : null) ||
      null
    );
    return blob ? (await inspectImage(blob)).blob : null;
  }
}
export async function importZip(file, progress, existing) {
  // Read sequentially with native Streams, without worker lifecycle dependencies.
  // CRC checks and per-entry/total size limits remain enabled.
  const zip = new ZipReader(new BlobReader(file), { useWebWorkers: false });
  let retained=false;
  try {
    const entries = await zip.getEntries();
    if (entries.length > 30000) throw Error(`ZIP 파일 개수 ${entries.length}개: 한도 30000개 초과`);
    let total = 0;
    const paths = new Set();
    for (const e of entries) {
      if (e.directory) continue;
      const entryPath = existing ? normalizePath(e.filename) : e.filename;
      if (!safe(entryPath) || paths.has(entryPath.toLowerCase()))
        throw Error("중복/안전하지 않은 ZIP 경로: "+e.filename);
      paths.add(entryPath.toLowerCase());
      total += e.uncompressedSize;
      if(!Number.isSafeInteger(e.uncompressedSize)||!Number.isSafeInteger(total))throw Error(`ZIP 크기 메타데이터 오류: ${e.filename}`);
    }
    const lazy=total>256*1024**2 || file.size>256*1024**2;
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
            if(lazy){mountResource(existing.id,match.asset.logical_path,e);retained=true;report.matched++;report.files.push({path:e.filename,status:'linked_unverified',logical:match.asset.logical_path});progress(report.scanned,entries.length);continue;}
            const info = await inspectImage(
              await readEntry(e,128*1024**2),
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
      id = lazy ? ((await library()).find(x=>x.lazyArchive&&x.manifest.package_id===manifest.package_id)?.id || crypto.randomUUID()) : crypto.randomUUID();
    if(lazy){mountZip(id,zip,entries,prefix);retained=true;}
    let i = 0;
    for (const e of entries) {
      if (!e.directory && e.filename.startsWith(prefix)) {
        const path = e.filename.slice(prefix.length);
        if (
          /^(normalized\/|events\/|assets\/|source_archive\/js\/plugins\/|manifest.json$)/.test(
            path,
          )
        )
          if(!lazy)await put(
            "files",
            id + "/" + path,
            await readEntry(e,128*1024**2),
          );
      }
      progress(++i, entries.length);
    }
    const meta = { id, manifest, lazyArchive:lazy, archiveName:file.name||null, archiveBytes:file.size, expandedBytes:total, created: new Date().toISOString() },
      p = new Package(meta);
    const [game, maps, events] = await Promise.all([
      p.json("normalized/game.json"),
      p.json("normalized/maps.json"),
      p.json("normalized/events.json"),
    ]);
    if (!Array.isArray(maps) || !Array.isArray(events))
      throw Error("잘못된 인덱스");
    if(!maps.length || !events.length)throw Error(`감상 데이터 부족: 맵 ${maps.length}개 / 이벤트 ${events.length}개. 추출 보고서의 누락·파싱 오류를 확인하세요.`);
    for (const x of [...maps, ...events])
      if (!safe(x.file)) throw Error("잘못된 이벤트 파일 참조");
    Object.assign(meta, {
      title: game.title || manifest.game_id,
      maps: maps.length,
      events: events.length,
    });
    await put("meta", "places-v1:"+id, null);
    await put("meta", id, meta);
    return new Package(meta);
  } finally {
    if(!retained)await zip.close();
  }
}
