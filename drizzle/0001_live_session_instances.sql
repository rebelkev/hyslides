CREATE TABLE IF NOT EXISTS `hyslides_live_instances` (
  `instance_id` text PRIMARY KEY NOT NULL,
  `access_code` text NOT NULL,
  `deck_id` text NOT NULL,
  `deck_title` text NOT NULL,
  `started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `last_active_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `status` text DEFAULT 'active' NOT NULL
);

CREATE INDEX IF NOT EXISTS `hyslides_live_instances_access_code_idx`
ON `hyslides_live_instances` (`access_code`, `started_at`);

CREATE TABLE IF NOT EXISTS `hyslides_live_instance_state` (
  `access_code` text PRIMARY KEY NOT NULL,
  `instance_id` text NOT NULL,
  `active_slide_id` text NOT NULL,
  `active_slide_index` integer DEFAULT 0 NOT NULL,
  `slide_json` text NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `hyslides_live_instance_counts` (
  `instance_id` text NOT NULL,
  `slide_id` text NOT NULL,
  `kind` text NOT NULL,
  `response_key` text NOT NULL,
  `count` integer DEFAULT 0 NOT NULL,
  PRIMARY KEY (`instance_id`, `slide_id`, `kind`, `response_key`)
);

CREATE TABLE IF NOT EXISTS `hyslides_live_instance_questions` (
  `id` text PRIMARY KEY NOT NULL,
  `instance_id` text NOT NULL,
  `slide_id` text NOT NULL,
  `text` text NOT NULL,
  `upvotes` integer DEFAULT 0 NOT NULL,
  `answered` integer DEFAULT 0 NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS `hyslides_live_instance_questions_instance_slide_idx`
ON `hyslides_live_instance_questions` (`instance_id`, `slide_id`, `created_at`);
