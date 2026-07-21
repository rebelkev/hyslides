import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_REACTION_OPTIONS,
  MAX_REACTION_OPTIONS,
  REACTION_CATALOG,
  createElement,
  createSlide,
  normalizeElement,
  normalizeReactionOption,
  normalizeSlide,
} from "../src/schema.js";
import { selectedReactionKeys } from "../src/engagement.js";

test("reaction slides default to five emoji choices", () => {
  const slide = createSlide();
  assert.deepEqual(slide.engagement.reactionOptions, DEFAULT_REACTION_OPTIONS);
  assert.equal(selectedReactionKeys(slide.engagement).length, MAX_REACTION_OPTIONS);
  assert.ok(selectedReactionKeys(slide.engagement).every((key) => REACTION_CATALOG[key]));
});

test("custom reaction choices persist and are capped at five", () => {
  const choices = ["laugh", "rocket", "eyes"];
  const slide = normalizeSlide({ engagement: { type: "reactions", reactionOptions: choices } });
  const element = normalizeElement(createElement("engagement", { mode: "reactions", reactionOptions: [...choices, "fire", "heart", "clap"] }));
  assert.deepEqual(slide.engagement.reactionOptions, choices);
  assert.deepEqual(element.reactionOptions, [...choices, "fire", "heart"]);
});

test("any unicode emoji can be used as a reaction", () => {
  assert.equal(normalizeReactionOption("🦄"), "🦄");
  assert.equal(normalizeReactionOption("🇺🇸"), "🇺🇸");
  assert.equal(normalizeReactionOption("not an emoji"), "");
  assert.equal(normalizeReactionOption("🦄🧠"), "");
  const slide = normalizeSlide({ engagement: { type: "reactions", reactionOptions: ["🦄", "🧠"] } });
  assert.deepEqual(slide.engagement.reactionOptions, ["🦄", "🧠"]);
});
