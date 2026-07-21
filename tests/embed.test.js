import test from "node:test";
import assert from "node:assert/strict";
import { youtubeEmbedUrl, youtubeVideoId } from "../src/embed.js";
import { createElement, normalizeElement } from "../src/schema.js";

test("YouTube URLs normalize to a video id", () => {
  assert.equal(youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=12"), "dQw4w9WgXcQ");
  assert.equal(youtubeVideoId("https://youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeVideoId("https://example.com/video"), "");
});

test("YouTube embed URLs include configured player controls", () => {
  const url = new URL(youtubeEmbedUrl({
    url: "https://youtu.be/dQw4w9WgXcQ",
    autoplay: true,
    loop: true,
    showControls: false,
    startSeconds: 15,
  }, "https://slides.example.com"));
  assert.equal(url.pathname, "/embed/dQw4w9WgXcQ");
  assert.equal(url.searchParams.get("autoplay"), "1");
  assert.equal(url.searchParams.get("controls"), "0");
  assert.equal(url.searchParams.get("loop"), "1");
  assert.equal(url.searchParams.get("start"), "15");
  assert.equal(url.searchParams.get("origin"), "https://slides.example.com");
});

test("embed player settings survive element normalization", () => {
  const element = normalizeElement(createElement("embed", {
    url: "https://youtu.be/dQw4w9WgXcQ",
    volume: 35,
    playbackRate: 1.5,
    autoplay: true,
  }));
  assert.equal(element.type, "embed");
  assert.equal(element.volume, 35);
  assert.equal(element.playbackRate, 1.5);
  assert.equal(element.autoplay, true);
  assert.equal(element.fullscreenOnPlay, true);
});
