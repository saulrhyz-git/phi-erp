-- 008: Document files can live in SharePoint / OneDrive instead of the database.
-- storage = 'db'         -> bytes in document_files.data (previous behaviour)
-- storage = 'sharepoint' -> bytes in SharePoint; data is NULL and sp_* locate the file and its version
ALTER TABLE document_files ALTER COLUMN data DROP NOT NULL;
ALTER TABLE document_files ADD COLUMN storage TEXT NOT NULL DEFAULT 'db' CHECK (storage IN ('db', 'sharepoint'));
ALTER TABLE document_files ADD COLUMN sp_drive_id TEXT;
ALTER TABLE document_files ADD COLUMN sp_item_id TEXT;
ALTER TABLE document_files ADD COLUMN sp_version_id TEXT;
ALTER TABLE document_files ADD COLUMN sp_web_url TEXT;
ALTER TABLE document_files ADD CONSTRAINT document_files_has_content
  CHECK ((storage = 'db' AND data IS NOT NULL) OR (storage = 'sharepoint' AND sp_item_id IS NOT NULL));
CREATE INDEX document_files_sp_item ON document_files(sp_item_id) WHERE sp_item_id IS NOT NULL;
ALTER TABLE document_files ADD COLUMN sp_etag TEXT;   -- detects edits made directly in SharePoint
