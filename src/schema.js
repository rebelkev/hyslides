export const SLIDE_SIZE = {
  width: 1280,
  height: 720,
};

export const MAX_ENGAGEMENT_OPTIONS = 10;
export const ENGAGEMENT_OPTION_COLORS = [
  "#2454d6", "#0c8b7f", "#d94b3d", "#ba7315", "#8b0c8d",
  "#3b82f6", "#10b981", "#f97316", "#ec4899", "#637083",
];

export function normalizeEngagementOptionColors(options = [], colors = []) {
  return options.slice(0, MAX_ENGAGEMENT_OPTIONS).map((_, index) => {
    const color = String(colors?.[index] || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color)
      ? color.toLowerCase()
      : ENGAGEMENT_OPTION_COLORS[index % ENGAGEMENT_OPTION_COLORS.length];
  });
}
export const MAX_REACTION_OPTIONS = 5;
export const REACTION_CATALOG = {
  thumbsUp: "👍",
  heart: "❤️",
  clap: "👏",
  wow: "😮",
  fire: "🔥",
  laugh: "😂",
  celebrate: "🎉",
  thinking: "🤔",
  hundred: "💯",
  rocket: "🚀",
  eyes: "👀",
  sad: "😢",
  grin: "😀",
  smile: "😊",
  wink: "😉",
  cool: "😎",
  starEyes: "🤩",
  mindBlown: "🤯",
  confused: "😕",
  worried: "😟",
  angry: "😠",
  cry: "😭",
  party: "🥳",
  handshake: "🤝",
  muscle: "💪",
  pray: "🙏",
  ok: "👌",
  victory: "✌️",
  raisedHands: "🙌",
  wave: "👋",
  pointingUp: "☝️",
  check: "✅",
  cross: "❌",
  warning: "⚠️",
  question: "❓",
  lightbulb: "💡",
  star: "⭐",
  sparkle: "✨",
  boom: "💥",
  target: "🎯",
  trophy: "🏆",
  medal: "🏅",
  gift: "🎁",
  balloon: "🎈",
  music: "🎵",
  coffee: "☕",
  pizza: "🍕",
  cake: "🎂",
  globe: "🌍",
  sun: "☀️",
  moon: "🌙",
  rainbow: "🌈",
  lightning: "⚡",
  snowflake: "❄️",
  computer: "💻",
  chart: "📈",
  pin: "📌",
  bell: "🔔",
  megaphone: "📣",
};
export const DEFAULT_REACTION_OPTIONS = ["thumbsUp", "heart", "clap", "wow", "fire"];

export function normalizeReactionOption(value) {
  const option = String(value || "").trim();
  if (REACTION_CATALOG[option]) return option;
  const emojiLike = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(option);
  const segments = typeof Intl?.Segmenter === "function"
    ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(option)]
    : [{ segment: option }];
  return option.length <= 32 && emojiLike && segments.length === 1 ? option : "";
}

export function reactionEmoji(value) {
  const option = normalizeReactionOption(value);
  return REACTION_CATALOG[option] || option;
}

export const GRID_SIZE = 8;

export const ELEMENT_TYPES = [
  "text",
  "image",
  "shape",
  "icon",
  "chart",
  "table",
  "divider",
  "engagement",
  "countdown",
  "embed",
];

