import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const authSource = await readFile(new URL("../src/auth.js", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const storageSource = await readFile(new URL("../src/storage.js", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("accounts support Google OAuth and passwordless email codes", () => {
  assert.match(authSource, /\/api\/auth\/config/);
  assert.match(authSource, /provider", "google"/);
  assert.match(authSource, /\/auth\/v1\/otp/);
  assert.match(authSource, /\/auth\/v1\/verify/);
  assert.doesNotMatch(authSource, /password\s*:/);
});

test("deck APIs verify bearer identity and enforce ownership", () => {
  assert.match(workerSource, /AUTH_ENABLED/);
  assert.match(workerSource, /Accounts are not enabled yet/);
  assert.match(workerSource, /\/auth\/v1\/user/);
  assert.match(workerSource, /Authorization/);
  assert.match(workerSource, /WHERE id = \? AND owner_id = \?/);
  assert.match(workerSource, /hyslides_user_profiles/);
  assert.match(workerSource, /hyslides_decks/);
});

test("deck-specific editor routes safely bootstrap through the public editor shell", () => {
  assert.match(workerSource, /editorShellUrl/);
  assert.match(workerSource, /editorShellUrl\.searchParams\.set\("deck", deckId\)/);
  assert.match(workerSource, /Response\.redirect\(editorShellUrl, 307\)/);
  assert.match(storageSource, /new URLSearchParams\(location\.search\)\.get\("deck"\)/);
  assert.match(storageSource, /restoreDeckRouteAfterBootstrap\(\)/);
  assert.match(storageSource, /history\.replaceState\(null, "", `\/decks\//);
});

test("signed-in decks receive account-specific routes and browser migration", () => {
  assert.match(storageSource, /cloudMigration:/);
  assert.match(storageSource, /\/api\/decks/);
  assert.match(storageSource, /\/decks\/\$\{encodeURIComponent\(deckId\)\}\/edit/);
  assert.match(storageSource, /cloud migration failed/);
  assert.match(indexSource, /href="\/hyslides\/styles\.css"/);
  assert.match(indexSource, /src="\/hyslides\/src\/app\.js"/);
});
