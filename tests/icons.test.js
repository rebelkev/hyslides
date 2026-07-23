import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "../src/schema.js";

const root = new URL("../", import.meta.url);

test("new icons carry corporate-friendly style and accessibility defaults", () => {
  const icon = createElement("icon");
  assert.equal(icon.icon, "sparkles");
  assert.equal(icon.iconFrame, "none");
  assert.equal(icon.frameBrandColorStyleId, null);
  assert.equal(icon.decorative, true);
  assert.equal(icon.strokeWidth, 2);
  assert.equal(icon.w, 160);
  assert.equal(icon.h, 160);
});

test("icon properties expose searchable Lucide selection and styling controls", async () => {
  const script = await readFile(new URL("src/app.js", root), "utf8");
  assert.match(script, /Search 1,500\+ icons/);
  assert.match(script, /Search by Category/);
  assert.match(script, /Data & analytics/);
  assert.match(script, /Load more icons/);
  assert.match(script, /iconPickerResults\(query, category\)/);
  assert.match(script, /Lucide Icons · MIT licensed/);
  assert.match(script, /iconColorControlMarkup\("iconColorInput"/);
  assert.match(script, /iconColorControlMarkup\("iconFrameFillInput"/);
  assert.match(script, /Global color styles/);
  assert.match(script, /data-icon-style-id/);
  assert.match(script, /bindIconColorControls/);
  assert.match(script, /id="iconStrokeWidthInput"/);
  assert.match(script, /id="iconFrameInput"/);
  assert.match(script, /id="iconPaddingInput"/);
  assert.match(script, /id="iconDecorativeInput"/);
  assert.match(script, /id="iconAltInput"/);
  assert.match(script, /data-icon-choice/);
});

test("canvas renderer uses the selected icon asset and preserves a legacy fallback", async () => {
  const renderer = await readFile(new URL("src/renderer.js", root), "utf8");
  assert.match(renderer, /element\.type === "icon" && element\.iconSrc/);
  assert.match(renderer, /imageCache\.get\(element\.iconSrc\)/);
  assert.match(renderer, /Legacy fallback/);
});
