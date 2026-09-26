-- 003: Role-based access control, domains, project toolkit, immutable audit log
-- Existing users are mapped: admin -> Project Manager, owner -> Process Owner, viewer -> Viewer.

-- ---------------------------------------------------------------------------
-- Domains (the five Process Owner domains)
-- ---------------------------------------------------------------------------
CREATE TABLE domains (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort INT NOT NULL DEFAULT 0
);
INSERT INTO domains(id, name, sort) VALUES
  ('SR', 'Sales & Reservation', 1),
  ('BC', 'Billing & Collection', 2),
  ('AF', 'Accounting & Finance', 3),
  ('IP', 'Inventory & Project Management', 4),
  ('IT', 'IT & Data', 5);

-- ---------------------------------------------------------------------------
-- Roles. System roles (Executive, Project Manager) have fixed permissions defined
-- in server/src/lib/permissions.js; custom roles store theirs in `permissions`.
-- ---------------------------------------------------------------------------
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE,                       -- 'executive' | 'project_manager' for system roles, NULL for custom
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  permissions JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX roles_name_lower ON roles (lower(name));

INSERT INTO roles(key, name, description, is_system) VALUES
  ('executive', 'Executive', 'Sponsors and Steering Committee. View everything, including the audit log. Cannot add, edit or delete.', TRUE),
  ('project_manager', 'Project Manager', 'Views and edits everything. Manages users, roles and schedule settings.', TRUE);

INSERT INTO roles(name, description, permissions) VALUES
  ('Process Owner',
   'Project team member. Views everything; adds and edits records in their own domain(s) and the processes assigned to them.',
   '{"*":{"view":"all"},
     "users":{"view":"none"},"roles":{"view":"none"},"audit_log":{"view":"none"},
     "group:toolkit":{"view":"all","add":"own","edit":"own"},
     "key_dates":{"view":"all"},"signoffs":{"view":"all","add":"own","edit":"own"},
     "processes":{"view":"all","edit":"own"},
     "matrix":{"view":"all","add":"own","edit":"own"},
     "diagrams":{"view":"all","edit":"all"},
     "open_items":{"view":"all","add":"all","edit":"all"},
     "lot_responses":{"view":"all","edit":"all"},
     "reengineering":{"view":"all","edit":"all"},
     "sow":{"view":"all","edit":"all"},
     "documents":{"view":"all","add":"all","edit":"all"},
     "documents_confidential":{"view":"all"},
     "comments":{"view":"all","add":"all"}}'),
  ('Viewer',
   'Reads everything except confidential documents, and can comment.',
   '{"*":{"view":"all"},
     "users":{"view":"none"},"roles":{"view":"none"},"audit_log":{"view":"none"},
     "documents_confidential":{"view":"none"},
     "comments":{"view":"all","add":"all"}}');

ALTER TABLE users ADD COLUMN role_id INT REFERENCES roles(id);
UPDATE users SET role_id = (SELECT id FROM roles WHERE key = 'project_manager') WHERE role = 'admin';
UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'Process Owner') WHERE role = 'owner';
UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'Viewer') WHERE role_id IS NULL;
ALTER TABLE users ALTER COLUMN role_id SET NOT NULL;
ALTER TABLE users DROP COLUMN role;

CREATE TABLE user_domains (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, domain_id)
);

