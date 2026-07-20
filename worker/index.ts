/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/live/")) {
      return handleLiveApi(request, env, url);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;

async function handleLiveApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.DB) {
    return json({ error: "Live sessions need the D1 binding named DB." }, 503);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  await ensureLiveSchema(env.DB);

  const parts = url.pathname.split("/").filter(Boolean);
  const code = normalizeCode(parts[2]);
  if (!code) {
    return json({ error: "A live audience code is required." }, 400);
  }

  try {
    if (parts.length === 3 && request.method === "GET") {
      return json(await liveState(env.DB, code));
    }

    if (parts.length === 3 && request.method === "PUT") {
      const payload = await readJson(request);
      return json(await publishLiveSession(env.DB, code, payload));
    }

    if (parts.length === 4 && parts[3] === "responses" && request.method === "POST") {
      const payload = await readJson(request);
      return json(await recordLiveResponse(env.DB, code, payload));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Live session failed.";
    const status = message.includes("not found") ? 404 : 500;
    return json({ error: message }, status);
  }

  return json({ error: "Live route not found." }, 404);
}

async function ensureLiveSchema(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS hyslides_live_sessions (
        code TEXT PRIMARY KEY,
        deck_id TEXT NOT NULL,
        deck_title TEXT NOT NULL,
        audience_code TEXT NOT NULL,
        active_slide_id TEXT NOT NULL,
        active_slide_index INTEGER NOT NULL DEFAULT 0,
        slide_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS hyslides_live_counts (
        session_code TEXT NOT NULL,
        slide_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        response_key TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (session_code, slide_id, kind, response_key)
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS hyslides_live_questions (
        id TEXT PRIMARY KEY,
        session_code TEXT NOT NULL,
        slide_id TEXT NOT NULL,
        text TEXT NOT NULL,
        upvotes INTEGER NOT NULL DEFAULT 0,
        answered INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS hyslides_live_questions_session_slide_idx
        ON hyslides_live_questions (session_code, slide_id, created_at)`
    ),
  ]);
}

async function publishLiveSession(db: D1Database, code: string, payload: Record<string, unknown>) {
  const slide = payload.slide as Record<string, unknown> | undefined;
  const slideId = stringValue(payload.activeSlideId) || stringValue(slide?.id);
  if (!slide || !slideId) {
    throw new Error("A live slide snapshot is required.");
  }

  const deckId = stringValue(payload.deckId) || "deck";
  const deckTitle = stringValue(payload.deckTitle) || "HySlides deck";
  const audienceCode = normalizeCode(payload.audienceCode) || code;
  const activeSlideIndex = numberValue(payload.activeSlideIndex);
  const slideJson = JSON.stringify(slide);

  await db
    .prepare(
      `INSERT INTO hyslides_live_sessions (
        code,
        deck_id,
        deck_title,
        audience_code,
        active_slide_id,
        active_slide_index,
        slide_json,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(code) DO UPDATE SET
        deck_id = excluded.deck_id,
        deck_title = excluded.deck_title,
        audience_code = excluded.audience_code,
        active_slide_id = excluded.active_slide_id,
        active_slide_index = excluded.active_slide_index,
        slide_json = excluded.slide_json,
        updated_at = CURRENT_TIMESTAMP`
    )
    .bind(code, deckId, deckTitle, audienceCode, slideId, activeSlideIndex, slideJson)
    .run();

  return liveState(db, code);
}

async function recordLiveResponse(db: D1Database, code: string, payload: Record<string, unknown>) {
  const session = await getLiveSessionRow(db, code);
  const slide = parseSlide(session.slide_json);
  const engagement = ensureEngagementShape(slide);
  const value = stringValue(payload.value).trim();
  const submittedSlideId = stringValue(payload.slideId);

  if (submittedSlideId && submittedSlideId !== session.active_slide_id) {
    return {
      accepted: false,
      ...(await liveState(db, code)),
    };
  }

  if (!engagement.enabled || !value) {
    return {
      accepted: false,
      ...(await liveState(db, code)),
    };
  }

  const type = stringValue(engagement.type) || "poll";
  if (["poll", "multipleChoice", "quiz"].includes(type)) {
    await incrementLiveCount(db, code, session.active_slide_id, "response", value);
  } else if (type === "wordCloud") {
    const words = value.split(/\s+/).map((word) => word.trim().toLowerCase()).filter(Boolean);
    for (const word of words.slice(0, 20)) {
      await incrementLiveCount(db, code, session.active_slide_id, "response", word);
    }
  } else if (type === "qna") {
    await db
      .prepare(
        `INSERT INTO hyslides_live_questions (
          id,
          session_code,
          slide_id,
          text,
          created_at
        ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .bind(crypto.randomUUID(), code, session.active_slide_id, value.slice(0, 500))
      .run();
  } else if (type === "reactions") {
    await incrementLiveCount(db, code, session.active_slide_id, "reaction", value);
  }

  return {
    accepted: true,
    ...(await liveState(db, code)),
  };
}

async function incrementLiveCount(
  db: D1Database,
  code: string,
  slideId: string,
  kind: string,
  responseKey: string
) {
  await db
    .prepare(
      `INSERT INTO hyslides_live_counts (
        session_code,
        slide_id,
        kind,
        response_key,
        count
      ) VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(session_code, slide_id, kind, response_key) DO UPDATE SET
        count = count + 1`
    )
    .bind(code, slideId, kind, responseKey)
    .run();
}

async function liveState(db: D1Database, code: string) {
  const session = await getLiveSessionRow(db, code);
  const slide = parseSlide(session.slide_json);
  await applyLiveAggregates(db, code, session.active_slide_id, slide);
  return {
    code,
    deckId: session.deck_id,
    deckTitle: session.deck_title,
    audienceCode: session.audience_code,
    activeSlideId: session.active_slide_id,
    activeSlideIndex: session.active_slide_index,
    slide,
    updatedAt: session.updated_at,
  };
}

async function applyLiveAggregates(
  db: D1Database,
  code: string,
  slideId: string,
  slide: Record<string, unknown>
) {
  const engagement = ensureEngagementShape(slide);
  const counts = await db
    .prepare(
      `SELECT kind, response_key, count
        FROM hyslides_live_counts
        WHERE session_code = ? AND slide_id = ?`
    )
    .bind(code, slideId)
    .all<LiveCountRow>();

  const results: Record<string, number> = {};
  const reactions: Record<string, number> = {
    thumbsUp: 0,
    heart: 0,
    clap: 0,
    wow: 0,
    fire: 0,
  };
  for (const row of counts.results || []) {
    if (row.kind === "reaction") {
      reactions[row.response_key] = row.count;
    } else {
      results[row.response_key] = row.count;
    }
  }
  engagement.results = results;
  engagement.reactions = {
    ...reactions,
    ...Object.fromEntries(
      Object.entries(reactions).filter(([, count]) => count > 0)
    ),
  };

  const questions = await db
    .prepare(
      `SELECT id, text, upvotes, answered
        FROM hyslides_live_questions
        WHERE session_code = ? AND slide_id = ?
        ORDER BY created_at ASC`
    )
    .bind(code, slideId)
    .all<LiveQuestionRow>();

  engagement.qna = (questions.results || []).map((question) => ({
    id: question.id,
    text: question.text,
    upvotes: question.upvotes,
    answered: Boolean(question.answered),
  }));
}

async function getLiveSessionRow(db: D1Database, code: string): Promise<LiveSessionRow> {
  const session = await db
    .prepare(
      `SELECT
        code,
        deck_id,
        deck_title,
        audience_code,
        active_slide_id,
        active_slide_index,
        slide_json,
        updated_at
      FROM hyslides_live_sessions
      WHERE code = ?`
    )
    .bind(code)
    .first<LiveSessionRow>();

  if (!session) {
    throw new Error("Live session not found.");
  }
  return session;
}

function parseSlide(slideJson: string): Record<string, unknown> {
  try {
    return JSON.parse(slideJson) as Record<string, unknown>;
  } catch {
    throw new Error("Live slide data could not be read.");
  }
}

function ensureEngagementShape(slide: Record<string, unknown>) {
  const engagement = (slide.engagement || {}) as Record<string, unknown>;
  engagement.enabled ??= false;
  engagement.type ||= "poll";
  engagement.prompt ||= "Audience question";
  engagement.options ||= [];
  engagement.correctAnswers ||= [];
  engagement.showCorrectAnswer ??= true;
  engagement.correctAnswerRevealed ??= false;
  engagement.results ||= {};
  engagement.qna ||= [];
  engagement.reactions ||= {};
  slide.engagement = engagement;
  return engagement;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  return (await request.json().catch(() => ({}))) as Record<string, unknown>;
}

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function normalizeCode(value: unknown): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 18);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

interface LiveSessionRow {
  code: string;
  deck_id: string;
  deck_title: string;
  audience_code: string;
  active_slide_id: string;
  active_slide_index: number;
  slide_json: string;
  updated_at: string;
}

interface LiveCountRow {
  kind: string;
  response_key: string;
  count: number;
}

interface LiveQuestionRow {
  id: string;
  text: string;
  upvotes: number;
  answered: number;
}
