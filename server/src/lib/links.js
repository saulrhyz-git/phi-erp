// Keeps a process tied to everything else: swimlane diagrams, re-engineering opportunities and
// SOW scope items. Re-engineering and SOW items store their processes as a comma list ("04, 07").
const splitRefs = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const joinRefs = (a) => a.join(', ');

export async function currentLinks(c, processId) {
  const [d, re, items] = await Promise.all([
    c.query('SELECT diagram_id FROM process_diagrams WHERE process_id=$1 ORDER BY diagram_id', [processId]),
    c.query(`SELECT id FROM reengineering WHERE $1 = ANY(string_to_array(replace(process_refs,' ',''), ',')) ORDER BY sort`, [processId]),
    c.query(`SELECT no FROM sow_items WHERE $1 = ANY(string_to_array(replace(process_refs,' ',''), ',')) ORDER BY no`, [processId]),
  ]);
  return { diagrams: d.rows.map((x) => x.diagram_id), reengineering: re.rows.map((x) => x.id), sow_items: items.rows.map((x) => x.no) };
}

async function setRefList(c, table, keyCol, keys, processId, wanted) {
  const { rows } = await c.query(`SELECT ${keyCol} AS k, process_refs FROM ${table}`);
  for (const row of rows) {
    if (row.process_refs === 'All') continue;              // already covers every process
    const refs = splitRefs(row.process_refs);
    const has = refs.includes(processId);
    const want = wanted.has(String(row.k));
    if (want && !has) await c.query(`UPDATE ${table} SET process_refs=$1 WHERE ${keyCol}=$2`, [joinRefs([...refs, processId]), row.k]);
    if (!want && has) await c.query(`UPDATE ${table} SET process_refs=$1 WHERE ${keyCol}=$2`, [joinRefs(refs.filter((x) => x !== processId)), row.k]);
  }
}

// links: { diagrams?: string[], reengineering?: string[], sow_items?: number[] } — only given lists change.
export async function setProcessLinks(c, processId, links) {
  if (links.diagrams) {
    await c.query('DELETE FROM process_diagrams WHERE process_id=$1 AND NOT (diagram_id = ANY($2::text[]))', [processId, links.diagrams]);
    for (const d of links.diagrams) await c.query('INSERT INTO process_diagrams(process_id, diagram_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [processId, d]);
  }
  if (links.reengineering) await setRefList(c, 'reengineering', 'id', null, processId, new Set(links.reengineering));
  if (links.sow_items) await setRefList(c, 'sow_items', 'no', null, processId, new Set(links.sow_items.map(String)));
}

export async function assertLinkTargets(c, { diagrams = [], reengineering = [], sow_items: items = [] }) {
  const bad = (m) => { const e = new Error(m); e.status = 400; return e; };
  if (diagrams.length) {
    const r = await c.query('SELECT count(*)::int AS n FROM diagrams WHERE id = ANY($1::text[])', [diagrams]);
    if (r.rows[0].n !== new Set(diagrams).size) throw bad('One of the selected diagrams does not exist.');
  }
  if (reengineering.length) {
    const r = await c.query('SELECT count(*)::int AS n FROM reengineering WHERE id = ANY($1::text[])', [reengineering]);
    if (r.rows[0].n !== new Set(reengineering).size) throw bad('One of the selected re-engineering opportunities does not exist.');
  }
  if (items.length) {
    const r = await c.query('SELECT count(*)::int AS n FROM sow_items WHERE no = ANY($1::int[])', [items]);
    if (r.rows[0].n !== new Set(items).size) throw bad('One of the selected SOW items does not exist.');
  }
}
