import { DEFAULT_REACTION_OPTIONS, MAX_ENGAGEMENT_OPTIONS, SLIDE_SIZE, normalizeEngagementOptionColors, normalizeReactionOption, reactionEmoji } from "./schema.js";
import { youtubeVideoId } from "./embed.js";
import { createWordCloudLayout } from "./word-cloud.js";
import { renderShaderOverlay } from "./backgrounds.js";

const imageCache = new Map();

export function resolveTextTypography(element, deck) {
  const style = element?.useGlobalTypography !== false
    ? deck?.theme?.typographyStyles?.[element.typographyStyleId || "body"]
    : null;
  const linkedColor = element?.brandColorStyleId ? element.color : null;
  return {
    fontFamily: style?.fontFamily || element.fontFamily || (element.fontWeight >= 700 ? deck?.theme?.fonts?.heading : deck?.theme?.fonts?.body) || "Inter",
    fontSize: Number(style?.fontSize || element.fontSize || 28),
    fontWeight: Number(style?.fontWeight || element.fontWeight || 500),
    lineHeight: Number(style?.lineHeight || element.lineHeight || 1.18),
    // An element color style is an intentional override even while the
    // remaining typography properties stay linked to the deck.
    color: linkedColor || style?.color || element.color || deck?.theme?.colors?.ink || "#1d232a",
  };
}

export async function preloadSlideImages(slide, deck = null) {
  const images = slide.elements
    .filter((element) => (element.type === "image" && element.src) || (element.type === "icon" && element.iconSrc) || (element.type === "shape" && element.fillType === "image" && element.fillImage))
    .map((element) => loadImage(element.type === "icon" ? element.iconSrc : element.type === "shape" ? element.fillImage : element.src).catch(() => null));
  if (slide.backgroundImage) images.push(loadImage(slide.backgroundImage).catch(() => null));
  if (deck?.theme?.logo?.src && slideLogoVisible(slide, deck)) images.push(loadImage(deck.theme.logo.src).catch(() => null));
  await Promise.all(images);
}

export function measureTextElementHeight(ctx, element, deck) {
  if (!ctx || element?.type !== "text") return Number(element?.h || 0);
  ctx.save();
  const { fontFamily, fontSize, fontWeight, lineHeight } = resolveTextTypography(element, deck);
  const fontStyle = element.italic ? "italic " : "";
  ctx.font = `${fontStyle}${fontWeight} ${fontSize}px ${fontFamily}, Arial, sans-serif`;
  const lineCount = Math.max(1, layoutTextLines(ctx, { ...element, fontSize, lineHeight }).length);
  const height = Math.ceil(lineCount * fontSize * lineHeight + 4);
  ctx.restore();
  return Math.max(12, height);
}

export function measureEngagementElementHeight(element) {
  if (element?.type !== "engagement" || !["poll", "multipleChoice"].includes(element.mode)) {
    return Number(element?.h || 0);
  }
  const optionCount = Math.min(MAX_ENGAGEMENT_OPTIONS, Math.max(1, element.options?.length || 0));
  const padding = Math.max(18, Math.min(34, Number(element.w || 760) * 0.04));
  const promptLineCount = String(element.prompt || "Audience question").length > 48 ? 2 : 1;
  return Math.ceil(
    padding * 2 + 34 + 22 + promptLineCount * 38 + 8 +
    optionCount * 42 + Math.max(0, optionCount - 1) * 8
  );
}

export function drawSlide(ctx, slide, deck, options = {}) {
  const {
    selectedIds = [],
    guides = [],
    includeSelection = false,
    scale = 1,
    footer = true,
    revealCorrectAnswers = true,
    showEngagementPlaceholders = false,
    elementStates = null,
    countdownStates = null,
    slideIndex = null,
  } = options;

  ctx.save();
  ctx.clearRect(0, 0, SLIDE_SIZE.width, SLIDE_SIZE.height);
  drawSlideBackground(ctx, slide, deck);
  if (footer) drawSlideFurniture(ctx, slide, deck, slideIndex);

  for (const element of slide.elements) {
    const state = elementStates?.[element.id];
    if (state?.hidden) continue;
    drawElement(ctx, element, deck, {
      revealCorrectAnswers,
      showEngagementPlaceholders,
      opacityMultiplier: state?.opacity ?? 1,
      countdownStates,
    });
  }

  drawDeckLogo(ctx, slide, deck);

  if (guides.length) {
    drawGuides(ctx, guides);
  }

  if (includeSelection && selectedIds.length) {
    const selected = slide.elements.filter((element) =>
      selectedIds.includes(element.id)
    );
    drawSelection(ctx, selected, scale);
  }

  ctx.restore();
}

