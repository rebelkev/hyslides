import {
  GRID_SIZE,
  DEFAULT_REACTION_OPTIONS,
  MAX_ENGAGEMENT_OPTIONS,
  MAX_REACTION_OPTIONS,
  normalizeEngagementOptionColors,
  REACTION_CATALOG,
  SLIDE_SIZE,
  cloneElement,
  cloneSlide,
  createDeck,
  createElement,
  createSection,
  createSlide,
  createSeedDeck,
  layoutTemplates,
  normalizeDeck,
  normalizeReactionOption,
  reactionEmoji,
  syncEngagementResultCharts,
} from "./schema.js";
import {
  boundsForElements,
  drawSlide,
  drawSlideAsync,
  hitTest,
  hitTestHandle,
  measureEngagementElementHeight,
  measureTextElementHeight,
  preloadSlideImages,
  resolveTextTypography,
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
  createRemoteControllerPairing,
  deleteLiveSession,
  getRemoteControllerCommands,
  getRemoteControllerState,
  getLiveSessionHistory,
  getLiveSession,
  isLocalJoinUrl,
  liveQrImageSrc,
  liveSessionIndicator,
  liveSnapshotForDeck,
  liveStateDeck,
  listLiveSessions,
  moderateLiveQuestion,
  normalizeLiveCode,
  publishLiveSession,
  publishRemoteControllerState,
  registerLiveParticipant,
  renameLiveSession,
  submitLiveResponse,
  submitLiveQuestion,
  voteLiveQuestion,
  sendRemoteControllerCommand,
} from "./live.js";
import { youtubeEmbedUrl, youtubeVideoId } from "./embed.js";
import { resizeBounds } from "./resize.js";
import { lucideIconSvgDataUri, normalizeLucideIconName, resolveLucideIconNode } from "./icon-assets.js";
import { backgroundShaderOptions } from "./backgrounds.js";

const dom = {
  app: document.querySelector("#app"),
  canvas: document.querySelector("#slideCanvas"),
  presenterCanvas: document.querySelector("#presenterCanvas"),
  presentationEmbedLayer: document.querySelector("#presentationEmbedLayer"),
  audienceCanvas: document.querySelector("#audienceCanvas"),
  audienceEmbedLayer: document.querySelector("#audienceEmbedLayer"),
  nextCanvas: document.querySelector("#nextCanvas"),
  viewport: document.querySelector("#canvasViewport"),
  textEditor: document.querySelector("#textEditor"),
  slideList: document.querySelector("#slideList"),
  addSectionBtn: document.querySelector("#addSectionBtn"),
  slideSelectionText: document.querySelector("#slideSelectionText"),
  moveSlideInput: document.querySelector("#moveSlideInput"),
  moveSlideBtn: document.querySelector("#moveSlideBtn"),
  slidesTabBtn: document.querySelector("#slidesTabBtn"),
  templatesTabBtn: document.querySelector("#templatesTabBtn"),
  slidesPanel: document.querySelector("#slidesPanel"),
  templatesPanel: document.querySelector("#templatesPanel"),
  slidePanelActions: document.querySelector("#slidePanelActions"),
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
  globalSettingsOverlay: document.querySelector("#globalSettingsOverlay"),
  globalSettingsContent: document.querySelector("#globalSettingsContent"),
  pptxImportOverlay: document.querySelector("#pptxImportOverlay"),
  pptxImportSummary: document.querySelector("#pptxImportSummary"),
  endSessionOverlay: document.querySelector("#endSessionOverlay"),
  presenterNotes: document.querySelector("#presenterNotes"),
  presenterSlideTitle: document.querySelector("#presenterSlideTitle"),
  presenterDeckTitle: document.querySelector("#presenterDeckTitle"),
  presenterTimer: document.querySelector("#presenterTimer"),
  presenterParticipantCount: document.querySelector("#presenterParticipantCount"),
  presenterResponseCount: document.querySelector("#presenterResponseCount"),
  presentationLiveStatus: document.querySelector("#presentationLiveStatus"),
  presenterConnectionStatus: document.querySelector("#presenterConnectionStatus"),
  presenterFlowCount: document.querySelector("#presenterFlowCount"),
  presenterSlideList: document.querySelector("#presenterSlideList"),
  presenterMobileFlowCount: document.querySelector("#presenterMobileFlowCount"),
  presenterMobileSlideList: document.querySelector("#presenterMobileSlideList"),
  presenterQnaList: document.querySelector("#presenterQnaList"),
  presenterQnaCount: document.querySelector("#presenterQnaCount"),
  nextSlideTitle: document.querySelector("#nextSlideTitle"),
  presentationBlackout: document.querySelector("#presentationBlackout"),
  presentationQuestionOverlay: document.querySelector("#presentationQuestionOverlay"),
  presentationQuestionText: document.querySelector("#presentationQuestionText"),
  liveControls: document.querySelector("#liveControls"),
  audienceContent: document.querySelector("#audienceContent"),
  audienceDeckTitle: document.querySelector("#audienceDeckTitle"),
  audienceQuestionOverlay: document.querySelector("#audienceQuestionOverlay"),
  audienceQuestionText: document.querySelector("#audienceQuestionText"),
  pptxInput: document.querySelector("#pptxInput"),
  imageInput: document.querySelector("#imageInput"),
};

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
let editorPresenterSyncTimer = null;
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
const remoteControllerMatch = location.hash.match(/^#remote-(\d{6})-([A-Za-z0-9-]+)$/);
const remoteControllerMode = Boolean(remoteControllerMatch);
const presenterChannel = "BroadcastChannel" in window ? new BroadcastChannel("hyslides-presenter") : null;
const PRESENTATION_CONTROL_STORAGE_KEY = "hyslides.presentationControl";
let skippedSlideIds = new Set();
let presentationBlackout = false;
let presentationControlUpdatedAt = 0;
let presenterStartedAt = 0;
let presenterTimerInterval = 0;
let countdownRuntime = new Map();
let countdownTickInterval = 0;
const presenterVideoStates = new Map();
const liveVideoPlayback = new Map();
let lastVideoTelemetryAt = 0;
let presenterQnaTab = "unanswered";
let presenterMobileTab = "control";
let remoteControllerState = null;
let remoteControllerPollTimer = 0;
let remoteControllerPublishTimer = 0;
let remoteControllerCommandsPolling = false;
let audienceOpen = false;
let participantQnaOpen = false;
let leftRailTab = "slides";
let inspectorTab = "properties";
const globalSettingsOpenSections = new Set(["audience"]);
let liveSession = {
  code: "",
  instanceId: "",
  sessionName: "",
  presenterToken: "",
  lifecycleStatus: "active",
  participantCount: 0,
  responseCount: 0,
  questions: [],
  featuredQuestion: null,
  joinUrl: "",
  qrSrc: "",
  backendAvailable: false,
  status: "Live session not started",
  publishTimer: null,
  pollTimer: null,
  publishing: false,
  polling: false,
  consecutiveFailures: 0,
  retryAfter: 0,
  lastPublishedSignature: "",
};
let audienceLive = {
  code: "",
  state: null,
  responses: {},
  drafts: {},
  loading: false,
  backendAvailable: false,
  error: "",
  pollTimer: null,
  lastRenderSignature: "",
};
const participantId = readOrCreateParticipantId();

const BULLET_EDITOR_PREFIX = "\u2022 ";

const ctx = dom.canvas.getContext("2d");
const presenterCtx = dom.presenterCanvas.getContext("2d");
const audienceCtx = dom.audienceCanvas.getContext("2d");
const nextCtx = dom.nextCanvas.getContext("2d");

function prepareHighResolutionCanvas(canvas, context) {
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    return 1;
  }
  const displayScale = Math.max(
    bounds.width / SLIDE_SIZE.width,
    bounds.height / SLIDE_SIZE.height
  );
  const resolutionScale = Math.max(
    1,
    Math.min(3, displayScale * Math.max(1, window.devicePixelRatio || 1))
  );
  const width = Math.round(SLIDE_SIZE.width * resolutionScale);
  const height = Math.round(SLIDE_SIZE.height * resolutionScale);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(resolutionScale, 0, 0, resolutionScale, 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return resolutionScale;
}

init();

async function init() {
  upgradeIconButtons();
  if (remoteControllerMode) {
    document.body.classList.add("remote-controller-window");
    document.querySelector("#remoteControllerApp")?.classList.remove("hidden");
    initRemoteController();
    return;
  }
  const saved = await loadCurrentDeck().catch(() => null);
  deck = normalizeDeck(saved || createSeedDeck());
  if (!presenterWindowMode && !presentationWindowMode && !location.hash.startsWith("#audience")) {
    clearDeckEngagementResults();
  }
  bindEvents();
  renderAll();
  resetHistory();
  setupCanvasAutoFit();
  setStatus("Ready");
  bindPresenterChannel();
  startBackgroundEffectLoop();
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
  document.querySelector("#connectRemoteControllerBtn")?.addEventListener("click", openRemotePairing);
  document.querySelector("#closeRemotePairingBtn")?.addEventListener("click", closeRemotePairing);
  document.querySelector("#remotePairingOverlay")?.addEventListener("click", (event) => {
    if (event.target.id === "remotePairingOverlay") closeRemotePairing();
  });
  const appMenuButton = document.querySelector("#appMenuBtn");
  const appMenu = document.querySelector("#appMenu");
  const helpOverlay = document.querySelector("#helpFaqOverlay");
  const closeAppMenu = () => {
    appMenu?.classList.add("hidden");
    appMenuButton?.setAttribute("aria-expanded", "false");
  };
  appMenuButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    const opening = appMenu.classList.contains("hidden");
    appMenu.classList.toggle("hidden", !opening);
    appMenuButton.setAttribute("aria-expanded", String(opening));
  });
  appMenu?.addEventListener("click", (event) => {
    if (event.target.closest("[role='menuitem']")) closeAppMenu();
  });
  document.querySelector("#helpFaqBtn")?.addEventListener("click", () => {
    helpOverlay.classList.remove("hidden");
    helpOverlay.setAttribute("aria-hidden", "false");
  });
  const closeHelp = () => {
    helpOverlay?.classList.add("hidden");
    helpOverlay?.setAttribute("aria-hidden", "true");
  };
  document.querySelector("#closeHelpFaqBtn")?.addEventListener("click", closeHelp);
  helpOverlay?.addEventListener("click", (event) => { if (event.target === helpOverlay) closeHelp(); });
  window.addEventListener("resize", () => {
    requestAnimationFrame(() => {
      if (presenterOpen) renderPresenter();
      if (audienceOpen) renderAudience();
    });
  });
  document.addEventListener("fullscreenchange", () => {
    requestAnimationFrame(() => {
      if (presenterOpen) renderPresenter();
      if (audienceOpen) renderAudience();
    });
  });
  window.addEventListener("message", handleYouTubePlayerMessage);
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
  document.querySelector("#globalSettingsBtn").addEventListener("click", openGlobalSettings);
  document.querySelector("#closeGlobalSettingsBtn").addEventListener("click", closeGlobalSettings);
  document.querySelector("#importPptxBtn")?.addEventListener("click", openPptxImport);
  document.querySelector("#closePptxImportBtn")?.addEventListener("click", closePptxImport);
  document.querySelector("#choosePptxFileBtn")?.addEventListener("click", () => dom.pptxInput.click());
  dom.pptxImportOverlay?.addEventListener("click", (event) => {
    if (event.target === dom.pptxImportOverlay) closePptxImport();
  });

  document.querySelector("#addSlideBtn").addEventListener("click", () => {
    const slide = createSlide({
      title: "Blank slide",
      layout: "blank",
      elements: [],
    });
    applyDeckDefaultBackground(slide);
    slide.backgroundUseDeckDefault = true;
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
  dom.slidesTabBtn?.addEventListener("click", () => setLeftRailTab("slides"));
  dom.templatesTabBtn?.addEventListener("click", () => setLeftRailTab("templates"));

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
    renderPptxImportSummary("Importing", ["Reading the presentation and translating supported content…"]);
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
      renderPptxImportSummary("Import complete", [
        ...(deck.importReport || []),
        ...(deck.unsupportedFeatures || []).map((item) => `Not imported: ${item}`),
      ]);
    } catch (error) {
      setStatus(`Import failed: ${error.message}`);
      renderPptxImportSummary("Import failed", [error.message]);
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
  document.querySelector("#resumeSessionBtn").addEventListener("click", closeEndSessionDialog);
  document.querySelector("#continueEndSessionBtn").addEventListener("click", applyEndSessionOptions);
  document.querySelector("#endCurrentSessionOption").addEventListener("change", updateEndSessionDependencies);
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
  document.querySelectorAll("[data-presenter-mobile-tab]").forEach((button) => {
    button.addEventListener("click", () => setPresenterMobileTab(button.dataset.presenterMobileTab));
  });
  document.querySelector("#qnaUnansweredTab").addEventListener("click", () => {
    presenterQnaTab = "unanswered";
    renderPresenterQna();
  });
  document.querySelector("#qnaAnsweredTab").addEventListener("click", () => {
    presenterQnaTab = "answered";
    renderPresenterQna();
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
  document.querySelector("#animationsTabBtn").addEventListener("click", () => {
    inspectorTab = "animations";
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
      const backgroundSlideId = dom.imageInput.dataset.backgroundSlideId;
      const shapeFillId = dom.imageInput.dataset.shapeFillId;
      if (backgroundSlideId) setSlideBackgroundFromFile(file, backgroundSlideId);
      else if (shapeFillId) setShapeFillFromFile(file, shapeFillId);
      else addImageFromFile(file);
    }
    dom.imageInput.dataset.backgroundSlideId = "";
    dom.imageInput.dataset.shapeFillId = "";
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
    if (!event.target.closest(".app-menu-wrap")) closeAppMenu();
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
  updateDocumentTitle();
  updateLeftRailTabs();
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
    undo: "undo-2", redo: "redo-2", timer: "timer", video: "video", "help-circle": "circle-help",
  };
  document.querySelectorAll("[data-icon]").forEach((control) => {
    const label = control.getAttribute("aria-label") || control.getAttribute("title") || control.textContent.trim();
    const icon = control.dataset.icon;
    const menuItem = control.getAttribute("role") === "menuitem";
    control.classList.add(menuItem ? "menu-icon-button" : "icon-button");
    control.setAttribute("aria-label", label);
    control.dataset.tooltip = label;
    control.innerHTML = menuItem ? `
      <span class="button-icon" data-lucide="${attr(lucideNames[icon] || icon)}" aria-hidden="true">
        <svg class="button-icon" aria-hidden="true" focusable="false"><use href="#icon-${icon}"></use></svg>
      </span>
      <span>${escapeHtml(label)}</span>
    ` : `
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

function openGlobalSettings() {
  dom.globalSettingsOverlay.classList.remove("hidden");
  dom.globalSettingsOverlay.setAttribute("aria-hidden", "false");
  renderGlobalSettings();
}

function closeGlobalSettings() {
  dom.globalSettingsOverlay.classList.add("hidden");
  dom.globalSettingsOverlay.setAttribute("aria-hidden", "true");
  renderAll();
}

function renderPptxImportSummary(title = "PowerPoint import support", extraItems = []) {
  const items = extraItems.length ? extraItems : pptxCapabilities();
  dom.pptxImportSummary.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    <ul class="unsupported-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    ${extraItems.length ? "" : `<p>Animations, transitions, SmartArt, advanced charts, embedded media, comments, and complex masters may require manual rebuilding after import.</p>`}
  `;
}

function openPptxImport() {
  renderPptxImportSummary();
  dom.pptxImportOverlay.classList.remove("hidden");
  dom.pptxImportOverlay.setAttribute("aria-hidden", "false");
}

function closePptxImport() {
  dom.pptxImportOverlay.classList.add("hidden");
  dom.pptxImportOverlay.setAttribute("aria-hidden", "true");
}

function globalSettingsSectionMarkup(id, title, description, content) {
  return `<details class="global-settings-section" data-global-settings-section="${attr(id)}" ${globalSettingsOpenSections.has(id) ? "open" : ""}>
    <summary><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></span><span class="accordion-chevron" aria-hidden="true">⌄</span></summary>
    <div class="global-settings-panel">${content}</div>
  </details>`;
}

function globalHexColorControlMarkup({ id, label, value, kind, styleId = "", property }) {
  const color = normalizeHexColor(value) || "#000000";
  return `<div class="field-row global-hex-color-control">
    <label>${escapeHtml(label)}</label>
    <button id="${attr(id)}" type="button" class="global-color-picker-trigger" data-open-global-color
      data-global-color-kind="${attr(kind)}" data-global-color-style="${attr(styleId)}" data-global-color-property="${attr(property)}" data-global-color-value="${attr(color)}" data-global-color-label="${attr(label)}">
      <span class="background-color-preview" style="background:${attr(color)}"></span><span class="background-color-value">${escapeHtml(color.toUpperCase())}</span>
    </button>
  </div>`;
}

function globalColorPickerModalMarkup() {
  const swatches = brandColorStyles().map((style) => `<button type="button" class="global-color-swatch" data-global-modal-swatch="${attr(style.color)}">
    <span class="swatch" style="background:${attr(style.color)}"></span><span>${escapeHtml(style.name)}</span><small>${escapeHtml(style.color.toUpperCase())}</small>
  </button>`).join("");
  return `<div id="globalColorPickerModal" class="global-color-modal hidden" role="dialog" aria-modal="true" aria-labelledby="globalColorPickerTitle" aria-hidden="true">
    <button class="global-color-modal-backdrop" type="button" data-close-global-color aria-label="Close color picker"></button>
    <div class="global-color-modal-card">
      <div class="global-color-modal-head"><div><strong id="globalColorPickerTitle">Choose color</strong><span>Use the visual picker, enter a hex value, or select a global style.</span></div><button type="button" data-close-global-color aria-label="Close color picker">×</button></div>
      <div class="global-color-modal-body">
        <div class="field-row"><label for="globalVisualColor">Visual color picker</label><input id="globalVisualColor" class="global-visual-color" type="color" value="#000000" /></div>
        <div class="field-row"><label for="globalModalHexColor">Hex value</label><input id="globalModalHexColor" class="hex-text-input" type="text" maxlength="7" spellcheck="false" value="#000000" /></div>
        <div class="global-color-swatches"><strong>Global color styles</strong>${swatches || `<span class="brand-palette-empty">No global color styles saved.</span>`}</div>
      </div>
      <div class="global-color-modal-actions"><button type="button" data-close-global-color>Done</button></div>
    </div>
  </div>`;
}

function globalColorStylesMarkup() {
  return `<div class="global-color-style-list">${brandColorStyles().map((style) => `<div class="global-color-style-row" data-global-color-style-row="${attr(style.id)}">
    <span class="swatch" style="background:${attr(style.color)}"></span>
    <input type="text" value="${attr(style.name)}" data-global-style-name="${attr(style.id)}" aria-label="Color style name" />
    <input class="hex-text-input" type="text" maxlength="7" value="${attr(style.color.toUpperCase())}" data-global-style-color="${attr(style.id)}" aria-label="${attr(style.name)} hex color" />
    <button type="button" data-global-style-remove="${attr(style.id)}" aria-label="Delete ${attr(style.name)}">×</button>
  </div>`).join("")}</div>
  <div class="global-color-style-add">
    <input id="newGlobalStyleName" type="text" placeholder="Color name" value="Brand ${brandColorStyles().length + 1}" />
    <input id="newGlobalStyleColor" class="hex-text-input" type="text" maxlength="7" value="${attr((deck.theme.colors.primary || "#2454d6").toUpperCase())}" />
    <button id="addGlobalColorStyle" type="button">Add color style</button>
  </div>`;
}

function applyDeckDefaultBackground(slide) {
  const background = deck.theme.defaultBackground || {};
  slide.backgroundType = background.type === "gradient" ? "gradient" : "color";
  slide.background = normalizeHexColor(background.color) || "#ffffff";
  slide.backgroundGradientStart = normalizeHexColor(background.gradientStart) || deck.theme.colors.primary;
  slide.backgroundGradientEnd = normalizeHexColor(background.gradientEnd) || deck.theme.colors.accent;
  slide.backgroundGradientAngle = Number.isFinite(Number(background.gradientAngle)) ? Number(background.gradientAngle) : 135;
  slide.backgroundStyleId = null;
  slide.backgroundGradientStartStyleId = null;
  slide.backgroundGradientEndStyleId = null;
}

function renderGlobalSettings() {
  const joinUrl = audienceLink();
  const styles = deck.theme.typographyStyles || {};
  deck.theme.defaultBackground ||= { type: "color", color: "#ffffff", gradientStart: deck.theme.colors.primary, gradientEnd: deck.theme.colors.accent, gradientAngle: 135 };
  deck.theme.logo ||= { src: "", corner: "bottom-right", showOnSlides: true, width: 120, margin: 28 };
  deck.theme.master ||= {};
  deck.theme.master.footer ||= { showSlideNumber: true, color: deck.theme.colors.muted };
  deck.theme.master.footer.disclaimer ||= { enabled: false, text: "", typographyStyleId: "caption", position: "bottom-center" };
  const defaultBackground = deck.theme.defaultBackground;
  const deckLogo = deck.theme.logo;
  const footerSettings = deck.theme.master.footer;
  const disclaimer = footerSettings.disclaimer;
  dom.globalSettingsContent.innerHTML = `
    ${globalSettingsSectionMarkup("audience", "Audience access", "Share the current link or six-digit code.", `
      <div class="global-audience-card">
        <img src="${attr(liveQrImageSrc(joinUrl))}" alt="Audience join QR code" />
        <div><strong>Access code ${escapeHtml(ensureAudienceCode())}</strong><div class="audience-join-url-row"><input id="globalAudienceUrl" readonly value="${attr(joinUrl)}" /><button id="copyGlobalAudienceUrl" type="button">Copy</button></div></div>
      </div>`)}
    ${globalSettingsSectionMarkup("branding", "Brand logo", "Upload once and control its default placement across the deck.", `
      <div class="global-logo-settings">
        <div class="global-logo-preview ${deckLogo.src ? "" : "empty"}">
          ${deckLogo.src ? `<img src="${attr(deckLogo.src)}" alt="Current deck logo" />` : `<span>No logo uploaded</span>`}
        </div>
        <div class="global-logo-actions">
          <label class="button-like" for="globalLogoUpload">${deckLogo.src ? "Replace logo" : "Upload logo"}</label>
          <input id="globalLogoUpload" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
          ${deckLogo.src ? `<button id="removeGlobalLogo" type="button">Remove logo</button>` : ""}
        </div>
        <div class="check-row"><input id="globalLogoDefaultVisible" type="checkbox" ${deckLogo.showOnSlides !== false ? "checked" : ""} /><label for="globalLogoDefaultVisible">Show on every slide by default</label></div>
        <div class="field-grid">
          <div class="field-row"><label for="globalLogoCorner">Default corner</label><select id="globalLogoCorner">${animationOptionList([["top-left", "Top left"], ["top-right", "Top right"], ["bottom-left", "Bottom left"], ["bottom-right", "Bottom right"]], deckLogo.corner || "bottom-right")}</select></div>
          <div class="field-row"><label for="globalLogoWidth">Width</label><input id="globalLogoWidth" type="number" min="32" max="320" step="4" value="${Number(deckLogo.width) || 120}" /></div>
        </div>
        <small>Individual slides can inherit this placement, choose another corner, or hide the logo.</small>
      </div>`)}
    ${globalSettingsSectionMarkup("furniture", "Slide numbers & disclaimer", "Deck-wide reference and legal text with per-slide overrides.", `
      <div class="global-slide-furniture">
        <div class="check-row"><input id="globalSlideNumberVisible" type="checkbox" ${footerSettings.showSlideNumber !== false ? "checked" : ""} /><label for="globalSlideNumberVisible">Show slide numbers by default</label></div>
        <div class="field-row"><label for="globalSlideNumberPosition">Slide number position</label><select id="globalSlideNumberPosition">${animationOptionList([["top-left", "Top left"], ["top-center", "Top center"], ["top-right", "Top right"], ["bottom-left", "Bottom left"], ["bottom-center", "Bottom center"], ["bottom-right", "Bottom right"]], footerSettings.slideNumberPosition || "bottom-right")}</select></div>
        <div class="check-row"><input id="globalDisclaimerEnabled" type="checkbox" ${disclaimer.enabled ? "checked" : ""} /><label for="globalDisclaimerEnabled">Show disclaimer by default</label></div>
        <div class="field-row"><label for="globalDisclaimerText">Disclaimer text</label><textarea id="globalDisclaimerText" maxlength="1000" placeholder="Confidential and proprietary">${escapeHtml(disclaimer.text || "")}</textarea></div>
        <div class="field-grid">
          <div class="field-row"><label for="globalDisclaimerStyle">Text style</label><select id="globalDisclaimerStyle">${animationOptionList(Object.entries(styles).map(([id, style]) => [id, style.name || id]), disclaimer.typographyStyleId || "caption")}</select></div>
          <div class="field-row"><label for="globalDisclaimerPosition">Position</label><select id="globalDisclaimerPosition">${animationOptionList([["top-left", "Top left"], ["top-center", "Top center"], ["top-right", "Top right"], ["bottom-left", "Bottom left"], ["bottom-center", "Bottom center"], ["bottom-right", "Bottom right"]], disclaimer.position || "bottom-center")}</select></div>
        </div>
        <small>These items sit above the slide background and below normal slide elements, so shapes and other content can cover them. Each slide can inherit, show, or hide them.</small>
      </div>`)}
    ${globalSettingsSectionMarkup("colors", "Color styles", "Named global swatches available in every HySlides color picker.", globalColorStylesMarkup())}
    ${globalSettingsSectionMarkup("background", "Default background", "Applied automatically to newly created blank slides.", `
      <div class="global-default-background">
        <div class="field-row"><label for="globalDefaultBackgroundType">Style</label><select id="globalDefaultBackgroundType">
          ${animationOptionList([["color", "Solid color"], ["gradient", "Gradient"]], defaultBackground.type || "color")}
        </select></div>
        ${defaultBackground.type === "gradient" ? `<div class="field-grid">
          ${globalHexColorControlMarkup({ id: "globalGradientStart", label: "Start", value: defaultBackground.gradientStart, kind: "background", property: "gradientStart" })}
          ${globalHexColorControlMarkup({ id: "globalGradientEnd", label: "End", value: defaultBackground.gradientEnd, kind: "background", property: "gradientEnd" })}
        </div><div class="field-row"><label for="globalGradientAngle">Angle</label><input id="globalGradientAngle" type="number" min="0" max="360" value="${Number(defaultBackground.gradientAngle) || 0}" /></div>`
        : globalHexColorControlMarkup({ id: "globalBackgroundColor", label: "Color", value: defaultBackground.color, kind: "background", property: "color" })}
        <small>This changes the starting style for new blank slides. Existing slides keep their current backgrounds.</small>
      </div>`)}
    ${globalSettingsSectionMarkup("typography", "Typography styles", "Linked text updates everywhere in this deck.", `
      <div class="typography-style-list">
        ${Object.entries(styles).map(([id, style]) => `<article class="typography-style-card" data-typography-style="${attr(id)}">
          <strong>${escapeHtml(style.name || id)}</strong>
          <div class="field-grid">
            <div class="field-row"><label>Font</label><input data-type-property="fontFamily" value="${attr(style.fontFamily || "Inter")}" /></div>
            <div class="field-row"><label>Size</label><input data-type-property="fontSize" type="number" min="8" max="240" value="${Number(style.fontSize) || 24}" /></div>
            <div class="field-row"><label>Weight</label><input data-type-property="fontWeight" type="number" min="100" max="900" step="50" value="${Number(style.fontWeight) || 500}" /></div>
            <div class="field-row"><label>Line height</label><input data-type-property="lineHeight" type="number" min="0.8" max="3" step="0.05" value="${Number(style.lineHeight) || 1.2}" /></div>
            ${globalHexColorControlMarkup({ id: `globalTypeColor-${id}`, label: "Color", value: style.color, kind: "typography", styleId: id, property: "color" })}
          </div>
        </article>`).join("")}
      </div>`)}
    ${globalColorPickerModalMarkup()}
  `;
  dom.globalSettingsContent.querySelectorAll("[data-global-settings-section]").forEach((section) => {
    section.addEventListener("toggle", () => {
      if (section.open) globalSettingsOpenSections.add(section.dataset.globalSettingsSection);
      else globalSettingsOpenSections.delete(section.dataset.globalSettingsSection);
    });
  });
  dom.globalSettingsContent.querySelector("#globalLogoUpload")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      deckLogo.src = String(reader.result || "");
      deckLogo.showOnSlides = true;
      markChanged("Deck logo uploaded");
      globalSettingsOpenSections.add("branding");
      renderGlobalSettings();
      renderCanvas();
      renderSlides();
      if (presenterOpen) renderPresenter();
    });
    reader.readAsDataURL(file);
  });
  dom.globalSettingsContent.querySelector("#removeGlobalLogo")?.addEventListener("click", () => {
    deckLogo.src = "";
    markChanged("Deck logo removed");
    renderGlobalSettings();
    renderCanvas();
    renderSlides();
    if (presenterOpen) renderPresenter();
  });
  dom.globalSettingsContent.querySelector("#globalLogoDefaultVisible")?.addEventListener("change", (event) => {
    deckLogo.showOnSlides = event.target.checked;
    markChanged("Deck logo visibility updated");
    renderCanvas();
    renderSlides();
    if (presenterOpen) renderPresenter();
  });
  dom.globalSettingsContent.querySelector("#globalLogoCorner")?.addEventListener("change", (event) => {
    deckLogo.corner = event.target.value;
    markChanged("Deck logo position updated");
    renderCanvas();
    renderSlides();
    if (presenterOpen) renderPresenter();
  });
  dom.globalSettingsContent.querySelector("#globalLogoWidth")?.addEventListener("change", (event) => {
    deckLogo.width = clamp(Number(event.target.value), 32, 320);
    markChanged("Deck logo size updated");
    renderCanvas();
    renderSlides();
    if (presenterOpen) renderPresenter();
  });
  const renderSlideFurnitureChange = (message) => {
    markChanged(message);
    renderCanvas();
    renderSlides();
    if (presenterOpen) renderPresenter();
    if (audienceOpen) renderAudience();
  };
  dom.globalSettingsContent.querySelector("#globalSlideNumberVisible")?.addEventListener("change", (event) => {
    footerSettings.showSlideNumber = event.target.checked;
    renderSlideFurnitureChange("Slide number default updated");
  });
  dom.globalSettingsContent.querySelector("#globalSlideNumberPosition")?.addEventListener("change", (event) => {
    footerSettings.slideNumberPosition = event.target.value;
    renderSlideFurnitureChange("Slide number position updated");
  });
  dom.globalSettingsContent.querySelector("#globalDisclaimerEnabled")?.addEventListener("change", (event) => {
    disclaimer.enabled = event.target.checked;
    renderSlideFurnitureChange("Disclaimer visibility updated");
  });
  dom.globalSettingsContent.querySelector("#globalDisclaimerText")?.addEventListener("input", (event) => {
    disclaimer.text = event.target.value;
    renderSlideFurnitureChange("Disclaimer text updated");
  });
  dom.globalSettingsContent.querySelector("#globalDisclaimerStyle")?.addEventListener("change", (event) => {
    disclaimer.typographyStyleId = event.target.value;
    renderSlideFurnitureChange("Disclaimer text style updated");
  });
  dom.globalSettingsContent.querySelector("#globalDisclaimerPosition")?.addEventListener("change", (event) => {
    disclaimer.position = event.target.value;
    renderSlideFurnitureChange("Disclaimer position updated");
  });
  dom.globalSettingsContent.querySelector("#copyGlobalAudienceUrl")?.addEventListener("click", async (event) => {
    const copied = await copyTextToClipboard(joinUrl);
    event.currentTarget.textContent = copied ? "Copied" : "Select link";
    if (!copied) dom.globalSettingsContent.querySelector("#globalAudienceUrl")?.select();
  });
  dom.globalSettingsContent.querySelectorAll("[data-type-property]").forEach((input) => {
    input.addEventListener("change", () => {
      const styleId = input.closest("[data-typography-style]").dataset.typographyStyle;
      const property = input.dataset.typeProperty;
      styles[styleId][property] = input.type === "number" ? Number(input.value) : input.value;
      for (const slide of deck.slides) {
        for (const element of slide.elements || []) {
          if (element.type === "text" && element.useGlobalTypography !== false && element.typographyStyleId === styleId && element.autoHeight) {
            element.h = measureTextElementHeight(ctx, element, deck);
          }
        }
      }
      markChanged(`${styles[styleId].name} typography updated`);
      renderCanvas();
      renderSlides();
      if (presenterOpen) renderPresenter();
    });
  });
  const colorModal = dom.globalSettingsContent.querySelector("#globalColorPickerModal");
  const modalHexInput = dom.globalSettingsContent.querySelector("#globalModalHexColor");
  const modalVisualInput = dom.globalSettingsContent.querySelector("#globalVisualColor");
  function commitGlobalModalColor(rawValue) {
    const color = normalizeHexColor(rawValue);
    if (!color) {
      modalHexInput.setCustomValidity("Enter a six-digit hex color such as #2454D6");
      modalHexInput.reportValidity();
      return false;
    }
    modalHexInput.setCustomValidity("");
    modalHexInput.value = color.toUpperCase();
    modalVisualInput.value = color;
    const trigger = dom.globalSettingsContent.querySelector(`#${CSS.escape(colorModal.dataset.triggerId || "")}`);
    if (trigger) {
      trigger.dataset.globalColorValue = color;
      trigger.querySelector(".background-color-preview").style.background = color;
      trigger.querySelector(".background-color-value").textContent = color.toUpperCase();
    }
    if (colorModal.dataset.colorKind === "typography") {
      styles[colorModal.dataset.colorStyle].color = color;
      markChanged(`${styles[colorModal.dataset.colorStyle].name} color updated`);
    } else {
      defaultBackground[colorModal.dataset.colorProperty] = color;
      markChanged("Default background updated");
    }
    renderCanvas();
    renderSlides();
    if (presenterOpen) renderPresenter();
    return true;
  }
  function closeGlobalColorModal() {
    colorModal.classList.add("hidden");
    colorModal.setAttribute("aria-hidden", "true");
  }
  dom.globalSettingsContent.querySelectorAll("[data-open-global-color]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const color = normalizeHexColor(trigger.dataset.globalColorValue) || "#000000";
      colorModal.dataset.triggerId = trigger.id;
      colorModal.dataset.colorKind = trigger.dataset.globalColorKind;
      colorModal.dataset.colorStyle = trigger.dataset.globalColorStyle || "";
      colorModal.dataset.colorProperty = trigger.dataset.globalColorProperty;
      colorModal.querySelector("#globalColorPickerTitle").textContent = trigger.dataset.globalColorKind === "typography"
        ? `${styles[trigger.dataset.globalColorStyle]?.name || "Typography"} color`
        : `${trigger.dataset.globalColorLabel || "Background"} color`;
      modalHexInput.value = color.toUpperCase();
      modalVisualInput.value = color;
      colorModal.classList.remove("hidden");
      colorModal.setAttribute("aria-hidden", "false");
      modalHexInput.focus();
      modalHexInput.select();
    });
  });
  modalHexInput.addEventListener("change", () => commitGlobalModalColor(modalHexInput.value));
  modalVisualInput.addEventListener("input", () => commitGlobalModalColor(modalVisualInput.value));
  dom.globalSettingsContent.querySelectorAll("[data-global-modal-swatch]").forEach((button) => {
    button.addEventListener("click", () => commitGlobalModalColor(button.dataset.globalModalSwatch));
  });
  dom.globalSettingsContent.querySelectorAll("[data-close-global-color]").forEach((button) => button.addEventListener("click", closeGlobalColorModal));
  colorModal.addEventListener("keydown", (event) => { if (event.key === "Escape") closeGlobalColorModal(); });
  dom.globalSettingsContent.querySelector("#globalDefaultBackgroundType")?.addEventListener("change", (event) => {
    defaultBackground.type = event.target.value;
    markChanged("Default background style updated");
    renderGlobalSettings();
  });
  dom.globalSettingsContent.querySelector("#globalGradientAngle")?.addEventListener("change", (event) => {
    defaultBackground.gradientAngle = clamp(Number(event.target.value), 0, 360);
    markChanged("Default gradient angle updated");
  });
  dom.globalSettingsContent.querySelectorAll("[data-global-style-name]").forEach((input) => input.addEventListener("change", () => {
    updateBrandColorStyle(input.dataset.globalStyleName, { name: input.value }, false);
    renderGlobalSettings();
  }));
  dom.globalSettingsContent.querySelectorAll("[data-global-style-color]").forEach((input) => input.addEventListener("change", () => {
    const color = normalizeHexColor(input.value);
    if (!color) { input.setCustomValidity("Enter a six-digit hex color"); input.reportValidity(); return; }
    updateBrandColorStyle(input.dataset.globalStyleColor, { color }, false);
    renderGlobalSettings();
  }));
  dom.globalSettingsContent.querySelectorAll("[data-global-style-remove]").forEach((button) => button.addEventListener("click", () => {
    removeBrandColorStyle(button.dataset.globalStyleRemove);
    renderGlobalSettings();
  }));
  dom.globalSettingsContent.querySelector("#addGlobalColorStyle")?.addEventListener("click", () => {
    const name = dom.globalSettingsContent.querySelector("#newGlobalStyleName").value.trim() || `Brand ${brandColorStyles().length + 1}`;
    const color = normalizeHexColor(dom.globalSettingsContent.querySelector("#newGlobalStyleColor").value);
    if (!color) { setStatus("Use a valid six-digit hex color"); return; }
    deck.theme.brandColorStyles = [...brandColorStyles(), { id: `brand-${Date.now().toString(36)}`, name, color }].slice(0, 24);
    deck.theme.brandPalette = deck.theme.brandColorStyles.map((style) => style.color);
    markChanged("Global color style added");
    renderGlobalSettings();
  });
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
      ${reactions.length ? `<div class="session-result-list">${reactions.map(([label, count]) => `<div><span>${REACTION_CATALOG[label] || escapeHtml(label)}</span><strong>${Number(count)}</strong></div>`).join("")}</div>` : ""}
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
      clearDeckEngagementResults(nextDeck);
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
    showEngagementPlaceholders: true,
    elementStates: editorAnimationStates,
  });
  preloadSlideImages(currentSlide(), deck).then(() => {
    drawSlide(ctx, currentSlide(), deck, {
      selectedIds,
      guides,
      includeSelection: true,
      scale: zoom,
      showEngagementPlaceholders: true,
      elementStates: editorAnimationStates,
    });
  });
}

