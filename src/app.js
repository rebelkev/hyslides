import {
  GRID_SIZE,
  SLIDE_SIZE,
  cloneElement,
  cloneSlide,
  createDeck,
  createElement,
  createSection,
  createSeedDeck,
  layoutTemplates,
  normalizeDeck,
} from "./schema.js";
import {
  boundsForElements,
  drawSlide,
  drawSlideAsync,
  hitTest,
  hitTestHandle,
  measureTextElementHeight,
  preloadSlideImages,
} from "./renderer.js";
import { deleteDeck, downloadBlob, loadCurrentDeck, loadDecks, saveDeck } from "./storage.js";
import { importPptx, pptxCapabilities } from "./pptx.js";
import { exportDeckToPdf } from "./pdf.js";
import {
  engagementTypes,
  ensureEngagement,
  renderAudienceContent,
  renderLiveControls,
} from "./engagement.js";
import {
  audienceCodeFromHash,
  audienceJoinUrl,
  controlLiveSession,
  deleteLiveSession,
  getLiveSessionHistory,
  getLiveSession,
  isLocalJoinUrl,
  liveQrImageSrc,
  liveSnapshotForDeck,
  liveStateDeck,
  listLiveSessions,
  moderateLiveQuestion,
  normalizeLiveCode,
  publishLiveSession,
  registerLiveParticipant,
  renameLiveSession,
  submitLiveResponse,
  submitLiveQuestion,
  voteLiveQuestion,
} from "./live.js";

const dom = {
  app: document.querySelector("#app"),
  canvas: document.querySelector("#slideCanvas"),
  presenterCanvas: document.querySelector("#presenterCanvas"),
  audienceCanvas: document.querySelector("#audienceCanvas"),
  nextCanvas: document.querySelector("#nextCanvas"),
  viewport: document.querySelector("#canvasViewport"),
  textEditor: document.querySelector("#textEditor"),
  slideList: document.querySelector("#slideList"),
  addSectionBtn: document.querySelector("#addSectionBtn"),
  slideSelectionText: document.querySelector("#slideSelectionText"),
  moveSlideInput: document.querySelector("#moveSlideInput"),
  moveSlideBtn: document.querySelector("#moveSlideBtn"),
  templateSection: document.querySelector("#templateSection"),
  templateToggleBtn: document.querySelector("#templateToggleBtn"),
  templateList: document.querySelector("#templateList"),
  inspector: document.querySelector("#inspector"),
  deckTitle: document.querySelector("#deckTitle"),
  statusText: document.querySelector("#statusText"),
  selectionText: document.querySelector("#selectionText"),
  zoomRange: document.querySelector("#zoomRange"),
  zoomLabel: document.querySelector("#zoomLabel"),
  presenterOverlay: document.querySelector("#presenterOverlay"),
  audienceOverlay: document.querySelector("#audienceOverlay"),
  deckLibraryOverlay: document.querySelector("#deckLibraryOverlay"),
  deckLibraryList: document.querySelector("#deckLibraryList"),
  sessionHistoryOverlay: document.querySelector("#sessionHistoryOverlay"),
  sessionHistoryContent: document.querySelector("#sessionHistoryContent"),
  sessionHistorySubtitle: document.querySelector("#sessionHistorySubtitle"),
  presenterNotes: document.querySelector("#presenterNotes"),
  presenterSlideTitle: document.querySelector("#presenterSlideTitle"),
  presenterDeckTitle: document.querySelector("#presenterDeckTitle"),
  presenterTimer: document.querySelector("#presenterTimer"),
  presenterParticipantCount: document.querySelector("#presenterParticipantCount"),
  presenterResponseCount: document.querySelector("#presenterResponseCount"),
  presenterConnectionStatus: document.querySelector("#presenterConnectionStatus"),
  presenterFlowCount: document.querySelector("#presenterFlowCount"),
  presenterSlideList: document.querySelector("#presenterSlideList"),
  presenterQnaList: document.querySelector("#presenterQnaList"),
  presenterQnaCount: document.querySelector("#presenterQnaCount"),
  nextSlideTitle: document.querySelector("#nextSlideTitle"),
  presentationBlackout: document.querySelector("#presentationBlackout"),
  liveControls: document.querySelector("#liveControls"),
  audienceContent: document.querySelector("#audienceContent"),
  pptxInput: document.querySelector("#pptxInput"),
  imageInput: document.querySelector("#imageInput"),
};

const TEMPLATES_EXPANDED_KEY = "hyslides.templatesExpanded";
const PARTICIPANT_ID_KEY = "hyslides.participantId";
const ACTIVE_SESSION_KEY = "hyslides.activeSession";

let deck = createSeedDeck();
let activeSlideIndex = 0;
let selectedSlideIndexes = new Set([0]);
let slideSelectionAnchor = 0;
let slideDragState = null;
let openSlideMenuIndex = null;
let openSectionMenuId = null;
let selectedIds = [];
let zoom = 0.82;
let autoFitZoom = true;
let canvasResizeObserver = null;
let editorAnimationStates = null;
let editorAnimationToken = 0;
let guides = [];
let dragState = null;
let clipboard = [];
let saveTimer = null;
let undoStack = [];
let redoStack = [];
let lastHistoryMessage = "";
let lastHistoryAt = 0;
let restoringHistory = false;
let presenterOpen = false;
let presenterWindow = null;
let presentationWindow = null;
let presenterAnimation = createAnimationPlaybackState();
const presenterWindowMode = location.hash === "#presenter";
const presentationWindowMode = location.hash === "#presentation";
const presenterChannel = "BroadcastChannel" in window ? new BroadcastChannel("hyslides-presenter") : null;
let skippedSlideIds = new Set();
let presentationBlackout = false;
let presenterStartedAt = 0;
let presenterTimerInterval = 0;
let countdownRuntime = new Map();
let countdownTickInterval = 0;
let presenterQnaTab = "unanswered";
let audienceOpen = false;
let participantQnaOpen = false;
let templatesExpanded = readTemplatesExpandedPreference();
let inspectorTab = "properties";
let liveSession = {
  code: "",
  instanceId: "",
  sessionName: "",
  presenterToken: "",
  lifecycleStatus: "active",
  participantCount: 0,
  responseCount: 0,
  questions: [],
  joinUrl: "",
  qrSrc: "",
  backendAvailable: false,
  status: "Live session not started",
  publishTimer: null,
  pollTimer: null,
  publishing: false,
  polling: false,
  lastPublishedSignature: "",
};
let audienceLive = {
  code: "",
  state: null,
  responses: {},
  loading: false,
  backendAvailable: false,
  error: "",
  pollTimer: null,
};
const participantId = readOrCreateParticipantId();

const BULLET_EDITOR_PREFIX = "\u2022 ";

const ctx = dom.canvas.getContext("2d");
const presenterCtx = dom.presenterCanvas.getContext("2d");
const audienceCtx = dom.audienceCanvas.getContext("2d");
const nextCtx = dom.nextCanvas.getContext("2d");

init();

async function init() {
  upgradeIconButtons();
  const saved = await loadCurrentDeck().catch(() => null);
  deck = normalizeDeck(saved || createSeedDeck());
  bindEvents();
  renderAll();
  resetHistory();
  setupCanvasAutoFit();
  setStatus("Ready");
  bindPresenterChannel();
  if (presenterWindowMode || presentationWindowMode) {
    document.body.classList.add("presenter-window");
    if (presentationWindowMode) document.body.classList.add("presentation-window");
    presenterChannel?.postMessage({ type: "view-ready" });
    openPresenterMode();
  } else if (location.hash.startsWith("#audience")) {
    document.body.classList.add("audience-window");
    openAudience();
  }
}

function bindEvents() {
  dom.deckTitle.addEventListener("input", () => {
    deck.title = dom.deckTitle.value;
    markChanged("Deck title updated");
  });

  document.querySelector("#newDeckBtn").addEventListener("click", () => {
    deck = createDeck({
      title: "Untitled HySlides deck",
      slides: [layoutTemplates[0].apply()],
    });
    activeSlideIndex = 0;
    selectedSlideIndexes = new Set([0]);
    slideSelectionAnchor = 0;
    openSlideMenuIndex = null;
    openSectionMenuId = null;
    selectedIds = [];
    markChanged("New deck created");
    renderAll();
    resetHistory();
  });

  document.querySelector("#saveDeckBtn").addEventListener("click", async () => {
    deck = await saveDeck(deck);
    setStatus("Deck saved");
  });
  document.querySelector("#undoBtn").addEventListener("click", undoEdit);
  document.querySelector("#redoBtn").addEventListener("click", redoEdit);
  document.querySelector("#deckLibraryBtn").addEventListener("click", openDeckLibrary);
  document.querySelector("#closeDeckLibraryBtn").addEventListener("click", closeDeckLibrary);
  document.querySelector("#sessionHistoryBtn").addEventListener("click", openSessionHistory);
  document.querySelector("#closeSessionHistoryBtn").addEventListener("click", closeSessionHistory);

  document.querySelector("#addSlideBtn").addEventListener("click", () => {
    const slide = layoutTemplates[1].apply();
    slide.sectionId = deck.slides[deck.slides.length - 1]?.sectionId || null;
    deck.slides.push(slide);
    activeSlideIndex = deck.slides.length - 1;
    selectedSlideIndexes = new Set([activeSlideIndex]);
    slideSelectionAnchor = activeSlideIndex;
    openSlideMenuIndex = null;
    openSectionMenuId = null;
    selectedIds = [];
    markChanged("Slide added");
    renderAll();
  });
  dom.addSectionBtn?.addEventListener("click", addSectionAtActiveSlide);
  dom.templateToggleBtn?.addEventListener("click", () => {
    templatesExpanded = !templatesExpanded;
    saveTemplatesExpandedPreference();
    renderTemplates();
  });

  dom.moveSlideBtn?.addEventListener("click", moveSelectedSlidesFromInput);
  dom.moveSlideInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      moveSelectedSlidesFromInput();
    }
  });

  dom.pptxInput.addEventListener("change", async () => {
    const file = dom.pptxInput.files?.[0];
    if (!file) {
      return;
    }
    setStatus("Importing PowerPoint...");
    try {
      deck = normalizeDeck(await importPptx(file));
      activeSlideIndex = 0;
      selectedSlideIndexes = new Set([0]);
      slideSelectionAnchor = 0;
      openSlideMenuIndex = null;
      openSectionMenuId = null;
      selectedIds = [];
      await saveDeck(deck);
      setStatus("PowerPoint imported");
      renderAll();
      resetHistory();
    } catch (error) {
      setStatus(`Import failed: ${error.message}`);
    } finally {
      dom.pptxInput.value = "";
    }
  });

  document.querySelector("#exportPdfBtn").addEventListener("click", async () => {
    setStatus("Exporting PDF...");
    try {
      const result = await exportDeckToPdf(deck);
      downloadBlob(result.blob, result.filename);
      setStatus("PDF exported");
    } catch (error) {
      setStatus(`PDF export failed: ${error.message}`);
    }
  });

  document.querySelector("#presentBtn").addEventListener("click", launchPresenterWindow);
  document.querySelector("#audienceBtn").addEventListener("click", openAudience);
  document.querySelector("#closePresenterBtn").addEventListener("click", closePresenter);
  document.querySelector("#closeAudienceBtn").addEventListener("click", closeAudience);
  window.addEventListener("hashchange", () => {
    if (location.hash.startsWith("#audience")) {
      document.body.classList.add("audience-window");
      openAudience();
    }
  });
  document.querySelector("#prevSlideBtn").addEventListener("click", () => stepSlide(-1));
  document.querySelector("#nextSlideBtn").addEventListener("click", advancePresenter);
  document.querySelector("#openPresentationViewBtn").addEventListener("click", openPresentationWindow);
  document.querySelector("#resetPresenterTimerBtn").addEventListener("click", resetPresenterTimer);
  document.querySelector("#blackoutPresentationBtn").addEventListener("click", togglePresentationBlackout);
  document.querySelector("#qnaUnansweredTab").addEventListener("click", () => {
    presenterQnaTab = "unanswered";
    renderPresenterQna();
  });
  document.querySelector("#qnaAnsweredTab").addEventListener("click", () => {
    presenterQnaTab = "answered";
    renderPresenterQna();
  });
  document.querySelector("#fullscreenPresenterBtn").addEventListener("click", () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  });
  dom.presenterNotes.addEventListener("input", () => {
    currentSlide().notes = dom.presenterNotes.value;
    markChanged("Presenter notes updated");
    presenterChannel?.postMessage({ type: "notes-updated", slideId: currentSlide().id, notes: dom.presenterNotes.value });
  });
  document.querySelector("#propertiesTabBtn").addEventListener("click", () => {
    inspectorTab = "properties";
    renderInspector();
  });
  document.querySelector("#elementsTabBtn").addEventListener("click", () => {
    inspectorTab = "elements";
    renderInspector();
  });
  document.querySelector("#duplicateBtn").addEventListener("click", duplicateSelection);
  document.querySelector("#groupBtn").addEventListener("click", groupSelection);
  document.querySelector("#ungroupBtn").addEventListener("click", ungroupSelection);
  document.querySelector("#lockBtn").addEventListener("click", toggleLockSelection);
  document.querySelector("#centerHorizontalBtn").addEventListener("click", () => centerSelection("horizontal"));
  document.querySelector("#centerVerticalBtn").addEventListener("click", () => centerSelection("vertical"));
  document.querySelector("#frontBtn").addEventListener("click", () => moveLayer(1));
  document.querySelector("#backBtn").addEventListener("click", () => moveLayer(-1));
  document.querySelector("#sendFrontBtn").addEventListener("click", () => sendLayer("front"));
  document.querySelector("#sendBackBtn").addEventListener("click", () => sendLayer("back"));

  document.querySelector("#zoomOutBtn").addEventListener("click", () => setZoom(zoom - 0.08, { manual: true }));
  document.querySelector("#zoomInBtn").addEventListener("click", () => setZoom(zoom + 0.08, { manual: true }));
  dom.zoomRange.addEventListener("input", () => setZoom(Number(dom.zoomRange.value) / 100, { manual: true }));
  document.querySelector("#previewAnimationsBtn").addEventListener("click", previewSlideAnimations);

  document.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => addElement(button.dataset.add));
  });

  dom.canvas.addEventListener("pointerdown", onPointerDown);
  dom.canvas.addEventListener("pointermove", onPointerMove);
  dom.canvas.addEventListener("pointerup", onPointerUp);
  dom.canvas.addEventListener("pointerleave", onPointerUp);
  dom.canvas.addEventListener("dblclick", openTextEditor);
  dom.canvas.addEventListener("dragover", (event) => event.preventDefault());
  dom.canvas.addEventListener("drop", onCanvasDrop);

  dom.imageInput.addEventListener("change", () => {
    const file = dom.imageInput.files?.[0];
    if (file) {
      addImageFromFile(file);
    }
    dom.imageInput.value = "";
  });

  dom.textEditor.addEventListener("blur", closeTextEditor);
  dom.textEditor.addEventListener("keydown", (event) => {
    if (handleTextEditorBulletKeys(event)) {
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      closeTextEditor();
      dom.canvas.focus();
    }
  });

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("click", (event) => {
    if (
      (openSlideMenuIndex === null && openSectionMenuId === null) ||
      event.target.closest(".slide-menu") ||
      event.target.closest(".slide-menu-button") ||
      event.target.closest(".section-menu") ||
      event.target.closest(".section-menu-button")
    ) {
      return;
    }
    openSlideMenuIndex = null;
    openSectionMenuId = null;
    renderSlides();
  });
}

function renderAll() {
  syncAudienceJoinElements();
  deck.slides.forEach(autoSizeTextElements);
  dom.deckTitle.value = deck.title;
  renderCanvas();
  renderSlides();
  renderTemplates();
  renderInspector();
  updateSelectionLabel();
  if (presenterOpen) {
    renderPresenter();
  }
  if (audienceOpen) {
    renderAudience();
  }
}

function upgradeIconButtons() {
  const lucideNames = {
    plus: "plus", save: "save", folder: "folder-open", upload: "file-up", "file-text": "file-text",
    play: "play", users: "users", history: "history", cursor: "mouse-pointer-2", type: "type", image: "image",
    shapes: "shapes", star: "star", chart: "bar-chart-3", table: "table-2", minus: "minus",
    engagement: "message-square", copy: "copy", group: "combine", ungroup: "ungroup", lock: "lock",
    "layer-up": "bring-to-front", "layer-down": "send-to-back", "to-front": "chevrons-up",
    "to-back": "chevrons-down", "align-horizontal": "align-horizontal-space-around",
    "align-vertical": "align-vertical-space-around", "zoom-out": "zoom-out", "zoom-in": "zoom-in",
    undo: "undo-2", redo: "redo-2", timer: "timer",
  };
  document.querySelectorAll("[data-icon]").forEach((control) => {
    const label = control.getAttribute("aria-label") || control.getAttribute("title") || control.textContent.trim();
    const icon = control.dataset.icon;
    control.classList.add("icon-button");
    control.setAttribute("aria-label", label);
    control.dataset.tooltip = label;
    control.innerHTML = `
      <span class="button-icon" data-lucide="${attr(lucideNames[icon] || icon)}" aria-hidden="true">
        <svg class="button-icon" aria-hidden="true" focusable="false"><use href="#icon-${icon}"></use></svg>
      </span>
      <span class="sr-only">${escapeHtml(label)}</span>
    `;
  });
  window.lucide?.createIcons({ attrs: { "stroke-width": 1.8 } });
  window.addEventListener("load", () => window.lucide?.createIcons({ attrs: { "stroke-width": 1.8 } }), { once: true });
}

async function openDeckLibrary() {
  await saveDeck(deck).catch(() => null);
  dom.deckLibraryOverlay.classList.remove("hidden");
  dom.deckLibraryOverlay.setAttribute("aria-hidden", "false");
  renderDeckLibrary();
}

function closeDeckLibrary() {
  dom.deckLibraryOverlay.classList.add("hidden");
  dom.deckLibraryOverlay.setAttribute("aria-hidden", "true");
}

function openSessionHistory() {
  dom.sessionHistoryOverlay.classList.remove("hidden");
  dom.sessionHistoryOverlay.setAttribute("aria-hidden", "false");
  dom.sessionHistorySubtitle.textContent = deck.title || "Untitled deck";
  renderSessionHistoryList();
}

function closeSessionHistory() {
  dom.sessionHistoryOverlay.classList.add("hidden");
  dom.sessionHistoryOverlay.setAttribute("aria-hidden", "true");
}

async function renderSessionHistoryList() {
  dom.sessionHistoryContent.innerHTML = `<div class="session-history-empty">Loading sessions…</div>`;
  try {
    const payload = await listLiveSessions(deck.id, presenterTokenForDeck());
    const sessions = payload.sessions || [];
    if (!sessions.length) {
      dom.sessionHistoryContent.innerHTML = `
        <div class="session-history-empty">
          <strong>No presentation sessions yet</strong>
          <span>Start Present mode to create the first session.</span>
        </div>
      `;
      return;
    }
    dom.sessionHistoryContent.innerHTML = sessions.map((session) => `
      <article class="session-history-row">
        <div class="session-history-meta">
          <strong>${escapeHtml(session.session_name || defaultSessionName(session))}</strong>
          <span>${escapeHtml(formatSessionDate(session.started_at))} · Code ${escapeHtml(session.access_code)}</span>
          <span>${Number(session.response_count || 0)} responses · ${Number(session.question_count || 0)} questions · ${escapeHtml(session.status || "ended")}</span>
        </div>
        <div class="session-history-actions">
          <button type="button" data-open-session="${attr(session.instance_id)}">View</button>
          <button type="button" data-delete-session="${attr(session.instance_id)}">Delete</button>
        </div>
      </article>
    `).join("");
    dom.sessionHistoryContent.querySelectorAll("[data-open-session]").forEach((button) => {
      button.addEventListener("click", () => renderSessionHistoryDetail(button.dataset.openSession));
    });
    dom.sessionHistoryContent.querySelectorAll("[data-delete-session]").forEach((button) => {
      button.addEventListener("click", async () => {
        const session = sessions.find((item) => item.instance_id === button.dataset.deleteSession);
        if (!session || !confirm(`Delete session "${session.session_name || defaultSessionName(session)}" and all its responses?`)) {
          return;
        }
        await deleteLiveSession(session.instance_id, presenterTokenForDeck());
        setStatus("Session deleted");
        renderSessionHistoryList();
      });
    });
  } catch (error) {
    dom.sessionHistoryContent.innerHTML = `<div class="session-history-empty"><strong>Session history unavailable</strong><span>${escapeHtml(error.message)}</span></div>`;
  }
}

