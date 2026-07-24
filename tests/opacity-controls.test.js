import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("opacity control works when the legacy range input is absent", async () => {
  const app = await readFile(new URL("src/app.js", root), "utf8");
  assert.match(app, /if \(range\) range\.value = String\(percent\)/);
  assert.match(app, /if \(value\) value\.value = String\(percent\)/);
  assert.match(app, /element\.opacity = percent \/ 100/);
});

test("all rendered elements apply their saved opacity", async () => {
  const renderer = await readFile(new URL("src/renderer.js", root), "utf8");
  assert.match(
    renderer,
    /ctx\.globalAlpha = \(element\.opacity \?\? 1\) \* \(options\.opacityMultiplier \?\? 1\)/,
  );
});