function startBackgroundEffectLoop() {
  let lastPaint = 0;
  const paint = (time) => {
    const slide = currentSlide();
    const hasAnimatedShape = slide?.elements?.some((element) => element.type === "shape" && element.fillType === "animated" && element.fillShader && element.fillShader !== "none");
    if (((slide?.backgroundShader && slide.backgroundShader !== "none") || hasAnimatedShape) && time - lastPaint >= 40) {
      if (presenterOpen) drawPresentationCountdownFrame();
      if (!presenterWindowMode && !presentationWindowMode && !audienceOpen) renderCanvas();
      lastPaint = time;
    }
    window.requestAnimationFrame(paint);
  };
  window.requestAnimationFrame(paint);
}

function autoSizeTextElements(slide) {
  for (const element of slide.elements || []) {
    if (element.type === "text" && element.autoHeight !== false) {
      element.h = measureTextElementHeight(ctx, element, deck);
    }
    if (element.type === "engagement" && ["poll", "multipleChoice"].includes(element.mode)) {
      const availableHeight = Math.max(160, SLIDE_SIZE.height - element.y - 20);
      const fittedHeight = Math.min(measureEngagementElementHeight(element), availableHeight);
      element.h = Math.max(element.h, fittedHeight);
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
  dom.templateList.innerHTML = "";
  for (const template of layoutTemplates) {
    const item = document.createElement("article");
    item.className = "template-thumb";
    item.innerHTML = `<canvas width="192" height="108" aria-hidden="true"></canvas><div class="template-card-footer"><strong>${escapeHtml(template.name)}</strong><button type="button">Add to deck</button></div>`;
    item.querySelector("button").addEventListener("click", () => {
      const slide = template.apply();
      slide.sectionId = currentSlide()?.sectionId || null;
      deck.slides.splice(activeSlideIndex + 1, 0, slide);
      activeSlideIndex += 1;
      selectedSlideIndexes = new Set([activeSlideIndex]);
      slideSelectionAnchor = activeSlideIndex;
      openSlideMenuIndex = null;
      openSectionMenuId = null;
      selectedIds = [];
      leftRailTab = "slides";
      markChanged(`${template.name} slide inserted`);
      renderAll();
    });
    dom.templateList.append(item);
    const previewSlide = template.apply();
    autoSizeTextElements(previewSlide);
    drawThumb(item.querySelector("canvas"), previewSlide);
  }
}

function setLeftRailTab(tab) {
  leftRailTab = tab === "templates" ? "templates" : "slides";
  updateLeftRailTabs();
}

function updateLeftRailTabs() {
  const showingTemplates = leftRailTab === "templates";
  dom.slidesTabBtn?.classList.toggle("active", !showingTemplates);
  dom.templatesTabBtn?.classList.toggle("active", showingTemplates);
  dom.slidesTabBtn?.setAttribute("aria-selected", String(!showingTemplates));
  dom.templatesTabBtn?.setAttribute("aria-selected", String(showingTemplates));
  dom.slidesPanel?.classList.toggle("hidden", showingTemplates);
  dom.templatesPanel?.classList.toggle("hidden", !showingTemplates);
  dom.slidePanelActions?.classList.toggle("hidden", showingTemplates);
}

function renderInspector() {
  const propertiesTab = document.querySelector("#propertiesTabBtn");
  const elementsTab = document.querySelector("#elementsTabBtn");
  const animationsTab = document.querySelector("#animationsTabBtn");
  propertiesTab.classList.toggle("active", inspectorTab === "properties");
  elementsTab.classList.toggle("active", inspectorTab === "elements");
  animationsTab.classList.toggle("active", inspectorTab === "animations");
  propertiesTab.setAttribute("aria-selected", String(inspectorTab === "properties"));
  elementsTab.setAttribute("aria-selected", String(inspectorTab === "elements"));
  animationsTab.setAttribute("aria-selected", String(inspectorTab === "animations"));
  if (inspectorTab === "elements") {
    renderElementTree();
    return;
  }
  if (inspectorTab === "animations") {
    renderAnimationPanel();
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

function renderAnimationPanel() {
  const items = animatedElements(currentSlide());
  const groups = [
    ["slideStart", "On slide start"],
    ["withPrevious", "With previous"],
    ["afterPrevious", "After previous"],
    ["onClick", "On click"],
  ];
  const sections = groups.map(([trigger, label]) => {
    const groupItems = items.filter((element) => normalizedAnimation(element).trigger === trigger);
    if (!groupItems.length) return "";
    return `<section class="animation-sequence-group" data-animation-group="${trigger}">
      <div class="animation-group-heading"><strong>${label}</strong><span>${groupItems.length}</span></div>
      <ol class="animation-sequence-list">${groupItems.map(animationSequenceRow).join("")}</ol>
    </section>`;
  }).join("");
  dom.inspector.innerHTML = `
    <section class="inspector-section animation-panel-heading">
      <div class="element-tree-heading"><strong>Slide animations</strong><span>${items.length}</span></div>
      <p class="element-tree-help">Drag items within a trigger group to change playback order. Select an item to locate it on the slide.</p>
      <div class="animation-preview-actions">
        <button id="previewAllAnimationsBtn" class="primary" type="button">Preview entire slide</button>
        <button id="restartAllAnimationsBtn" type="button">Restart preview</button>
      </div>
    </section>
    ${sections || '<section class="inspector-section"><p class="element-tree-empty">No animations on this slide. Select an element and choose an effect in Properties.</p></section>'}`;
  window.lucide?.createIcons({ attrs: { "stroke-width": 1.8 } });
  dom.inspector.querySelector("#previewAllAnimationsBtn")?.addEventListener("click", previewSlideAnimations);
  dom.inspector.querySelector("#restartAllAnimationsBtn")?.addEventListener("click", previewSlideAnimations);
  let draggedId = "";
  dom.inspector.querySelectorAll(".animation-sequence-row[data-animation-id]").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      selectedIds = [row.dataset.animationId];
      dom.inspector.querySelectorAll(".animation-sequence-row").forEach((item) => item.classList.toggle("selected", item === row));
      renderCanvas();
      updateSelectionLabel();
    });
    row.addEventListener("dblclick", () => {
      selectedIds = [row.dataset.animationId];
      inspectorTab = "properties";
      renderAll();
    });
    row.addEventListener("dragstart", () => {
      draggedId = row.dataset.animationId;
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => row.classList.remove("dragging"));
    row.addEventListener("dragover", (event) => event.preventDefault());
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      reorderAnimation(draggedId, row.dataset.animationId);
    });
  });
  dom.inspector.querySelectorAll("[data-animation-move]").forEach((button) => {
    button.addEventListener("click", () => moveAnimationByStep(button.dataset.animationId, Number(button.dataset.animationMove)));
  });
  dom.inspector.querySelectorAll("[data-animation-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedIds = [button.dataset.animationEdit];
      inspectorTab = "properties";
      renderAll();
    });
  });
}