async function renderSessionHistoryDetail(instanceId) {
  dom.sessionHistoryContent.innerHTML = `<div class="session-history-empty">Loading results…</div>`;
  try {
    const detail = await getLiveSessionHistory(instanceId, presenterTokenForDeck());
    const session = detail.session;
    const name = session.session_name || defaultSessionName(session);
    dom.sessionHistoryContent.innerHTML = `
      <div class="session-detail-toolbar">
        <button id="backToSessionsBtn" type="button">Back</button>
        <form id="renameSessionForm">
          <input id="sessionNameInput" value="${attr(name)}" aria-label="Session name" />
          <button type="submit">Rename</button>
        </form>
        <button id="exportSessionCsvBtn" type="button">Export CSV</button>
      </div>
      <div class="session-detail-summary">
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(formatSessionDate(session.started_at))} · Access code ${escapeHtml(session.access_code)}</span>
      </div>
      <div class="session-slide-results">
        ${(detail.questions || []).length ? `<section class="session-slide-card"><div class="session-slide-heading"><strong>Session Q&amp;A</strong><span>${detail.questions.length} submitted question${detail.questions.length === 1 ? "" : "s"}</span></div><div class="session-question-list">${detail.questions.map((question) => `<div>${escapeHtml(question.text)} · ${question.upvotes || 0} upvotes · ${question.answered ? "Answered" : "Unanswered"}</div>`).join("")}</div></section>` : ""}
        ${(detail.slides || []).map(renderHistoricalSlide).join("") || `<div class="session-history-empty">No slide results were recorded.</div>`}
      </div>
    `;
    dom.sessionHistoryContent.querySelector("#backToSessionsBtn")?.addEventListener("click", renderSessionHistoryList);
    dom.sessionHistoryContent.querySelector("#renameSessionForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = dom.sessionHistoryContent.querySelector("#sessionNameInput");
      const nextName = input.value.trim();
      if (!nextName) {
        return;
      }
      await renameLiveSession(instanceId, nextName, presenterTokenForDeck());
      setStatus("Session renamed");
      renderSessionHistoryDetail(instanceId);
    });
    dom.sessionHistoryContent.querySelector("#exportSessionCsvBtn")?.addEventListener("click", () => {
      const csv = sessionHistoryCsv(detail);
      downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${safeFilename(name)}.csv`);
      setStatus("Session CSV exported");
    });
  } catch (error) {
    dom.sessionHistoryContent.innerHTML = `<div class="session-history-empty"><strong>Session could not be loaded</strong><span>${escapeHtml(error.message)}</span><button id="backToSessionsBtn" type="button">Back</button></div>`;
    dom.sessionHistoryContent.querySelector("#backToSessionsBtn")?.addEventListener("click", renderSessionHistoryList);
  }
}

function renderHistoricalSlide(item) {
  const slide = item.slide || {};
  const engagement = slide.engagement || {};
  const results = Object.entries(engagement.results || {});
  const questions = engagement.qna || [];
  const reactions = Object.entries(engagement.reactions || {}).filter(([, count]) => Number(count) > 0);
  return `
    <section class="session-slide-card">
      <div class="session-slide-heading">
        <strong>Slide ${Number(item.slideIndex) + 1}: ${escapeHtml(slide.title || "Untitled slide")}</strong>
        <span>${escapeHtml(engagement.prompt || (engagement.enabled ? "Engagement" : "Presentation slide"))}</span>
      </div>
      ${results.length ? `<div class="session-result-list">${results.map(([label, count]) => `<div><span>${escapeHtml(label)}</span><strong>${Number(count)}</strong></div>`).join("")}</div>` : ""}
      ${questions.length ? `<div class="session-question-list">${questions.map((question) => `<div>${escapeHtml(question.text)}</div>`).join("")}</div>` : ""}
      ${reactions.length ? `<div class="session-result-list">${reactions.map(([label, count]) => `<div><span>${escapeHtml(label)}</span><strong>${Number(count)}</strong></div>`).join("")}</div>` : ""}
      ${!results.length && !questions.length && !reactions.length ? `<span class="session-no-responses">No responses on this slide.</span>` : ""}
    </section>
  `;
}

function sessionHistoryCsv(detail) {
  const rows = [["session_name", "instance_id", "started_at", "slide_number", "slide_title", "engagement_type", "prompt", "response", "count"]];
  const session = detail.session || {};
  for (const question of detail.questions || []) {
    rows.push([session.session_name, session.instance_id, session.started_at, "", "Session Q&A", "qna", "Ask the presenter", question.text, question.upvotes || 0]);
  }
  for (const item of detail.slides || []) {
    const slide = item.slide || {};
    const engagement = slide.engagement || {};
    for (const [response, count] of Object.entries(engagement.results || {})) {
      rows.push([session.session_name, session.instance_id, session.started_at, Number(item.slideIndex) + 1, slide.title, engagement.type, engagement.prompt, response, count]);
    }
    for (const question of engagement.qna || []) {
      rows.push([session.session_name, session.instance_id, session.started_at, Number(item.slideIndex) + 1, slide.title, "qna", engagement.prompt, question.text, 1]);
    }
    for (const [response, count] of Object.entries(engagement.reactions || {}).filter(([, value]) => Number(value) > 0)) {
      rows.push([session.session_name, session.instance_id, session.started_at, Number(item.slideIndex) + 1, slide.title, "reaction", engagement.prompt, response, count]);
    }
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function defaultSessionName(session) {
  return `${session.deck_title || "Untitled deck"} — ${formatSessionDate(session.started_at)}`;
}

function formatSessionDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
}

function safeFilename(value) {
  return String(value || "hyslides-session").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "hyslides-session";
}

async function renderDeckLibrary() {
  const decks = (await loadDecks().catch(() => []))
    .map(normalizeDeck)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  if (!decks.length) {
    dom.deckLibraryList.innerHTML = `
      <div class="deck-library-empty">
        <strong>No saved decks yet</strong>
        <span>Use Save to keep a deck in this browser.</span>
      </div>
    `;
    return;
  }

  dom.deckLibraryList.innerHTML = decks
    .map((item) => {
      const isCurrent = item.id === deck.id;
      const updated = item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "Not saved yet";
      return `
        <div class="deck-library-row${isCurrent ? " current" : ""}">
          <div class="deck-library-meta">
            <strong>${escapeHtml(item.title || "Untitled deck")}</strong>
            <span>${item.slides.length} slide${item.slides.length === 1 ? "" : "s"} · ${escapeHtml(updated)}${isCurrent ? " · Open now" : ""}</span>
          </div>
          <div class="deck-library-actions">
            <button type="button" data-open-deck="${attr(item.id)}" ${isCurrent ? "disabled" : ""}>Open</button>
            <button type="button" data-delete-deck="${attr(item.id)}">Delete</button>
          </div>
        </div>
      `;
    })
    .join("");

  dom.deckLibraryList.querySelectorAll("[data-open-deck]").forEach((button) => {
    button.addEventListener("click", async () => {
      const nextDeck = decks.find((item) => item.id === button.dataset.openDeck);
      if (!nextDeck) {
        return;
      }
      deck = await saveDeck(nextDeck);
      activeSlideIndex = 0;
      selectedSlideIndexes = new Set([0]);
      slideSelectionAnchor = 0;
      openSlideMenuIndex = null;
      openSectionMenuId = null;
      selectedIds = [];
      closeDeckLibrary();
      setStatus("Deck opened");
      renderAll();
      resetHistory();
    });
  });

  dom.deckLibraryList.querySelectorAll("[data-delete-deck]").forEach((button) => {
    button.addEventListener("click", async () => {
      const deckId = button.dataset.deleteDeck;
      const target = decks.find((item) => item.id === deckId);
      if (!target || !confirm(`Delete "${target.title || "Untitled deck"}"?`)) {
        return;
      }
      await deleteDeck(deckId);
      if (deckId === deck.id) {
        const remaining = (await loadDecks().catch(() => [])).map(normalizeDeck);
        deck = remaining.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] || createSeedDeck();
        if (remaining.length) {
          deck = await saveDeck(deck);
        }
        activeSlideIndex = 0;
        selectedSlideIndexes = new Set([0]);
        slideSelectionAnchor = 0;
        openSlideMenuIndex = null;
        openSectionMenuId = null;
        selectedIds = [];
        renderAll();
        resetHistory();
      }
      setStatus("Deck deleted");
      renderDeckLibrary();
    });
  });
}

function renderCanvas() {
  autoSizeTextElements(currentSlide());
  dom.canvas.style.width = `${SLIDE_SIZE.width * zoom}px`;
  dom.canvas.style.height = `${SLIDE_SIZE.height * zoom}px`;
  dom.zoomRange.value = Math.round(zoom * 100);
  dom.zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  drawSlide(ctx, currentSlide(), deck, {
    selectedIds,
    guides,
    includeSelection: true,
    scale: zoom,
    elementStates: editorAnimationStates,
  });
  preloadSlideImages(currentSlide()).then(() => {
    drawSlide(ctx, currentSlide(), deck, {
      selectedIds,
      guides,
      includeSelection: true,
      scale: zoom,
      elementStates: editorAnimationStates,
    });
  });
}

function autoSizeTextElements(slide) {
  for (const element of slide.elements || []) {
    if (element.type === "text" && element.autoHeight !== false) {
      element.h = measureTextElementHeight(ctx, element, deck);
    }
  }
}

function renderSlides() {
  normalizeSlideSelection();
  deck.sections ||= [];
  dom.slideList.innerHTML = "";
  const renderedSectionIds = new Set();
  deck.slides.forEach((slide, index) => {
    const section = sectionForId(slide.sectionId);
    if (section && !renderedSectionIds.has(section.id)) {
      renderSectionHeader(section);
      renderedSectionIds.add(section.id);
    }
    const isActive = index === activeSlideIndex;
    const isSelected = selectedSlideIndexes.has(index);
    const menuOpen = openSlideMenuIndex === index;
    const actionIndexes = isSelected ? selectedSlideIndexesSorted() : [index];
    const moveCount = actionIndexes.length;
    const duplicateLabel = moveCount > 1 ? `Duplicate ${moveCount} selected slides` : "Duplicate slide";
    const deleteLabel = moveCount > 1 ? `Delete ${moveCount} selected slides` : "Delete slide";
    const moveMax = Math.max(1, deck.slides.length - moveCount + 1);
    const item = document.createElement("div");
    item.className = `slide-thumb${isActive ? " active" : ""}${isSelected ? " selected" : ""}${menuOpen ? " menu-open" : ""}`;
    item.draggable = true;
    item.dataset.slideIndex = String(index);
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(isSelected));
    item.tabIndex = 0;
    item.innerHTML = `
      <button class="slide-preview" type="button" aria-label="Select slide ${index + 1}">
        <canvas width="192" height="108" aria-hidden="true"></canvas>
        <span class="slide-meta"><span class="slide-title">${index + 1}. ${escapeHtml(slide.title || "Slide")}</span><span class="slide-kind">${slide.engagement?.enabled ? "Interactive" : "Deck"}</span></span>
      </button>
      <span class="slide-actions">
        <button class="slide-menu-button" type="button" aria-label="Slide ${index + 1} menu" aria-haspopup="dialog" aria-expanded="${menuOpen}" title="Slide menu">...</button>
      </span>
      ${menuOpen ? `
        <div class="slide-menu" role="dialog" aria-label="Slide ${index + 1} menu">
          <button class="slide-menu-duplicate" type="button">${duplicateLabel}</button>
          <div class="slide-menu-field">
            <label>${moveCount > 1 ? "Move selected to #" : "Move to #"}</label>
            <div class="slide-menu-row">
              <input class="slide-menu-move-input" type="number" min="1" max="${moveMax}" value="${clamp(index + 1, 1, moveMax)}" />
              <button class="slide-menu-move" type="button">Move</button>
            </div>
          </div>
          <div class="slide-menu-field">
            <label>Title</label>
            <input class="slide-menu-title-input" type="text" value="${attr(slide.title || "")}" />
            <button class="slide-menu-title" type="button">Update title</button>
          </div>
          <button class="slide-menu-delete" type="button">${deleteLabel}</button>
        </div>
      ` : ""}
    `;
    const preview = item.querySelector(".slide-preview");
    const menuButton = item.querySelector(".slide-menu-button");
    const menu = item.querySelector(".slide-menu");
    preview.draggable = true;
    menuButton.draggable = false;
    preview.addEventListener("click", (event) => {
      selectSlide(index, event);
    });
    menuButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleSlideMenu(index);
    });
    bindSlideMenu(item, index);
    item.addEventListener("keydown", (event) => {
      if (event.target.closest(".slide-menu")) {
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectSlide(index, event);
      }
    });
    item.addEventListener("dragstart", (event) => {
      startSlideDrag(event, index, item);
    });
    item.addEventListener("dragover", (event) => {
      updateSlideDropTarget(event, item);
    });
    item.addEventListener("dragleave", () => {
      item.classList.remove("drop-before", "drop-after");
    });
    item.addEventListener("drop", (event) => {
      dropSlides(event, index, item);
    });
    item.addEventListener("dragend", clearSlideDropTargets);
    menu?.addEventListener("click", (event) => event.stopPropagation());
    dom.slideList.append(item);
    drawThumb(item.querySelector("canvas"), slide);
  });
  updateSlideMoveControls();
}

function renderSectionHeader(section) {
  const menuOpen = openSectionMenuId === section.id;
  const canMoveUp = sectionMoveTarget(section.id, -1) !== null;
  const canMoveDown = sectionMoveTarget(section.id, 1) !== null;
  const header = document.createElement("div");
  header.className = `section-header${menuOpen ? " menu-open" : ""}`;
  header.dataset.sectionId = section.id;
  header.setAttribute("role", "presentation");
  header.innerHTML = `
    <span class="section-title">${escapeHtml(section.name || "Untitled section")}</span>
    <button class="section-menu-button" type="button" aria-label="${attr(section.name || "Section")} menu" aria-haspopup="dialog" aria-expanded="${menuOpen}" title="Section menu">...</button>
    ${menuOpen ? `
      <div class="section-menu" role="dialog" aria-label="${attr(section.name || "Section")} menu">
        <button class="section-menu-rename" type="button">Rename section</button>
        <button class="section-menu-move-up" type="button" ${canMoveUp ? "" : "disabled"}>Move section up</button>
        <button class="section-menu-move-down" type="button" ${canMoveDown ? "" : "disabled"}>Move section down</button>
        <button class="section-menu-remove" type="button">Remove section, keep slides</button>
        <button class="section-menu-delete section-menu-danger" type="button">Remove section and slides</button>
      </div>
    ` : ""}
  `;
  header.querySelector(".section-menu-button")?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleSectionMenu(section.id);
  });
  bindSectionMenu(header, section.id);
  header.querySelector(".section-menu")?.addEventListener("click", (event) => event.stopPropagation());
  dom.slideList.append(header);
}

function normalizeSlideSelection() {
  if (!deck.slides.length) {
    selectedSlideIndexes = new Set();
    activeSlideIndex = 0;
    slideSelectionAnchor = 0;
    return;
  }

  activeSlideIndex = clamp(activeSlideIndex, 0, deck.slides.length - 1);
  slideSelectionAnchor = clamp(slideSelectionAnchor ?? activeSlideIndex, 0, deck.slides.length - 1);
  const valid = selectedSlideIndexesSorted().filter((index) => index >= 0 && index < deck.slides.length);
  if (!valid.length) {
    valid.push(activeSlideIndex);
  }
  valid.push(activeSlideIndex);
  selectedSlideIndexes = new Set(valid);
}

function selectedSlideIndexesSorted(indexes = selectedSlideIndexes) {
  return [...indexes]
    .filter((index) => Number.isInteger(index))
    .sort((a, b) => a - b);
}

function selectSlide(index, event = {}) {
  closeTextEditor();
  const targetIndex = clamp(index, 0, deck.slides.length - 1);
  const toggle = event.metaKey || event.ctrlKey;
  openSlideMenuIndex = null;
  openSectionMenuId = null;

  if (event.shiftKey) {
    const start = Math.min(slideSelectionAnchor, targetIndex);
    const end = Math.max(slideSelectionAnchor, targetIndex);
    selectedSlideIndexes = new Set(Array.from({ length: end - start + 1 }, (_, offset) => start + offset));
  } else if (toggle) {
    const next = new Set(selectedSlideIndexesSorted());
    if (next.has(targetIndex) && next.size > 1) {
      next.delete(targetIndex);
    } else {
      next.add(targetIndex);
    }
    selectedSlideIndexes = next;
    slideSelectionAnchor = targetIndex;
  } else {
    selectedSlideIndexes = new Set([targetIndex]);
    slideSelectionAnchor = targetIndex;
  }

  activeSlideIndex = targetIndex;
  selectedSlideIndexes.add(activeSlideIndex);
  selectedIds = [];
  renderAll();
}

function toggleSlideMenu(index) {
  closeTextEditor();
  const targetIndex = clamp(index, 0, deck.slides.length - 1);
  if (!selectedSlideIndexes.has(targetIndex)) {
    selectedSlideIndexes = new Set([targetIndex]);
    slideSelectionAnchor = targetIndex;
    activeSlideIndex = targetIndex;
    selectedIds = [];
  }
  openSlideMenuIndex = openSlideMenuIndex === targetIndex ? null : targetIndex;
  openSectionMenuId = null;
  renderAll();
}

function bindSlideMenu(item, index) {
  const menu = item.querySelector(".slide-menu");
  if (!menu) {
    return;
  }

  const moveInput = menu.querySelector(".slide-menu-move-input");
  const titleInput = menu.querySelector(".slide-menu-title-input");

  menu.querySelector(".slide-menu-duplicate")?.addEventListener("click", () => {
    openSlideMenuIndex = null;
    duplicateSlides(slideActionIndexes(index));
  });
  menu.querySelector(".slide-menu-delete")?.addEventListener("click", () => {
    openSlideMenuIndex = null;
    deleteSlides(slideActionIndexes(index));
  });
  menu.querySelector(".slide-menu-move")?.addEventListener("click", () => {
    moveSlidesFromMenu(index, moveInput);
  });
  moveInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      moveSlidesFromMenu(index, moveInput);
    }
  });
  menu.querySelector(".slide-menu-title")?.addEventListener("click", () => {
    updateSlideTitleFromMenu(index, titleInput);
  });
  titleInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      updateSlideTitleFromMenu(index, titleInput);
    }
  });
}

function duplicateSlides(indexes) {
  const sourceIndexes = selectedSlideIndexesSorted(new Set(indexes));
  if (!sourceIndexes.length) return;
  const duplicates = sourceIndexes.map((slideIndex) => cloneSlide(deck.slides[slideIndex]));
  const insertAt = sourceIndexes[sourceIndexes.length - 1] + 1;
  deck.slides.splice(insertAt, 0, ...duplicates);
  activeSlideIndex = insertAt;
  selectedSlideIndexes = new Set(duplicates.map((_, offset) => insertAt + offset));
  slideSelectionAnchor = insertAt;
  selectedIds = [];
  markChanged(duplicates.length === 1 ? "Slide duplicated" : `${duplicates.length} slides duplicated`);
  renderAll();
}

function addSectionAtActiveSlide() {
  normalizeSlideSelection();
  const requestedName = window.prompt("Section name", "New section");
  if (requestedName === null) {
    return;
  }

  const section = createSection({
    name: requestedName.trim() || "Untitled section",
  });
  const selected = selectedSlideIndexesSorted();
  const selectedRangeIsContinuous =
    selected.length > 1 && selected[selected.length - 1] - selected[0] + 1 === selected.length;
  const start = selectedRangeIsContinuous ? selected[0] : activeSlideIndex;
  const end = selectedRangeIsContinuous ? selected[selected.length - 1] + 1 : nextSectionStart(start);

  deck.sections ||= [];
  deck.sections.push(section);
  for (let index = start; index < end; index += 1) {
    deck.slides[index].sectionId = section.id;
  }

  activeSlideIndex = start;
  if (!selectedRangeIsContinuous) {
    selectedSlideIndexes = new Set([activeSlideIndex]);
    slideSelectionAnchor = activeSlideIndex;
  }
  openSlideMenuIndex = null;
  openSectionMenuId = null;
  selectedIds = [];
  markChanged("Section added");
  renderAll();
}

function nextSectionStart(startIndex) {
  const currentSectionId = deck.slides[startIndex]?.sectionId || null;
  for (let index = startIndex + 1; index < deck.slides.length; index += 1) {
    const sectionId = deck.slides[index].sectionId || null;
    if (sectionId && sectionId !== currentSectionId) {
      return index;
    }
  }
  return deck.slides.length;
}

function toggleSectionMenu(sectionId) {
  closeTextEditor();
  openSlideMenuIndex = null;
  openSectionMenuId = openSectionMenuId === sectionId ? null : sectionId;
  renderSlides();
}

function bindSectionMenu(header, sectionId) {
  const menu = header.querySelector(".section-menu");
  if (!menu) {
    return;
  }

  menu.querySelector(".section-menu-rename")?.addEventListener("click", () => renameSection(sectionId));
  menu.querySelector(".section-menu-move-up")?.addEventListener("click", () => moveSection(sectionId, -1));
  menu.querySelector(".section-menu-move-down")?.addEventListener("click", () => moveSection(sectionId, 1));
  menu.querySelector(".section-menu-remove")?.addEventListener("click", () => removeSectionKeepSlides(sectionId));
  menu.querySelector(".section-menu-delete")?.addEventListener("click", () => removeSectionAndSlides(sectionId));
}

function renameSection(sectionId) {
  const section = sectionForId(sectionId);
  if (!section) {
    return;
  }

  const requestedName = window.prompt("Section name", section.name || "Untitled section");
  if (requestedName === null) {
    return;
  }

  section.name = requestedName.trim() || "Untitled section";
  openSectionMenuId = null;
  markChanged("Section renamed");
  renderAll();
}

function moveSection(sectionId, direction) {
  const targetIndex = sectionMoveTarget(sectionId, direction);
  if (targetIndex === null) {
    setStatus(direction < 0 ? "Section is already first" : "Section is already last");
    return;
  }

  openSlideMenuIndex = null;
  openSectionMenuId = null;
  reorderSlides(sectionSlideIndexes(sectionId), targetIndex, "Section moved");
}

function removeSectionKeepSlides(sectionId) {
  const section = sectionForId(sectionId);
  if (!section) {
    return;
  }

  deck.slides.forEach((slide) => {
    if (slide.sectionId === sectionId) {
      slide.sectionId = null;
    }
  });
  deck.sections = (deck.sections || []).filter((item) => item.id !== sectionId);
  openSectionMenuId = null;
  markChanged("Section removed");
  renderAll();
}

function removeSectionAndSlides(sectionId) {
  const section = sectionForId(sectionId);
  if (!section) {
    return;
  }

  const indexes = sectionSlideIndexes(sectionId);
  if (!indexes.length) {
    deck.sections = (deck.sections || []).filter((item) => item.id !== sectionId);
    openSectionMenuId = null;
    markChanged("Empty section removed");
    renderAll();
    return;
  }

  if (indexes.length >= deck.slides.length) {
    setStatus("Deck needs at least one slide");
    return;
  }

  const slideLabel = indexes.length === 1 ? "1 slide" : `${indexes.length} slides`;
  if (!window.confirm(`Remove section "${section.name || "Untitled section"}" and delete ${slideLabel}?`)) {
    return;
  }

  deck.sections = (deck.sections || []).filter((item) => item.id !== sectionId);
  openSectionMenuId = null;
  deleteSlides(indexes, {
    confirm: false,
    status: `Section removed and ${slideLabel} deleted`,
  });
}

function sectionForId(sectionId) {
  if (!sectionId) {
    return null;
  }
  return (deck.sections || []).find((section) => section.id === sectionId) || null;
}

function sectionSlideIndexes(sectionId) {
  return deck.slides
    .map((slide, index) => (slide.sectionId === sectionId ? index : null))
    .filter((index) => index !== null);
}

function sectionMoveTarget(sectionId, direction) {
  const indexes = sectionSlideIndexes(sectionId);
  if (!indexes.length) {
    return null;
  }

  const first = indexes[0];
  const last = indexes[indexes.length - 1];
  const otherBlocks = sectionBlocks().filter((block) => block.sectionId !== sectionId);
  if (direction < 0) {
    const previous = [...otherBlocks].reverse().find((block) => block.end < first);
    return previous ? previous.start : null;
  }

  const next = otherBlocks.find((block) => block.start > last);
  return next ? Math.max(0, next.end + 1 - indexes.length) : null;
}

function sectionBlocks() {
  const blocks = [];
  let currentBlock = null;

  deck.slides.forEach((slide, index) => {
    const section = sectionForId(slide.sectionId);
    if (!section) {
      currentBlock = null;
      return;
    }

    if (currentBlock?.sectionId === section.id && currentBlock.end === index - 1) {
      currentBlock.end = index;
      return;
    }

    currentBlock = {
      sectionId: section.id,
      start: index,
      end: index,
    };
    blocks.push(currentBlock);
  });

  return blocks;
}

function pruneEmptySections() {
  const usedSectionIds = new Set(deck.slides.map((slide) => slide.sectionId).filter(Boolean));
  deck.sections = (deck.sections || []).filter((section) => usedSectionIds.has(section.id));
}

function slideActionIndexes(index) {
  return selectedSlideIndexes.has(index) ? selectedSlideIndexesSorted() : [index];
}

function moveSlidesFromMenu(index, input) {
  const indexes = slideActionIndexes(index);
  const requestedPosition = Number(input?.value);
  if (!Number.isFinite(requestedPosition)) {
    setStatus("Enter a slide number to move to");
    return;
  }

  const maxStartIndex = Math.max(0, deck.slides.length - indexes.length);
  const targetIndex = clamp(Math.round(requestedPosition) - 1, 0, maxStartIndex);
  openSlideMenuIndex = null;
  openSectionMenuId = null;
  reorderSlides(indexes, targetIndex, indexes.length === 1 ? "Slide moved" : "Slides moved");
}

function updateSlideTitleFromMenu(index, input) {
  const slide = deck.slides[index];
  if (!slide) {
    return;
  }

  const nextTitle = input?.value.trim() || "Untitled slide";
  if (slide.title === nextTitle) {
    setStatus("Slide title unchanged");
    return;
  }

  slide.title = nextTitle;
  openSlideMenuIndex = null;
  openSectionMenuId = null;
  markChanged("Slide title updated");
  renderAll();
}

function updateSlideMoveControls() {
  if (!dom.slideSelectionText || !dom.moveSlideInput || !dom.moveSlideBtn) {
    return;
  }

  const selected = selectedSlideIndexesSorted();
  const count = selected.length || 1;
  const first = selected[0] ?? activeSlideIndex;
  const last = selected[selected.length - 1] ?? activeSlideIndex;
  const maxStart = Math.max(1, deck.slides.length - count + 1);
  dom.slideSelectionText.textContent =
    count === 1
      ? `Slide ${activeSlideIndex + 1} selected`
      : selected.length === last - first + 1
        ? `${count} slides selected (${first + 1}-${last + 1})`
        : `${count} slides selected`;
  dom.moveSlideInput.min = "1";
  dom.moveSlideInput.max = String(maxStart);
  dom.moveSlideInput.value = String(clamp(first + 1, 1, maxStart));
  dom.moveSlideInput.disabled = deck.slides.length <= 1;
  dom.moveSlideBtn.disabled = deck.slides.length <= 1;
}

function startSlideDrag(event, index, item) {
  if (event.target.closest(".slide-menu") || event.target.closest(".slide-menu-button")) {
    event.preventDefault();
    return;
  }

  if (!selectedSlideIndexes.has(index)) {
    selectedSlideIndexes = new Set([index]);
    activeSlideIndex = index;
    slideSelectionAnchor = index;
    selectedIds = [];
    updateSlideMoveControls();
  }

  normalizeSlideSelection();
  slideDragState = {
    indexes: selectedSlideIndexesSorted(),
  };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", slideDragState.indexes.join(","));
  item.classList.add("dragging");
}

function updateSlideDropTarget(event, item) {
  if (!slideDragState) {
    return;
  }

  event.preventDefault();
  const rect = item.getBoundingClientRect();
  const dropAfter = event.clientY > rect.top + rect.height / 2;
  clearSlideDropClasses();
  item.classList.add(dropAfter ? "drop-after" : "drop-before");
  event.dataTransfer.dropEffect = "move";
}

function dropSlides(event, index, item) {
  if (!slideDragState) {
    return;
  }

  event.preventDefault();
  const rect = item.getBoundingClientRect();
  const dropAfter = event.clientY > rect.top + rect.height / 2;
  moveSlidesToOriginalIndex(slideDragState.indexes, index + (dropAfter ? 1 : 0));
  clearSlideDropTargets();
}

function clearSlideDropClasses() {
  document.querySelectorAll(".slide-thumb.drop-before, .slide-thumb.drop-after").forEach((item) => {
    item.classList.remove("drop-before", "drop-after");
  });
}

function clearSlideDropTargets() {
  clearSlideDropClasses();
  document.querySelectorAll(".slide-thumb.dragging").forEach((item) => {
    item.classList.remove("dragging");
  });
  slideDragState = null;
}

function moveSelectedSlidesFromInput() {
  normalizeSlideSelection();
  const selected = selectedSlideIndexesSorted();
  const requestedPosition = Number(dom.moveSlideInput?.value);
  if (!Number.isFinite(requestedPosition)) {
    setStatus("Enter a slide number to move to");
    return;
  }

  const maxStartIndex = Math.max(0, deck.slides.length - selected.length);
  const targetIndex = clamp(Math.round(requestedPosition) - 1, 0, maxStartIndex);
  reorderSlides(selected, targetIndex, selected.length === 1 ? "Slide moved" : "Slides moved");
}

function moveSlidesToOriginalIndex(indexes, targetIndex) {
  const selected = selectedSlideIndexesSorted(new Set(indexes));
  const clampedTarget = clamp(targetIndex, 0, deck.slides.length);
  const selectedBeforeTarget = selected.filter((index) => index < clampedTarget).length;
  reorderSlides(selected, clampedTarget - selectedBeforeTarget, "Slides reordered");
}

function reorderSlides(indexes, insertIndex, message) {
  const selected = selectedSlideIndexesSorted(new Set(indexes)).filter((index) => index >= 0 && index < deck.slides.length);
  if (!selected.length) {
    return;
  }

  const selectedSet = new Set(selected);
  const activeSlideId = currentSlide()?.id;
  const moving = selected.map((index) => deck.slides[index]);
  const remaining = deck.slides.filter((_, index) => !selectedSet.has(index));
  const insertion = clamp(insertIndex, 0, remaining.length);
  const nextSlides = [
    ...remaining.slice(0, insertion),
    ...moving,
    ...remaining.slice(insertion),
  ];
  const sameOrder = deck.slides.every((slide, index) => slide.id === nextSlides[index]?.id);

  if (sameOrder) {
    openSlideMenuIndex = null;
    openSectionMenuId = null;
    setStatus("Slides already in that position");
    renderSlides();
    return;
  }

  deck.slides = nextSlides;
  openSlideMenuIndex = null;
  openSectionMenuId = null;
  selectedSlideIndexes = new Set(moving.map((_, offset) => insertion + offset));
  activeSlideIndex = deck.slides.findIndex((slide) => slide.id === activeSlideId);
  if (activeSlideIndex < 0) {
    activeSlideIndex = insertion;
  }
  slideSelectionAnchor = activeSlideIndex;
  selectedIds = [];
  markChanged(message);
  renderAll();
}

function renderTemplates() {
  updateTemplateToggle();
  if (!templatesExpanded) {
    dom.templateList.innerHTML = "";
    return;
  }

  dom.templateList.innerHTML = "";
  for (const template of layoutTemplates) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "template-thumb";
    item.innerHTML = `<canvas width="192" height="108" aria-hidden="true"></canvas><span class="slide-meta"><span>${template.name}</span><span>Insert</span></span>`;
    item.addEventListener("click", () => {
      const slide = template.apply();
      slide.sectionId = currentSlide()?.sectionId || null;
      deck.slides.splice(activeSlideIndex + 1, 0, slide);
      activeSlideIndex += 1;
      selectedSlideIndexes = new Set([activeSlideIndex]);
      slideSelectionAnchor = activeSlideIndex;
      openSlideMenuIndex = null;
      openSectionMenuId = null;
      selectedIds = [];
      markChanged(`${template.name} slide inserted`);
      renderAll();
    });
    dom.templateList.append(item);
    const previewSlide = template.apply();
    autoSizeTextElements(previewSlide);
    drawThumb(item.querySelector("canvas"), previewSlide);
  }
}

function updateTemplateToggle() {
  dom.templateSection?.classList.toggle("collapsed", !templatesExpanded);
  dom.templateList.hidden = !templatesExpanded;
  if (!dom.templateToggleBtn) {
    return;
  }
  dom.templateToggleBtn.textContent = templatesExpanded ? "v" : ">";
  dom.templateToggleBtn.title = templatesExpanded ? "Collapse templates" : "Expand templates";
  dom.templateToggleBtn.setAttribute("aria-expanded", String(templatesExpanded));
}

function readTemplatesExpandedPreference() {
  try {
    return localStorage.getItem(TEMPLATES_EXPANDED_KEY) !== "false";
  } catch {
    return true;
  }
}

function saveTemplatesExpandedPreference() {
  try {
    localStorage.setItem(TEMPLATES_EXPANDED_KEY, String(templatesExpanded));
  } catch {
    // Collapsing templates is a view preference, so storage failures are harmless.
  }
}

function renderInspector() {
  const propertiesTab = document.querySelector("#propertiesTabBtn");
  const elementsTab = document.querySelector("#elementsTabBtn");
  propertiesTab.classList.toggle("active", inspectorTab === "properties");
  elementsTab.classList.toggle("active", inspectorTab === "elements");
  propertiesTab.setAttribute("aria-selected", String(inspectorTab === "properties"));
  elementsTab.setAttribute("aria-selected", String(inspectorTab === "elements"));
  if (inspectorTab === "elements") {
    renderElementTree();
    return;
  }
  const slide = currentSlide();
  const selected = selectedElements();
  if (selected.length === 1) {
    renderElementInspector(selected[0]);
  } else if (selected.length > 1) {
    renderMultiInspector(selected);
  } else {
    renderSlideInspector(slide);
  }
}

function renderElementTree() {
  const slide = currentSlide();
  const ordered = [...slide.elements].reverse();
  const renderedGroups = new Set();
  const rows = [];
  for (const element of ordered) {
    if (element.groupId) {
      if (renderedGroups.has(element.groupId)) continue;
      renderedGroups.add(element.groupId);
      const members = ordered.filter((item) => item.groupId === element.groupId);
      const groupSelected = members.every((item) => selectedIds.includes(item.id));
      rows.push(`
        <li class="element-tree-group">
          <button class="element-tree-row group-row ${groupSelected ? "selected" : ""}" type="button" data-group-id="${attr(element.groupId)}">
            ${elementTreeIcon("combine", "group")}<strong>Group</strong><span class="element-tree-count">${members.length}</span>
          </button>
          <ul>${members.map(elementTreeRow).join("")}</ul>
        </li>`);
    } else {
      rows.push(elementTreeRow(element));
    }
  }
  dom.inspector.innerHTML = `
    <section class="inspector-section element-tree-section">
      <div class="element-tree-heading"><strong>Slide elements</strong><span>${slide.elements.length}</span></div>
      <p class="element-tree-help">Double click an item to edit it.</p>
      <ul class="element-tree">${rows.join("") || '<li class="element-tree-empty">This slide has no elements.</li>'}</ul>
    </section>`;
  window.lucide?.createIcons({ attrs: { "stroke-width": 1.8 } });
  dom.inspector.querySelectorAll("[data-element-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedIds = [button.dataset.elementId];
      refreshElementTreeSelection(button);
      renderCanvas();
      updateSelectionLabel();
    });
    button.addEventListener("dblclick", () => {
      selectedIds = [button.dataset.elementId];
      inspectorTab = "properties";
      renderAll();
    });
  });
  dom.inspector.querySelectorAll("[data-group-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedIds = slide.elements.filter((item) => item.groupId === button.dataset.groupId).map((item) => item.id);
      refreshElementTreeSelection(button, button.dataset.groupId);
      renderCanvas();
      updateSelectionLabel();
    });
    button.addEventListener("dblclick", () => {
      selectedIds = slide.elements.filter((item) => item.groupId === button.dataset.groupId).map((item) => item.id);
      inspectorTab = "properties";
      renderAll();
    });
  });
}

function refreshElementTreeSelection(activeButton, groupId = "") {
  dom.inspector.querySelectorAll(".element-tree-row").forEach((row) => row.classList.remove("selected"));
  activeButton.classList.add("selected");
  if (groupId) {
    const groupElementIds = new Set(currentSlide().elements.filter((item) => item.groupId === groupId).map((item) => item.id));
    dom.inspector.querySelectorAll("[data-element-id]").forEach((row) => {
      row.classList.toggle("selected", groupElementIds.has(row.dataset.elementId));
    });
  }
}

function elementTreeRow(element) {
  const selected = selectedIds.includes(element.id);
  const label = element.name || element.type[0].toUpperCase() + element.type.slice(1);
  return `<li>
    <button class="element-tree-row ${selected ? "selected" : ""}" type="button" data-element-id="${attr(element.id)}" title="Select ${attr(label)}">
      ${elementTreeIconForType(element.type)}
      <span class="element-tree-name">${escapeHtml(label)}</span>
      ${element.animation?.effect && element.animation.effect !== "none" ? `<span class="element-tree-state" title="Animation order">${animationOrderLabel(element)}</span>` : element.locked ? '<span class="element-tree-state" title="Locked">Locked</span>' : ""}
    </button>
  </li>`;
}

function elementTreeIconForType(type) {
  const icons = {
    text: ["type", "type"],
    shape: ["shapes", "shapes"],
    image: ["image", "image"],
    icon: ["star", "star"],
    chart: ["bar-chart-3", "chart"],
    table: ["table-2", "table"],
    divider: ["minus", "minus"],
    engagement: ["message-square", "engagement"],
    countdown: ["timer", "history"],
  };
  const [lucideName, fallbackName] = icons[type] || ["square", "shapes"];
  return elementTreeIcon(lucideName, fallbackName);
}

function elementTreeIcon(lucideName, fallbackName) {
  return `<span class="element-type-icon" data-lucide="${attr(lucideName)}" aria-hidden="true">
    <svg aria-hidden="true" focusable="false"><use href="#icon-${attr(fallbackName)}"></use></svg>
  </span>`;
}

function renderSlideInspector(slide) {
  ensureEngagement(slide);
  const audienceJoinVisible = shouldShowAudienceJoin(slide, activeSlideIndex);
  dom.inspector.innerHTML = `
    <section class="inspector-section">
      <strong>Slide</strong>
      <div class="field-row"><label for="slideTitleInput">Title</label><input id="slideTitleInput" value="${attr(slide.title)}" /></div>
      <div class="field-grid">
        <div class="field-row"><label for="slideBgInput">Background</label><input id="slideBgInput" type="color" value="${slide.background || "#ffffff"}" /></div>
        <div class="field-row"><label for="slideLayoutInput">Layout</label><input id="slideLayoutInput" value="${attr(slide.layout)}" /></div>
      </div>
      <div class="field-row"><label for="notesInput">Presenter notes</label><textarea id="notesInput">${escapeHtml(slide.notes || "")}</textarea></div>
    </section>
    <section class="inspector-section">
      <strong>Theme</strong>
      <div class="field-grid">
        <div class="field-row"><label for="primaryColor">Primary</label><input id="primaryColor" type="color" value="${deck.theme.colors.primary}" /></div>
        <div class="field-row"><label for="accentColor">Accent</label><input id="accentColor" type="color" value="${deck.theme.colors.accent}" /></div>
      </div>
      <div class="field-row">
        <label for="brandColorInput">Saved brand colors</label>
        <div class="brand-color-save">
          <input id="brandColorInput" type="color" value="${deck.theme.colors.primary}" />
          <button id="saveBrandColorBtn" type="button">Save swatch</button>
        </div>
        ${brandPaletteManagerMarkup()}
      </div>
      <div class="field-grid">
        <div class="field-row"><label for="headingFont">Heading font</label><input id="headingFont" value="${attr(deck.theme.fonts.heading)}" /></div>
        <div class="field-row"><label for="bodyFont">Body font</label><input id="bodyFont" value="${attr(deck.theme.fonts.body)}" /></div>
      </div>
      <div class="check-row"><input id="snapToggle" type="checkbox" ${deck.settings.snapToGrid ? "checked" : ""} /><label for="snapToggle">Snap to grid</label></div>
      <div class="check-row"><input id="guideToggle" type="checkbox" ${deck.settings.showGuides ? "checked" : ""} /><label for="guideToggle">Alignment guides</label></div>
    </section>
    <section class="inspector-section">
      <strong>Engagement</strong>
      <div class="check-row"><input id="engagementToggle" type="checkbox" ${slide.engagement.enabled ? "checked" : ""} /><label for="engagementToggle">Interactive slide</label></div>
      <div class="field-row"><label for="engagementType">Mode</label><select id="engagementType">${engagementTypes.map((type) => `<option value="${type.value}" ${slide.engagement.type === type.value ? "selected" : ""}>${type.label}</option>`).join("")}</select></div>
      <div class="field-row"><label for="engagementPrompt">Prompt</label><input id="engagementPrompt" value="${attr(slide.engagement.prompt)}" /></div>
      <div class="field-row"><label for="engagementOptions">Options</label><textarea id="engagementOptions">${escapeHtml(slide.engagement.options.join("\n"))}</textarea></div>
      ${correctAnswerFields(slide.engagement)}
      <div class="check-row"><input id="audienceJoinElementsToggle" type="checkbox" ${audienceJoinVisible ? "checked" : ""} /><label for="audienceJoinElementsToggle">Show QR code and access code on this slide</label></div>
      <div class="field-row">
        <label>Audience join</label>
        <input readonly value="${attr(audienceLink())}" />
        <div class="live-link-card compact">
          <img src="${attr(liveQrImageSrc(audienceLink()))}" alt="Audience QR code" />
          <span>Scan or enter access code <strong>${escapeHtml(ensureAudienceCode())}</strong></span>
        </div>
      </div>
    </section>
    <section class="inspector-section">
      <strong>PowerPoint support</strong>
      <ul class="unsupported-list">
        ${pptxCapabilities().map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        ${(deck.unsupportedFeatures || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>
  `;

  bindValue("#slideTitleInput", (value) => (slide.title = value));
  bindValue("#slideLayoutInput", (value) => (slide.layout = value));
  bindValue("#notesInput", (value) => (slide.notes = value));
  bindValue("#slideBgInput", (value) => (slide.background = value));
  bindValue("#primaryColor", (value) => (deck.theme.colors.primary = value));
  bindValue("#accentColor", (value) => (deck.theme.colors.accent = value));
  bindBrandPaletteManager();
  bindValue("#headingFont", (value) => (deck.theme.fonts.heading = value));
  bindValue("#bodyFont", (value) => (deck.theme.fonts.body = value));
  bindToggle("#snapToggle", (value) => (deck.settings.snapToGrid = value));
  bindToggle("#guideToggle", (value) => (deck.settings.showGuides = value));
  bindToggle("#engagementToggle", (value) => {
    slide.engagement.enabled = value;
    syncAudienceJoinElements();
  });
  bindToggle("#audienceJoinElementsToggle", (value) => {
    const defaultVisible = activeSlideIndex === 0 || slide.engagement.enabled;
    slide.audienceJoinForced = value && !defaultVisible;
    slide.audienceJoinHidden = !value && defaultVisible;
    syncAudienceJoinElements();
  });
  bindEngagementType(slide);
  bindValue("#engagementPrompt", (value) => {
    slide.engagement.prompt = value;
    syncEngagementElementsFromSlide(slide);
  });
  bindEngagementOptions(slide);
  bindCorrectAnswerFields(slide);
}

function renderElementInspector(element) {
  const animation = normalizedAnimation(element);
  dom.inspector.innerHTML = `
    <section class="inspector-section">
      <strong>${escapeHtml(element.name || element.type)}</strong>
      <div class="field-row"><label for="nameInput">Name</label><input id="nameInput" value="${attr(element.name)}" /></div>
      <div class="field-grid">
        <div class="field-row"><label for="xInput">X</label><input id="xInput" type="number" value="${Math.round(element.x)}" /></div>
        <div class="field-row"><label for="yInput">Y</label><input id="yInput" type="number" value="${Math.round(element.y)}" /></div>
        <div class="field-row"><label for="wInput">W</label><input id="wInput" type="number" value="${Math.round(element.w)}" /></div>
        <div class="field-row"><label for="hInput">H</label><input id="hInput" type="number" value="${Math.round(element.h)}" /></div>
      </div>
      <div class="field-grid">
        <div class="field-row"><label for="rotationInput">Rotation</label><input id="rotationInput" type="number" value="${Math.round(element.rotation || 0)}" /></div>
        <div class="field-row opacity-field">
          <label for="opacityRange">Opacity</label>
          <div class="opacity-control">
            <input id="opacityRange" type="range" min="0" max="100" step="1" value="${opacityPercent(element.opacity)}" />
            <input id="opacityValue" type="number" min="0" max="100" step="1" value="${opacityPercent(element.opacity)}" aria-label="Opacity percent" />
            <span>%</span>
          </div>
        </div>
      </div>
      <div class="check-row"><input id="lockedInput" type="checkbox" ${element.locked ? "checked" : ""} /><label for="lockedInput">Locked</label></div>
      ${element.type === "text" ? `<div class="check-row"><input id="autoHeightInput" type="checkbox" ${element.autoHeight !== false ? "checked" : ""} /><label for="autoHeightInput">Automatically fit height to text</label></div>` : ""}
    </section>
    <section class="inspector-section">
      <strong>Animation</strong>
      <div class="field-row"><label for="animationEffectInput">Effect</label><select id="animationEffectInput">${animationOptionList([["none", "None"], ["appear", "Appear"], ["fadeIn", "Fade in"]], animation.effect)}</select></div>
      <div class="field-row"><label for="animationTriggerInput">Trigger</label><select id="animationTriggerInput">${animationOptionList([["slideStart", "On slide start"], ["onClick", "On click"], ["afterPrevious", "After previous"]], animation.trigger)}</select></div>
      <div class="field-grid">
        <div class="field-row"><label for="animationDelayInput">Delay (ms)</label><input id="animationDelayInput" type="number" min="0" step="100" value="${animation.delayMs}" /></div>
        <div class="field-row"><label for="animationDurationInput">Duration (ms)</label><input id="animationDurationInput" type="number" min="100" step="100" value="${animation.durationMs}" /></div>
        <div class="field-row"><label for="animationOrderInput">Order</label><input id="animationOrderInput" type="number" min="0" step="1" value="${animation.order}" /></div>
      </div>
      <div class="field-row"><label for="animationEasingInput">Easing</label><select id="animationEasingInput">${animationOptionList([["linear", "Linear"], ["ease", "Ease"], ["easeIn", "Ease in"], ["easeOut", "Ease out"], ["easeInOut", "Ease in/out"]], animation.easing)}</select></div>
      <button id="previewElementAnimationBtn" type="button">Preview animation</button>
    </section>
    ${brandColorElementSection([element])}
    ${elementInspectorFields(element)}
  `;

  bindValue("#nameInput", (value) => (element.name = value));
  bindNumber("#xInput", (value) => (element.x = value));
  bindNumber("#yInput", (value) => (element.y = value));
  bindNumber("#wInput", (value) => (element.w = Math.max(8, value)));
  bindNumber("#hInput", (value) => {
    element.autoHeight = false;
    element.h = Math.max(8, value);
  });
  bindNumber("#rotationInput", (value) => (element.rotation = value));
  bindOpacityControls([element]);
  bindToggle("#lockedInput", (value) => (element.locked = value));
  bindToggle("#autoHeightInput", (value) => {
    element.autoHeight = value;
    if (value) element.h = measureTextElementHeight(ctx, element, deck);
  });
  bindValue("#animationEffectInput", (value) => setElementAnimation(element, "effect", value));
  bindValue("#animationTriggerInput", (value) => setElementAnimation(element, "trigger", value));
  bindNumber("#animationDelayInput", (value) => setElementAnimation(element, "delayMs", Math.max(0, value)));
  bindNumber("#animationDurationInput", (value) => setElementAnimation(element, "durationMs", Math.max(100, value)));
  bindNumber("#animationOrderInput", (value) => setElementAnimation(element, "order", Math.max(0, Math.round(value))));
  bindValue("#animationEasingInput", (value) => setElementAnimation(element, "easing", value));
  document.querySelector("#previewElementAnimationBtn")?.addEventListener("click", () => previewElementAnimation(element));
  bindBrandColorApplication([element]);
  bindTypeFields(element);
}

function elementInspectorFields(element) {
  if (element.type === "text") {
    return `
      <section class="inspector-section">
        <strong>Text</strong>
        <div class="field-row"><label for="textInput">Content</label><textarea id="textInput">${escapeHtml(element.text || "")}</textarea></div>
        <div class="format-toolbar" role="toolbar" aria-label="Text formatting">
          <button id="boldToggle" class="format-button" type="button" aria-pressed="${(element.fontWeight || 400) >= 700}" title="Bold"><span class="format-bold">B</span></button>
          <button id="italicToggle" class="format-button" type="button" aria-pressed="${Boolean(element.italic)}" title="Italic"><span class="format-italic">I</span></button>
          <button id="underlineToggle" class="format-button" type="button" aria-pressed="${Boolean(element.underline)}" title="Underline"><span class="format-underline">U</span></button>
          <button id="bulletToggle" class="format-button" type="button" aria-pressed="${Boolean(element.bulletList)}" title="Bullet list"><span class="format-bullets">&#8226;</span></button>
        </div>
        <div class="field-grid">
          <div class="field-row"><label for="fontSizeInput">Size</label><input id="fontSizeInput" type="number" value="${element.fontSize}" /></div>
          <div class="field-row"><label for="fontWeightInput">Weight</label><input id="fontWeightInput" type="number" value="${element.fontWeight}" /></div>
          <div class="field-row"><label for="lineHeightInput">Line height</label><input id="lineHeightInput" type="text" inputmode="decimal" value="${formatLineHeight(element.lineHeight)}" /></div>
          <div class="field-row"><label for="textColorInput">Color</label><input id="textColorInput" type="color" value="${element.color}" /></div>
          <div class="field-row"><label for="alignInput">Align</label><select id="alignInput">${optionList(["left", "center", "right"], element.align)}</select></div>
        </div>
      </section>`;
  }

  if (element.type === "shape" || element.type === "divider" || element.type === "icon") {
    return `
      <section class="inspector-section">
        <strong>Style</strong>
        <div class="field-grid">
          <div class="field-row"><label for="fillInput">Fill</label><input id="fillInput" type="color" value="${element.fill || "#ffffff"}" /></div>
          <div class="field-row"><label for="strokeInput">Stroke</label><input id="strokeInput" type="color" value="${element.stroke || "#ffffff"}" /></div>
          <div class="field-row"><label for="strokeWidthInput">Stroke width</label><input id="strokeWidthInput" type="number" value="${element.strokeWidth || 0}" /></div>
          <div class="field-row"><label for="shapeInput">Shape</label><select id="shapeInput">${optionList(["roundedRect", "ellipse", "triangle"], element.shape)}</select></div>
        </div>
      </section>`;
  }

  if (element.type === "image") {
    return `
      <section class="inspector-section">
        <strong>Image</strong>
        <button id="replaceImageBtn" type="button">Replace image</button>
        <div class="field-row"><label for="altInput">Alt text</label><input id="altInput" value="${attr(element.alt)}" /></div>
        <div class="field-row"><label for="fitInput">Fit</label><select id="fitInput">${optionList(["cover", "contain"], element.fit)}</select></div>
      </section>`;
  }

  if (element.type === "chart") {
    return `
      <section class="inspector-section">
        <strong>Chart</strong>
        <div class="field-row"><label for="chartTitleInput">Title</label><input id="chartTitleInput" value="${attr(element.title)}" /></div>
        <div class="field-row"><label for="chartLabelsInput">Labels</label><textarea id="chartLabelsInput">${escapeHtml(element.labels.join("\n"))}</textarea></div>
        <div class="field-row"><label for="chartValuesInput">Values</label><textarea id="chartValuesInput">${escapeHtml(element.values.join("\n"))}</textarea></div>
        <div class="field-row"><label for="chartFillInput">Fill</label><input id="chartFillInput" type="color" value="${element.fill}" /></div>
      </section>`;
  }

  if (element.type === "table") {
    return `
      <section class="inspector-section">
        <strong>Table</strong>
        <div class="field-row"><label for="tableCellsInput">Cells, comma separated</label><textarea id="tableCellsInput">${escapeHtml(element.cells.map((row) => row.join(",")).join("\n"))}</textarea></div>
      </section>`;
  }

  if (element.type === "engagement") {
    return `
      <section class="inspector-section">
        <strong>Engagement</strong>
        <div class="field-row"><label for="engagementElementMode">Mode</label><select id="engagementElementMode">${engagementTypes.map((type) => `<option value="${type.value}" ${element.mode === type.value ? "selected" : ""}>${type.label}</option>`).join("")}</select></div>
        <div class="field-row"><label for="engagementElementPrompt">Prompt</label><input id="engagementElementPrompt" value="${attr(element.prompt)}" /></div>
        <div class="field-row"><label for="engagementElementOptions">Options</label><textarea id="engagementElementOptions">${escapeHtml((element.options || []).join("\n"))}</textarea></div>
        ${correctAnswerFieldsForElement(element)}
      </section>`;
  }

  if (element.type === "countdown") {
    return `
      <section class="inspector-section">
        <strong>Countdown</strong>
        <div class="field-grid">
          <div class="field-row"><label for="countdownMinutesInput">Minutes</label><input id="countdownMinutesInput" type="number" min="0" max="999" value="${Math.floor((element.durationSeconds || 0) / 60)}" /></div>
          <div class="field-row"><label for="countdownSecondsInput">Seconds</label><input id="countdownSecondsInput" type="number" min="0" max="59" value="${(element.durationSeconds || 0) % 60}" /></div>
          <div class="field-row"><label for="countdownFontSizeInput">Text size</label><input id="countdownFontSizeInput" type="number" min="12" max="240" value="${element.fontSize || 104}" /></div>
          <div class="field-row"><label for="countdownColorInput">Text color</label><input id="countdownColorInput" type="color" value="${element.color || "#1d232a"}" /></div>
          <div class="field-row"><label for="countdownFillInput">Background</label><input id="countdownFillInput" type="color" value="${element.fill === "transparent" ? "#ffffff" : element.fill || "#ffffff"}" /></div>
          <div class="field-row"><label for="countdownAlignInput">Align</label><select id="countdownAlignInput">${optionList(["left", "center", "right"], element.align || "center")}</select></div>
        </div>
        <div class="field-row"><label for="countdownCompletionInput">At zero</label><select id="countdownCompletionInput">${animationOptionList([["zero", "Remain at 00:00"], ["message", "Show a message"]], element.completionBehavior || "message")}</select></div>
        <div class="field-row"><label for="countdownMessageInput">Completion message</label><input id="countdownMessageInput" value="${attr(element.completionMessage || "Break is over")}" /></div>
        <div class="check-row"><input id="countdownAutoStartInput" type="checkbox" ${element.autoStart ? "checked" : ""} /><label for="countdownAutoStartInput">Start when slide appears</label></div>
        <div class="check-row"><input id="countdownAutoAdvanceInput" type="checkbox" ${element.autoAdvance ? "checked" : ""} /><label for="countdownAutoAdvanceInput">Advance to next slide at zero</label></div>
        <p class="field-help">The timer is controlled live from Presenter View. Editor and filmstrip previews show its starting duration.</p>
      </section>`;
  }

  return "";
}

function bindTypeFields(element) {
  if (element.type === "text") {
    bindValue("#textInput", (value) => (element.text = value));
    bindNumber("#fontSizeInput", (value) => (element.fontSize = value));
    bindNumber("#fontWeightInput", (value) => (element.fontWeight = value));
    bindLineHeightInput("#lineHeightInput", element);
    bindValue("#textColorInput", (value) => {
      element.brandColorStyleId = null;
      element.color = value;
    });
    bindValue("#alignInput", (value) => (element.align = value));
    bindTextFormatButton("#boldToggle", () => {
      element.fontWeight = (element.fontWeight || 400) >= 700 ? 500 : 800;
    });
    bindTextFormatButton("#italicToggle", () => {
      element.italic = !element.italic;
    });
    bindTextFormatButton("#underlineToggle", () => {
      element.underline = !element.underline;
    });
    bindTextFormatButton("#bulletToggle", () => {
      element.bulletList = !element.bulletList;
    });
  }

  if (element.type === "shape" || element.type === "divider" || element.type === "icon") {
    bindValue("#fillInput", (value) => {
      element.brandColorStyleId = null;
      element.fill = value;
    });
    bindValue("#strokeInput", (value) => (element.stroke = value));
    bindNumber("#strokeWidthInput", (value) => (element.strokeWidth = value));
    bindValue("#shapeInput", (value) => (element.shape = value));
  }

  if (element.type === "image") {
    document.querySelector("#replaceImageBtn")?.addEventListener("click", () => {
      dom.imageInput.dataset.replaceId = element.id;
      dom.imageInput.click();
    });
    bindValue("#altInput", (value) => (element.alt = value));
    bindValue("#fitInput", (value) => (element.fit = value));
  }

  if (element.type === "chart") {
    bindValue("#chartTitleInput", (value) => (element.title = value));
    bindValue("#chartLabelsInput", (value) => (element.labels = value.split(/\n/).filter(Boolean)));
    bindValue("#chartValuesInput", (value) => (element.values = value.split(/\n/).map(Number).filter((number) => !Number.isNaN(number))));
    bindValue("#chartFillInput", (value) => {
      element.brandColorStyleId = null;
      element.fill = value;
    });
  }

  if (element.type === "table") {
    bindValue("#tableCellsInput", (value) => {
      element.cells = value.split(/\n/).map((row) => row.split(",").map((cell) => cell.trim()));
      element.rows = element.cells.length;
      element.cols = Math.max(...element.cells.map((row) => row.length));
    });
  }

  if (element.type === "engagement") {
    bindEngagementElementFields(element);
  }

  if (element.type === "countdown") {
    const updateDuration = () => {
      const minutes = Math.max(0, Number(document.querySelector("#countdownMinutesInput")?.value) || 0);
      const seconds = Math.max(0, Math.min(59, Number(document.querySelector("#countdownSecondsInput")?.value) || 0));
      element.durationSeconds = minutes * 60 + seconds;
      markChanged("Countdown duration updated");
      renderCanvas();
    };
    document.querySelector("#countdownMinutesInput")?.addEventListener("change", updateDuration);
    document.querySelector("#countdownSecondsInput")?.addEventListener("change", updateDuration);
    bindNumber("#countdownFontSizeInput", (value) => (element.fontSize = Math.max(12, value)));
    bindValue("#countdownColorInput", (value) => (element.color = value));
    bindValue("#countdownFillInput", (value) => (element.fill = value));
    bindValue("#countdownAlignInput", (value) => (element.align = value));
    bindValue("#countdownCompletionInput", (value) => (element.completionBehavior = value));
    bindValue("#countdownMessageInput", (value) => (element.completionMessage = value));
    bindToggle("#countdownAutoStartInput", (value) => (element.autoStart = value));
    bindToggle("#countdownAutoAdvanceInput", (value) => (element.autoAdvance = value));
  }
}

function renderMultiInspector(selected) {
  const bounds = boundsForElements(selected);
  const averageOpacity = selected.length
    ? opacityPercent(selected.reduce((total, element) => total + (element.opacity ?? 1), 0) / selected.length)
    : 100;
  dom.inspector.innerHTML = `
    <section class="inspector-section">
      <strong>${selected.length} elements selected</strong>
      <div class="field-grid">
        <div class="field-row"><label>X</label><input readonly value="${Math.round(bounds.x)}" /></div>
        <div class="field-row"><label>Y</label><input readonly value="${Math.round(bounds.y)}" /></div>
        <div class="field-row"><label>W</label><input readonly value="${Math.round(bounds.w)}" /></div>
        <div class="field-row"><label>H</label><input readonly value="${Math.round(bounds.h)}" /></div>
        <div class="field-row opacity-field">
          <label for="opacityRange">Opacity</label>
          <div class="opacity-control">
            <input id="opacityRange" type="range" min="0" max="100" step="1" value="${averageOpacity}" />
            <input id="opacityValue" type="number" min="0" max="100" step="1" value="${averageOpacity}" aria-label="Opacity percent" />
            <span>%</span>
          </div>
        </div>
      </div>
      <button id="groupSelectedBtn" type="button">Group selected</button>
      <button id="ungroupSelectedBtn" type="button">Ungroup selected</button>
      <button id="lockSelectedBtn" type="button">Lock selected</button>
    </section>
    ${brandColorElementSection(selected)}
  `;
  document.querySelector("#groupSelectedBtn").addEventListener("click", groupSelection);
  document.querySelector("#ungroupSelectedBtn").addEventListener("click", ungroupSelection);
  document.querySelector("#lockSelectedBtn").addEventListener("click", toggleLockSelection);
  bindOpacityControls(selected);
  bindBrandColorApplication(selected);
}

function brandColorStyles() {
  deck.theme.brandColorStyles ||= (deck.theme.brandPalette || []).map((color, index) => ({
    id: `brand-${String(color).replace("#", "")}-${index + 1}`,
    name: `Brand ${index + 1}`,
    color: normalizeHexColor(color) || "#2454d6",
  }));
  deck.theme.brandPalette = deck.theme.brandColorStyles.map((style) => style.color);
  return deck.theme.brandColorStyles;
}

function normalizeHexColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null;
}

function brandPaletteManagerMarkup() {
  const styles = brandColorStyles();
  const swatches = styles.length
    ? styles
        .map(
          (style) => `
            <div class="brand-style-row" data-brand-style-row="${attr(style.id)}">
              <input class="brand-style-color" type="color" value="${attr(style.color)}" data-brand-style-color="${attr(style.id)}" aria-label="${attr(style.name)} color" />
              <input class="brand-style-name" type="text" value="${attr(style.name)}" data-brand-style-name="${attr(style.id)}" aria-label="Color style name" />
              <button class="swatch-remove" type="button" data-palette-remove="${attr(style.id)}" title="Delete ${attr(style.name)}" aria-label="Delete ${attr(style.name)}">×</button>
            </div>
          `
        )
        .join("")
    : `<span class="brand-palette-empty">No saved color styles yet.</span>`;
  return `<div class="brand-style-list">${swatches}</div>`;
}

function brandColorElementSection(elements) {
  const targets = elements.filter(canApplyBrandColor);
  if (!targets.length) {
    return "";
  }

  const styles = brandColorStyles();
  const currentColor = elementBrandColor(targets[0]) || deck.theme.colors.primary;
  const swatches = styles.length
    ? styles
        .map(
          (style) =>
            `<button class="brand-style-chip ${targets.every((element) => element.brandColorStyleId === style.id) ? "active" : ""}" type="button" data-apply-brand-style="${attr(style.id)}" title="Apply ${attr(style.name)}" aria-label="Apply ${attr(style.name)}"><span class="swatch" style="background: ${attr(style.color)}"></span><span>${escapeHtml(style.name)}</span></button>`
        )
        .join("")
    : `<span class="brand-palette-empty">Create color styles under Theme.</span>`;

  return `
    <section class="inspector-section">
      <strong>Color styles</strong>
      <div class="brand-color-save">
        <input id="selectedBrandColorInput" type="color" value="${attr(currentColor)}" />
        <button id="saveSelectedBrandColorBtn" type="button">Save current</button>
      </div>
      <div class="brand-style-chips">${swatches}</div>
      ${targets.some((element) => element.brandColorStyleId) ? '<button id="unlinkBrandColorBtn" type="button">Unlink color style</button>' : ""}
    </section>
  `;
}

function bindBrandPaletteManager() {
  const input = document.querySelector("#brandColorInput");
  document.querySelector("#saveBrandColorBtn")?.addEventListener("click", () => {
    saveBrandColor(input?.value);
  });

  document.querySelectorAll("[data-brand-style-name]").forEach((nameInput) => {
    nameInput.addEventListener("input", () => updateBrandColorStyle(nameInput.dataset.brandStyleName, { name: nameInput.value }, false));
  });

  document.querySelectorAll("[data-brand-style-color]").forEach((colorInput) => {
    colorInput.addEventListener("input", () => updateBrandColorStyle(colorInput.dataset.brandStyleColor, { color: colorInput.value }, false));
  });

  document.querySelectorAll("[data-palette-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      removeBrandColorStyle(button.dataset.paletteRemove);
    });
  });
}

function bindBrandColorApplication(elements) {
  const targets = elements.filter(canApplyBrandColor);
  if (!targets.length) {
    return;
  }

  document.querySelector("#saveSelectedBrandColorBtn")?.addEventListener("click", () => {
    const color = document.querySelector("#selectedBrandColorInput")?.value || elementBrandColor(targets[0]);
    saveBrandColor(color);
  });

  document.querySelectorAll("[data-apply-brand-style]").forEach((button) => {
    button.addEventListener("click", () => {
      applyBrandColorStyleToElements(targets, button.dataset.applyBrandStyle);
    });
  });
  document.querySelector("#unlinkBrandColorBtn")?.addEventListener("click", () => unlinkBrandColorStyle(targets));
}

function saveBrandColor(value) {
  const color = normalizeHexColor(value);
  if (!color) {
    setStatus("Use a valid hex color");
    return;
  }

  const existing = brandColorStyles().find((style) => style.color === color);
  if (!existing) {
    deck.theme.brandColorStyles = [
      ...brandColorStyles(),
      { id: `brand-${Date.now().toString(36)}`, name: `Brand ${brandColorStyles().length + 1}`, color },
    ].slice(0, 24);
  }
  deck.theme.brandPalette = brandColorStyles().map((style) => style.color);
  markChanged(existing ? "Color style already saved" : "Color style saved");
  renderAll();
}

function updateBrandColorStyle(styleId, updates, rerender = true) {
  const style = brandColorStyles().find((item) => item.id === styleId);
  if (!style) return;
  if (typeof updates.name === "string") style.name = updates.name.trimStart() || "Untitled color";
  if (updates.color) style.color = normalizeHexColor(updates.color) || style.color;
  deck.theme.brandPalette = brandColorStyles().map((item) => item.color);
  markChanged("Color style updated");
  renderCanvas();
  renderSlides();
  if (presenterOpen) renderPresenter();
  if (audienceOpen) renderAudience();
  if (rerender) renderInspector();
}

function removeBrandColorStyle(styleId) {
  const style = brandColorStyles().find((item) => item.id === styleId);
  if (!style) return;
  for (const slide of deck.slides) {
    for (const element of slide.elements) {
      if (element.brandColorStyleId === styleId) {
        setElementBrandColor(element, style.color);
        element.brandColorStyleId = null;
      }
    }
  }
  deck.theme.brandColorStyles = brandColorStyles().filter((item) => item.id !== styleId);
  deck.theme.brandPalette = deck.theme.brandColorStyles.map((item) => item.color);
  markChanged("Color style deleted; linked elements kept their color");
  renderAll();
}

function canApplyBrandColor(element) {
  return ["text", "shape", "divider", "icon", "chart", "table", "engagement"].includes(element.type);
}

function elementBrandColor(element) {
  const linkedStyle = brandColorStyles().find((style) => style.id === element.brandColorStyleId);
  if (linkedStyle) return linkedStyle.color;
  if (element.type === "text") {
    return element.color;
  }
  if (element.type === "table") {
    return element.headerFill;
  }
  if (element.type === "engagement") {
    return element.accent;
  }
  return element.fill;
}

function applyBrandColorStyleToElements(elements, styleId) {
  const style = brandColorStyles().find((item) => item.id === styleId);
  if (!style) return;
  elements.forEach((element) => {
    element.brandColorStyleId = styleId;
    setElementBrandColor(element, style.color);
  });
  markChanged(`${style.name} color style linked`);
  renderAll();
}

function unlinkBrandColorStyle(elements) {
  elements.forEach((element) => {
    const style = brandColorStyles().find((item) => item.id === element.brandColorStyleId);
    if (style) setElementBrandColor(element, style.color);
    element.brandColorStyleId = null;
  });
  markChanged("Color style unlinked");
  renderAll();
}

function setElementBrandColor(element, color) {
  if (element.type === "text") element.color = color;
  else if (element.type === "table") element.headerFill = color;
  else if (element.type === "engagement") element.accent = color;
  else element.fill = color;
}

function correctAnswerFields(engagement) {
  if (!["multipleChoice", "quiz"].includes(engagement.type)) {
    return "";
  }

  const options = engagement.options || [];
  const correctAnswers = new Set(engagement.correctAnswers || []);
  const optionFields = options.length
    ? options
        .map(
          (option) => `
            <label class="answer-key-option">
              <input type="checkbox" data-correct-answer="${attr(option)}" ${correctAnswers.has(option) ? "checked" : ""} />
              <span>${escapeHtml(option)}</span>
            </label>
          `
        )
        .join("")
    : `<span class="answer-key-empty">Add options above, then mark the correct answer.</span>`;

  return `
    <div class="field-row">
      <label>Correct answers</label>
      <div class="answer-key-list">${optionFields}</div>
    </div>
    <div class="check-row">
      <input id="showCorrectAnswerToggle" type="checkbox" ${engagement.showCorrectAnswer ? "checked" : ""} />
      <label for="showCorrectAnswerToggle">Show correct answer after response</label>
    </div>
  `;
}

function correctAnswerFieldsForElement(element) {
  if (!["multipleChoice", "quiz"].includes(element.mode)) {
    return "";
  }

  const options = element.options || [];
  const correctAnswers = new Set(element.correctAnswers || []);
  const optionFields = options.length
    ? options
        .map(
          (option) => `
            <label class="answer-key-option">
              <input type="checkbox" data-element-correct-answer="${attr(option)}" ${correctAnswers.has(option) ? "checked" : ""} />
              <span>${escapeHtml(option)}</span>
            </label>
          `
        )
        .join("")
    : `<span class="answer-key-empty">Add options above, then mark the correct answer.</span>`;

  return `
    <div class="field-row">
      <label>Correct answers</label>
      <div class="answer-key-list">${optionFields}</div>
    </div>
    <div class="check-row">
      <input id="engagementElementReveal" type="checkbox" ${element.showCorrectAnswer ? "checked" : ""} />
      <label for="engagementElementReveal">Show correct answer after response</label>
    </div>
  `;
}

function onPointerDown(event) {
  dom.canvas.setPointerCapture(event.pointerId);
  dom.canvas.focus();
  closeTextEditor();
  const slide = currentSlide();
  const point = canvasPoint(event);
  const selected = selectedElements();
  const bounds = boundsForElements(selected);
  const handle = hitTestHandle(bounds, point, 8 / zoom);

  if (handle && selected.length) {
    dragState = {
      type: "resize",
      handle,
      start: point,
      bounds,
      originals: selected.map(snapshotElement),
    };
    return;
  }

  const element = hitTest(slide, point);
  if (!element) {
    selectedIds = [];
    renderAll();
    return;
  }

  if (event.shiftKey) {
    selectedIds = selectedIds.includes(element.id)
      ? selectedIds.filter((id) => id !== element.id)
      : [...selectedIds, element.id];
  } else if (element.groupId) {
    selectedIds = slide.elements.filter((item) => item.groupId === element.groupId).map((item) => item.id);
  } else if (!selectedIds.includes(element.id)) {
    selectedIds = [element.id];
  }

  const affected = selectedElements();
  dragState = {
    type: "move",
    start: point,
    bounds: boundsForElements(affected),
    originals: affected.map(snapshotElement),
  };
  renderAll();
}

function onPointerMove(event) {
  const point = canvasPoint(event);
  const selected = selectedElements();
  const bounds = boundsForElements(selected);
  const handle = hitTestHandle(bounds, point, 8 / zoom);
  dom.canvas.style.cursor = handle ? `${handle}-resize` : hitTest(currentSlide(), point) ? "move" : "default";

  if (!dragState) {
    return;
  }

  if (dragState.type === "move") {
    const dx = point.x - dragState.start.x;
    const dy = point.y - dragState.start.y;
    const proposed = {
      ...dragState.bounds,
      x: dragState.bounds.x + dx,
      y: dragState.bounds.y + dy,
    };
    const snapped = snapBounds(proposed, dragState.originals.map((item) => item.id));
    applyMove(dragState.originals, snapped.x - dragState.bounds.x, snapped.y - dragState.bounds.y);
  }

  if (dragState.type === "resize") {
    const resized = resizeBounds(dragState.bounds, dragState.handle, point.x - dragState.start.x, point.y - dragState.start.y);
    const snapped = snapBounds(resized, dragState.originals.map((item) => item.id));
    applyResize(dragState.originals, dragState.bounds, snapped, dragState.handle);
  }

  renderCanvas();
}

function onPointerUp() {
  if (dragState) {
    dragState = null;
    guides = [];
    markChanged("Selection updated");
    renderAll();
  }
}

function openTextEditor() {
  const element = selectedElements()[0];
  if (!element || element.type !== "text" || element.locked) {
    return;
  }
  const canvasRect = dom.canvas.getBoundingClientRect();
  const viewportRect = dom.viewport.getBoundingClientRect();
  dom.textEditor.dataset.elementId = element.id;
  dom.textEditor.innerText = textForInlineEditor(element);
  dom.textEditor.style.left = `${canvasRect.left - viewportRect.left + element.x * zoom}px`;
  dom.textEditor.style.top = `${canvasRect.top - viewportRect.top + element.y * zoom}px`;
  dom.textEditor.style.width = `${element.w * zoom}px`;
  dom.textEditor.style.height = `${element.h * zoom}px`;
  dom.textEditor.style.fontSize = `${Math.max(12, element.fontSize * zoom)}px`;
  dom.textEditor.style.fontWeight = element.fontWeight || 500;
  dom.textEditor.style.fontStyle = element.italic ? "italic" : "normal";
  dom.textEditor.style.textDecoration = element.underline ? "underline" : "none";
  dom.textEditor.style.lineHeight = element.lineHeight || 1.18;
  dom.textEditor.classList.toggle("bulleted", Boolean(element.bulletList));
  dom.textEditor.classList.add("open");
  dom.textEditor.focus();
}

function closeTextEditor() {
  if (!dom.textEditor.classList.contains("open")) {
    return;
  }
  const element = currentSlide().elements.find((item) => item.id === dom.textEditor.dataset.elementId);
  if (element) {
    element.text = textFromInlineEditor(dom.textEditor.innerText, element);
    markChanged("Text updated");
  }
  dom.textEditor.classList.remove("open");
  dom.textEditor.classList.remove("bulleted");
  dom.textEditor.dataset.elementId = "";
  renderAll();
}

function handleTextEditorBulletKeys(event) {
  const element = currentSlide().elements.find((item) => item.id === dom.textEditor.dataset.elementId);
  if (!element || element.type !== "text") {
    return false;
  }

  if (event.key === " " && !event.altKey && !event.ctrlKey && !event.metaKey) {
    return triggerBulletListFromAsterisk(event, element);
  }

  if (event.key === "Enter" && element.bulletList && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    event.preventDefault();
    insertTextIntoInlineEditor(`\n${BULLET_EDITOR_PREFIX}`);
    return true;
  }

  return false;
}

function triggerBulletListFromAsterisk(event, element) {
  const selection = inlineEditorSelection();
  if (!selection || selection.start !== selection.end) {
    return false;
  }

  const text = normalizedInlineEditorText();
  const before = text.slice(0, selection.start);
  const after = text.slice(selection.end);
  const lineStart = before.lastIndexOf("\n") + 1;
  const linePrefix = before.slice(lineStart);
  if (!/^\s*\*$/.test(linePrefix)) {
    return false;
  }

  event.preventDefault();
  const leading = linePrefix.match(/^\s*/)?.[0] || "";
  const updated = `${before.slice(0, lineStart)}${leading}${BULLET_EDITOR_PREFIX}${after}`;
  const caretOffset = lineStart + leading.length + BULLET_EDITOR_PREFIX.length;
  element.bulletList = true;
  element.text = textFromInlineEditor(updated, element);
  dom.textEditor.classList.add("bulleted");
  setInlineEditorTextAndCaret(updated, caretOffset);
  markChanged("Bullet list started");
  renderCanvas();
  renderInspector();
  return true;
}

function textForInlineEditor(element) {
  const text = String(element.text || "");
  if (!element.bulletList) {
    return text;
  }
  return text
    .split("\n")
    .map((line) => (line.trim() ? `${BULLET_EDITOR_PREFIX}${stripBulletMarker(line)}` : ""))
    .join("\n");
}

function textFromInlineEditor(value, element) {
  const text = String(value || "").replace(/\u00a0/g, " ");
  return element.bulletList
    ? text.split("\n").map(stripBulletMarker).join("\n")
    : text;
}

function stripBulletMarker(line) {
  return String(line).replace(/^\s*(?:\u2022|\*)\s?/, "");
}

function normalizedInlineEditorText() {
  return dom.textEditor.innerText.replace(/\u00a0/g, " ");
}

function inlineEditorSelection() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (!dom.textEditor.contains(range.startContainer) || !dom.textEditor.contains(range.endContainer)) {
    return null;
  }
  const startRange = range.cloneRange();
  startRange.selectNodeContents(dom.textEditor);
  startRange.setEnd(range.startContainer, range.startOffset);
  const endRange = range.cloneRange();
  endRange.selectNodeContents(dom.textEditor);
  endRange.setEnd(range.endContainer, range.endOffset);
  return {
    start: startRange.toString().length,
    end: endRange.toString().length,
  };
}

function insertTextIntoInlineEditor(value) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }
  const range = selection.getRangeAt(0);
  if (!dom.textEditor.contains(range.startContainer) || !dom.textEditor.contains(range.endContainer)) {
    return;
  }

  range.deleteContents();
  const node = document.createTextNode(value);
  range.insertNode(node);
  range.setStart(node, value.length);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function setInlineEditorTextAndCaret(text, caretOffset) {
  dom.textEditor.innerText = text;
  dom.textEditor.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  const walker = document.createTreeWalker(dom.textEditor, NodeFilter.SHOW_TEXT);
  let remaining = caretOffset;
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent.length;
    if (remaining <= length) {
      range.setStart(node, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  range.selectNodeContents(dom.textEditor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function onCanvasDrop(event) {
  event.preventDefault();
  const file = [...event.dataTransfer.files].find((item) => item.type.startsWith("image/"));
  if (file) {
    addImageFromFile(file, canvasPoint(event));
  }
}

function addElement(type) {
  if (type === "image") {
    dom.imageInput.dataset.replaceId = "";
    dom.imageInput.click();
    return;
  }
  const center = {
    x: SLIDE_SIZE.width / 2 - 180,
    y: SLIDE_SIZE.height / 2 - 80,
  };
  if (type === "engagement") {
    const slide = currentSlide();
    ensureEngagement(slide);
    slide.engagement.enabled = true;
    const element = createElement("engagement", {
      ...center,
      mode: slide.engagement.type,
      prompt: slide.engagement.prompt,
      options: [...slide.engagement.options],
      correctAnswers: [...(slide.engagement.correctAnswers || [])],
      showCorrectAnswer: slide.engagement.showCorrectAnswer,
    });
    slide.elements.push(element);
    syncSlideEngagementFromElement(element);
    selectedIds = [element.id];
    markChanged("Engagement added");
    renderAll();
    return;
  }
  const element = createElement(type, center);
  currentSlide().elements.push(element);
  selectedIds = [element.id];
  markChanged(`${type} added`);
  renderAll();
}

function addImageFromFile(file, point = null) {
  const reader = new FileReader();
  reader.onload = () => {
    const replaceId = dom.imageInput.dataset.replaceId;
    if (replaceId) {
      const element = currentSlide().elements.find((item) => item.id === replaceId);
      if (element) {
        element.src = reader.result;
        element.alt = file.name;
        selectedIds = [element.id];
      }
    } else {
      const element = createElement("image", {
        x: point ? point.x - 160 : 460,
        y: point ? point.y - 90 : 250,
        w: 320,
        h: 180,
        src: reader.result,
        alt: file.name,
        name: file.name,
      });
      currentSlide().elements.push(element);
      selectedIds = [element.id];
    }
    dom.imageInput.dataset.replaceId = "";
    markChanged("Image added");
    renderAll();
  };
  reader.readAsDataURL(file);
}

function deleteSelection() {
  if (!selectedIds.length) {
    return;
  }
  const slide = currentSlide();
  const protectedJoinElementSelected = slide.elements.some(
    (element) => selectedIds.includes(element.id) && element.audienceJoinRole
  );
  slide.elements = slide.elements.filter(
    (element) => !selectedIds.includes(element.id) || element.locked || element.audienceJoinRole
  );
  selectedIds = [];
  markChanged(protectedJoinElementSelected ? "Join elements can be hidden from Slide settings" : "Selection deleted");
  renderAll();
}

function toggleSelectedTextFormat(format) {
  const textElements = selectedElements().filter((element) => element.type === "text" && !element.locked);
  if (!textElements.length) {
    return;
  }

  if (format === "b") {
    const shouldBold = !textElements.every((element) => (element.fontWeight || 400) >= 700);
    textElements.forEach((element) => {
      element.fontWeight = shouldBold ? 800 : 500;
    });
  } else if (format === "i") {
    const shouldItalic = !textElements.every((element) => element.italic);
    textElements.forEach((element) => {
      element.italic = shouldItalic;
    });
  } else if (format === "u") {
    const shouldUnderline = !textElements.every((element) => element.underline);
    textElements.forEach((element) => {
      element.underline = shouldUnderline;
    });
  }

  markChanged("Text formatting updated");
  renderAll();
}

function deleteSlides(indexes, options = {}) {
  const selected = selectedSlideIndexesSorted(new Set(indexes)).filter((index) => index >= 0 && index < deck.slides.length);
  if (!selected.length) {
    return false;
  }

  if (deck.slides.length <= 1 || selected.length >= deck.slides.length) {
    setStatus("Deck needs at least one slide");
    return false;
  }

  const message = selected.length === 1
    ? `Delete slide ${selected[0] + 1}: "${deck.slides[selected[0]]?.title || "Untitled slide"}"?`
    : `Delete ${selected.length} selected slides (${formatSlideNumbers(selected)})?`;
  if (options.confirm !== false && !window.confirm(options.message || message)) {
    return false;
  }

  const deleted = new Set(selected);
  const activeSlideId = currentSlide()?.id;
  const firstDeleted = selected[0];
  deck.slides = deck.slides.filter((_, index) => !deleted.has(index));
  openSlideMenuIndex = null;
  openSectionMenuId = null;
  pruneEmptySections();

  activeSlideIndex = deck.slides.findIndex((slide) => slide.id === activeSlideId);
  if (activeSlideIndex < 0) {
    activeSlideIndex = Math.min(firstDeleted, deck.slides.length - 1);
  }
  selectedSlideIndexes = new Set([activeSlideIndex]);
  slideSelectionAnchor = activeSlideIndex;
  selectedIds = [];
  markChanged(options.status || (selected.length === 1 ? "Slide deleted" : `${selected.length} slides deleted`));
  renderAll();
  return true;
}

function formatSlideNumbers(indexes) {
  const ranges = [];
  let start = null;
  let previous = null;
  for (const index of indexes) {
    const number = index + 1;
    if (start === null) {
      start = number;
      previous = number;
    } else if (number === previous + 1) {
      previous = number;
    } else {
      ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
      start = number;
      previous = number;
    }
  }
  if (start !== null) {
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
  }
  return ranges.join(", ");
}

function duplicateSelection() {
  const copies = selectedElements().filter((item) => !item.locked).map(cloneElement);
  if (!copies.length) {
    return;
  }
  currentSlide().elements.push(...copies);
  selectedIds = copies.map((item) => item.id);
  markChanged("Selection duplicated");
  renderAll();
}

function groupSelection() {
  const selected = selectedElements();
  if (selected.length < 2) {
    return;
  }
  const groupId = `group_${Date.now()}`;
  selected.forEach((element) => {
    element.groupId = groupId;
  });
  markChanged("Selection grouped");
  renderAll();
}

function ungroupSelection() {
  selectedElements().forEach((element) => {
    element.groupId = null;
  });
  markChanged("Selection ungrouped");
  renderAll();
}

function toggleLockSelection() {
  const selected = selectedElements();
  const shouldLock = selected.some((element) => !element.locked);
  selected.forEach((element) => {
    element.locked = shouldLock;
  });
  markChanged(shouldLock ? "Selection locked" : "Selection unlocked");
  renderAll();
}

function centerSelection(axis) {
  const movable = selectedElements().filter((element) => !element.locked);
  if (!movable.length) {
    return;
  }

  const bounds = boundsForElements(movable);
  if (!bounds) {
    return;
  }

  if (axis === "horizontal") {
    const dx = SLIDE_SIZE.width / 2 - (bounds.x + bounds.w / 2);
    movable.forEach((element) => {
      element.x += dx;
    });
  } else {
    const dy = SLIDE_SIZE.height / 2 - (bounds.y + bounds.h / 2);
    movable.forEach((element) => {
      element.y += dy;
    });
  }

  markChanged(axis === "horizontal" ? "Centered horizontally" : "Centered vertically");
  renderAll();
}

function moveLayer(direction) {
  const slide = currentSlide();
  const ids = new Set(selectedIds);
  if (!ids.size) {
    return;
  }
  if (direction > 0) {
    for (let i = slide.elements.length - 2; i >= 0; i -= 1) {
      if (ids.has(slide.elements[i].id) && !ids.has(slide.elements[i + 1].id)) {
        [slide.elements[i], slide.elements[i + 1]] = [slide.elements[i + 1], slide.elements[i]];
      }
    }
  } else {
    for (let i = 1; i < slide.elements.length; i += 1) {
      if (ids.has(slide.elements[i].id) && !ids.has(slide.elements[i - 1].id)) {
        [slide.elements[i], slide.elements[i - 1]] = [slide.elements[i - 1], slide.elements[i]];
      }
    }
  }
  markChanged(direction > 0 ? "Moved forward" : "Moved backward");
  renderAll();
}

function sendLayer(position) {
  const slide = currentSlide();
  const ids = new Set(selectedIds);
  if (!ids.size) {
    return;
  }

  const moving = [];
  const remaining = [];
  for (const element of slide.elements) {
    if (ids.has(element.id)) {
      moving.push(element);
    } else {
      remaining.push(element);
    }
  }

  if (!moving.length) {
    return;
  }

  slide.elements = position === "front"
    ? [...remaining, ...moving]
    : [...moving, ...remaining];
  markChanged(position === "front" ? "Sent to front" : "Sent to back");
  renderAll();
}

function onKeyDown(event) {
  if (isTyping(event.target)) {
    return;
  }
  const shortcut = event.metaKey || event.ctrlKey;
  if (presenterOpen && ["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(event.key)) {
    event.preventDefault();
    advancePresenter();
    return;
  }
  if (presenterOpen && ["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
    event.preventDefault();
    stepSlide(-1);
    return;
  }
  if (shortcut && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redoEdit();
    else undoEdit();
  } else if (shortcut && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redoEdit();
  } else if (shortcut && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveDeck(deck).then((saved) => {
      deck = saved;
      setStatus("Deck saved");
    });
  } else if (shortcut && ["b", "i", "u"].includes(event.key.toLowerCase())) {
    event.preventDefault();
    toggleSelectedTextFormat(event.key.toLowerCase());
  } else if (shortcut && event.key.toLowerCase() === "d") {
    event.preventDefault();
    duplicateSelection();
  } else if (shortcut && event.key.toLowerCase() === "g") {
    event.preventDefault();
    groupSelection();
  } else if (shortcut && event.key.toLowerCase() === "l") {
    event.preventDefault();
    toggleLockSelection();
  } else if (shortcut && event.key.toLowerCase() === "c") {
    clipboard = selectedElements().map((item) => JSON.parse(JSON.stringify(item)));
  } else if (shortcut && event.key.toLowerCase() === "v") {
    const pasted = clipboard.map(cloneElement);
    currentSlide().elements.push(...pasted);
    selectedIds = pasted.map((item) => item.id);
    markChanged("Pasted");
    renderAll();
  } else if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    if (selectedIds.length) {
      deleteSelection();
    } else if (isSlideNavigatorTarget(event.target)) {
      deleteSlides(selectedSlideIndexesSorted());
    }
  } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    selectedElements().forEach((element) => {
      if (!element.locked) {
        element.x += dx;
        element.y += dy;
      }
    });
    markChanged("Selection nudged");
    renderAll();
  } else if (event.key === "Escape") {
    if (openSlideMenuIndex !== null || openSectionMenuId !== null) {
      openSlideMenuIndex = null;
      openSectionMenuId = null;
      renderSlides();
    } else if (!dom.sessionHistoryOverlay.classList.contains("hidden")) {
      closeSessionHistory();
    } else if (!dom.deckLibraryOverlay.classList.contains("hidden")) {
      closeDeckLibrary();
    } else if (presenterOpen) {
      closePresenter();
    } else if (audienceOpen) {
      closeAudience();
    } else {
      selectedIds = [];
      renderAll();
    }
  }
}

function launchPresenterWindow() {
  presenterWindow = window.open(
    `${location.href.split("#")[0]}#presenter`,
    "_blank"
  );
  if (!presenterWindow) {
    setStatus("Allow HySlides to open presenter mode in a new tab");
    return;
  }
  presenterWindow.focus();
  saveDeck(deck).catch(() => null);
  sendPresenterSnapshot();
  setTimeout(sendPresenterSnapshot, 500);
}

function openPresentationWindow() {
  presentationWindow = window.open(`${location.href.split("#")[0]}#presentation`, "_blank");
  if (!presentationWindow) {
    setStatus("Allow HySlides to open Presentation View in a new tab");
    return;
  }
  presentationWindow.focus();
  sendPresenterSnapshot();
  setTimeout(sendPresenterSnapshot, 400);
}

function openPresenterMode() {
  presenterOpen = true;
  if (!presentationWindowMode) startLiveSession();
  if (!presenterStartedAt) resetPresenterTimer();
  dom.presenterOverlay.classList.remove("hidden");
  dom.presenterOverlay.setAttribute("aria-hidden", "false");
  dom.app.dataset.mode = "present";
  renderPresenter();
}

function closePresenter() {
  presenterOpen = false;
  stopLiveSession();
  dom.presenterOverlay.classList.add("hidden");
  dom.presenterOverlay.setAttribute("aria-hidden", "true");
  dom.app.dataset.mode = "edit";
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  }
  clearInterval(presenterTimerInterval);
  presenterTimerInterval = 0;
  clearInterval(countdownTickInterval);
  countdownTickInterval = 0;
  if (presenterWindowMode || presentationWindowMode) {
    window.close();
  }
}

function resetPresenterTimer() {
  presenterStartedAt = Date.now();
  updatePresenterTimer();
  clearInterval(presenterTimerInterval);
  presenterTimerInterval = window.setInterval(updatePresenterTimer, 1000);
}

function updatePresenterTimer() {
  if (!dom.presenterTimer || !presenterStartedAt) return;
  const seconds = Math.max(0, Math.floor((Date.now() - presenterStartedAt) / 1000));
  dom.presenterTimer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function togglePresentationBlackout() {
  presentationBlackout = !presentationBlackout;
  applyPresentationBlackout();
  presenterChannel?.postMessage({ type: "presentation-blackout", value: presentationBlackout });
}

function applyPresentationBlackout() {
  dom.presentationBlackout?.classList.toggle("hidden", !presentationBlackout || !presentationWindowMode);
  const button = document.querySelector("#blackoutPresentationBtn");
  button?.setAttribute("aria-pressed", String(presentationBlackout));
  if (button) button.textContent = presentationBlackout ? "Resume screen" : "Black screen";
}

function bindPresenterChannel() {
  if (!presenterChannel) {
    return;
  }
  presenterChannel.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.type === "view-ready") {
      sendPresenterSnapshot();
    }
    if (message.type === "presenter-snapshot" && (presenterWindowMode || presentationWindowMode) && message.deck) {
      deck = normalizeDeck(message.deck);
      activeSlideIndex = Math.max(0, Math.min(deck.slides.length - 1, Number(message.activeSlideIndex) || 0));
      skippedSlideIds = new Set(message.skippedSlideIds || []);
      presentationBlackout = Boolean(message.presentationBlackout);
      applyCountdownState(message.countdownStates || {});
      selectedSlideIndexes = new Set([activeSlideIndex]);
      renderAll();
      applyPresentationBlackout();
      queueLivePublish(true);
    }
    if (message.type === "active-slide" && message.source !== window.name) {
      activeSlideIndex = Math.max(0, Math.min(deck.slides.length - 1, Number(message.activeSlideIndex) || 0));
      selectedSlideIndexes = new Set([activeSlideIndex]);
      renderAll();
    }
    if (message.type === "skip-state") {
      skippedSlideIds = new Set(message.skippedSlideIds || []);
      if (presenterOpen) renderPresenter();
    }
    if (message.type === "presentation-blackout") {
      presentationBlackout = Boolean(message.value);
      applyPresentationBlackout();
    }
    if (message.type === "animation-command" && presentationWindowMode) {
      const element = currentSlide().elements.find((item) => item.id === message.elementId);
      if (element) startPresenterElementAnimation(element, false);
    }
    if (message.type === "notes-updated") {
      const slide = deck.slides.find((item) => item.id === message.slideId);
      if (slide) slide.notes = message.notes || "";
    }
    if (message.type === "deck-updated" && !presenterWindowMode && !presentationWindowMode && message.deck) {
      deck = normalizeDeck(message.deck);
      activeSlideIndex = Math.max(0, Math.min(deck.slides.length - 1, Number(message.activeSlideIndex) || 0));
      saveDeck(deck).catch(() => null);
      renderAll();
    }
    if (message.type === "countdown-state") {
      applyCountdownState(message.states || {});
      if (presentationWindowMode) drawPresentationCountdownFrame();
    }
  });
}

function sendPresenterSnapshot() {
  presenterChannel?.postMessage({
    type: "presenter-snapshot",
    deck: JSON.parse(JSON.stringify(deck)),
    activeSlideIndex,
    skippedSlideIds: [...skippedSlideIds],
    presentationBlackout,
    countdownStates: serializedCountdownState(),
  });
}

async function renderPresenter() {
  const slide = currentSlide();
  ensureSlideCountdowns(slide);
  ensurePresenterAnimationPlayback(slide);
  dom.presenterDeckTitle.textContent = deck.title;
  dom.presenterSlideTitle.textContent = `${activeSlideIndex + 1}. ${slide.title}`;
  dom.presenterNotes.value = slide.notes || "";
  dom.presenterParticipantCount.textContent = String(liveSession.participantCount);
  dom.presenterResponseCount.textContent = slide.engagement?.enabled
    ? `${liveSession.responseCount}/${liveSession.participantCount}`
    : `—/${liveSession.participantCount}`;
  dom.presenterConnectionStatus.textContent = liveSession.backendAvailable ? "Live" : liveSession.status;
  await drawSlideAsync(presenterCtx, slide, deck, {
    footer: true,
    revealCorrectAnswers: shouldRevealCorrectAnswers(slide),
    elementStates: presentationWindowMode ? presenterElementStates(slide) : null,
    countdownStates: countdownStatesForRenderer(),
  });
  const nextIndex = nextIncludedSlideIndex(activeSlideIndex, 1);
  const nextSlide = nextIndex === activeSlideIndex ? slide : deck.slides[nextIndex];
  dom.nextSlideTitle.textContent = nextIndex === activeSlideIndex ? "End of presentation" : `${nextIndex + 1}. ${nextSlide.title}`;
  nextCtx.setTransform(1, 0, 0, 1, 0, 0);
  nextCtx.clearRect(0, 0, dom.nextCanvas.width, dom.nextCanvas.height);
  nextCtx.save();
  nextCtx.scale(dom.nextCanvas.width / SLIDE_SIZE.width, dom.nextCanvas.height / SLIDE_SIZE.height);
  await drawSlideAsync(nextCtx, nextSlide, deck, {
    footer: false,
    revealCorrectAnswers: shouldRevealCorrectAnswers(nextSlide),
  });
  nextCtx.restore();
  if (!presentationWindowMode) await renderPresenterFlow();
  if (!presentationWindowMode) {
    renderLiveControls(dom.liveControls, deck, slide, async (question, action) => {
      if (question?.id && action) {
        try {
          const state = await moderateLiveQuestion(liveSession.code, question.id, action, liveSession.presenterToken);
          applyLiveStateToCurrentSlide(state);
          renderPresenter();
        } catch (error) {
          liveSession.status = `Could not moderate question: ${error.message}`;
          renderLiveJoinPanel(slide);
        }
        return;
      }
      syncEngagementElementsFromSlide(slide);
      markChanged("Engagement updated");
      renderAll();
    });
    renderLiveJoinPanel(slide);
    renderCountdownControls(slide);
    renderPresenterQna();
    queueLivePublish();
  }
}

function countdownElements(slide = currentSlide()) {
  return (slide?.elements || []).filter((element) => element.type === "countdown");
}

function ensureSlideCountdowns(slide) {
  for (const element of countdownElements(slide)) {
    if (countdownRuntime.has(element.id)) continue;
    countdownRuntime.set(element.id, {
      remainingSeconds: Math.max(0, Number(element.durationSeconds) || 0),
      running: false,
      endsAt: 0,
      completed: false,
    });
    if (element.autoStart && presenterWindowMode) startCountdown(element.id);
  }
}

function countdownStatesForRenderer() {
  return Object.fromEntries([...countdownRuntime].map(([id, state]) => [id, {
    remainingSeconds: countdownRemaining(state),
    running: state.running,
    completed: state.completed,
  }]));
}

function serializedCountdownState() {
  return countdownStatesForRenderer();
}

function applyCountdownState(states) {
  for (const [id, state] of Object.entries(states)) {
    countdownRuntime.set(id, {
      remainingSeconds: Math.max(0, Number(state.remainingSeconds) || 0),
      running: Boolean(state.running),
      endsAt: state.running ? Date.now() + Math.max(0, Number(state.remainingSeconds) || 0) * 1000 : 0,
      completed: Boolean(state.completed),
    });
  }
}

function countdownRemaining(state) {
  return state.running ? Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000)) : Math.max(0, Number(state.remainingSeconds) || 0);
}

