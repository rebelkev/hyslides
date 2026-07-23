import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("mobile presenter exposes focused controller tabs and quick slide flow", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const script = await readFile(new URL("src/app.js", root), "utf8");
  const styles = await readFile(new URL("styles.css", root), "utf8");

  for (const tab of ["control", "slides", "notes", "live", "qna"]) {
    assert.match(html, new RegExp(`data-presenter-mobile-tab="${tab}"`));
  }
  assert.match(html, /id="presenterMobileSlideList"/);
  assert.match(script, /renderPresenterFlowList\(dom\.presenterMobileSlideList, true\)/);
  assert.match(styles, /\.presenter-mobile-tabs/);
  assert.match(styles, /\.presenter\[data-mobile-tab="qna"\]/);
  assert.match(styles, /body\.presentation-window \.presenter-mobile-tabs/);
});
