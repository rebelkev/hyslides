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

    if (url.pathname === "/") {
      return Response.redirect(new URL("/hyslides/index.html", url), 307);
    }

    if (url.pathname === "/hyslides") {
      return Response.redirect(new URL("/hyslides/index.html", url), 307);
    }

    if (url.pathname.startsWith("/hyslides/")) {
      return env.ASSETS.fetch(request);
    }

    if (url.pathname.startsWith("/api/live/")) {
      return handleLiveApi(request, env, url);
    }

    if (url.pathname === "/api/sessions" || url.pathname.startsWith("/api/sessions/")) {
      return handleSessionApi(request, env, url);
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

async function handleSessionApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.DB) {
    return json({ error: "Session history needs the D1 binding named DB." }, 503);
  }
  await ensureLiveSchema(env.DB);
  const parts = url.pathname.split("/").filter(Boolean);
  const instanceId = parts[2] || "";
  try {
    if (parts.length === 2 && request.method === "GET") {
      return json(await listSessionInstances(env.DB, url.searchParams.get("deckId") || ""));
    }
    if (parts.length === 3 && request.method === "GET") {
      return json(await sessionInstanceDetail(env.DB, instanceId));
    }
    if (parts.length === 3 && request.method === "PATCH") {
      const payload = await readJson(request);
      return json(await renameSessionInstance(env.DB, instanceId, stringValue(payload.sessionName)));
    }
    if (parts.length === 3 && request.method === "DELETE") {
      await deleteSessionInstance(env.DB, instanceId);
      return json({ deleted: true });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Session history failed.";
    return json({ error: message }, message.includes("not found") ? 404 : 500);
  }
  return json({ error: "Session history route not found." }, 404);
}

