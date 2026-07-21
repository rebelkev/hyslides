import test from "node:test";
import assert from "node:assert/strict";
import { containsBlockedLanguage } from "../src/moderation.js";

test("blocks common offensive submissions and basic evasions", () => {
  assert.equal(containsBlockedLanguage("This is bullshit"), true);
  assert.equal(containsBlockedLanguage("f@gg0t"), true);
  assert.equal(containsBlockedLanguage("go kill yourself"), true);
});

test("allows ordinary words containing similar letter sequences", () => {
  assert.equal(containsBlockedLanguage("classical analysis"), false);
  assert.equal(containsBlockedLanguage("Scunthorpe project"), false);
  assert.equal(containsBlockedLanguage("Please prioritize templates"), false);
});
