-- Re-engineering opportunities, SOW review, and document library

CREATE TABLE reengineering (
  id TEXT PRIMARY KEY,                 -- RE-01
  title TEXT NOT NULL,
  process_refs TEXT NOT NULL DEFAULT '',
  current_process TEXT NOT NULL DEFAULT '',
  pain_points TEXT NOT NULL DEFAULT '',
  proposed TEXT NOT NULL DEFAULT '',
  justification TEXT NOT NULL DEFAULT '',
  controls TEXT NOT NULL DEFAULT '',
  benefits TEXT NOT NULL DEFAULT '',
  wave TEXT NOT NULL DEFAULT '',
  continues TEXT NOT NULL DEFAULT '',
  odoo_enabler TEXT NOT NULL DEFAULT '',
  sow_status TEXT NOT NULL DEFAULT '',
  kpi TEXT NOT NULL DEFAULT '',
  target TEXT NOT NULL DEFAULT '',
  why_problem TEXT NOT NULL DEFAULT '',
  how_fixes TEXT NOT NULL DEFAULT '',
  control_effect TEXT NOT NULL DEFAULT '',
  before_steps JSONB NOT NULL DEFAULT '[]',
  after_steps JSONB NOT NULL DEFAULT '[]',
  what_changes TEXT NOT NULL DEFAULT '',
  roles_affected TEXT NOT NULL DEFAULT '',
  sow_sections TEXT NOT NULL DEFAULT '',
  sow_items JSONB NOT NULL DEFAULT '[]',
  impact_type TEXT NOT NULL DEFAULT '',
  awb_change TEXT NOT NULL DEFAULT '',
  appendix_ref TEXT NOT NULL DEFAULT '',
  effort_low NUMERIC(8,2) NOT NULL DEFAULT 0,
  effort_high NUMERIC(8,2) NOT NULL DEFAULT 0,
  offset_low NUMERIC(8,2) NOT NULL DEFAULT 0,
  offset_high NUMERIC(8,2) NOT NULL DEFAULT 0,
  build_phase TEXT NOT NULL DEFAULT '',
  sow_wording TEXT NOT NULL DEFAULT '',
  flex_category TEXT NOT NULL DEFAULT '',
  risk TEXT NOT NULL DEFAULT '',
  -- PHI decision and tracking
  phi_decision TEXT NOT NULL DEFAULT '' CHECK (phi_decision IN ('', 'Accept', 'Accept with changes', 'Needs discussion', 'Defer', 'Reject')),
  phi_owner TEXT NOT NULL DEFAULT '',
  target_date DATE,
  phi_comments TEXT NOT NULL DEFAULT '',
  kpi_baseline TEXT NOT NULL DEFAULT '',
  kpi_baseline_date DATE,
  kpi_agreed_target TEXT NOT NULL DEFAULT '',
  kpi_owner TEXT NOT NULL DEFAULT '',
  awb_estimate NUMERIC(8,2),
  agreed_treatment TEXT NOT NULL DEFAULT '',
  negotiation_status TEXT NOT NULL DEFAULT 'Open',
  sort INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE sow_meta (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE TABLE sow_items (
  no INT PRIMARY KEY,
  section TEXT NOT NULL,
  feature TEXT NOT NULL,
  dev_days NUMERIC(8,2) NOT NULL,
  process_refs TEXT NOT NULL DEFAULT ''
);

CREATE TABLE sow_effort (
  id SERIAL PRIMARY KEY,
  workstream TEXT NOT NULL,
  lead NUMERIC(8,2), ba NUMERIC(8,2), dev_lead NUMERIC(8,2), dev NUMERIC(8,2), qa NUMERIC(8,2), infra NUMERIC(8,2),
  stated_total NUMERIC(8,2) NOT NULL,
  sort INT NOT NULL DEFAULT 0
);

CREATE TABLE sow_gaps (
  id SERIAL PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,            -- process id, C1.., S1..
  kind TEXT NOT NULL CHECK (kind IN ('process', 'cross', 'sow_only')),
  process_id TEXT REFERENCES processes(id) ON DELETE SET NULL,
  title TEXT,
  requirement TEXT NOT NULL DEFAULT '',
  sow_coverage TEXT NOT NULL DEFAULT '',
  rating TEXT NOT NULL CHECK (rating IN ('Covered', 'Partial', 'Not covered')),
  gaps TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT '',
  steps_affected TEXT NOT NULL DEFAULT '',
  phi_response TEXT NOT NULL DEFAULT '',
  vendor_response TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Open',
  sort INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE sow_observations (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  finding TEXT NOT NULL DEFAULT '',
  impact TEXT NOT NULL DEFAULT '',
  internal_ask TEXT NOT NULL DEFAULT '',
  letter_observation TEXT NOT NULL DEFAULT '',
  letter_request TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  vendor_response TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Open',
  sort INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE sow_appendix (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,           -- A1.., B1..
  part TEXT NOT NULL CHECK (part IN ('A', 'B')),
  title TEXT NOT NULL,
  process_ref TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT '',
  vendor_response TEXT NOT NULL DEFAULT '',
  vendor_estimate NUMERIC(8,2),
  status TEXT NOT NULL DEFAULT 'Open',
  sort INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  confidential BOOLEAN NOT NULL DEFAULT FALSE,
  current_version INT NOT NULL DEFAULT 0,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE document_files (
  id SERIAL PRIMARY KEY,
  document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version INT NOT NULL,
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INT NOT NULL,
  data BYTEA NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);

ALTER TABLE comments DROP CONSTRAINT comments_entity_type_check;
ALTER TABLE comments ADD CONSTRAINT comments_entity_type_check
  CHECK (entity_type IN ('process', 'step', 'diagram', 'open_item', 'reengineering', 'gap', 'observation', 'appendix', 'document'));