async function ensureLiveSchema(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS hyslides_live_instances (
        instance_id TEXT PRIMARY KEY,
        access_code TEXT NOT NULL,
        deck_id TEXT NOT NULL,
        deck_title TEXT NOT NULL,
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_active_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'active'
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS hyslides_live_instance_state (
        access_code TEXT PRIMARY KEY,
        instance_id TEXT NOT NULL,
        active_slide_id TEXT NOT NULL,
        active_slide_index INTEGER NOT NULL DEFAULT 0,
        slide_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS hyslides_live_instance_counts (
        instance_id TEXT NOT NULL,
        slide_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        response_key TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (instance_id, slide_id, kind, response_key)
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS hyslides_live_instance_questions (
        id TEXT PRIMARY KEY,
        instance_id TEXT NOT NULL,
        slide_id TEXT NOT NULL,
        text TEXT NOT NULL,
        upvotes INTEGER NOT NULL DEFAULT 0,
        answered INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS hyslides_live_instances_access_code_idx
        ON hyslides_live_instances (access_code, started_at)`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS hyslides_live_instance_questions_instance_slide_idx
        ON hyslides_live_instance_questions (instance_id, slide_id, created_at)`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS hyslides_live_instance_metadata (
        instance_id TEXT PRIMARY KEY,
        session_name TEXT NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS hyslides_live_instance_slides (
        instance_id TEXT NOT NULL,
        slide_id TEXT NOT NULL,
        slide_index INTEGER NOT NULL DEFAULT 0,
        slide_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (instance_id, slide_id)
      )`
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
  const instanceId = stringValue(payload.instanceId) || crypto.randomUUID();
  const sessionName = stringValue(payload.sessionName).trim() || `${deckTitle} — ${new Date().toISOString()}`;
  const activeSlideIndex = numberValue(payload.activeSlideIndex);
  const slideJson = JSON.stringify(slide);

  const previous = await db
    .prepare(`SELECT instance_id FROM hyslides_live_instance_state WHERE access_code = ?`)
    .bind(code)
    .first<{ instance_id: string }>();

  const statements = [
    db.prepare(
      `INSERT INTO hyslides_live_instances (
        instance_id,
        access_code,
        deck_id,
        deck_title,
        started_at,
        last_active_at,
        status
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'active')
      ON CONFLICT(instance_id) DO UPDATE SET
        last_active_at = CURRENT_TIMESTAMP,
        status = 'active'`
    ).bind(instanceId, code, deckId, deckTitle),
    db.prepare(
      `INSERT INTO hyslides_live_instance_state (
        access_code,
        instance_id,
        active_slide_id,
        active_slide_index,
        slide_json,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(access_code) DO UPDATE SET
        instance_id = excluded.instance_id,
        active_slide_id = excluded.active_slide_id,
        active_slide_index = excluded.active_slide_index,
        slide_json = excluded.slide_json,
        updated_at = CURRENT_TIMESTAMP`
    ).bind(code, instanceId, slideId, activeSlideIndex, slideJson),
    db.prepare(
      `INSERT INTO hyslides_live_instance_metadata (instance_id, session_name)
        VALUES (?, ?)
        ON CONFLICT(instance_id) DO NOTHING`
    ).bind(instanceId, sessionName.slice(0, 180)),
    db.prepare(
      `INSERT INTO hyslides_live_instance_slides (
        instance_id, slide_id, slide_index, slide_json, updated_at
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(instance_id, slide_id) DO UPDATE SET
        slide_index = excluded.slide_index,
        slide_json = excluded.slide_json,
        updated_at = CURRENT_TIMESTAMP`
    ).bind(instanceId, slideId, activeSlideIndex, slideJson),
  ];
  if (previous?.instance_id && previous.instance_id !== instanceId) {
    statements.push(
      db.prepare(`UPDATE hyslides_live_instances SET status = 'ended', last_active_at = CURRENT_TIMESTAMP WHERE instance_id = ?`)
        .bind(previous.instance_id)
    );
  }
  await db.batch(statements);

  return liveState(db, code);
}

async function listSessionInstances(db: D1Database, deckId: string) {
  const where = deckId ? "WHERE instance.deck_id = ?" : "";
  const statement = db.prepare(
    `SELECT
      instance.instance_id,
      instance.access_code,
      instance.deck_id,
      instance.deck_title,
      instance.started_at,
      instance.last_active_at,
      instance.status,
      metadata.session_name,
      COALESCE((SELECT SUM(count) FROM hyslides_live_instance_counts WHERE instance_id = instance.instance_id), 0) AS response_count,
      COALESCE((SELECT COUNT(*) FROM hyslides_live_instance_questions WHERE instance_id = instance.instance_id), 0) AS question_count
    FROM hyslides_live_instances AS instance
    LEFT JOIN hyslides_live_instance_metadata AS metadata ON metadata.instance_id = instance.instance_id
    ${where}
    ORDER BY instance.started_at DESC`
  );
  const rows = deckId ? await statement.bind(deckId).all() : await statement.all();
  return { sessions: rows.results || [] };
}

async function sessionInstanceDetail(db: D1Database, instanceId: string) {
  const instance = await db.prepare(
    `SELECT instance.*, metadata.session_name
      FROM hyslides_live_instances AS instance
      LEFT JOIN hyslides_live_instance_metadata AS metadata ON metadata.instance_id = instance.instance_id
      WHERE instance.instance_id = ?`
  ).bind(instanceId).first<Record<string, unknown>>();
  if (!instance) {
    throw new Error("Session not found.");
  }
  const slideRows = await db.prepare(
    `SELECT slide_id, slide_index, slide_json
      FROM hyslides_live_instance_slides
      WHERE instance_id = ?
      ORDER BY slide_index ASC`
  ).bind(instanceId).all<{ slide_id: string; slide_index: number; slide_json: string }>();
  const slides = [];
  for (const row of slideRows.results || []) {
    const slide = parseSlide(row.slide_json);
    await applyLiveAggregates(db, instanceId, row.slide_id, slide);
    slides.push({ slideId: row.slide_id, slideIndex: row.slide_index, slide });
  }
  return { session: instance, slides };
}

async function renameSessionInstance(db: D1Database, instanceId: string, requestedName: string) {
  const sessionName = requestedName.trim().slice(0, 180);
  if (!sessionName) {
    throw new Error("A session name is required.");
  }
  await db.prepare(
    `INSERT INTO hyslides_live_instance_metadata (instance_id, session_name)
      VALUES (?, ?)
      ON CONFLICT(instance_id) DO UPDATE SET session_name = excluded.session_name`
  ).bind(instanceId, sessionName).run();
  return sessionInstanceDetail(db, instanceId);
}

async function deleteSessionInstance(db: D1Database, instanceId: string) {
  await db.batch([
    db.prepare(`DELETE FROM hyslides_live_instance_counts WHERE instance_id = ?`).bind(instanceId),
    db.prepare(`DELETE FROM hyslides_live_instance_questions WHERE instance_id = ?`).bind(instanceId),
    db.prepare(`DELETE FROM hyslides_live_instance_slides WHERE instance_id = ?`).bind(instanceId),
    db.prepare(`DELETE FROM hyslides_live_instance_metadata WHERE instance_id = ?`).bind(instanceId),
    db.prepare(`DELETE FROM hyslides_live_instance_state WHERE instance_id = ?`).bind(instanceId),
    db.prepare(`DELETE FROM hyslides_live_instances WHERE instance_id = ?`).bind(instanceId),
  ]);
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
    await incrementLiveCount(db, session.instance_id, session.active_slide_id, "response", value);
  } else if (type === "wordCloud") {
    const words = value.split(/\s+/).map((word) => word.trim().toLowerCase()).filter(Boolean);
    for (const word of words.slice(0, 20)) {
      await incrementLiveCount(db, session.instance_id, session.active_slide_id, "response", word);
    }
  } else if (type === "qna") {
    await db
      .prepare(
        `INSERT INTO hyslides_live_instance_questions (
          id,
          instance_id,
          slide_id,
          text,
          created_at
        ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .bind(crypto.randomUUID(), session.instance_id, session.active_slide_id, value.slice(0, 500))
      .run();
  } else if (type === "reactions") {
    await incrementLiveCount(db, session.instance_id, session.active_slide_id, "reaction", value);
  }

  return {
    accepted: true,
    ...(await liveState(db, code)),
  };
}

async function incrementLiveCount(
  db: D1Database,
  instanceId: string,
  slideId: string,
  kind: string,
  responseKey: string
) {
  await db
    .prepare(
      `INSERT INTO hyslides_live_instance_counts (
        instance_id,
        slide_id,
        kind,
        response_key,
        count
      ) VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(instance_id, slide_id, kind, response_key) DO UPDATE SET
        count = count + 1`
    )
    .bind(instanceId, slideId, kind, responseKey)
    .run();
}

async function liveState(db: D1Database, code: string) {
  const session = await getLiveSessionRow(db, code);
  const slide = parseSlide(session.slide_json);
  await applyLiveAggregates(db, session.instance_id, session.active_slide_id, slide);
  return {
    code,
    instanceId: session.instance_id,
    startedAt: session.started_at,
    deckId: session.deck_id,
    deckTitle: session.deck_title,
    audienceCode: session.access_code,
    activeSlideId: session.active_slide_id,
    activeSlideIndex: session.active_slide_index,
    slide,
    updatedAt: session.updated_at,
  };
}

async function applyLiveAggregates(
  db: D1Database,
  instanceId: string,
  slideId: string,
  slide: Record<string, unknown>
) {
  const engagement = ensureEngagementShape(slide);
  const counts = await db
    .prepare(
      `SELECT kind, response_key, count
        FROM hyslides_live_instance_counts
        WHERE instance_id = ? AND slide_id = ?`
    )
    .bind(instanceId, slideId)
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
        FROM hyslides_live_instance_questions
        WHERE instance_id = ? AND slide_id = ?
        ORDER BY created_at ASC`
    )
    .bind(instanceId, slideId)
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
        state.access_code,
        state.instance_id,
        instance.deck_id,
        instance.deck_title,
        instance.started_at,
        state.active_slide_id,
        state.active_slide_index,
        state.slide_json,
        state.updated_at
      FROM hyslides_live_instance_state AS state
      JOIN hyslides_live_instances AS instance ON instance.instance_id = state.instance_id
      WHERE state.access_code = ?`
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
  access_code: string;
  instance_id: string;
  deck_id: string;
  deck_title: string;
  started_at: string;
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