function animationSequenceRow(element, index) {
  const animation = normalizedAnimation(element);
  const label = element.name || `${element.type[0].toUpperCase()}${element.type.slice(1)}`;
  return `<li class="animation-sequence-row ${selectedIds.includes(element.id) ? "selected" : ""}" draggable="true" data-animation-id="${attr(element.id)}">
    <span class="animation-drag-handle" title="Drag to reorder" aria-hidden="true">⋮⋮</span>
    <span class="animation-sequence-number">${index + 1}</span>
    <span class="animation-sequence-copy"><strong>${escapeHtml(label)}</strong><small>${animationEffectLabel(animation.effect)} · ${animation.delayMs}ms delay · ${animation.durationMs}ms</small></span>
    <span class="animation-row-actions">
      <button type="button" data-animation-move="-1" data-animation-id="${attr(element.id)}" title="Move earlier">↑</button>
      <button type="button" data-animation-move="1" data-animation-id="${attr(element.id)}" title="Move later">↓</button>
      <button type="button" data-animation-edit="${attr(element.id)}" title="Edit animation">Edit</button>
    </span>
  </li>`;
}

function animationEffectLabel(effect) {
  return effect === "fadeIn" ? "Fade in" : effect === "appear" ? "Appear" : "None";
}

function reorderAnimation(movingId, targetId) {
  if (!movingId || movingId === targetId) return;
  const items = animatedElements(currentSlide());
  const moving = items.find((element) => element.id === movingId);
  const target = items.find((element) => element.id === targetId);
  if (!moving || !target || normalizedAnimation(moving).trigger !== normalizedAnimation(target).trigger) return;
  const reordered = items.filter((element) => element.id !== movingId);
  reordered.splice(reordered.findIndex((element) => element.id === targetId), 0, moving);
  applyAnimationOrder(reordered);
}

function moveAnimationByStep(elementId, direction) {
  const items = animatedElements(currentSlide());
  const index = items.findIndex((element) => element.id === elementId);
  if (index < 0) return;
  const trigger = normalizedAnimation(items[index]).trigger;
  let targetIndex = index + Math.sign(direction);
  while (items[targetIndex] && normalizedAnimation(items[targetIndex]).trigger !== trigger) targetIndex += Math.sign(direction);
  if (!items[targetIndex]) return;
  [items[index], items[targetIndex]] = [items[targetIndex], items[index]];
  applyAnimationOrder(items);
}

function applyAnimationOrder(items) {
  items.forEach((element, index) => setElementAnimation(element, "order", index));
  markChanged("Animation order updated");
  renderAnimationPanel();
  renderCanvas();
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
    embed: ["video", "image"],
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
  const deckLogo = deck.theme.logo || {};
  const slideLogoVisible = slide.logoVisible == null ? deckLogo.showOnSlides !== false : Boolean(slide.logoVisible);
  const slideLogoCorner = slide.logoCorner || deckLogo.corner || "bottom-right";
  const footerSettings = deck.theme.master?.footer || {};
  const disclaimerSettings = footerSettings.disclaimer || {};
  const slideNumberVisible = slide.slideNumberVisible == null ? footerSettings.showSlideNumber !== false : Boolean(slide.slideNumberVisible);
  const slideNumberPosition = slide.slideNumberPosition || footerSettings.slideNumberPosition || "bottom-right";
  const disclaimerVisible = slide.disclaimerVisible == null ? Boolean(disclaimerSettings.enabled) : Boolean(slide.disclaimerVisible);
  const disclaimerPosition = slide.disclaimerPosition || disclaimerSettings.position || "bottom-center";
  const usesDeckBackground = slide.backgroundUseDeckDefault === true;
  const backgroundSlide = usesDeckBackground
    ? {
        ...slide,
        backgroundType: deck.theme.defaultBackground?.type || "color",
        background: deck.theme.defaultBackground?.color || "#ffffff",
        backgroundGradientStart: deck.theme.defaultBackground?.gradientStart || deck.theme.colors.primary,
        backgroundGradientEnd: deck.theme.defaultBackground?.gradientEnd || deck.theme.colors.accent,
        backgroundGradientAngle: deck.theme.defaultBackground?.gradientAngle ?? 135,
      }
    : slide;
  const furniturePositions = [["top-left", "Top left"], ["top-center", "Top center"], ["top-right", "Top right"], ["bottom-left", "Bottom left"], ["bottom-center", "Bottom center"], ["bottom-right", "Bottom right"]];
  dom.inspector.innerHTML = `
    <section class="inspector-section">
      <strong>Slide</strong>
      <div class="field-row"><label for="slideTitleInput">Title</label><input id="slideTitleInput" value="${attr(slide.title)}" /></div>
      <div class="field-row"><label for="notesInput">Presenter notes</label><textarea id="notesInput">${escapeHtml(slide.notes || "")}</textarea></div>
    </section>
    ${deckLogo.src ? `<section class="inspector-section">
      <strong>Brand logo</strong>
      <div class="check-row"><input id="slideLogoVisibleInput" type="checkbox" ${slideLogoVisible ? "checked" : ""} /><label for="slideLogoVisibleInput">Show logo on this slide</label></div>
      <div class="field-row"><label for="slideLogoCornerInput">Corner</label><select id="slideLogoCornerInput">${animationOptionList([["top-left", "Top left"], ["top-right", "Top right"], ["bottom-left", "Bottom left"], ["bottom-right", "Bottom right"]], slideLogoCorner)}</select></div>
      <button id="resetSlideLogoBtn" type="button">Use deck defaults</button>
      <small>${slide.logoVisible == null && !slide.logoCorner ? "Using deck defaults" : "This slide has a logo override"}</small>
    </section>` : ""}
    <section class="inspector-section">
      <strong>Slide number</strong>
      <div class="check-row"><input id="slideNumberVisibleInput" type="checkbox" ${slideNumberVisible ? "checked" : ""} /><label for="slideNumberVisibleInput">Show slide number</label></div>
      <div class="field-row"><label for="slideNumberPositionInput">Position</label><select id="slideNumberPositionInput">${animationOptionList(furniturePositions, slideNumberPosition)}</select></div>
      <button id="resetSlideNumberBtn" type="button">Use deck defaults</button>
      <small>${slide.slideNumberVisible == null && !slide.slideNumberPosition ? "Using deck defaults" : "This slide has a slide-number override"}</small>
    </section>
    <section class="inspector-section">
      <strong>Disclaimer</strong>
      <div class="check-row"><input id="slideDisclaimerVisibleInput" type="checkbox" ${disclaimerVisible ? "checked" : ""} /><label for="slideDisclaimerVisibleInput">Show disclaimer</label></div>
      <div class="field-row"><label for="slideDisclaimerPositionInput">Position</label><select id="slideDisclaimerPositionInput">${animationOptionList(furniturePositions, disclaimerPosition)}</select></div>
      <button id="resetSlideDisclaimerBtn" type="button">Use deck defaults</button>
      <small>${slide.disclaimerVisible == null && !slide.disclaimerPosition ? "Using deck defaults" : "This slide has a disclaimer override"}</small>
      <small>${disclaimerSettings.text ? "The disclaimer sits below normal slide elements." : "Add disclaimer text in Global deck settings."}</small>
    </section>
    <section class="inspector-section">
      <strong>Background</strong>
      <div class="check-row"><input id="useDeckBackgroundInput" type="checkbox" ${usesDeckBackground ? "checked" : ""} /><label for="useDeckBackgroundInput">Use deck default background</label></div>
      ${usesDeckBackground ? "" : `
      <div class="field-row"><label for="backgroundTypeInput">Style</label><select id="backgroundTypeInput">
        ${animationOptionList([["color", "Solid color"], ["gradient", "Gradient"], ["image", "Image"], ["animated", "Animated effect"]], backgroundSlide.backgroundType || "color")}
      </select></div>
      ${backgroundSlide.backgroundType === "gradient" ? `
        <div class="field-grid">
          ${backgroundColorControlMarkup("gradientStartInput", "Start", backgroundSlide.backgroundGradientStart || deck.theme.colors.primary, "backgroundGradientStart", "backgroundGradientStartStyleId", backgroundSlide.backgroundGradientStartStyleId)}
          ${backgroundColorControlMarkup("gradientEndInput", "End", backgroundSlide.backgroundGradientEnd || deck.theme.colors.accent, "backgroundGradientEnd", "backgroundGradientEndStyleId", backgroundSlide.backgroundGradientEndStyleId)}
        </div>
        <div class="field-row"><label for="gradientAngleInput">Angle</label><input id="gradientAngleInput" type="range" min="0" max="360" step="1" value="${Number(backgroundSlide.backgroundGradientAngle) || 0}" /><span>${Math.round(Number(backgroundSlide.backgroundGradientAngle) || 0)}°</span></div>
      ` : backgroundSlide.backgroundType === "image" ? `
        <div class="field-row"><label>Image</label><button id="chooseBackgroundImageBtn" type="button">${backgroundSlide.backgroundImage ? "Replace image" : "Choose image"}</button>${backgroundSlide.backgroundImage ? `<button id="removeBackgroundImageBtn" type="button">Remove image</button>` : ""}</div>
        <div class="field-row"><label for="backgroundImageFitInput">Fit</label><select id="backgroundImageFitInput">${animationOptionList([["cover", "Fill slide (crop)"], ["contain", "Fit entire image"]], backgroundSlide.backgroundImageFit || "cover")}</select><small>Images always retain their proportions.</small></div>
      ` : backgroundSlide.backgroundType === "animated" ? `
        <div class="field-row"><label for="backgroundShaderInput">Effect</label><select id="backgroundShaderInput">${animationOptionList(backgroundShaderOptions.filter((item) => item.value !== "none").map((item) => [item.value, item.label]), backgroundSlide.backgroundShader || "aurora")}</select></div>
        <div class="field-grid">
          ${backgroundColorControlMarkup("backgroundEffectColorAInput", "Effect color 1", backgroundSlide.backgroundEffectColorA || deck.theme.colors.primary, "backgroundEffectColorA", "backgroundEffectColorAStyleId", backgroundSlide.backgroundEffectColorAStyleId)}
          ${backgroundColorControlMarkup("backgroundEffectColorBInput", "Effect color 2", backgroundSlide.backgroundEffectColorB || deck.theme.colors.accent, "backgroundEffectColorB", "backgroundEffectColorBStyleId", backgroundSlide.backgroundEffectColorBStyleId)}
        </div>
        <div class="field-grid">
          <div class="field-row"><label for="backgroundShaderIntensityInput">Intensity (%)</label><input id="backgroundShaderIntensityInput" type="number" min="0" max="100" step="1" value="${Math.round((Number.isFinite(Number(backgroundSlide.backgroundShaderIntensity)) ? Number(backgroundSlide.backgroundShaderIntensity) : 0.5) * 100)}" /></div>
          <div class="field-row"><label for="backgroundShaderSpeedInput">Speed</label><input id="backgroundShaderSpeedInput" type="number" min="0.1" max="3" step="0.1" value="${Number(backgroundSlide.backgroundShaderSpeed) || 1}" /></div>
        </div>
      ` : backgroundColorControlMarkup("slideBgInput", "Color", backgroundSlide.background || "#ffffff", "background", "backgroundStyleId", backgroundSlide.backgroundStyleId)}
      <div class="check-row"><input id="backgroundOverlayEnabledInput" type="checkbox" ${backgroundSlide.backgroundOverlayEnabled ? "checked" : ""} /><label for="backgroundOverlayEnabledInput">Overlay</label></div>
      ${backgroundSlide.backgroundOverlayEnabled ? `<div class="field-grid">
        ${backgroundColorControlMarkup("backgroundOverlayColorInput", "Color", backgroundSlide.backgroundOverlayColor || "#000000", "backgroundOverlayColor", "backgroundOverlayColorStyleId", backgroundSlide.backgroundOverlayColorStyleId)}
        <div class="field-row"><label for="backgroundOverlayOpacityInput">Opacity (%)</label><input id="backgroundOverlayOpacityInput" type="number" min="0" max="100" step="1" value="${Math.round((Number(backgroundSlide.backgroundOverlayOpacity) || 0) * 100)}" /></div>
      </div>` : ""}
      `}
      <button id="resetSlideBackgroundBtn" type="button">Use deck defaults</button>
      <small>${usesDeckBackground ? "Using deck defaults" : "This slide has a background override"}</small>
    </section>
    <section class="inspector-section">
      <strong>Canvas</strong>
      <div class="check-row"><input id="snapToggle" type="checkbox" ${deck.settings.snapToGrid ? "checked" : ""} /><label for="snapToggle">Snap to grid</label></div>
      <div class="check-row"><input id="guideToggle" type="checkbox" ${deck.settings.showGuides ? "checked" : ""} /><label for="guideToggle">Alignment guides</label></div>
    </section>
    <section class="inspector-section">
      <strong>Audience access</strong>
      <div class="check-row"><input id="audienceJoinElementsToggle" type="checkbox" ${audienceJoinVisible ? "checked" : ""} /><label for="audienceJoinElementsToggle">Show QR code and access code on this slide</label></div>
      <div class="field-row">
        <label>Audience join</label>
        <div class="audience-join-url-row">
          <input id="audienceJoinUrlInput" readonly value="${attr(audienceLink())}" />
          <button id="copyAudienceJoinUrlBtn" type="button">Copy</button>
        </div>
        <div class="live-link-card compact">
          <img src="${attr(liveQrImageSrc(audienceLink()))}" alt="Audience QR code" />
          <span>Scan or enter access code <strong>${escapeHtml(ensureAudienceCode())}</strong></span>
        </div>
      </div>
    </section>
  `;

  bindValue("#slideTitleInput", (value) => (slide.title = value));
  bindValue("#notesInput", (value) => (slide.notes = value));
  document.querySelector("#slideLogoVisibleInput")?.addEventListener("change", (event) => {
    slide.logoVisible = event.target.checked;
    markChanged("Slide logo visibility updated");
    renderCanvas();
    renderSlides();
    if (presenterOpen) renderPresenter();
  });
  document.querySelector("#slideLogoCornerInput")?.addEventListener("change", (event) => {
    slide.logoCorner = event.target.value;
    markChanged("Slide logo position updated");
    renderCanvas();
    renderSlides();
    if (presenterOpen) renderPresenter();
  });
  document.querySelector("#resetSlideLogoBtn")?.addEventListener("click", () => {
    slide.logoVisible = null;
    slide.logoCorner = null;
    markChanged("Slide logo reset to deck defaults");
    renderAll();
  });
  const setSlideFurnitureOverride = (property, value, message) => {
    slide[property] = value;
    markChanged(message);
    renderCanvas();
    renderSlides();
    if (presenterOpen) renderPresenter();
    if (audienceOpen) renderAudience();
  };
  document.querySelector("#slideNumberVisibleInput")?.addEventListener("change", (event) => {
    setSlideFurnitureOverride("slideNumberVisible", event.target.checked, "Slide number override updated");
  });
  document.querySelector("#slideNumberPositionInput")?.addEventListener("change", (event) => {
    setSlideFurnitureOverride("slideNumberPosition", event.target.value, "Slide number position updated");
  });
  document.querySelector("#resetSlideNumberBtn")?.addEventListener("click", () => {
    slide.slideNumberVisible = null;
    slide.slideNumberPosition = null;
    markChanged("Slide number reset to deck defaults");
    renderAll();
  });
  document.querySelector("#slideDisclaimerVisibleInput")?.addEventListener("change", (event) => {
    setSlideFurnitureOverride("disclaimerVisible", event.target.checked, "Slide disclaimer override updated");
  });
  document.querySelector("#slideDisclaimerPositionInput")?.addEventListener("change", (event) => {
    setSlideFurnitureOverride("disclaimerPosition", event.target.value, "Slide disclaimer position updated");
  });
  document.querySelector("#resetSlideDisclaimerBtn")?.addEventListener("click", () => {
    slide.disclaimerVisible = null;
    slide.disclaimerPosition = null;
    markChanged("Slide disclaimer reset to deck defaults");
    renderAll();
  });
  document.querySelector("#useDeckBackgroundInput")?.addEventListener("change", (event) => {
    slide.backgroundUseDeckDefault = event.target.checked;
    if (!slide.backgroundUseDeckDefault) applyDeckDefaultBackground(slide);
    markChanged(slide.backgroundUseDeckDefault ? "Using deck default background" : "Slide background override enabled");
    renderAll();
  });
  document.querySelector("#resetSlideBackgroundBtn")?.addEventListener("click", () => {
    slide.backgroundUseDeckDefault = true;
    markChanged("Slide background reset to deck defaults");
    renderAll();
  });
  document.querySelector("#copyAudienceJoinUrlBtn")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const copied = await copyTextToClipboard(audienceLink());
    button.textContent = copied ? "Copied" : "Select link";
    if (!copied) document.querySelector("#audienceJoinUrlInput")?.select();
    setStatus(copied ? "Audience join link copied" : "Select and copy the audience join link");
    window.setTimeout(() => {
      if (button.isConnected) button.textContent = "Copy";
    }, 1600);
  });
  document.querySelector("#backgroundTypeInput")?.addEventListener("change", (event) => {
    slide.backgroundUseDeckDefault = false;
    slide.backgroundType = event.target.value;
    if (slide.backgroundType === "animated" && (!slide.backgroundShader || slide.backgroundShader === "none")) slide.backgroundShader = "aurora";
    if (slide.backgroundType !== "animated") slide.backgroundShader = "none";
    markChanged("Slide background style updated");
    renderAll();
  });
  bindBackgroundColorControls(slide);
  bindNumber("#gradientAngleInput", (value) => (slide.backgroundGradientAngle = value));
  bindValue("#backgroundImageFitInput", (value) => (slide.backgroundImageFit = value));
  bindToggle("#backgroundOverlayEnabledInput", (value) => {
    slide.backgroundOverlayEnabled = value;
    if (value && !Number(slide.backgroundOverlayOpacity)) slide.backgroundOverlayOpacity = 0.2;
  });
  bindNumber("#backgroundOverlayOpacityInput", (value) => (slide.backgroundOverlayOpacity = clamp(value / 100, 0, 1)));
  document.querySelector("#backgroundShaderInput")?.addEventListener("change", (event) => {
    slide.backgroundShader = event.target.value;
    markChanged("Background effect updated");
    renderAll();
  });
  bindNumber("#backgroundShaderIntensityInput", (value) => (slide.backgroundShaderIntensity = clamp(value / 100, 0, 1)));
  bindNumber("#backgroundShaderSpeedInput", (value) => (slide.backgroundShaderSpeed = clamp(value, 0.1, 3)));
  document.querySelector("#chooseBackgroundImageBtn")?.addEventListener("click", () => {
    dom.imageInput.dataset.replaceId = "";
    dom.imageInput.dataset.backgroundSlideId = slide.id;
    dom.imageInput.click();
  });
  document.querySelector("#removeBackgroundImageBtn")?.addEventListener("click", () => {
    slide.backgroundImage = "";
    slide.backgroundType = "color";
    markChanged("Background image removed");
    renderAll();
  });
  bindToggle("#snapToggle", (value) => (deck.settings.snapToGrid = value));
  bindToggle("#guideToggle", (value) => (deck.settings.showGuides = value));
  bindToggle("#audienceJoinElementsToggle", (value) => {
    const defaultVisible = activeSlideIndex === 0 || slide.engagement.enabled;
    slide.audienceJoinForced = value && !defaultVisible;
    slide.audienceJoinHidden = !value && defaultVisible;
    syncAudienceJoinElements();
  });
}

function renderElementInspector(element) {
  if (element.type === "icon" && !element.iconSrc) refreshIconAsset(element);
  const animation = normalizedAnimation(element);
  dom.inspector.innerHTML = `
    <section class="inspector-section element-inspector-heading">
      <div class="element-heading-row">
        <button
          id="elementLockToggle"
          class="element-lock-toggle"
          type="button"
          aria-label="${element.locked ? "Unlock" : "Lock"} ${attr(elementTypeHeading(element))}"
          aria-pressed="${Boolean(element.locked)}"
          title="${element.locked ? "Unlock element" : "Lock element"}"
        ><i data-lucide="${element.locked ? "lock" : "unlock"}" aria-hidden="true"></i></button>
        <strong>${escapeHtml(elementTypeHeading(element))}</strong>
      </div>
    </section>
    <section class="inspector-section element-shared-properties">
      <div class="field-row"><label for="nameInput">Name</label><input id="nameInput" value="${attr(element.name)}" /></div>
      <div class="field-grid">
        <div class="field-row"><label for="rotationInput">Rotation</label><input id="rotationInput" type="number" value="${Math.round(element.rotation || 0)}" /></div>
        <div class="field-row">
          <label for="opacityValue">Opacity (%)</label>
          <input id="opacityValue" type="number" min="0" max="100" step="1" value="${opacityPercent(element.opacity)}" />
        </div>
      </div>
    </section>
    ${elementInspectorFields(element)}
    ${element.type === "icon" ? "" : brandColorElementSection([element])}
    <section class="inspector-section">
      <strong>Animation</strong>
      <div class="field-row"><label for="animationEffectInput">Effect</label><select id="animationEffectInput">${animationOptionList([["none", "None"], ["appear", "Appear"], ["fadeIn", "Fade in"]], animation.effect)}</select></div>
      <div class="field-row"><label for="animationTriggerInput">Trigger</label><select id="animationTriggerInput">${animationOptionList([["slideStart", "On slide start"], ["onClick", "On click"], ["withPrevious", "With previous"], ["afterPrevious", "After previous"]], animation.trigger)}</select></div>
      <div class="field-grid">
        <div class="field-row"><label for="animationDelayInput">Delay (ms)</label><input id="animationDelayInput" type="number" min="0" step="100" value="${animation.delayMs}" /></div>
        <div class="field-row"><label for="animationDurationInput">Duration (ms)</label><input id="animationDurationInput" type="number" min="100" step="100" value="${animation.durationMs}" /></div>
      </div>
      <div class="field-row"><label for="animationEasingInput">Easing</label><select id="animationEasingInput">${animationOptionList([["linear", "Linear"], ["ease", "Ease"], ["easeIn", "Ease in"], ["easeOut", "Ease out"], ["easeInOut", "Ease in/out"]], animation.easing)}</select></div>
      <button id="previewElementAnimationBtn" type="button">Preview animation</button>
    </section>
  `;

  window.lucide?.createIcons({ attrs: { "stroke-width": 1.8 } });
  document.querySelector("#elementLockToggle")?.addEventListener("click", () => {
    element.locked = !element.locked;
    markChanged(element.locked ? "Element locked" : "Element unlocked");
    renderAll();
  });
  bindValue("#nameInput", (value) => (element.name = value));
  bindNumber("#rotationInput", (value) => (element.rotation = value));
  bindOpacityControls([element]);
  bindToggle("#autoHeightInput", (value) => {
    element.autoHeight = value;
    if (value) element.h = measureTextElementHeight(ctx, element, deck);
  });
  bindValue("#animationEffectInput", (value) => setElementAnimation(element, "effect", value));
  bindValue("#animationTriggerInput", (value) => setElementAnimation(element, "trigger", value));
  bindNumber("#animationDelayInput", (value) => setElementAnimation(element, "delayMs", Math.max(0, value)));
  bindNumber("#animationDurationInput", (value) => setElementAnimation(element, "durationMs", Math.max(100, value)));
  bindValue("#animationEasingInput", (value) => setElementAnimation(element, "easing", value));
  document.querySelector("#previewElementAnimationBtn")?.addEventListener("click", () => previewElementAnimation(element));
  if (element.type !== "icon") bindBrandColorApplication([element]);
  bindTypeFields(element);
}

