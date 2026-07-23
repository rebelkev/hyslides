import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("inline editing hides the original canvas text and its selection handles", () => {
  assert.match(appSource, /function drawEditorCanvas\(\)/);
  assert.match(appSource, /\[editingElementId\]:\s*\{[\s\S]*?hidden:\s*true/);
  assert.match(appSource, /selectedIds\.filter\(\(id\) => id !== editingElementId\)/);
  assert.match(
    appSource,
    /dom\.textEditor\.classList\.add\("open"\);\s*renderCanvas\(\);\s*dom\.textEditor\.focus\(\);/
  );
});

test("inline editor uses transparent, typography-aligned canvas styling", () => {
  assert.match(stylesSource, /\.text-editor\s*\{[\s\S]*?background:\s*transparent;/);
  assert.match(stylesSource, /\.text-editor\s*\{[\s\S]*?padding:\s*2px 0 0;/);
  assert.match(
    appSource,
    /dom\.textEditor\.style\.fontSize = `\$\{typography\.fontSize \* zoom\}px`;/
  );
  assert.match(appSource, /dom\.textEditor\.style\.textAlign = element\.bulletList/);
});
