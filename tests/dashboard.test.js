import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
const storageSource = await readFile(new URL("../src/storage.js", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");

test("authenticated accounts land on a dedicated presentations dashboard", () => {
  assert.match(workerSource, /url\.pathname === "\/dashboard"/);
  assert.match(appSource, /\["\/", "\/dashboard"\]\.includes\(location\.pathname\)/);
  assert.match(appSource, /history\.replaceState\(null, "", "\/dashboard"\)/);
  assert.match(appSource, /await openDashboard\(\)/);
  assert.match(indexSource, /id="dashboardApp"/);
  assert.match(indexSource, />Your presentations</);
});

test("dashboard presents create-first cards with open and overflow actions", () => {
  assert.match(appSource, /Create presentation/);
  assert.match(appSource, /data-dashboard-action="open"/);
  assert.match(appSource, /data-dashboard-action="rename"/);
  assert.match(appSource, /data-dashboard-action="duplicate"/);
  assert.match(appSource, /data-dashboard-action="delete"/);
  assert.match(appSource, /dashboardDecks.*sort/s);
  assert.match(stylesSource, /\.dashboard-grid\s*\{/);
  assert.match(stylesSource, /\.dashboard-deck-card:hover/);
});

test("dashboard mutations do not unexpectedly navigate away", () => {
  assert.match(storageSource, /saveDeck\(deck, options = \{\}\)/);
  assert.match(storageSource, /updateRoute = true/);
  assert.match(storageSource, /if \(updateRoute\) updateDeckRoute\(cloudDeck\.id\)/);
  assert.match(appSource, /saveDeck\(blankDeck, \{ updateRoute: false \}\)/);
  assert.match(appSource, /saveDeck\(duplicate, \{ updateRoute: false \}\)/);
  assert.match(appSource, /saveDeck\(\{ \.\.\.savedDeck, title: nextTitle \}, \{ updateRoute: false \}\)/);
});

test("duplicate presentations receive independent live state", () => {
  assert.match(appSource, /uniqueDashboardCopyTitle/);
  assert.match(appSource, /createFreshAudienceAccessCode/);
  assert.match(appSource, /clearDeckEngagementResults\(duplicate\)/);
});

test("dashboard account menu identifies the user and supports sign-out", () => {
  assert.match(indexSource, /id="dashboardAccountBtn"/);
  assert.match(indexSource, /id="dashboardAccountMenu"/);
  assert.match(indexSource, /id="dashboardSignOutBtn"/);
  assert.match(appSource, /updateDashboardAccount\(\)/);
  assert.match(appSource, /location\.replace\("\/signin"\)/);
});

test("dashboard dialogs confirm destructive deletion", () => {
  assert.match(indexSource, /id="dashboardDialogOverlay"/);
  assert.match(indexSource, /id="confirmDashboardDeleteBtn"/);
  assert.match(appSource, /Delete presentation\?/);
  assert.match(appSource, /await deleteDeck\(deckId\)/);
});
