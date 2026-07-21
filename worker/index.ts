/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { containsBlockedLanguage } from "../src/moderation.js";

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
      const session = await getLiveSessionRow(env.DB, code);
      const presenterRequest = Boolean(request.headers.get("x-hyslides-presenter-token"));
      if (presenterRequest) await authorizePresenter(env.DB, request, session.deck_id);
      return json(await liveState(env.DB, code, presenterRequest));
    }

    if (parts.length === 3 && request.method === "PUT") {
      const payload = await readJson(request);
      await authorizePresenter(env.DB, request, stringValue(payload.deckId), true);
      return json(await publishLiveSession(env.DB, code, payload));
    }

    if (parts.length === 4 && parts[3] === "responses" && request.method === "POST") {
      const payload = await readJson(request);
      return json(await recordLiveResponse(env.DB, code, payload));
    }

    if (parts.length === 4 && parts[3] === "presence" && request.method === "POST") {
      const payload = await readJson(request);
      return json(await recordParticipantPresence(env.DB, code, stringValue(payload.participantId)));
    }

    if (parts.length === 4 && parts[3] === "control" && request.method === "POST") {
      const payload = await readJson(request);
      const session = await getLiveSessionRow(env.DB, code);
      await authorizePresenter(env.DB, request, session.deck_id);
      return json(await controlLiveSession(env.DB, code, session, stringValue(payload.action)));
    }
    if (parts.length === 6 && parts[3] === "questions" && parts[5] === "vote" && request.method === "POST") {
      const payload = await readJson(request);
      return json(await voteForQuestion(env.DB, code, parts[4], stringValue(payload.participantId)));
    }
    if (parts.length === 6 && parts[3] === "questions" && parts[5] === "moderate" && request.method === "POST") {
      const session = await getLiveSessionRow(env.DB, code);
      await authorizePresenter(env.DB, request, session.deck_id);
      const payload = await readJson(request);
      return json(await moderateQuestion(env.DB, code, session, parts[4], stringValue(payload.action)));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Live session failed.";
    const status = message.includes("Unauthorized") ? 403 : message.includes("not allowed") ? 400 : message.includes("not found") ? 404 : 500;
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
      const deckId = url.searchParams.get("deckId") || "";
      await authorizePresenter(env.DB, request, deckId, true);
      return json(await listSessionInstances(env.DB, deckId));
    }
    if (parts.length === 3 && request.method === "GET") {
      await authorizeSessionInstance(env.DB, request, instanceId);
      return json(await sessionInstanceDetail(env.DB, instanceId));
    }
    if (parts.length === 3 && request.method === "PATCH") {
      await authorizeSessionInstance(env.DB, request, instanceId);
      const payload = await readJson(request);
      return json(await renameSessionInstance(env.DB, instanceId, stringValue(payload.sessionName)));
    }
    if (parts.length === 3 && request.method === "DELETE") {
      await authorizeSessionInstance(env.DB, request, instanceId);
      await deleteSessionInstance(env.DB, instanceId);
      return json({ deleted: true });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Session history failed.";
    return json({ error: message }, message.includes("Unauthorized") ? 403 : message.includes("not found") ? 404 : 500);
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
        participant_id TEXT NOT NULL DEFAULT '',
        upvotes INTEGER NOT NULL DEFAULT 0,
        answered INTEGER NOT NULL DEFAULT 0,
        visible INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS hyslides_live_instance_question_votes (
        instance_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (instance_id, question_id, participant_id)
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
    db.prepare(
      `CREATE TABLE IF NOT EXISTS hyslides_presenter_tokens (
        deck_id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS hyslides_live_instance_participants (
        instance_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (instance_id, participant_id)
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS hyslides_live_instance_submissions (
        instance_id TEXT NOT NULL,
        slide_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (instance_id, slide_id, participant_id, kind)
      )`
    ),
  ]);
  await ensureColumn(db, "hyslides_live_instance_questions", "participant_id", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn(db, "hyslides_live_instance_questions", "visible", "INTEGER NOT NULL DEFAULT 0");
}

