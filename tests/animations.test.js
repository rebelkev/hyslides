import test from "node:test";
import assert from "node:assert/strict";
import { createElement, normalizeElement } from "../src/schema.js";

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
