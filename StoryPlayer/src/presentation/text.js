// Tokenize before resolving values. Never insert game text as HTML.
export function tokenize(text) {
  const out = [];
  let buffer = "";
  const flush = () => {
    if (buffer) {
      out.push({ type: "text", text: buffer });
      buffer = "";
    }
  };
  text = String(text ?? "");
  for (let i = 0; i < text.length;) {
    if (text[i] !== "\\") {
      buffer += text[i++];
      continue;
    }
    if (text[i + 1] === "\\") {
      buffer += "\\";
      i += 2;
      continue;
    }
    flush();
    const start = i++;
    let code = "";
    if (/[A-Za-z]/.test(text[i] || "")) {
      while (i < text.length && /[A-Za-z]/.test(text[i])) code += text[i++];
    } else code = text[i++] || "";
    let arg = null;
    if(code.toUpperCase()==='N' && text[i]==='<'){
      const end=text.indexOf('>',i+1);
      if(end>=0){out.push({type:'speaker',text:text.slice(i+1,end),raw:text.slice(start,end+1)});i=end+1;continue;}
    }
    if (text[i] === "[") {
      const end = text.indexOf("]", i);
      if (end >= 0) {
        arg = text.slice(i + 1, end);
        i = end + 1;
      }
    }
    out.push({
      type: "control",
      code: code.toUpperCase(),
      arg,
      raw: text.slice(start, i),
    });
  }
  flush();
  return out;
}
export function tokenSignature(text) {
  return tokenize(text)
    .filter((t) => t.type === "control" || t.type === "speaker")
    .map((t) => t.type === "speaker" ? t.raw : `${t.code}[${t.arg ?? ""}]`);
}
export function compatibleTranslation(original, translated) {
  return (
    JSON.stringify(tokenSignature(original)) ===
    JSON.stringify(tokenSignature(translated))
  );
}
export function resolveTokens(
  tokens,
  {
    state,
    actors = [],
    currency = "",
    engine = "MV",
    textAdapters = new Map(),
  } = {},
) {
  return tokens.map((t) => {
    if (t.type === "text" || t.type === "speaker") return t;
    const n = Number(t.arg),
      valid = /^\d+$/.test(t.arg ?? "");
    if (state.storyStatic && ["V","P"].includes(t.code)) return {type:"text",text:t.raw,warning:"정적 감상: 동적 값 미확정"};
    if (t.code === "V" && valid)
      return { type: "text", text: String(state.variables[n] ?? 0) };
    if (t.code === "N" && valid)
      return {
        type: "text",
        text: state.actors?.[n]?.name ?? actors[n]?.name ?? "",
        warning: !actors[n] && !state.actors?.[n] ? "인물 이름 미확인" : null,
      };
    if (t.code === "P" && valid) {
      const id = state.party[n - 1];
      return {
        type: "text",
        text: state.actors?.[id]?.name ?? actors[id]?.name ?? "",
      };
    }
    if (t.code === "G") return { type: "text", text: currency };
    if (["C", "I"].includes(t.code) && valid) return { ...t, value: n };
    if (t.code === "FS" && valid && engine === "MZ") return { ...t, value: n };
    if (
      ["{", "}", ".", "|", "!", ">", "<", "^", "$"].includes(t.code) &&
      t.arg === null
    )
      return t;
    // Only application-owned, reviewed adapters may register effects. Imported analysis cannot.
    if (textAdapters.has(t.code)) return textAdapters.get(t.code)(t, state);
    return { ...t, type: "unsupported", text: t.raw };
  });
}
export function palettePoint(engine, n) {
  if (!Number.isInteger(n) || n < 0 || n > 31)
    throw Error("팔레트 인덱스 범위");
  const ace = engine === "VXACE",
    cell = ace ? 8 : 12;
  return {
    x: (ace ? 64 : 96) + (n % 8) * cell + cell / 2,
    y: (ace ? 96 : 144) + Math.floor(n / 8) * cell + cell / 2,
  };
}

// Navigation is a plain-text summary; the original text remains untouched.
export function previewText(text) {
  return tokenize(text).map(t => {
    if (t.type === 'text') return t.text;
    if (t.type === 'speaker') return t.text+' · ';
    if (['C','FS','{','}','.','|','!','>','<','^','$'].includes(t.code)) return '';
    if (t.code === 'I') return '[아이콘]';
    if (t.code === 'V') return '[변수 '+t.arg+']';
    if (t.code === 'N') return '[인물 '+t.arg+']';
    if (t.code === 'P') return '[파티원 '+t.arg+']';
    if (t.code === 'G') return '[화폐]';
    return '[미지원 효과]';
  }).join('').replace(/\s+/g,' ').trim();
}
