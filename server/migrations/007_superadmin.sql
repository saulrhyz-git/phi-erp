-- 007: Superadmin — full access, and the only role that can add and delete users (and grant Superadmin).
-- A custom role that happens to be called "Superadmin" is renamed so the built-in one can take the name.
UPDATE roles SET name = name || ' (custom)' WHERE lower(name) = 'superadmin' AND key IS NULL;
INSERT INTO roles(key, name, description, is_system) VALUES
  ('superadmin', 'Superadmin',
   'Full access to everything. The only role that can add and delete users, and grant or remove Superadmin.', TRUE)
ON CONFLICT (key) DO NOTHING;
UPDATE roles SET description = 'Views and edits everything, including roles and toolkit configuration. Can edit users but cannot add or delete them.'
 WHERE key = 'project_manager';

-- Assign the existing admin accounts: "scradmin" (by name or email) and "Blueprint Admin".
UPDATE users SET role_id = (SELECT id FROM roles WHERE key = 'superadmin'), active = TRUE
 WHERE lower(name) IN ('scradmin', 'blueprint admin') OR lower(split_part(email, '@', 1)) = 'scradmin';

DO $$
DECLARE n INT; who TEXT;
BEGIN
  SELECT count(*), string_agg(u.name || ' <' || u.email || '>', ', ') INTO n, who
    FROM users u JOIN roles r ON r.id = u.role_id WHERE r.key = 'superadmin';
  IF n = 0 THEN
    RAISE NOTICE 'No account named scradmin or Blueprint Admin was found. Assign one with: npm run set-role -- <email> superadmin';
  ELSE
    RAISE NOTICE 'Superadmin: %', who;
  END IF;
END $$;

-- Deleting a user keeps their history: references to them become empty instead of blocking the delete.
-- (The audit log stores the person's name and email on every entry, so attribution is never lost.)
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname, con.conrelid::regclass AS tbl, a.attname AS col
      FROM pg_constraint con
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
     WHERE con.contype = 'f' AND con.confrelid = 'users'::regclass AND con.confdeltype = 'a'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES users(id) ON DELETE SET NULL', c.tbl, c.conname, c.col);
  END LOOP;
END $$;
