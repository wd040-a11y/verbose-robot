export async function* sourceRows(
  pkg,
  game,
  maps,
  commons,
  db,
  { progress = () => {}, cancelled = () => false } = {},
) {
  let rows = [];
  const add = (id, value) => { if (id) rows.push({ id, ...value }); };
  (game.system.switches || []).forEach((text, id) => {
    if (id) add(`switch:${id}`, { kind: "switch", text });
  });
  (game.system.variables || []).forEach((text, id) => {
    if (id) add(`variable:${id}`, { kind: "variable", text });
  });
  for (const [table, kind] of [
    ["Actors", "actor"],
    ["Items", "item"],
    ["Skills", "skill"],
    ["Classes", "class"],
    ["States", "status"],
  ])
    for (const r of db[table] || []) {
      if (!r) continue;
      add(`${kind}:${r.id}`, {
        kind,
        text: r.name,
        description: r.description || r.profile || "",
      });
      if (r.description || r.profile)
        add(`${kind}:${r.id}:description`, {
          kind: "description",
          text: r.description || r.profile,
        });
    }
  const page = (p, event, map) => {
    add(p.id, {
      kind: "page",
      event,
      map,
      conditions: p.raw_metadata?.conditions,
      trigger: p.raw_metadata?.trigger,
    });
    for (const c of p.commands) {
      const { code, parameters: params, indent } = c.raw;
      add(c.id, {
        kind: "command",
        event,
        map,
        code,
        indent,
        parameters: params,
        text: [401, 405].includes(code) ? params[0] : undefined,
      });
      if (code === 102)
        params[0].forEach((text, i) =>
          add(`${c.id}:choice:${i}`, {
            kind: "choice",
            text,
            event,
            command: c.id,
          }),
        );
    }
  };
  yield* rows; rows = [];
  for (let i = 0; i < maps.length; i++) {
    if (cancelled()) throw Error("분석 준비 취소");
    const m = maps[i];
    add(`map:${m.map_id}`, { kind: "map", text: m.name });
    const shard = await pkg.json(m.file);
    for (const e of shard.events) {
      add(e.id, {
        kind: "event",
        text: e.raw_metadata.name,
        map: m.map_id,
        event_id: e.source.event_id,
        pages: e.pages.map((p) => p.id),
      });
      for (const p of e.pages) page(p, e.id, m.map_id);
    }
    yield* rows; rows = [];
    progress(i + 1, maps.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  for (const c of commons) {
    if (cancelled()) throw Error("분석 준비 취소");
    const e = await pkg.json(c.file);
    add(c.id, { kind: "common", text: e.raw_metadata?.name || c.name || c.id });
    page(e.page, c.id, null);
    yield* rows; rows = [];
  }
  for (const a of pkg.assets || [])
    add(a.id, {
      kind: "asset",
      logical_path: a.logical_path,
      source_path: a.source_path,
      used_by: a.used_by || [],
      category: a.category,
    });
  yield* rows;
}

export async function buildSources(pkg, game, maps, commons, db, options = {}) {
  const index = {};
  let size = 0;
  for await (const row of sourceRows(pkg, game, maps, commons, db, options)) {
    if (options.wanted && !options.wanted.has(row.id)) continue;
    size += JSON.stringify(row).length;
    if (size > 30e6) throw Error("전체 상태 인덱스가 너무 큽니다. 분석 자료 내보내기는 맵별 분할 방식으로 이용할 수 있습니다.");
    index[row.id] = row;
  }
  return index;
}