function startCountdown(elementId) {
  const element = currentSlide().elements.find((item) => item.id === elementId && item.type === "countdown");
  if (!element) return;
  const state = countdownRuntime.get(elementId) || { remainingSeconds: element.durationSeconds || 0 };
  const remaining = state.completed || countdownRemaining(state) <= 0 ? element.durationSeconds || 0 : countdownRemaining(state);
  countdownRuntime.set(elementId, { remainingSeconds: remaining, running: true, endsAt: Date.now() + remaining * 1000, completed: false });
  startCountdownTicker();
  broadcastCountdownState();
}

function pauseCountdown(elementId) {
  const state = countdownRuntime.get(elementId);
  if (!state) return;
  state.remainingSeconds = countdownRemaining(state);
  state.running = false;
  state.endsAt = 0;
  broadcastCountdownState();
  renderCountdownControls(currentSlide());
}

function resetCountdown(elementId) {
  const element = currentSlide().elements.find((item) => item.id === elementId);
  if (!element) return;
  countdownRuntime.set(elementId, { remainingSeconds: element.durationSeconds || 0, running: false, endsAt: 0, completed: false });
  broadcastCountdownState();
  drawPresentationCountdownFrame();
  renderCountdownControls(currentSlide());
}

function addCountdownTime(elementId, seconds = 60) {
  const state = countdownRuntime.get(elementId);
  if (!state) return;
  if (state.running) state.endsAt += seconds * 1000;
  else state.remainingSeconds = countdownRemaining(state) + seconds;
  state.completed = false;
  broadcastCountdownState();
}

