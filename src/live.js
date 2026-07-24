import { mergeWordCloudEntries } from "./word-cloud.js";

const LIVE_API_BASE = "/api/live";
const PUBLIC_APP_BASE_URL = "";
const SUPABASE_URL = "https://cgdlbwodcacxdkmznvtw.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_oPaIppVoeV_MFsPq4fuzxA_0Y2285U-";
const SUPABASE_REST_URL = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1`;

const QR_DATA_CODEWORDS = {
  1: 19,
  2: 34,
  3: 55,
  4: 80,
  5: 108,
};

const QR_EC_CODEWORDS = {
  1: 7,
  2: 10,
  3: 15,
  4: 20,
  5: 26,
};

const QR_ALIGNMENT = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
};

export function normalizeLiveCode(value) {
  const code = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 18);
  return code || "HY-2471";
}

export function liveSessionIndicator(status, backendAvailable, publishing = false) {
  if (publishing) return { label: "CONNECTING", tone: "connecting" };
  if (!backendAvailable) return { label: "NOT LIVE", tone: "offline" };
  if (status === "paused") return { label: "PAUSED", tone: "paused" };
  if (status === "ended") return { label: "ENDED", tone: "ended" };
  return { label: "LIVE", tone: "live" };
}

export function audienceCodeFromHash(hash = location.hash) {
  const match = String(hash || "").match(/^#audience-?(.+)$/i);
  return match ? normalizeLiveCode(decodeURIComponent(match[1])) : null;
}

export function audienceJoinUrl(code) {
  return `${appBaseUrl()}#audience-${encodeURIComponent(normalizeLiveCode(code))}`;
}

export function isLocalJoinUrl(value) {
  try {
    const { hostname } = new URL(value);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

const MAX_LIVE_SLIDE_JSON_LENGTH = 700000;

export async function liveSnapshotForDeck(deck, slide, activeSlideIndex, instanceId = "", sessionName = "", runtime = {}) {
  const liveSlide = JSON.parse(JSON.stringify(slide));
  const liveTheme = {
    fonts: cloneJson(deck.theme?.fonts || {}),
    colors: cloneJson(deck.theme?.colors || {}),
    typographyStyles: cloneJson(deck.theme?.typographyStyles || {}),
    brandPalette: cloneJson(deck.theme?.brandPalette || []),
    brandColorStyles: cloneJson(deck.theme?.brandColorStyles || []),
    defaultBackground: cloneJson(deck.theme?.defaultBackground || {}),
    master: cloneJson(deck.theme?.master || {}),
    logo: cloneJson(deck.theme?.logo || {}),
  };
  liveSlide.liveTheme = liveTheme;
  liveSlide.runtimePresentation = {
    blackout: Boolean(runtime.blackout),
  };
  await compactLiveSlideImages(liveSlide);
  return {
    instanceId,
    sessionName,
    deckId: deck.id,
    deckTitle: deck.title,
    theme: liveTheme,
    audienceCode: normalizeLiveCode(deck.settings?.audienceCode),
    activeSlideIndex,
    activeSlideId: slide.id,
    slide: liveSlide,
  };
}

async function compactLiveSlideImages(slide) {
  const references = liveImageReferences(slide);
  if (!references.length || JSON.stringify(slide).length <= MAX_LIVE_SLIDE_JSON_LENGTH) return slide;
  const targetPerImage = Math.max(45000, Math.floor(500000 / references.length));
  for (const reference of references) {
    if (reference.value().length < targetPerImage) continue;
    const compacted = await compactDataImage(reference.value(), targetPerImage).catch(() => reference.value());
    reference.update(compacted);
  }
  if (JSON.stringify(slide).length <= MAX_LIVE_SLIDE_JSON_LENGTH) return slide;
  const largestFirst = references.sort((a, b) => b.value().length - a.value().length);
  for (const reference of largestFirst) {
    const compacted = await compactDataImage(reference.value(), 40000, 720).catch(() => "");
    reference.update(compacted || liveImagePlaceholder());
    if (JSON.stringify(slide).length <= MAX_LIVE_SLIDE_JSON_LENGTH) break;
  }
  if (JSON.stringify(slide).length > MAX_LIVE_SLIDE_JSON_LENGTH) {
    throw new Error("This slide still contains too much embedded data for live delivery. Remove or replace its largest embedded asset.");
  }
  return slide;
}

function liveImageReferences(slide) {
  const references = [];
  if (String(slide.liveTheme?.logo?.src || "").startsWith("data:image/")) {
    references.push({
      value: () => slide.liveTheme.logo.src,
      update: (value) => { slide.liveTheme.logo.src = value; },
    });
  }
  if (String(slide.backgroundImage || "").startsWith("data:image/")) {
    references.push({ value: () => slide.backgroundImage, update: (value) => { slide.backgroundImage = value; } });
  }
  for (const element of slide.elements || []) {
    if (element.type === "image" && String(element.src || "").startsWith("data:image/")) {
      references.push({ value: () => element.src, update: (value) => { element.src = value; } });
    }
  }
  return references;
}

async function compactDataImage(source, targetLength, maxDimension = 1280) {
  if (typeof Image === "undefined" || typeof document === "undefined") return source;
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = source;
  });
  let scale = Math.min(1, maxDimension / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
  let best = source;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const quality = Math.max(0.42, 0.82 - attempt * 0.08);
    const candidate = canvas.toDataURL("image/webp", quality);
    if (candidate.length < best.length) best = candidate;
    if (best.length <= targetLength) break;
    scale *= 0.72;
  }
  return best;
}

