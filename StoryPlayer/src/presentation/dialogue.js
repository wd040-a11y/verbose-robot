import { tokenize, resolveTokens, palettePoint } from "./text.js";
import { loadImage } from "../rendering.js";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
export class Dialogue {
  constructor(element, notice) {
    this.element = element;
    this.notice = notice;
    this.generation = 0;
    this.running = false;
    this.paused = false;
    this.fast = false;
    this.resume = null;
    this.assets = new Map();
  }
  stop() {
    this.generation++;
    this.resume?.();
    this.resume = null;
    this.running = false;
    this.paused = false;
  }
  continue() {
    if (this.paused) {
      this.paused = false;
      this.resume?.();
      this.resume = null;
    } else this.fast = true;
  }
  async image(pkg, name) {
    const key = pkg.id + name;
    if (!this.assets.has(key)) {
      const b = await pkg.image(name);
      if (b) this.assets.set(key, await loadImage(b));
    }
    return this.assets.get(key);
  }
  async render(text, context, { instant = false, fontSize = 22 } = {}) {
    this.stop();
    const gen = this.generation;
    this.fast = instant;
    this.running = true;
    this.element.replaceChildren();
    this.notice.textContent = "";
    const tokens = resolveTokens(tokenize(text), context),
      warnings = new Set();
    let color = "#e4eaf3",
      size = fontSize,
      lineFast = false,
      windowImage,
      icons;
    try {
      windowImage = await this.image(context.pkg, "img/system/Window");
      icons = await this.image(context.pkg, "img/system/IconSet");
    } catch {}
    const canvas = document.createElement("canvas");
    if (windowImage) {
      canvas.width = windowImage.naturalWidth;
      canvas.height = windowImage.naturalHeight;
      canvas.getContext("2d").drawImage(windowImage, 0, 0);
    }
    const append = (value, cls) => {
      const span = document.createElement("span");
      span.textContent = value;
      span.style.color = color;
      span.style.fontSize = size + "px";
      if (cls) span.className = cls;
      this.element.append(span);
      return span;
    };
    for (const t of tokens) {
      if (gen !== this.generation) return;
      if (t.warning) warnings.add(t.warning);
      if(t.type==='speaker'){
        const speaker=append(t.text,'dialogue-speaker');
        speaker.title='원문 이름 표기를 읽기 쉽게 표시합니다. 플러그인의 창 연출은 재현하지 않습니다.';
        continue;
      }
      if (t.type === "text" || t.type === "unsupported") {
        if (t.type === "unsupported")
          warnings.add(`미지원 효과 ${t.raw} (원문 보존)`);
        const span = append(
          "",
          t.type === "unsupported" ? "unknown-effect" : null,
        );
        for (const char of t.text) {
          if (gen !== this.generation) return;
          span.textContent += char;
          if (char === "\n") lineFast = false;
          if (!this.fast && !lineFast) await delay(8);
        }
      } else
        switch (t.code) {
          case "C": {
            try {
              const p = palettePoint(context.engine, t.value);
              if (!windowImage || p.x >= canvas.width || p.y >= canvas.height)
                throw Error();
              const [r, g, b] = canvas
                .getContext("2d")
                .getImageData(p.x, p.y, 1, 1).data;
              color = `rgb(${r}, ${g}, ${b})`;
            } catch {
              color = t.value === 0 ? "#e4eaf3" : "#b9d2ff";
              warnings.add("Window 팔레트 없음/범위 밖 — 대체 색상");
            }
            break;
          }
          case "I": {
            const size = context.engine === "VXACE" ? 24 : 32,
              idx = t.value,
              x = (idx % 16) * size,
              y = Math.floor(idx / 16) * size;
            if (
              icons &&
              x + size <= icons.naturalWidth &&
              y + size <= icons.naturalHeight
            ) {
              const c = document.createElement("canvas");
              c.width = c.height = size;
              c.className = "text-icon";
              c.setAttribute("aria-label", `아이콘 ${idx}`);
              c.getContext("2d").drawImage(
                icons,
                x,
                y,
                size,
                size,
                0,
                0,
                size,
                size,
              );
              this.element.append(c);
            } else {
              append(`[아이콘 ${idx}]`);
              warnings.add("아이콘 이미지 없음");
            }
            break;
          }
          case "{":
            size = Math.min(96, size + 12);
            break;
          case "}":
            size = Math.max(12, size - 12);
            break;
          case "FS":
            size = Math.max(12, Math.min(96, t.value));
            break;
          case ">":
            lineFast = true;
            break;
          case "<":
            lineFast = false;
            break;
          case ".":
          case "|":
            if (!this.fast) await delay(t.code === "." ? 250 : 1000);
            break;
          case "!":
            if (!instant) {
              this.paused = true;
              this.notice.textContent =
                "문장 안에서 일시 정지 — 다음을 누르세요.";
              await new Promise((r) => (this.resume = r));
            }
            break;
          case "^":
            this.noPause = true;
            break;
          case "$":
            append(
              ` [소지금 ${context.state.gold} ${context.currency}]`,
              "gold-window",
            );
            break;
        }
    }
    if (gen === this.generation) {
      this.running = false;
      this.paused = false;
      this.notice.textContent = [...warnings].join(" · ");
    }
  }
}