async function ensureColumn(db: D1Database, table: string, column: string, definition: string) {
  const columns = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  if (!(columns.results || []).some((item) => item.name === column)) {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
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

  const collision = await db.prepare(
    `SELECT instance.deck_id
      FROM hyslides_live_instance_state AS state
      JOIN hyslides_live_instances AS instance ON instance.instance_id = state.instance_id
      WHERE state.access_code = ?`
  ).bind(code).first<{ deck_id: string }>();
  if (collision?.deck_id && collision.deck_id !== deckId) {
    throw new Error("Access code is already assigned to another deck.");
  }

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
        last_active_at = CURRENT_TIMESTAMP`
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

  return liveState(db, code, true);
}

async function listSessionInstances(db: D1Database, deckId: string) {
  await cleanupExpiredSessions(db);
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
      COALESCE((SELECT COUNT(DISTINCT participant_id) FROM hyslides_live_instance_submissions WHERE instance_id = instance.instance_id), 0)
        + COALESCE((SELECT SUM(count) FROM hyslides_live_instance_counts WHERE instance_id = instance.instance_id), 0) AS response_count,
      COALESCE((SELECT COUNT(*) FROM hyslides_live_instance_questions WHERE instance_id = instance.instance_id), 0) AS question_count
    FROM hyslides_live_instances AS instance
    LEFT JOIN hyslides_live_instance_metadata AS metadata ON metadata.instance_id = instance.instance_id
    ${where}
    ORDER BY instance.started_at DESC`
  );
  const rows = deckId ? await statement.bind(deckId).all() : await statement.all();
  return { sessions: rows.results || [] };
}

async function cleanupExpiredSessions(db: D1Database) {
  await db.prepare(
    `UPDATE hyslides_live_instances
      SET status = 'ended'
      WHERE status IN ('active', 'paused') AND last_active_at < datetime('now', '-12 hours')`
  ).run();
  const expired = await db.prepare(
    `SELECT instance_id FROM hyslides_live_instances
      WHERE status = 'ended' AND last_active_at < datetime('now', '-14 days')`
  ).all<{ instance_id: string }>();
  for (const row of expired.results || []) {
    await db.batch([
      db.prepare(`DELETE FROM hyslides_live_instance_participants WHERE instance_id = ?`).bind(row.instance_id),
      db.prepare(`DELETE FROM hyslides_live_instance_submissions WHERE instance_id = ?`).bind(row.instance_id),
      db.prepare(`DELETE FROM hyslides_live_instance_counts WHERE instance_id = ?`).bind(row.instance_id),
      db.prepare(`DELETE FROM hyslides_live_instance_question_votes WHERE instance_id = ?`).bind(row.instance_id),
      db.prepare(`DELETE FROM hyslides_live_instance_questions WHERE instance_id = ?`).bind(row.instance_id),
      db.prepare(`DELETE FROM hyslides_live_instance_slides WHERE instance_id = ?`).bind(row.instance_id),
      db.prepare(`DELETE FROM hyslides_live_instance_state WHERE instance_id = ?`).bind(row.instance_id),
    ]);
  }
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
    db.prepare(`DELETE FROM hyslides_live_instance_question_votes WHERE instance_id = ?`).bind(instanceId),
    db.prepare(`DELETE FROM hyslides_live_instance_questions WHERE instance_id = ?`).bind(instanceId),
    db.prepare(`DELETE FROM hyslides_live_instance_submissions WHERE instance_id = ?`).bind(instanceId),
    db.prepare(`DELETE FROM hyslides_live_instance_participants WHERE instance_id = ?`).bind(instanceId),
    db.prepare(`DELETE FROM hyslides_live_instance_slides WHERE instance_id = ?`).bind(instanceId),
    db.prepare(`DELETE FROM hyslides_live_instance_metadata WHERE instance_id = ?`).bind(instanceId),
    db.prepare(`DELETE FROM hyslides_live_instance_state WHERE instance_id = ?`).bind(instanceId),
    db.prepare(`DELETE FROM hyslides_live_instances WHERE instance_id = ?`).bind(instanceId),
  ]);
}