function elementTypeHeading(element) {
  if (element.audienceJoinRole === "qr") return "Audience QR code";
  if (element.audienceJoinRole === "code") return "Audience access code";
  const labels = {
    text: "Text",
    shape: "Shape",
    image: "Image",
    icon: "Icon",
    chart: "Chart",
    table: "Table",
    divider: "Line",
    engagement: "Engagement",
    countdown: "Countdown",
    embed: "YouTube video",
  };
  return labels[element.type] || "Element";
}

const RECOMMENDED_ICON_NAMES = [
  "activity", "airplay", "award", "badge-check", "bar-chart-3", "bell", "book-open",
  "briefcase-business", "building-2", "calendar-days", "chart-no-axes-combined", "check",
  "check-circle-2", "circle-dollar-sign", "circle-help", "clipboard-check", "clock-3",
  "cloud", "code-2", "coffee", "credit-card", "database", "download", "external-link",
  "eye", "file-check-2", "file-text", "filter", "flag", "folder-open", "globe-2",
  "graduation-cap", "handshake", "heart", "house", "image", "info", "key-round",
  "landmark", "laptop", "lightbulb", "link", "lock-keyhole", "mail", "map-pin",
  "megaphone", "message-circle", "monitor", "package-check", "panel-top", "phone",
  "pie-chart", "presentation", "rocket", "search", "settings", "shield-check",
  "shopping-cart", "sparkles", "star", "target", "thumbs-up", "timer", "trending-up",
  "trophy", "upload", "user-check", "users", "video", "wifi", "workflow", "wrench",
];

const ICON_CATEGORIES = [
  ["business", "Business", ["award", "badge", "briefcase", "building", "calendar", "clipboard", "presentation", "target", "trophy", "workflow"]],
  ["communication", "Communication", ["bell", "contact", "mail", "message", "mic", "phone", "radio", "send", "speech", "video"]],
  ["data", "Data & analytics", ["activity", "bar-chart", "chart", "database", "gauge", "pie-chart", "table", "trending"]],
  ["design", "Design", ["brush", "color", "crop", "frame", "image", "layers", "palette", "pen", "ruler", "shapes"]],
  ["development", "Development & technology", ["binary", "bot", "braces", "bug", "cloud", "code", "cpu", "laptop", "monitor", "server", "terminal", "wifi"]],
  ["education", "Education", ["book", "graduation", "library", "notebook", "school", "spell", "student"]],
  ["files", "Files & folders", ["archive", "download", "file", "folder", "paperclip", "save", "upload"]],
  ["finance", "Finance", ["bank", "bitcoin", "circle-dollar", "coins", "credit-card", "landmark", "receipt", "wallet"]],
  ["healthcare", "Healthcare", ["ambulance", "cross", "dna", "heart-pulse", "hospital", "pill", "stethoscope", "syringe"]],
  ["maps", "Maps & location", ["compass", "earth", "flag", "globe", "map", "navigation", "pin", "route"]],
  ["media", "Media", ["camera", "film", "headphones", "image", "music", "pause", "play", "volume"]],
  ["people", "People & teams", ["contact", "handshake", "person", "user", "users"]],
  ["security", "Security", ["fingerprint", "key", "lock", "scan", "shield", "unlock"]],
  ["shopping", "Shopping", ["badge-percent", "package", "receipt", "shopping", "store", "tag"]],
  ["transportation", "Transportation", ["bike", "bus", "car", "plane", "rocket", "ship", "train", "truck"]],
  ["weather", "Weather", ["cloud", "droplet", "rain", "snow", "sun", "thermometer", "umbrella", "wind"]],
];

function lucideCatalogNames() {
  const names = Object.keys(window.lucide?.icons || {})
    .map(normalizeLucideIconName)
    .filter((name) => !name.endsWith("-icon"));
  return [...new Set(names)].sort();
}

function iconDisplayName(name) {
  return String(name || "icon")
    .split("-")
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : "")
    .join(" ");
}

function iconPickerResults(query = "", category = "") {
  const normalizedQuery = query.trim().toLowerCase();
  const catalog = lucideCatalogNames();
  const categoryKeywords = ICON_CATEGORIES.find(([value]) => value === category)?.[2] || [];
  if (!catalog.length && !normalizedQuery && !category) {
    return RECOMMENDED_ICON_NAMES.filter((name) => catalog.includes(name) || !catalog.length);
  }
  return catalog
    .filter((name) => !normalizedQuery
      || name.includes(normalizedQuery)
      || iconDisplayName(name).toLowerCase().includes(normalizedQuery))
    .filter((name) => !categoryKeywords.length || categoryKeywords.some((keyword) => name.includes(keyword)));
}

function renderIconPickerGrid(element, query = "", category = "", limit = 80) {
  const results = iconPickerResults(query, category).slice(0, limit);
  if (!results.length) {
    return `<p class="icon-picker-empty">No icons found. Try a broader term such as “chart,” “people,” “security,” or “arrow.”</p>`;
  }
  return results.map((name) => `
    <button class="icon-choice ${element.icon === name ? "selected" : ""}" type="button"
      data-icon-choice="${attr(name)}" title="${attr(iconDisplayName(name))}"
      aria-label="Use ${attr(iconDisplayName(name))}" aria-pressed="${element.icon === name}">
      <i data-lucide="${attr(name)}" aria-hidden="true"></i>
      <span>${escapeHtml(iconDisplayName(name))}</span>
    </button>`).join("");
}

function iconColorControlMarkup(inputId, label, value, property, styleProperty, activeStyleId) {
  const color = normalizeHexColor(value) || "#000000";
  const swatches = brandColorStyles().map((style) => `
    <button class="background-style-swatch brand-style-chip ${activeStyleId === style.id ? "active" : ""}" type="button"
      data-icon-color-property="${attr(property)}" data-icon-style-property="${attr(styleProperty)}"
      data-icon-style-id="${attr(style.id)}" title="${attr(style.name)}" aria-label="Use ${attr(style.name)}">
      <span class="swatch" style="background:${attr(style.color)}"></span><span>${escapeHtml(style.name)}</span>
    </button>`).join("");
  return `<div class="field-row background-color-control icon-color-control"><label>${escapeHtml(label)}</label>
    <details class="background-color-picker">
      <summary aria-label="Choose ${attr(label)}"><span class="background-color-preview" style="background:${attr(color)}"></span><span class="background-color-value">${escapeHtml(color.toUpperCase())}</span></summary>
      <div class="background-color-picker-menu">
        <label for="${attr(inputId)}">Custom color</label>
        <input id="${attr(inputId)}" type="color" value="${attr(color)}"
          data-icon-color-input="${attr(property)}" data-icon-style-property="${attr(styleProperty)}" />
        ${swatches ? `<div class="background-style-swatches"><span class="background-swatch-heading">Global color styles</span>${swatches}</div>` : ""}
      </div>
    </details>
  </div>`;
}

function shapeFillControlsMarkup(element, fillType) {
  if (fillType === "gradient") {
    return `<div class="field-grid">
      ${shapeColorControlMarkup("shapeGradientStartInput", "Start", element.fillGradientStart || "#2454d6", "fillGradientStart")}
      ${shapeColorControlMarkup("shapeGradientEndInput", "End", element.fillGradientEnd || "#0c8b7f", "fillGradientEnd")}
      <div class="field-row"><label for="shapeGradientAngleInput">Angle</label><input id="shapeGradientAngleInput" type="number" min="0" max="360" value="${Number(element.fillGradientAngle) || 0}" /></div>
    </div>`;
  }
  if (fillType === "image") {
    return `<div class="field-grid">
      <div class="field-row"><label>Image</label><button id="chooseShapeFillImageBtn" type="button">${element.fillImage ? "Replace image" : "Choose image"}</button></div>
      <div class="field-row"><label for="shapeImageFitInput">Fit</label><select id="shapeImageFitInput">${animationOptionList([["cover", "Fill shape (crop)"], ["contain", "Fit entire image"]], element.fillImageFit || "cover")}</select></div>
    </div>`;
  }
  if (fillType === "animated") {
    return `<div class="field-row"><label for="shapeShaderInput">Effect</label><select id="shapeShaderInput">${animationOptionList(backgroundShaderOptions.filter((item) => item.value !== "none").map((item) => [item.value, item.label]), element.fillShader || "aurora")}</select></div>
      <div class="field-grid">
        ${shapeColorControlMarkup("shapeEffectColorAInput", "Effect color 1", element.fillEffectColorA || "#2454d6", "fillEffectColorA")}
        ${shapeColorControlMarkup("shapeEffectColorBInput", "Effect color 2", element.fillEffectColorB || "#0c8b7f", "fillEffectColorB")}
        <div class="field-row"><label for="shapeShaderIntensityInput">Intensity (%)</label><input id="shapeShaderIntensityInput" type="number" min="0" max="100" value="${Math.round((Number(element.fillShaderIntensity) || 0.6) * 100)}" /></div>
        <div class="field-row"><label for="shapeShaderSpeedInput">Speed</label><input id="shapeShaderSpeedInput" type="number" min="0.1" max="3" step="0.1" value="${Number(element.fillShaderSpeed) || 1}" /></div>
      </div>`;
  }
  return shapeColorControlMarkup("shapeFillColorInput", "Fill color", element.fill || "#e8efff", "fill");
}

function shapeColorControlMarkup(inputId, label, color, property) {
  const swatches = brandColorStyles().map((style) => `<button class="background-style-swatch brand-style-chip" type="button" data-shape-color-property="${attr(property)}" data-shape-style-id="${attr(style.id)}"><span class="swatch" style="background:${attr(style.color)}"></span><span>${escapeHtml(style.name)}</span></button>`).join("");
  return `<div class="field-row shape-color-control"><label>${escapeHtml(label)}</label><details class="background-color-picker">
    <summary><span class="background-color-preview" style="background:${attr(color)}"></span><span class="background-color-value">${escapeHtml(color.toUpperCase())}</span></summary>
    <div class="background-color-picker-menu"><label for="${attr(inputId)}">Custom color</label><input id="${attr(inputId)}" type="color" value="${attr(color)}" data-shape-color-input="${attr(property)}" />
      ${swatches ? `<div class="background-style-swatches"><span class="background-swatch-heading">Theme colors</span>${swatches}</div>` : ""}
    </div></details></div>`;
}

function iconInspectorFields(element) {
  return `
    <section class="inspector-section icon-library-section">
      <strong>Icon</strong>
      <div class="selected-icon-summary">
        <span class="selected-icon-preview"><i data-lucide="${attr(element.icon || "sparkles")}" aria-hidden="true"></i></span>
        <span><strong>${escapeHtml(iconDisplayName(element.icon || "sparkles"))}</strong><small>Lucide Icons · MIT licensed</small></span>
      </div>
      <div class="field-row">
        <label for="iconSearchInput">Search icon library</label>
        <input id="iconSearchInput" type="search" placeholder="Search 1,500+ icons…" autocomplete="off" />
      </div>
      <div class="field-row icon-category-field">
        <label class="sr-only" for="iconCategoryInput">Search by category</label>
        <select id="iconCategoryInput">
          <option value="">Search by Category</option>
          ${ICON_CATEGORIES.map(([value, label]) => `<option value="${attr(value)}">${escapeHtml(label)}</option>`).join("")}
        </select>
      </div>
      <div class="icon-picker-status"><span id="iconResultCount">${iconPickerResults().length.toLocaleString()} icons available</span><span>Search the full library</span></div>
      <div id="iconPickerGrid" class="icon-picker-grid" role="listbox" aria-label="Available icons">
        ${renderIconPickerGrid(element)}
      </div>
      <button id="loadMoreIconsBtn" class="secondary-button icon-load-more" type="button">Load more icons</button>
    </section>
    <section class="inspector-section">
      <strong>Icon style</strong>
      <div class="field-grid">
        ${iconColorControlMarkup("iconColorInput", "Icon color", element.fill || "#2454d6", "fill", "brandColorStyleId", element.brandColorStyleId)}
        <div class="field-row"><label for="iconStrokeWidthInput">Line weight</label><input id="iconStrokeWidthInput" type="number" min="0.75" max="4" step="0.25" value="${Number(element.strokeWidth) || 2}" /></div>
        <div class="field-row"><label for="iconFrameInput">Frame</label><select id="iconFrameInput">${animationOptionList([
          ["none", "None"],
          ["circle", "Circle"],
          ["rounded", "Rounded square"],
          ["square", "Square"],
        ], element.iconFrame || "none")}</select></div>
        ${iconColorControlMarkup("iconFrameFillInput", "Frame color", element.frameFill || "#e8efff", "frameFill", "frameBrandColorStyleId", element.frameBrandColorStyleId)}
        <div class="field-row"><label for="iconPaddingInput">Padding (%)</label><input id="iconPaddingInput" type="number" min="0" max="40" step="1" value="${Math.max(0, Math.min(40, Number(element.padding) || 0))}" /></div>
      </div>
      <div class="check-row"><input id="iconFlipHorizontalInput" type="checkbox" ${element.flipHorizontal ? "checked" : ""} /><label for="iconFlipHorizontalInput">Flip horizontally</label></div>
      <div class="check-row"><input id="iconFlipVerticalInput" type="checkbox" ${element.flipVertical ? "checked" : ""} /><label for="iconFlipVerticalInput">Flip vertically</label></div>
    </section>
    <section class="inspector-section">
      <strong>Accessibility</strong>
      <div class="check-row"><input id="iconDecorativeInput" type="checkbox" ${element.decorative !== false ? "checked" : ""} /><label for="iconDecorativeInput">Decorative icon</label></div>
      <div class="field-row ${element.decorative !== false ? "hidden" : ""}" id="iconAltRow"><label for="iconAltInput">Accessible label</label><input id="iconAltInput" value="${attr(element.alt || "")}" placeholder="Example: Quarterly growth" /></div>
      <p class="field-help">Keep decorative icons hidden from screen readers. Add a concise label when the icon communicates meaning.</p>
    </section>`;
}

function lucideIconDataUri(name, color = "#2454d6", strokeWidth = 2) {
  const iconNode = resolveLucideIconNode(window.lucide?.icons, name, "sparkles");
  return lucideIconSvgDataUri(iconNode, color, strokeWidth);
}

function refreshIconAsset(element) {
  element.icon = element.icon || "sparkles";
  element.iconSrc = lucideIconDataUri(element.icon, element.fill || "#2454d6", element.strokeWidth || 2);
}

function bindShapeFillControls(element) {
  document.querySelector("#shapeFillTypeInput")?.addEventListener("change", (event) => {
    element.fillType = event.target.value;
    markChanged("Shape fill style updated");
    renderAll();
  });
  const pickers = [...document.querySelectorAll(".shape-color-control .background-color-picker")];
  pickers.forEach((picker) => picker.addEventListener("toggle", () => {
    if (!picker.open) return;
    pickers.forEach((other) => { if (other !== picker) other.open = false; });
  }));
  document.querySelectorAll("[data-shape-color-input]").forEach((input) => input.addEventListener("input", () => {
    element[input.dataset.shapeColorInput] = input.value;
    const picker = input.closest(".background-color-picker");
    const preview = picker?.querySelector(".background-color-preview");
    const value = picker?.querySelector(".background-color-value");
    if (preview) preview.style.background = input.value;
    if (value) value.textContent = input.value.toUpperCase();
    markChanged("Shape fill color updated");
    renderCanvas();
    renderSlides();
  }));
  document.querySelectorAll("[data-shape-style-id]").forEach((button) => button.addEventListener("click", () => {
    const style = brandColorStyles().find((item) => item.id === button.dataset.shapeStyleId);
    if (!style) return;
    element[button.dataset.shapeColorProperty] = style.color;
    markChanged(`${style.name} applied to shape`);
    renderAll();
  }));
  bindNumber("#shapeGradientAngleInput", (value) => (element.fillGradientAngle = clamp(value, 0, 360)));
  bindValue("#shapeImageFitInput", (value) => (element.fillImageFit = value));
  document.querySelector("#chooseShapeFillImageBtn")?.addEventListener("click", () => {
    dom.imageInput.dataset.shapeFillId = element.id;
    dom.imageInput.click();
  });
  bindValue("#shapeShaderInput", (value) => (element.fillShader = value));
  bindNumber("#shapeShaderIntensityInput", (value) => (element.fillShaderIntensity = clamp(value / 100, 0, 1)));
  bindNumber("#shapeShaderSpeedInput", (value) => (element.fillShaderSpeed = clamp(value, 0.1, 3)));
}

function bindIconInspector(element) {
  let visibleIconLimit = 80;
  const rerenderPicker = ({ reset = false } = {}) => {
    const grid = document.querySelector("#iconPickerGrid");
    if (!grid) return;
    if (reset) visibleIconLimit = 80;
    const query = document.querySelector("#iconSearchInput")?.value || "";
    const category = document.querySelector("#iconCategoryInput")?.value || "";
    const allResults = iconPickerResults(query, category);
    grid.innerHTML = renderIconPickerGrid(element, query, category, visibleIconLimit);
    const count = document.querySelector("#iconResultCount");
    if (count) count.textContent = `${Math.min(visibleIconLimit, allResults.length).toLocaleString()} of ${allResults.length.toLocaleString()} icons`;
    const loadMore = document.querySelector("#loadMoreIconsBtn");
    if (loadMore) {
      loadMore.classList.toggle("hidden", allResults.length <= visibleIconLimit);
      loadMore.textContent = `Load more icons (${Math.max(0, allResults.length - visibleIconLimit).toLocaleString()} remaining)`;
    }
    window.lucide?.createIcons({ attrs: { "stroke-width": 1.8 } });
    bindIconChoices(element);
  };
  const searchInput = document.querySelector("#iconSearchInput");
  searchInput?.addEventListener("input", () => rerenderPicker({ reset: true }));
  document.querySelector("#iconCategoryInput")?.addEventListener("change", () => rerenderPicker({ reset: true }));
  document.querySelector("#loadMoreIconsBtn")?.addEventListener("click", () => {
    visibleIconLimit += 80;
    rerenderPicker();
  });
  rerenderPicker();
  bindIconColorControls(element);
  bindNumber("#iconStrokeWidthInput", (value) => {
    element.strokeWidth = Math.max(0.75, Math.min(4, value));
    refreshIconAsset(element);
  });
  bindValue("#iconFrameInput", (value) => (element.iconFrame = value));
  bindNumber("#iconPaddingInput", (value) => (element.padding = Math.max(0, Math.min(40, value))));
  bindToggle("#iconFlipHorizontalInput", (value) => (element.flipHorizontal = value));
  bindToggle("#iconFlipVerticalInput", (value) => (element.flipVertical = value));
  bindToggle("#iconDecorativeInput", (value) => {
    element.decorative = value;
    document.querySelector("#iconAltRow")?.classList.toggle("hidden", value);
  });
  bindValue("#iconAltInput", (value) => (element.alt = value));
}

function bindIconColorControls(element) {
  const colorPickers = [...document.querySelectorAll(".icon-color-control .background-color-picker")];
  colorPickers.forEach((picker) => picker.addEventListener("toggle", () => {
    if (!picker.open) return;
    colorPickers.forEach((other) => { if (other !== picker) other.open = false; });
  }));
  document.querySelectorAll("[data-icon-color-input]").forEach((input) => {
    input.addEventListener("input", () => {
      const property = input.dataset.iconColorInput;
      element[property] = input.value;
      element[input.dataset.iconStyleProperty] = null;
      if (property === "fill") refreshIconAsset(element);
      const picker = input.closest(".background-color-picker");
      const preview = picker?.querySelector(".background-color-preview");
      const value = picker?.querySelector(".background-color-value");
      if (preview) preview.style.background = input.value;
      if (value) value.textContent = input.value.toUpperCase();
      markChanged(`${property === "fill" ? "Icon" : "Frame"} color updated`);
      renderCanvas();
      renderSlides();
      if (presenterOpen) renderPresenter();
      if (audienceOpen) renderAudience();
    });
  });
  document.querySelectorAll("[data-icon-style-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const style = brandColorStyles().find((item) => item.id === button.dataset.iconStyleId);
      if (!style) return;
      const property = button.dataset.iconColorProperty;
      element[property] = style.color;
      element[button.dataset.iconStyleProperty] = style.id;
      if (property === "fill") refreshIconAsset(element);
      markChanged(`${style.name} color style linked`);
      renderAll();
    });
  });
}

function bindIconChoices(element) {
  document.querySelectorAll("[data-icon-choice]").forEach((button) => button.addEventListener("click", () => {
    element.icon = button.dataset.iconChoice;
    element.name = element.name === "Icon" || !element.name ? iconDisplayName(element.icon) : element.name;
    refreshIconAsset(element);
    markChanged(`${iconDisplayName(element.icon)} icon selected`);
    renderAll();
  }));
}

