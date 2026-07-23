import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("element properties prioritize type controls and use compact shared controls", async () => {
  const script = await readFile(new URL("src/app.js", root), "utf8");
  const start = script.indexOf("function renderElementInspector(element)");
  const end = script.indexOf("function elementTypeHeading(element)");
  const inspector = script.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(inspector, /id="(?:x|y|w|h)Input"/);
  assert.doesNotMatch(inspector, /id="opacityRange"/);
  assert.match(inspector, /id="opacityValue" type="number"/);
  assert.match(inspector, /id="elementLockToggle"/);
  assert.ok(inspector.indexOf("${elementInspectorFields(element)}") < inspector.indexOf('id="nameInput"'));
  assert.ok(inspector.indexOf('id="animationEffectInput"') > inspector.indexOf('id="opacityValue"'));
});
