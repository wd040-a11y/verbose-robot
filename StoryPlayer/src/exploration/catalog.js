export async function classify(
  page,
  common = async () => null,
  seen = new Set(),
  depth = 0,
) {
  const result = {
    dialogue: false,
    choices: false,
    pictures: false,
    movies: false,
    transfer: false,
    state: false,
    system: false,
    unknown: false,
    automatic: [3, 4].includes(page.raw_metadata?.trigger),
    texts: [],
    references: [],
    warnings: [],
  };
  for (const cmd of page.commands || []) {
    const { code, parameters: p = [] } = cmd.raw;
    if ([401, 405].includes(code)) {
      result.dialogue = true;
      result.texts.push({ id: cmd.id, text: p[0], indent: cmd.raw.indent });
    }
    if (code === 102) {
      result.choices = true;
      result.texts.push({ id: cmd.id, choices: p[0], indent: cmd.raw.indent });
    }
    if (code===231 && typeof p[1]==='string' && p[1].trim()) result.pictures=true;
    if (code===261 && typeof p[0]==='string' && p[0].trim()) {result.pictures=true;result.movies=true;}
    if (code === 201) result.transfer = true;
    if ([121, 122, 123, 125, 126, 127, 128, 129, 205, 211, 322].includes(code))
      result.state = true;
    if ([301, 302].includes(code)) result.system = true;
    if ([355, 356, 357].includes(code)) result.unknown = true;
    if (code === 121 || code === 122) {
      const end = Math.min(p[1], p[0] + 10000);
      for (let id = p[0]; id <= end; id++)
        result.references.push({
          kind: code === 121 ? "switches" : "variables",
          id,
          access: "write",
          command: cmd.id,
        });
    }
    if (code === 111 && [0, 1].includes(p[0]))
      result.references.push({
        kind: p[0] === 0 ? "switches" : "variables",
        id: p[1],
        access: "read",
        command: cmd.id,
      });
    if (code === 117) {
      if (depth >= 8 || seen.has(p[0])) {
        result.warnings.push("공통 이벤트 순환/분석 깊이 제한");
        result.unknown = true;
        continue;
      }
      const sub = await common(p[0]);
      if (!sub) {
        result.warnings.push("공통 이벤트 누락");
        result.unknown = true;
        continue;
      }
      const child = await classify(
        sub,
        common,
        new Set([...seen, p[0]]),
        depth + 1,
      );
      for (const k of [
        "dialogue",
        "choices",
        "pictures",
        "movies",
        "transfer",
        "state",
        "system",
        "unknown",
      ])
        result[k] ||= child[k];
      result.texts.push(...child.texts);
      result.references.push(...child.references);
      result.warnings.push(...child.warnings);
    }
  }
  result.category = result.choices
    ? "선택지"
    : result.pictures
      ? "CG 장면"
      : result.dialogue
        ? "대화"
        : result.automatic
          ? "자동/병렬"
          : result.transfer
            ? "장소 이동"
            : result.state || result.system
              ? "시스템 처리"
              : "미분류";
  result.content = result.dialogue || result.choices || result.pictures;
  return result;
}
export function friendlyName(event, info, label) {
  if (label) return label;
  const name = event.raw_metadata?.name || "";
  if (name && !/^EV\d+$/i.test(name)) return name;
  const first = info.texts.find((t) => t.text)?.text;
  return first
    ? `${info.category} · ${first.replace(/\\[A-Za-z]+\[[^\]]*\]/g, "").slice(0, 28)}`
    : `${info.category} 장면`;
}
export function staticText(page) {
  return (page.commands || [])
    .filter((c) => [401, 405, 102].includes(c.raw.code))
    .map((c) => ({
      id: c.id,
      indent: c.raw.indent,
      code: c.raw.code,
      text:
        c.raw.code === 102
          ? c.raw.parameters[0].join(" / ")
          : c.raw.parameters[0],
    }));
}