function elementInspectorFields(element) {
  if (element.type === "text") {
    const typography = resolveTextTypography(element, deck);
    const textAlignment = ["left", "center", "right"].includes(element.align) ? element.align : "left";
    const alignmentControl = `
      <div class="compact-alignment-field">
        <span>Align</span>
        <div class="alignment-button-group" role="group" aria-label="Text alignment">
          ${[
            ["left", "align-left", "Align left"],
            ["center", "align-center", "Align center"],
            ["right", "align-right", "Align right"],
          ].map(([value, icon, label]) => `
            <button class="alignment-button ${textAlignment === value ? "active" : ""}" type="button"
              data-text-align="${value}" aria-label="${label}" title="${label}"
              aria-pressed="${textAlignment === value}">
              <i data-lucide="${icon}" aria-hidden="true"></i>
            </button>`).join("")}
        </div>
      </div>`;
    const typographyOptions = Object.entries(deck.theme.typographyStyles || {}).map(([id, style]) =>
      `<option value="${attr(id)}" ${element.typographyStyleId === id ? "selected" : ""}>${escapeHtml(style.name || id)}</option>`
    ).join("");
    return `
      <section class="inspector-section">
        <strong>Text</strong>
        <div class="field-row"><label for="textInput">Content</label><textarea id="textInput">${escapeHtml(element.text || "")}</textarea></div>
        <div class="check-row"><input id="autoHeightInput" type="checkbox" ${element.autoHeight !== false ? "checked" : ""} /><label for="autoHeightInput">Automatically fit height to text</label></div>
        <div class="field-row"><label for="typographyStyleInput">Typography style</label><select id="typographyStyleInput">${typographyOptions}</select></div>
        <div class="check-row"><input id="useGlobalTypographyInput" type="checkbox" ${element.useGlobalTypography !== false ? "checked" : ""} /><label for="useGlobalTypographyInput">Use global style</label></div>
        ${element.useGlobalTypography !== false ? `<p class="field-help">${escapeHtml(typography.fontFamily)} · ${typography.fontSize}px · ${typography.fontWeight}. Edit this style in Global Settings, or turn off “Use global style” for custom formatting.</p>` : ""}
        <div class="format-toolbar ${element.useGlobalTypography !== false ? "hidden" : ""}" role="toolbar" aria-label="Text formatting">
          <button id="boldToggle" class="format-button" type="button" aria-pressed="${(element.fontWeight || 400) >= 700}" title="Bold"><span class="format-bold">B</span></button>
          <button id="italicToggle" class="format-button" type="button" aria-pressed="${Boolean(element.italic)}" title="Italic"><span class="format-italic">I</span></button>
          <button id="underlineToggle" class="format-button" type="button" aria-pressed="${Boolean(element.underline)}" title="Underline"><span class="format-underline">U</span></button>
          <button id="bulletToggle" class="format-button" type="button" aria-pressed="${Boolean(element.bulletList)}" title="Bullet list"><span class="format-bullets">&#8226;</span></button>
        </div>
        ${element.useGlobalTypography === false ? `<div class="field-grid">
          <div class="field-row"><label for="fontFamilyInput">Font</label><input id="fontFamilyInput" value="${attr(element.fontFamily || typography.fontFamily)}" /></div>
          <div class="field-row"><label for="fontSizeInput">Size</label><input id="fontSizeInput" type="number" value="${element.fontSize}" /></div>
          <div class="field-row"><label for="fontWeightInput">Weight</label><input id="fontWeightInput" type="number" value="${element.fontWeight}" /></div>
          <div class="field-row"><label for="lineHeightInput">Line height</label><input id="lineHeightInput" type="text" inputmode="decimal" value="${formatLineHeight(element.lineHeight)}" /></div>
          <div class="field-row"><label for="textColorInput">Color</label><input id="textColorInput" type="color" value="${element.color}" /></div>
        </div>` : ""}
        ${alignmentControl}
      </section>`;
  }

  if (element.type === "shape") {
    const fillType = element.fillType || "color";
    return `
      <section class="inspector-section">
        <strong>Style</strong>
        <div class="field-row"><label for="shapeInput">Shape type</label><select id="shapeInput">${animationOptionList([
          ["rectangle", "Rectangle"],
          ["roundedRect", "Rounded rectangle"],
          ["ellipse", "Ellipse"],
          ["triangle", "Triangle"],
          ["diamond", "Diamond"],
          ["hexagon", "Hexagon"],
        ], element.shape || "roundedRect")}</select></div>
        <div class="field-row"><label for="shapeFillTypeInput">Fill style</label><select id="shapeFillTypeInput">${animationOptionList([
          ["color", "Solid color"],
          ["gradient", "Gradient"],
          ["image", "Image"],
          ["animated", "Animated effect"],
        ], fillType)}</select></div>
        ${shapeFillControlsMarkup(element, fillType)}
        <div class="field-grid">
          <div class="field-row"><label for="strokeInput">Stroke</label><input id="strokeInput" type="color" value="${element.stroke || "#ffffff"}" /></div>
          <div class="field-row"><label for="strokeWidthInput">Stroke width</label><input id="strokeWidthInput" type="number" value="${element.strokeWidth || 0}" /></div>
          ${element.shape === "roundedRect" ? `<div class="field-row"><label for="shapeRadiusInput">Corner radius</label><input id="shapeRadiusInput" type="number" min="0" max="200" step="1" value="${Math.max(0, Number(element.radius) || 0)}" /></div>` : ""}
        </div>
      </section>`;
  }

  if (element.type === "icon") {
    return iconInspectorFields(element);
  }

  if (element.type === "divider") {
    return `
      <section class="inspector-section">
        <strong>Style</strong>
        <div class="field-grid">
          <div class="field-row"><label for="fillInput">Fill</label><input id="fillInput" type="color" value="${element.fill || "#ffffff"}" /></div>
          <div class="field-row"><label for="strokeInput">Stroke</label><input id="strokeInput" type="color" value="${element.stroke || "#ffffff"}" /></div>
          <div class="field-row"><label for="strokeWidthInput">Stroke width</label><input id="strokeWidthInput" type="number" value="${element.strokeWidth || 0}" /></div>
          <div class="field-row"><label for="lineRadiusInput">Corner radius</label><input id="lineRadiusInput" type="number" min="0" max="${Math.max(0, Math.floor(Math.min(element.w, element.h) / 2))}" step="1" value="${Math.max(0, Number(element.radius) || 0)}" /></div>
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
    const slide = currentSlide();
    const linkedEngagementChart = Boolean(element.engagementResults) &&
      ["poll", "multipleChoice"].includes(slide?.engagement?.type);
    if (linkedEngagementChart) {
      return `
        <section class="inspector-section">
          <strong>Poll chart</strong>
          <div class="field-row"><label for="chartTitleInput">Title</label><input id="chartTitleInput" value="${attr(element.title)}" /></div>
          ${engagementOptionEditor(slide.engagement, "chart")}
          <p class="field-help">Values come from live audience responses and start at zero.</p>
        </section>`;
    }
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
        <strong>Engagement type</strong>
        <div class="field-row"><label for="engagementElementMode">Mode</label><select id="engagementElementMode">${engagementTypes.map((type) => `<option value="${type.value}" ${element.mode === type.value ? "selected" : ""}>${type.label}</option>`).join("")}</select></div>
        <div class="field-row"><label for="engagementElementPrompt">Prompt</label><input id="engagementElementPrompt" value="${attr(element.prompt)}" /></div>
        ${element.mode === "multipleChoice" ? `<div class="check-row"><input id="engagementHasCorrectAnswers" type="checkbox" ${element.hasCorrectAnswers ? "checked" : ""} /><label for="engagementHasCorrectAnswers">This question has correct answers</label></div>` : ""}
        ${element.mode === "reactions" ? reactionPicker(element) : ""}
        ${engagementOptionEditor({ ...element, type: element.mode }, "element")}
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

  if (element.type === "embed") {
    const validVideo = youtubeVideoId(element.url || element.videoId);
    return `
      <section class="inspector-section">
        <strong>YouTube video</strong>
        <div class="field-row"><label for="embedUrlInput">YouTube URL</label><input id="embedUrlInput" type="url" value="${attr(element.url || "")}" placeholder="https://www.youtube.com/watch?v=..." /></div>
        <div class="field-grid">
          <div class="field-row"><label for="embedVolumeInput">Volume (%)</label><input id="embedVolumeInput" type="number" min="0" max="100" value="${Math.max(0, Math.min(100, Number(element.volume) || 0))}" /></div>
          <div class="field-row"><label for="embedSpeedInput">Playback speed</label><select id="embedSpeedInput">${animationOptionList([["0.25", "0.25×"], ["0.5", "0.5×"], ["0.75", "0.75×"], ["1", "Normal"], ["1.25", "1.25×"], ["1.5", "1.5×"], ["1.75", "1.75×"], ["2", "2×"]], String(element.playbackRate || 1))}</select></div>
          <div class="field-row"><label for="embedStartInput">Start at (seconds)</label><input id="embedStartInput" type="number" min="0" value="${Math.max(0, Number(element.startSeconds) || 0)}" /></div>
        </div>
        <div class="check-row"><input id="embedControlsInput" type="checkbox" ${element.showControls !== false ? "checked" : ""} /><label for="embedControlsInput">Show player controls</label></div>
        <div class="check-row"><input id="embedFullscreenInput" type="checkbox" ${element.fullscreenOnPlay !== false ? "checked" : ""} /><label for="embedFullscreenInput">Expand to full slide while playing</label></div>
        <div class="check-row"><input id="embedAutoplayInput" type="checkbox" ${element.autoplay ? "checked" : ""} /><label for="embedAutoplayInput">Autoplay when slide appears</label></div>
        <div class="check-row"><input id="embedLoopInput" type="checkbox" ${element.loop ? "checked" : ""} /><label for="embedLoopInput">Loop video</label></div>
        <p class="field-help">${validVideo ? "Video ready for Presentation View." : "Paste a valid YouTube, youtu.be, Shorts, or Live URL."} Autoplay with sound may be blocked by the browser.</p>
      </section>`;
  }

  return "";
}

function bindTypeFields(element) {
  if (element.type === "text") {
    bindValue("#textInput", (value) => (element.text = value));
    bindValue("#typographyStyleInput", (value) => {
      element.typographyStyleId = value;
      if (element.useGlobalTypography !== false && element.autoHeight) element.h = measureTextElementHeight(ctx, element, deck);
    });
    bindToggle("#useGlobalTypographyInput", (value) => {
      if (!value) {
        const typography = resolveTextTypography(element, deck);
        Object.assign(element, typography);
      }
      element.useGlobalTypography = value;
      if (element.autoHeight) element.h = measureTextElementHeight(ctx, element, deck);
    });
    bindValue("#fontFamilyInput", (value) => (element.fontFamily = value));
    bindNumber("#fontSizeInput", (value) => (element.fontSize = value));
    bindNumber("#fontWeightInput", (value) => (element.fontWeight = value));
    bindLineHeightInput("#lineHeightInput", element);
    bindValue("#textColorInput", (value) => {
      element.brandColorStyleId = null;
      element.color = value;
    });
    document.querySelectorAll("[data-text-align]").forEach((button) => button.addEventListener("click", () => {
      element.align = button.dataset.textAlign;
      markChanged("Text alignment updated");
      renderAll();
    }));
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

  if (element.type === "shape" || element.type === "divider") {
    bindValue("#fillInput", (value) => {
      element.brandColorStyleId = null;
      element.fill = value;
    });
    bindValue("#strokeInput", (value) => (element.stroke = value));
    bindNumber("#strokeWidthInput", (value) => (element.strokeWidth = value));
    document.querySelector("#shapeInput")?.addEventListener("change", (event) => {
      element.shape = event.target.value;
      markChanged("Shape type updated");
      renderAll();
    });
    bindNumber("#shapeRadiusInput", (value) => (element.radius = clamp(value, 0, 200)));
    bindNumber("#lineRadiusInput", (value) => (element.radius = clamp(value, 0, Math.min(element.w, element.h) / 2)));
    if (element.type === "shape") bindShapeFillControls(element);
  }

  if (element.type === "icon") {
    bindIconInspector(element);
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
    if (element.engagementResults && ["poll", "multipleChoice"].includes(currentSlide()?.engagement?.type)) {
      const slide = currentSlide();
      bindEngagementOptionEditor(slide.engagement, "chart", () => {
        syncEngagementElementsFromSlide(slide);
      });
    } else {
      bindValue("#chartLabelsInput", (value) => (element.labels = value.split(/\n/).filter(Boolean)));
      bindValue("#chartValuesInput", (value) => (element.values = value.split(/\n/).map(Number).filter((number) => !Number.isNaN(number))));
      bindValue("#chartFillInput", (value) => {
        element.brandColorStyleId = null;
        element.fill = value;
      });
    }
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

  if (element.type === "embed") {
    bindValue("#embedUrlInput", (value) => {
      element.url = value.trim();
      element.videoId = youtubeVideoId(element.url);
    });
    bindNumber("#embedVolumeInput", (value) => (element.volume = clamp(value, 0, 100)));
    bindValue("#embedSpeedInput", (value) => (element.playbackRate = Number(value) || 1));
    bindNumber("#embedStartInput", (value) => (element.startSeconds = Math.max(0, value)));
    bindToggle("#embedControlsInput", (value) => (element.showControls = value));
    bindToggle("#embedFullscreenInput", (value) => (element.fullscreenOnPlay = value));
    bindToggle("#embedAutoplayInput", (value) => (element.autoplay = value));
    bindToggle("#embedLoopInput", (value) => (element.loop = value));
  }
}

function renderMultiInspector(selected) {
  const averageOpacity = selected.length
    ? opacityPercent(selected.reduce((total, element) => total + (element.opacity ?? 1), 0) / selected.length)
    : 100;
  dom.inspector.innerHTML = `
    <section class="inspector-section">
      <strong>${selected.length} elements selected</strong>
      <div class="field-row">
        <label for="opacityValue">Opacity (%)</label>
        <input id="opacityValue" type="number" min="0" max="100" step="1" value="${averageOpacity}" />
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

function backgroundColorControlMarkup(inputId, label, value, colorKey, styleKey, activeStyleId) {
  const swatches = brandColorStyles().map((style) => `
    <button class="background-style-swatch brand-style-chip ${activeStyleId === style.id ? "active" : ""}" type="button"
      data-background-color-key="${attr(colorKey)}" data-background-style-key="${attr(styleKey)}"
      data-background-style-id="${attr(style.id)}" title="${attr(style.name)}" aria-label="Use ${attr(style.name)}">
      <span class="swatch" style="background:${attr(style.color)}"></span><span>${escapeHtml(style.name)}</span>
    </button>`).join("");
  return `<div class="field-row background-color-control"><label>${escapeHtml(label)}</label>
    <details class="background-color-picker">
      <summary aria-label="Choose ${attr(label)}"><span class="background-color-preview" style="background:${attr(value)}"></span><span class="background-color-value">${escapeHtml(String(value).toUpperCase())}</span></summary>
      <div class="background-color-picker-menu">
        <label for="${attr(inputId)}">Custom color</label>
        <input id="${attr(inputId)}" type="color" value="${attr(value)}" data-background-color-input="${attr(colorKey)}" data-background-style-key="${attr(styleKey)}" />
        ${swatches ? `<div class="background-style-swatches"><span class="background-swatch-heading">Theme colors</span>${swatches}</div>` : ""}
      </div>
    </details>
  </div>`;
}

function bindBackgroundColorControls(slide) {
  const colorPickers = [...document.querySelectorAll(".background-color-picker")];
  colorPickers.forEach((picker) => {
    picker.addEventListener("toggle", () => {
      if (!picker.open) return;
      colorPickers.forEach((otherPicker) => {
        if (otherPicker !== picker) otherPicker.open = false;
      });
    });
  });
  document.querySelectorAll("[data-background-color-input]").forEach((input) => {
    input.addEventListener("input", () => {
      slide[input.dataset.backgroundColorInput] = input.value;
      slide[input.dataset.backgroundStyleKey] = null;
      const picker = input.closest(".background-color-picker");
      const preview = picker?.querySelector(".background-color-preview");
      const value = picker?.querySelector(".background-color-value");
      if (preview) preview.style.background = input.value;
      if (value) value.textContent = input.value.toUpperCase();
      markChanged("Background color updated");
      renderCanvas();
      renderSlides();
      if (presenterOpen) renderPresenter();
      if (audienceOpen) renderAudience();
    });
  });
  document.querySelectorAll("[data-background-style-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const style = brandColorStyles().find((item) => item.id === button.dataset.backgroundStyleId);
      if (!style) return;
      slide[button.dataset.backgroundColorKey] = style.color;
      slide[button.dataset.backgroundStyleKey] = style.id;
      markChanged(`${style.name} color style linked`);
      renderAll();
    });
  });
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
  for (const slide of deck.slides) {
    for (const element of slide.elements) {
      if (element.brandColorStyleId === styleId) setElementBrandColor(element, style.color);
      if (element.frameBrandColorStyleId === styleId) element.frameFill = style.color;
    }
  }
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
    for (const [colorKey, styleKey] of [
      ["background", "backgroundStyleId"],
      ["backgroundGradientStart", "backgroundGradientStartStyleId"],
      ["backgroundGradientEnd", "backgroundGradientEndStyleId"],
      ["backgroundEffectColorA", "backgroundEffectColorAStyleId"],
      ["backgroundEffectColorB", "backgroundEffectColorBStyleId"],
      ["backgroundOverlayColor", "backgroundOverlayColorStyleId"],
    ]) {
      if (slide[styleKey] === styleId) {
        slide[colorKey] = style.color;
        slide[styleKey] = null;
      }
    }
    for (const element of slide.elements) {
      if (element.brandColorStyleId === styleId) {
        setElementBrandColor(element, style.color);
        element.brandColorStyleId = null;
      }
      if (element.frameBrandColorStyleId === styleId) {
        element.frameFill = style.color;
        element.frameBrandColorStyleId = null;
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
  if (element.type === "icon") refreshIconAsset(element);
}

function engagementOptionEditor(engagement, scope) {
  if (!["poll", "multipleChoice"].includes(engagement.type)) {
    return "";
  }

  const options = engagement.options || [];
  engagement.optionColors = normalizeEngagementOptionColors(options, engagement.optionColors);
  const atOptionLimit = options.length >= MAX_ENGAGEMENT_OPTIONS;
  const correctAnswers = new Set(engagement.correctAnswers || []);
  const supportsAnswers = engagement.type === "multipleChoice" && engagement.hasCorrectAnswers;
  const colorPicker = (index) => {
    const color = engagement.optionColors[index];
    const swatches = brandColorStyles().map((style) => `
      <button class="engagement-option-style" type="button" data-option-color-swatch="${index}" data-option-color-value="${attr(style.color)}" title="Use ${attr(style.name)}">
        <span class="swatch" style="background:${attr(style.color)}"></span><span>${escapeHtml(style.name)}</span>
      </button>`).join("");
    return `<details class="engagement-option-color-picker">
      <summary aria-label="Choose color for option ${index + 1}" title="Option color"><span class="engagement-option-color-preview" style="background:${attr(color)}"></span></summary>
      <div class="engagement-option-color-menu">
        <label for="${attr(scope)}OptionColor${index}">Custom color</label>
        <input id="${attr(scope)}OptionColor${index}" type="color" data-option-color="${index}" value="${attr(color)}" />
        ${swatches ? `<div class="engagement-option-swatches"><strong>Global color styles</strong>${swatches}</div>` : ""}
      </div>
    </details>`;
  };
  const optionRows = options.length
    ? options
        .map(
          (option, index) => `
            <div class="engagement-option-row">
              ${supportsAnswers
                ? `<input class="engagement-option-correct" type="checkbox" data-option-correct="${index}" ${correctAnswers.has(option) ? "checked" : ""} aria-label="Mark option ${index + 1} correct" title="Correct answer" />`
                : `<span class="engagement-option-number" aria-hidden="true">${index + 1}</span>`}
              ${colorPicker(index)}
              <input type="text" data-option-text="${index}" value="${attr(option)}" aria-label="Option ${index + 1}" />
              <button class="engagement-option-remove" type="button" data-option-remove="${index}" aria-label="Remove option ${index + 1}" title="Remove option">&times;</button>
            </div>
          `
        )
        .join("")
    : `<span class="answer-key-empty">No options yet.</span>`;

  return `
    <div class="field-row engagement-option-editor" data-option-editor="${scope}">
      <label>Options</label>
      ${supportsAnswers ? `<span class="field-help">Check every correct answer.</span>` : ""}
      <div class="engagement-option-list">${optionRows}</div>
      <button class="engagement-option-add" type="button" data-option-add ${atOptionLimit ? "disabled" : ""}>Add option (${options.length}/${MAX_ENGAGEMENT_OPTIONS})</button>
    </div>
  `;
}

function reactionPicker(engagement) {
  const selected = (engagement.reactionOptions || DEFAULT_REACTION_OPTIONS).map(normalizeReactionOption).filter(Boolean).slice(0, MAX_REACTION_OPTIONS);
  const selectedSet = new Set(selected);
  const atLimit = selected.length >= MAX_REACTION_OPTIONS;
  return `
    <div class="field-row reaction-picker">
      <label>Displayed emojis</label>
      <span class="field-help">Choose up to ${MAX_REACTION_OPTIONS}. Use the picker or paste any emoji.</span>
      <div class="engagement-option-list reaction-selected-list">
        ${selected.map((key, index) => `<div class="engagement-option-row reaction-selected-row"><span class="reaction-selected-emoji">${reactionEmoji(key)}</span><span>Emoji ${index + 1}</span><button class="engagement-option-remove" type="button" data-reaction-remove="${index}" ${selected.length === 1 ? "disabled" : ""} aria-label="Remove ${reactionEmoji(key)}">&times;</button></div>`).join("")}
      </div>
      <details class="reaction-picker-menu" ${atLimit ? "data-limit-reached" : ""}>
        <summary ${atLimit ? "aria-disabled=\"true\"" : ""}><span class="reaction-picker-plus" aria-hidden="true">+</span><span>Add emoji (${selected.length}/${MAX_REACTION_OPTIONS})</span><span class="reaction-picker-chevron" aria-hidden="true"></span></summary>
        <div class="reaction-picker-popover">
          <div class="reaction-picker-grid">${Object.entries(REACTION_CATALOG).map(([key, emoji]) => `<button type="button" data-reaction-add="${key}" ${atLimit || selectedSet.has(key) ? "disabled" : ""} aria-label="Add ${emoji}">${emoji}</button>`).join("")}</div>
          <div class="reaction-custom-row"><input id="customReactionEmoji" type="text" maxlength="32" placeholder="Paste any emoji" aria-label="Paste any emoji" ${atLimit ? "disabled" : ""} /><button id="addCustomReactionEmoji" type="button" ${atLimit ? "disabled" : ""}>Add</button></div>
          <span id="reactionPickerError" class="field-help"></span>
        </div>
      </details>
    </div>`;
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
    const resized = resizeBounds(
      dragState.bounds,
      dragState.handle,
      point.x - dragState.start.x,
      point.y - dragState.start.y,
      event.shiftKey
    );
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
  const typography = resolveTextTypography(element, deck);
  dom.textEditor.style.fontSize = `${Math.max(12, typography.fontSize * zoom)}px`;
  dom.textEditor.style.fontFamily = typography.fontFamily;
  dom.textEditor.style.fontWeight = typography.fontWeight;
  dom.textEditor.style.fontStyle = element.italic ? "italic" : "normal";
  dom.textEditor.style.textDecoration = element.underline ? "underline" : "none";
  dom.textEditor.style.lineHeight = typography.lineHeight;
  dom.textEditor.style.color = typography.color;
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
      reactionOptions: [...(slide.engagement.reactionOptions || DEFAULT_REACTION_OPTIONS)],
      reactions: { ...(slide.engagement.reactions || {}) },
    });
    slide.elements.push(element);
    syncSlideEngagementFromElement(element);
    selectedIds = [element.id];
    markChanged("Engagement added");
    renderAll();
    return;
  }
  const element = createElement(type, center);
  if (type === "icon") refreshIconAsset(element);
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

