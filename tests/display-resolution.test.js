import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("presentation and participant canvases render at display pixel density", () => {
  assert.match(app, /function prepareHighResolutionCanvas/);
  assert.match(app, /window\.devicePixelRatio/);
  assert.match(app, /Math\.min\(3, displayScale/);
  assert.match(app, /context\.setTransform\(resolutionScale/);
  assert.match(app, /prepareHighResolutionCanvas\(dom\.presenterCanvas, presenterCtx\)/);
  assert.match(app, /prepareHighResolutionCanvas\(dom\.audienceCanvas, audienceCtx\)/);
  assert.match(styles, /body\.presentation-window #presenterCanvas[\s\S]*aspect-ratio: 16 \/ 9/);
});

test("display canvases redraw after viewport and fullscreen changes", () => {
  assert.match(app, /window\.addEventListener\("resize"[\s\S]*renderPresenter\(\)[\s\S]*renderAudience\(\)/);
  assert.match(app, /document\.addEventListener\("fullscreenchange"[\s\S]*renderPresenter\(\)[\s\S]*renderAudience\(\)/);
});