function startCountdownTicker() {
  if (countdownTickInterval) return;
  countdownTickInterval = window.setInterval(tickCountdowns, 250);
}

function tickCountdowns() {
  let hasRunning = false;
  let changed = false;
  for (const [id, state] of countdownRuntime) {
    if (!state.running) continue;
    hasRunning = true;
    if (countdownRemaining(state) <= 0) {
      state.running = false;
      state.remainingSeconds = 0;
      state.completed = true;
      changed = true;
      const element = currentSlide().elements.find((item) => item.id === id);
      if (element?.autoAdvance && presenterWindowMode) window.setTimeout(() => stepSlide(1), 400);
    }
  }
  drawPresentationCountdownFrame();
  updateCountdownControlReadouts();
  if (Math.floor(Date.now() / 1000) !== tickCountdowns.lastSecond || changed) {
    tickCountdowns.lastSecond = Math.floor(Date.now() / 1000);
    broadcastCountdownState();
    queueLivePublish(true);
  }
  if (!hasRunning) {
    clearInterval(countdownTickInterval);
    countdownTickInterval = 0;
  }
}
tickCountdowns.lastSecond = 0;

function broadcastCountdownState() {
  presenterChannel?.postMessage({ type: "countdown-state", states: serializedCountdownState() });
  drawPresentationCountdownFrame();
  updateCountdownControlReadouts();
}

