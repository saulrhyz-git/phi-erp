CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'owner', 'viewer')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX users_email_lower ON users (lower(email));

CREATE TABLE process_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  sort INT NOT NULL DEFAULT 0
);

CREATE TABLE stages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort INT NOT NULL DEFAULT 0
);

CREATE TABLE processes (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES process_groups(id),
  stage_id INT REFERENCES stages(id),
  name TEXT NOT NULL,
  owner_dept TEXT NOT NULL DEFAULT '',
  odoo_home TEXT NOT NULL DEFAULT '',
  fit TEXT NOT NULL CHECK (fit IN ('Standard', 'Configure', 'Extend')),
  from_reference BOOLEAN NOT NULL DEFAULT FALSE,
  sort INT NOT NULL DEFAULT 0,
  suppliers JSONB NOT NULL DEFAULT '[]',
  inputs JSONB NOT NULL DEFAULT '[]',
  steps JSONB NOT NULL DEFAULT '[]',
  outputs JSONB NOT NULL DEFAULT '[]',
  customers JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE process_owners (
  process_id TEXT NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (process_id, user_id)
);

CREATE TABLE matrix_steps (
  id SERIAL PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  process_id TEXT NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  trigger_event TEXT NOT NULL DEFAULT '',
  data_fields TEXT NOT NULL DEFAULT '',
  handoff TEXT NOT NULL DEFAULT '',
  exceptions TEXT NOT NULL DEFAULT '',
  fit TEXT NOT NULL CHECK (fit IN ('Standard', 'Configure', 'Extend')),
  sort INT NOT NULL DEFAULT 0,
  validation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'approved', 'changes', 'rework')),
  validation_comment TEXT NOT NULL DEFAULT '',
  validated_by INT REFERENCES users(id) ON DELETE SET NULL,
  validated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX matrix_steps_process ON matrix_steps(process_id);

CREATE TABLE master_data (
  id SERIAL PRIMARY KEY,
  object TEXT NOT NULL,
  owning_process TEXT NOT NULL DEFAULT '',
  key_fields TEXT NOT NULL DEFAULT '',
  odoo_home TEXT NOT NULL DEFAULT '',
  used_by TEXT NOT NULL DEFAULT '',
  sort INT NOT NULL DEFAULT 0
);

CREATE TABLE lot_touchpoints (
  id SERIAL PRIMARY KEY,
  process_label TEXT NOT NULL,
  effect TEXT NOT NULL DEFAULT '',
  fields_needed TEXT NOT NULL DEFAULT '',
  vendor_response TEXT NOT NULL DEFAULT '',
  sort INT NOT NULL DEFAULT 0
);

CREATE TABLE open_items (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  decision TEXT NOT NULL DEFAULT '',
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  sort INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE diagrams (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  covers TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  current_version INT NOT NULL DEFAULT 0
);

CREATE TABLE diagram_versions (
  id SERIAL PRIMARY KEY,
  diagram_id TEXT NOT NULL REFERENCES diagrams(id) ON DELETE CASCADE,
  version INT NOT NULL,
  xml TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (diagram_id, version)
);

CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('process', 'step', 'diagram', 'open_item')),
  entity_id TEXT NOT NULL,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX comments_entity ON comments(entity_type, entity_id);

CREATE TABLE activity_log (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_at ON activity_log(at DESC);
