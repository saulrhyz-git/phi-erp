-- New 'status' action: lets team members move toolkit records along (Not Started → In Progress → Complete)
-- in their own domain(s) and on shared project-wide records, without full edit rights.
-- Process Owner gets 'own'; other custom roles are left as they are (edit them on the Roles page).
UPDATE roles
   SET permissions = jsonb_set(
         CASE WHEN permissions ? 'group:toolkit' THEN permissions ELSE permissions || '{"group:toolkit": {}}'::jsonb END,
         '{group:toolkit,status}', '"own"', true)
 WHERE NOT is_system AND name = 'Process Owner';

-- Tasks: an empty status is treated as Not Started.
UPDATE tk_tasks SET status = 'Not Started' WHERE status = '' AND type IN ('Task', 'Milestone');
