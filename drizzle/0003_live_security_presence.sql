CREATE TABLE IF NOT EXISTS `hyslides_presenter_tokens` (
  `deck_id` text PRIMARY KEY NOT NULL,
  `token_hash` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hyslides_live_instance_participants` (
  `instance_id` text NOT NULL,
  `participant_id` text NOT NULL,
  `joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY(`instance_id`, `participant_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hyslides_live_participants_seen_idx` ON `hyslides_live_instance_participants` (`instance_id`,`last_seen_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hyslides_live_instance_submissions` (
  `instance_id` text NOT NULL,
  `slide_id` text NOT NULL,
  `participant_id` text NOT NULL,
  `kind` text NOT NULL,
  `value` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY(`instance_id`, `slide_id`, `participant_id`, `kind`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hyslides_live_submissions_slide_idx` ON `hyslides_live_instance_submissions` (`instance_id`,`slide_id`);
