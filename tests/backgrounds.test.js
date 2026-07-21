import test from "node:test";
import assert from "node:assert/strict";

import { backgroundImageRect } from "../src/renderer.js";
import { createSlide, normalizeDeck, createDeck } from "../src/schema.js";
import { normalizeBackgroundIntensity } from "../src/backgrounds.js";

test("background images retain proportions in cover mode", () => {
  assert.deepEqual(backgroundImageRect(800, 600, "cover"), { x: 0, y: -120, width: 1280, height: 960 });
});

test("background images retain proportions in contain mode", () => {
  assert.deepEqual(backgroundImageRect(800, 600, "contain"), { x: 160, y: 0, width: 960, height: 720 });
});

test("advanced background settings survive deck normalization", () => {
  const slide = createSlide({ backgroundType: "gradient", backgroundGradientStart: "#112233", backgroundGradientEnd: "#aabbcc", backgroundGradientAngle: 42, backgroundOverlayEnabled: true, backgroundOverlayOpacity: 0.35, backgroundShader: "none", backgroundEffectColorA: "#ff0000", backgroundEffectColorB: "#00ff00" });
  const normalized = normalizeDeck(createDeck({ slides: [slide] }));
  assert.equal(normalized.slides[0].backgroundType, "gradient");
  assert.equal(normalized.slides[0].backgroundGradientAngle, 42);
  assert.equal(normalized.slides[0].backgroundOverlayOpacity, 0.35);
  assert.equal(normalized.slides[0].backgroundOverlayEnabled, true);
  assert.equal(normalized.slides[0].backgroundShader, "none");
  assert.equal(normalized.slides[0].backgroundEffectColorA, "#ff0000");
  assert.equal(normalized.slides[0].backgroundEffectColorB, "#00ff00");
  assert.equal(createSlide().backgroundImageFit, "cover");
});

test("overlays are optional and legacy nonzero overlays remain enabled", () => {
  assert.equal(createSlide().backgroundOverlayEnabled, false);
  const normalized = normalizeDeck(createDeck({
    slides: [{ ...createSlide(), backgroundOverlayEnabled: undefined, backgroundOverlayOpacity: 0.25 }],
  }));
  assert.equal(normalized.slides[0].backgroundOverlayEnabled, true);
});

test("existing shader backgrounds migrate to the animated background style", () => {
  const normalized = normalizeDeck(createDeck({
    slides: [{ ...createSlide(), backgroundType: "color", backgroundShader: "waves" }],
  }));
  assert.equal(normalized.slides[0].backgroundType, "animated");
  assert.equal(normalized.slides[0].backgroundShader, "waves");
});

test("animated background intensity supports the full zero-to-one range", () => {
  assert.equal(normalizeBackgroundIntensity(0), 0);
  assert.equal(normalizeBackgroundIntensity(0.35), 0.35);
  assert.equal(normalizeBackgroundIntensity(1), 1);
  assert.equal(normalizeBackgroundIntensity(4), 1);
});

test("background color-style links survive deck normalization", () => {
  const normalized = normalizeDeck(createDeck({
    slides: [createSlide({ backgroundType: "animated", backgroundEffectColorAStyleId: "brand-primary", backgroundOverlayColorStyleId: "brand-ink" })],
  }));
  assert.equal(normalized.slides[0].backgroundEffectColorAStyleId, "brand-primary");
  assert.equal(normalized.slides[0].backgroundOverlayColorStyleId, "brand-ink");
});
