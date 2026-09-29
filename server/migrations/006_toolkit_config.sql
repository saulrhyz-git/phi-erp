-- 006: Toolkit configuration lives in the database so the Project Manager can change it in the app:
-- register definitions (columns, pick-lists, how-to text, sign-off forms), schedule phases,
-- domains and the guide page. Defaults are loaded from server/src/lib/registers.json on first start.
CREATE TABLE tk_registers (
  key TEXT PRIMARY KEY,
  def JSONB NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INT REFERENCES users(id) ON DELETE SET NULL
);
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON tk_registers FOR EACH ROW EXECUTE FUNCTION audit_row('key');
CREATE TRIGGER audit_truncate AFTER TRUNCATE ON tk_registers FOR EACH STATEMENT EXECUTE FUNCTION audit_truncate();

-- Change counter so every server instance notices configuration edits. Not audited: the edits
-- themselves are (tk_registers, tk_settings, domains).
CREATE TABLE tk_registry_version (id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1), version INT NOT NULL DEFAULT 1);
INSERT INTO tk_registry_version(id, version) VALUES (1, 1);