-- ---------------------------------------------------------------------------
-- Project toolkit
-- ---------------------------------------------------------------------------
CREATE TABLE tk_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE tk_tasks (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  phase TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Phase', 'Task', 'Milestone', 'Workstream', 'Blackout')),
  owner TEXT NOT NULL DEFAULT '',
  domain_id TEXT REFERENCES domains(id) ON DELETE SET NULL,
  anchor TEXT NOT NULL DEFAULT 'PRE' CHECK (anchor IN ('PRE', 'BRD', 'GL')),
  offset_days INT NOT NULL DEFAULT 0,
  duration_days INT NOT NULL DEFAULT 0,
  use_hypercare BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Not Started',
  sort INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE tk_records (
  id SERIAL PRIMARY KEY,
  register TEXT NOT NULL,
  domain_id TEXT REFERENCES domains(id) ON DELETE SET NULL,
  data JSONB NOT NULL DEFAULT '{}',
  sort INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX tk_records_register ON tk_records(register, sort, id);

ALTER TABLE comments DROP CONSTRAINT comments_entity_type_check;
ALTER TABLE comments ADD CONSTRAINT comments_entity_type_check
  CHECK (entity_type IN ('process', 'step', 'diagram', 'open_item', 'reengineering', 'gap', 'observation', 'appendix', 'document', 'tk_record', 'tk_task'));

-- ---------------------------------------------------------------------------
-- Immutable, hash-chained audit log
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  user_id INT,                 -- no FK on purpose: entries outlive users
  user_name TEXT,
  user_email TEXT,
  ip TEXT,
  action TEXT NOT NULL,        -- INSERT, UPDATE, DELETE, TRUNCATE, LOGIN, LOGIN_FAILED, LOGOUT, EXPORT, DOWNLOAD, ACCESS_DENIED, LEGACY
  table_name TEXT,
  record_id TEXT,
  changed_fields TEXT[],
  old_data JSONB,
  new_data JSONB,
  summary TEXT,
  prev_hash TEXT NOT NULL DEFAULT '',
  hash TEXT NOT NULL DEFAULT ''
);
ALTER TABLE audit_log ALTER COLUMN id DROP DEFAULT;   -- ids are assigned inside the chain trigger, under the lock
CREATE INDEX audit_log_at ON audit_log(at DESC);
CREATE INDEX audit_log_table ON audit_log(table_name, record_id);
CREATE INDEX audit_log_user ON audit_log(user_id);

-- Canonical hash of one entry. Used when writing and when verifying.
CREATE FUNCTION audit_hash(r audit_log) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(concat_ws('|',
    r.prev_hash, r.id::text,
    to_char(r.at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    coalesce(r.user_id::text, ''), coalesce(r.user_name, ''), coalesce(r.user_email, ''), coalesce(r.ip, ''),
    r.action, coalesce(r.table_name, ''), coalesce(r.record_id, ''),
    coalesce(array_to_string(r.changed_fields, ','), ''),
    coalesce(r.old_data::text, ''), coalesce(r.new_data::text, ''), coalesce(r.summary, '')
  ), 'UTF8')), 'hex');
$$;

-- Every insert is serialized, numbered and chained to the previous entry.
CREATE FUNCTION audit_log_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prev TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(727274001);
  NEW.id := nextval(pg_get_serial_sequence('audit_log', 'id'));
  NEW.at := clock_timestamp();
  SELECT hash INTO prev FROM audit_log ORDER BY id DESC LIMIT 1;
  NEW.prev_hash := coalesce(prev, repeat('0', 64));
  NEW.hash := audit_hash(NEW);
  RETURN NEW;
END $$;
CREATE TRIGGER audit_log_chain BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_chain();

CREATE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM PUBLIC;

-- Walks the chain in order and reports the first broken entry, if any.
CREATE FUNCTION audit_verify() RETURNS TABLE(checked BIGINT, bad_id BIGINT, head_id BIGINT, head_hash TEXT) LANGUAGE plpgsql AS $$
DECLARE r audit_log; prev TEXT := repeat('0', 64); n BIGINT := 0;
BEGIN
  head_id := NULL; head_hash := NULL; bad_id := NULL;
  FOR r IN SELECT * FROM audit_log ORDER BY id LOOP
    n := n + 1;
    IF r.prev_hash <> prev OR r.hash <> audit_hash(r) THEN
      checked := n; bad_id := r.id; RETURN NEXT; RETURN;
    END IF;
    prev := r.hash; head_id := r.id; head_hash := r.hash;
  END LOOP;
  checked := n; RETURN NEXT;
END $$;

