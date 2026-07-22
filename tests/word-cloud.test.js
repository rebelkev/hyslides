import test from "node:test";
import assert from "node:assert/strict";
import { createWordCloudLayout, mergeWordCloudEntries } from "../src/word-cloud.js";

const bounds = { x: 0, y: 0, width: 720, height: 320 };
const measure = (text, fontSize) => text.length * fontSize * 0.56;

test("word cloud sizes repeated responses more prominently", () => {
  const layout = createWordCloudLayout([
    ["Templates", 8],
    ["Analytics", 3],
    ["Q&A", 1],
  ], bounds, measure);
  const sizes = Object.fromEntries(layout.map((word) => [word.text, word.fontSize]));

  assert.ok(sizes.Templates > sizes.Analytics);
  assert.ok(sizes.Analytics > sizes["Q&A"]);
});

test("word cloud merges capitalization and spacing variants before weighting", () => {
  const layout = createWordCloudLayout([
    ["Team work", 2],
    [" team   WORK ", 3],
    ["Analytics", 4],
  ], bounds, measure);
  const team = layout.find((word) => word.text === "Team work");
  const analytics = layout.find((word) => word.text === "Analytics");

  assert.equal(layout.length, 2);
  assert.equal(team.count, 5);
  assert.ok(team.fontSize > analytics.fontSize);
});

test("word cloud preserves the first submitted capitalization while grouping case-insensitively", () => {
  assert.deepEqual(mergeWordCloudEntries([
    ["HySlides", 1],
    ["hyslides", 2],
    ["HYSLIDES", 3],
  ]), [["HySlides", 6]]);
});

test("word cloud uses non-overlapping positions inside its element", () => {
  const layout = createWordCloudLayout([
    ["One", 10], ["Two", 8], ["Three", 6], ["Four", 4], ["Five", 2], ["Six", 1],
  ], bounds, measure);

  assert.ok(layout.length >= 5);
  for (const word of layout) {
    assert.ok(word.x >= bounds.x && word.y >= bounds.y);
    assert.ok(word.x + word.width <= bounds.x + bounds.width);
    assert.ok(word.y + word.height <= bounds.y + bounds.height);
  }
  for (let index = 0; index < layout.length; index += 1) {
    for (let other = index + 1; other < layout.length; other += 1) {
      const a = layout[index];
      const b = layout[other];
      const overlaps = !(a.x + a.width <= b.x || b.x + b.width <= a.x ||
        a.y + a.height <= b.y || b.y + b.height <= a.y);
      assert.equal(overlaps, false);
    }
  }
});
