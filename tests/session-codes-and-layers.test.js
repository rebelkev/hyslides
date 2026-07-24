import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { materializeAudienceJoinElements } from "../src/live.js";
import { createElement, createFreshAudienceAccessCode, normalizeElement } from "../src/schema.js";

const root = new URL("../", import.meta.url);

test("new session access codes are six digits and differ from the prior session", () => {
  for (let index = 0; index < 100; index += 1) {
    const code = createFreshAudienceAccessCode("123456");
    assert.match(code, /^\d{6}$/);
    assert.notEqual(code, "123456");
  }
});

test("live views inject session access details without changing editor placeholders", () => {
  const slide = {
    id: "slide",
    elements: [
      createElement("image", { audienceJoinRole: "qr", src: "editor-placeholder" }),
      createElement("text", { audienceJoinRole: "code", text: "Access code: 000000" }),
    ],
  };

  const liveSlide = materializeAudienceJoinElements(slide, "654321");

  assert.equal(slide.elements[0].src, "editor-placeholder");
  assert.equal(slide.elements[1].text, "Access code: 000000");
  assert.match(liveSlide.elements[0].src, /^data:image\/svg\+xml/);
  assert.equal(liveSlide.elements[1].text, "Access code: 654321");
});

test("element visibility persists through normalization and defaults to visible", () => {
  assert.equal(createElement("text").visible, true);
  assert.equal(normalizeElement({ id: "hidden", type: "shape", visible: false }).visible, false);
});

test("the Elements panel supports layer dragging and visibility controls", async () => {
  const app = await readFile(new URL("src/app.js", root), "utf8");
  const renderer = await readFile(new URL("src/renderer.js", root), "utf8");
  assert.match(app, /data-layer-id=/);
  assert.match(app, /data-element-visibility=/);
  assert.match(app, /function reorderSlideElement/);
  assert.match(app, /function toggleElementVisibility/);
  assert.match(renderer, /element\.visible === false/);
});
