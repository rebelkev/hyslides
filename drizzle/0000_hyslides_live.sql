CREATE TABLE IF NOT EXISTS `hyslides_live_sessions` (
  `code` text PRIMARY KEY NOT NULL,
  `deck_id` text NOT NULL,
  `deck_title` text NOT NULL,
  `audience_code` text NOT NULL,
  `active_slide_id` text NOT NULL,
  `active_slide_index` integer DEFAULT 0 NOT NULL,
  `slide_json` text NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `hyslides_live_counts` (
  `session_code` text NOT NULL,
  `slide_id` text NOT NULL,
  `kind` text NOT NULL,
  `response_key` text NOT NULL,
  `count` integer DEFAULT 0 NOT NULL,
  PRIMARY KEY (`session_code`, `slide_id`, `kind`, `response_key`)
);

CREATE TABLE IF NOT EXISTS `hyslides_live_questions` (
  `id` text PRIMARY KEY NOT NULL,
  `session_code` text NOT NULL,
  `slide_id` text NOT NULL,
  `text` text NOT NULL,
  `upvotes` integer DEFAULT 0 NOT NULL,
  `answered` integer DEFAULT 0 NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS `hyslides_live_questions_session_slide_idx`
ON `hyslides_live_questions` (`session_code`, `slide_id`, `created_at`);
