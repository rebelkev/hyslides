CREATE TABLE IF NOT EXISTS hyslides_remote_controller_pairings (
  token_hash TEXT PRIMARY KEY,
  access_code TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hyslides_remote_controller_state (
  instance_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hyslides_remote_controller_commands (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  command_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS hyslides_remote_controller_commands_pending_idx
  ON hyslides_remote_controller_commands (instance_id, consumed_at, created_at);