function drawPresentationCountdownFrame() {
  if (!presenterOpen) return;
  drawSlide(presenterCtx, currentSlide(), deck, {
    footer: true,
    revealCorrectAnswers: shouldRevealCorrectAnswers(currentSlide()),
    elementStates: presentationWindowMode ? presenterElementStates(currentSlide()) : null,
    countdownStates: countdownStatesForRenderer(),
  });
}

function renderCountdownControls(slide) {
  dom.liveControls.querySelector(".countdown-control-panel")?.remove();
  const elements = countdownElements(slide);
  if (!elements.length) return;
  const panel = document.createElement("section");
  panel.className = "countdown-control-panel";
  panel.innerHTML = `<div class="countdown-control-head"><strong>On-screen countdown</strong><span>Visible to everyone</span></div>${elements.map((element) => {
    const state = countdownRuntime.get(element.id);
    return `<div class="countdown-control-row" data-countdown-id="${attr(element.id)}"><strong class="countdown-readout">${formatCountdown(countdownRemaining(state))}</strong><div><button data-countdown-action="${state?.running ? "pause" : "start"}" type="button">${state?.running ? "Pause" : "Start"}</button><button data-countdown-action="add" type="button">+1 min</button><button data-countdown-action="reset" type="button">Reset</button></div></div>`;
  }).join("")}`;
  dom.liveControls.prepend(panel);
  panel.querySelectorAll("[data-countdown-action]").forEach((button) => button.addEventListener("click", () => {
    const id = button.closest("[data-countdown-id]").dataset.countdownId;
    if (button.dataset.countdownAction === "start") startCountdown(id);
    if (button.dataset.countdownAction === "pause") pauseCountdown(id);
    if (button.dataset.countdownAction === "add") addCountdownTime(id, 60);
    if (button.dataset.countdownAction === "reset") resetCountdown(id);
    renderCountdownControls(currentSlide());
  }));
}

