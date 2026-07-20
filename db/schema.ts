import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
