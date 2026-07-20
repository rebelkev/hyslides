import { createElement, createSection, createSeedDeck, normalizeDeck, SLIDE_SIZE } from "../src/schema.js";
import { drawSlideAsync } from "../src/renderer.js";
import { exportDeckToPdf } from "../src/pdf.js";
import { exportDeckToPptx, importPptx } from "../src/pptx.js";
import { getAnswerFeedback } from "../src/engagement.js";

const output = document.querySelector("#output");
const results = [];

await test("slide renderer produces nonblank pixels", async () => {
  const deck = createSeedDeck();
  const canvas = document.createElement("canvas");
  canvas.width = SLIDE_SIZE.width;
  canvas.height = SLIDE_SIZE.height;
  const ctx = canvas.getContext("2d");
  await drawSlideAsync(ctx, deck.slides[0], deck, { footer: true });
  const sample = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let nonWhite = 0;
  for (let i = 0; i < sample.length; i += 4 * 97) {
    if (sample[i] < 245 || sample[i + 1] < 245 || sample[i + 2] < 245) {
      nonWhite += 1;
    }
  }
  assert(nonWhite > 10, "expected visible non-white slide content");
});

await test("PDF export returns a multi-page PDF blob", async () => {
  const deck = createSeedDeck();
  const result = await exportDeckToPdf(deck);
  assert(result.filename.endsWith(".pdf"), "expected pdf filename");
  assert(result.blob.type === "application/pdf", "expected application/pdf blob");
  assert(result.blob.size > 5000, "expected a substantive PDF payload");
});

await test("PPTX export imports back into editable slides", async () => {
  const deck = createSeedDeck();
  const result = await exportDeckToPptx(deck);
  assert(result.filename.endsWith(".pptx"), "expected pptx filename");
  assert(result.blob.size > 5000, "expected a substantive PPTX payload");
  const file = new File([result.blob], result.filename, { type: result.blob.type });
  const imported = await importPptx(file);
  assert(imported.slides.length === deck.slides.length, "expected same slide count after round trip");
  assert(imported.slides[0].elements.length > 0, "expected editable elements after import");
});

await test("multiple choice feedback supports multiple correct answers", async () => {
  const deck = createSeedDeck();
  const slide = deck.slides[0];
  slide.engagement.enabled = true;
  slide.engagement.type = "multipleChoice";
  slide.engagement.options = ["Alpha", "Beta", "Gamma"];
  slide.engagement.correctAnswers = ["Alpha", "Gamma"];
  slide.engagement.showCorrectAnswer = true;

  const correct = getAnswerFeedback(slide, "Gamma");
  const incorrect = getAnswerFeedback(slide, "Beta");
  assert(correct.isCorrect, "expected Gamma to be accepted as correct");
  assert(!incorrect.isCorrect, "expected Beta to be marked incorrect");
  assert(correct.correctAnswers.length === 2, "expected two correct answers");
});

await test("deck sections survive normalization", async () => {
  const deck = createSeedDeck();
  const section = createSection({ name: "Market readout" });
  deck.sections = [section];
  deck.slides[1].sectionId = section.id;

  const normalized = normalizeDeck(deck);
  assert(normalized.sections[0].name === "Market readout", "expected section name to persist");
  assert(normalized.slides[1].sectionId === section.id, "expected slide to stay in its section");

  const orphaned = normalizeDeck({
    ...deck,
    sections: [],
    slides: deck.slides.map((slide) => ({ ...slide })),
  });
  assert(orphaned.slides[1].sectionId === null, "expected orphaned section references to be cleared");
});

await test("engagement elements render on the slide canvas", async () => {
  const deck = createSeedDeck();
  const slide = deck.slides[0];
  slide.elements = [
    createElement("engagement", {
      x: 120,
      y: 120,
      w: 640,
      h: 300,
      mode: "multipleChoice",
      prompt: "Which launch path should we choose?",
      options: ["Pilot", "Private beta", "GA"],
      correctAnswers: ["Private beta"],
    }),
  ];

  const canvas = document.createElement("canvas");
  canvas.width = SLIDE_SIZE.width;
  canvas.height = SLIDE_SIZE.height;
  const ctx = canvas.getContext("2d");
  await drawSlideAsync(ctx, slide, deck, { footer: false });
  const sample = ctx.getImageData(120, 120, 640, 300).data;
  let colored = 0;
  for (let i = 0; i < sample.length; i += 4 * 113) {
    if (sample[i] < 245 || sample[i + 1] < 245 || sample[i + 2] < 245) {
      colored += 1;
    }
  }
  assert(colored > 20, "expected engagement widget content to render");
});

render();

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "pass" });
  } catch (error) {
    results.push({ name, status: "fail", error });
  }
  render();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function render() {
  output.innerHTML = results
    .map((result) => {
      if (result.status === "pass") {
        return `<span class="pass">PASS</span> ${escapeHtml(result.name)}`;
      }
      return `<span class="fail">FAIL</span> ${escapeHtml(result.name)}\n${escapeHtml(result.error?.stack || result.error)}`;
    })
    .join("\n");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
