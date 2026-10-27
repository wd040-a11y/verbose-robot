import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { importZip, Package, safe } from "../src/storage.js";
test("safe path rejects traversal and Windows drive paths", () => {
  for (const p of ["../a", "/a", "C:/a", "x\\a", "x/../a"])
    assert.equal(safe(p), false);
  assert.equal(safe("한글/日本語.json"), true);
});
test("image-less package imports, resources attach by original logical path", async () => {
  const p = await importZip(
    new Blob([
      await fs.readFile(new URL("../fixtures/sample.zip", import.meta.url)),
    ]),
    () => {},
  );
  p.assets = await p.json("normalized/assets.json");
  assert.equal(await p.image("img/pictures/scene"), null);
  await importZip(
    new Blob([
      await fs.readFile(new URL("../fixtures/images.zip", import.meta.url)),
    ]),
    () => {},
    p,
  );
  assert.ok((await p.image("img/pictures/scene")).size > 0);
  assert.equal((await p.json("normalized/maps.json")).length, 2);
});

test("resource import reports success, missing references and corrupt images independently", async () => {
  const p = await importZip(
    new Blob([
      await fs.readFile(new URL("../fixtures/sample.zip", import.meta.url)),
    ]),
    () => {},
  );
  p.assets = await p.json("normalized/assets.json");
  await importZip(
    new Blob([
      await fs.readFile(new URL("../fixtures/images.zip", import.meta.url)),
    ]),
    () => {},
    p,
  );
  assert.equal(p.lastResourceImport.scanned, 4);
  assert.equal(p.lastResourceImport.matched, 2);
  assert.equal(p.lastResourceImport.invalid, 1);
  assert.equal(p.lastResourceImport.noReference, 1);
  assert.ok(await p.image("img/faces/Faces"));
  assert.equal(await p.image("img/faces/Hero"), null);
});
