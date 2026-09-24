import { Router } from 'express';
import { q } from '../db/pool.js';

const r = Router();

r.get('/meta', async (req, res) => {
  const [groups, stages] = await Promise.all([
    q('SELECT * FROM process_groups ORDER BY sort'),
    q('SELECT * FROM stages ORDER BY sort'),
  ]);
  res.json({ groups: groups.rows, stages: stages.rows });
});

r.get('/dashboard', async (req, res) => {
  const [steps, fit, items, diagrams, recent] = await Promise.all([
    q(`SELECT validation_status AS status, count(*)::int AS n FROM matrix_steps GROUP BY 1`),
    q(`SELECT g.id AS group_id, g.name, g.color, m.fit, count(*)::int AS n
         FROM matrix_steps m JOIN processes p ON p.id=m.process_id JOIN process_groups g ON g.id=p.group_id
        GROUP BY g.id, g.name, g.color, g.sort, m.fit ORDER BY g.sort`),
    q(`SELECT status, count(*)::int AS n FROM open_items GROUP BY 1`),
    q(`SELECT count(*)::int AS n, COALESCE(sum(current_version - 1),0)::int AS revisions FROM diagrams`),
    q(`SELECT a.*, u.name AS user_name FROM activity_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.at DESC LIMIT 8`),
  ]);
  const byStatus = Object.fromEntries(steps.rows.map((x) => [x.status, x.n]));
  const fitByGroup = {};
  for (const row of fit.rows) {
    fitByGroup[row.group_id] ??= { group_id: row.group_id, name: row.name, color: row.color, Standard: 0, Configure: 0, Extend: 0 };
    fitByGroup[row.group_id][row.fit] = row.n;
  }
  res.json({
    steps: { total: steps.rows.reduce((a, x) => a + x.n, 0), ...{ pending: 0, approved: 0, changes: 0, rework: 0 }, ...byStatus },
    fit: Object.values(fitByGroup),
    openItems: { open: 0, in_progress: 0, closed: 0, ...Object.fromEntries(items.rows.map((x) => [x.status, x.n])) },
    diagrams: diagrams.rows[0],
    recent: recent.rows,
  });
});

export default r;
