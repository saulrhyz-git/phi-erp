import { Router } from 'express';
import { q } from '../db/pool.js';

const r = Router();

r.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const before = req.query.before ? Number(req.query.before) : null;
  const { rows } = await q(
    `SELECT a.*, u.name AS user_name FROM activity_log a LEFT JOIN users u ON u.id=a.user_id
      ${before ? 'WHERE a.id < $2' : ''} ORDER BY a.id DESC LIMIT $1`, before ? [limit, before] : [limit]);
  res.json(rows);
});

export default r;
