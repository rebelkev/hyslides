import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement, normalizeDeck, createDeck, createSlide } from "../src/schema.js";

const root = new URL("../", import.meta.url);

test("new shapes include rich fill defaults", () => {
  const shape = createElement("shape");
  assert.equal(shape.fillType, "color");
  assert.equal(shape.fillImageFit, "cover");
  assert.equal(shape.fillShader, "aurora");
});

test("shape fill settings survive deck normalization", () => {
  const shape = createElement("shape", {
    fillType: "gradient",
    fillGradientStart: "#112233",
    fillGradientEnd: "#aabbcc",
    fillGradientAngle: 42,
  });
  const deck = normalizeDeck(createDeck({ slides: [createSlide({ elements: [shape] })] }));
  assert.equal(deck.slides[0].elements[0].fillType, "gradient");
  assert.equal(deck.slides[0].elements[0].fillGradientAngle, 42);
});

test("shape properties expose every fill mode and icons omit the duplicate color section", async () => {
  const script = await readFile(new URL("src/app.js", root), "utf8");
  assert.match(script, /shapeFillTypeInput/);
  assert.match(script, /\["gradient", "Gradient"\]/);
  assert.match(script, /\["image", "Image"\]/);
  assert.match(script, /\["animated", "Animated effect"\]/);
  assert.match(script, /element\.type === "icon" \? "" : brandColorElementSection/);
  assert.match(script, /lucideIconSvgDataUri\(iconNode, color, strokeWidth\)/);
  assert.doesNotMatch(script, /window\.lucide\?\.createElement/);
});
