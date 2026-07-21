import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const liveSessions = sqliteTable("hyslides_live_sessions", {
  code: text("code").primaryKey(),
  deckId: text("deck_id").notNull(),
  deckTitle: text("deck_title").notNull(),
  audienceCode: text("audience_code").notNull(),
  activeSlideId: text("active_slide_id").notNull(),
  activeSlideIndex: integer("active_slide_index").notNull().default(0),
  slideJson: text("slide_json").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const liveCounts = sqliteTable(
  "hyslides_live_counts",
  {
    sessionCode: text("session_code").notNull(),
    slideId: text("slide_id").notNull(),
    kind: text("kind").notNull(),
    responseKey: text("response_key").notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [
    primaryKey({
      columns: [table.sessionCode, table.slideId, table.kind, table.responseKey],
    }),
  ]
);

export const liveQuestions = sqliteTable("hyslides_live_questions", {
  id: text("id").primaryKey(),
  sessionCode: text("session_code").notNull(),
  slideId: text("slide_id").notNull(),
  text: text("text").notNull(),
  upvotes: integer("upvotes").notNull().default(0),
  answered: integer("answered").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const liveInstances = sqliteTable(
  "hyslides_live_instances",
  {
    instanceId: text("instance_id").primaryKey(),
    accessCode: text("access_code").notNull(),
    deckId: text("deck_id").notNull(),
    deckTitle: text("deck_title").notNull(),
    startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastActiveAt: text("last_active_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    status: text("status").notNull().default("active"),
  },
  (table) => [index("hyslides_live_instances_access_code_idx").on(table.accessCode, table.startedAt)]
);

export const liveInstanceState = sqliteTable("hyslides_live_instance_state", {
  accessCode: text("access_code").primaryKey(),
  instanceId: text("instance_id").notNull(),
  activeSlideId: text("active_slide_id").notNull(),
  activeSlideIndex: integer("active_slide_index").notNull().default(0),
  slideJson: text("slide_json").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const liveInstanceCounts = sqliteTable(
  "hyslides_live_instance_counts",
  {
    instanceId: text("instance_id").notNull(),
    slideId: text("slide_id").notNull(),
    kind: text("kind").notNull(),
    responseKey: text("response_key").notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.instanceId, table.slideId, table.kind, table.responseKey] }),
  ]
);

export const liveInstanceQuestions = sqliteTable(
  "hyslides_live_instance_questions",
  {
    id: text("id").primaryKey(),
    instanceId: text("instance_id").notNull(),
    slideId: text("slide_id").notNull(),
    text: text("text").notNull(),
    participantId: text("participant_id").notNull().default(""),
    upvotes: integer("upvotes").notNull().default(0),
    answered: integer("answered").notNull().default(0),
    visible: integer("visible").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("hyslides_live_instance_questions_instance_slide_idx").on(table.instanceId, table.slideId, table.createdAt)]
);

export const liveInstanceQuestionVotes = sqliteTable(
  "hyslides_live_instance_question_votes",
  {
    instanceId: text("instance_id").notNull(),
    questionId: text("question_id").notNull(),
    participantId: text("participant_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.instanceId, table.questionId, table.participantId] })]
);

export const liveInstanceMetadata = sqliteTable("hyslides_live_instance_metadata", {
  instanceId: text("instance_id").primaryKey(),
  sessionName: text("session_name").notNull(),
});

export const liveInstanceSlides = sqliteTable(
  "hyslides_live_instance_slides",
  {
    instanceId: text("instance_id").notNull(),
    slideId: text("slide_id").notNull(),
    slideIndex: integer("slide_index").notNull().default(0),
    slideJson: text("slide_json").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.instanceId, table.slideId] })]
);

export const presenterTokens = sqliteTable("hyslides_presenter_tokens", {
  deckId: text("deck_id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const liveInstanceParticipants = sqliteTable(
  "hyslides_live_instance_participants",
  {
    instanceId: text("instance_id").notNull(),
    participantId: text("participant_id").notNull(),
    joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.instanceId, table.participantId] }),
    index("hyslides_live_participants_seen_idx").on(table.instanceId, table.lastSeenAt),
  ]
);

export const liveInstanceSubmissions = sqliteTable(
  "hyslides_live_instance_submissions",
  {
    instanceId: text("instance_id").notNull(),
    slideId: text("slide_id").notNull(),
    participantId: text("participant_id").notNull(),
    kind: text("kind").notNull(),
    value: text("value").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.instanceId, table.slideId, table.participantId, table.kind] }),
    index("hyslides_live_submissions_slide_idx").on(table.instanceId, table.slideId),
  ]
);