function drawSlideBackground(ctx, slide, deck) {
  slide = slide?.backgroundUseDeckDefault
    ? {
        ...slide,
        backgroundType: deck?.theme?.defaultBackground?.type || "color",
        background: deck?.theme?.defaultBackground?.color || deck?.theme?.colors?.background || "#ffffff",
        backgroundGradientStart: deck?.theme?.defaultBackground?.gradientStart || deck?.theme?.colors?.primary,
        backgroundGradientEnd: deck?.theme?.defaultBackground?.gradientEnd || deck?.theme?.colors?.accent,
        backgroundGradientAngle: deck?.theme?.defaultBackground?.gradientAngle ?? 135,
        backgroundStyleId: null,
        backgroundGradientStartStyleId: null,
        backgroundGradientEndStyleId: null,
        backgroundOverlayEnabled: false,
        backgroundShader: "none",
      }
    : slide;
  const type = slide.backgroundType || (slide.backgroundImage ? "image" : "color");
  ctx.fillStyle = slideBackgroundColor(slide, deck, "background", "backgroundStyleId", deck.theme.colors.background);
  ctx.fillRect(0, 0, SLIDE_SIZE.width, SLIDE_SIZE.height);

  if (type === "gradient") {
    const angle = ((Number(slide.backgroundGradientAngle) || 0) - 90) * Math.PI / 180;
    const radius = Math.abs(SLIDE_SIZE.width * Math.cos(angle)) + Math.abs(SLIDE_SIZE.height * Math.sin(angle));
    const cx = SLIDE_SIZE.width / 2;
    const cy = SLIDE_SIZE.height / 2;
    const gradient = ctx.createLinearGradient(
      cx - Math.cos(angle) * radius / 2,
      cy - Math.sin(angle) * radius / 2,
      cx + Math.cos(angle) * radius / 2,
      cy + Math.sin(angle) * radius / 2
    );
    gradient.addColorStop(0, slideBackgroundColor(slide, deck, "backgroundGradientStart", "backgroundGradientStartStyleId", deck.theme.colors.primary));
    gradient.addColorStop(1, slideBackgroundColor(slide, deck, "backgroundGradientEnd", "backgroundGradientEndStyleId", deck.theme.colors.accent));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, SLIDE_SIZE.width, SLIDE_SIZE.height);
  } else if (type === "image" && slide.backgroundImage) {
    const image = imageCache.get(slide.backgroundImage)?.image;
    if (image) drawFittedBackgroundImage(ctx, image, slide.backgroundImageFit || "cover");
    else loadImage(slide.backgroundImage).catch(() => {});
  }

  if (type === "animated" && slide.backgroundShader && slide.backgroundShader !== "none") {
    const shader = renderShaderOverlay(slide.backgroundShader, SLIDE_SIZE.width, SLIDE_SIZE.height, {
      time: typeof performance !== "undefined" ? performance.now() / 1000 : 0,
      speed: slide.backgroundShaderSpeed,
      intensity: slide.backgroundShaderIntensity,
      colorA: slideBackgroundColor(slide, deck, "backgroundEffectColorA", "backgroundEffectColorAStyleId", deck.theme.colors.primary),
      colorB: slideBackgroundColor(slide, deck, "backgroundEffectColorB", "backgroundEffectColorBStyleId", deck.theme.colors.accent),
    });
    if (shader) ctx.drawImage(shader, 0, 0, SLIDE_SIZE.width, SLIDE_SIZE.height);
    else drawShaderFallback(ctx, slide, deck);
  }

  const overlayOpacity = slide.backgroundOverlayEnabled
    ? Math.max(0, Math.min(1, Number(slide.backgroundOverlayOpacity) || 0))
    : 0;
  if (overlayOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = overlayOpacity;
    ctx.fillStyle = slideBackgroundColor(slide, deck, "backgroundOverlayColor", "backgroundOverlayColorStyleId", "#000000");
    ctx.fillRect(0, 0, SLIDE_SIZE.width, SLIDE_SIZE.height);
    ctx.restore();
  }
}

function drawFittedBackgroundImage(ctx, image, fit) {
  const rect = backgroundImageRect(image.width, image.height, fit);
  ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
}

function slideBackgroundColor(slide, deck, colorKey, styleKey, fallback) {
  const linked = deck.theme?.brandColorStyles?.find((style) => style.id === slide[styleKey]);
  return linked?.color || slide[colorKey] || fallback;
}

export function backgroundImageRect(imageWidth, imageHeight, fit = "cover") {
  const safeWidth = Math.max(1, Number(imageWidth) || 1);
  const safeHeight = Math.max(1, Number(imageHeight) || 1);
  const ratio = fit === "contain"
    ? Math.min(SLIDE_SIZE.width / safeWidth, SLIDE_SIZE.height / safeHeight)
    : Math.max(SLIDE_SIZE.width / safeWidth, SLIDE_SIZE.height / safeHeight);
  const width = safeWidth * ratio;
  const height = safeHeight * ratio;
  return { x: (SLIDE_SIZE.width - width) / 2, y: (SLIDE_SIZE.height - height) / 2, width, height };
}

function drawShaderFallback(ctx, slide, deck) {
  const gradient = ctx.createRadialGradient(340, 180, 20, 640, 360, 760);
  gradient.addColorStop(0, slideBackgroundColor(slide, deck, "backgroundEffectColorA", "backgroundEffectColorAStyleId", deck.theme.colors.primary));
  gradient.addColorStop(1, slideBackgroundColor(slide, deck, "backgroundEffectColorB", "backgroundEffectColorBStyleId", deck.theme.colors.accent));
  ctx.save();
  const intensity = Number(slide.backgroundShaderIntensity);
  ctx.globalAlpha = Math.max(0, Math.min(0.7, Number.isFinite(intensity) ? intensity : 0.5));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SLIDE_SIZE.width, SLIDE_SIZE.height);
  ctx.restore();
}

export async function drawSlideAsync(ctx, slide, deck, options = {}) {
  await preloadSlideImages(slide, deck);
  drawSlide(ctx, slide, deck, options);
}

export function slideLogoVisible(slide, deck) {
  if (!deck?.theme?.logo?.src) return false;
  return slide?.logoVisible == null ? deck.theme.logo.showOnSlides !== false : Boolean(slide.logoVisible);
}

function drawDeckLogo(ctx, slide, deck) {
  const logo = deck?.theme?.logo;
  if (!logo?.src || !slideLogoVisible(slide, deck)) return;
  const image = imageCache.get(logo.src)?.image;
  if (!image) {
    loadImage(logo.src).catch(() => {});
    return;
  }
  const width = Math.max(32, Math.min(320, Number(logo.width) || 120));
  const height = width * Math.max(1, Number(image.height) || 1) / Math.max(1, Number(image.width) || 1);
  const margin = Math.max(0, Math.min(120, Number(logo.margin) || 28));
  const corner = slide.logoCorner || logo.corner || "bottom-right";
  const x = corner.endsWith("right") ? SLIDE_SIZE.width - width - margin : margin;
  const y = corner.startsWith("bottom") ? SLIDE_SIZE.height - height - margin : margin;
  ctx.save();
  ctx.drawImage(image, x, y, width, height);
  ctx.restore();
}

