import test from "node:test";
import assert from "node:assert/strict";
import {
  createElement,
  createSeedDeck,
  createSlide,
  layoutTemplates,
  MAX_ENGAGEMENT_OPTIONS,
  normalizeDeck,
  syncEngagementResultCharts,
} from "../src/schema.js";
import { measureEngagementElementHeight } from "../src/renderer.js";
import { recordAudienceResponse } from "../src/engagement.js";

test("linked poll charts mirror live totals and clear stale bars", () => {
  const chart = createElement("chart", {
    name: "Poll results",
    labels: ["Alpha", "Beta"],
    values: [9, 4],
  });
  const slide = createSlide({
    engagement: {
      enabled: true,
      type: "poll",
      options: ["Alpha", "Beta"],
      results: {},
    },
    elements: [chart],
  });

  syncEngagementResultCharts(slide);

  assert.equal(chart.engagementResults, true);
  assert.deepEqual(chart.labels, ["Alpha", "Beta"]);
  assert.deepEqual(chart.values, [0, 0]);
});

test("linked poll charts update from canonical engagement results", () => {
  const chart = createElement("chart", { engagementResults: true });
  const slide = createSlide({
    engagement: {
      enabled: true,
      type: "poll",
      options: ["Alpha", "Beta"],
      results: { Alpha: 3, Beta: 7 },
    },
    elements: [chart],
  });

  syncEngagementResultCharts(slide);

  assert.deepEqual(chart.values, [3, 7]);
});

test("legacy charts bind when their labels match engagement options", () => {
  const chart = createElement("chart", {
    name: "Chart",
    labels: ["Alpha", "Beta"],
    values: [9, 4],
  });
  const slide = createSlide({
    engagement: {
      enabled: true,
      type: "poll",
      options: ["Alpha", "Beta"],
      results: { Beta: 1 },
    },
    elements: [chart],
  });

  syncEngagementResultCharts(slide);

  assert.equal(chart.engagementResults, true);
  assert.deepEqual(chart.values, [0, 1]);
});

test("all built-in engagement slides and templates start without responses", () => {
  const slides = [
    ...createSeedDeck().slides,
    ...layoutTemplates.map((template) => template.apply()),
  ].filter((slide) => slide.engagement?.enabled);

  assert.ok(slides.length > 0);
  for (const slide of slides) {
    assert.deepEqual(slide.engagement.results, {});
    assert.deepEqual(slide.engagement.qna, []);
    assert.ok(Object.values(slide.engagement.reactions).every((count) => count === 0));
    for (const chart of slide.elements.filter((element) => element.engagementResults)) {
      assert.ok(chart.values.every((value) => value === 0));
    }
  }
});

test("polls default to one response per participant", () => {
  const slide = createSlide();
  assert.equal(slide.engagement.responseLimit, 1);
  assert.equal(createElement("engagement").responseLimit, 1);
});

test("the template library includes every engagement type", () => {
  const types = new Set(
    layoutTemplates
      .map((template) => template.apply())
      .filter((slide) => slide.engagement?.enabled)
      .map((slide) => slide.engagement.type)
  );
  assert.deepEqual(
    [...types].sort(),
    ["multipleChoice", "poll", "qna", "quiz", "reactions", "wordCloud"].sort()
  );
});

test("engagement choices are capped at ten options", () => {
  const options = Array.from({ length: 14 }, (_, index) => `Option ${index + 1}`);
  const deck = normalizeDeck({
    ...createSeedDeck(),
    slides: [createSlide({
      engagement: { enabled: true, type: "quiz", options },
      elements: [createElement("engagement", { mode: "quiz", options })],
    })],
  });
  assert.equal(deck.slides[0].engagement.options.length, MAX_ENGAGEMENT_OPTIONS);
  assert.equal(deck.slides[0].elements[0].options.length, MAX_ENGAGEMENT_OPTIONS);
});

test("engagement element height grows with its option list", () => {
  const short = createElement("engagement", { mode: "poll", options: ["One", "Two"] });
  const long = createElement("engagement", {
    mode: "poll",
    options: Array.from({ length: 10 }, (_, index) => `Option ${index + 1}`),
  });
  assert.ok(measureEngagementElementHeight(long) > measureEngagementElementHeight(short));
});

test("word cloud submissions preserve phrases instead of splitting words", () => {
  const slide = createSlide({
    engagement: { enabled: true, type: "wordCloud", results: {} },
  });
  recordAudienceResponse(slide, { value: "Customer success" });
  assert.deepEqual(slide.engagement.results, { "customer success": 1 });
});
