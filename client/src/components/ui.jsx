import { useEffect, useRef, useState } from 'react';
import { api, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';

export const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', changes: 'Approved with changes', rework: 'Needs rework' };
export const ITEM_STATUS = { open: 'Open', in_progress: 'In progress', closed: 'Closed' };

export const Fit = ({ fit }) => <span className={`fit ${fit}`}>{fit}</span>;
export const Status = ({ s, labels = STATUS_LABEL }) => <span className={`status ${s}`}>{labels[s] || s}</span>;
export const Loading = () => <div className="loading">Loading…</div>;
export const ErrorNote = ({ error }) => (error ? <div className="notice error">{error.message || String(error)}</div> : null);

export function SheetHead({ code, title, children, actions }) {
  return (
    <div className="sheet-head">
      {code && <div className="sheet-code">{code}</div>}
      <div>
        <h2>{title}</h2>
        {children && <p>{children}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Progress({ approved, flagged, total }) {
  if (!total) return null;
  return (
    <div className="bar" title={`${approved} of ${total} steps approved${flagged ? `, ${flagged} flagged` : ''}`}>
      <i className="a" style={{ width: `${(approved / total) * 100}%` }} />
      <i className="f" style={{ width: `${(flagged / total) * 100}%` }} />
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose} className={wide ? 'wide' : undefined}>
      <header>{title}</header>
      <div className="body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </dialog>
  );
}

export function Comments({ type, id }) {
  const { user, can } = useAuth();
  const [list, setList] = useState([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/comments?type=${type}&id=${encodeURIComponent(id)}`).then(setList).catch(setError);
  }, [type, id]);

  const post = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      const c = await api('/comments', { method: 'POST', body: { entity_type: type, entity_id: String(id), body } });
      setList((l) => [...l, c]);
      setBody('');
      setError(null);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const remove = async (cid) => {
    await api(`/comments/${cid}`, { method: 'DELETE' });
    setList((l) => l.filter((c) => c.id !== cid));
  };

  return (
    <section className="comments">
      <h3>Discussion</h3>
      <ErrorNote error={error} />
      {list.length === 0 && <p className="muted small">No comments yet. Use this thread for questions to the process owner or the vendor.</p>}
      {list.map((c) => (
        <div className="comment" key={c.id}>
          <span className="who">{c.user_name || 'Former user'}</span>
          <span className="when">{fmtDateTime(c.created_at)}</span>
          {(c.user_id === user.id || can('comments', 'delete')) && (
            <button className="btn sm ghost" style={{ marginLeft: 8 }} onClick={() => remove(c.id)}>Delete</button>
          )}
          <p>{c.body}</p>
        </div>
      ))}
      {can('comments', 'add') && <form onSubmit={post} style={{ marginTop: 10 }}>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment" aria-label="Add a comment" />
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn primary" disabled={busy || !body.trim()}>Post comment</button>
        </div>
      </form>}
    </section>
  );
}
