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
    upvotes: integer("upvotes").notNull().default(0),
    answered: integer("answered").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("hyslides_live_instance_questions_instance_slide_idx").on(table.instanceId, table.slideId, table.createdAt)]
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
