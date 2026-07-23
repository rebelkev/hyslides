import test from "node:test";
import assert from "node:assert/strict";

import { liveSessionIndicator, liveSnapshotForDeck, liveStateDeck } from "../src/live.js";

test("presenter live indicator requires backend-confirmed active state", () => {
  assert.deepEqual(liveSessionIndicator("active", true), { label: "LIVE", tone: "live" });
  assert.deepEqual(liveSessionIndicator("ended", true), { label: "ENDED", tone: "ended" });
  assert.deepEqual(liveSessionIndicator("active", false), { label: "NOT LIVE", tone: "offline" });
  assert.deepEqual(liveSessionIndicator("active", true, true), { label: "CONNECTING", tone: "connecting" });
});

test("live snapshots copy slide data without mutating the editor slide", async () => {
  const slide = { id: "slide-1", title: "Test", elements: [{ id: "text-1", type: "text", text: "Hello" }] };
  const snapshot = await liveSnapshotForDeck(
    { id: "deck-1", title: "Deck", settings: { audienceCode: "123456" } },
    slide,
    0,
    "instance-1",
    "Session",
    { blackout: true }
  );
  snapshot.slide.elements[0].text = "Changed";
  assert.equal(slide.elements[0].text, "Hello");
  assert.equal(snapshot.activeSlideId, "slide-1");
  assert.equal(snapshot.slide.runtimePresentation.blackout, true);
  assert.equal(slide.runtimePresentation, undefined);
});

test("live slides carry deck furniture settings to participant devices", async () => {
  const theme = {
    fonts: { body: "Inter" },
    colors: { muted: "#637083" },
    typographyStyles: { caption: { name: "Caption", fontSize: 16 } },
    brandPalette: ["#112233"],
    brandColorStyles: [{ id: "brand-primary", name: "Primary", color: "#112233" }],
    defaultBackground: { type: "color", color: "#112233" },
    master: { footer: { showSlideNumber: true, disclaimer: { enabled: true, text: "Confidential" } } },
    logo: { src: "https://example.com/logo.svg", corner: "top-right", showOnSlides: true, width: 96 },
  };
  const snapshot = await liveSnapshotForDeck(
    { id: "deck-1", title: "Deck", theme, settings: { audienceCode: "123456" } },
    { id: "slide-1", title: "Test", elements: [] },
    4
  );
  const participantDeck = liveStateDeck({ ...snapshot, theme: undefined });
  assert.equal(participantDeck.theme.master.footer.disclaimer.text, "Confidential");
  assert.equal(participantDeck.theme.logo.src, "https://example.com/logo.svg");
  assert.equal(participantDeck.theme.logo.corner, "top-right");
  assert.equal(participantDeck.theme.brandColorStyles[0].color, "#112233");
  assert.equal(participantDeck.theme.defaultBackground.color, "#112233");
  assert.notEqual(snapshot.slide.liveTheme, theme);
});
