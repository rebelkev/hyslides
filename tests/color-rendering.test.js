import test from "node:test";
import assert from "node:assert/strict";

import {
  lucideIconSvg,
  lucideIconSvgDataUri,
  normalizeLucideIconName,
  resolveLucideIconNode,
} from "../src/icon-assets.js";
import { resolveTextTypography } from "../src/renderer.js";

test("a linked element color overrides its global typography color", () => {
  const deck = {
    theme: {
      typographyStyles: {
        display: {
          fontFamily: "Inter",
          fontSize: 72,
          fontWeight: 800,
          lineHeight: 1.05,
          color: "#111111",
        },
      },
      colors: { ink: "#222222" },
      fonts: { heading: "Inter", body: "Inter" },
    },
  };
  const element = {
    type: "text",
    typographyStyleId: "display",
    useGlobalTypography: true,
    brandColorStyleId: "brand-accent",
    color: "#D94B3D",
  };

  assert.equal(resolveTextTypography(element, deck).color, "#D94B3D");
});

test("global typography color remains active without an element color override", () => {
  const deck = {
    theme: {
      typographyStyles: { body: { color: "#123456" } },
      colors: { ink: "#222222" },
      fonts: { heading: "Inter", body: "Inter" },
    },
  };

  assert.equal(resolveTextTypography({
    type: "text",
    typographyStyleId: "body",
    useGlobalTypography: true,
    color: "#abcdef",
  }, deck).color, "#123456");
});

test("icon SVG embeds the exact selected color without changing other icons", () => {
  const iconNode = [
    ["path", { d: "M5 12h14", key: "line" }],
    ["circle", { cx: "12", cy: "12", r: "9", key: "ring" }],
  ];
  const svg = lucideIconSvg(iconNode, "#8B0C8D", 2.5);
  const uri = lucideIconSvgDataUri(iconNode, "#8B0C8D", 2.5);

  assert.match(svg, /stroke="#8B0C8D"/);
  assert.match(svg, /stroke-width="2.5"/);
  assert.match(svg, /<path d="M5 12h14"/);
  assert.match(decodeURIComponent(uri), /stroke="#8B0C8D"/);
});

test("icon selection resolves normalized Lucide export names to distinct assets", () => {
  const icons = {
    ActivityIcon: [["path", { d: "M3 12h4l2-7 4 14 2-7h6" }]],
    CircleHelp: [["circle", { cx: "12", cy: "12", r: "10" }]],
    Sparkles: [["path", { d: "m12 3-1.9 5.1L5 10l5.1 1.9L12 17l1.9-5.1L19 10l-5.1-1.9Z" }]],
  };

  assert.equal(normalizeLucideIconName("ActivityIcon"), "activity");
  const activity = lucideIconSvgDataUri(resolveLucideIconNode(icons, "activity"), "#2454D6", 2);
  const help = lucideIconSvgDataUri(resolveLucideIconNode(icons, "circle-help"), "#2454D6", 2);
  assert.notEqual(activity, help);
  assert.match(decodeURIComponent(activity), /M3 12h4l2-7/);
  assert.match(decodeURIComponent(help), /<circle/);
});
