import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("element properties lead with shared controls and use compact alignment buttons", async () => {
  const script = await readFile(new URL("src/app.js", root), "utf8");
  const start = script.indexOf("function renderElementInspector(element)");
  const end = script.indexOf("function elementTypeHeading(element)");
  const inspector = script.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(inspector, /id="(?:x|y|w|h)Input"/);
  assert.doesNotMatch(inspector, /id="opacityRange"/);
  assert.match(inspector, /id="opacityValue" type="number"/);
  assert.match(inspector, /id="elementLockToggle"/);
  assert.ok(inspector.indexOf('id="nameInput"') < inspector.indexOf("${elementInspectorFields(element)}"));
  assert.ok(inspector.indexOf('id="animationEffectInput"') > inspector.indexOf('id="opacityValue"'));
  assert.match(script, /\["left", "align-left", "Align left"\]/);
  assert.match(script, /\["center", "align-center", "Align center"\]/);
  assert.match(script, /\["right", "align-right", "Align right"\]/);
  assert.match(script, /data-text-align="\$\{value\}"/);
  assert.doesNotMatch(script, /id="alignInput"/);
});
