import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const htmlSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const rendererSource = fs.readFileSync(new URL("../src/renderer.js", import.meta.url), "utf8");

test("PowerPoint guidance opens from the import action instead of slide properties", () => {
  assert.match(htmlSource, /id="importPptxBtn"/);
  assert.match(htmlSource, /id="pptxImportOverlay"/);
  assert.doesNotMatch(appSource, /<strong>PowerPoint import summary<\/strong>/);
});

test("the duplicate zoom-bar animation preview is removed", () => {
  assert.doesNotMatch(htmlSource, /id="previewAnimationsBtn"/);
  assert.doesNotMatch(appSource, /querySelector\("#previewAnimationsBtn"\)/);
});

test("slide properties do not expose deck color-style management", () => {
  const slideInspector = appSource.slice(
    appSource.indexOf("function renderSlideInspector"),
    appSource.indexOf("function renderElementInspector")
  );
  assert.doesNotMatch(slideInspector, /Saved brand colors/);
  assert.doesNotMatch(slideInspector, /saveBrandColorBtn/);
});

test("shape properties provide friendly types and rounded-corner radius", () => {
  assert.match(appSource, /\["roundedRect", "Rounded rectangle"\]/);
  assert.match(appSource, /id="shapeRadiusInput"/);
  assert.match(rendererSource, /element\.shape === "diamond"/);
  assert.match(rendererSource, /element\.shape === "hexagon"/);
});