function setSlideBackgroundFromFile(file, slideId) {
  const reader = new FileReader();
  reader.onload = () => {
    const slide = deck.slides.find((item) => item.id === slideId);
    if (!slide) return;
    slide.backgroundImage = reader.result;
    slide.backgroundType = "image";
    slide.backgroundImageFit ||= "cover";
    markChanged("Background image added");
    renderAll();
  };
  reader.readAsDataURL(file);
}

function setShapeFillFromFile(file, elementId) {
  const reader = new FileReader();
  reader.onload = () => {
    const element = currentSlide().elements.find((item) => item.id === elementId && item.type === "shape");
    if (!element) return;
    element.fillImage = reader.result;
    element.fillType = "image";
    element.fillImageFit ||= "cover";
    selectedIds = [element.id];
    markChanged("Shape fill image added");
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
    if (!dom.endSessionOverlay.classList.contains("hidden")) {
      closeEndSessionDialog();
    } else if (openSlideMenuIndex !== null || openSectionMenuId !== null) {
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
  presentationBlackout = false;
  publishPresentationControlState();
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
  const message = { type: "presentation-blackout", value: presentationBlackout };
  presenterChannel?.postMessage(message);
  publishPresentationControlState();
  if (presentationWindow && !presentationWindow.closed) {
    presentationWindow.postMessage(message, location.origin);
  }
  if (presenterWindowMode) queueLivePublish(true);
}

function publishPresentationControlState() {
  const state = {
    deckId: deck.id,
    audienceCode: deck.settings?.audienceCode || liveSession.code || "",
    blackout: presentationBlackout,
    featuredQuestion: liveSession.featuredQuestion || null,
    updatedAt: Date.now(),
  };
  presentationControlUpdatedAt = state.updatedAt;
  try {
    localStorage.setItem(PRESENTATION_CONTROL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Direct tab messaging remains available when browser storage is restricted.
  }
  const message = { type: "presentation-control", state };
  presenterChannel?.postMessage(message);
  if (presentationWindow && !presentationWindow.closed) {
    presentationWindow.postMessage(message, location.origin);
  }
}

function applyPresentationControlState(state) {
  if (!state || Number(state.updatedAt || 0) <= presentationControlUpdatedAt) return;
  const sameDeck = !state.deckId || state.deckId === deck.id;
  const currentCode = deck.settings?.audienceCode || liveSession.code || "";
  const sameSession = !state.audienceCode || !currentCode || state.audienceCode === currentCode;
  if (!sameDeck && !sameSession) return;
  presentationControlUpdatedAt = Number(state.updatedAt || Date.now());
  presentationBlackout = Boolean(state.blackout);
  liveSession.featuredQuestion = state.featuredQuestion || null;
  applyPresentationBlackout();
  renderPresentationQuestionOverlay();
}

function applyPresentationBlackout() {
  dom.presentationBlackout?.classList.toggle("hidden", !presentationBlackout || !presentationWindowMode);
  const button = document.querySelector("#blackoutPresentationBtn");
  button?.setAttribute("aria-pressed", String(presentationBlackout));
  if (button) button.textContent = presentationBlackout ? "Resume screen" : "Black screen";
}

function bindPresenterChannel() {
  const syncStoredPresentationControls = () => {
    if (!presentationWindowMode) return;
    try {
      applyPresentationControlState(JSON.parse(localStorage.getItem(PRESENTATION_CONTROL_STORAGE_KEY) || "null"));
    } catch {
      // Ignore malformed state left by extensions or manual storage edits.
    }
  };
  syncStoredPresentationControls();
  if (presentationWindowMode) window.setInterval(syncStoredPresentationControls, 250);
  window.addEventListener("storage", (event) => {
    if (event.key !== PRESENTATION_CONTROL_STORAGE_KEY || !event.newValue) return;
    try {
      applyPresentationControlState(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed state left by extensions or manual storage edits.
    }
  });
  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin) return;
    if (event.data?.type === "presentation-control") {
      applyPresentationControlState(event.data.state);
    } else if (event.data?.type === "presentation-blackout") {
      presentationBlackout = Boolean(event.data.value);
      applyPresentationBlackout();
    }
  });
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
      liveSession.participantCount = Number(message.liveStatus?.participantCount || 0);
      liveSession.responseCount = Number(message.liveStatus?.responseCount || 0);
      liveSession.featuredQuestion = message.featuredQuestion || null;
      selectedSlideIndexes = new Set([activeSlideIndex]);
      renderAll();
      applyPresentationBlackout();
      renderPresentationQuestionOverlay();
      queueLivePublish(true);
    }
    if (message.type === "editor-deck-updated" && (presenterWindowMode || presentationWindowMode) && message.deck) {
      const activeSlideId = currentSlide()?.id;
      const updatedDeck = normalizeDeck(message.deck);
      for (const updatedSlide of updatedDeck.slides) {
        const liveSlide = deck.slides.find((slide) => slide.id === updatedSlide.id);
        if (!liveSlide?.engagement?.enabled || !updatedSlide.engagement?.enabled) continue;
        updatedSlide.engagement.results = { ...(liveSlide.engagement.results || {}) };
        updatedSlide.engagement.qna = [...(liveSlide.engagement.qna || [])];
        updatedSlide.engagement.reactions = { ...(liveSlide.engagement.reactions || {}) };
        syncEngagementElementsFromSlide(updatedSlide);
      }
      deck = updatedDeck;
      const updatedActiveIndex = deck.slides.findIndex((slide) => slide.id === activeSlideId);
      activeSlideIndex = updatedActiveIndex >= 0
        ? updatedActiveIndex
        : Math.max(0, Math.min(deck.slides.length - 1, activeSlideIndex));
      selectedSlideIndexes = new Set([activeSlideIndex]);
      renderAll();
      if (presenterWindowMode) {
        queueLivePublish(true);
        sendPresenterSnapshot();
      }
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
    if (message.type === "presentation-control") {
      applyPresentationControlState(message.state);
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
    if (message.type === "video-command" && (presenterWindowMode || presentationWindowMode)) {
      applyVideoCommand(message.elementId, message.action, message.time);
    }
    if (message.type === "video-telemetry" && presenterWindowMode) {
      presenterVideoStates.set(message.elementId, message.playerState);
      updateLiveVideoPlayback(message.elementId, message.playerState, message.time);
      applyVideoTelemetry(message);
      renderVideoControls(currentSlide());
      queueLivePublish(true);
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
    liveStatus: {
      participantCount: liveSession.participantCount,
      responseCount: liveSession.responseCount,
    },
    featuredQuestion: liveSession.featuredQuestion,
  });
}

function renderPresentationQuestionOverlay() {
  if (!dom.presentationQuestionOverlay) return;
  const question = liveSession.featuredQuestion;
  const shouldShow = Boolean(presentationWindowMode && question?.text);
  dom.presentationQuestionOverlay.classList.toggle("hidden", !shouldShow);
  if (shouldShow) dom.presentationQuestionText.textContent = question.text;
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
  if (dom.presentationLiveStatus) {
    dom.presentationLiveStatus.textContent = slide.engagement?.enabled
      ? `${liveSession.responseCount} response${liveSession.responseCount === 1 ? "" : "s"} · ${liveSession.participantCount} connected`
      : `${liveSession.participantCount} connected`;
  }
  updatePresenterConnectionBadge();
  prepareHighResolutionCanvas(dom.presenterCanvas, presenterCtx);
  await drawSlideAsync(presenterCtx, slide, deck, {
    footer: true,
    revealCorrectAnswers: shouldRevealCorrectAnswers(slide),
    elementStates: presentationWindowMode ? presenterElementStates(slide) : null,
    countdownStates: countdownStatesForRenderer(),
  });
  syncPresentationEmbeds(slide);
  renderPresentationQuestionOverlay();
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
    renderVideoControls(slide);
    renderPresenterQna();
    queueLivePublish();
    queueRemoteControllerPublish();
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
}

function resetCountdown(elementId) {
  const element = currentSlide().elements.find((item) => item.id === elementId);
  if (!element) return;
  countdownRuntime.set(elementId, { remainingSeconds: element.durationSeconds || 0, running: false, endsAt: 0, completed: false });
  broadcastCountdownState();
  drawPresentationCountdownFrame();
}

function addCountdownTime(elementId, seconds = 60) {
  const state = countdownRuntime.get(elementId);
  if (!state) return;
  if (state.running) state.endsAt = Math.max(Date.now(), state.endsAt + seconds * 1000);
  else state.remainingSeconds = Math.max(0, countdownRemaining(state) + seconds);
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
    queueRemoteControllerPublish(true);
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
  prepareHighResolutionCanvas(dom.presenterCanvas, presenterCtx);
  drawSlide(presenterCtx, currentSlide(), deck, {
    footer: true,
    revealCorrectAnswers: shouldRevealCorrectAnswers(currentSlide()),
    elementStates: presentationWindowMode ? presenterElementStates(currentSlide()) : null,
    countdownStates: countdownStatesForRenderer(),
  });
  syncPresentationEmbeds(currentSlide());
}

function syncPresentationEmbeds(slide = currentSlide()) {
  const layer = dom.presentationEmbedLayer;
  if (!layer) return;
  if ((!presentationWindowMode && !presenterWindowMode) || !presenterOpen) {
    layer.replaceChildren();
    return;
  }

  const embeds = (slide?.elements || []).filter((element) =>
    element.type === "embed" && youtubeVideoId(element.url || element.videoId)
  );
  const activeIds = new Set(embeds.map((element) => element.id));
  layer.querySelectorAll("[data-embed-id]").forEach((node) => {
    if (!activeIds.has(node.dataset.embedId)) node.remove();
  });

  const canvasRect = dom.presenterCanvas.getBoundingClientRect();
  const parentRect = layer.parentElement.getBoundingClientRect();
  const scaleX = canvasRect.width / SLIDE_SIZE.width;
  const scaleY = canvasRect.height / SLIDE_SIZE.height;
  const states = presenterElementStates(slide);
  const monitorMode = presenterWindowMode && !presentationWindowMode;

  for (const element of embeds) {
    let frame = layer.querySelector(`[data-embed-id="${CSS.escape(element.id)}"]`);
    if (!frame) {
      frame = document.createElement("div");
      frame.className = "presentation-embed-frame";
      frame.dataset.embedId = element.id;
      layer.append(frame);
    }
    frame.classList.toggle("monitor", monitorMode);
    const expanded = !monitorMode && element.fullscreenOnPlay !== false && frame.dataset.playerState === "playing";
    frame.classList.toggle("expanded", expanded);
    frame.style.left = `${canvasRect.left - parentRect.left + (expanded ? 0 : element.x * scaleX)}px`;
    frame.style.top = `${canvasRect.top - parentRect.top + (expanded ? 0 : element.y * scaleY)}px`;
    frame.style.width = `${expanded ? canvasRect.width : element.w * scaleX}px`;
    frame.style.height = `${expanded ? canvasRect.height : element.h * scaleY}px`;
    frame.style.transform = expanded ? "none" : `rotate(${Number(element.rotation) || 0}deg)`;
    const state = states[element.id];
    frame.style.opacity = String((element.opacity ?? 1) * (state?.opacity ?? 1));
    frame.style.visibility = state?.hidden ? "hidden" : "visible";

    const playerElement = monitorMode
      ? { ...element, volume: 0, autoplay: false, showControls: false, fullscreenOnPlay: false }
      : element;
    const source = youtubeEmbedUrl(playerElement, location.origin);
    const playerKey = JSON.stringify({
      source,
      volume: clamp(Number(playerElement.volume) || 0, 0, 100),
      playbackRate: Number(element.playbackRate) || 1,
    });
    if (frame.dataset.playerKey === playerKey) continue;
    frame.dataset.playerKey = playerKey;
    const iframe = document.createElement("iframe");
    iframe.src = source;
    iframe.title = element.name || "YouTube video";
    iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.addEventListener("load", () => configureYouTubePlayer(iframe, playerElement));
    frame.dataset.playerState = "idle";
    frame.replaceChildren(iframe);
  }
}

function configureYouTubePlayer(iframe, element) {
  const send = (func, args = []) => iframe.contentWindow?.postMessage(JSON.stringify({
    event: "command",
    func,
    args,
  }), "https://www.youtube.com");
  iframe.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: element.id }), "https://www.youtube.com");
  send("addEventListener", ["onStateChange"]);
  const applySettings = () => {
    send("addEventListener", ["onStateChange"]);
    const volume = clamp(Number(element.volume) || 0, 0, 100);
    send("setVolume", [volume]);
    send(volume <= 0 ? "mute" : "unMute");
    send("setPlaybackRate", [Number(element.playbackRate) || 1]);
    if (element.autoplay) send("playVideo");
  };
  window.setTimeout(applySettings, 350);
  window.setTimeout(applySettings, 1000);
}

function handleYouTubePlayerMessage(event) {
  if ((!presentationWindowMode && !presenterWindowMode) || !/^(https:\/\/)?([\w-]+\.)?youtube(-nocookie)?\.com$/.test(event.origin)) return;
  let payload = event.data;
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch { return; }
  }
  const iframe = [...(dom.presentationEmbedLayer?.querySelectorAll("iframe") || [])]
    .find((candidate) => candidate.contentWindow === event.source);
  const frame = iframe?.closest(".presentation-embed-frame");
  if (!frame) return;
  if (payload?.event === "onStateChange") {
    const playerState = Number(payload.info);
    frame.dataset.playerState = playerState === 1 ? "playing" : "idle";
    presenterVideoStates.set(frame.dataset.embedId, playerState);
    if (presentationWindowMode) presenterChannel?.postMessage({ type: "video-telemetry", elementId: frame.dataset.embedId, playerState });
    syncPresentationEmbeds(currentSlide());
    if (presenterWindowMode) renderVideoControls(currentSlide());
    return;
  }
  if (payload?.event === "infoDelivery" && presentationWindowMode && Number.isFinite(Number(payload.info?.currentTime))) {
    const now = Date.now();
    if (now - lastVideoTelemetryAt < 1800) return;
    lastVideoTelemetryAt = now;
    presenterChannel?.postMessage({ type: "video-telemetry", elementId: frame.dataset.embedId, playerState: Number(payload.info?.playerState), time: Number(payload.info.currentTime) });
  }
}

function videoIframe(elementId) {
  return dom.presentationEmbedLayer?.querySelector(`[data-embed-id="${CSS.escape(elementId)}"] iframe`) || null;
}

function sendYouTubeCommand(iframe, func, args = []) {
  iframe?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "https://www.youtube.com");
}

function applyVideoCommand(elementId, action, time = 0) {
  const iframe = videoIframe(elementId);
  if (!iframe) return;
  if (action === "play") sendYouTubeCommand(iframe, "playVideo");
  if (action === "pause") sendYouTubeCommand(iframe, "pauseVideo");
  if (action === "restart") {
    sendYouTubeCommand(iframe, "seekTo", [0, true]);
    sendYouTubeCommand(iframe, "playVideo");
  }
  if (action === "seek") sendYouTubeCommand(iframe, "seekTo", [Math.max(0, Number(time) || 0), true]);
}

function applyVideoTelemetry(message) {
  if (Number.isFinite(Number(message.time))) applyVideoCommand(message.elementId, "seek", message.time);
  if (Number(message.playerState) === 1) applyVideoCommand(message.elementId, "play");
  if ([0, 2].includes(Number(message.playerState))) applyVideoCommand(message.elementId, "pause");
}

function runPresenterVideoCommand(elementId, action) {
  applyVideoCommand(elementId, action);
  const previous = liveVideoPlayback.get(elementId) || { playerState: 2, time: 0, updatedAt: Date.now() };
  const currentTime = estimatedVideoTime(previous);
  const playerState = action === "pause" ? 2 : 1;
  updateLiveVideoPlayback(elementId, playerState, action === "restart" ? 0 : currentTime);
  presenterVideoStates.set(elementId, playerState);
  presenterChannel?.postMessage({ type: "video-command", elementId, action });
  queueLivePublish(true);
  renderVideoControls(currentSlide());
}

function updateLiveVideoPlayback(elementId, playerState, time) {
  const previous = liveVideoPlayback.get(elementId) || { playerState: 2, time: 0, updatedAt: Date.now() };
  liveVideoPlayback.set(elementId, {
    playerState: Number.isFinite(Number(playerState)) ? Number(playerState) : previous.playerState,
    time: Number.isFinite(Number(time)) ? Math.max(0, Number(time)) : estimatedVideoTime(previous),
    updatedAt: Date.now(),
  });
}

function estimatedVideoTime(state, now = Date.now()) {
  const time = Math.max(0, Number(state?.time) || 0);
  return Number(state?.playerState) === 1
    ? time + Math.max(0, now - (Number(state?.updatedAt) || now)) / 1000
    : time;
}

function renderVideoControls(slide) {
  if (!dom.liveControls || presentationWindowMode) return;
  dom.liveControls.querySelector(".presenter-video-controls")?.remove();
  const videos = (slide?.elements || []).filter((element) => element.type === "embed" && youtubeVideoId(element.url || element.videoId));
  if (!videos.length) return;
  const panel = document.createElement("div");
  panel.className = "presenter-video-controls";
  panel.innerHTML = `<div class="countdown-control-head"><strong>Current video</strong><span>Muted presenter monitor</span></div>${videos.map((element) => {
    const playing = presenterVideoStates.get(element.id) === 1;
    return `<div class="presenter-video-row" data-video-id="${attr(element.id)}"><span>${escapeHtml(element.name || "YouTube video")}</span><div><button data-video-action="${playing ? "pause" : "play"}" type="button">${playing ? "Pause" : "Play"}</button><button data-video-action="restart" type="button">Restart</button></div></div>`;
  }).join("")}`;
  panel.querySelectorAll("[data-video-action]").forEach((button) => button.addEventListener("click", () => {
    runPresenterVideoCommand(button.closest("[data-video-id]").dataset.videoId, button.dataset.videoAction);
  }));
  dom.liveControls.append(panel);
}

function renderCountdownControls(slide) {
  let panel = dom.liveControls.querySelector(".countdown-control-panel");
  const elements = countdownElements(slide);
  if (!elements.length) {
    panel?.remove();
    return;
  }
  const scrollTop = dom.liveControls.scrollTop;
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "countdown-control-panel";
    dom.liveControls.prepend(panel);
  }
  panel.innerHTML = `<div class="countdown-control-head"><strong>On-screen countdown</strong><span>Visible to everyone</span></div>${elements.map((element) => {
    const state = countdownRuntime.get(element.id);
    return `<div class="countdown-control-row" data-countdown-id="${attr(element.id)}"><strong class="countdown-readout">${formatCountdown(countdownRemaining(state))}</strong><div><button data-countdown-action="${state?.running ? "pause" : "start"}" type="button">${state?.running ? "Pause" : "Start"}</button><button data-countdown-action="add" type="button">+1 min</button><button data-countdown-action="reset" type="button">Reset</button></div></div>`;
  }).join("")}`;
  panel.querySelectorAll("[data-countdown-action]").forEach((button) => button.addEventListener("click", () => {
    const id = button.closest("[data-countdown-id]").dataset.countdownId;
    if (button.dataset.countdownAction === "start") startCountdown(id);
    if (button.dataset.countdownAction === "pause") pauseCountdown(id);
    if (button.dataset.countdownAction === "add") addCountdownTime(id, 60);
    if (button.dataset.countdownAction === "reset") resetCountdown(id);
    renderCountdownControls(currentSlide());
  }));
  dom.liveControls.scrollTop = scrollTop;
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
  const countLabel = `${deck.slides.length - skippedSlideIds.size}/${deck.slides.length} included`;
  dom.presenterFlowCount.textContent = countLabel;
  if (dom.presenterMobileFlowCount) dom.presenterMobileFlowCount.textContent = countLabel;
  await renderPresenterFlowList(dom.presenterSlideList);
  if (dom.presenterMobileSlideList) await renderPresenterFlowList(dom.presenterMobileSlideList, true);
}

async function renderPresenterFlowList(container, mobileQuickFlow = false) {
  container.replaceChildren();
  for (const [index, slide] of deck.slides.entries()) {
    const row = document.createElement("div");
    const skipped = skippedSlideIds.has(slide.id);
    row.className = `presenter-flow-slide${mobileQuickFlow ? " quick" : ""}${index === activeSlideIndex ? " active" : ""}${skipped ? " skipped" : ""}`;
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
      if (mobileQuickFlow && window.matchMedia("(max-width: 980px)").matches) {
        setPresenterMobileTab("control");
      }
    });
    container.append(row);
  }
}

