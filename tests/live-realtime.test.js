import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { connectLiveEvents } from "../src/live.js";

class FakeWebSocket {
  static instances = [];
  static OPEN = 1;

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = new Map();
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  emit(type, data = undefined) {
    this.listeners.get(type)?.({ data });
  }

  close() {
    this.readyState = 3;
  }
}

test("live event transport upgrades to the per-session WebSocket endpoint", () => {
  FakeWebSocket.instances = [];
  const events = [];
  const statuses = [];
  const connection = connectLiveEvents("002471", {
    WebSocketImpl: FakeWebSocket,
    baseUrl: "https://hyslides.example/hyslides/",
    onEvent: (event) => events.push(event),
    onStatus: (status) => statuses.push(status),
  });
  const socket = FakeWebSocket.instances[0];
  assert.equal(socket.url, "wss://hyslides.example/api/live/002471/events");
  socket.readyState = 1;
  socket.emit("open");
  socket.emit("message", JSON.stringify({ type: "response", at: 123 }));
  assert.deepEqual(statuses, ["connecting", "connected"]);
  assert.deepEqual(events, [{ type: "response", at: 123 }]);
  connection.close();
  assert.equal(socket.readyState, 3);
});

test("worker uses a hibernating Durable Object as an event hub while retaining D1", () => {
  const worker = fs.readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
  const config = fs.readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.match(worker, /class LiveSessionHub/);
  assert.match(worker, /acceptWebSocket/);
  assert.match(worker, /liveMutation\(env, code, "response"/);
  assert.match(worker, /liveMutation\(env, code, "remote-command"/);
  assert.match(worker, /presenceChanged/);
  assert.match(config, /name: "LIVE_HUB"/);
  assert.match(config, /new_sqlite_classes: \["LiveSessionHub"\]/);
});

test("all live views use push events with slower recovery polling", () => {
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(app, /liveSession\.events = connectLiveEvents/);
  assert.match(app, /audienceLive\.events = connectLiveEvents/);
  assert.match(app, /remoteControllerEvents = connectLiveEvents/);
  assert.match(app, /setInterval\(refreshLiveSession, 15000\)/);
  assert.match(app, /setInterval\(refreshAudienceLiveState, 15000\)/);
  assert.match(app, /setInterval\(refreshRemoteController, 15000\)/);
  assert.match(app, /function drawLiveAudienceCanvas\(\)/);
  assert.match(app, /prefers-reduced-motion: reduce/);
  assert.match(app, /document\.hidden/);
});