function liveImagePlaceholder() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#eef2f7"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#637083" font-family="Arial" font-size="24">Image optimized for live view</text></svg>';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function liveStateDeck(state) {
  return {
    id: state.deckId || "live-deck",
    title: state.deckTitle || "HySlides Live",
    theme: cloneJson(state.theme || state.slide?.liveTheme || {}),
    settings: {
      audienceCode: state.audienceCode || state.code,
    },
  };
}

export async function publishLiveSession(code, snapshot, presenterToken) {
  return requestJson(`${LIVE_API_BASE}/${encodeURIComponent(normalizeLiveCode(code))}`, {
    method: "PUT",
    headers: presenterHeaders(presenterToken),
    body: JSON.stringify(snapshot),
  });
}

export async function getLiveSession(code, presenterToken = "") {
  return requestJson(`${LIVE_API_BASE}/${encodeURIComponent(normalizeLiveCode(code))}`, { headers: presenterHeaders(presenterToken) });
}

export function connectLiveEvents(code, {
  onEvent,
  onStatus,
  WebSocketImpl = globalThis.WebSocket,
  baseUrl = globalThis.location?.href || "http://localhost/",
} = {}) {
  let socket = null;
  let reconnectTimer = 0;
  let stopped = false;
  let attempts = 0;
  const connect = () => {
    if (stopped || !WebSocketImpl) return;
    const url = new URL(`${LIVE_API_BASE}/${encodeURIComponent(normalizeLiveCode(code))}/events`, baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    onStatus?.("connecting");
    socket = new WebSocketImpl(url.toString());
    socket.addEventListener("open", () => {
      attempts = 0;
      onStatus?.("connected");
    });
    socket.addEventListener("message", (event) => {
      if (event.data === "pong") return;
      try {
        const payload = JSON.parse(event.data);
        if (payload.type !== "ready") onEvent?.(payload);
      } catch {
        onEvent?.({ type: "state" });
      }
    });
    socket.addEventListener("close", () => {
      if (stopped) return;
      onStatus?.("disconnected");
      attempts += 1;
      reconnectTimer = globalThis.setTimeout(connect, Math.min(15000, 500 * (2 ** Math.min(5, attempts))));
    });
    socket.addEventListener("error", () => socket?.close());
  };
  connect();
  return {
    close() {
      stopped = true;
      globalThis.clearTimeout(reconnectTimer);
      socket?.close(1000, "Client closed");
    },
    get status() {
      return socket?.readyState;
    },
  };
}

export async function submitLiveResponse(code, payload) {
  return requestJson(`${LIVE_API_BASE}/${encodeURIComponent(normalizeLiveCode(code))}/responses`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function submitLiveQuestion(code, text, participantId) {
  return requestJson(`${LIVE_API_BASE}/${encodeURIComponent(normalizeLiveCode(code))}/questions`, {
    method: "POST",
    body: JSON.stringify({ text, participantId }),
  });
}

export async function moderateLiveQuestion(code, questionId, action, presenterToken) {
  return requestJson(`${LIVE_API_BASE}/${encodeURIComponent(normalizeLiveCode(code))}/questions/${encodeURIComponent(questionId)}/moderate`, {
    method: "POST",
    headers: presenterHeaders(presenterToken),
    body: JSON.stringify({ action }),
  });
}

export async function voteLiveQuestion(code, questionId, participantId) {
  return requestJson(`${LIVE_API_BASE}/${encodeURIComponent(normalizeLiveCode(code))}/questions/${encodeURIComponent(questionId)}/vote`, {
    method: "POST",
    body: JSON.stringify({ participantId }),
  });
}

export function listLiveSessions(deckId = "", presenterToken = "") {
  const query = deckId ? `?deckId=${encodeURIComponent(deckId)}` : "";
  return requestJson(`/api/sessions${query}`, { headers: presenterHeaders(presenterToken) });
}

export function getLiveSessionHistory(instanceId, presenterToken = "") {
  return requestJson(`/api/sessions/${encodeURIComponent(instanceId)}`, { headers: presenterHeaders(presenterToken) });
}

export function renameLiveSession(instanceId, sessionName, presenterToken = "") {
  return requestJson(`/api/sessions/${encodeURIComponent(instanceId)}`, {
    method: "PATCH",
    headers: presenterHeaders(presenterToken),
    body: JSON.stringify({ sessionName }),
  });
}

export function deleteLiveSession(instanceId, presenterToken = "") {
  return requestJson(`/api/sessions/${encodeURIComponent(instanceId)}`, {
    method: "DELETE",
    headers: presenterHeaders(presenterToken),
  });
}

export function registerLiveParticipant(code, participantId) {
  return requestJson(`${LIVE_API_BASE}/${encodeURIComponent(normalizeLiveCode(code))}/presence`, {
    method: "POST",
    body: JSON.stringify({ participantId }),
  });
}

export function controlLiveSession(code, action, presenterToken) {
  return requestJson(`${LIVE_API_BASE}/${encodeURIComponent(normalizeLiveCode(code))}/control`, {
    method: "POST",
    headers: presenterHeaders(presenterToken),
    body: JSON.stringify({ action }),
  });
}

export function createRemoteControllerPairing(code, presenterToken) {
  return requestJson(`${LIVE_API_BASE}/${encodeURIComponent(normalizeLiveCode(code))}/remote/pair`, {
    method: "POST",
    headers: presenterHeaders(presenterToken),
    body: "{}",
  });
}

export function publishRemoteControllerState(code, state, presenterToken) {
  return requestJson(`${LIVE_API_BASE}/${encodeURIComponent(normalizeLiveCode(code))}/remote/state`, {
    method: "PUT",
    headers: presenterHeaders(presenterToken),
    body: JSON.stringify(state),
  });
}

export function getRemoteControllerState(code, controllerToken) {
  return requestJson(`${LIVE_API_BASE}/${encodeURIComponent(normalizeLiveCode(code))}/remote/state`, {
    headers: controllerHeaders(controllerToken),
  });
}

export function getRemoteControllerCommands(code, presenterToken) {
  return requestJson(`${LIVE_API_BASE}/${encodeURIComponent(normalizeLiveCode(code))}/remote/commands`, {
    headers: presenterHeaders(presenterToken),
  });
}

export function sendRemoteControllerCommand(code, controllerToken, command) {
  return requestJson(`${LIVE_API_BASE}/${encodeURIComponent(normalizeLiveCode(code))}/remote/command`, {
    method: "POST",
    headers: controllerHeaders(controllerToken),
    body: JSON.stringify(command),
  });
}

export function liveQrImageSrc(text) {
  try {
    return qrSvgDataUrl(text);
  } catch {
    return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(text)}`;
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Live session is unavailable.");
  }
  return payload;
}

function presenterHeaders(token) {
  return token ? { "x-hyslides-presenter-token": token } : {};
}

function controllerHeaders(token) {
  return token ? { "x-hyslides-controller-token": token } : {};
}

function hasSupabaseLive() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

function appBaseUrl() {
  const configuredUrl = PUBLIC_APP_BASE_URL.trim();
  if (configuredUrl) {
    const url = new URL(configuredUrl);
    url.hash = "";
    return url.href;
  }
  return location.href.split("#")[0];
}

async function publishSupabaseLiveSession(code, snapshot) {
  const slide = cloneJson(snapshot?.slide || {});
  const activeSlideId = snapshot?.activeSlideId || slide.id || "";
  const record = {
    code,
    deck_id: snapshot?.deckId || "deck",
    deck_title: snapshot?.deckTitle || "HySlides deck",
    audience_code: normalizeLiveCode(snapshot?.audienceCode || code),
    active_slide_id: activeSlideId,
    active_slide_index: Number(snapshot?.activeSlideIndex || 0),
    slide_json: slide,
    updated_at: new Date().toISOString(),
  };

  await supabaseRequest("/hyslides_live_sessions?on_conflict=code", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(record),
  });

  return getSupabaseLiveSession(code);
}

async function getSupabaseLiveSession(code) {
  const session = await getSupabaseSessionRecord(code);
  return hydrateSupabaseLiveState(session);
}

async function submitSupabaseLiveResponse(code, payload) {
  const session = await getSupabaseSessionRecord(code);
  const slide = cloneJson(session.slide_json || {});
  const activeSlideId = session.active_slide_id || slide.id;

  if (payload?.slideId && payload.slideId !== activeSlideId) {
    return {
      accepted: false,
      ...(await hydrateSupabaseLiveState(session)),
    };
  }

  const rows = supabaseResponseRows(code, activeSlideId, slide.engagement, payload?.value);
  if (!rows.length) {
    return {
      accepted: false,
      ...(await hydrateSupabaseLiveState(session)),
    };
  }

  await supabaseRequest("/hyslides_live_responses", {
    method: "POST",
    headers: {
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });

  return {
    accepted: true,
    ...(await getSupabaseLiveSession(code)),
  };
}

async function getSupabaseSessionRecord(code) {
  const rows = await supabaseRequest(`/hyslides_live_sessions?code=eq.${encodeURIComponent(code)}&select=*`);
  const session = Array.isArray(rows) ? rows[0] : null;
  if (!session) {
    throw new Error("Live session not found.");
  }
  return session;
}

async function hydrateSupabaseLiveState(session) {
  const slide = cloneJson(session.slide_json || {});
  const slideId = session.active_slide_id || slide.id;
  const rows = await supabaseRequest(
    `/hyslides_live_responses?session_code=eq.${encodeURIComponent(session.code)}&slide_id=eq.${encodeURIComponent(slideId)}&select=id,kind,value,created_at&order=created_at.asc`
  );

  applySupabaseResponsesToSlide(slide, Array.isArray(rows) ? rows : []);

  return {
    code: session.code,
    deckId: session.deck_id,
    deckTitle: session.deck_title,
    audienceCode: session.audience_code,
    activeSlideId: slideId,
    activeSlideIndex: session.active_slide_index || 0,
    slide,
    updatedAt: session.updated_at,
  };
}

function applySupabaseResponsesToSlide(slide, rows) {
  slide.engagement ||= {};
  const engagement = slide.engagement;
  engagement.results = {};
  engagement.qna = [];
  engagement.reactions = Object.fromEntries((engagement.reactionOptions || ["thumbsUp", "heart", "clap", "wow", "fire"]).map((key) => [key, 0]));

  const wordCloudEntries = [];
  for (const row of rows) {
    const value = String(row.value || "");
    if (!value) {
      continue;
    }
    if (row.kind === "response") {
      if (engagement.type === "wordCloud") wordCloudEntries.push([value, 1]);
      else engagement.results[value] = (engagement.results[value] || 0) + 1;
    }
    if (row.kind === "qna") {
      engagement.qna.push({
        id: row.id,
        text: value,
        upvotes: 0,
        answered: false,
      });
    }
    if (row.kind === "reaction") {
      engagement.reactions[value] = (engagement.reactions[value] || 0) + 1;
    }
  }
  if (engagement.type === "wordCloud") {
    engagement.results = Object.fromEntries(mergeWordCloudEntries(wordCloudEntries));
  }
  syncLiveEngagementElements(slide);
}

function syncLiveEngagementElements(slide) {
  for (const element of slide.elements || []) {
    if (element.type !== "engagement") continue;
    element.results = { ...(slide.engagement?.results || {}) };
    element.reactions = { ...(slide.engagement?.reactions || {}) };
    element.qna = [...(slide.engagement?.qna || [])];
  }
}

function supabaseResponseRows(code, slideId, engagement, value) {
  if (!engagement?.enabled) {
    return [];
  }

  const text = String(value || "").trim();
  if (!text) {
    return [];
  }

  const base = {
    session_code: code,
    slide_id: slideId,
  };

  if (["poll", "multipleChoice"].includes(engagement.type)) {
    return [
      {
        ...base,
        kind: "response",
        value: text.slice(0, 250),
      },
    ];
  }

  if (engagement.type === "wordCloud") {
    return [{
      ...base,
      kind: "response",
      value: text.replace(/\s+/g, " ").slice(0, 200),
    }];
  }

  if (engagement.type === "qna") {
    return [
      {
        ...base,
        kind: "qna",
        value: text.slice(0, 500),
      },
    ];
  }

  if (engagement.type === "reactions") {
    return [
      {
        ...base,
        kind: "reaction",
        value: text.slice(0, 64),
      },
    ];
  }

  return [];
}

async function supabaseRequest(path, options = {}) {
  const { headers, ...rest } = options;
  const response = await fetch(`${SUPABASE_REST_URL}${path}`, {
    ...rest,
    headers: supabaseHeaders(headers),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const message = payload?.message || payload?.error || payload?.hint || "Supabase live sync is unavailable.";
    throw new Error(message);
  }

  return payload;
}

function supabaseHeaders(extra = {}) {
  const headers = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json",
    ...extra,
  };
  if (SUPABASE_PUBLISHABLE_KEY.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${SUPABASE_PUBLISHABLE_KEY}`;
  }
  return headers;
}

function cloneJson(value) {
  if (typeof value === "string") {
    return JSON.parse(value);
  }
  return JSON.parse(JSON.stringify(value || {}));
}

function qrSvgDataUrl(text) {
  const matrix = createQrMatrix(text);
  const quiet = 4;
  const cell = 6;
  const size = (matrix.length + quiet * 2) * cell;
  const rects = [];
  matrix.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) {
        rects.push(`<rect x="${(x + quiet) * cell}" y="${(y + quiet) * cell}" width="${cell}" height="${cell}"/>`);
      }
    });
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#111827">${rects.join("")}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function createQrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  const version = pickQrVersion(bytes.length);
  const size = 17 + version * 4;
  const modules = Array.from({ length: size }, () => Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => Array(size).fill(false));

  drawFinder(modules, reserved, 0, 0);
  drawFinder(modules, reserved, size - 7, 0);
  drawFinder(modules, reserved, 0, size - 7);
  drawTiming(modules, reserved, size);
  drawAlignment(modules, reserved, version);
  reserveFormatAreas(modules, reserved, size);
  setReserved(modules, reserved, 8, size - 8, true);

  const dataCodewords = makeDataCodewords(bytes, version);
  const ecCodewords = reedSolomon(dataCodewords, QR_EC_CODEWORDS[version]);
  placeQrData(modules, reserved, [...dataCodewords, ...ecCodewords]);
  drawFormatBits(modules, reserved, size, formatBits(1, 0));

  return modules;
}

