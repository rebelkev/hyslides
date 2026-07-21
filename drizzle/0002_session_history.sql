CREATE TABLE IF NOT EXISTS `hyslides_live_instance_metadata` (
  `instance_id` text PRIMARY KEY NOT NULL,
  `session_name` text NOT NULL
);

CREATE TABLE IF NOT EXISTS `hyslides_live_instance_slides` (
  `instance_id` text NOT NULL,
  `slide_id` text NOT NULL,
  `slide_index` integer DEFAULT 0 NOT NULL,
  `slide_json` text NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (`instance_id`, `slide_id`)
);