function updateCountdownControlReadouts() {
  document.querySelectorAll("[data-countdown-id]").forEach((row) => {
    const state = countdownRuntime.get(row.dataset.countdownId);
    const readout = row.querySelector(".countdown-readout");
    if (readout && state) readout.textContent = formatCountdown(countdownRemaining(state));
  });
}

function formatCountdown(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

async function renderPresenterFlow() {
  if (!dom.presenterSlideList) return;
  dom.presenterFlowCount.textContent = `${deck.slides.length - skippedSlideIds.size}/${deck.slides.length} included`;
  dom.presenterSlideList.replaceChildren();
  for (const [index, slide] of deck.slides.entries()) {
    const row = document.createElement("div");
    const skipped = skippedSlideIds.has(slide.id);
    row.className = `presenter-flow-slide${index === activeSlideIndex ? " active" : ""}${skipped ? " skipped" : ""}`;
    row.innerHTML = `<input type="checkbox" ${skipped ? "" : "checked"} aria-label="Include slide ${index + 1}"><div><canvas width="160" height="90"></canvas><strong>${index + 1}. ${escapeHtml(slide.title)}</strong></div>`;
    const canvas = row.querySelector("canvas");
    const thumbCtx = canvas.getContext("2d");
    thumbCtx.save();
    thumbCtx.scale(canvas.width / SLIDE_SIZE.width, canvas.height / SLIDE_SIZE.height);
    await drawSlideAsync(thumbCtx, slide, deck, { footer: false, revealCorrectAnswers: shouldRevealCorrectAnswers(slide) });
    thumbCtx.restore();
    row.querySelector("input").addEventListener("change", (event) => {
      if (event.target.checked) skippedSlideIds.delete(slide.id);
      else skippedSlideIds.add(slide.id);
      presenterChannel?.postMessage({ type: "skip-state", skippedSlideIds: [...skippedSlideIds] });
      renderPresenter();
    });
    row.addEventListener("click", (event) => {
      if (event.target.matches("input") || skippedSlideIds.has(slide.id)) return;
      activeSlideIndex = index;
      syncPresenterSlideChange();
    });
    dom.presenterSlideList.append(row);
  }
}

function nextIncludedSlideIndex(fromIndex, direction) {
  let index = fromIndex + direction;
  while (index >= 0 && index < deck.slides.length) {
    if (!skippedSlideIds.has(deck.slides[index].id)) return index;
    index += direction;
  }
  return fromIndex;
}

function syncPresenterSlideChange() {
  selectedSlideIndexes = new Set([activeSlideIndex]);
  slideSelectionAnchor = activeSlideIndex;
  selectedIds = [];
  renderAll();
  presenterChannel?.postMessage({ type: "active-slide", activeSlideIndex });
  sendPresenterSnapshot();
}

function shouldRevealCorrectAnswers(slide) {
  const engagement = slide.engagement;
  return ["multipleChoice", "quiz"].includes(engagement?.type) &&
    Boolean(engagement?.correctAnswerRevealed);
}

function openAudience() {
  audienceOpen = true;
  const nextCode = audienceCodeFromHash() || "";
  if (nextCode !== audienceLive.code) {
    audienceLive.state = null;
    audienceLive.responses = {};
    audienceLive.error = "";
  }
  audienceLive.code = nextCode;
  if (audienceLive.code) {
    startAudienceLivePolling();
  } else {
    stopAudienceLivePolling();
  }
  dom.audienceOverlay.classList.remove("hidden");
  dom.audienceOverlay.setAttribute("aria-hidden", "false");
  renderAudience();
}

function closeAudience() {
  audienceOpen = false;
  stopAudienceLivePolling();
  dom.audienceOverlay.classList.add("hidden");
  dom.audienceOverlay.setAttribute("aria-hidden", "true");
}

function renderAudience() {
  if (audienceLive.code) {
    renderLiveAudience();
    return;
  }
  dom.audienceContent.innerHTML = `
    <form id="audienceJoinForm" class="audience-join-form">
      <label for="audienceAccessCodeInput">Enter the 6-digit presentation access code</label>
      <input id="audienceAccessCodeInput" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" placeholder="123456" required />
      <button type="submit">Join presentation</button>
      <small>HySlides uses an anonymous device identifier to prevent duplicate responses. Responses and participant records are retained for 14 days.</small>
    </form>
  `;
  dom.audienceContent.querySelector("#audienceJoinForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = dom.audienceContent.querySelector("#audienceAccessCodeInput");
    const code = String(input?.value || "").replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) {
      input?.setCustomValidity("Enter all 6 digits");
      input?.reportValidity();
      return;
    }
    input.setCustomValidity("");
    location.hash = `audience-${code}`;
    openAudience();
  });
}

function startLiveSession() {
  const code = ensureAudienceCode();
  liveSession.code = code;
  liveSession.presenterToken = presenterTokenForDeck();
  const resumable = readActiveSession();
  if (resumable?.deckId === deck.id && resumable?.code === code && resumable?.instanceId) {
    liveSession.instanceId = resumable.instanceId;
    liveSession.sessionName = resumable.sessionName;
  } else {
    beginNewLiveSession();
  }
  liveSession.lifecycleStatus = "active";
  writeActiveSession();
  liveSession.lastPublishedSignature = "";
  liveSession.joinUrl = audienceLink();
  liveSession.qrSrc = liveQrImageSrc(liveSession.joinUrl);
  liveSession.status = isLocalJoinUrl(liveSession.joinUrl)
    ? "QR ready. Use a hosted or network URL for phones."
    : "QR ready for phones.";
  queueLivePublish(true);
  startLivePolling();
}

function stopLiveSession() {
  clearTimeout(liveSession.publishTimer);
  clearInterval(liveSession.pollTimer);
  liveSession.publishTimer = null;
  liveSession.pollTimer = null;
  liveSession.polling = false;
  liveSession.publishing = false;
}

function startLivePolling() {
  clearInterval(liveSession.pollTimer);
  liveSession.pollTimer = setInterval(refreshLiveSession, 1200);
}

function queueLivePublish(force = false) {
  if (!presenterOpen || !liveSession.code) {
    return;
  }
  clearTimeout(liveSession.publishTimer);
  liveSession.publishTimer = setTimeout(() => publishCurrentLiveSession(force), force ? 0 : 250);
}

async function publishCurrentLiveSession(force = false) {
  if (liveSession.publishing || !liveSession.code) {
    return;
  }
  const snapshot = liveSnapshotForDeck(
    deck,
    liveSlideWithCountdownState(),
    activeSlideIndex,
    liveSession.instanceId,
    liveSession.sessionName
  );
  const signature = JSON.stringify(snapshot);
  if (!force && signature === liveSession.lastPublishedSignature) {
    return;
  }

  liveSession.publishing = true;
  try {
    const state = await publishLiveSession(liveSession.code, snapshot, liveSession.presenterToken);
    liveSession.backendAvailable = true;
    liveSession.lifecycleStatus = state.status || "active";
    writeActiveSession();
    liveSession.status = "Live session running. Responses sync automatically.";
    liveSession.lastPublishedSignature = signature;
    applyLiveStateToCurrentSlide(state);
  } catch (error) {
    if (error.message.includes("Access code is already assigned")) {
      deck.settings.audienceCode = String(100000 + Math.floor(Math.random() * 900000));
      liveSession.code = deck.settings.audienceCode;
      liveSession.joinUrl = audienceLink();
      liveSession.qrSrc = liveQrImageSrc(liveSession.joinUrl);
      liveSession.lastPublishedSignature = "";
      syncAudienceJoinElements();
      writeActiveSession();
      liveSession.status = "A unique access code was assigned automatically.";
      setTimeout(() => queueLivePublish(true), 0);
      return;
    }
    liveSession.backendAvailable = false;
    liveSession.status = isLocalJoinUrl(liveSession.joinUrl)
      ? "Local QR only. Host HySlides or use a network URL for phones."
      : `Live sync unavailable: ${error.message}`;
  } finally {
    liveSession.publishing = false;
    renderLiveJoinPanel(currentSlide());
  }
}