export function uid(prefix = "id") {
  if (crypto?.randomUUID) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createTheme(overrides = {}) {
  return {
    id: uid("theme"),
    name: "HySlides Studio",
    fonts: {
      heading: "Inter",
      body: "Inter",
    },
    typographyStyles: {
      display: { name: "Display", fontFamily: "Inter", fontSize: 72, fontWeight: 800, lineHeight: 1.05, color: "#1d232a" },
      title: { name: "Slide title", fontFamily: "Inter", fontSize: 52, fontWeight: 800, lineHeight: 1.08, color: "#1d232a" },
      subtitle: { name: "Subtitle", fontFamily: "Inter", fontSize: 34, fontWeight: 600, lineHeight: 1.15, color: "#637083" },
      heading: { name: "Heading", fontFamily: "Inter", fontSize: 30, fontWeight: 750, lineHeight: 1.15, color: "#1d232a" },
      body: { name: "Body", fontFamily: "Inter", fontSize: 24, fontWeight: 500, lineHeight: 1.25, color: "#1d232a" },
      caption: { name: "Caption / label", fontFamily: "Inter", fontSize: 16, fontWeight: 600, lineHeight: 1.2, color: "#637083" },
    },
    colors: {
      ink: "#1d232a",
      muted: "#637083",
      primary: "#2454d6",
      accent: "#0c8b7f",
      warning: "#ba7315",
      coral: "#d94b3d",
      background: "#ffffff",
      surface: "#f6f8fb",
    },
    brandPalette: ["#2454d6", "#0c8b7f", "#1d232a", "#637083", "#ffffff"],
    brandColorStyles: [
      { id: "brand-primary", name: "Primary", color: "#2454d6" },
      { id: "brand-accent", name: "Accent", color: "#0c8b7f" },
      { id: "brand-ink", name: "Ink", color: "#1d232a" },
      { id: "brand-muted", name: "Muted", color: "#637083" },
      { id: "brand-white", name: "White", color: "#ffffff" },
    ],
    defaultBackground: {
      type: "color",
      color: "#ffffff",
      gradientStart: "#2454d6",
      gradientEnd: "#0c8b7f",
      gradientAngle: 135,
    },
    logo: {
      src: "",
      corner: "bottom-right",
      showOnSlides: true,
      width: 120,
      margin: 28,
    },
    spacing: 24,
    master: {
      title: {
        x: 84,
        y: 70,
        w: 720,
        h: 88,
      },
      footer: {
        showSlideNumber: true,
        slideNumberPosition: "bottom-right",
        color: "#637083",
        disclaimer: {
          enabled: false,
          text: "",
          typographyStyleId: "caption",
          position: "bottom-center",
        },
      },
    },
    ...overrides,
  };
}

export function createElement(type, overrides = {}) {
  const base = {
    id: uid(type),
    type,
    x: 120,
    y: 120,
    w: 360,
    h: 120,
    rotation: 0,
    opacity: 1,
    locked: false,
    groupId: null,
    brandColorStyleId: null,
    name: titleCase(type),
    animation: {
      effect: "none",
      trigger: "slideStart",
      durationMs: 500,
      delayMs: 0,
      easing: "ease",
      order: 0,
    },
  };

  const byType = {
    text: {
      text: "Add thoughtful slide text",
      fontFamily: "Inter",
      fontSize: 42,
      fontWeight: 700,
      italic: false,
      underline: false,
      bulletList: false,
      color: "#1d232a",
      align: "left",
      verticalAlign: "top",
      lineHeight: 1.12,
      autoHeight: true,
      fill: "transparent",
      typographyStyleId: "body",
      useGlobalTypography: true,
    },
    shape: {
      shape: "roundedRect",
      fillType: "color",
      fill: "#e8efff",
      fillGradientStart: "#2454d6",
      fillGradientEnd: "#0c8b7f",
      fillGradientAngle: 135,
      fillImage: "",
      fillImageFit: "cover",
      fillShader: "aurora",
      fillEffectColorA: "#2454d6",
      fillEffectColorB: "#0c8b7f",
      fillShaderIntensity: 0.6,
      fillShaderSpeed: 1,
      stroke: "#2454d6",
      strokeWidth: 2,
      radius: 10,
    },
    image: {
      alt: "Slide image",
      src: sampleImageDataUri(),
      fit: "cover",
    },
    icon: {
      x: 560,
      y: 290,
      w: 160,
      h: 160,
      icon: "sparkles",
      fill: "#2454d6",
      strokeWidth: 2,
      iconStyle: "outline",
      iconFrame: "none",
      frameFill: "#e8efff",
      frameBrandColorStyleId: null,
      padding: 10,
      flipHorizontal: false,
      flipVertical: false,
      decorative: true,
      alt: "",
    },
    chart: {
      chartType: "bar",
      title: "Adoption by segment",
      labels: ["Sales", "Success", "Ops", "Exec"],
      values: [72, 58, 46, 33],
      fill: "#0c8b7f",
      axisColor: "#637083",
    },
    table: {
      rows: 3,
      cols: 3,
      cells: [
        ["Metric", "Current", "Target"],
        ["Activation", "42%", "58%"],
        ["Retention", "71%", "80%"],
      ],
      headerFill: "#1d232a",
      headerColor: "#ffffff",
      borderColor: "#cbd5e1",
      textColor: "#1d232a",
    },
    divider: {
      w: 680,
      h: 6,
      fill: "#d94b3d",
      stroke: "transparent",
      strokeWidth: 0,
      radius: 3,
      name: "Line",
    },
    engagement: {
      x: 126,
      y: 188,
      w: 760,
      h: 330,
      mode: "poll",
      prompt: "What should we ask the audience?",
      options: ["Option A", "Option B", "Option C"],
      optionColors: [...ENGAGEMENT_OPTION_COLORS.slice(0, 3)],
      correctAnswers: [],
      hasCorrectAnswers: false,
      showCorrectAnswer: true,
      correctAnswerRevealed: false,
      responseLimit: 1,
      reactionOptions: [...DEFAULT_REACTION_OPTIONS],
      fill: "#ffffff",
      stroke: "#cbd5e1",
      accent: "#2454d6",
      name: "Engagement",
    },
    embed: {
      x: 240,
      y: 150,
      w: 800,
      h: 450,
      provider: "youtube",
      url: "",
      volume: 80,
      playbackRate: 1,
      startSeconds: 0,
      autoplay: false,
      loop: false,
      showControls: true,
      fullscreenOnPlay: true,
      fill: "#111827",
      name: "YouTube video",
    },
    countdown: {
      x: 390,
      y: 240,
      w: 500,
      h: 180,
      durationSeconds: 420,
      completionMessage: "Break is over",
      completionBehavior: "message",
      autoStart: false,
      autoAdvance: false,
      fontFamily: "Inter",
      fontSize: 104,
      fontWeight: 800,
      color: "#ffffff",
      fill: "#111827",
      backgroundOpacity: 0.78,
      cornerRadius: 18,
      align: "center",
      name: "Countdown timer",
    },
  };

  const element = {
    ...base,
    ...byType[type],
    ...overrides,
  };
  if (type === "text" && overrides.useGlobalTypography === undefined) {
    const formatKeys = ["fontFamily", "fontSize", "fontWeight", "lineHeight", "color"];
    element.useGlobalTypography = !formatKeys.some((key) => Object.prototype.hasOwnProperty.call(overrides, key));
  }
  return element;
}

export function createSection(overrides = {}) {
  return {
    id: uid("section"),
    name: "Untitled section",
    collapsed: false,
    ...overrides,
  };
}

export function createSlide(overrides = {}) {
  return {
    id: uid("slide"),
    title: "Untitled slide",
    sectionId: null,
    layout: "blank",
    background: "#ffffff",
    backgroundStyleId: null,
    backgroundType: "color",
    backgroundImage: "",
    backgroundImageFit: "cover",
    backgroundGradientStart: "#2454d6",
    backgroundGradientStartStyleId: null,
    backgroundGradientEnd: "#0c8b7f",
    backgroundGradientEndStyleId: null,
    backgroundGradientAngle: 135,
    backgroundOverlayEnabled: false,
    backgroundOverlayColor: "#000000",
    backgroundOverlayColorStyleId: null,
    backgroundOverlayOpacity: 0,
    backgroundShader: "none",
    backgroundEffectColorA: "#2454d6",
    backgroundEffectColorAStyleId: null,
    backgroundEffectColorB: "#0c8b7f",
    backgroundEffectColorBStyleId: null,
    backgroundShaderIntensity: 0.5,
    backgroundShaderSpeed: 1,
    backgroundUseDeckDefault: false,
    logoVisible: null,
    logoCorner: null,
    slideNumberVisible: null,
    slideNumberPosition: null,
    disclaimerVisible: null,
    disclaimerPosition: null,
    notes: "",
    transition: {
      type: "none",
      durationMs: 0,
    },
    animations: [],
    engagement: {
      enabled: false,
      type: "poll",
      prompt: "What should we prioritize next?",
      options: ["Fidelity", "Speed", "Templates"],
      optionColors: [...ENGAGEMENT_OPTION_COLORS.slice(0, 3)],
      correctAnswers: [],
      hasCorrectAnswers: false,
      showCorrectAnswer: true,
      correctAnswerRevealed: false,
      responseLimit: 1,
      reactionOptions: [...DEFAULT_REACTION_OPTIONS],
      results: {},
      qna: [],
      reactions: {
        thumbsUp: 0,
        heart: 0,
        clap: 0,
        wow: 0,
        fire: 0,
      },
    },
    elements: [],
    ...overrides,
  };
}

export function createDeck(overrides = {}) {
  return {
    id: uid("deck"),
    version: 1,
    title: "HySlides Product Narrative",
    updatedAt: new Date().toISOString(),
    theme: createTheme(),
    settings: {
      grid: GRID_SIZE,
      snapToGrid: true,
      showGuides: true,
      audienceCode: createAudienceAccessCode(),
    },
    unsupportedFeatures: [],
    importReport: [],
    sections: [],
    slides: [],
    ...overrides,
  };
}

function createAudienceAccessCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function createSeedDeck() {
  const deck = createDeck();
  deck.slides = [
    createSlide({
      title: "Product narrative",
      layout: "title",
      notes:
        "Open with the product position: a precise slide editor first, interaction modules second.",
      background: "#fbfcfe",
      elements: [
        createElement("divider", {
          x: 86,
          y: 78,
          w: 130,
          h: 7,
          fill: "#0c8b7f",
          name: "Accent divider",
        }),
        createElement("text", {
          x: 84,
          y: 114,
          w: 720,
          h: 156,
          text: "HySlides",
          fontSize: 82,
          fontWeight: 800,
          color: "#1d232a",
          name: "Title",
        }),
        createElement("text", {
          x: 90,
          y: 276,
          w: 660,
          h: 86,
          text:
            "A presentation editor with PowerPoint-style control and optional live engagement.",
          fontSize: 28,
          fontWeight: 500,
          color: "#4c5868",
          lineHeight: 1.25,
          name: "Subtitle",
        }),
        createElement("shape", {
          x: 820,
          y: 98,
          w: 310,
          h: 442,
          fill: "#e8efff",
          stroke: "#a9bdf8",
          radius: 18,
          name: "Preview surface",
        }),
        createElement("image", {
          x: 854,
          y: 132,
          w: 244,
          h: 160,
          src: productImageDataUri(),
          alt: "Slide design preview",
          name: "Product image",
        }),
        createElement("chart", {
          x: 862,
          y: 334,
          w: 232,
          h: 142,
          values: [88, 64, 42, 29],
          labels: ["Edit", "Import", "Live", "Export"],
          name: "Workflow chart",
        }),
      ],
    }),
    createSlide({
      title: "Editor priorities",
      layout: "content",
      notes:
        "Demonstrate precise editing controls: snap, alignment, locking, layering, grouping, and theme styles.",
      background: "#ffffff",
      elements: [
        createElement("text", {
          x: 78,
          y: 68,
          w: 820,
          h: 72,
          text: "Design fidelity comes first",
          fontSize: 52,
          fontWeight: 800,
          name: "Slide title",
        }),
        createElement("table", {
          x: 84,
          y: 184,
          w: 520,
          h: 250,
          cells: [
            ["Capability", "Status", "Priority"],
            ["Canvas editing", "Live", "Must-have"],
            ["PPTX import/export", "Pipeline", "Must-have"],
            ["Engagement", "Optional", "Module"],
          ],
          rows: 4,
          cols: 3,
          name: "Workflow table",
        }),
        createElement("shape", {
          x: 690,
          y: 184,
          w: 370,
          h: 74,
          fill: "#fef3e1",
          stroke: "#d8a04c",
          name: "Theme chip",
        }),
        createElement("text", {
          x: 724,
          y: 203,
          w: 310,
          h: 42,
          text: "Master styles control type, color, spacing, and backgrounds.",
          fontSize: 20,
          fontWeight: 650,
          color: "#5b3f13",
          lineHeight: 1.16,
          name: "Theme note",
        }),
        createElement("icon", {
          x: 704,
          y: 318,
          w: 94,
          h: 94,
          fill: "#2454d6",
          name: "Spark icon",
        }),
        createElement("text", {
          x: 822,
          y: 326,
          w: 310,
          h: 88,
          text: "Reusable slide elements render from a clean internal schema.",
          fontSize: 26,
          fontWeight: 700,
          color: "#1d232a",
          lineHeight: 1.18,
          name: "Schema note",
        }),
      ],
    }),
    createSlide({
      title: "Audience pulse",
      layout: "interactive",
      notes:
        "Use this as an optional engagement slide. The deck still works as a normal presentation without it.",
      background: "#f8fafc",
      engagement: {
        enabled: true,
        type: "poll",
        prompt: "Which module should ship first?",
        options: ["PPTX fidelity", "Templates", "Live Q&A", "Analytics"],
        correctAnswers: [],
        showCorrectAnswer: true,
        correctAnswerRevealed: false,
        results: {},
        qna: [],
        reactions: {
          thumbsUp: 0,
          heart: 0,
          clap: 0,
          wow: 0,
          fire: 0,
        },
      },
      elements: [
        createElement("text", {
          x: 84,
          y: 72,
          w: 790,
          h: 68,
          text: "Optional engagement, never the center",
          fontSize: 48,
          fontWeight: 800,
          name: "Slide title",
        }),
        createElement("shape", {
          x: 88,
          y: 176,
          w: 1040,
          h: 318,
          fill: "#ffffff",
          stroke: "#cbd5e1",
          radius: 12,
          name: "Interaction frame",
        }),
        createElement("text", {
          x: 130,
          y: 214,
          w: 520,
          h: 58,
          text: "Which module should ship first?",
          fontSize: 34,
          fontWeight: 800,
          name: "Poll prompt",
        }),
        createElement("chart", {
          x: 142,
          y: 306,
          w: 780,
          h: 150,
          labels: ["PPTX fidelity", "Templates", "Live Q&A", "Analytics"],
          values: [0, 0, 0, 0],
          engagementResults: true,
          fill: "#d94b3d",
          name: "Poll results",
        }),
      ],
    }),
  ];
  return deck;
}

function createEngagementTemplateSlide({ type, title, prompt, options = [] }) {
  const optionColors = normalizeEngagementOptionColors(options);
  return createSlide({
    title,
    layout: `engagement-${type}`,
    background: "#f8fafc",
    engagement: {
      enabled: true,
      type,
      prompt,
      options: [...options],
      optionColors,
      correctAnswers: [],
      hasCorrectAnswers: false,
      showCorrectAnswer: true,
      correctAnswerRevealed: false,
      responseLimit: 1,
      reactionOptions: [...DEFAULT_REACTION_OPTIONS],
      results: {},
      qna: [],
      reactions: {
        thumbsUp: 0,
        heart: 0,
        clap: 0,
        wow: 0,
        fire: 0,
      },
    },
    elements: [
      createElement("text", {
        x: 88,
        y: 68,
        w: 880,
        h: 76,
        text: title,
        fontSize: 50,
        fontWeight: 800,
        name: "Slide heading",
      }),
      createElement("engagement", {
        x: 110,
        y: 172,
        w: 1060,
        h: 390,
        mode: type,
        prompt,
        options: [...options],
        optionColors,
        hasCorrectAnswers: false,
        responseLimit: 1,
        name: `${title} engagement`,
      }),
    ],
  });
}

export const layoutTemplates = [
  {
    id: "title",
    name: "Title",
    apply() {
      return createSlide({
        title: "Title slide",
        layout: "title",
        background: "#fbfcfe",
        elements: [
          createElement("divider", { x: 86, y: 82, w: 120, h: 7 }),
          createElement("text", {
            x: 84,
            y: 124,
            w: 820,
            h: 122,
            text: "Section title",
            fontSize: 68,
            fontWeight: 800,
          }),
          createElement("text", {
            x: 88,
            y: 284,
            w: 640,
            h: 72,
            text: "Add a crisp framing sentence for the room.",
            fontSize: 28,
            fontWeight: 500,
            color: "#637083",
          }),
        ],
      });
    },
  },
  {
    id: "two-column",
    name: "Two column",
    apply() {
      return createSlide({
        title: "Two column",
        layout: "two-column",
        elements: [
          createElement("text", {
            x: 76,
            y: 60,
            w: 850,
            h: 70,
            text: "Compare the options",
            fontSize: 50,
            fontWeight: 800,
          }),
          createElement("shape", {
            x: 82,
            y: 174,
            w: 470,
            h: 338,
            fill: "#eff6ff",
            stroke: "#bfdbfe",
          }),
          createElement("shape", {
            x: 638,
            y: 174,
            w: 470,
            h: 338,
            fill: "#f0fdfa",
            stroke: "#99f6e4",
          }),
        ],
      });
    },
  },
  {
    id: "section",
    name: "Divider",
    apply() {
      return createSlide({
        title: "Section divider",
        layout: "section",
        background: "#1d232a",
        elements: [
          createElement("text", {
            x: 96,
            y: 238,
            w: 760,
            h: 100,
            text: "Section 02",
            fontSize: 34,
            fontWeight: 700,
            color: "#8fd8cf",
          }),
          createElement("text", {
            x: 94,
            y: 316,
            w: 880,
            h: 112,
            text: "Make the case",
            fontSize: 72,
            fontWeight: 800,
            color: "#ffffff",
          }),
          createElement("divider", {
            x: 98,
            y: 460,
            w: 260,
            h: 8,
            fill: "#d94b3d",
          }),
        ],
      });
    },
  },
  {
    id: "interactive",
    name: "Poll",
    apply() {
      return createSlide({
        title: "Interactive poll",
        layout: "interactive",
        engagement: {
          enabled: true,
          type: "poll",
          prompt: "What would help this audience most?",
          options: ["Context", "Examples", "Decision", "Next steps"],
          correctAnswers: [],
          showCorrectAnswer: true,
          correctAnswerRevealed: false,
          results: {},
          qna: [],
          reactions: {
            thumbsUp: 0,
            heart: 0,
            clap: 0,
            wow: 0,
            fire: 0,
          },
        },
        elements: [
          createElement("text", {
            x: 88,
            y: 70,
            w: 760,
            h: 76,
            text: "Live pulse check",
            fontSize: 52,
            fontWeight: 800,
          }),
          createElement("shape", {
            x: 94,
            y: 188,
            w: 990,
            h: 298,
            fill: "#ffffff",
            stroke: "#cbd5e1",
            radius: 12,
          }),
          createElement("text", {
            x: 138,
            y: 234,
            w: 780,
            h: 58,
            text: "What would help this audience most?",
            fontSize: 34,
            fontWeight: 800,
          }),
          createElement("chart", {
            x: 138,
            y: 320,
            w: 900,
            h: 140,
            labels: ["Context", "Examples", "Decision", "Next steps"],
            values: [0, 0, 0, 0],
            engagementResults: true,
            fill: "#2454d6",
            name: "Poll results",
          }),
        ],
      });
    },
  },
  {
    id: "multiple-choice",
    name: "Multiple choice",
    apply() {
      return createEngagementTemplateSlide({
        type: "multipleChoice",
        title: "Multiple choice",
        prompt: "Which answer best fits?",
        options: ["Option A", "Option B", "Option C", "Option D"],
      });
    },
  },
  {
    id: "word-cloud",
    name: "Word cloud",
    apply() {
      return createEngagementTemplateSlide({
        type: "wordCloud",
        title: "Word cloud",
        prompt: "What word comes to mind?",
      });
    },
  },
  {
    id: "reactions",
    name: "Reactions",
    apply() {
      return createEngagementTemplateSlide({
        type: "reactions",
        title: "Live reactions",
        prompt: "How is this landing?",
      });
    },
  },
];

export function normalizeDeck(raw) {
  const seed = createSeedDeck();
  if (!raw || typeof raw !== "object") {
    return seed;
  }

  const sections = Array.isArray(raw.sections) ? raw.sections.map(normalizeSection) : [];
  const sectionIds = new Set(sections.map((section) => section.id));
  const slides = Array.isArray(raw.slides) ? raw.slides.map(normalizeSlide) : seed.slides;
  slides.forEach((slide) => {
    if (slide.sectionId && !sectionIds.has(slide.sectionId)) {
      slide.sectionId = null;
    }
  });

  const brandColorStyles = normalizeBrandColorStyles(
    raw.theme?.brandColorStyles,
    raw.theme?.brandPalette || seed.theme.brandPalette
  );
  const deck = createDeck({
    ...seed,
    ...raw,
    theme: {
      ...seed.theme,
      ...(raw.theme || {}),
      fonts: {
        ...seed.theme.fonts,
        ...(raw.theme?.fonts || {}),
      },
      colors: {
        ...seed.theme.colors,
        ...(raw.theme?.colors || {}),
      },
      typographyStyles: {
        ...seed.theme.typographyStyles,
        ...(raw.theme?.typographyStyles || {}),
      },
      defaultBackground: {
        ...seed.theme.defaultBackground,
        ...(raw.theme?.defaultBackground || {}),
      },
      logo: {
        ...seed.theme.logo,
        ...(raw.theme?.logo || {}),
      },
      master: {
        ...seed.theme.master,
        ...(raw.theme?.master || {}),
        title: {
          ...seed.theme.master.title,
          ...(raw.theme?.master?.title || {}),
        },
        footer: {
          ...seed.theme.master.footer,
          ...(raw.theme?.master?.footer || {}),
          disclaimer: {
            ...seed.theme.master.footer.disclaimer,
            ...(raw.theme?.master?.footer?.disclaimer || {}),
          },
        },
      },
      brandPalette: brandColorStyles.map((style) => style.color),
      brandColorStyles,
    },
    settings: {
      ...seed.settings,
      ...(raw.settings || {}),
    },
    unsupportedFeatures: Array.isArray(raw.unsupportedFeatures)
      ? raw.unsupportedFeatures
      : [],
    importReport: Array.isArray(raw.importReport) ? raw.importReport : [],
    sections,
    slides,
  });
  return deck;
}

export function normalizeBrandColorStyles(styles, fallbackColors = []) {
  const seenIds = new Set();
  const seenColors = new Set();
  const source = Array.isArray(styles) && styles.length
    ? styles
    : (Array.isArray(fallbackColors) ? fallbackColors : []).map((color, index) => ({
        id: `brand-${String(color).replace("#", "").toLowerCase()}-${index + 1}`,
        name: `Brand ${index + 1}`,
        color,
      }));
  return source.flatMap((style, index) => {
    const color = /^#[0-9a-f]{6}$/i.test(String(style?.color || ""))
      ? String(style.color).toLowerCase()
      : null;
    if (!color) return [];
    let id = String(style?.id || `brand-${color.slice(1)}-${index + 1}`);
    while (seenIds.has(id)) id = `${id}-${index + 1}`;
    if (seenColors.has(color) && !Array.isArray(styles)) return [];
    seenIds.add(id);
    seenColors.add(color);
    return [{ id, name: String(style?.name || `Brand ${index + 1}`), color }];
  }).slice(0, 24);
}

export function normalizeSection(raw) {
  return createSection({
    ...raw,
    id: raw?.id || uid("section"),
    name: String(raw?.name || "Untitled section"),
    collapsed: Boolean(raw?.collapsed),
  });
}

export function normalizeSlide(raw = {}) {
  raw ||= {};
  const legacyAnimatedBackground = raw.backgroundShader && raw.backgroundShader !== "none" && raw.backgroundType !== "animated";
  const backgroundOverlayEnabled = raw.backgroundOverlayEnabled ?? Number(raw.backgroundOverlayOpacity) > 0;
  const legacyQuiz = raw.engagement?.type === "quiz";
  const correctAnswers = Array.isArray(raw.engagement?.correctAnswers)
    ? raw.engagement.correctAnswers.slice(0, MAX_ENGAGEMENT_OPTIONS)
    : [];
  const engagementOptions = Array.isArray(raw.engagement?.options)
    ? raw.engagement.options.slice(0, MAX_ENGAGEMENT_OPTIONS)
    : createSlide().engagement.options;
  const slide = createSlide({
    ...raw,
    backgroundType: legacyAnimatedBackground ? "animated" : raw.backgroundType || "color",
    backgroundOverlayEnabled,
    sectionId: typeof raw.sectionId === "string" ? raw.sectionId : null,
    engagement: {
      ...createSlide().engagement,
      ...(raw.engagement || {}),
      type: legacyQuiz ? "multipleChoice" : raw.engagement?.type || createSlide().engagement.type,
      options: engagementOptions,
      optionColors: normalizeEngagementOptionColors(engagementOptions, raw.engagement?.optionColors),
      correctAnswers,
      hasCorrectAnswers: raw.engagement?.hasCorrectAnswers ?? (legacyQuiz || correctAnswers.length > 0),
      showCorrectAnswer: raw.engagement?.showCorrectAnswer ?? true,
      correctAnswerRevealed: raw.engagement?.correctAnswerRevealed ?? false,
      responseLimit: Math.max(1, Number(raw.engagement?.responseLimit) || 1),
      reactionOptions: Array.isArray(raw.engagement?.reactionOptions)
        ? raw.engagement.reactionOptions.map(normalizeReactionOption).filter(Boolean).slice(0, MAX_REACTION_OPTIONS)
        : [...DEFAULT_REACTION_OPTIONS],
      results: raw.engagement?.results || {},
      qna: raw.engagement?.qna || [],
      reactions: {
        ...createSlide().engagement.reactions,
        ...(raw.engagement?.reactions || {}),
      },
    },
    elements: Array.isArray(raw.elements)
      ? raw.elements.filter((item) => ELEMENT_TYPES.includes(item.type)).map(normalizeElement)
      : [],
  });
  return slide;
}

export function normalizeElement(raw) {
  const defaults = createElement(raw.type || "shape");
  const element = {
    ...defaults,
    ...raw,
    id: raw.id || uid(raw.type || "element"),
    animation: {
      ...defaults.animation,
      ...(raw.animation || {}),
    },
  };
  if (element.type === "engagement") {
    element.reactionOptions = Array.isArray(raw.reactionOptions)
      ? raw.reactionOptions.map(normalizeReactionOption).filter(Boolean).slice(0, MAX_REACTION_OPTIONS)
      : [...DEFAULT_REACTION_OPTIONS];
  }
  if (element.type === "engagement") {
    const legacyQuiz = element.mode === "quiz";
    if (legacyQuiz) element.mode = "multipleChoice";
    element.options = (Array.isArray(element.options) ? element.options : [])
      .slice(0, MAX_ENGAGEMENT_OPTIONS);
    element.optionColors = normalizeEngagementOptionColors(element.options, raw.optionColors);
    element.correctAnswers = (Array.isArray(element.correctAnswers) ? element.correctAnswers : [])
      .filter((answer) => element.options.includes(answer));
    element.hasCorrectAnswers = legacyQuiz || (raw.hasCorrectAnswers ?? (element.correctAnswers.length > 0));
  }
  if (element.type === "text") {
    element.typographyStyleId = raw.typographyStyleId || "body";
    element.useGlobalTypography = raw.useGlobalTypography ?? false;
  }
  if (element.type === "divider" && (!raw.name || raw.name === "Divider")) {
    element.name = "Line";
  }
  return element;
}

export function syncEngagementResultCharts(slide) {
  const engagement = slide?.engagement || {};
  const engagementLabels = (engagement.options || []).map((label) => String(label));
  for (const element of slide?.elements || []) {
    const chartLabels = Array.isArray(element.labels)
      ? element.labels.map((label) => String(label))
      : [];
    const labelsMatchEngagement = engagementLabels.length > 0 &&
      chartLabels.length === engagementLabels.length &&
      chartLabels.every((label, index) => label === engagementLabels[index]);
    if (
      element.type !== "chart" ||
      (!element.engagementResults && element.name !== "Poll results" && !labelsMatchEngagement)
    ) {
      continue;
    }
    element.engagementResults = true;
    element.labels = [...(engagement.options || [])];
    element.colors = normalizeEngagementOptionColors(element.labels, engagement.optionColors);
    element.values = element.labels.map((option) =>
      Math.max(0, Number(engagement.results?.[option]) || 0)
    );
  }
  return slide;
}

export function cloneDeck(deck) {
  return normalizeDeck(JSON.parse(JSON.stringify(deck)));
}

export function cloneElement(element) {
  return normalizeElement({
    ...JSON.parse(JSON.stringify(element)),
    id: uid(element.type),
    x: element.x + 24,
    y: element.y + 24,
    groupId: null,
    locked: false,
  });
}

export function cloneSlide(slide) {
  const duplicate = normalizeSlide(JSON.parse(JSON.stringify(slide)));
  const groupIds = new Map();
  duplicate.id = uid("slide");
  duplicate.elements = duplicate.elements.map((element) => {
    const groupId = element.groupId
      ? groupIds.get(element.groupId) || uid("group")
      : null;
    if (element.groupId && !groupIds.has(element.groupId)) {
      groupIds.set(element.groupId, groupId);
    }
    return {
      ...element,
      id: uid(element.type || "element"),
      groupId,
    };
  });
  duplicate.engagement = {
    ...duplicate.engagement,
    results: {},
    qna: [],
    reactions: Object.fromEntries((duplicate.engagement.reactionOptions || DEFAULT_REACTION_OPTIONS).map((key) => [key, 0])),
  };
  return duplicate;
}

export function titleCase(value) {
  return String(value)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sampleImageDataUri() {
  return svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
      <rect width="640" height="420" rx="24" fill="#f8fafc"/>
      <rect x="64" y="78" width="512" height="264" rx="18" fill="#ffffff" stroke="#cbd5e1" stroke-width="5"/>
      <rect x="96" y="112" width="210" height="24" rx="8" fill="#2454d6"/>
      <rect x="96" y="164" width="448" height="18" rx="9" fill="#d7dde6"/>
      <rect x="96" y="204" width="384" height="18" rx="9" fill="#d7dde6"/>
      <rect x="96" y="250" width="114" height="56" rx="12" fill="#0c8b7f"/>
      <rect x="238" y="250" width="114" height="56" rx="12" fill="#d94b3d"/>
      <rect x="380" y="250" width="114" height="56" rx="12" fill="#ba7315"/>
    </svg>
  `);
}

function productImageDataUri() {
  return svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" viewBox="0 0 720 420">
      <rect width="720" height="420" rx="22" fill="#1d232a"/>
      <rect x="54" y="54" width="612" height="312" rx="16" fill="#ffffff"/>
      <rect x="82" y="82" width="94" height="248" rx="8" fill="#eef2f7"/>
      <rect x="198" y="82" width="318" height="178" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="3"/>
      <rect x="226" y="112" width="194" height="20" rx="7" fill="#2454d6"/>
      <rect x="226" y="158" width="250" height="14" rx="7" fill="#cbd5e1"/>
      <rect x="226" y="194" width="182" height="14" rx="7" fill="#cbd5e1"/>
      <rect x="536" y="82" width="102" height="248" rx="8" fill="#eef2f7"/>
      <rect x="214" y="288" width="302" height="42" rx="10" fill="#0c8b7f"/>
      <circle cx="114" cy="122" r="22" fill="#d94b3d"/>
      <circle cx="114" cy="188" r="22" fill="#ba7315"/>
      <circle cx="114" cy="254" r="22" fill="#2454d6"/>
    </svg>
  `);
}

function svgDataUri(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
}