-- Row-level capture for every audited table. Who/where comes from transaction-local
-- settings the app sets (app.user_id, app.user_name, app.user_email, app.ip).
-- TG_ARGV[0] = comma-separated key columns used as record_id.
CREATE FUNCTION audit_row() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  o JSONB; n JSONB; chg TEXT[]; rid TEXT; k TEXT; src JSONB;
  big CONSTANT TEXT[] := ARRAY['data', 'xml'];         -- file bytes / BPMN XML are versioned in their own tables
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN o := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN n := to_jsonb(NEW); END IF;
  -- tk_records keeps its fields inside a JSONB column named data: keep it (it's small); drop only true blobs
  IF TG_TABLE_NAME <> 'tk_records' THEN
    o := o - big; n := n - big;
  END IF;
  IF TG_TABLE_NAME = 'users' THEN            -- sign-ins are logged as LOGIN events instead
    o := o - 'last_login_at'; n := n - 'last_login_at';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(e.key ORDER BY e.key) INTO chg FROM jsonb_each(n) e WHERE e.value IS DISTINCT FROM o -> e.key;
    IF chg IS NULL THEN RETURN NULL; END IF;           -- nothing actually changed
    SELECT jsonb_object_agg(x, o -> x) INTO o FROM unnest(chg) x;
    SELECT jsonb_object_agg(x, n -> x) INTO n FROM unnest(chg) x;
  END IF;
  IF o ? 'password_hash' THEN o := jsonb_set(o, '{password_hash}', '"[redacted]"'); END IF;
  IF n ? 'password_hash' THEN n := jsonb_set(n, '{password_hash}', '"[redacted]"'); END IF;
  src := coalesce(to_jsonb(NEW), to_jsonb(OLD));
  FOREACH k IN ARRAY string_to_array(TG_ARGV[0], ',') LOOP
    rid := concat_ws('/', rid, src ->> k);
  END LOOP;
  INSERT INTO audit_log(user_id, user_name, user_email, ip, action, table_name, record_id, changed_fields, old_data, new_data)
  VALUES (NULLIF(current_setting('app.user_id', true), '')::int, NULLIF(current_setting('app.user_name', true), ''),
          NULLIF(current_setting('app.user_email', true), ''), NULLIF(current_setting('app.ip', true), ''),
          TG_OP, TG_TABLE_NAME, rid, chg, o, n);
  RETURN NULL;
END $$;

CREATE FUNCTION audit_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO audit_log(user_id, user_name, user_email, ip, action, table_name, summary)
  VALUES (NULLIF(current_setting('app.user_id', true), '')::int, NULLIF(current_setting('app.user_name', true), ''),
          NULLIF(current_setting('app.user_email', true), ''), NULLIF(current_setting('app.ip', true), ''),
          'TRUNCATE', TG_TABLE_NAME, 'All rows removed');
  RETURN NULL;
END $$;

DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('users', 'id'), ('roles', 'id'), ('user_domains', 'user_id,domain_id'), ('domains', 'id'),
    ('process_owners', 'process_id,user_id'), ('process_groups', 'id'), ('stages', 'id'), ('processes', 'id'),
    ('matrix_steps', 'ref'), ('master_data', 'id'), ('lot_touchpoints', 'id'), ('open_items', 'code'),
    ('diagrams', 'id'), ('diagram_versions', 'diagram_id,version'), ('comments', 'id'),
    ('reengineering', 'id'), ('sow_meta', 'key'), ('sow_items', 'no'), ('sow_effort', 'id'), ('sow_gaps', 'ref'),
    ('sow_observations', 'code'), ('sow_appendix', 'code'), ('documents', 'id'), ('document_files', 'document_id,version'),
    ('tk_settings', 'key'), ('tk_tasks', 'code'), ('tk_records', 'id')
  ) AS v(tbl, keys) LOOP
    EXECUTE format('CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_row(%L)', t.tbl, t.keys);
    EXECUTE format('CREATE TRIGGER audit_truncate AFTER TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION audit_truncate()', t.tbl);
  END LOOP;
END $$;

-- Carry the existing activity history into the audit log (oldest first) so nothing is lost.
INSERT INTO audit_log(user_id, user_name, user_email, action, table_name, record_id, summary, new_data)
SELECT a.user_id, u.name, u.email, 'LEGACY', a.entity_type, a.entity_id, a.action || ': ' || a.summary,
       jsonb_build_object('original_time', a.at)
  FROM activity_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id;

INSERT INTO audit_log(action, summary) VALUES ('SYSTEM', 'Audit log enabled (migration 003). Earlier activity imported as LEGACY entries.');