function liveSlideWithCountdownState() {
  const slide = JSON.parse(JSON.stringify(currentSlide()));
  const states = countdownStatesForRenderer();
  for (const element of slide.elements || []) {
    if (element.type !== "countdown" || !states[element.id]) continue;
    element.runtimeRemainingSeconds = states[element.id].remainingSeconds;
    element.runtimeCompleted = states[element.id].completed;
  }
  return slide;
}

async function refreshLiveSession() {
  if (liveSession.polling || !presenterOpen || !liveSession.code) {
    return;
  }
  if (!liveSession.backendAvailable) {
    queueLivePublish(true);
    return;
  }
  liveSession.polling = true;
  try {
    const state = await getLiveSession(liveSession.code, liveSession.presenterToken);
    if (applyLiveStateToCurrentSlide(state)) {
      renderPresenter();
      renderCanvas();
    }
  } catch (error) {
    liveSession.status = `Live sync paused: ${error.message}`;
    liveSession.backendAvailable = false;
    renderLiveJoinPanel(currentSlide());
  } finally {
    liveSession.polling = false;
  }
}

function applyLiveStateToCurrentSlide(state) {
  if (!state?.slide) {
    return false;
  }
  const priorLive = `${liveSession.participantCount}:${liveSession.responseCount}:${liveSession.lifecycleStatus}`;
  const priorQuestions = JSON.stringify(liveSession.questions || []);
  liveSession.participantCount = Number(state.participantCount || 0);
  liveSession.responseCount = Number(state.responseCount || 0);
  liveSession.questions = Array.isArray(state.questions) ? state.questions : liveSession.questions;
  liveSession.lifecycleStatus = state.status || liveSession.lifecycleStatus;
  if (state.slide.id !== currentSlide().id) {
    return priorLive !== `${liveSession.participantCount}:${liveSession.responseCount}:${liveSession.lifecycleStatus}` || priorQuestions !== JSON.stringify(liveSession.questions || []);
  }
  const slide = currentSlide();
  ensureEngagement(slide);
  const before = JSON.stringify({
    results: slide.engagement.results,
    qna: slide.engagement.qna,
    reactions: slide.engagement.reactions,
  });
  slide.engagement.results = state.slide.engagement?.results || {};
  slide.engagement.qna = state.slide.engagement?.qna || [];
  slide.engagement.reactions = {
    ...slide.engagement.reactions,
    ...(state.slide.engagement?.reactions || {}),
  };
  syncEngagementElementsFromSlide(slide);
  const after = JSON.stringify({
    results: slide.engagement.results,
    qna: slide.engagement.qna,
    reactions: slide.engagement.reactions,
  });
  return before !== after || priorLive !== `${liveSession.participantCount}:${liveSession.responseCount}:${liveSession.lifecycleStatus}` || priorQuestions !== JSON.stringify(liveSession.questions || []);
}

function renderLiveJoinPanel(slide) {
  if (!presenterOpen || !dom.liveControls) {
    return;
  }
  dom.liveControls.querySelector(".live-join-panel")?.remove();
  const panel = document.createElement("div");
  panel.className = "live-join-panel";
  const participantText = slide.engagement?.enabled
    ? `${liveSession.responseCount}/${liveSession.participantCount} connected participants responded.`
    : `${liveSession.participantCount} participant${liveSession.participantCount === 1 ? "" : "s"} connected.`;
  const paused = liveSession.lifecycleStatus === "paused";
  panel.innerHTML = `
    <div class="live-join-copy">
      <span>${escapeHtml(participantText)}</span>
      <div class="live-join-actions">
        <button id="toggleLiveSessionBtn" type="button">${paused ? "Resume" : "Pause"}</button>
        <button id="clearLiveSlideBtn" type="button">Clear responses</button>
        <button id="insertLiveTimerBtn" type="button">Add timer to slide</button>
        <button id="endLiveSessionBtn" type="button">End session</button>
        <button id="newLiveSessionBtn" type="button">New session</button>
      </div>
      <small>${escapeHtml(liveSession.status)}</small>
    </div>
  `;
  dom.liveControls.prepend(panel);
  panel.querySelector("#toggleLiveSessionBtn")?.addEventListener("click", () => runLiveControl(paused ? "resume" : "pause"));
  panel.querySelector("#insertLiveTimerBtn")?.addEventListener("click", insertCountdownFromPresenter);
  panel.querySelector("#clearLiveSlideBtn")?.addEventListener("click", () => {
    if (confirm("Clear every response to the current slide? This cannot be undone.")) runLiveControl("clearSlide");
  });
  panel.querySelector("#endLiveSessionBtn")?.addEventListener("click", () => {
    if (confirm("End this live session? Its responses will remain available for 14 days.")) runLiveControl("end");
  });
  panel.querySelector("#newLiveSessionBtn")?.addEventListener("click", () => {
    if (confirm("Start a new session instance for this deck?")) {
      beginNewLiveSession();
      liveSession.lifecycleStatus = "active";
      liveSession.participantCount = 0;
      liveSession.responseCount = 0;
      queueLivePublish(true);
    }
  });
}

function renderPresenterQna() {
  if (!dom.presenterQnaList) return;
  const all = liveSession.questions || [];
  const filtered = all.filter((question) => presenterQnaTab === "answered" ? question.answered : !question.answered);
  document.querySelector("#qnaUnansweredTab")?.classList.toggle("active", presenterQnaTab === "unanswered");
  document.querySelector("#qnaAnsweredTab")?.classList.toggle("active", presenterQnaTab === "answered");
  dom.presenterQnaCount.textContent = `${all.filter((question) => !question.answered).length} open`;
  if (!filtered.length) {
    dom.presenterQnaList.innerHTML = `<div class="presenter-qna-empty">${presenterQnaTab === "answered" ? "No answered questions yet." : "New audience questions will appear here for review."}</div>`;
    return;
  }
  dom.presenterQnaList.innerHTML = filtered
    .sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0))
    .map((question) => `<article class="presenter-qna-item ${question.visible ? "displayed" : "pending"}" data-question-id="${attr(question.id)}"><strong>${escapeHtml(question.text)}</strong><span>${question.visible ? "Displayed" : "Pending review"} · ${question.upvotes || 0} upvote${question.upvotes === 1 ? "" : "s"}</span><div class="presenter-qna-item-actions"><button data-action="${question.visible ? "hide" : "show"}" type="button">${question.visible ? "Hide" : "Display"}</button><button data-action="${question.answered ? "unanswered" : "answered"}" type="button">${question.answered ? "Reopen" : "Mark answered"}</button><button data-action="delete" type="button">Delete</button></div></article>`)
    .join("");
  dom.presenterQnaList.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", async () => {
    const questionId = button.closest("[data-question-id]").dataset.questionId;
    try {
      const state = await moderateLiveQuestion(liveSession.code, questionId, button.dataset.action, liveSession.presenterToken);
      applyLiveStateToCurrentSlide(state);
      renderPresenterQna();
      renderLiveJoinPanel(currentSlide());
    } catch (error) {
      liveSession.status = `Could not moderate question: ${error.message}`;
      renderLiveJoinPanel(currentSlide());
    }
  }));
}

function insertCountdownFromPresenter() {
  const existing = countdownElements(currentSlide())[0];
  if (existing) {
    renderCountdownControls(currentSlide());
    dom.liveControls.querySelector(".countdown-control-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }
  const element = createElement("countdown", {
    x: SLIDE_SIZE.width / 2 - 250,
    y: SLIDE_SIZE.height / 2 - 90,
  });
  currentSlide().elements.push(element);
  selectedIds = [element.id];
  ensureSlideCountdowns(currentSlide());
  presenterChannel?.postMessage({ type: "deck-updated", deck: JSON.parse(JSON.stringify(deck)), activeSlideIndex });
  sendPresenterSnapshot();
  queueLivePublish(true);
  renderPresenter();
}

async function runLiveControl(action) {
  try {
    const state = await controlLiveSession(liveSession.code, action, liveSession.presenterToken);
    applyLiveStateToCurrentSlide(state);
    if (action === "end") clearActiveSession();
    else writeActiveSession();
    renderPresenter();
  } catch (error) {
    liveSession.status = `Could not update session: ${error.message}`;
    renderLiveJoinPanel(currentSlide());
  }
}

async function renderLiveAudience() {
  if (!audienceLive.state) {
    dom.audienceContent.innerHTML = `
      <div class="result-row">
        <span>Joined with code ${escapeHtml(audienceLive.code)}</span>
        <strong>${audienceLive.error ? "Waiting for the live session..." : "Connecting to the presenter..."}</strong>
        <span>${escapeHtml(audienceLive.error || "The slide will appear here when presenter mode starts.")}</span>
      </div>
    `;
    if (!audienceLive.loading && !audienceLive.error) {
      refreshAudienceLiveState();
    }
    return;
  }

  const liveSlide = audienceLive.state.slide;
  const liveDeck = normalizeDeck({
    ...liveStateDeck(audienceLive.state),
    slides: [liveSlide],
  });
  await drawSlideAsync(audienceCtx, liveSlide, liveDeck, {
    footer: false,
    revealCorrectAnswers: shouldRevealCorrectAnswers(liveSlide),
  });
  const latestResponse = audienceLive.responses[liveSlide.id] || null;
  renderAudienceContent(
    dom.audienceContent,
    liveDeck,
    liveSlide,
    (payload) => submitAudienceLiveResponse(liveSlide, payload),
    latestResponse
  );
  renderSessionQnaForAudience();
  if (audienceLive.state.status !== "active") {
    dom.audienceContent.querySelectorAll("button, input, textarea, select").forEach((control) => { control.disabled = true; });
  }
  renderAudienceLiveStatus();
}

function renderSessionQnaForAudience() {
  const launcher = document.createElement("button");
  launcher.className = "participant-qna-launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Ask the presenter a question");
  launcher.innerHTML = `<span aria-hidden="true">?</span>`;
  const panel = document.createElement("section");
  panel.className = `audience-results session-qna-panel${participantQnaOpen ? "" : " hidden"}`;
  const questions = audienceLive.state?.questions || [];
  panel.innerHTML = `
    <strong>Ask the presenter</strong>
    <form class="session-qna-form"><input type="text" maxlength="500" required placeholder="Type a question at any time"><button type="submit">Submit question</button></form>
    <div class="session-qna-public">${questions.length ? questions.map((question) => `<div class="result-row audience-question${question.answered ? " answered" : ""}" data-question-id="${attr(question.id)}"><strong>${escapeHtml(question.text)}</strong><button type="button">▲ ${question.upvotes || 0}</button></div>`).join("") : "<span>No questions have been displayed yet.</span>"}</div>`;
  panel.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = panel.querySelector("input");
    try {
      audienceLive.state = await submitLiveQuestion(audienceLive.code, input.value, participantId);
      audienceLive.error = "Question submitted for presenter review.";
      input.value = "";
    } catch (error) {
      audienceLive.error = `Question was not sent: ${error.message}`;
    }
    renderLiveAudience();
  });
  panel.querySelectorAll("[data-question-id] button").forEach((button) => button.addEventListener("click", async () => {
    try {
      audienceLive.state = await voteLiveQuestion(audienceLive.code, button.closest("[data-question-id]").dataset.questionId, participantId);
      audienceLive.error = audienceLive.state.duplicate ? "You already upvoted that question." : "Question upvoted.";
    } catch (error) {
      audienceLive.error = `Vote was not sent: ${error.message}`;
    }
    renderLiveAudience();
  }));
  launcher.addEventListener("click", () => {
    participantQnaOpen = !participantQnaOpen;
    panel.classList.toggle("hidden", !participantQnaOpen);
    if (participantQnaOpen) panel.querySelector("input")?.focus();
  });
  dom.audienceContent.append(panel, launcher);
}

function renderAudienceLiveStatus() {
  const stateLabel = audienceLive.state?.status === "paused" ? "Presentation paused" : audienceLive.state?.status === "ended" ? "Presentation ended" : "";
  const message = audienceLive.error || stateLabel;
  if (!message) return;
  const status = document.createElement("div");
  status.className = "audience-live-status";
  status.textContent = message;
  dom.audienceContent.prepend(status);
}

function startAudienceLivePolling() {
  clearInterval(audienceLive.pollTimer);
  refreshAudienceLiveState();
  audienceLive.pollTimer = setInterval(refreshAudienceLiveState, 1200);
}

function stopAudienceLivePolling() {
  clearInterval(audienceLive.pollTimer);
  audienceLive.pollTimer = null;
  audienceLive.loading = false;
}

async function refreshAudienceLiveState() {
  if (!audienceLive.code || audienceLive.loading) {
    return;
  }
  audienceLive.loading = true;
  try {
    audienceLive.state = await registerLiveParticipant(audienceLive.code, participantId);
    audienceLive.backendAvailable = true;
    audienceLive.error = "";
  } catch (error) {
    audienceLive.backendAvailable = false;
    audienceLive.error = `Waiting for live session: ${error.message}`;
  } finally {
    audienceLive.loading = false;
    if (audienceOpen && audienceLive.code) {
      renderLiveAudience();
    }
  }
}

async function submitAudienceLiveResponse(slide, payload) {
  if (payload.action === "upvote" && payload.questionId) {
    try {
      audienceLive.state = await voteLiveQuestion(audienceLive.code, payload.questionId, participantId);
      audienceLive.error = audienceLive.state.duplicate ? "You already upvoted that question." : "Question upvoted.";
    } catch (error) {
      audienceLive.error = `Vote was not sent: ${error.message}`;
    } finally {
      renderLiveAudience();
    }
    return;
  }
  audienceLive.responses[slide.id] = payload.value;
  renderLiveAudience();
  try {
    audienceLive.state = await submitLiveResponse(audienceLive.code, {
      slideId: slide.id,
      value: payload.value,
      participantId,
    });
    audienceLive.backendAvailable = true;
    audienceLive.error = audienceLive.state.duplicate
      ? "Your response was already recorded."
      : audienceLive.state.accepted === false
        ? "That slide has moved on. Showing the current live slide."
        : "";
  } catch (error) {
    delete audienceLive.responses[slide.id];
    audienceLive.backendAvailable = false;
    audienceLive.error = `Response was not sent: ${error.message}`;
  } finally {
    renderLiveAudience();
  }
}

function stepSlide(delta) {
  if (presenterOpen) {
    activeSlideIndex = nextIncludedSlideIndex(activeSlideIndex, delta < 0 ? -1 : 1);
    syncPresenterSlideChange();
    return;
  }
  activeSlideIndex = Math.max(0, Math.min(deck.slides.length - 1, activeSlideIndex + delta));
  selectedSlideIndexes = new Set([activeSlideIndex]);
  slideSelectionAnchor = activeSlideIndex;
  openSlideMenuIndex = null;
  openSectionMenuId = null;
  selectedIds = [];
  renderAll();
  if (presenterWindowMode || presentationWindowMode) {
    presenterChannel?.postMessage({ type: "active-slide", activeSlideIndex });
  } else if (presenterWindow && !presenterWindow.closed) {
    sendPresenterSnapshot();
  }
}

function advancePresenter() {
  if (!revealNextClickAnimation()) {
    stepSlide(1);
  }
}

function normalizedAnimation(element) {
  return {
    effect: "none",
    trigger: "slideStart",
    durationMs: 500,
    delayMs: 0,
    easing: "ease",
    order: 0,
    ...(element?.animation || {}),
  };
}

function animationOptionList(options, selected) {
  return options.map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("");
}

function setElementAnimation(element, key, value) {
  element.animation = { ...normalizedAnimation(element), [key]: value };
}

function animatedElements(slide) {
  return slide.elements
    .filter((element) => normalizedAnimation(element).effect !== "none")
    .sort((a, b) => {
      const orderDifference = normalizedAnimation(a).order - normalizedAnimation(b).order;
      return orderDifference || slide.elements.indexOf(a) - slide.elements.indexOf(b);
    });
}

function animationOrderLabel(element) {
  const index = animatedElements(currentSlide()).findIndex((item) => item.id === element.id);
  return index >= 0 ? `#${index + 1}` : "";
}

function createAnimationPlaybackState() {
  return {
    slideId: "",
    revealed: new Set(),
    scheduled: new Set(),
    active: new Map(),
    timers: [],
    frameId: 0,
  };
}

function resetPresenterAnimationPlayback(slide) {
  presenterAnimation.timers.forEach(clearTimeout);
  cancelAnimationFrame(presenterAnimation.frameId);
  presenterAnimation = createAnimationPlaybackState();
  presenterAnimation.slideId = slide.id;
}

function ensurePresenterAnimationPlayback(slide) {
  if (presenterAnimation.slideId === slide.id) return;
  resetPresenterAnimationPlayback(slide);
  const items = animatedElements(slide);
  items.forEach((element, index) => {
    const animation = normalizedAnimation(element);
    if (animation.trigger === "slideStart" || (animation.trigger === "afterPrevious" && index === 0)) {
      schedulePresenterAnimation(element);
    }
  });
}

function schedulePresenterAnimation(element) {
  if (presenterAnimation.scheduled.has(element.id) || presenterAnimation.revealed.has(element.id)) return;
  presenterAnimation.scheduled.add(element.id);
  const delay = Math.max(0, Number(normalizedAnimation(element).delayMs) || 0);
  const timer = setTimeout(() => startPresenterElementAnimation(element), delay);
  presenterAnimation.timers.push(timer);
}

function startPresenterElementAnimation(element, broadcast = presenterWindowMode) {
  if (broadcast) presenterChannel?.postMessage({ type: "animation-command", elementId: element.id });
  const animation = normalizedAnimation(element);
  if (animation.effect === "appear") {
    presenterAnimation.revealed.add(element.id);
    drawPresenterAnimationFrame();
    scheduleAfterPreviousAnimations(element);
    return;
  }
  presenterAnimation.active.set(element.id, {
    startedAt: performance.now(),
    durationMs: Math.max(100, Number(animation.durationMs) || 500),
    easing: animation.easing,
  });
  drawPresenterAnimationFrame();
}

function presenterElementStates(slide, now = performance.now()) {
  const states = {};
  for (const element of animatedElements(slide)) {
    if (presenterAnimation.revealed.has(element.id)) continue;
    const active = presenterAnimation.active.get(element.id);
    if (!active) {
      states[element.id] = { hidden: true };
      continue;
    }
    const progress = Math.min(1, Math.max(0, (now - active.startedAt) / active.durationMs));
    states[element.id] = { opacity: easedAnimationProgress(progress, active.easing) };
  }
  return states;
}

function drawPresenterAnimationFrame() {
  if (!presenterOpen || presenterAnimation.slideId !== currentSlide().id) return;
  const now = performance.now();
  let hasActiveAnimations = false;
  for (const [elementId, active] of presenterAnimation.active) {
    if (now - active.startedAt >= active.durationMs) {
      presenterAnimation.active.delete(elementId);
      presenterAnimation.revealed.add(elementId);
      const element = currentSlide().elements.find((item) => item.id === elementId);
      if (element) scheduleAfterPreviousAnimations(element);
    } else {
      hasActiveAnimations = true;
    }
  }
  if (presentationWindowMode) {
    drawSlide(presenterCtx, currentSlide(), deck, {
      footer: true,
      revealCorrectAnswers: shouldRevealCorrectAnswers(currentSlide()),
      elementStates: presenterElementStates(currentSlide(), now),
    });
  }
  if (hasActiveAnimations || presenterAnimation.active.size) {
    presenterAnimation.frameId = requestAnimationFrame(drawPresenterAnimationFrame);
  }
}

function scheduleAfterPreviousAnimations(previousElement) {
  const items = animatedElements(currentSlide());
  const previousIndex = items.findIndex((item) => item.id === previousElement.id);
  const next = items[previousIndex + 1];
  if (next && normalizedAnimation(next).trigger === "afterPrevious") {
    schedulePresenterAnimation(next);
  }
}

function revealNextClickAnimation() {
  const next = animatedElements(currentSlide()).find((element) => {
    const animation = normalizedAnimation(element);
    return animation.trigger === "onClick" &&
      !presenterAnimation.revealed.has(element.id) &&
      !presenterAnimation.scheduled.has(element.id);
  });
  if (!next) return false;
  schedulePresenterAnimation(next);
  return true;
}

function easedAnimationProgress(value, easing) {
  if (easing === "linear") return value;
  if (easing === "easeIn") return value * value;
  if (easing === "easeOut") return 1 - (1 - value) * (1 - value);
  if (easing === "easeInOut") return value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2;
  return 1 - Math.pow(1 - value, 3);
}

function previewElementAnimation(element) {
  previewAnimations([element]);
}

function previewSlideAnimations() {
  previewAnimations(animatedElements(currentSlide()));
}

function previewAnimations(elements) {
  const items = elements.filter((element) => normalizedAnimation(element).effect !== "none");
  if (!items.length) {
    setStatus("Add an animation to an element first");
    return;
  }
  const token = ++editorAnimationToken;
  editorAnimationStates = Object.fromEntries(items.map((element) => [element.id, { hidden: true }]));
  renderCanvas();
  let cursor = 0;
  for (const element of items) {
    const animation = normalizedAnimation(element);
    if (animation.trigger === "onClick") cursor += 350;
    const startAt = cursor + Math.max(0, Number(animation.delayMs) || 0);
    setTimeout(() => runEditorAnimation(element, token), startAt);
    cursor = startAt + (animation.effect === "fadeIn" ? Math.max(100, Number(animation.durationMs) || 500) : 100);
  }
  setTimeout(() => {
    if (token !== editorAnimationToken) return;
    editorAnimationStates = null;
    renderCanvas();
  }, cursor + 300);
}

