const DEFAULT_LIMIT = 32;

export function createWordCloudLayout(entries, bounds, measure, options = {}) {
  const words = normalizeEntries(entries).slice(0, options.limit || DEFAULT_LIMIT);
  if (!words.length || bounds.width <= 0 || bounds.height <= 0) return [];

  const counts = words.map(([, count]) => count);
  const minCount = Math.min(...counts);
  const maxCount = Math.max(...counts);
  const minFont = Math.max(12, options.minFont || Math.min(22, bounds.height * 0.09));
  const maxFont = Math.max(minFont, options.maxFont || Math.min(72, bounds.height * 0.28));
  const placed = [];

  for (const [text, count] of words) {
    let fontSize = weightedFontSize(count, minCount, maxCount, minFont, maxFont);
    let item = null;
    for (let shrink = 0; shrink < 5 && !item; shrink += 1) {
      const width = Math.min(bounds.width, measure(text, fontSize));
      const height = fontSize * 1.12;
      item = findPosition(text, width, height, bounds, placed);
      if (!item) fontSize *= 0.86;
    }
    if (!item) continue;
    placed.push({ ...item, text, count, fontSize });
  }

  return placed;
}

function normalizeEntries(entries) {
  const merged = new Map();
  for (const [rawText, rawCount] of entries || []) {
    const text = String(rawText || "").trim().replace(/\s+/g, " ");
    const count = Math.max(0, Number(rawCount) || 0);
    if (!text || count <= 0) continue;
    const key = text.toLocaleLowerCase();
    const current = merged.get(key);
    merged.set(key, {
      text: current?.text || text,
      count: (current?.count || 0) + count,
    });
  }
  return [...merged.values()]
    .map(({ text, count }) => [text, count])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function weightedFontSize(count, minCount, maxCount, minFont, maxFont) {
  if (maxCount === minCount) return minFont + (maxFont - minFont) * 0.45;
  const ratio = (Math.sqrt(count) - Math.sqrt(minCount)) /
    (Math.sqrt(maxCount) - Math.sqrt(minCount));
  return minFont + ratio * (maxFont - minFont);
}

function findPosition(text, width, height, bounds, placed) {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const phase = (hashText(text) % 360) * Math.PI / 180;
  const gap = 6;

  for (let step = 0; step < 900; step += 1) {
    const angle = phase + step * 0.31;
    const radius = 1.9 * Math.sqrt(step) * Math.min(width, height) * 0.18;
    const x = centerX + Math.cos(angle) * radius - width / 2;
    const y = centerY + Math.sin(angle) * radius * 0.68 - height / 2;
    const candidate = { x, y, width, height };
    if (!inside(candidate, bounds) || placed.some((item) => overlaps(candidate, item, gap))) continue;
    return candidate;
  }
  return null;
}

function inside(item, bounds) {
  return item.x >= bounds.x && item.y >= bounds.y &&
    item.x + item.width <= bounds.x + bounds.width &&
    item.y + item.height <= bounds.y + bounds.height;
}

function overlaps(a, b, gap) {
  return !(a.x + a.width + gap <= b.x || b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y || b.y + b.height + gap <= a.y);
}

function hashText(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
