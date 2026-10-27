import { chromium, webkit, _electron } from "@playwright/test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
let browser, app, page;
const mode = process.env.PLAYER_EXE
  ? "electron"
  : process.env.PLAYER_BROWSER || "chromium";
if (process.env.PLAYER_EXE) {
  app = await _electron.launch({
    executablePath: path.resolve(process.env.PLAYER_EXE),
  });
  page = await app.firstWindow();
} else {
  browser = await (mode === "webkit" ? webkit : chromium).launch({
    headless: true,
    ...(mode === "chromium" ? { args: ["--no-sandbox"] } : {}),
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(process.env.PLAYER_URL || "http://127.0.0.1:5173");
}
page.setDefaultTimeout(30000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles(path.resolve("fixtures/sample.zip"));
  const map = page.getByRole("button", { name: "1 · 시작 마을", exact: true });
  await map.waitFor({ timeout: 120000 });
  await map.click();
  const npc = () => page.locator("article").filter({ hasText: "안내 NPC" });
  await npc().getByRole("button", { name: "일반 실행", exact: true }).click();
  await page.getByText("환영합니다.", { exact: true }).waitFor();
  await page
    .getByText("그림 1: scene — 리소스 미등록 (이벤트 계속 실행)", {
      exact: true,
    })
    .waitFor();
  await page
    .getByText("얼굴: Faces [5] — 이미지 없음", { exact: true })
    .waitFor();
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles(path.resolve("fixtures/images.zip"));
  await page
    .getByText(
      /이미지 연결 결과 · 검사 4개 · 정상 연결 2개 · 참조 대상 없음 1개 · 형식 오류 1개/,
    )
    .waitFor();
  await page.locator('canvas[data-face-index="5"]').waitFor();
  const pixel = await page
    .locator('canvas[data-face-index="5"]')
    .evaluate((c) => [...c.getContext("2d").getImageData(30, 30, 1, 1).data]);
  assert.deepEqual(pixel, [30, 220, 220, 255]);
  await page.waitForFunction(
    () => document.querySelectorAll("img.picture").length === 2,
  );
  const picture = page.locator('[data-picture-id="1"]');
  assert.ok(
    Math.abs(
      Number(await picture.evaluate((x) => x.style.opacity)) - 192 / 255,
    ) < 0.000001,
  );
  assert.equal(await picture.evaluate((x) => x.style.left), "408px");
  assert.deepEqual(
    await page
      .locator(".picture")
      .evaluateAll((es) => es.map((e) => e.dataset.pictureId)),
    ["1", "2"],
  );
  await page.screenshot({
    path: `reports/${mode}-face-cg.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "문 열기", exact: true }).click();
  await page.getByText("문이 열렸습니다.", { exact: true }).waitFor();
  const sw = () =>
    page.locator("label").filter({ hasText: "1 문 열림" }).locator("input");
  assert.equal(await sw().isChecked(), true);
  assert.equal(await page.locator(".picture").count(), 1);
  assert.equal(await picture.evaluate((x) => x.style.left), "400px");
  assert.equal(
    await picture.evaluate((x) => x.style.transform),
    "translate(-50%, -50%) scale(1.5, 0.75)",
  );
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByText(/^이벤트 종료/).waitFor();
  // Image gallery works independently after interpreter completion.
  await page.getByPlaceholder("이미지 이름 / 경로 검색").fill("Faces");
  await page
    .locator(".image-row")
    .getByRole("button", { name: "미리보기", exact: true })
    .click();
  await page.locator(".image-preview img").waitFor();
  assert.equal(
    await page.locator(".image-preview img").evaluate((x) => x.naturalWidth),
    576,
  );
  await page
    .getByRole("button", { name: "실행 전으로 되돌리기", exact: true })
    .click();
  assert.equal(await sw().isChecked(), false);
  await npc()
    .getByRole("button", { name: "임시 상태로 강제 감상", exact: true })
    .click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "문 열기", exact: true }).click();
  await page.getByText("문이 열렸습니다.", { exact: true }).waitFor();
  assert.equal(await sw().isChecked(), false);
  // A new normal execution starts from the unchanged real world.
  await npc().getByRole("button", { name: "일반 실행", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "문 열기", exact: true }).click();
  assert.equal(await sw().isChecked(), true);
  await page
    .locator("article")
    .filter({ hasText: "호환 처리 필요" })
    .getByRole("button", { name: "일반 실행", exact: true })
    .click();
  await page.getByText(/이 이벤트 실행 중단/).waitFor();
  await page.getByRole("button", { name: "2 · 엔딩 방", exact: true }).click();
  await page.getByRole("button", { name: "일반 실행", exact: true }).click();
  await page.getByText("엔딩입니다.", { exact: true }).waitFor();
  await page.reload();
  await map.waitFor();
  assert.equal(await sw().isChecked(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `reports/${mode}-mobile.png`, fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `reports/${mode}-gui.json`,
    JSON.stringify(
      {
        mode,
        version: "0.2.0",
        passed: true,
        facePixel: pixel,
        checks: [
          "route_to_text",
          "switch_choice",
          "face_crop",
          "image_missing",
          "image_attach_report",
          "picture_layers",
          "picture_move_delete",
          "independent_gallery",
          "temporary_isolation",
          "rollback",
          "blocked_event_isolation",
          "persistence",
          "mobile_width",
        ],
        iosDeviceTested: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "GUI PASS " +
      mode +
      " : routes, face crop, CG layers/transforms, gallery, state isolation, persistence",
  );
} catch (e) {
  await page
    .screenshot({ path: `reports/${mode}-failure.png`, fullPage: true })
    .catch(() => {});
  await fs
    .writeFile(
      `reports/${mode}-failure.txt`,
      String(e) + "\n" + (await page.locator("body").innerText()),
    )
    .catch(() => {});
  throw e;
} finally {
  if (app) await app.close();
  if (browser) await browser.close();
}
