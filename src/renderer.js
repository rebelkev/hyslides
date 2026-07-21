import { MAX_ENGAGEMENT_OPTIONS, SLIDE_SIZE } from "./schema.js";
import { youtubeVideoId } from "./embed.js";
import { createWordCloudLayout } from "./word-cloud.js";
import { renderShaderOverlay } from "./backgrounds.js";

const imageCache = new Map();

export async function preloadSlideImages(slide) {
  const images = slide.elements
    .filter((element) => element.type === "image" && element.src)
    .map((element) => loadImage(element.src).catch(() => null));
  if (slide.backgroundImage) images.push(loadImage(slide.backgroundImage).catch(() => null));
  await Promise.all(images);
}

export function measureTextElementHeight(ctx, element, deck) {
  if (!ctx || element?.type !== "text") return Number(element?.h || 0);
  ctx.save();
  const fontFamily = element.fontFamily ||
    (element.fontWeight >= 700 ? deck.theme.fonts.heading : deck.theme.fonts.body);
  const fontSize = element.fontSize || 28;
  const fontWeight = element.fontWeight || 500;
  const fontStyle = element.italic ? "italic " : "";
  ctx.font = `${fontStyle}${fontWeight} ${fontSize}px ${fontFamily}, Arial, sans-serif`;
  const lineCount = Math.max(1, layoutTextLines(ctx, element).length);
  const height = Math.ceil(lineCount * fontSize * (element.lineHeight || 1.18) + 4);
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
  } = options;

  ctx.save();
  ctx.clearRect(0, 0, SLIDE_SIZE.width, SLIDE_SIZE.height);
  drawSlideBackground(ctx, slide, deck);

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

  if (footer && deck.theme.master.footer.showSlideNumber) {
    drawFooter(ctx, slide, deck);
  }

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
  const type = slide.backgroundType || (slide.backgroundImage ? "image" : "color");
  ctx.fillStyle = slide.background || deck.theme.colors.background;
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
    gradient.addColorStop(0, slide.backgroundGradientStart || deck.theme.colors.primary);
    gradient.addColorStop(1, slide.backgroundGradientEnd || deck.theme.colors.accent);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, SLIDE_SIZE.width, SLIDE_SIZE.height);
  } else if (type === "image" && slide.backgroundImage) {
    const image = imageCache.get(slide.backgroundImage)?.image;
    if (image) drawFittedBackgroundImage(ctx, image, slide.backgroundImageFit || "cover");
    else loadImage(slide.backgroundImage).catch(() => {});
  }

  const overlayOpacity = Math.max(0, Math.min(1, Number(slide.backgroundOverlayOpacity) || 0));
  if (overlayOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = overlayOpacity;
    ctx.fillStyle = slide.backgroundOverlayColor || "#000000";
    ctx.fillRect(0, 0, SLIDE_SIZE.width, SLIDE_SIZE.height);
    ctx.restore();
  }

  if (slide.backgroundShader && slide.backgroundShader !== "none") {
    const shader = renderShaderOverlay(slide.backgroundShader, SLIDE_SIZE.width, SLIDE_SIZE.height, {
      time: typeof performance !== "undefined" ? performance.now() / 1000 : 0,
      speed: slide.backgroundShaderSpeed,
      intensity: slide.backgroundShaderIntensity,
      colorA: slide.backgroundGradientStart || deck.theme.colors.primary,
      colorB: slide.backgroundGradientEnd || deck.theme.colors.accent,
    });
    if (shader) ctx.drawImage(shader, 0, 0, SLIDE_SIZE.width, SLIDE_SIZE.height);
    else drawShaderFallback(ctx, slide, deck);
  }
}

function drawFittedBackgroundImage(ctx, image, fit) {
  const rect = backgroundImageRect(image.width, image.height, fit);
  ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
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
  gradient.addColorStop(0, slide.backgroundGradientStart || deck.theme.colors.primary);
  gradient.addColorStop(1, slide.backgroundGradientEnd || deck.theme.colors.accent);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(0.7, Number(slide.backgroundShaderIntensity) || 0.5));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SLIDE_SIZE.width, SLIDE_SIZE.height);
  ctx.restore();
}