function pickQrVersion(byteLength) {
  for (const [version, capacity] of Object.entries(QR_DATA_CODEWORDS)) {
    const versionNumber = Number(version);
    const overheadBytes = versionNumber < 10 ? 2 : 3;
    if (byteLength + overheadBytes <= capacity) {
      return versionNumber;
    }
  }
  throw new Error("Join link is too long for the built-in QR generator.");
}

function makeDataCodewords(bytes, version) {
  const capacity = QR_DATA_CODEWORDS[version] * 8;
  const bits = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((byte) => appendBits(bits, byte, 8));
  appendBits(bits, 0, Math.min(4, capacity - bits.length));
  while (bits.length % 8) {
    bits.push(0);
  }

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce((value, bit) => (value << 1) | bit, 0));
  }
  for (let pad = 0; codewords.length < QR_DATA_CODEWORDS[version]; pad += 1) {
    codewords.push(pad % 2 === 0 ? 0xec : 0x11);
  }
  return codewords;
}

function appendBits(bits, value, length) {
  for (let i = length - 1; i >= 0; i -= 1) {
    bits.push((value >> i) & 1);
  }
}

function drawFinder(modules, reserved, x, y) {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const xx = x + dx;
      const yy = y + dy;
      if (!inMatrix(modules, xx, yy)) {
        continue;
      }
      const dark =
        dx >= 0 &&
        dx <= 6 &&
        dy >= 0 &&
        dy <= 6 &&
        (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      setReserved(modules, reserved, xx, yy, dark);
    }
  }
}