function runEditorAnimation(element, token) {
  if (token !== editorAnimationToken || !editorAnimationStates) return;
  const animation = normalizedAnimation(element);
  if (animation.effect === "appear") {
    delete editorAnimationStates[element.id];
    renderCanvas();
    return;
  }
  const startedAt = performance.now();
  const durationMs = Math.max(100, Number(animation.durationMs) || 500);
  const frame = (now) => {
    if (token !== editorAnimationToken || !editorAnimationStates) return;
    const progress = Math.min(1, (now - startedAt) / durationMs);
    editorAnimationStates[element.id] = { opacity: easedAnimationProgress(progress, animation.easing) };
    renderCanvas();
    if (progress < 1) requestAnimationFrame(frame);
    else delete editorAnimationStates[element.id];
  };
  requestAnimationFrame(frame);
}

function drawThumb(canvas, slide) {
  const thumbCtx = canvas.getContext("2d");
  thumbCtx.save();
  thumbCtx.scale(canvas.width / SLIDE_SIZE.width, canvas.height / SLIDE_SIZE.height);
  drawSlide(thumbCtx, slide, deck, { footer: false });
  thumbCtx.restore();
}

function canvasPoint(event) {
  const rect = dom.canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (SLIDE_SIZE.width / rect.width),
    y: (event.clientY - rect.top) * (SLIDE_SIZE.height / rect.height),
  };
}

function selectedElements() {
  const ids = new Set(selectedIds);
  return currentSlide().elements.filter((element) => ids.has(element.id));
}

function currentSlide() {
  return deck.slides[activeSlideIndex] || deck.slides[0];
}

function snapshotElement(element) {
  return {
    id: element.id,
    x: element.x,
    y: element.y,
    w: element.w,
    h: element.h,
  };
}

function applyMove(originals, dx, dy) {
  for (const original of originals) {
    const element = currentSlide().elements.find((item) => item.id === original.id);
    if (element && !element.locked) {
      element.x = clamp(original.x + dx, -element.w + 12, SLIDE_SIZE.width - 12);
      element.y = clamp(original.y + dy, -element.h + 12, SLIDE_SIZE.height - 12);
    }
  }
}

function applyResize(originals, oldBounds, newBounds, handle = "") {
  const sx = newBounds.w / oldBounds.w;
  const sy = newBounds.h / oldBounds.h;
  for (const original of originals) {
    const element = currentSlide().elements.find((item) => item.id === original.id);
    if (element && !element.locked) {
      element.x = newBounds.x + (original.x - oldBounds.x) * sx;
      element.y = newBounds.y + (original.y - oldBounds.y) * sy;
      element.w = Math.max(12, original.w * sx);
      element.h = Math.max(12, original.h * sy);
      if (element.type === "text" && (handle.includes("n") || handle.includes("s"))) {
        element.autoHeight = false;
      }
    }
  }
}

function resizeBounds(bounds, handle, dx, dy) {
  const next = { ...bounds };
  if (handle.includes("e")) {
    next.w = Math.max(20, bounds.w + dx);
  }
  if (handle.includes("s")) {
    next.h = Math.max(20, bounds.h + dy);
  }
  if (handle.includes("w")) {
    next.x = bounds.x + dx;
    next.w = Math.max(20, bounds.w - dx);
  }
  if (handle.includes("n")) {
    next.y = bounds.y + dy;
    next.h = Math.max(20, bounds.h - dy);
  }
  return next;
}

function snapBounds(bounds, movingIds) {
  const threshold = 6;
  guides = [];
  let next = { ...bounds };

  if (deck.settings.snapToGrid) {
    next.x = Math.round(next.x / GRID_SIZE) * GRID_SIZE;
    next.y = Math.round(next.y / GRID_SIZE) * GRID_SIZE;
  }

  if (!deck.settings.showGuides) {
    return next;
  }

  const candidatesX = [
    { value: SLIDE_SIZE.width / 2, point: next.x + next.w / 2 },
    { value: 0, point: next.x },
    { value: SLIDE_SIZE.width, point: next.x + next.w },
  ];
  const candidatesY = [
    { value: SLIDE_SIZE.height / 2, point: next.y + next.h / 2 },
    { value: 0, point: next.y },
    { value: SLIDE_SIZE.height, point: next.y + next.h },
  ];

  for (const element of currentSlide().elements) {
    if (movingIds.includes(element.id)) {
      continue;
    }
    candidatesX.push(
      { value: element.x, point: next.x },
      { value: element.x + element.w / 2, point: next.x + next.w / 2 },
      { value: element.x + element.w, point: next.x + next.w }
    );
    candidatesY.push(
      { value: element.y, point: next.y },
      { value: element.y + element.h / 2, point: next.y + next.h / 2 },
      { value: element.y + element.h, point: next.y + next.h }
    );
  }

  for (const candidate of candidatesX) {
    if (Math.abs(candidate.value - candidate.point) <= threshold) {
      next.x += candidate.value - candidate.point;
      guides.push({ axis: "x", value: candidate.value });
      break;
    }
  }
  for (const candidate of candidatesY) {
    if (Math.abs(candidate.value - candidate.point) <= threshold) {
      next.y += candidate.value - candidate.point;
      guides.push({ axis: "y", value: candidate.value });
      break;
    }
  }
  return next;
}

function setupCanvasAutoFit() {
  if (presenterWindowMode) {
    return;
  }
  requestAnimationFrame(fitCanvasToViewport);
  if ("ResizeObserver" in window) {
    canvasResizeObserver = new ResizeObserver(fitCanvasToViewport);
    canvasResizeObserver.observe(dom.viewport);
  } else {
    window.addEventListener("resize", fitCanvasToViewport);
  }
}

function fitCanvasToViewport() {
  if (!autoFitZoom || !dom.viewport.clientWidth) {
    return;
  }
  const viewportStyle = getComputedStyle(dom.viewport);
  const horizontalPadding = parseFloat(viewportStyle.paddingLeft || 0) + parseFloat(viewportStyle.paddingRight || 0);
  const availableWidth = Math.max(0, dom.viewport.clientWidth - horizontalPadding);
  const fittedZoom = availableWidth / SLIDE_SIZE.width;
  setZoom(fittedZoom);
}

function setZoom(value, options = {}) {
  if (options.manual) {
    autoFitZoom = false;
  }
  const nextZoom = Math.max(0.2, Math.min(1.5, value));
  if (Math.abs(nextZoom - zoom) < 0.001) {
    return;
  }
  zoom = nextZoom;
  renderCanvas();
}

function bindValue(selector, setter) {
  const input = document.querySelector(selector);
  input?.addEventListener("input", () => {
    setter(input.value);
    markChanged("Updated");
    renderCanvas();
    renderSlides();
    if (presenterOpen) {
      renderPresenter();
    }
    if (audienceOpen) {
      renderAudience();
    }
  });
}

function bindEngagementType(slide) {
  const input = document.querySelector("#engagementType");
  input?.addEventListener("change", () => {
    slide.engagement.type = input.value;
    pruneCorrectAnswers(slide.engagement);
    syncEngagementElementsFromSlide(slide);
    markChanged("Engagement mode updated");
    renderAll();
  });
}

function bindEngagementOptions(slide) {
  const input = document.querySelector("#engagementOptions");
  input?.addEventListener("input", () => {
    slide.engagement.options = splitLines(input.value);
    pruneCorrectAnswers(slide.engagement);
    syncEngagementElementsFromSlide(slide);
    markChanged("Engagement options updated");
    renderCanvas();
    renderSlides();
    if (presenterOpen) {
      renderPresenter();
    }
    if (audienceOpen) {
      renderAudience();
    }
  });
  input?.addEventListener("change", () => {
    renderInspector();
  });
}

function bindCorrectAnswerFields(slide) {
  document.querySelectorAll("[data-correct-answer]").forEach((input) => {
    input.addEventListener("change", () => {
      const value = input.dataset.correctAnswer;
      const answers = new Set(slide.engagement.correctAnswers || []);
      if (input.checked) {
        answers.add(value);
      } else {
        answers.delete(value);
      }
      slide.engagement.correctAnswers = [...answers];
      pruneCorrectAnswers(slide.engagement);
      syncEngagementElementsFromSlide(slide);
      markChanged("Correct answer updated");
      renderCanvas();
      if (presenterOpen) {
        renderPresenter();
      }
      if (audienceOpen) {
        renderAudience();
      }
    });
  });

  const toggle = document.querySelector("#showCorrectAnswerToggle");
  toggle?.addEventListener("change", () => {
    slide.engagement.showCorrectAnswer = toggle.checked;
    syncEngagementElementsFromSlide(slide);
    markChanged("Answer reveal updated");
    if (presenterOpen) {
      renderPresenter();
    }
    if (audienceOpen) {
      renderAudience();
    }
  });
}

function bindEngagementElementFields(element) {
  const mode = document.querySelector("#engagementElementMode");
  mode?.addEventListener("change", () => {
    element.mode = mode.value;
    pruneElementCorrectAnswers(element);
    syncSlideEngagementFromElement(element);
    markChanged("Engagement mode updated");
    renderAll();
  });

  const prompt = document.querySelector("#engagementElementPrompt");
  prompt?.addEventListener("input", () => {
    element.prompt = prompt.value;
    syncSlideEngagementFromElement(element);
    markChanged("Engagement prompt updated");
    renderCanvas();
    if (presenterOpen) {
      renderPresenter();
    }
    if (audienceOpen) {
      renderAudience();
    }
  });

  const options = document.querySelector("#engagementElementOptions");
  options?.addEventListener("input", () => {
    element.options = splitLines(options.value);
    pruneElementCorrectAnswers(element);
    syncSlideEngagementFromElement(element);
    markChanged("Engagement options updated");
    renderCanvas();
    if (presenterOpen) {
      renderPresenter();
    }
    if (audienceOpen) {
      renderAudience();
    }
  });
  options?.addEventListener("change", () => {
    renderInspector();
  });

  document.querySelectorAll("[data-element-correct-answer]").forEach((input) => {
    input.addEventListener("change", () => {
      const answers = new Set(element.correctAnswers || []);
      const value = input.dataset.elementCorrectAnswer;
      if (input.checked) {
        answers.add(value);
      } else {
        answers.delete(value);
      }
      element.correctAnswers = [...answers];
      pruneElementCorrectAnswers(element);
      syncSlideEngagementFromElement(element);
      markChanged("Correct answer updated");
      renderCanvas();
      if (presenterOpen) {
        renderPresenter();
      }
      if (audienceOpen) {
        renderAudience();
      }
    });
  });

  const reveal = document.querySelector("#engagementElementReveal");
  reveal?.addEventListener("change", () => {
    element.showCorrectAnswer = reveal.checked;
    syncSlideEngagementFromElement(element);
    markChanged("Answer reveal updated");
    if (presenterOpen) {
      renderPresenter();
    }
    if (audienceOpen) {
      renderAudience();
    }
  });
}

function bindNumber(selector, setter) {
  const input = document.querySelector(selector);
  input?.addEventListener("input", () => {
    setter(Number(input.value));
    markChanged("Updated");
    renderCanvas();
    updateSelectionLabel();
  });
}

function bindLineHeightInput(selector, element) {
  const input = document.querySelector(selector);
  const apply = () => {
    const multiplier = parseLineHeightMultiplier(input.value);
    if (!multiplier) {
      return;
    }
    element.lineHeight = multiplier;
    input.value = formatLineHeight(multiplier);
    markChanged("Line height updated");
    renderCanvas();
    renderSlides();
    if (presenterOpen) {
      renderPresenter();
    }
  };
  input?.addEventListener("change", apply);
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      apply();
      input.blur();
    }
  });
}

function bindOpacityControls(elements) {
  const range = document.querySelector("#opacityRange");
  const value = document.querySelector("#opacityValue");
  const applyOpacity = (nextValue) => {
    const numeric = Number(nextValue);
    if (!Number.isFinite(numeric)) {
      return;
    }
    const percent = Math.round(clamp(numeric, 0, 100));
    range.value = String(percent);
    value.value = String(percent);
    elements.forEach((element) => {
      element.opacity = percent / 100;
    });
    markChanged("Opacity updated");
    renderCanvas();
    updateSelectionLabel();
  };

  range?.addEventListener("input", () => applyOpacity(range.value));
  value?.addEventListener("input", () => applyOpacity(value.value));
}

function opacityPercent(value) {
  return Math.round(clamp(value ?? 1, 0, 1) * 100);
}

function bindToggle(selector, setter) {
  const input = document.querySelector(selector);
  input?.addEventListener("change", () => {
    setter(input.checked);
    markChanged("Updated");
    renderAll();
  });
}

function bindTextFormatButton(selector, apply) {
  document.querySelector(selector)?.addEventListener("click", () => {
    apply();
    markChanged("Text formatting updated");
    renderAll();
  });
}

function markChanged(message) {
  deck.updatedAt = new Date().toISOString();
  recordHistory(message);
  setStatus(message);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDeck(deck).catch(() => {}), 500);
}

function captureHistorySnapshot() {
  return {
    deckJson: JSON.stringify(deck),
    activeSlideIndex,
    selectedSlideIndexes: selectedSlideIndexesSorted(),
    selectedIds: [...selectedIds],
  };
}

function resetHistory() {
  undoStack = [captureHistorySnapshot()];
  redoStack = [];
  lastHistoryMessage = "";
  lastHistoryAt = 0;
  updateHistoryButtons();
}

function recordHistory(message) {
  if (restoringHistory) return;
  const snapshot = captureHistorySnapshot();
  const previous = undoStack[undoStack.length - 1];
  if (previous?.deckJson === snapshot.deckJson) return;
  const now = Date.now();
  const shouldCoalesce = undoStack.length > 1 && message === lastHistoryMessage && now - lastHistoryAt < 700;
  if (shouldCoalesce) undoStack[undoStack.length - 1] = snapshot;
  else undoStack.push(snapshot);
  if (undoStack.length > 100) undoStack.shift();
  redoStack = [];
  lastHistoryMessage = message;
  lastHistoryAt = now;
  updateHistoryButtons();
}

function undoEdit() {
  if (dom.textEditor.classList.contains("open")) closeTextEditor();
  if (undoStack.length <= 1) return;
  redoStack.push(undoStack.pop());
  restoreHistorySnapshot(undoStack[undoStack.length - 1], "Undo");
}

function redoEdit() {
  if (!redoStack.length) return;
  const snapshot = redoStack.pop();
  undoStack.push(snapshot);
  restoreHistorySnapshot(snapshot, "Redo");
}

function restoreHistorySnapshot(snapshot, status) {
  if (!snapshot) return;
  restoringHistory = true;
  deck = normalizeDeck(JSON.parse(snapshot.deckJson));
  activeSlideIndex = clamp(snapshot.activeSlideIndex, 0, Math.max(0, deck.slides.length - 1));
  selectedSlideIndexes = new Set(snapshot.selectedSlideIndexes.filter((index) => index >= 0 && index < deck.slides.length));
  if (!selectedSlideIndexes.size && deck.slides.length) selectedSlideIndexes.add(activeSlideIndex);
  slideSelectionAnchor = activeSlideIndex;
  selectedIds = snapshot.selectedIds.filter((id) => currentSlide()?.elements.some((element) => element.id === id));
  openSlideMenuIndex = null;
  openSectionMenuId = null;
  restoringHistory = false;
  renderAll();
  setStatus(status);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDeck(deck).catch(() => {}), 250);
  if (presenterWindow && !presenterWindow.closed) sendPresenterSnapshot();
  updateHistoryButtons();
}

function updateHistoryButtons() {
  const undoButton = document.querySelector("#undoBtn");
  const redoButton = document.querySelector("#redoBtn");
  if (undoButton) undoButton.disabled = undoStack.length <= 1;
  if (redoButton) redoButton.disabled = redoStack.length === 0;
}

function parseLineHeightMultiplier(value) {
  const numeric = Number(String(value).trim().replace(/x$/i, ""));
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.round(clamp(numeric, 0.6, 4) * 100) / 100;
}

function formatLineHeight(value) {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : 1.18;
  return `${Number(numeric.toFixed(2))}x`;
}

function splitLines(value) {
  return value.split(/\n/).map((item) => item.trim()).filter(Boolean);
}

function pruneCorrectAnswers(engagement) {
  const validOptions = new Set(engagement.options || []);
  engagement.correctAnswers = (engagement.correctAnswers || []).filter((answer) =>
    validOptions.has(answer)
  );
}

function pruneElementCorrectAnswers(element) {
  const validOptions = new Set(element.options || []);
  element.correctAnswers = (element.correctAnswers || []).filter((answer) =>
    validOptions.has(answer)
  );
}

function syncSlideEngagementFromElement(element) {
  const slide = currentSlide();
  ensureEngagement(slide);
  slide.engagement.enabled = true;
  slide.engagement.type = element.mode || "poll";
  slide.engagement.prompt = element.prompt || "";
  slide.engagement.options = [...(element.options || [])];
  slide.engagement.correctAnswers = [...(element.correctAnswers || [])];
  slide.engagement.showCorrectAnswer = element.showCorrectAnswer ?? true;
  slide.engagement.correctAnswerRevealed =
    element.correctAnswerRevealed ?? slide.engagement.correctAnswerRevealed ?? false;
  pruneCorrectAnswers(slide.engagement);
}

function syncEngagementElementsFromSlide(slide) {
  ensureEngagement(slide);
  for (const element of slide.elements) {
    if (element.type !== "engagement") {
      continue;
    }
    element.mode = slide.engagement.type;
    element.prompt = slide.engagement.prompt;
    element.options = [...(slide.engagement.options || [])];
    element.correctAnswers = [...(slide.engagement.correctAnswers || [])];
    element.showCorrectAnswer = slide.engagement.showCorrectAnswer;
    element.correctAnswerRevealed = slide.engagement.correctAnswerRevealed ?? false;
    pruneElementCorrectAnswers(element);
  }
}

function shouldShowAudienceJoin(slide, slideIndex) {
  if (slide.audienceJoinForced) {
    return true;
  }
  if (slide.audienceJoinHidden) {
    return false;
  }
  return slideIndex === 0 || Boolean(slide.engagement?.enabled);
}

function syncAudienceJoinElements() {
  const accessCode = ensureAudienceCode();
  const joinUrl = audienceLink();
  const qrSrc = liveQrImageSrc(joinUrl);

  deck.slides.forEach((slide, slideIndex) => {
    slide.elements ||= [];
    const qr = slide.elements.find((element) => element.audienceJoinRole === "qr");
    const code = slide.elements.find((element) => element.audienceJoinRole === "code");
    if (!shouldShowAudienceJoin(slide, slideIndex)) {
      slide.elements = slide.elements.filter((element) => !element.audienceJoinRole);
      return;
    }

    if (qr) {
      qr.src = qrSrc;
      qr.alt = `Scan to join with access code ${accessCode}`;
    } else {
      slide.elements.push(createElement("image", {
        x: 1050,
        y: 430,
        w: 170,
        h: 170,
        src: qrSrc,
        fit: "contain",
        alt: `Scan to join with access code ${accessCode}`,
        name: "Audience QR code",
        audienceJoinRole: "qr",
      }));
    }

    if (code) {
      code.text = `Access code: ${accessCode}`;
    } else {
      slide.elements.push(createElement("text", {
        x: 980,
        y: 615,
        w: 300,
        h: 54,
        text: `Access code: ${accessCode}`,
        fontSize: 26,
        fontWeight: 700,
        align: "center",
        verticalAlign: "middle",
        name: "Audience access code",
        audienceJoinRole: "code",
      }));
    }
  });
}

function setStatus(message) {
  dom.statusText.textContent = message;
}

function updateSelectionLabel() {
  const selected = selectedElements();
  if (!selected.length) {
    dom.selectionText.textContent = "No selection";
  } else if (selected.length === 1) {
    const element = selected[0];
    dom.selectionText.textContent = `${element.name || element.type} · ${Math.round(element.x)}, ${Math.round(element.y)} · ${Math.round(element.w)} x ${Math.round(element.h)}`;
  } else {
    dom.selectionText.textContent = `${selected.length} elements selected`;
  }
}

function optionList(options, active) {
  return options.map((option) => `<option value="${option}" ${option === active ? "selected" : ""}>${option}</option>`).join("");
}

function audienceLink() {
  return audienceJoinUrl(ensureAudienceCode());
}

function ensureAudienceCode() {
  deck.settings ||= {};
  const current = String(deck.settings.audienceCode || "").replace(/\D/g, "").slice(0, 6);
  deck.settings.audienceCode = current.length === 6
    ? current
    : accessCodeForDeck(deck.id);
  return deck.settings.audienceCode;
}

function accessCodeForDeck(deckId) {
  let hash = 2166136261;
  for (const character of String(deckId || crypto.randomUUID?.() || Date.now())) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return String(100000 + (hash >>> 0) % 900000);
}

function readOrCreateParticipantId() {
  let value = localStorage.getItem(PARTICIPANT_ID_KEY);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(PARTICIPANT_ID_KEY, value);
  }
  return value;
}

function presenterTokenForDeck() {
  const key = `hyslides.presenterToken.${deck.id}`;
  let value = localStorage.getItem(key);
  if (!value) {
    value = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    localStorage.setItem(key, value);
  }
  return value;
}

function readActiveSession() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function writeActiveSession() {
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({
    deckId: deck.id,
    code: liveSession.code,
    instanceId: liveSession.instanceId,
    sessionName: liveSession.sessionName,
    status: liveSession.lifecycleStatus,
  }));
}

function clearActiveSession() {
  localStorage.removeItem(ACTIVE_SESSION_KEY);
}

function beginNewLiveSession() {
  liveSession.instanceId = crypto.randomUUID();
  liveSession.sessionName = `${deck.title || "Untitled presentation"} — ${new Date().toLocaleString()}`;
  liveSession.lastPublishedSignature = "";
  writeActiveSession();
}

function isTyping(target) {
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

function isSlideNavigatorTarget(target) {
  return Boolean(target?.closest?.("#slideList") || document.activeElement?.closest?.("#slideList"));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function attr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
