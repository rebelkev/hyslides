import test from "node:test";
import assert from "node:assert/strict";
import { cloneSlide, createElement, createSlide, normalizeDeck, normalizeElement } from "../src/schema.js";

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