function drawTiming(modules, reserved, size) {
  for (let i = 8; i < size - 8; i += 1) {
    setReserved(modules, reserved, i, 6, i % 2 === 0);
    setReserved(modules, reserved, 6, i, i % 2 === 0);
  }
}

function drawAlignment(modules, reserved, version) {
  const positions = QR_ALIGNMENT[version];
  for (const x of positions) {
    for (const y of positions) {
      if (reserved[y]?.[x]) {
        continue;
      }
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          setReserved(modules, reserved, x + dx, y + dy, distance === 0 || distance === 2);
        }
      }
    }
  }
}

function reserveFormatAreas(modules, reserved, size) {
  for (let i = 0; i <= 8; i += 1) {
    if (i !== 6) {
      setReserved(modules, reserved, 8, i, false);
      setReserved(modules, reserved, i, 8, false);
    }
  }
  for (let i = 0; i < 8; i += 1) {
    setReserved(modules, reserved, size - 1 - i, 8, false);
  }
  for (let i = 0; i < 7; i += 1) {
    setReserved(modules, reserved, 8, size - 1 - i, false);
  }
}

function placeQrData(modules, reserved, codewords) {
  const bits = [];
  codewords.forEach((codeword) => appendBits(bits, codeword, 8));
  const size = modules.length;
  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) {
      right -= 1;
    }
    for (let i = 0; i < size; i += 1) {
      const y = upward ? size - 1 - i : i;
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        if (reserved[y][x]) {
          continue;
        }
        let bit = bits[bitIndex] || 0;
        if ((x + y) % 2 === 0) {
          bit ^= 1;
        }
        modules[y][x] = Boolean(bit);
        bitIndex += 1;
      }
    }
    upward = !upward;
  }
}

