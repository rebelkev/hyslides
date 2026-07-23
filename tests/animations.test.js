import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cloneSlide, createElement, createSlide, normalizeDeck, normalizeElement } from "../src/schema.js";

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

test("new elements default to no animation", () => {
  const element = createElement("text");
  assert.deepEqual(element.animation, {
    effect: "none",
    trigger: "slideStart",
    durationMs: 500,
    delayMs: 0,
    easing: "ease",
    order: 0,
  });
});

test("saved animation settings survive element normalization", () => {
  const element = normalizeElement({
    type: "shape",
    animation: {
      effect: "fadeIn",
      trigger: "onClick",
      durationMs: 900,
      easing: "easeOut",
    },
  });
  assert.equal(element.animation.effect, "fadeIn");
  assert.equal(element.animation.trigger, "onClick");
  assert.equal(element.animation.durationMs, 900);
  assert.equal(element.animation.easing, "easeOut");
  assert.equal(element.animation.delayMs, 0);
});

test("with previous animation triggers survive element normalization", () => {
  const element = normalizeElement({
    type: "text",
    animation: {
      effect: "fadeIn",
      trigger: "withPrevious",
      delayMs: 200,
    },
  });
  assert.equal(element.animation.trigger, "withPrevious");
  assert.equal(element.animation.delayMs, 200);
});

test("duplicated slides receive independent slide and element identities", () => {
  const source = createSlide({
    elements: [
      createElement("text", { groupId: "group-original" }),
      createElement("shape", { groupId: "group-original" }),
    ],
  });
  const duplicate = cloneSlide(source);
  assert.notEqual(duplicate.id, source.id);
  assert.notEqual(duplicate.elements[0].id, source.elements[0].id);
  assert.equal(duplicate.elements[0].groupId, duplicate.elements[1].groupId);
  assert.notEqual(duplicate.elements[0].groupId, "group-original");
});

test("legacy saved swatches migrate to named deck color styles", () => {
  const deck = normalizeDeck({
    theme: { brandPalette: ["#112233", "#aabbcc"] },
    slides: [],
  });
  assert.deepEqual(deck.theme.brandColorStyles.map((style) => style.color), ["#112233", "#aabbcc"]);
  assert.equal(deck.theme.brandColorStyles[0].name, "Brand 1");
  assert.deepEqual(deck.theme.brandPalette, ["#112233", "#aabbcc"]);
});

test("element color-style links survive normalization", () => {
  const element = normalizeElement({ type: "text", brandColorStyleId: "brand-primary" });
  assert.equal(element.brandColorStyleId, "brand-primary");
});

test("countdown elements default to a seven-minute presenter-controlled timer", () => {
  const element = createElement("countdown");
  assert.equal(element.durationSeconds, 420);
  assert.equal(element.autoStart, false);
  assert.equal(element.autoAdvance, false);
  assert.equal(element.completionBehavior, "message");
  assert.equal(element.backgroundOpacity, 0.78);
  assert.equal(element.fill, "#111827");
});

test("countdown editor supports hiding the timer at zero", () => {
  assert.match(app, /\["hide", "Hide timer"\]/);
  assert.match(app, /data-countdown-action="subtract"/);
  assert.match(app, /data-countdown-action="end"/);
  assert.match(app, /function endCountdown/);
});