function setPresenterMobileTab(tab = "control") {
  const allowed = new Set(["control", "slides", "notes", "live", "qna"]);
  presenterMobileTab = allowed.has(tab) ? tab : "control";
  dom.presenterOverlay.dataset.mobileTab = presenterMobileTab;
  document.querySelectorAll("[data-presenter-mobile-tab]").forEach((button) => {
    const selected = button.dataset.presenterMobileTab === presenterMobileTab;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
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
  return engagement?.type === "multipleChoice" && engagement.hasCorrectAnswers &&
    Boolean(engagement?.correctAnswerRevealed);
}

function openAudience() {
  audienceOpen = true;
  const nextCode = audienceCodeFromHash() || "";
  if (nextCode !== audienceLive.code) {
    audienceLive.state = null;
    audienceLive.responses = {};
    audienceLive.drafts = {};
    audienceLive.error = "";
    audienceLive.lastRenderSignature = "";
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
  dom.audienceEmbedLayer?.replaceChildren();
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
  liveSession.backendAvailable = false;
  liveSession.consecutiveFailures = 0;
  liveSession.retryAfter = 0;
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
  if (!presenterOpen || !liveSession.code || liveSession.lifecycleStatus === "ended") {
    return;
  }
  clearTimeout(liveSession.publishTimer);
  liveSession.publishTimer = setTimeout(() => publishCurrentLiveSession(force), force ? 0 : 250);
}

async function publishCurrentLiveSession(force = false) {
  if (liveSession.publishing || !liveSession.code) {
    return;
  }
  liveSession.publishing = true;
  updatePresenterConnectionBadge();
  try {
    const snapshot = await liveSnapshotForDeck(
      deck,
      liveSlideWithCountdownState(),
      activeSlideIndex,
      liveSession.instanceId,
      liveSession.sessionName,
      { blackout: presentationBlackout }
    );
    const signature = JSON.stringify(snapshot);
    if (!force && signature === liveSession.lastPublishedSignature) return;
    const state = await publishLiveSession(liveSession.code, snapshot, liveSession.presenterToken);
    liveSession.backendAvailable = true;
    liveSession.consecutiveFailures = 0;
    liveSession.retryAfter = 0;
    liveSession.lifecycleStatus = state.status || "active";
    writeActiveSession();
    liveSession.status = state.status === "paused"
      ? "Live session paused. Participants cannot respond."
      : state.status === "ended"
        ? "Session ended. Responses are available in Session History."
        : "Live session running. Responses sync automatically.";
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
    liveSession.consecutiveFailures += 1;
    liveSession.retryAfter = Date.now() + liveRetryDelay(liveSession.consecutiveFailures);
    if (liveSession.consecutiveFailures >= 3) liveSession.backendAvailable = false;
    liveSession.status = isLocalJoinUrl(liveSession.joinUrl)
      ? "Local QR only. Host HySlides or use a network URL for phones."
      : `Live sync unavailable: ${error.message}`;
  } finally {
    liveSession.publishing = false;
    updatePresenterConnectionBadge();
    renderLiveJoinPanel(currentSlide());
  }
}

function updatePresenterConnectionBadge() {
  if (!dom.presenterConnectionStatus) return;
  const indicator = liveSessionIndicator(
    liveSession.lifecycleStatus,
    liveSession.backendAvailable,
    !liveSession.backendAvailable && liveSession.consecutiveFailures < 3
  );
  dom.presenterConnectionStatus.textContent = indicator.label;
  dom.presenterConnectionStatus.dataset.state = indicator.tone;
  dom.presenterConnectionStatus.title = liveSession.status;
}

function liveSlideWithCountdownState() {
  const slide = JSON.parse(JSON.stringify(currentSlide()));
  const states = countdownStatesForRenderer();
  for (const element of slide.elements || []) {
    if (element.type !== "countdown" || !states[element.id]) continue;
    element.runtimeRemainingSeconds = states[element.id].remainingSeconds;
    element.runtimeCompleted = states[element.id].completed;
  }
  for (const element of slide.elements || []) {
    if (element.type !== "embed") continue;
    const state = liveVideoPlayback.get(element.id);
    if (state) element.runtimeVideoState = { ...state, time: estimatedVideoTime(state), updatedAt: Date.now() };
  }
  return slide;
}

async function refreshLiveSession() {
  if (liveSession.polling || !presenterOpen || !liveSession.code) {
    return;
  }
  if (!liveSession.backendAvailable) {
    if (!liveSession.publishing && Date.now() >= liveSession.retryAfter) queueLivePublish(true);
    return;
  }
  liveSession.polling = true;
  try {
    const state = await getLiveSession(liveSession.code, liveSession.presenterToken);
    liveSession.consecutiveFailures = 0;
    liveSession.retryAfter = 0;
    if (applyLiveStateToCurrentSlide(state)) {
      renderPresenter();
      renderCanvas();
    }
    await consumeRemoteControllerCommands();
  } catch (error) {
    liveSession.consecutiveFailures += 1;
    liveSession.retryAfter = Date.now() + liveRetryDelay(liveSession.consecutiveFailures);
    liveSession.status = `Live sync paused: ${error.message}`;
    if (liveSession.consecutiveFailures >= 3) liveSession.backendAvailable = false;
    updatePresenterConnectionBadge();
    renderLiveJoinPanel(currentSlide());
  } finally {
    liveSession.polling = false;
  }
}

function liveRetryDelay(failureCount) {
  return Math.min(30000, 1500 * (2 ** Math.max(0, Math.min(4, failureCount - 1))));
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
  const priorFeaturedQuestion = JSON.stringify(liveSession.featuredQuestion || null);
  if (Object.hasOwn(state, "featuredQuestion")) {
    liveSession.featuredQuestion = state.featuredQuestion || null;
  }
  if (presenterWindowMode && priorFeaturedQuestion !== JSON.stringify(liveSession.featuredQuestion || null)) {
    publishPresentationControlState();
  }
  liveSession.lifecycleStatus = state.status || liveSession.lifecycleStatus;
  liveSession.status = liveSession.lifecycleStatus === "active"
    ? "Live session running. Responses sync automatically."
    : liveSession.lifecycleStatus === "paused"
      ? "Live session paused. Participants cannot respond."
      : "Session ended. Responses are available in Session History.";
  updatePresenterConnectionBadge();
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
  const changed = before !== after || priorLive !== `${liveSession.participantCount}:${liveSession.responseCount}:${liveSession.lifecycleStatus}` || priorQuestions !== JSON.stringify(liveSession.questions || []);
  if (changed) {
    sendPresenterSnapshot();
  }
  return changed;
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
  panel.innerHTML = `
    <div class="live-join-copy">
      <span>${escapeHtml(participantText)}</span>
      <div class="live-join-actions">
        ${!liveSession.backendAvailable ? '<button id="reconnectLiveSessionBtn" class="primary" type="button">Reconnect / Go live</button>' : ""}
        <button id="clearLiveSlideBtn" type="button">Clear responses</button>
        <button id="insertLiveTimerBtn" type="button">Add timer to slide</button>
        <button id="newLiveSessionBtn" type="button">New session</button>
        <button id="endLiveSessionBtn" type="button">End session</button>
      </div>
      <small>${escapeHtml(liveSession.status)}</small>
    </div>
  `;
  dom.liveControls.prepend(panel);
  panel.querySelector("#reconnectLiveSessionBtn")?.addEventListener("click", reconnectLiveSession);
  panel.querySelector("#insertLiveTimerBtn")?.addEventListener("click", insertCountdownFromPresenter);
  panel.querySelector("#clearLiveSlideBtn")?.addEventListener("click", () => {
    if (confirm("Clear every response to the current slide? This cannot be undone.")) runLiveControl("clearSlide");
  });
  panel.querySelector("#endLiveSessionBtn")?.addEventListener("click", () => {
    openEndSessionDialog();
  });
  panel.querySelector("#newLiveSessionBtn")?.addEventListener("click", () => {
    if (confirm("Start a new session instance for this deck?")) {
      beginNewLiveSession();
      liveSession.lifecycleStatus = "active";
      liveSession.backendAvailable = false;
      liveSession.participantCount = 0;
      liveSession.responseCount = 0;
      queueLivePublish(true);
    }
  });
}

function reconnectLiveSession() {
  if (liveSession.lifecycleStatus === "ended") {
    liveSession.status = "This session has ended. Start a new session to go live again.";
    renderLiveJoinPanel(currentSlide());
    return;
  }
  liveSession.consecutiveFailures = 0;
  liveSession.retryAfter = 0;
  liveSession.lastPublishedSignature = "";
  liveSession.status = "Reconnecting the current session…";
  updatePresenterConnectionBadge();
  renderLiveJoinPanel(currentSlide());
  queueLivePublish(true);
}

function openEndSessionDialog() {
  const ids = [
    "endCurrentSessionOption",
    "clearSessionResponsesOption",
    "startNewSessionOption",
    "returnFirstSlideOption",
  ];
  ids.forEach((id) => { document.querySelector(`#${id}`).checked = true; });
  updateEndSessionDependencies();
  dom.endSessionOverlay.classList.remove("hidden");
  dom.endSessionOverlay.setAttribute("aria-hidden", "false");
  document.querySelector("#continueEndSessionBtn")?.focus();
}

function closeEndSessionDialog() {
  dom.endSessionOverlay.classList.add("hidden");
  dom.endSessionOverlay.setAttribute("aria-hidden", "true");
}

function updateEndSessionDependencies() {
  const ending = document.querySelector("#endCurrentSessionOption").checked;
  for (const id of ["clearSessionResponsesOption", "startNewSessionOption"]) {
    const input = document.querySelector(`#${id}`);
    if (!ending) input.checked = false;
    input.disabled = !ending;
    input.closest("label")?.classList.toggle("disabled", !ending);
  }
}

async function applyEndSessionOptions() {
  const continueButton = document.querySelector("#continueEndSessionBtn");
  const endCurrent = document.querySelector("#endCurrentSessionOption").checked;
  const clearResponses = document.querySelector("#clearSessionResponsesOption").checked;
  const startNew = document.querySelector("#startNewSessionOption").checked;
  const returnFirst = document.querySelector("#returnFirstSlideOption").checked;
  continueButton.disabled = true;
  try {
    if (endCurrent) {
      const state = await controlLiveSession(liveSession.code, "end", liveSession.presenterToken);
      applyLiveStateToCurrentSlide(state);
      liveSession.lifecycleStatus = "ended";
      clearActiveSession();
    }
    if (clearResponses) {
      clearDeckEngagementResults();
      liveSession.participantCount = 0;
      liveSession.responseCount = 0;
      liveSession.questions = [];
      liveSession.featuredQuestion = null;
    }
    if (returnFirst) {
      activeSlideIndex = 0;
      selectedSlideIndexes = new Set([0]);
      slideSelectionAnchor = 0;
      selectedIds = [];
    }
    if (startNew) {
      beginNewLiveSession({ clearResponses });
      liveSession.lifecycleStatus = "active";
      liveSession.backendAvailable = false;
      liveSession.participantCount = 0;
      liveSession.responseCount = 0;
      liveSession.questions = [];
      liveSession.featuredQuestion = null;
      liveSession.status = "New session ready. Responses sync automatically.";
      queueLivePublish(true);
    } else if (endCurrent) {
      liveSession.status = "Session ended. Responses are available in Session History.";
    }
    closeEndSessionDialog();
    renderAll();
    presenterChannel?.postMessage({ type: "active-slide", activeSlideIndex });
    sendPresenterSnapshot();
  } catch (error) {
    liveSession.status = `Could not finish the session: ${error.message}`;
    renderLiveJoinPanel(currentSlide());
  } finally {
    continueButton.disabled = false;
  }
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
    .map((question) => `<article class="presenter-qna-item ${question.visible ? "displayed" : "pending"}" data-question-id="${attr(question.id)}"><strong>${escapeHtml(question.text)}</strong><span>${question.visible ? "On screen" : question.answered ? "Answered" : "Pending review"}</span><div class="presenter-qna-item-actions"><button data-action="${question.visible ? "hide" : "show"}" type="button">${question.visible ? "Hide" : "Display"}</button><button data-action="${question.answered ? "unanswered" : "answered"}" type="button">${question.answered ? "Reopen" : "Mark answered"}</button><button data-action="delete" type="button">Delete</button></div></article>`)
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
    document.body.classList.remove("audience-blackout");
    renderAudienceQuestionOverlay(null);
    dom.audienceEmbedLayer?.replaceChildren();
    dom.audienceDeckTitle.textContent = deck.title || "Untitled presentation";
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
  const participantBlackout = Boolean(liveSlide.runtimePresentation?.blackout);
  document.body.classList.toggle("audience-blackout", participantBlackout);
  if (participantBlackout) {
    renderAudienceQuestionOverlay(null);
    dom.audienceEmbedLayer?.replaceChildren();
    prepareHighResolutionCanvas(dom.audienceCanvas, audienceCtx);
    audienceCtx.fillStyle = "#000000";
    audienceCtx.fillRect(0, 0, SLIDE_SIZE.width, SLIDE_SIZE.height);
    dom.audienceContent.replaceChildren();
    audienceLive.lastRenderSignature = audienceRenderSignature();
    return;
  }
  const existingWordInput = dom.audienceContent.querySelector("#audienceInput");
  if (existingWordInput) {
    audienceLive.drafts[liveSlide.id] = existingWordInput.value;
  }
  dom.audienceDeckTitle.textContent = audienceLive.state.deckTitle || "Untitled presentation";
  updateDocumentTitle(audienceLive.state.deckTitle);
  syncEngagementElementsFromSlide(liveSlide);
  const liveDeck = normalizeDeck({
    ...liveStateDeck(audienceLive.state),
    slides: [liveSlide],
  });
  prepareHighResolutionCanvas(dom.audienceCanvas, audienceCtx);
  await drawSlideAsync(audienceCtx, liveSlide, liveDeck, {
    footer: true,
    slideIndex: Number(audienceLive.state.activeSlideIndex) || 0,
    revealCorrectAnswers: shouldRevealCorrectAnswers(liveSlide),
  });
  renderAudienceQuestionOverlay(audienceLive.state.featuredQuestion);
  syncAudienceEmbeds(liveSlide);
  const latestResponse = audienceLive.responses[liveSlide.id] || null;
  renderAudienceContent(
    dom.audienceContent,
    liveDeck,
    liveSlide,
    (payload) => submitAudienceLiveResponse(liveSlide, payload),
    latestResponse
  );
  const wordInput = dom.audienceContent.querySelector("#audienceInput");
  if (wordInput) {
    wordInput.value = audienceLive.drafts[liveSlide.id] || "";
    wordInput.addEventListener("input", () => {
      audienceLive.drafts[liveSlide.id] = wordInput.value;
    });
  }
  renderSessionQnaForAudience();
  if (audienceLive.state.status !== "active") {
    dom.audienceContent.querySelectorAll("button, input, textarea, select").forEach((control) => { control.disabled = true; });
  }
  renderAudienceLiveStatus();
  audienceLive.lastRenderSignature = audienceRenderSignature();
}

function syncAudienceEmbeds() {
  const layer = dom.audienceEmbedLayer;
  if (!layer || !audienceOpen) return;
  // Participant devices intentionally retain the canvas-rendered YouTube
  // placeholder. Playback belongs only to the room's Presentation View.
  layer.replaceChildren();
}

function participantTextEntryActive() {
  const active = document.activeElement;
  return Boolean(
    audienceOpen &&
    active &&
    dom.audienceContent.contains(active) &&
    (active.matches("input[type='text'], textarea") || active.isContentEditable)
  );
}

function audienceRenderSignature() {
  const state = audienceLive.state;
  return JSON.stringify({
    code: audienceLive.code,
    error: audienceLive.error,
    status: state?.status,
    deckTitle: state?.deckTitle,
    activeSlideIndex: state?.activeSlideIndex,
    slide: state?.slide,
    questions: state?.questions,
    featuredQuestion: state?.featuredQuestion,
  });
}

function renderAudienceQuestionOverlay(question) {
  if (!dom.audienceQuestionOverlay) return;
  const shouldShow = Boolean(question?.text);
  dom.audienceQuestionOverlay.classList.toggle("hidden", !shouldShow);
  if (shouldShow) dom.audienceQuestionText.textContent = question.text;
}

function renderSessionQnaForAudience() {
  const launcher = document.createElement("button");
  launcher.className = `participant-qna-launcher${participantQnaOpen ? " hidden" : ""}`;
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Ask the presenter a question");
  launcher.innerHTML = `<span aria-hidden="true">?</span>`;
  const panel = document.createElement("section");
  panel.className = `audience-results session-qna-panel${participantQnaOpen ? "" : " hidden"}`;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Ask the presenter");
  panel.innerHTML = `
    <div class="session-qna-head"><div><strong>Ask the presenter</strong><span>Your question is sent privately for presenter review.</span></div><button class="session-qna-close" type="button" aria-label="Close questions">&times;</button></div>
    <form class="session-qna-form">
      <label for="participantQuestion">Your question</label>
      <textarea id="participantQuestion" maxlength="500" rows="4" required placeholder="Type your question here"></textarea>
      <button type="submit">Submit question</button>
    </form>`;
  panel.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = panel.querySelector("textarea");
    try {
      audienceLive.state = await submitLiveQuestion(audienceLive.code, input.value, participantId);
      audienceLive.error = "Question submitted for presenter review.";
      input.value = "";
    } catch (error) {
      audienceLive.error = `Question was not sent: ${error.message}`;
    }
    renderLiveAudience();
  });
  panel.querySelector(".session-qna-close").addEventListener("click", () => {
    participantQnaOpen = false;
    panel.classList.add("hidden");
    launcher.classList.remove("hidden");
    launcher.focus();
  });
  launcher.addEventListener("click", () => {
    participantQnaOpen = true;
    panel.classList.remove("hidden");
    launcher.classList.add("hidden");
    panel.querySelector("textarea")?.focus();
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
    const contentChanged = audienceRenderSignature() !== audienceLive.lastRenderSignature;
    if (audienceOpen && audienceLive.code && contentChanged && !participantTextEntryActive()) {
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
  const previousResponses = Array.isArray(audienceLive.responses[slide.id])
    ? [...audienceLive.responses[slide.id]]
    : audienceLive.responses[slide.id]
      ? [audienceLive.responses[slide.id]]
      : [];
  if (slide.engagement?.type === "wordCloud") {
    const wordInput = dom.audienceContent.querySelector("#audienceInput");
    if (wordInput) wordInput.value = "";
    audienceLive.drafts[slide.id] = "";
  }
  audienceLive.responses[slide.id] = [...previousResponses, payload.value];
  renderLiveAudience();
  try {
    audienceLive.state = await submitLiveResponse(audienceLive.code, {
      slideId: slide.id,
      value: payload.value,
      participantId,
    });
    audienceLive.backendAvailable = true;
    if (audienceLive.state.duplicate || audienceLive.state.limitReached || audienceLive.state.accepted === false) {
      audienceLive.responses[slide.id] = previousResponses;
    }
    audienceLive.error = audienceLive.state.duplicate
      ? "Your response was already recorded."
      : audienceLive.state.limitReached
        ? "You have used all selections for this poll."
      : audienceLive.state.accepted === false
        ? "That slide has moved on. Showing the current live slide."
        : "";
  } catch (error) {
    audienceLive.responses[slide.id] = previousResponses;
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
    if (animation.trigger === "slideStart" || ((animation.trigger === "afterPrevious" || animation.trigger === "withPrevious") && index === 0)) {
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
  scheduleWithPreviousAnimations(element);
}

function scheduleWithPreviousAnimations(previousElement) {
  const items = animatedElements(currentSlide());
  const previousIndex = items.findIndex((item) => item.id === previousElement.id);
  const next = items[previousIndex + 1];
  if (next && normalizedAnimation(next).trigger === "withPrevious") {
    schedulePresenterAnimation(next);
  }
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
    prepareHighResolutionCanvas(dom.presenterCanvas, presenterCtx);
    drawSlide(presenterCtx, currentSlide(), deck, {
      footer: true,
      revealCorrectAnswers: shouldRevealCorrectAnswers(currentSlide()),
      elementStates: presenterElementStates(currentSlide(), now),
    });
    syncPresentationEmbeds(currentSlide());
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
  let previousEnd = 0;
  let previousStart = 0;
  let previewEnd = 0;
  for (const element of items) {
    const animation = normalizedAnimation(element);
    const delay = Math.max(0, Number(animation.delayMs) || 0);
    const startAt = animation.trigger === "slideStart"
      ? delay
      : animation.trigger === "withPrevious"
        ? previousStart + delay
        : previousEnd + (animation.trigger === "onClick" ? 350 : 0) + delay;
    const duration = animation.effect === "fadeIn" ? Math.max(100, Number(animation.durationMs) || 500) : 100;
    setTimeout(() => runEditorAnimation(element, token), startAt);
    previousStart = startAt;
    previousEnd = startAt + duration;
    previewEnd = Math.max(previewEnd, previousEnd);
  }
  setTimeout(() => {
    if (token !== editorAnimationToken) return;
    editorAnimationStates = null;
    renderCanvas();
  }, previewEnd + 300);
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
  drawSlide(thumbCtx, slide, deck, { footer: false, showEngagementPlaceholders: true });
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

function bindEngagementOptionEditor(engagement, scope, synchronize) {
  const editor = document.querySelector(`[data-option-editor="${scope}"]`);
  if (!editor) return;
  engagement.optionColors = normalizeEngagementOptionColors(engagement.options, engagement.optionColors);
  const colorPickers = [...editor.querySelectorAll(".engagement-option-color-picker")];
  colorPickers.forEach((picker) => picker.addEventListener("toggle", () => {
    if (!picker.open) return;
    colorPickers.forEach((other) => { if (other !== picker) other.open = false; });
  }));

  const updateViews = (message, rebuild = false) => {
    engagement.responseLimit = Math.min(
      Math.max(1, engagement.options.length),
      Math.max(1, Number(engagement.responseLimit) || 1)
    );
    pruneCorrectAnswers(engagement);
    synchronize();
    markChanged(message);
    if (rebuild) {
      renderAll();
      return;
    }
    renderCanvas();
    renderSlides();
    if (presenterOpen) renderPresenter();
    if (audienceOpen) renderAudience();
  };

  editor.querySelectorAll("[data-option-text]").forEach((input) => {
    input.addEventListener("input", () => {
      const index = Number(input.dataset.optionText);
      const previous = engagement.options[index];
      engagement.options[index] = input.value;
      if (previous !== input.value && Object.hasOwn(engagement.results || {}, previous)) {
        engagement.results[input.value] = (Number(engagement.results[input.value]) || 0) +
          (Number(engagement.results[previous]) || 0);
        delete engagement.results[previous];
      }
      engagement.correctAnswers = (engagement.correctAnswers || []).map((answer) =>
        answer === previous ? input.value : answer
      );
      updateViews("Engagement option updated");
    });
    input.addEventListener("change", () => {
      if (!input.value.trim()) {
        const index = Number(input.dataset.optionText);
        engagement.options[index] = `Option ${index + 1}`;
        updateViews("Empty option restored", true);
      }
    });
  });

  editor.querySelectorAll("[data-option-color]").forEach((input) => {
    input.addEventListener("input", () => {
      const index = Number(input.dataset.optionColor);
      engagement.optionColors[index] = input.value;
      const preview = input.closest(".engagement-option-color-picker")?.querySelector(".engagement-option-color-preview");
      if (preview) preview.style.background = input.value;
      updateViews("Engagement option color updated");
    });
  });

  editor.querySelectorAll("[data-option-color-swatch]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.optionColorSwatch);
      engagement.optionColors[index] = button.dataset.optionColorValue;
      updateViews("Engagement option color updated", true);
    });
  });

  editor.querySelectorAll("[data-option-correct]").forEach((input) => {
    input.addEventListener("change", () => {
      const option = engagement.options[Number(input.dataset.optionCorrect)];
      const answers = new Set(engagement.correctAnswers || []);
      if (input.checked) answers.add(option);
      else answers.delete(option);
      engagement.correctAnswers = [...answers];
      updateViews("Correct answer updated");
    });
  });

  editor.querySelectorAll("[data-option-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.optionRemove);
      const [removed] = engagement.options.splice(index, 1);
      engagement.optionColors.splice(index, 1);
      engagement.correctAnswers = (engagement.correctAnswers || []).filter((answer) => answer !== removed);
      updateViews("Engagement option removed", true);
    });
  });

  editor.querySelector("[data-option-add]")?.addEventListener("click", () => {
    if (engagement.options.length >= MAX_ENGAGEMENT_OPTIONS) return;
    let number = engagement.options.length + 1;
    let label = `Option ${number}`;
    while (engagement.options.includes(label)) {
      number += 1;
      label = `Option ${number}`;
    }
    engagement.options.push(label);
    engagement.optionColors = normalizeEngagementOptionColors(engagement.options, engagement.optionColors);
    updateViews("Engagement option added", true);
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

  document.querySelector("#engagementHasCorrectAnswers")?.addEventListener("change", (event) => {
    element.hasCorrectAnswers = event.target.checked;
    if (!element.hasCorrectAnswers) {
      element.correctAnswers = [];
      element.correctAnswerRevealed = false;
    }
    syncSlideEngagementFromElement(element);
    markChanged("Correct-answer setting updated");
    renderAll();
  });

  const updateReactionOptions = (options) => {
      element.reactionOptions = options.map(normalizeReactionOption).filter(Boolean).slice(0, MAX_REACTION_OPTIONS);
      for (const key of element.reactionOptions) element.reactions[key] ??= 0;
      syncSlideEngagementFromElement(element);
      markChanged("Reaction emojis updated");
      renderAll();
  };
  document.querySelector(".reaction-picker-menu")?.addEventListener("toggle", (event) => {
    if (!event.currentTarget.open) return;
    window.requestAnimationFrame(() => {
      event.currentTarget.querySelector(".reaction-picker-popover")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
  document.querySelectorAll("[data-reaction-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const options = [...(element.reactionOptions || DEFAULT_REACTION_OPTIONS)];
      if (options.length <= 1) return;
      options.splice(Number(button.dataset.reactionRemove), 1);
      updateReactionOptions(options);
    });
  });
  document.querySelectorAll("[data-reaction-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const options = [...(element.reactionOptions || DEFAULT_REACTION_OPTIONS)];
      if (options.length >= MAX_REACTION_OPTIONS || options.includes(button.dataset.reactionAdd)) return;
      updateReactionOptions([...options, button.dataset.reactionAdd]);
    });
  });
  document.querySelector("#addCustomReactionEmoji")?.addEventListener("click", () => {
    const input = document.querySelector("#customReactionEmoji");
    const option = normalizeReactionOption(input?.value);
    const options = [...(element.reactionOptions || DEFAULT_REACTION_OPTIONS)];
    if (!option) {
      document.querySelector("#reactionPickerError").textContent = "Enter one emoji.";
      return;
    }
    if (options.length >= MAX_REACTION_OPTIONS || options.includes(option)) return;
    updateReactionOptions([...options, option]);
  });

  bindEngagementOptionEditor(element, "element", () => syncSlideEngagementFromElement(element));
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
  updateDocumentTitle();
  recordHistory(message);
  setStatus(message);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDeck(deck).catch(() => {}), 500);
  queueEditorPresenterSync();
}

