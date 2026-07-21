import test from "node:test";
import assert from "node:assert/strict";
import { createElement, createSlide, syncEngagementResultCharts } from "../src/schema.js";

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