function drawFormatBits(modules, reserved, size, bits) {
  for (let i = 0; i <= 5; i += 1) {
    setReserved(modules, reserved, 8, i, bitAt(bits, i));
  }
  setReserved(modules, reserved, 8, 7, bitAt(bits, 6));
  setReserved(modules, reserved, 8, 8, bitAt(bits, 7));
  setReserved(modules, reserved, 7, 8, bitAt(bits, 8));
  for (let i = 9; i < 15; i += 1) {
    setReserved(modules, reserved, 14 - i, 8, bitAt(bits, i));
  }

  for (let i = 0; i < 8; i += 1) {
    setReserved(modules, reserved, size - 1 - i, 8, bitAt(bits, i));
  }
  for (let i = 8; i < 15; i += 1) {
    setReserved(modules, reserved, 8, size - 15 + i, bitAt(bits, i));
  }
}

function formatBits(errorCorrectionLevel, mask) {
  const data = (errorCorrectionLevel << 3) | mask;
  let value = data << 10;
  const generator = 0x537;
  for (let i = 14; i >= 10; i -= 1) {
    if ((value >> i) & 1) {
      value ^= generator << (i - 10);
    }
  }
  return ((data << 10) | value) ^ 0x5412;
}

function bitAt(value, index) {
  return Boolean((value >> index) & 1);
}

