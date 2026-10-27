import { character } from "../state.js";
// Audited implementations only. No JS from a package is evaluated or imported.
export const reviewed = {
  TMBalloonLoop:
    "3439810999b71a2096907812250b87071d01f8ff485369e7f2acab50694615d3",
  GetInformation:
    "8456decce34a7c57bcba35cba2684b0b845d06fca8d3649d11a73a3f39504e0f",
  CommonPopupCore:
    "c96b29a67e00b2d66f1bbcd62e770b273c3354e56d85d30c36b271a9a0108a17",
};
export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function buildRegistry(
  metadata = [],
  readSource = async () => null,
) {
  const verified = new Map(),
    sources = [];
  for (const p of metadata.filter((x) => x.enabled)) {
    const bytes = p.archive_path ? await readSource(p.archive_path) : null;
    const hash = bytes ? await sha256(bytes) : null;
    sources.push({
      name: p.name,
      path: p.archive_path,
      hash,
      verified: hash === reviewed[p.name],
    });
    if (hash && hash === reviewed[p.name]) verified.set(p.name, p);
  }
  return new PluginRegistry(verified, sources);
}
export class PluginRegistry {
  constructor(verified = new Map(), sources = []) {
    this.verified = verified;
    this.sources = sources;
  }
  execute(engine, code, p, s, ctx, note) {
    if (code !== 356 || engine !== "MV")
      throw Error("이 엔진의 플러그인 명령에 검증된 어댑터가 없습니다");
    // MV command356 uses literal-space splitting, not shell parsing or eval.
    const parts = String(p[0]).split(" "),
      name = parts.shift();
    if (name === "setBalloonLoop" && this.verified.has("TMBalloonLoop")) {
      if (parts.length !== 2 || parts.some((x) => !/^[-]?\d+$/.test(x)))
        throw Error("setBalloonLoop 인수 형식 미지원");
      const target = +parts[0],
        balloon = +parts[1];
      if (target < -1 || balloon < 0 || balloon > 10)
        throw Error("풍선 명령 인수 범위 미지원");
      character(s, target, ctx).balloonLoop = balloon;
      note({
        kind: "state_with_simplified_visual",
        adapter: "TMBalloonLoop",
        sourceHash: reviewed.TMBalloonLoop,
      });
      return null;
    }
    if (
      ["ShowInfo", "インフォ表示"].includes(name) &&
      this.verified.has("GetInformation") &&
      this.verified.has("CommonPopupCore")
    ) {
      const raw = parts[0];
      if (raw === undefined) throw Error("ShowInfo 텍스트 누락");
      if (raw === "" || raw === "null") return null;
      // Tokens that require actor/item context are deliberately not guessed.
      if (/_(actor|aicon|class|name|icon|num|desc[12])/.test(raw))
        throw Error("ShowInfo 동적 치환 컨텍스트 미지원");
      const text = raw.replace(/^_se\[(.+?)\]/i, "").replace(/\\n/g, "\n");
      const param = this.verified.get("GetInformation").parameters || {};
      const max = Number(param["Log Max"] || 100);
      if (!Number.isInteger(max) || max < 0 || max > 10000)
        throw Error("플러그인 로그 최대 길이 미지원");
      s.pluginState ??= {};
      const log = (s.pluginState.infoLog ??= []);
      log.unshift(text);
      log.length = Math.min(log.length, max);
      note({
        kind: "state_with_simplified_visual",
        adapter: "GetInformation",
        sourceHash: reviewed.GetInformation,
        reason: "팝업을 대사로 표시; 정보 로그 보존; 시간/SE 생략",
      });
      return { type: "text", text, notification: true };
    }
    const candidates = this.sources.filter((x) =>
      name === "setBalloonLoop"
        ? x.name === "TMBalloonLoop"
        : ["ShowInfo", "インフォ表示"].includes(name)
          ? x.name === "GetInformation"
          : name.startsWith("P_CALL")
            ? x.name === "PictureCallCommon"
            : false,
    );
    const reason = candidates.length
      ? candidates
          .map(
            (x) =>
              `${x.name}: ${x.verified ? "해당 형식 어댑터 없음" : "소스 누락 또는 검토한 해시와 다름"}`,
          )
          .join("; ")
      : "출처와 동작이 검증된 어댑터 없음";
    throw Error(`플러그인 ${name}: ${reason}`);
  }
}