export async function drawSlideAsync(ctx, slide, deck, options = {}) {
  await preloadSlideImages(slide);
  drawSlide(ctx, slide, deck, options);
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
  const showMessage = completed && element.completionBehavior === "message" && element.completionMessage;
  const text = showMessage
    ? element.completionMessage
    : `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  if (element.fill && element.fill !== "transparent") {
    ctx.fillStyle = element.fill;
    roundedRect(ctx, 0, 0, element.w, element.h, 12);
    ctx.fill();
  }
  ctx.fillStyle = element.color || deck.theme.colors.ink;
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
  const fontFamily =
    element.fontFamily ||
    (element.fontWeight >= 700 ? deck.theme.fonts.heading : deck.theme.fonts.body);
  const fontSize = element.fontSize || 28;
  const fontWeight = element.fontWeight || 500;
  const fontStyle = element.italic ? "italic " : "";
  ctx.font = `${fontStyle}${fontWeight} ${fontSize}px ${fontFamily}, Arial, sans-serif`;
  ctx.fillStyle = element.color || deck.theme.colors.ink;
  ctx.textAlign = element.bulletList ? "left" : element.align || "left";
  ctx.textBaseline = "top";

  if (element.fill && element.fill !== "transparent") {
    ctx.fillStyle = element.fill;
    roundedRect(ctx, 0, 0, element.w, element.h, element.radius || 0);
    ctx.fill();
    ctx.fillStyle = element.color || deck.theme.colors.ink;
  }

  const lines = layoutTextLines(ctx, element);
  const lineHeight = fontSize * (element.lineHeight || 1.18);
  const totalHeight = lines.length * lineHeight;
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
    y += lineHeight;
  }
}

function drawShape(ctx, element) {
  ctx.fillStyle = element.fill || "#e8efff";
  ctx.strokeStyle = element.stroke || "transparent";
  ctx.lineWidth = element.strokeWidth || 0;

  if (element.shape === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(element.w / 2, element.h / 2, element.w / 2, element.h / 2, 0, 0, Math.PI * 2);
  } else if (element.shape === "triangle") {
    ctx.beginPath();
    ctx.moveTo(element.w / 2, 0);
    ctx.lineTo(element.w, element.h);
    ctx.lineTo(0, element.h);
    ctx.closePath();
  } else {
    roundedRect(ctx, 0, 0, element.w, element.h, element.radius || 8);
  }

  ctx.fill();
  if ((element.strokeWidth || 0) > 0) {
    ctx.stroke();
  }
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
  const size = Math.min(element.w, element.h);
  const cx = element.w / 2;
  const cy = element.h / 2;
  ctx.strokeStyle = element.stroke || "#1d232a";
  ctx.fillStyle = element.fill || "#2454d6";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = element.strokeWidth || 2;

  if (element.icon === "check") {
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.28, cy);
    ctx.lineTo(cx - size * 0.06, cy + size * 0.22);
    ctx.lineTo(cx + size * 0.32, cy - size * 0.24);
    ctx.stroke();
    return;
  }

  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const angle = (Math.PI * 2 * i) / 8;
    const r = i % 2 === 0 ? size * 0.42 : size * 0.16;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawChart(ctx, element, deck) {
  const values = Array.isArray(element.values)
    ? element.values.map((value) => Math.max(0, Number(value) || 0))
    : [];
  const labels = Array.isArray(element.labels) ? element.labels : [];
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

  ctx.fillStyle = element.fill || deck.theme.colors.accent;
  values.forEach((value, index) => {
    const height = (value / max) * chartHeight;
    const x = padding + index * (barWidth + barGap);
    const y = padding + chartHeight - height;
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
  roundedRect(ctx, 0, 0, element.w, element.h, element.h / 2);
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
    ctx.fillStyle = correct.has(option) ? "#0c6f66" : deck.theme.colors.ink;
    const count = Math.max(0, Number(element.results?.[option]) || 0);
    const total = Math.max(1, Object.values(element.results || {}).reduce((sum, value) => sum + (Number(value) || 0), 0));
    const progress = count / total;
    if (progress > 0) {
      ctx.save();
      ctx.globalAlpha *= 0.16;
      ctx.fillStyle = correct.has(option) ? "#0c8b7f" : element.accent || deck.theme.colors.primary;
      roundedRect(ctx, padding, rowY, (element.w - padding * 2) * progress, rowHeight, 8);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = correct.has(option) ? "#0c6f66" : deck.theme.colors.ink;
    ctx.fillText(`${String.fromCharCode(65 + index)}. ${option} · ${count}`, padding + 16, rowY + rowHeight / 2, element.w - padding * 2 - 32);
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
  ctx.fillStyle = deck.theme.colors.muted;
  ctx.font = `700 19px ${deck.theme.fonts.body}, Arial, sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText("Audience questions appear here", padding + 18, y + 18, element.w - padding * 2 - 36);
}

function drawReactionPreview(ctx, element, deck, padding, y) {
  const labels = [
    ["Like", "thumbsUp"],
    ["Love", "heart"],
    ["Clap", "clap"],
    ["Wow", "wow"],
    ["Fire", "fire"],
  ];
  const itemGap = 10;
  const itemWidth = Math.max(70, (element.w - padding * 2 - itemGap * 4) / 5);
  const itemHeight = Math.max(46, Math.min(74, element.h - y - padding));
  ctx.font = `800 16px ${deck.theme.fonts.body}, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  labels.forEach(([label, key], index) => {
    const x = padding + index * (itemWidth + itemGap);
    ctx.fillStyle = "#f8fafc";
    ctx.strokeStyle = "#d7dde6";
    roundedRect(ctx, x, y, itemWidth, itemHeight, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = deck.theme.colors.ink;
    ctx.fillText(`${label} · ${Math.max(0, Number(element.reactions?.[key]) || 0)}`, x + itemWidth / 2, y + itemHeight / 2, itemWidth - 10);
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

function drawFooter(ctx, slide, deck) {
  const slideIndex = Array.isArray(deck.slides)
    ? deck.slides.findIndex((item) => item.id === slide.id)
    : -1;
  if (slideIndex < 0) return;
  ctx.fillStyle = deck.theme.master.footer.color || deck.theme.colors.muted;
  ctx.font = `600 14px ${deck.theme.fonts.body}, Arial, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(String(slideIndex + 1), SLIDE_SIZE.width - 54, SLIDE_SIZE.height - 30);
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