function setReserved(modules, reserved, x, y, dark) {
  if (!inMatrix(modules, x, y)) {
    return;
  }
  modules[y][x] = dark;
  reserved[y][x] = true;
}

function inMatrix(modules, x, y) {
  return y >= 0 && y < modules.length && x >= 0 && x < modules.length;
}

const gf = createGaloisField();

function reedSolomon(data, ecCount) {
  const generator = generatorPolynomial(ecCount);
  const result = Array(ecCount).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift();
    result.push(0);
    if (!factor) {
      continue;
    }
    for (let i = 0; i < ecCount; i += 1) {
      result[i] ^= gfMultiply(generator[i + 1], factor);
    }
  }
  return result;
}

function generatorPolynomial(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    poly = multiplyPolynomials(poly, [1, gf.exp[i]]);
  }
  return poly;
}

function multiplyPolynomials(a, b) {
  const result = Array(a.length + b.length - 1).fill(0);
  a.forEach((left, i) => {
    b.forEach((right, j) => {
      result[i + j] ^= gfMultiply(left, right);
    });
  });
  return result;
}

function gfMultiply(a, b) {
  if (!a || !b) {
    return 0;
  }
  return gf.exp[gf.log[a] + gf.log[b]];
}

function createGaloisField() {
  const exp = Array(512).fill(0);
  const log = Array(256).fill(0);
  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    exp[i] = value;
    log[value] = i;
    value <<= 1;
    if (value & 0x100) {
      value ^= 0x11d;
    }
  }
  for (let i = 255; i < exp.length; i += 1) {
    exp[i] = exp[i - 255];
  }
  return { exp, log };
}
