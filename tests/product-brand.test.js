import assert from "node:assert/strict";
import test from "node:test";
import { createElement, createSlide, normalizeDeck } from "../src/schema.js";

test("legacy starter branding migrates without rewriting user-authored text", () => {
  const deck = normalizeDeck({
    title: "HySlides Product Narrative",
    theme: { name: "HySlides Studio" },
    slides: [createSlide({
      elements: [
        createElement("text", { text: "HySlides" }),
        createElement("text", { text: "My HySlides comparison" }),
      ],
    })],
  });

  assert.equal(deck.title, "Nifty Slides Product Narrative");
  assert.equal(deck.theme.name, "Nifty Slides Studio");
  assert.equal(deck.slides[0].elements[0].text, "Nifty Slides");
  assert.equal(deck.slides[0].elements[1].text, "My HySlides comparison");
});
