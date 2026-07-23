import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");

test("presenter view can create a private mobile controller pairing", () => {
  assert.match(html, /id="connectRemoteControllerBtn"/);
  assert.match(html, /id="remotePairingOverlay"/);
  assert.match(app, /createRemoteControllerPairing/);
  assert.match(app, /liveQrImageSrc\(url\)/);
});

test("remote controller mode hides the editor and exposes focused tabs", () => {
  assert.match(app, /remoteControllerMatch = location\.hash\.match/);
  assert.match(app, /document\.body\.classList\.add\("remote-controller-window"\)/);
  assert.match(styles, /body\.remote-controller-window > :not\(#remoteControllerApp\)/);
  for (const tab of ["control", "slides", "notes", "live", "qna"]) {
    assert.match(html, new RegExp(`data-remote-tab="${tab}"`));
  }
});

test("remote controller supports navigation, slide flow, live controls, and Q&A moderation", () => {
  for (const action of [
    "next", "previous", "goTo", "toggleIncluded", "blackout",
    "clearResponses", "newSession", "endSession", "addTimer", "moderateQuestion",
  ]) {
    assert.match(worker, new RegExp(`"${action}"`));
  }
  assert.match(app, /renderRemoteSlideStrip/);
  assert.match(app, /renderRemoteQuestions/);
});

test("remote controller credentials are scoped, hashed, expiring, and revoked on session end", () => {
  assert.match(worker, /token_hash TEXT PRIMARY KEY/);
  assert.match(worker, /await sha256\(token\)/);
  assert.match(worker, /datetime\('now', '\+8 hours'\)/);
  assert.match(worker, /Remote controller access has expired/);
  assert.match(worker, /DELETE FROM hyslides_remote_controller_pairings WHERE instance_id = \?/);
});