function updateDocumentTitle(title = "") {
  const deckName = String(title || deck?.title || "Untitled presentation").trim();
  const viewName = presentationWindowMode
    ? "Presentation"
    : presenterWindowMode
      ? "Presenter"
      : location.hash.startsWith("#audience")
        ? "Participant"
        : "Editor";
  document.title = `${viewName} · ${deckName} | HySlides`;
}

function queueEditorPresenterSync() {
  if (presenterWindowMode || presentationWindowMode) return;
  clearTimeout(editorPresenterSyncTimer);
  editorPresenterSyncTimer = setTimeout(() => {
    presenterChannel?.postMessage({
      type: "editor-deck-updated",
      deck: JSON.parse(JSON.stringify(deck)),
      activeSlideIndex,
    });
  }, 120);
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
  slide.engagement.optionColors = normalizeEngagementOptionColors(
    slide.engagement.options,
    element.optionColors
  );
  slide.engagement.correctAnswers = [...(element.correctAnswers || [])];
  slide.engagement.hasCorrectAnswers = Boolean(element.hasCorrectAnswers);
  slide.engagement.showCorrectAnswer = element.showCorrectAnswer ?? true;
  slide.engagement.correctAnswerRevealed =
    element.correctAnswerRevealed ?? slide.engagement.correctAnswerRevealed ?? false;
  slide.engagement.responseLimit = Math.max(1, Number(element.responseLimit) || Number(slide.engagement.responseLimit) || 1);
  slide.engagement.reactionOptions = [...(element.reactionOptions || DEFAULT_REACTION_OPTIONS)].slice(0, MAX_REACTION_OPTIONS);
  pruneCorrectAnswers(slide.engagement);
}

function syncEngagementElementsFromSlide(slide) {
  ensureEngagement(slide);
  syncEngagementResultCharts(slide);
  for (const element of slide.elements) {
    if (element.type !== "engagement") {
      continue;
    }
    element.mode = slide.engagement.type;
    element.prompt = slide.engagement.prompt;
    element.options = [...(slide.engagement.options || [])];
    element.optionColors = normalizeEngagementOptionColors(
      element.options,
      slide.engagement.optionColors
    );
    element.correctAnswers = [...(slide.engagement.correctAnswers || [])];
    element.hasCorrectAnswers = Boolean(slide.engagement.hasCorrectAnswers);
    element.results = { ...(slide.engagement.results || {}) };
    element.qna = [...(slide.engagement.qna || [])];
    element.reactions = { ...(slide.engagement.reactions || {}) };
    element.reactionOptions = [...(slide.engagement.reactionOptions || DEFAULT_REACTION_OPTIONS)].slice(0, MAX_REACTION_OPTIONS);
    element.showCorrectAnswer = slide.engagement.showCorrectAnswer;
    element.correctAnswerRevealed = slide.engagement.correctAnswerRevealed ?? false;
    element.responseLimit = Math.max(1, Number(slide.engagement.responseLimit) || 1);
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

async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    return copied;
  } catch {
    return false;
  }
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

function beginNewLiveSession(options = {}) {
  if (options.clearResponses !== false) clearDeckEngagementResults();
  liveSession.instanceId = crypto.randomUUID();
  liveSession.sessionName = `${deck.title || "Untitled presentation"} — ${new Date().toLocaleString()}`;
  liveSession.lifecycleStatus = "active";
  liveSession.lastPublishedSignature = "";
  writeActiveSession();
}

function closeRemotePairing() {
  const overlay = document.querySelector("#remotePairingOverlay");
  overlay?.classList.add("hidden");
  overlay?.setAttribute("aria-hidden", "true");
}

async function openRemotePairing() {
  const overlay = document.querySelector("#remotePairingOverlay");
  const content = document.querySelector("#remotePairingContent");
  overlay?.classList.remove("hidden");
  overlay?.setAttribute("aria-hidden", "false");
  if (!content) return;
  content.innerHTML = "<p>Creating a secure controller link…</p>";
  try {
    await publishCurrentLiveSession(true);
    const pairing = await createRemoteControllerPairing(liveSession.code, liveSession.presenterToken);
    await publishRemoteControllerSnapshot(true);
    const url = pairing.controllerUrl;
    content.innerHTML = `
      <img src="${attr(liveQrImageSrc(url))}" alt="QR code for the private presenter controller">
      <div>
        <strong>Scan with the presenter's phone</strong>
        <p>This link controls this session only. Do not share it with participants.</p>
        <div class="remote-pairing-link">
          <input value="${attr(url)}" readonly aria-label="Private presenter controller link">
          <button type="button" data-copy-remote>Copy</button>
        </div>
        <button type="button" data-open-remote>Open controller</button>
      </div>`;
    content.querySelector("[data-copy-remote]")?.addEventListener("click", async (event) => {
      await navigator.clipboard.writeText(url);
      event.currentTarget.textContent = "Copied";
    });
    content.querySelector("[data-open-remote]")?.addEventListener("click", () => window.open(url, "_blank", "noopener"));
  } catch (error) {
    content.innerHTML = `<p class="remote-pairing-error">Could not create the controller: ${escapeHtml(error.message)}</p>`;
  }
}

function remoteControllerSnapshot() {
  const thumbnails = [...(dom.presenterSlideList?.querySelectorAll("canvas") || [])];
  const timerElement = countdownElements(currentSlide())[0];
  const timerState = timerElement ? countdownRuntime.get(timerElement.id) : null;
  return {
    deckId: deck.id,
    deckTitle: deck.title || "Untitled presentation",
    activeSlideIndex,
    blackout: presentationBlackout,
    participantCount: liveSession.participantCount,
    responseCount: liveSession.responseCount,
    status: liveSession.lifecycleStatus,
    timer: timerElement ? {
      id: timerElement.id,
      remainingSeconds: countdownRemaining(timerState || { remainingSeconds: timerElement.durationSeconds || 0 }),
      running: Boolean(timerState?.running),
    } : null,
    slides: deck.slides.map((slide, index) => ({
      id: slide.id,
      title: slide.title || `Slide ${index + 1}`,
      notes: slide.notes || "",
      included: !skippedSlideIds.has(slide.id),
      thumbnail: thumbnails[index]?.toDataURL("image/jpeg", 0.58) || "",
    })),
  };
}

function queueRemoteControllerPublish(force = false) {
  if (!presenterWindowMode || !liveSession.backendAvailable || !liveSession.code) return;
  clearTimeout(remoteControllerPublishTimer);
  remoteControllerPublishTimer = window.setTimeout(() => publishRemoteControllerSnapshot(), force ? 0 : 300);
}

async function publishRemoteControllerSnapshot() {
  if (!presenterWindowMode || !liveSession.backendAvailable || !liveSession.code) return;
  try {
    await publishRemoteControllerState(liveSession.code, remoteControllerSnapshot(), liveSession.presenterToken);
  } catch {
    // The normal live-session status remains the authoritative connection indicator.
  }
}

async function consumeRemoteControllerCommands() {
  if (!presenterWindowMode || remoteControllerCommandsPolling || !liveSession.backendAvailable) return;
  remoteControllerCommandsPolling = true;
  try {
    const result = await getRemoteControllerCommands(liveSession.code, liveSession.presenterToken);
    for (const command of result.commands || []) await executeRemoteControllerCommand(command);
  } catch {
    // Live polling will retry on its normal cadence.
  } finally {
    remoteControllerCommandsPolling = false;
  }
}

async function executeRemoteControllerCommand(command) {
  if (command.action === "next") advancePresenter();
  else if (command.action === "previous") stepSlide(-1);
  else if (command.action === "goTo") {
    const index = clamp(Math.round(Number(command.slideIndex) || 0), 0, deck.slides.length - 1);
    if (!skippedSlideIds.has(deck.slides[index].id)) {
      activeSlideIndex = index;
      syncPresenterSlideChange();
    }
  } else if (command.action === "toggleIncluded") {
    const slide = deck.slides[clamp(Math.round(Number(command.slideIndex) || 0), 0, deck.slides.length - 1)];
    if (slide) {
      if (command.included) skippedSlideIds.delete(slide.id);
      else skippedSlideIds.add(slide.id);
      presenterChannel?.postMessage({ type: "skip-state", skippedSlideIds: [...skippedSlideIds] });
      await renderPresenter();
    }
  } else if (command.action === "blackout") togglePresentationBlackout();
  else if (command.action === "clearResponses") await runLiveControl("clearSlide");
  else if (command.action === "addTimer") insertCountdownFromPresenter();
  else if (command.action === "adjustTimer") {
    const timer = countdownElements(currentSlide())[0];
    if (timer) addCountdownTime(timer.id, clamp(Number(command.seconds) || 0, -3600, 3600));
  } else if (command.action === "removeTimer") {
    const timer = countdownElements(currentSlide())[0];
    if (timer) {
      currentSlide().elements = currentSlide().elements.filter((element) => element.id !== timer.id);
      countdownRuntime.delete(timer.id);
      presenterChannel?.postMessage({ type: "deck-updated", deck: JSON.parse(JSON.stringify(deck)), activeSlideIndex });
      queueLivePublish(true);
      await renderPresenter();
    }
  }
  else if (command.action === "newSession") {
    beginNewLiveSession();
    queueLivePublish(true);
    await renderPresenter();
  } else if (command.action === "endSession") await runLiveControl("end");
  else if (command.action === "moderateQuestion" && command.questionId) {
    const state = await moderateLiveQuestion(
      liveSession.code,
      command.questionId,
      command.moderationAction,
      liveSession.presenterToken
    );
    applyLiveStateToCurrentSlide(state);
    await renderPresenter();
  }
  queueRemoteControllerPublish(true);
}

function initRemoteController() {
  const code = remoteControllerMatch?.[1] || "";
  const token = remoteControllerMatch?.[2] || "";
  document.title = "Presenter Remote — HySlides";
  document.querySelectorAll("[data-remote-tab]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-remote-tab]").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll("[data-remote-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.remotePanel === button.dataset.remoteTab));
  }));
  document.querySelector("#remoteNotesToggleBtn")?.addEventListener("click", (event) => {
    const notes = document.querySelector("#remoteNotes");
    const expanded = event.currentTarget.getAttribute("aria-expanded") !== "true";
    event.currentTarget.setAttribute("aria-expanded", String(expanded));
    event.currentTarget.textContent = expanded ? "Hide slide notes" : "View slide notes";
    notes?.classList.toggle("hidden", !expanded);
  });
  const send = (action, payload = {}) => sendRemoteControllerCommand(code, token, { action, ...payload }).then(() => {
    window.setTimeout(refreshRemoteController, 250);
  }).catch(showRemoteControllerError);
  document.querySelector("#remotePreviousBtn")?.addEventListener("click", () => send("previous"));
  document.querySelector("#remoteNextBtn")?.addEventListener("click", () => send("next"));
  document.querySelector("#remoteBlackoutBtn")?.addEventListener("click", () => send("blackout"));
  document.querySelector("#remoteClearResponsesBtn")?.addEventListener("click", () => {
    if (confirm("Clear responses to the current slide?")) send("clearResponses");
  });
  document.querySelector("#remoteAddTimerBtn")?.addEventListener("click", () => send("addTimer"));
  document.querySelector("#remoteTimerMinusBtn")?.addEventListener("click", () => send("adjustTimer", { seconds: -60 }));
  document.querySelector("#remoteTimerPlusBtn")?.addEventListener("click", () => send("adjustTimer", { seconds: 60 }));
  document.querySelector("#remoteTimerRemoveBtn")?.addEventListener("click", () => send("removeTimer"));
  document.querySelector("#remoteNewSessionBtn")?.addEventListener("click", () => {
    if (confirm("Start a new session and clear current responses?")) send("newSession");
  });
  document.querySelector("#remoteEndSessionBtn")?.addEventListener("click", () => {
    if (confirm("End this live session? This controller link will expire.")) send("endSession");
  });
  document.querySelector("#remoteQnaList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remote-question-action]");
    if (button) send("moderateQuestion", {
      questionId: button.closest("[data-question-id]").dataset.questionId,
      moderationAction: button.dataset.remoteQuestionAction,
    });
  });
  remoteControllerState = { code, token, send };
  refreshRemoteController();
  remoteControllerPollTimer = window.setInterval(refreshRemoteController, 1000);
}

async function refreshRemoteController() {
  if (!remoteControllerState) return;
  try {
    const state = await getRemoteControllerState(remoteControllerState.code, remoteControllerState.token);
    renderRemoteController(state);
  } catch (error) {
    showRemoteControllerError(error);
  }
}

function showRemoteControllerError(error) {
  const status = document.querySelector("#remoteConnectionStatus");
  if (status) {
    status.textContent = /expired|unauthorized|ended/i.test(error.message) ? "Expired" : "Reconnecting";
    status.classList.add("error");
  }
}

function renderRemoteController(state) {
  const slides = Array.isArray(state.slides) ? state.slides : [];
  const index = clamp(Number(state.activeSlideIndex) || 0, 0, Math.max(0, slides.length - 1));
  const current = slides[index] || {};
  document.querySelector("#remoteDeckTitle").textContent = state.deckTitle || "HySlides";
  const status = document.querySelector("#remoteConnectionStatus");
  status.textContent = state.live?.status === "active" ? "Live" : state.live?.status || "Connected";
  status.classList.remove("error");
  document.querySelector("#remoteCurrentThumbnail").src = current.thumbnail || "";
  document.querySelector("#remoteSlidePosition").textContent = slides.length ? `Slide ${index + 1} of ${slides.length}` : "No slides";
  document.querySelector("#remoteCurrentTitle").textContent = current.title || "Waiting for presenter…";
  document.querySelector("#remoteNotes").textContent = current.notes || "No notes for this slide.";
  const blackout = document.querySelector("#remoteBlackoutBtn");
  blackout.setAttribute("aria-pressed", String(Boolean(state.blackout)));
  blackout.textContent = state.blackout ? "Resume screen" : "Black screen";
  document.querySelector("#remoteLiveSummary").innerHTML = `
    <strong>${Number(state.live?.participantCount || state.participantCount || 0)} connected</strong>
    <span>${Number(state.live?.responseCount || state.responseCount || 0)} responses on this slide</span>`;
  const timer = state.timer;
  const timerPanel = document.querySelector("#remoteTimerPanel");
  timerPanel?.classList.toggle("hidden", !timer);
  if (timer) document.querySelector("#remoteTimerReadout").textContent = formatCountdown(timer.remainingSeconds);
  document.querySelector('[data-remote-tab="live"]')?.classList.toggle("has-active-timer", Boolean(timer));
  renderRemoteSlideStrip(document.querySelector("#remoteQuickSlides"), slides, index, true);
  renderRemoteQuestions(state.live?.questions || []);
}

function renderRemoteSlideStrip(container, slides, activeIndex, compact) {
  if (!container) return;
  container.replaceChildren();
  slides.forEach((slide, index) => {
    const card = document.createElement("article");
    const current = index === activeIndex;
    card.className = `remote-slide-card${current ? " current" : ""}${slide.included ? "" : " skipped"}`;
    card.innerHTML = `
      <div class="remote-slide-preview">
        <img src="${attr(slide.thumbnail || "")}" alt=""><strong>${index + 1}. ${escapeHtml(slide.title || "")}</strong>
      </div>
      <span class="remote-slide-state">${current ? "Current slide" : slide.included ? "Included" : "Skipped"}</span>
      ${current ? "" : `<div class="remote-slide-actions">
        <button type="button" data-remote-slide-action="jump" ${slide.included ? "" : "disabled"}>Jump to…</button>
        <button type="button" data-remote-slide-action="toggle">${slide.included ? "Skip" : "Include"}</button>
      </div>`}`;
    card.querySelector('[data-remote-slide-action="jump"]')?.addEventListener("click", () => {
      remoteControllerState.send("goTo", { slideIndex: index });
    });
    card.querySelector('[data-remote-slide-action="toggle"]')?.addEventListener("click", () => {
      remoteControllerState.send("toggleIncluded", { slideIndex: index, included: !slide.included });
    });
    container.append(card);
  });
  if (compact) container.querySelector(".current")?.scrollIntoView({ block: "nearest", inline: "center" });
}

function renderRemoteQuestions(questions) {
  const list = document.querySelector("#remoteQnaList");
  list.replaceChildren();
  const visible = questions.filter((question) => question.status !== "deleted");
  const unanswered = visible.filter((question) => !question.answered);
  const answered = visible.filter((question) => question.answered);
  const unansweredCount = unanswered.length;
  document.querySelector("#remoteQnaIndicator")?.classList.toggle("hidden", unansweredCount === 0);
  if (!visible.length) {
    list.innerHTML = "<p>No audience questions yet.</p>";
    return;
  }
  const renderGroup = (label, items, emptyMessage) => {
    const section = document.createElement("section");
    section.className = "remote-qna-group";
    section.innerHTML = `<header><h3>${label}</h3><span>${items.length}</span></header>`;
    if (!items.length) {
      section.insertAdjacentHTML("beforeend", `<p class="remote-qna-empty">${emptyMessage}</p>`);
      list.append(section);
      return;
    }
    const groupList = document.createElement("div");
    groupList.className = "remote-qna-group-list";
    items.forEach((question) => {
    const row = document.createElement("article");
    row.className = `remote-qna-item${question.visible ? " displayed" : ""}`;
    row.dataset.questionId = question.id;
    row.innerHTML = `
      <strong>${escapeHtml(question.text || "")}</strong>
      <span>${Number(question.upvotes ?? question.votes ?? 0)} upvotes${question.visible ? " · On screen" : ""}</span>
      <div class="remote-qna-actions">
        <button type="button" data-remote-question-action="${question.visible ? "hide" : "show"}">${question.visible ? "Hide" : "Display"}</button>
        <button type="button" data-remote-question-action="${question.answered ? "unanswered" : "answered"}">${question.answered ? "Reopen" : "Mark answered"}</button>
        <button type="button" data-remote-question-action="delete">Delete</button>
      </div>`;
      groupList.append(row);
    });
    section.append(groupList);
    list.append(section);
  };
  renderGroup("Unanswered", unanswered, "No unanswered questions.");
  renderGroup("Answered", answered, "No answered questions.");
}

function clearDeckEngagementResults(targetDeck = deck) {
  for (const slide of targetDeck.slides || []) {
    if (!slide.engagement?.enabled) continue;
    slide.engagement.results = {};
    slide.engagement.qna = [];
    slide.engagement.reactions = {
      ...Object.fromEntries((slide.engagement.reactionOptions || DEFAULT_REACTION_OPTIONS).map((key) => [key, 0])),
    };
    syncEngagementElementsFromSlide(slide);
  }
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
