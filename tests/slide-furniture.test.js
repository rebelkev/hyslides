import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { createDeck, createElement, createSlide, normalizeDeck } from "../src/schema.js";
import { disclaimerVisible, slideNumberVisible } from "../src/renderer.js";

test("deck slide furniture has safe defaults and survives normalization", () => {
  const deck = createDeck();
  assert.equal(deck.theme.master.footer.showSlideNumber, true);
  assert.equal(deck.theme.master.footer.slideNumberPosition, "bottom-right");
  assert.equal(deck.theme.master.footer.disclaimer.enabled, false);
  assert.equal(deck.theme.master.footer.disclaimer.typographyStyleId, "caption");

  const normalized = normalizeDeck({
    ...deck,
    theme: {
      ...deck.theme,
      master: {
        footer: {
          showSlideNumber: false,
          disclaimer: {
            enabled: true,
            text: "Confidential",
            position: "bottom-left",
          },
        },
      },
    },
  });
  assert.equal(normalized.theme.master.footer.showSlideNumber, false);
  assert.equal(normalized.theme.master.footer.disclaimer.text, "Confidential");
  assert.equal(normalized.theme.master.footer.disclaimer.typographyStyleId, "caption");
});

test("line elements use the editor-facing name and adjustable corner radius", () => {
  const line = createElement("divider");
  assert.equal(line.name, "Line");
  assert.equal(line.radius, 3);
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(app, /lineRadiusInput/);
  assert.match(app, /divider: "Line"/);
});

test("slide properties expose inheritable furniture and background controls", () => {
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(app, /resetSlideNumberBtn/);
  assert.match(app, /resetSlideDisclaimerBtn/);
  assert.match(app, /slideDisclaimerPositionInput/);
  assert.match(app, /useDeckBackgroundInput/);
  assert.match(app, /resetSlideBackgroundBtn/);
});

test("slides inherit or override deck furniture visibility", () => {
  const deck = createDeck();
  const slide = createSlide();
  deck.theme.master.footer.disclaimer = {
    enabled: true,
    text: "Internal use only",
    typographyStyleId: "caption",
    position: "bottom-center",
  };

  assert.equal(slideNumberVisible(slide, deck), true);
  assert.equal(disclaimerVisible(slide, deck), true);
  slide.slideNumberVisible = false;
  slide.disclaimerVisible = false;
  assert.equal(slideNumberVisible(slide, deck), false);
  assert.equal(disclaimerVisible(slide, deck), false);
  slide.slideNumberVisible = true;
  slide.disclaimerVisible = true;
  deck.theme.master.footer.showSlideNumber = false;
  deck.theme.master.footer.disclaimer.enabled = false;
  assert.equal(slideNumberVisible(slide, deck), true);
  assert.equal(disclaimerVisible(slide, deck), true);
});

test("slide furniture renders below normal slide elements", () => {
  const source = fs.readFileSync(new URL("../src/renderer.js", import.meta.url), "utf8");
  const background = source.indexOf("drawSlideBackground(ctx, slide, deck);");
  const furniture = source.indexOf("drawSlideFurniture(ctx, slide, deck, slideIndex);");
  const elements = source.indexOf("for (const element of slide.elements)");
  assert.ok(background >= 0 && furniture > background && elements > furniture);
});
