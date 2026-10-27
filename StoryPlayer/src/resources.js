export function normalizePath(path) {
  if (typeof path !== "string" || /[\x00-\x1f]/.test(path))
    throw Error("잘못된 경로");
  const p = path.replaceAll("\\", "/").normalize("NFC");
  if (
    p.startsWith("/") ||
    p.includes(":") ||
    p.split("/").some((x) => !x || x === "." || x === "..")
  )
    throw Error("안전하지 않은 경로");
  return p;
}
const fold = (p) => normalizePath(p).toLowerCase();
export function resourceIndex(assets) {
  const index = new Map();
  for (const a of assets.filter((x) => x.category === "images")) {
    const candidates = [a.output_path, a.source_path];
    for (const ext of [".png", ".jpg", ".jpeg", ".webp"])
      candidates.push(a.logical_path + ext);
    if (a.source_path) {
      const stem = a.source_path.replace(/\.(rpgmvp_?|png_)$/i, "");
      candidates.push(stem + ".png");
    }
    if (/^asset:[a-f0-9]+$/.test(a.id) && a.source_path) {
      const base = `assets/images/${a.id.slice(6)}/${a.source_path.replaceAll("\\", "/").split("/").at(-1)}`;
      candidates.push(base, base + ".png");
    }
    for (const p of candidates.filter(Boolean)) {
      const k = fold(p);
      if (!k.includes("/")) continue;
      if (!index.has(k)) index.set(k, new Map());
      index.get(k).set(a.id, a);
    }
  }
  return index;
}
export function resolveResource(path, index) {
  const p = fold(path),
    parts = p.split("/");
  const found = new Map();
  for (let i = 0; i < parts.length - 1; i++)
    for (const [id, a] of index.get(parts.slice(i).join("/")) || [])
      found.set(id, a);
  if (found.size > 1) return { reason: "ambiguous_reference" };
  if (found.size === 0) return { reason: "no_reference" };
  return { asset: [...found.values()][0] };
}
export async function inspectImage(blob) {
  if (blob.size > 128 * 1024 * 1024) throw Error("이미지 용량 제한");
  const b = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  let mime, width, height;
  if (
    b.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)
  ) {
    const v = new DataView(b.buffer);
    width = v.getUint32(16);
    height = v.getUint32(20);
    mime = "image/png";
    const tail = new Uint8Array(await blob.slice(-12).arrayBuffer());
    if (String.fromCharCode(...tail.slice(4, 8)) !== "IEND")
      throw Error("불완전한 PNG");
  } else if (b[0] === 255 && b[1] === 216 && b[2] === 255) {
    mime = "image/jpeg";
    const tail = new Uint8Array(await blob.slice(-2).arrayBuffer());
    if (tail[0] !== 255 || tail[1] !== 217) throw Error("불완전한 JPEG");
  } else if (
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.slice(8, 12)) === "WEBP"
  ) {
    mime = "image/webp";
    if (new DataView(b.buffer).getUint32(4, true) + 8 !== blob.size)
      throw Error("불완전한 WebP");
  } else throw Error("지원 형식 아님: 복원된 PNG/JPEG/WebP가 필요합니다");
  if (width !== undefined && (!width || !height || width * height > 64e6))
    throw Error("이미지 해상도 제한");
  const typed = blob.slice(0, blob.size, mime);
  if (typeof createImageBitmap === "function") {
    let img;
    try {
      img = await createImageBitmap(typed);
      width = img.width;
      height = img.height;
    } catch {
      throw Error("이미지 디코딩 실패");
    } finally {
      img?.close();
    }
    if (width * height > 64e6) throw Error("이미지 해상도 제한");
  }
  return { blob: typed, mime, width, height };
}
export function faceRect(engine, index, width, height) {
  const size = engine === "VXACE" ? 96 : 144;
  if (!Number.isInteger(index) || index < 0 || index > 7)
    throw Error("얼굴 인덱스는 0~7이어야 합니다");
  const x = (index % 4) * size,
    y = Math.floor(index / 4) * size;
  if (width < x + size || height < y + size)
    throw Error("엔진 규격보다 작은 얼굴 시트");
  return { x, y, width: size, height: size };
}
export function pictureStyle(p) {
  return {
    left: `${p.x}px`,
    top: `${p.y}px`,
    opacity: String(Math.max(0, Math.min(255, p.opacity)) / 255),
    transform: `translate(${p.origin === 1 ? "-50%" : "0"}, ${p.origin === 1 ? "-50%" : "0"}) scale(${p.zoomX / 100}, ${p.zoomY / 100})`,
    transformOrigin: p.origin === 1 ? "center center" : "top left",
    mixBlendMode:
      { 0: "normal", 1: "plus-lighter", 2: "multiply", 3: "screen" }[p.blend] ||
      "normal",
  };
}