export function drawElement(ctx, element, deck, options = {}) {
  element = resolveElementBrandColor(element, deck);
  ctx.save();
  ctx.globalAlpha = (element.opacity ?? 1) * (options.opacityMultiplier ?? 1);
  ctx.translate(element.x + element.w / 2, element.y + element.h / 2);
  ctx.rotate(((element.rotation || 0) * Math.PI) / 180);
  ctx.translate(-element.w / 2, -element.h / 2);

  switch (element.type) {
    case "text":
      drawText(ctx, element, deck);
      break;
    case "shape":
      drawShape(ctx, element);
      break;
    case "image":
      drawImageElement(ctx, element);
      break;
    case "icon":
      drawIcon(ctx, element);
      break;
    case "chart":
      drawChart(ctx, element, deck);
      break;
    case "table":
      drawTable(ctx, element, deck);
      break;
    case "divider":
      drawDivider(ctx, element);
      break;
    case "engagement":
      drawEngagement(ctx, element, deck, options);
      break;
    case "countdown":
      drawCountdown(ctx, element, deck, options);
      break;
    case "embed":
      drawEmbed(ctx, element, deck);
      break;
    default:
      drawUnsupported(ctx, element);
  }

  ctx.restore();
}

function drawEmbed(ctx, element, deck) {
  const videoId = youtubeVideoId(element.url || element.videoId);
  ctx.fillStyle = element.fill || "#111827";
  roundedRect(ctx, 0, 0, element.w, element.h, 12);
  ctx.fill();
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 2;
  ctx.stroke();

  const radius = Math.max(24, Math.min(54, Math.min(element.w, element.h) * 0.12));
  ctx.fillStyle = "#ff0033";
  roundedRect(ctx, element.w / 2 - radius * 1.35, element.h / 2 - radius * 0.78, radius * 2.7, radius * 1.56, radius * 0.35);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(element.w / 2 - radius * 0.22, element.h / 2 - radius * 0.42);
  ctx.lineTo(element.w / 2 - radius * 0.22, element.h / 2 + radius * 0.42);
  ctx.lineTo(element.w / 2 + radius * 0.5, element.h / 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${Math.max(14, Math.min(22, element.w / 34))}px ${deck.theme.fonts.body}, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(videoId ? "YouTube video" : "Paste a YouTube link in Properties", element.w / 2, element.h - 24, element.w - 40);
}

function drawCountdown(ctx, element, deck, options = {}) {
  const state = options.countdownStates?.[element.id];
  const remaining = Math.max(0, Math.round(state?.remainingSeconds ?? element.runtimeRemainingSeconds ?? element.durationSeconds ?? 0));
  const completed = Boolean(state?.completed ?? element.runtimeCompleted);
  const hidden = Boolean(state?.hidden ?? element.runtimeHidden);
  if (hidden || (completed && element.completionBehavior === "hide")) return;
  const showMessage = completed && element.completionBehavior === "message" && element.completionMessage;
  const text = showMessage
    ? element.completionMessage
    : `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  const legacyTransparentTimer = !element.fill || element.fill === "transparent";
  const timerFill = legacyTransparentTimer ? "#111827" : element.fill;
  if (timerFill) {
    ctx.save();
    ctx.globalAlpha *= Math.max(0, Math.min(1, Number(element.backgroundOpacity ?? 0.78)));
    ctx.fillStyle = timerFill;
    roundedRect(ctx, 0, 0, element.w, element.h, Math.max(0, Number(element.cornerRadius) || 18));
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = legacyTransparentTimer ? "#ffffff" : element.color || deck.theme.colors.ink;
  ctx.font = `${element.fontWeight || 800} ${showMessage ? Math.min(element.fontSize || 104, 64) : element.fontSize || 104}px ${element.fontFamily || deck.theme.fonts.heading}, Arial, sans-serif`;
  ctx.textAlign = element.align || "center";
  ctx.textBaseline = "middle";
  const x = ctx.textAlign === "left" ? 0 : ctx.textAlign === "right" ? element.w : element.w / 2;
  ctx.fillText(text, x, element.h / 2, element.w);
}

function resolveElementBrandColor(element, deck) {
  if (!element.brandColorStyleId) return element;
  const style = deck.theme?.brandColorStyles?.find((item) => item.id === element.brandColorStyleId);
  if (!style?.color) return element;
  if (element.type === "text") return { ...element, color: style.color };
  if (element.type === "table") return { ...element, headerFill: style.color };
  if (element.type === "engagement") return { ...element, accent: style.color };
  return { ...element, fill: style.color };
}

export function boundsForElements(elements) {
  if (!elements.length) {
    return null;
  }
  const left = Math.min(...elements.map((element) => element.x));
  const top = Math.min(...elements.map((element) => element.y));
  const right = Math.max(...elements.map((element) => element.x + element.w));
  const bottom = Math.max(...elements.map((element) => element.y + element.h));
  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
  };
}

export function hitTest(slide, point) {
  const reversed = [...slide.elements].reverse();
  return reversed.find((element) => {
    if (element.locked) {
      return false;
    }
    return (
      point.x >= element.x &&
      point.y >= element.y &&
      point.x <= element.x + element.w &&
      point.y <= element.y + element.h
    );
  });
}

export function hitTestHandle(bounds, point, tolerance = 8) {
  if (!bounds) {
    return null;
  }
  const handles = getHandles(bounds);
  return handles.find(
    (handle) =>
      Math.abs(point.x - handle.x) <= tolerance &&
      Math.abs(point.y - handle.y) <= tolerance
  )?.name;
}

export function getHandles(bounds) {
  return [
    { name: "nw", x: bounds.x, y: bounds.y },
    { name: "n", x: bounds.x + bounds.w / 2, y: bounds.y },
    { name: "ne", x: bounds.x + bounds.w, y: bounds.y },
    { name: "e", x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 },
    { name: "se", x: bounds.x + bounds.w, y: bounds.y + bounds.h },
    { name: "s", x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h },
    { name: "sw", x: bounds.x, y: bounds.y + bounds.h },
    { name: "w", x: bounds.x, y: bounds.y + bounds.h / 2 },
  ];
}

export function fitCanvasToImage(canvas, image, mode = "cover") {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const ratio = mode === "contain"
    ? Math.min(canvas.width / image.width, canvas.height / image.height)
    : Math.max(canvas.width / image.width, canvas.height / image.height);
  const width = image.width * ratio;
  const height = image.height * ratio;
  ctx.drawImage(
    image,
    (canvas.width - width) / 2,
    (canvas.height - height) / 2,
    width,
    height
  );
}

function drawText(ctx, element, deck) {
  const { fontFamily, fontSize, fontWeight, lineHeight, color } = resolveTextTypography(element, deck);
  const fontStyle = element.italic ? "italic " : "";
  ctx.font = `${fontStyle}${fontWeight} ${fontSize}px ${fontFamily}, Arial, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = element.bulletList ? "left" : element.align || "left";
  ctx.textBaseline = "top";

  if (element.fill && element.fill !== "transparent") {
    ctx.fillStyle = element.fill;
    roundedRect(ctx, 0, 0, element.w, element.h, element.radius || 0);
    ctx.fill();
    ctx.fillStyle = color;
  }

  const lines = layoutTextLines(ctx, { ...element, fontSize, lineHeight });
  const lineHeightPx = fontSize * lineHeight;
  const totalHeight = lines.length * lineHeightPx;
  let y = 2;
  if (element.verticalAlign === "middle") {
    y = Math.max(2, (element.h - totalHeight) / 2);
  }
  if (element.verticalAlign === "bottom") {
    y = Math.max(2, element.h - totalHeight - 2);
  }

  for (const line of lines) {
    if (line.bullet) {
      drawBulletMarker(ctx, line.bulletX, y, fontSize);
    }
    ctx.fillText(line.text, line.x, y, line.maxWidth);
    if (element.underline) {
      drawUnderline(ctx, line.text, line.x, y, fontSize, line.maxWidth, ctx.textAlign);
    }
    y += lineHeightPx;
  }
}

function drawShape(ctx, element) {
  ctx.strokeStyle = element.stroke || "transparent";
  ctx.lineWidth = element.strokeWidth || 0;

  if (element.shape === "rectangle") {
    ctx.beginPath();
    ctx.rect(0, 0, element.w, element.h);
  } else if (element.shape === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(element.w / 2, element.h / 2, element.w / 2, element.h / 2, 0, 0, Math.PI * 2);
  } else if (element.shape === "triangle") {
    ctx.beginPath();
    ctx.moveTo(element.w / 2, 0);
    ctx.lineTo(element.w, element.h);
    ctx.lineTo(0, element.h);
    ctx.closePath();
  } else if (element.shape === "diamond") {
    ctx.beginPath();
    ctx.moveTo(element.w / 2, 0);
    ctx.lineTo(element.w, element.h / 2);
    ctx.lineTo(element.w / 2, element.h);
    ctx.lineTo(0, element.h / 2);
    ctx.closePath();
  } else if (element.shape === "hexagon") {
    const inset = element.w * 0.22;
    ctx.beginPath();
    ctx.moveTo(inset, 0);
    ctx.lineTo(element.w - inset, 0);
    ctx.lineTo(element.w, element.h / 2);
    ctx.lineTo(element.w - inset, element.h);
    ctx.lineTo(inset, element.h);
    ctx.lineTo(0, element.h / 2);
    ctx.closePath();
  } else {
    roundedRect(ctx, 0, 0, element.w, element.h, Math.max(0, Number(element.radius) || 0));
  }

  const fillType = element.fillType || "color";
  if (fillType === "gradient") {
    const angle = ((Number(element.fillGradientAngle) || 0) - 90) * Math.PI / 180;
    const radius = Math.abs(element.w * Math.cos(angle)) + Math.abs(element.h * Math.sin(angle));
    const gradient = ctx.createLinearGradient(
      element.w / 2 - Math.cos(angle) * radius / 2,
      element.h / 2 - Math.sin(angle) * radius / 2,
      element.w / 2 + Math.cos(angle) * radius / 2,
      element.h / 2 + Math.sin(angle) * radius / 2
    );
    gradient.addColorStop(0, element.fillGradientStart || "#2454d6");
    gradient.addColorStop(1, element.fillGradientEnd || "#0c8b7f");
    ctx.fillStyle = gradient;
    ctx.fill();
  } else if (fillType === "image" && element.fillImage) {
    ctx.save();
    ctx.clip();
    const image = imageCache.get(element.fillImage)?.image;
    if (image) drawFittedElementImage(ctx, image, element.w, element.h, element.fillImageFit || "cover");
    else loadImage(element.fillImage).catch(() => {});
    ctx.restore();
  } else if (fillType === "animated" && element.fillShader) {
    ctx.save();
    ctx.clip();
    const shader = renderShaderOverlay(element.fillShader, Math.max(1, Math.round(element.w)), Math.max(1, Math.round(element.h)), {
      time: typeof performance !== "undefined" ? performance.now() / 1000 : 0,
      speed: element.fillShaderSpeed,
      intensity: element.fillShaderIntensity,
      colorA: element.fillEffectColorA || "#2454d6",
      colorB: element.fillEffectColorB || "#0c8b7f",
    });
    if (shader) ctx.drawImage(shader, 0, 0, element.w, element.h);
    ctx.restore();
  } else {
    ctx.fillStyle = element.fill || "#e8efff";
    ctx.fill();
  }
  if ((element.strokeWidth || 0) > 0) {
    ctx.stroke();
  }
}

function drawFittedElementImage(ctx, image, width, height, fit) {
  const ratio = fit === "contain"
    ? Math.min(width / image.width, height / image.height)
    : Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * ratio;
  const drawHeight = image.height * ratio;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawImageElement(ctx, element) {
  const image = imageCache.get(element.src)?.image;
  if (!image) {
    loadImage(element.src).catch(() => {});
    drawImagePlaceholder(ctx, element);
    return;
  }

  ctx.save();
  roundedRect(ctx, 0, 0, element.w, element.h, element.radius || 8);
  ctx.clip();

  const ratio =
    element.fit === "contain"
      ? Math.min(element.w / image.width, element.h / image.height)
      : Math.max(element.w / image.width, element.h / image.height);
  const width = image.width * ratio;
  const height = image.height * ratio;
  ctx.drawImage(image, (element.w - width) / 2, (element.h - height) / 2, width, height);
  ctx.restore();
}

function drawIcon(ctx, element) {
  const frame = element.iconFrame || "none";
  if (frame !== "none") {
    ctx.fillStyle = element.frameFill || "#e8efff";
    ctx.beginPath();
    if (frame === "circle") {
      ctx.ellipse(element.w / 2, element.h / 2, element.w / 2, element.h / 2, 0, 0, Math.PI * 2);
    } else {
      roundedRect(ctx, 0, 0, element.w, element.h, frame === "rounded" ? Math.min(element.w, element.h) * 0.18 : 0);
    }
    ctx.fill();
  }

  const image = imageCache.get(element.iconSrc)?.image;
  if (image) {
    const paddingPercent = Math.max(0, Math.min(40, Number(element.padding) || 0));
    const insetX = element.w * paddingPercent / 100;
    const insetY = element.h * paddingPercent / 100;
    const width = Math.max(1, element.w - insetX * 2);
    const height = Math.max(1, element.h - insetY * 2);
    ctx.save();
    ctx.translate(element.flipHorizontal ? element.w : 0, element.flipVertical ? element.h : 0);
    ctx.scale(element.flipHorizontal ? -1 : 1, element.flipVertical ? -1 : 1);
    ctx.drawImage(image, insetX, insetY, width, height);
    ctx.restore();
    return;
  }

  // A modern icon may still be loading. Do not briefly draw the old default
  // Sparkles artwork while its selected SVG asset is being prepared.
  if (element.iconSrc) {
    loadImage(element.iconSrc).catch(() => {});
    return;
  }

  // Legacy fallback only for decks saved before icon assets were introduced.
  const size = Math.min(element.w, element.h);
  const cx = element.w / 2;
  const cy = element.h / 2;
  ctx.strokeStyle = element.fill || "#2454d6";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, size * 0.055);
  ctx.beginPath();
  for (let i = 0; i < 16; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / 16;
    const radius = i % 2 === 0 ? size * 0.42 : size * 0.19;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawChart(ctx, element, deck) {
  const values = Array.isArray(element.values)
    ? element.values.map((value) => Math.max(0, Number(value) || 0))
    : [];
  const labels = Array.isArray(element.labels) ? element.labels : [];
  const colors = element.engagementResults
    ? normalizeEngagementOptionColors(labels, element.colors)
    : labels.map(() => element.fill || deck.theme.colors.accent);
  const padding = 30;
  const max = Math.max(1, ...values);
  const barGap = 12;
  const barAreaWidth = element.w - padding * 2;
  const barWidth = Math.max(10, (barAreaWidth - barGap * Math.max(0, values.length - 1)) / Math.max(1, values.length));
  const chartHeight = element.h - padding * 2 - 18;

  ctx.fillStyle = element.background || "transparent";
  if (element.background && element.background !== "transparent") {
    ctx.fillRect(0, 0, element.w, element.h);
  }

  ctx.strokeStyle = element.axisColor || deck.theme.colors.muted;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, padding + chartHeight);
  ctx.lineTo(element.w - padding + 4, padding + chartHeight);
  ctx.stroke();

  values.forEach((value, index) => {
    const height = (value / max) * chartHeight;
    const x = padding + index * (barWidth + barGap);
    const y = padding + chartHeight - height;
    ctx.fillStyle = colors[index] || element.fill || deck.theme.colors.accent;
    if (height > 0) {
      roundedRect(ctx, x, y, barWidth, height, Math.min(5, height / 2));
      ctx.fill();
    }
  });

  ctx.font = `600 14px ${deck.theme.fonts.body}, Arial, sans-serif`;
  ctx.fillStyle = deck.theme.colors.muted;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  labels.forEach((label, index) => {
    const x = padding + index * (barWidth + barGap) + barWidth / 2;
    const displayLabel = element.engagementResults
      ? `${shorten(label, 11)} · ${values[index] || 0}`
      : shorten(label, 14);
    ctx.fillText(displayLabel, x, padding + chartHeight + 8, barWidth + 24);
  });
}

function drawTable(ctx, element, deck) {
  const rows = element.rows || element.cells.length;
  const cols = element.cols || Math.max(...element.cells.map((row) => row.length));
  const cellW = element.w / cols;
  const cellH = element.h / rows;
  ctx.lineWidth = 1;
  ctx.strokeStyle = element.borderColor || "#cbd5e1";
  ctx.font = `600 17px ${deck.theme.fonts.body}, Arial, sans-serif`;
  ctx.textBaseline = "middle";

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = col * cellW;
      const y = row * cellH;
      ctx.fillStyle = row === 0 ? element.headerFill || "#1d232a" : "#ffffff";
      ctx.fillRect(x, y, cellW, cellH);
      ctx.strokeRect(x, y, cellW, cellH);
      ctx.fillStyle =
        row === 0 ? element.headerColor || "#ffffff" : element.textColor || deck.theme.colors.ink;
      ctx.fillText(element.cells[row]?.[col] || "", x + 12, y + cellH / 2, cellW - 18);
    }
  }
}

