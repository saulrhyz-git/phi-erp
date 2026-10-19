-- 010: Customer Requirements (KPI) first. Each requirement becomes a record of its own (KPI-01…), defined
-- before any process, and every part of the blueprint is mapped back to the KPI it delivers:
--   KPI → processes (Produces / Contributes, and which COPIS outputs prove it) → hand-off steps → data
--       → reports that show it → swimlanes, re-engineering, open items, documents, fit-gap, UAT, pain points.
-- KPIs and reports are implementor-neutral: they are never linked to a vendor's SOW, so they survive a
-- change of implementor.

CREATE TABLE kpis (
  id TEXT PRIMARY KEY,                                   -- KPI-01
  customer TEXT NOT NULL,                                -- who requires it
  requirement TEXT NOT NULL,                             -- what they need, in their words
  name TEXT NOT NULL,                                    -- the KPI / measure
  definition TEXT NOT NULL DEFAULT '',                   -- formula: how it is calculated
  unit TEXT NOT NULL DEFAULT '',
  direction TEXT NOT NULL DEFAULT '' CHECK (direction IN ('', 'Lower is better', 'Higher is better', 'Hit the target')),
  baseline TEXT NOT NULL DEFAULT '',
  baseline_date DATE,
  target TEXT NOT NULL DEFAULT '',
  frequency TEXT NOT NULL DEFAULT '',                    -- how often it is measured / reported
  data_source TEXT NOT NULL DEFAULT '',                  -- where the numbers come from
  owner TEXT NOT NULL DEFAULT '',                        -- accountable for the result
  domain_id TEXT REFERENCES domains(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('High', 'Medium', 'Low')),
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Validated', 'Retired')),
  notes TEXT NOT NULL DEFAULT '',
  sort INT NOT NULL DEFAULT 0,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INT REFERENCES users(id) ON DELETE SET NULL
);

-- KPI ↔ process. 'Produces' = the process delivers the result; 'Contributes' = it feeds it.
-- outputs: the process's COPIS outputs (text, as written on the process) that prove the KPI is met.
CREATE TABLE kpi_processes (
  kpi_id TEXT NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
  process_id TEXT NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'Produces' CHECK (role IN ('Produces', 'Contributes')),
  outputs JSONB NOT NULL DEFAULT '[]',
  PRIMARY KEY (kpi_id, process_id)
);
CREATE INDEX kpi_processes_process ON kpi_processes(process_id);

-- Reports register: every report, dashboard, statement or alert the business needs, defined before it is built.
CREATE TABLE reports (
  id TEXT PRIMARY KEY,                                   -- RPT-01
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Report' CHECK (type IN ('Dashboard', 'Report', 'Statement', 'Statutory form', 'Export', 'Alert')),
  purpose TEXT NOT NULL DEFAULT '',                      -- the decision or action it supports
  audience TEXT NOT NULL DEFAULT '',
  frequency TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT '',                       -- screen, PDF, XLSX, email…
  contents TEXT NOT NULL DEFAULT '',                     -- measures, columns, filters, drill-downs
  data_sources TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  domain_id TEXT REFERENCES domains(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Proposed' CHECK (status IN ('Proposed', 'Specified', 'Built', 'Tested', 'Live', 'Retired')),
  notes TEXT NOT NULL DEFAULT '',
  sort INT NOT NULL DEFAULT 0,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INT REFERENCES users(id) ON DELETE SET NULL
);

-- Every other mapping, from a KPI or a report to its counterpart elsewhere in the app.
CREATE TABLE trace_links (
  from_type TEXT NOT NULL CHECK (from_type IN ('kpi', 'report')),
  from_id TEXT NOT NULL,
  to_type TEXT NOT NULL CHECK (to_type IN ('report', 'process', 'step', 'diagram', 'reengineering', 'master_data', 'open_item', 'document', 'tk_record')),
  to_id TEXT NOT NULL,
  PRIMARY KEY (from_type, from_id, to_type, to_id)
);
CREATE INDEX trace_links_to ON trace_links(to_type, to_id);

-- Links never dangle: removing either end removes the link.
CREATE FUNCTION trace_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k TEXT := (to_jsonb(OLD) ->> TG_ARGV[1]);
BEGIN
  DELETE FROM trace_links WHERE (to_type = TG_ARGV[0] AND to_id = k) OR (from_type = TG_ARGV[0] AND from_id = k);
  RETURN NULL;
END $$;
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('kpis', 'kpi', 'id'), ('reports', 'report', 'id'), ('processes', 'process', 'id'), ('matrix_steps', 'step', 'id'),
    ('diagrams', 'diagram', 'id'), ('reengineering', 'reengineering', 'id'), ('master_data', 'master_data', 'id'),
    ('open_items', 'open_item', 'id'), ('documents', 'document', 'id'), ('tk_records', 'tk_record', 'id')
  ) AS v(tbl, typ, keycol) LOOP
    EXECUTE format('CREATE TRIGGER trace_cleanup AFTER DELETE ON %I FOR EACH ROW EXECUTE FUNCTION trace_cleanup(%L, %L)', t.tbl, t.typ, t.keycol);
  END LOOP;
