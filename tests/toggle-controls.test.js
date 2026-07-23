import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("all native boolean inputs are presented as consistent toggle switches", () => {
  assert.match(styles, /input\[type="checkbox"\]\s*\{[\s\S]*appearance:\s*none/);
  assert.match(styles, /input\[type="checkbox"\]::before/);
  assert.match(styles, /input\[type="checkbox"\]:checked/);
  assert.match(styles, /input:focus-visible/);
});

test("icon library status only reports the result count", () => {
  assert.doesNotMatch(app, /Search the full library/);
  assert.match(app, /id="iconResultCount"/);
});
