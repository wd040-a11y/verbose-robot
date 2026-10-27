export function el(tag, text, parent, cls) {
  const n = document.createElement(tag);
  if (text !== undefined && text !== null) n.textContent = text;
  if (cls) n.className = cls;
  parent?.append(n);
  return n;
}
export function button(text, action, parent, cls) {
  const b = el("button", text, parent, cls);
  b.type = "button";
  let busy = false;
  b.onclick = async () => {
    if (busy || b.disabled) return;
    busy = true;
    b.setAttribute("aria-busy", "true");
    try {
      await action();
    } catch (e) {
      window.dispatchEvent(
        new CustomEvent("player-error", { detail: e.message }),
      );
    } finally {
      busy = false;
      b.removeAttribute("aria-busy");
    }
  };
  return b;
}
export function input(parent, label, type = "search") {
  const i = el("input", null, parent);
  i.type = type;
  i.placeholder = label;
  i.setAttribute("aria-label", label);
  return i;
}
export function select(parent, label, values) {
  const s = el("select", null, parent);
  s.setAttribute("aria-label", label);
  for (const [v, t] of values) el("option", t, s).value = v;
  return s;
}
export function download(name, data, mime = "application/json") {
  const blob =
      data instanceof Blob
        ? data
        : new Blob(
            [typeof data === "string" ? data : JSON.stringify(data, null, 2)],
            { type: mime },
          ),
    url = URL.createObjectURL(blob),
    a = el("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function details(parent, title, data) {
  const d = el("details", null, parent);
  el("summary", title, d);
  el("pre", typeof data === "string" ? data : JSON.stringify(data, null, 2), d);
  return d;
}
export function modal(title) {
  const d = el("dialog", null, document.body, "modal");
  el("h2", title, d);
  button("닫기", () => d.close(), d, "close");
  d.addEventListener("close", () => d.remove());
  d.showModal();
  return d;
}
export function paginate(
  parent,
  rows,
  page,
  render,
  { size = 30, onPage } = {},
) {
  const total = Math.max(1, Math.ceil(rows.length / size));
  page = Math.max(0, Math.min(page, total - 1));
  const list = el("div", null, parent);
  rows.slice(page * size, (page + 1) * size).forEach((x) => render(x, list));
  const bar = el("div", null, parent, "pagination");
  button("앞 페이지", () => onPage(Math.max(0, page - 1)), bar).disabled =
    page === 0;
  el("span", `${page + 1} / ${total} · ${rows.length}개`, bar);
  button(
    "뒤 페이지",
    () => onPage(Math.min(total - 1, page + 1)),
    bar,
  ).disabled = page === total - 1;
}
