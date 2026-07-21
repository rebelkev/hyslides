import test from "node:test";
import assert from "node:assert/strict";

import { liveSessionIndicator, liveSnapshotForDeck } from "../src/live.js";

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
    "Session"
  );
  snapshot.slide.elements[0].text = "Changed";
  assert.equal(slide.elements[0].text, "Hello");
  assert.equal(snapshot.activeSlideId, "slide-1");
});