async function authorizePresenter(db: D1Database, request: Request, deckId: string, allowRegistration = false) {
  const token = request.headers.get("x-hyslides-presenter-token") || "";
  if (!deckId || token.length < 24) {
    throw new Error("Unauthorized presenter request.");
  }
  const tokenHash = await sha256(token);
  const existing = await db.prepare(
    `SELECT token_hash FROM hyslides_presenter_tokens WHERE deck_id = ?`
  ).bind(deckId).first<{ token_hash: string }>();
  if (!existing && allowRegistration) {
    await db.prepare(
      `INSERT INTO hyslides_presenter_tokens (deck_id, token_hash, created_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)`
    ).bind(deckId, tokenHash).run();
    return;
  }
  if (!existing || !timingSafeEqual(existing.token_hash, tokenHash)) {
    throw new Error("Unauthorized presenter request.");
  }
}

async function authorizeSessionInstance(db: D1Database, request: Request, instanceId: string) {
  const instance = await db.prepare(
    `SELECT deck_id FROM hyslides_live_instances WHERE instance_id = ?`
  ).bind(instanceId).first<{ deck_id: string }>();
  if (!instance) {
    throw new Error("Session not found.");
  }
  await authorizePresenter(db, request, instance.deck_id);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function recordParticipantPresence(db: D1Database, code: string, participantIdValue: string) {
  const participantId = normalizeParticipantId(participantIdValue);
  const session = await getLiveSessionRow(db, code);
  if (!participantId || session.status === "ended") {
    return liveState(db, code);
  }
  await db.prepare(
    `INSERT INTO hyslides_live_instance_participants (
      instance_id, participant_id, joined_at, last_seen_at
    ) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(instance_id, participant_id) DO UPDATE SET last_seen_at = CURRENT_TIMESTAMP`
  ).bind(session.instance_id, participantId).run();
  return liveState(db, code, false);
}

async function activeParticipantCount(db: D1Database, instanceId: string) {
  const result = await db.prepare(
    `SELECT COUNT(*) AS count FROM hyslides_live_instance_participants
      WHERE instance_id = ? AND last_seen_at >= datetime('now', '-20 seconds')`
  ).bind(instanceId).first<{ count: number }>();
  return Number(result?.count || 0);
}

async function controlLiveSession(db: D1Database, code: string, session: LiveSessionRow, action: string) {
  if (action === "pause" || action === "resume" || action === "end") {
    const status = action === "pause" ? "paused" : action === "resume" ? "active" : "ended";
    await db.prepare(
      `UPDATE hyslides_live_instances SET status = ?, last_active_at = CURRENT_TIMESTAMP WHERE instance_id = ?`
    ).bind(status, session.instance_id).run();
  } else if (action === "clearSlide") {
    await db.batch([
      db.prepare(`DELETE FROM hyslides_live_instance_submissions WHERE instance_id = ? AND slide_id = ?`).bind(session.instance_id, session.active_slide_id),
      db.prepare(`DELETE FROM hyslides_live_instance_counts WHERE instance_id = ? AND slide_id = ?`).bind(session.instance_id, session.active_slide_id),
      db.prepare(`DELETE FROM hyslides_live_instance_question_votes WHERE instance_id = ? AND question_id IN (SELECT id FROM hyslides_live_instance_questions WHERE instance_id = ? AND slide_id = ?)`)
        .bind(session.instance_id, session.instance_id, session.active_slide_id),
      db.prepare(`DELETE FROM hyslides_live_instance_questions WHERE instance_id = ? AND slide_id = ?`).bind(session.instance_id, session.active_slide_id),
    ]);
  } else if (action === "resetSession") {
    await db.batch([
      db.prepare(`DELETE FROM hyslides_live_instance_submissions WHERE instance_id = ?`).bind(session.instance_id),
      db.prepare(`DELETE FROM hyslides_live_instance_counts WHERE instance_id = ?`).bind(session.instance_id),
      db.prepare(`DELETE FROM hyslides_live_instance_question_votes WHERE instance_id = ?`).bind(session.instance_id),
      db.prepare(`DELETE FROM hyslides_live_instance_questions WHERE instance_id = ?`).bind(session.instance_id),
    ]);
  } else {
    throw new Error("Unknown live session action.");
  }
  return liveState(db, code, true);
}

async function recordLiveResponse(db: D1Database, code: string, payload: Record<string, unknown>) {
  const session = await getLiveSessionRow(db, code);
  const slide = parseSlide(session.slide_json);
  const engagement = ensureEngagementShape(slide);
  const value = stringValue(payload.value).trim();
  const participantId = normalizeParticipantId(payload.participantId);
  const submittedSlideId = stringValue(payload.slideId);

  if (submittedSlideId && submittedSlideId !== session.active_slide_id) {
    return {
      accepted: false,
      ...(await liveState(db, code)),
    };
  }

  if (session.status !== "active" || !engagement.enabled || !value || !participantId) {
    return {
      accepted: false,
      ...(await liveState(db, code)),
    };
  }

  const type = stringValue(engagement.type) || "poll";
  if ((type === "wordCloud" || type === "qna") && containsBlockedLanguage(value)) {
    throw new Error("That response contains language that is not allowed. Please revise it and try again.");
  }
  const kind = type === "qna" ? "qna" : type === "reactions" ? "reaction" : "response";
  const safeValue = value.slice(0, type === "qna" ? 500 : 200);
  if (type === "qna") {
    await db.prepare(
      `INSERT INTO hyslides_live_instance_questions (
        id, instance_id, slide_id, text, participant_id, upvotes, answered, visible, created_at
      ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, CURRENT_TIMESTAMP)`
    ).bind(crypto.randomUUID(), session.instance_id, session.active_slide_id, safeValue, participantId).run();
    await recordParticipantPresence(db, code, participantId);
    return { accepted: true, ...(await liveState(db, code, false)) };
  }
  const existing = await db.prepare(
    `SELECT value FROM hyslides_live_instance_submissions
      WHERE instance_id = ? AND slide_id = ? AND participant_id = ? AND kind = ?`
  ).bind(session.instance_id, session.active_slide_id, participantId, kind).first<{ value: string }>();
  if (!existing) {
    await db.prepare(
      `INSERT INTO hyslides_live_instance_submissions (
        instance_id, slide_id, participant_id, kind, value, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ).bind(session.instance_id, session.active_slide_id, participantId, kind, safeValue).run();
  } else if (kind === "reaction") {
    await db.prepare(
      `UPDATE hyslides_live_instance_submissions SET value = ?, updated_at = CURRENT_TIMESTAMP
        WHERE instance_id = ? AND slide_id = ? AND participant_id = ? AND kind = ?`
    ).bind(safeValue, session.instance_id, session.active_slide_id, participantId, kind).run();
  }
  await recordParticipantPresence(db, code, participantId);

  return {
    accepted: !existing || kind === "reaction",
    duplicate: Boolean(existing && kind !== "reaction"),
    ...(await liveState(db, code)),
  };
}

async function moderateQuestion(db: D1Database, code: string, session: LiveSessionRow, questionId: string, action: string) {
  if (action === "delete") {
    await db.batch([
      db.prepare(`DELETE FROM hyslides_live_instance_question_votes WHERE instance_id = ? AND question_id = ?`).bind(session.instance_id, questionId),
      db.prepare(`DELETE FROM hyslides_live_instance_questions WHERE instance_id = ? AND id = ?`).bind(session.instance_id, questionId),
    ]);
  } else if (["show", "hide", "answered", "unanswered"].includes(action)) {
    const updates = action === "show" ? ["visible", 1] : action === "hide" ? ["visible", 0] : ["answered", action === "answered" ? 1 : 0];
    await db.prepare(`UPDATE hyslides_live_instance_questions SET ${updates[0]} = ? WHERE instance_id = ? AND id = ?`)
      .bind(updates[1], session.instance_id, questionId).run();
  } else {
    throw new Error("Unknown question moderation action.");
  }
  return liveState(db, code, true);
}

async function voteForQuestion(db: D1Database, code: string, questionId: string, participantIdValue: string) {
  const session = await getLiveSessionRow(db, code);
  const participantId = normalizeParticipantId(participantIdValue);
  if (!participantId || session.status === "ended") return liveState(db, code, false);
  const visibleQuestion = await db.prepare(
    `SELECT id FROM hyslides_live_instance_questions WHERE instance_id = ? AND id = ? AND visible = 1`
  ).bind(session.instance_id, questionId).first();
  if (!visibleQuestion) throw new Error("Question not found.");
  const result = await db.prepare(
    `INSERT OR IGNORE INTO hyslides_live_instance_question_votes (instance_id, question_id, participant_id, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
  ).bind(session.instance_id, questionId, participantId).run();
  if (Number(result.meta?.changes || 0) > 0) {
    await db.prepare(`UPDATE hyslides_live_instance_questions SET upvotes = upvotes + 1 WHERE instance_id = ? AND id = ?`)
      .bind(session.instance_id, questionId).run();
  }
  return { duplicate: Number(result.meta?.changes || 0) === 0, ...(await liveState(db, code, false)) };
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

async function liveState(db: D1Database, code: string, includeHiddenQuestions = false) {
  const session = await getLiveSessionRow(db, code);
  const slide = parseSlide(session.slide_json);
  await applyLiveAggregates(db, session.instance_id, session.active_slide_id, slide, includeHiddenQuestions);
  const participantCount = await activeParticipantCount(db, session.instance_id);
  const responseCount = await db.prepare(
    `SELECT COUNT(DISTINCT participant_id) AS count FROM (
      SELECT participant_id FROM hyslides_live_instance_submissions WHERE instance_id = ? AND slide_id = ?
      UNION ALL
      SELECT participant_id FROM hyslides_live_instance_questions WHERE instance_id = ? AND slide_id = ?
    )`
  ).bind(session.instance_id, session.active_slide_id, session.instance_id, session.active_slide_id).first<{ count: number }>();
  return {
    code,
    instanceId: session.instance_id,
    startedAt: session.started_at,
    status: session.status,
    participantCount,
    responseCount: Number(responseCount?.count || 0),
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
  slide: Record<string, unknown>,
  includeHiddenQuestions = true
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
  const submissions = await db.prepare(
    `SELECT kind, value FROM hyslides_live_instance_submissions
      WHERE instance_id = ? AND slide_id = ?`
  ).bind(instanceId, slideId).all<{ kind: string; value: string }>();

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
  for (const row of submissions.results || []) {
    if (row.kind === "reaction") {
      reactions[row.value] = (reactions[row.value] || 0) + 1;
    } else if (stringValue(engagement.type) === "wordCloud") {
      for (const word of row.value.split(/\s+/).map((item) => item.trim().toLowerCase()).filter(Boolean).slice(0, 20)) {
        results[word] = (results[word] || 0) + 1;
      }
    } else {
      results[row.value] = (results[row.value] || 0) + 1;
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
      `SELECT id, text, upvotes, answered, visible
        FROM hyslides_live_instance_questions
        WHERE instance_id = ? AND slide_id = ? ${includeHiddenQuestions ? "" : "AND visible = 1"}
        ORDER BY created_at ASC`
    )
    .bind(instanceId, slideId)
    .all<LiveQuestionRow>();

  engagement.qna = [...(questions.results || []).map((question) => ({
    id: question.id,
    text: question.text,
    upvotes: question.upvotes,
    answered: Boolean(question.answered),
    visible: Boolean((question as LiveQuestionRow & { visible: number }).visible),
  }))];
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
        instance.status,
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

function normalizeParticipantId(value: unknown) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
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
  status: string;
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
  visible: number;
}
