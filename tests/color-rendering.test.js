import test from "node:test";
import assert from "node:assert/strict";

import { lucideIconSvg, lucideIconSvgDataUri } from "../src/icon-assets.js";
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