END $$;

-- Audit every change, like every other table.
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON kpis FOR EACH ROW EXECUTE FUNCTION audit_row('id');
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON kpi_processes FOR EACH ROW EXECUTE FUNCTION audit_row('kpi_id,process_id');
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON reports FOR EACH ROW EXECUTE FUNCTION audit_row('id');
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON trace_links FOR EACH ROW EXECUTE FUNCTION audit_row('from_type,from_id,to_type,to_id');
CREATE TRIGGER audit_truncate AFTER TRUNCATE ON kpis FOR EACH STATEMENT EXECUTE FUNCTION audit_truncate();
CREATE TRIGGER audit_truncate AFTER TRUNCATE ON kpi_processes FOR EACH STATEMENT EXECUTE FUNCTION audit_truncate();
CREATE TRIGGER audit_truncate AFTER TRUNCATE ON reports FOR EACH STATEMENT EXECUTE FUNCTION audit_truncate();
CREATE TRIGGER audit_truncate AFTER TRUNCATE ON trace_links FOR EACH STATEMENT EXECUTE FUNCTION audit_truncate();

-- Discussion threads on KPIs and reports.
ALTER TABLE comments DROP CONSTRAINT comments_entity_type_check;
ALTER TABLE comments ADD CONSTRAINT comments_entity_type_check
  CHECK (entity_type IN ('process', 'step', 'diagram', 'open_item', 'reengineering', 'gap', 'observation', 'appendix', 'document',
                         'tk_record', 'tk_task', 'kpi', 'report'));

-- ---------------------------------------------------------------------------
-- Move the requirements that lived inside each process into KPI records. Nothing is lost:
-- each becomes KPI-nn, mapped to its process ('Produces') and to the re-engineering opportunity it came
-- from. Which outputs prove the KPI is left for the process owner to choose (shown as a gap until then).
-- Baseline and owner are taken from that opportunity if recorded.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _old_req ON COMMIT DROP AS
SELECT 'KPI-' || lpad(row_number() OVER (ORDER BY p.sort, e.ord)::text, 2, '0') AS kpi_id,
       p.id AS process_id, p.domain_id, p.sort * 100 + e.ord AS sort, e.req
  FROM processes p, jsonb_array_elements(p.customer_requirements) WITH ORDINALITY AS e(req, ord);

INSERT INTO kpis(id, customer, requirement, name, target, status, domain_id, baseline, baseline_date, owner, sort)
SELECT o.kpi_id, o.req->>'customer', o.req->>'requirement',
       COALESCE(NULLIF(o.req->>'measure', ''), o.req->>'requirement'), COALESCE(o.req->>'target', ''),
       CASE WHEN o.req->>'status' = 'Validated' THEN 'Validated' ELSE 'Draft' END, o.domain_id,
       COALESCE(re.kpi_baseline, ''), re.kpi_baseline_date, COALESCE(re.kpi_owner, ''), row_number() OVER (ORDER BY o.sort)
  FROM _old_req o LEFT JOIN reengineering re ON re.id = o.req->>'source';

INSERT INTO kpi_processes(kpi_id, process_id, role)
SELECT kpi_id, process_id, 'Produces' FROM _old_req;

INSERT INTO trace_links(from_type, from_id, to_type, to_id)
SELECT 'kpi', o.kpi_id, 'reengineering', re.id FROM _old_req o JOIN reengineering re ON re.id = o.req->>'source'
ON CONFLICT DO NOTHING;

-- The draft seed has now been loaded (into KPIs); don't load it again.
INSERT INTO sow_meta(key, value)
SELECT 'seed_kpis', to_jsonb(now()::text) WHERE EXISTS (SELECT 1 FROM sow_meta WHERE key = 'seed_customer_requirements')
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM kpis;
  IF n > 0 THEN RAISE NOTICE 'Moved % customer requirement(s) into Customer Requirements (KPI).', n; END IF;
END $$;

ALTER TABLE processes DROP COLUMN customer_requirements;

-- Process Owners add and edit KPIs and reports in their own domain(s). Other custom roles can view them.
UPDATE roles SET permissions = permissions
  || '{"kpis":{"view":"all","add":"own","edit":"own"},"reports":{"view":"all","add":"own","edit":"own"}}'::jsonb
 WHERE key IS NULL AND name = 'Process Owner' AND NOT permissions ? 'kpis';
