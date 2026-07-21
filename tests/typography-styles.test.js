import test from "node:test";
import assert from "node:assert/strict";

import { createDeck, createElement, normalizeDeck, normalizeElement } from "../src/schema.js";
import { resolveTextTypography } from "../src/renderer.js";

test("PowerPoint import reports survive deck normalization", () => {
  const deck = normalizeDeck({
    ...createDeck(),
    importReport: ["Theme fonts imported.", "3 elements linked to global typography."],
  });

  assert.deepEqual(deck.importReport, ["Theme fonts imported.", "3 elements linked to global typography."]);
});

test("new text links to the global body typography style", () => {
  const deck = createDeck();
  const element = createElement("text");
  assert.equal(element.typographyStyleId, "body");
  assert.equal(element.useGlobalTypography, true);
  assert.equal(resolveTextTypography(element, deck).fontSize, deck.theme.typographyStyles.body.fontSize);
});

test("legacy text remains custom while linked text follows global changes", () => {
  const legacy = normalizeElement({ type: "text", fontFamily: "Georgia", fontSize: 31 });
  assert.equal(legacy.useGlobalTypography, false);
  const deck = normalizeDeck(createDeck());
  const linked = createElement("text", { useGlobalTypography: true, typographyStyleId: "title" });
  deck.theme.typographyStyles.title.fontFamily = "Roboto";
  deck.theme.typographyStyles.title.fontSize = 60;
  assert.deepEqual(resolveTextTypography(linked, deck).fontFamily, "Roboto");
  assert.deepEqual(resolveTextTypography(linked, deck).fontSize, 60);
  assert.deepEqual(resolveTextTypography(legacy, deck).fontFamily, "Georgia");
});
