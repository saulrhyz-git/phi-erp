import { useState } from 'react';
import { api, fmtDate } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { Comments, ErrorNote, ITEM_STATUS, Loading, Modal, SheetHead, Status } from '../components/ui.jsx';

const BLANK = { title: '', detail: '', owner: '', decision: '', target_date: '', status: 'open' };

export default function OpenItems() {
  const { can } = useAuth();
  const canAdd = can('open_items', 'add'); const isEditor = can('open_items', 'edit'); const canDelete = can('open_items', 'delete');
  const { data, error, loading, reload } = useApi('/open-items');
  const [filter, setFilter] = useState('active');
  const [editing, setEditing] = useState(null); // item or BLANK for new
  const [thread, setThread] = useState(null);
  const [err, setErr] = useState(null);

  const save = async () => {
    try {
      const body = { ...editing, target_date: editing.target_date || null };
      delete body.id; delete body.code; delete body.sort; delete body.updated_at; delete body.updated_by; delete body.updated_by_name; delete body.comment_count;
      if (editing.id) await api(`/open-items/${editing.id}`, { method: 'PUT', body });
      else await api('/open-items', { method: 'POST', body });
      setEditing(null); setErr(null); reload();
    } catch (e) { setErr(e); }
  };
  const del = async (it) => {
    if (!window.confirm(`Delete ${it.code}? This can't be undone.`)) return;
    await api(`/open-items/${it.id}`, { method: 'DELETE' }); reload();
  };
  const rows = (data || []).filter((i) => filter === 'all' || (filter === 'active' ? i.status !== 'closed' : i.status === filter));
  const f = (k) => ({ value: editing?.[k] ?? '', onChange: (e) => setEditing({ ...editing, [k]: e.target.value }) });

  return (
    <section className="sheet">
      <SheetHead code="S-5" title="Open items" actions={canAdd && <button className="btn primary" onClick={() => { setErr(null); setEditing({ ...BLANK }); }}>Add open item</button>}>
        Decisions process owners need to close before BRD sign-off.
      </SheetHead>
      <div className="toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Show">
          <option value="active">Open and in progress</option><option value="all">All</option>
          {Object.entries(ITEM_STATUS).map(([k, v]) => <option key={k} value={k}>{v} only</option>)}
        </select>
      </div>
      <ErrorNote error={error} />
      {loading && !data ? <Loading /> : (
        <div className="tablewrap">
          <table className="t" style={{ minWidth: 960 }}>
            <thead><tr><th>#</th><th>Item</th><th>Owner</th><th>Decision</th><th>Target</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="empty">Nothing here. Change the filter to see closed items.</td></tr>}
              {rows.map((it) => (
                <tr key={it.id}>
                  <td className="ref">{it.code}</td>
                  <td className="w-lg"><b>{it.title}</b><div className="small muted">{it.detail}</div></td>
                  <td>{it.owner || <span className="muted">Unassigned</span>}</td>
                  <td className="w-lg">{it.decision || <span className="muted">—</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(it.target_date)}</td>
                  <td><Status s={it.status} labels={ITEM_STATUS} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm ghost" onClick={() => setThread(it)}>Discuss{it.comment_count ? ` (${it.comment_count})` : ''}</button>{' '}
                    {isEditor && <button className="btn sm ghost" onClick={() => { setErr(null); setEditing({ ...it, target_date: it.target_date || '' }); }}>Edit</button>}{' '}
                    {canDelete && <button className="btn sm danger" onClick={() => del(it)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!editing} title={editing?.id ? `Edit ${editing.code}` : 'Add open item'} onClose={() => setEditing(null)}
        footer={<><button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button><button className="btn primary" onClick={save}>{editing?.id ? 'Save changes' : 'Add item'}</button></>}>
        {editing && (
          <>
            <ErrorNote error={err} />
            <label className="field"><span>Item</span><input type="text" {...f('title')} /></label>
            <label className="field"><span>Detail</span><textarea {...f('detail')} /></label>
            <div className="grid2">
              <label className="field"><span>Owner</span><input type="text" {...f('owner')} /></label>
              <label className="field"><span>Target date</span><input type="date" {...f('target_date')} /></label>
            </div>
            <label className="field"><span>Decision</span><textarea {...f('decision')} /></label>
            <label className="field"><span>Status</span><select {...f('status')}>{Object.entries(ITEM_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          </>
        )}
      </Modal>
      <Modal open={!!thread} title={thread ? `${thread.code}: ${thread.title}` : ''} onClose={() => { setThread(null); reload(); }}
        footer={<button className="btn" onClick={() => { setThread(null); reload(); }}>Close</button>}>
        {thread && <Comments type="open_item" id={thread.id} />}
      </Modal>
    </section>
  );
}
