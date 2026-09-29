-- 009: World-map processes and hand-off steps can be added in the app, and everything is mapped
-- explicitly: process ↔ domain, process ↔ swimlane diagram, step ↔ SOW items / re-engineering / diagrams.

-- Processes: owning domain (decides which domain owners may edit its COPIS and add steps) and origin.
ALTER TABLE processes ADD COLUMN domain_id TEXT REFERENCES domains(id) ON DELETE SET NULL;
ALTER TABLE processes ADD COLUMN source TEXT NOT NULL DEFAULT 'blueprint' CHECK (source IN ('blueprint', 'manual'));
ALTER TABLE processes ADD COLUMN created_by INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE processes ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Default domain for the blueprint processes (the Project Manager can change any of these in the app).
UPDATE processes p SET domain_id = m.d
  FROM (VALUES ('01','AF'),('02','AF'),('03','AF'),('04','IP'),('05','IP'),('06','IP'),('07','IP'),
               ('08','SR'),('09','SR'),('10','SR'),('11','BC'),('12','BC'),('13','BC'),('14','BC'),
               ('15','IP'),('16','AF'),('17','SR'),('18','IP'),('19','BC'),('X1','AF'),('X2','AF')) AS m(id, d)
 WHERE p.id = m.id AND EXISTS (SELECT 1 FROM domains WHERE id = m.d);

-- Process ↔ swimlane diagram, explicit (was inferred from the diagram's "covers" text).
CREATE TABLE process_diagrams (
  process_id TEXT NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  diagram_id TEXT NOT NULL REFERENCES diagrams(id) ON DELETE CASCADE,
  PRIMARY KEY (process_id, diagram_id)
);
INSERT INTO process_diagrams(process_id, diagram_id)
SELECT p.id, d.id FROM processes p JOIN diagrams d ON d.covers ~ ('(^|[^0-9A-Z])' || p.id || '([^0-9]|$)')
ON CONFLICT DO NOTHING;
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON process_diagrams FOR EACH ROW EXECUTE FUNCTION audit_row('process_id,diagram_id');

-- Hand-off steps: links to SOW items, re-engineering opportunities and diagrams; origin.
ALTER TABLE matrix_steps ADD COLUMN sow_items JSONB NOT NULL DEFAULT '[]';
ALTER TABLE matrix_steps ADD COLUMN reengineering JSONB NOT NULL DEFAULT '[]';
ALTER TABLE matrix_steps ADD COLUMN diagrams JSONB NOT NULL DEFAULT '[]';
ALTER TABLE matrix_steps ADD COLUMN source TEXT NOT NULL DEFAULT 'blueprint' CHECK (source IN ('blueprint', 'manual'));

-- Existing steps inherit their process's diagrams, so the swimlane link is visible from day one.
UPDATE matrix_steps m SET diagrams = COALESCE((SELECT jsonb_agg(pd.diagram_id ORDER BY pd.diagram_id) FROM process_diagrams pd WHERE pd.process_id = m.process_id), '[]');

-- A process added in the app starts as "Not assessed" against the vendor SOW.
ALTER TABLE sow_gaps DROP CONSTRAINT sow_gaps_rating_check;
ALTER TABLE sow_gaps ADD CONSTRAINT sow_gaps_rating_check CHECK (rating IN ('Covered', 'Partial', 'Not covered', 'Not assessed'));
CREATE TRIGGER audit_truncate AFTER TRUNCATE ON process_diagrams FOR EACH STATEMENT EXECUTE FUNCTION audit_truncate();
