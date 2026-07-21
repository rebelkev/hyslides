import test from "node:test";
import assert from "node:assert/strict";

import { liveSessionIndicator } from "../src/live.js";

test("presenter live indicator requires backend-confirmed active state", () => {
  assert.deepEqual(liveSessionIndicator("active", true), { label: "LIVE", tone: "live" });
  assert.deepEqual(liveSessionIndicator("ended", true), { label: "ENDED", tone: "ended" });
  assert.deepEqual(liveSessionIndicator("active", false), { label: "NOT LIVE", tone: "offline" });
  assert.deepEqual(liveSessionIndicator("active", true, true), { label: "CONNECTING", tone: "connecting" });
});
