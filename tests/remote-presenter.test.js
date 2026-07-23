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
  for (const tab of ["control", "live", "qna"]) {
    assert.match(html, new RegExp(`data-remote-tab="${tab}"`));
  }
  assert.doesNotMatch(html, /data-remote-tab="slides"/);
  assert.doesNotMatch(html, /data-remote-tab="notes"/);
  assert.match(html, /id="remoteNotesToggleBtn"/);
  assert.match(html, /id="remoteQnaIndicator"/);
});

test("remote controller supports navigation, slide flow, live controls, and Q&A moderation", () => {
  for (const action of [
    "next", "previous", "goTo", "toggleIncluded", "blackout",
    "clearResponses", "newSession", "endSession", "addTimer", "adjustTimer",
    "removeTimer", "moderateQuestion",
  ]) {
    assert.match(worker, new RegExp(`"${action}"`));
  }
  assert.match(app, /renderRemoteSlideStrip/);
  assert.match(app, /renderRemoteQuestions/);
  assert.match(app, /queueRemoteControllerPublish\(true\)/);
  assert.match(app, /remoteTimerReadout/);
  assert.match(app, /sendRemoteControllerCommand\(code, token/);
  assert.doesNotMatch(app, /\bsendRemoteCommand\(/);
  assert.match(app, /data-remote-slide-action="jump"/);
  assert.match(app, /data-remote-slide-action="toggle"/);
  assert.match(styles, /\.remote-slide-actions/);
});

test("remote controller credentials are scoped, hashed, expiring, and revoked on session end", () => {
  assert.match(worker, /token_hash TEXT PRIMARY KEY/);
  assert.match(worker, /await sha256\(token\)/);
  assert.match(worker, /datetime\('now', '\+8 hours'\)/);
  assert.match(worker, /Remote controller access has expired/);
  assert.match(worker, /DELETE FROM hyslides_remote_controller_pairings WHERE instance_id = \?/);
  assert.match(worker, /UPDATE hyslides_remote_controller_pairings SET instance_id = \?/);
});

test("remote Q&A uses the canonical answered flag and compact cards", () => {
  assert.match(app, /renderGroup\("Unanswered", unanswered/);
  assert.match(app, /renderGroup\("Answered", answered/);
  assert.match(app, /data-remote-question-action="\$\{question\.visible \? "hide" : "show"\}"/);
  assert.match(app, /data-remote-question-action="\$\{question\.answered \? "unanswered" : "answered"\}"/);
  assert.match(styles, /\.remote-qna-list \{ align-content: start;/);
  assert.match(styles, /\.remote-qna-group \+ \.remote-qna-group/);
  assert.match(styles, /\.presenter-qna-list \{ align-content: start;/);
});

test("remote carousel gives every non-current slide concise persistent actions", () => {
  assert.match(app, /\$\{current \? "" : `<div class="remote-slide-actions">/);
  assert.match(app, />Jump to…<\/button>/);
  assert.match(app, /\$\{slide\.included \? "Skip" : "Include"\}/);
  assert.match(app, /container\.querySelector\("\.current"\)/);
  assert.match(styles, /\.remote-slide-card\.current/);
});
