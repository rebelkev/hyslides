import test from "node:test";
import assert from "node:assert/strict";
import { resizeBounds } from "../src/resize.js";

test("ordinary resize remains freeform", () => {
  const resized = resizeBounds({ x: 100, y: 100, w: 400, h: 200 }, "se", 100, 20);
  assert.deepEqual(resized, { x: 100, y: 100, w: 500, h: 220 });
});

test("shift corner resize retains proportions and opposite corner", () => {
  const resized = resizeBounds({ x: 100, y: 100, w: 400, h: 200 }, "nw", -100, -10, true);
  assert.equal(resized.w / resized.h, 2);
  assert.equal(resized.x + resized.w, 500);
  assert.equal(resized.y + resized.h, 300);
});

test("shift edge resize retains proportions around the opposite axis center", () => {
  const resized = resizeBounds({ x: 100, y: 100, w: 400, h: 200 }, "e", 100, 0, true);
  assert.equal(resized.w / resized.h, 2);
  assert.equal(resized.y + resized.h / 2, 200);
});
