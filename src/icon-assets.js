function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function svgNodeMarkup(node) {
  if (!Array.isArray(node) || typeof node[0] !== "string") return "";
  const [tagName, attributes = {}, children = []] = node;
  const safeTag = /^[a-z][a-z0-9-]*$/i.test(tagName) ? tagName : "path";
  const attributeMarkup = Object.entries(attributes)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([name, value]) => `${name}="${escapeXml(value)}"`)
    .join(" ");
  const childMarkup = Array.isArray(children) ? children.map(svgNodeMarkup).join("") : "";
  return `<${safeTag}${attributeMarkup ? ` ${attributeMarkup}` : ""}>${childMarkup}</${safeTag}>`;
}

export function normalizeLucideIconName(name) {
  return String(name || "")
    .replace(/Icon$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

export function resolveLucideIconNode(icons, requestedName, fallbackName = "sparkles") {
  const catalog = icons && typeof icons === "object" ? icons : {};
  const requested = normalizeLucideIconName(requestedName);
  const fallback = normalizeLucideIconName(fallbackName);
  let fallbackNode = null;

  for (const [exportName, iconNode] of Object.entries(catalog)) {
    const normalized = normalizeLucideIconName(exportName);
    if (normalized === requested) return iconNode;
    if (normalized === fallback && fallbackNode == null) fallbackNode = iconNode;
  }

  return fallbackNode;
}

export function lucideIconSvg(iconNode, color = "#2454d6", strokeWidth = 2) {
  const normalizedColor = /^#[0-9a-f]{6}$/i.test(String(color)) ? String(color) : "#2454d6";
  const normalizedWidth = Math.max(0.75, Math.min(4, Number(strokeWidth) || 2));
  const nodes = Array.isArray(iconNode) ? iconNode.map(svgNodeMarkup).join("") : "";
  if (!nodes) return "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${normalizedColor}" stroke-width="${normalizedWidth}" stroke-linecap="round" stroke-linejoin="round">${nodes}</svg>`;
}

export function lucideIconSvgDataUri(iconNode, color = "#2454d6", strokeWidth = 2) {
  const svg = lucideIconSvg(iconNode, color, strokeWidth);
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : "";
}

export function lucideIconMarkupSvgDataUri(iconMarkup, color = "#2454d6", strokeWidth = 2) {
  const markup = String(iconMarkup || "").trim();
  if (!markup || /<(?:script|style|foreignObject)\b/i.test(markup)) return "";
  const normalizedColor = /^#[0-9a-f]{6}$/i.test(String(color)) ? String(color) : "#2454d6";
  const normalizedWidth = Math.max(0.75, Math.min(4, Number(strokeWidth) || 2));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${normalizedColor}" stroke-width="${normalizedWidth}" stroke-linecap="round" stroke-linejoin="round">${markup}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
