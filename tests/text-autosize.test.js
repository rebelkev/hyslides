import test from "node:test";
import assert from "node:assert/strict";
import { measureTextElementHeight } from "../src/renderer.js";

const context = {
  font: "",
  save() {},
  restore() {},
  measureText(value) {
    return { width: String(value).length * 10 };
  },
};

const deck = {
  theme: { fonts: { heading: "Inter", body: "Inter" } },
};

test("text height grows when content wraps", () => {
  const base = {
    type: "text",
    text: "Which module should ship first?",
    fontSize: 34,
    fontWeight: 800,
    lineHeight: 1.12,
    bulletList: false,
    align: "left",
  };
  const wide = measureTextElementHeight(context, { ...base, w: 500 }, deck);
  const narrow = measureTextElementHeight(context, { ...base, w: 230 }, deck);
  assert.ok(narrow > wide);
  assert.equal(narrow, Math.ceil(2 * 34 * 1.12 + 4));
});