function drawDivider(ctx, element) {
  ctx.fillStyle = element.fill || "#d94b3d";
  const radius = Math.max(0, Math.min(Number(element.radius) || 0, element.w / 2, element.h / 2));
  roundedRect(ctx, 0, 0, element.w, element.h, radius);
  ctx.fill();
}

function drawEngagement(ctx, element, deck, renderOptions = {}) {
  const mode = element.mode || "poll";
  const prompt = element.prompt || "Audience question";
  const options = (element.options?.length ? element.options : ["Option A", "Option B", "Option C"])
    .slice(0, MAX_ENGAGEMENT_OPTIONS);
  const accent = element.accent || deck.theme.colors.primary;
  const padding = Math.max(18, Math.min(34, element.w * 0.04));
  const headerHeight = 34;

  ctx.fillStyle = element.fill || "#ffffff";
  ctx.strokeStyle = element.stroke || "#cbd5e1";
  ctx.lineWidth = 2;
  roundedRect(ctx, 0, 0, element.w, element.h, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = accent;
  roundedRect(ctx, padding, padding, Math.min(178, element.w - padding * 2), headerHeight, 8);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 16px ${deck.theme.fonts.body}, Arial, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(labelForEngagementMode(mode), padding + 14, padding + headerHeight / 2, 150);

  ctx.fillStyle = deck.theme.colors.ink;
  ctx.font = `800 ${Math.max(20, Math.min(34, element.w / 24))}px ${deck.theme.fonts.heading}, Arial, sans-serif`;
  ctx.textBaseline = "top";
  const promptLines = wrapText(ctx, prompt, element.w - padding * 2);
  let y = padding + headerHeight + 22;
  for (const line of promptLines.slice(0, 2)) {
    ctx.fillText(line, padding, y, element.w - padding * 2);
    y += Math.max(26, Math.min(38, element.w / 22));
  }
  y += 8;

  if (mode === "wordCloud") {
    drawWordCloudPreview(ctx, element, deck, options, padding, y, renderOptions);
  } else if (mode === "qna") {
    drawQnaPreview(ctx, element, deck, padding, y);
  } else if (mode === "reactions") {
    drawReactionPreview(ctx, element, deck, padding, y);
  } else {
    drawChoicePreview(ctx, element, deck, options, padding, y, renderOptions);
  }
}

function drawChoicePreview(ctx, element, deck, options, padding, y, renderOptions = {}) {
  const correct = element.hasCorrectAnswers && (renderOptions.revealCorrectAnswers ?? true)
    ? new Set(element.correctAnswers || [])
    : new Set();
  const availableHeight = Math.max(48, element.h - y - padding);
  const rowGap = options.length > 6 ? 5 : 10;
  const rowHeight = Math.max(16, Math.min(46, (availableHeight - rowGap * Math.max(0, options.length - 1)) / options.length));
  const optionColors = normalizeEngagementOptionColors(options, element.optionColors);

  ctx.font = `700 ${Math.max(11, Math.min(20, rowHeight * 0.44))}px ${deck.theme.fonts.body}, Arial, sans-serif`;
  ctx.textBaseline = "middle";
  options.forEach((option, index) => {
    const rowY = y + index * (rowHeight + rowGap);
    ctx.fillStyle = correct.has(option) ? "#eefbf8" : "#f8fafc";
    ctx.strokeStyle = correct.has(option) ? "#95d8cf" : "#d7dde6";
    ctx.lineWidth = 1.5;
    roundedRect(ctx, padding, rowY, element.w - padding * 2, rowHeight, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = optionColors[index];
    roundedRect(ctx, padding + 8, rowY + 7, 6, Math.max(4, rowHeight - 14), 3);
    ctx.fill();
    ctx.fillStyle = correct.has(option) ? "#0c6f66" : deck.theme.colors.ink;
    const count = Math.max(0, Number(element.results?.[option]) || 0);
    const total = Math.max(1, Object.values(element.results || {}).reduce((sum, value) => sum + (Number(value) || 0), 0));
    const progress = count / total;
    if (progress > 0) {
      ctx.save();
      ctx.globalAlpha *= 0.16;
      ctx.fillStyle = correct.has(option) ? "#0c8b7f" : optionColors[index];
      roundedRect(ctx, padding, rowY, (element.w - padding * 2) * progress, rowHeight, 8);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = correct.has(option) ? "#0c6f66" : deck.theme.colors.ink;
    ctx.fillText(`${String.fromCharCode(65 + index)}. ${option} · ${count}`, padding + 24, rowY + rowHeight / 2, element.w - padding * 2 - 40);
  });
}

function drawWordCloudPreview(ctx, element, deck, options, padding, y, renderOptions = {}) {
  const words = Object.entries(element.results || {})
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .slice(0, 32);
  if (!words.length) {
    if (!renderOptions.showEngagementPlaceholders) return;
    ctx.fillStyle = deck.theme.colors.muted;
    ctx.font = `700 20px ${deck.theme.fonts.body}, Arial, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText("Audience words will appear here", padding, y + 12, element.w - padding * 2);
    return;
  }
  const fontFamily = `${deck.theme.fonts.body}, Arial, sans-serif`;
  const cloud = createWordCloudLayout(words, {
    x: padding,
    y,
    width: Math.max(1, element.w - padding * 2),
    height: Math.max(1, element.h - y - padding),
  }, (word, fontSize) => {
    ctx.font = `800 ${fontSize}px ${fontFamily}`;
    return ctx.measureText(word).width;
  });
  const colors = [
    element.accent || deck.theme.colors.primary,
    deck.theme.colors.accent,
    deck.theme.colors.ink,
    deck.theme.colors.coral,
    deck.theme.colors.warning,
    deck.theme.colors.muted,
  ].filter(Boolean);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  cloud.forEach((item, index) => {
    ctx.font = `800 ${item.fontSize}px ${fontFamily}`;
    ctx.fillStyle = colors[index % colors.length];
    ctx.fillText(item.text, item.x, item.y, item.width);
  });
}

function drawQnaPreview(ctx, element, deck, padding, y) {
  const boxHeight = Math.max(72, Math.min(116, element.h - y - padding));
  ctx.fillStyle = "#f8fafc";
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1.5;
  roundedRect(ctx, padding, y, element.w - padding * 2, boxHeight, 10);
  ctx.fill();
  ctx.stroke();
  const featured = (element.qna || []).find((question) => question.visible !== false && !question.answered);
  ctx.fillStyle = featured ? deck.theme.colors.ink : deck.theme.colors.muted;
  ctx.font = `${featured ? "800" : "700"} ${featured ? 26 : 19}px ${deck.theme.fonts.body}, Arial, sans-serif`;
  ctx.textBaseline = "top";
  const content = featured?.text || "Audience questions appear here";
  const lines = wrapText(ctx, content, element.w - padding * 2 - 36);
  lines.slice(0, 3).forEach((line, index) => {
    ctx.fillText(line, padding + 18, y + 18 + index * (featured ? 34 : 26), element.w - padding * 2 - 36);
  });
}

function drawReactionPreview(ctx, element, deck, padding, y) {
  const keys = (element.reactionOptions || DEFAULT_REACTION_OPTIONS).map(normalizeReactionOption).filter(Boolean).slice(0, 5);
  const itemGap = 10;
  const itemWidth = Math.max(70, (element.w - padding * 2 - itemGap * Math.max(0, keys.length - 1)) / Math.max(1, keys.length));
  const itemHeight = Math.max(46, Math.min(74, element.h - y - padding));
  ctx.font = `800 16px ${deck.theme.fonts.body}, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  keys.forEach((key, index) => {
    const x = padding + index * (itemWidth + itemGap);
    ctx.fillStyle = "#f8fafc";
    ctx.strokeStyle = "#d7dde6";
    roundedRect(ctx, x, y, itemWidth, itemHeight, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = deck.theme.colors.ink;
    ctx.fillText(`${reactionEmoji(key)}  ${Math.max(0, Number(element.reactions?.[key]) || 0)}`, x + itemWidth / 2, y + itemHeight / 2, itemWidth - 10);
  });
  ctx.textAlign = "left";
}

function drawUnsupported(ctx, element) {
  ctx.fillStyle = "#fff7ed";
  ctx.strokeStyle = "#fb923c";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, element.w, element.h);
  ctx.fillRect(0, 0, element.w, element.h);
  ctx.fillStyle = "#7c2d12";
  ctx.font = "700 18px Arial, sans-serif";
  ctx.fillText(element.name || "Unsupported object", 12, 18, element.w - 24);
}

function labelForEngagementMode(mode) {
  const labels = {
    poll: "Live poll",
    multipleChoice: "Multiple choice",
    wordCloud: "Word cloud",
    qna: "Q&A",
    reactions: "Reactions",
  };
  return labels[mode] || "Engagement";
}

function drawImagePlaceholder(ctx, element) {
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(0, 0, element.w, element.h);
  ctx.strokeStyle = "#cbd5e1";
  ctx.strokeRect(0, 0, element.w, element.h);
  ctx.fillStyle = "#64748b";
  ctx.font = "700 18px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(element.alt || "Image", element.w / 2, element.h / 2);
}

export function slideNumberVisible(slide, deck) {
  return slide?.slideNumberVisible == null
    ? deck?.theme?.master?.footer?.showSlideNumber !== false
    : Boolean(slide.slideNumberVisible);
}

export function disclaimerVisible(slide, deck) {
  const disclaimer = deck?.theme?.master?.footer?.disclaimer;
  if (!String(disclaimer?.text || "").trim()) return false;
  return slide?.disclaimerVisible == null
    ? disclaimer?.enabled === true
    : Boolean(slide.disclaimerVisible);
}

function drawSlideFurniture(ctx, slide, deck, explicitSlideIndex = null) {
  const resolvedSlideIndex = Number.isInteger(explicitSlideIndex)
    ? explicitSlideIndex
    : Array.isArray(deck.slides)
    ? deck.slides.findIndex((item) => item.id === slide.id)
    : -1;
  const footer = deck?.theme?.master?.footer || {};

  if (disclaimerVisible(slide, deck)) {
    const disclaimer = footer.disclaimer || {};
    const style = deck?.theme?.typographyStyles?.[disclaimer.typographyStyleId || "caption"]
      || deck?.theme?.typographyStyles?.caption
      || {};
    const fontSize = Math.max(8, Number(style.fontSize) || 16);
    const lineHeight = fontSize * Math.max(0.8, Number(style.lineHeight) || 1.2);
    const position = String(slide?.disclaimerPosition || disclaimer.position || "bottom-center");
    const horizontal = position.endsWith("left") ? "left" : position.endsWith("right") ? "right" : "center";
    const maxWidth = SLIDE_SIZE.width * 0.72;
    const x = horizontal === "left" ? 40 : horizontal === "right" ? SLIDE_SIZE.width - 40 : SLIDE_SIZE.width / 2;
    ctx.fillStyle = style.color || footer.color || deck?.theme?.colors?.muted || "#637083";
    ctx.font = `${Number(style.fontWeight) || 600} ${fontSize}px ${style.fontFamily || deck?.theme?.fonts?.body || "Inter"}, Arial, sans-serif`;
    ctx.textAlign = horizontal;
    ctx.textBaseline = "top";
    const lines = wrapText(ctx, disclaimer.text, maxWidth);
    const y = position.startsWith("top")
      ? 26
      : SLIDE_SIZE.height - 24 - lines.length * lineHeight;
    lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight, maxWidth));
  }

  if (slideNumberVisible(slide, deck) && resolvedSlideIndex >= 0) {
    const position = String(slide?.slideNumberPosition || footer.slideNumberPosition || "bottom-right");
    const horizontal = position.endsWith("left") ? "left" : position.endsWith("center") ? "center" : "right";
    const x = horizontal === "left" ? 54 : horizontal === "center" ? SLIDE_SIZE.width / 2 : SLIDE_SIZE.width - 54;
    const y = position.startsWith("top") ? 30 : SLIDE_SIZE.height - 30;
    ctx.fillStyle = footer.color || deck?.theme?.colors?.muted || "#637083";
    ctx.font = `600 14px ${deck?.theme?.fonts?.body || "Inter"}, Arial, sans-serif`;
    ctx.textAlign = horizontal;
    ctx.textBaseline = position.startsWith("top") ? "top" : "bottom";
    ctx.fillText(String(resolvedSlideIndex + 1), x, y);
  }
}

function drawSelection(ctx, selected, scale) {
  const bounds = boundsForElements(selected);
  if (!bounds) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = "#2454d6";
  ctx.lineWidth = Math.max(1, 2 / scale);
  ctx.setLineDash([6 / scale, 4 / scale]);
  ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.setLineDash([]);

  const handleSize = 8 / scale;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#2454d6";
  for (const handle of getHandles(bounds)) {
    ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
    ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
  }

  for (const element of selected) {
    if (element.locked) {
      ctx.fillStyle = "#ba7315";
      ctx.font = `${Math.max(10, 12 / scale)}px Arial, sans-serif`;
      ctx.fillText("Locked", element.x, element.y - 8 / scale);
    }
  }
  ctx.restore();
}

function drawGuides(ctx, guides) {
  ctx.save();
  ctx.strokeStyle = "#d94b3d";
  ctx.lineWidth = 1;
  for (const guide of guides) {
    ctx.beginPath();
    if (guide.axis === "x") {
      ctx.moveTo(guide.value, 0);
      ctx.lineTo(guide.value, SLIDE_SIZE.height);
    } else {
      ctx.moveTo(0, guide.value);
      ctx.lineTo(SLIDE_SIZE.width, guide.value);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function layoutTextLines(ctx, element) {
  const width = Math.max(8, element.w - 8);
  if (!element.bulletList) {
    return wrapText(ctx, element.text || "", width).map((text) => ({
      text,
      x: getAlignedX(element),
      maxWidth: width,
      bullet: false,
      bulletX: 0,
    }));
  }

  const fontSize = element.fontSize || 28;
  const bulletIndent = Math.max(18, fontSize * 0.85);
  const bulletX = 4 + Math.max(4, fontSize * 0.16);
  const textX = 4 + bulletIndent;
  const textWidth = Math.max(8, element.w - textX - 4);
  const paragraphs = String(element.text || "").split(/\n/);
  return paragraphs.flatMap((paragraph) =>
    wrapParagraph(ctx, paragraph, textWidth).map((text, index) => ({
      text,
      x: textX,
      maxWidth: textWidth,
      bullet: index === 0 && Boolean(text.trim()),
      bulletX,
    }))
  );
}

function drawBulletMarker(ctx, x, y, fontSize) {
  const radius = Math.max(2.5, fontSize * 0.11);
  ctx.beginPath();
  ctx.arc(x, y + fontSize * 0.52, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawUnderline(ctx, text, x, y, fontSize, maxWidth, align) {
  const width = Math.min(ctx.measureText(text).width, maxWidth);
  let start = x;
  if (align === "center") {
    start = x - width / 2;
  } else if (align === "right") {
    start = x - width;
  }
  const underlineY = y + fontSize * 1.06;
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = Math.max(1, fontSize * 0.06);
  ctx.beginPath();
  ctx.moveTo(start, underlineY);
  ctx.lineTo(start + width, underlineY);
  ctx.stroke();
  ctx.restore();
}

function wrapText(ctx, text, width) {
  const paragraphs = String(text).split(/\n/);
  const lines = [];
  for (const paragraph of paragraphs) {
    lines.push(...wrapParagraph(ctx, paragraph, width));
  }
  return lines;
}

function wrapParagraph(ctx, paragraph, width) {
  const words = String(paragraph).split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [""];
  }
  const lines = [];
  let line = "";
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  lines.push(line);
  return lines;
}

function getAlignedX(element) {
  if (element.align === "center") {
    return element.w / 2;
  }
  if (element.align === "right") {
    return element.w - 4;
  }
  return 4;
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function loadImage(src) {
  if (imageCache.has(src)) {
    const cached = imageCache.get(src);
    if (cached.image) {
      return Promise.resolve(cached.image);
    }
    return cached.promise;
  }

  const image = new Image();
  image.crossOrigin = "anonymous";
  const promise = new Promise((resolve, reject) => {
    image.onload = () => {
      imageCache.set(src, { image, promise: Promise.resolve(image) });
      resolve(image);
    };
    image.onerror = reject;
  });
  imageCache.set(src, { image: null, promise });
  image.src = src;
  return promise;
}

function shorten(value, length) {
  const text = String(value);
  return text.length > length ? `${text.slice(0, length - 1)}.` : text;
}
