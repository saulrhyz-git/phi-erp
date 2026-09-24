import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { Comments, ErrorNote, Fit, Loading, SheetHead, Status, STATUS_LABEL } from '../components/ui.jsx';

const SIPOC = [['suppliers', 'S', 'Suppliers'], ['inputs', 'I', 'Inputs'], ['steps', 'P', 'Process'], ['outputs', 'O', 'Outputs'], ['customers', 'C', 'Customers']];
const toText = (a) => (a || []).join('\n');
const toList = (t) => t.split('\n').map((s) => s.trim()).filter(Boolean);

function StepCard({ s, color, canEdit, onSaved }) {
  const [status, setStatus] = useState(s.validation_status);
  const [comment, setComment] = useState(s.validation_comment);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(s);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setStatus(s.validation_status); setComment(s.validation_comment); setForm(s); }, [s]);

  const validate = async () => {
    setBusy(true);
    try { await api(`/matrix/${s.id}/validate`, { method: 'POST', body: { status, comment } }); setMsg(null); onSaved(); }
    catch (e) { setMsg(e); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true);
    try {
      const { step, trigger_event, data_fields, handoff, exceptions, fit } = form;
      await api(`/matrix/${s.id}`, { method: 'PUT', body: { step, trigger_event, data_fields, handoff, exceptions, fit } });
      setEditing(false); setMsg(null); onSaved();
    } catch (e) { setMsg(e); } finally { setBusy(false); }
  };
  const f = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <article className="step" id={`step-${s.ref}`} style={{ '--c': `var(--${color})` }}>
      <header>
        <span className="ref">{s.ref}</span>
        {editing ? <input type="text" {...f('step')} style={{ maxWidth: 360 }} /> : <b>{s.step}</b>}
        <span className="right">
          {editing ? (
            <select {...f('fit')} style={{ width: 'auto' }}>{['Standard', 'Configure', 'Extend'].map((x) => <option key={x}>{x}</option>)}</select>
          ) : <Fit fit={s.fit} />}
          <Status s={s.validation_status} />
          {canEdit && !editing && <button className="btn sm ghost" onClick={() => setEditing(true)}>Edit step</button>}
        </span>
      </header>
      <div className="cols">
        {[['trigger_event', 'a. Trigger event'], ['data_fields', 'b. Inputs & data fields'], ['handoff', 'c. System hand-off'], ['exceptions', 'd. Exceptions / edge cases']].map(([k, label]) => (
          <div key={k}><h5>{label}</h5>{editing ? <textarea {...f(k)} /> : s[k]}</div>
        ))}
      </div>
      {editing && (
        <div className="validate" style={{ gridTemplateColumns: '1fr auto' }}>
          <span className="muted small">Content edits are logged. Validation status is kept.</span>
          <span className="row">
            <button className="btn ghost" onClick={() => { setEditing(false); setForm(s); }}>Cancel</button>
            <button className="btn primary" onClick={save} disabled={busy}>Save step</button>
          </span>
        </div>
      )}
      {canEdit && !editing ? (
        <div className="validate">
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Validation status">
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Validation comment"
            placeholder={status === 'approved' ? 'Optional note' : 'What needs to change?'} />
          <button className="btn primary" onClick={validate} disabled={busy}>Save validation</button>
          {msg && <div className="notice error" style={{ gridColumn: '1/-1', margin: 0 }}>{msg.message}</div>}
          {s.validated_at && <div className="muted small" style={{ gridColumn: '1/-1' }}>Last set by {s.validated_by_name} · {fmtDateTime(s.validated_at)}</div>}
        </div>
      ) : (!editing && s.validation_comment) ? (
        <div className="validate" style={{ display: 'block' }}>
          <span className="small"><b>{s.validated_by_name}:</b> {s.validation_comment}</span>
        </div>
      ) : null}
    </article>
  );
}

export default function ProcessDetail() {
  const { id } = useParams();
  const { canEditProcess } = useAuth();
  const { data: p, error, loading, reload } = useApi(`/processes/${id}`);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saveErr, setSaveErr] = useState(null);
  const canEdit = canEditProcess(id);

  const startEdit = () => {
    setForm({ name: p.name, owner_dept: p.owner_dept, odoo_home: p.odoo_home, fit: p.fit,
      ...Object.fromEntries(SIPOC.map(([k]) => [k, toText(p[k])])) });
    setEditing(true);
  };
  const save = async () => {
    try {
      const body = { name: form.name, owner_dept: form.owner_dept, odoo_home: form.odoo_home, fit: form.fit,
        ...Object.fromEntries(SIPOC.map(([k]) => [k, toList(form[k])])) };
      await api(`/processes/${id}`, { method: 'PUT', body });
      setEditing(false); setSaveErr(null); reload();
    } catch (e) { setSaveErr(e); }
  };

  if (loading && !p) return <div className="sheet"><Loading /></div>;
  if (error) return <div className="sheet"><ErrorNote error={error} /></div>;
  const f = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <>
      <section className="sheet" style={{ borderLeft: `8px solid var(--${p.color})` }}>
        <SheetHead code={p.id} title={editing ? 'Edit process' : p.name}
          actions={canEdit && !editing ? <button className="btn" onClick={startEdit}>Edit SIPOC</button> : null}>
          {p.group_name} · {p.stage_name || 'Cross-cutting'}{p.from_reference ? ' · numbered in reference flow' : ''}
        </SheetHead>
        <ErrorNote error={saveErr} />
        {editing ? (
          <div className="grid2">
            <label className="field"><span>Process name</span><input type="text" {...f('name')} /></label>
            <label className="field"><span>Accountable owner (department)</span><input type="text" {...f('owner_dept')} /></label>
            <label className="field"><span>Indicative Odoo 19 home</span><input type="text" {...f('odoo_home')} /></label>
            <label className="field"><span>Fit</span><select {...f('fit')}>{['Standard', 'Configure', 'Extend'].map((x) => <option key={x}>{x}</option>)}</select></label>
          </div>
        ) : (
          <dl className="kv">
            <dt>Accountable owner</dt><dd>{p.owner_dept}</dd>
            <dt>Assigned owners</dt><dd>{p.owners.length ? p.owners.map((o) => o.name).join(', ') : <span className="muted">None yet — an admin assigns them under Users</span>}</dd>
            <dt>Indicative Odoo 19 home</dt><dd>{p.odoo_home}</dd>
            <dt>Fit</dt><dd><Fit fit={p.fit} /></dd>
            {p.diagrams.length > 0 && <><dt>Swimlanes</dt><dd>{p.diagrams.map((d, i) => <span key={d.id}>{i > 0 && ' · '}<Link to={`/diagrams/${d.id}`}>{d.id}. {d.title}</Link></span>)}</dd></>}
            <dt>Last updated</dt><dd>{fmtDateTime(p.updated_at)}{p.updated_by_name && ` by ${p.updated_by_name}`}</dd>
          </dl>
        )}
        <div className="sgrid">
          {SIPOC.map(([k, letter, label]) => (
            <div key={k}>
              <h4><em>{letter}</em>{label}</h4>
              {editing ? <textarea {...f(k)} aria-label={`${label}, one per line`} /> :
                k === 'steps' ? <ol>{p[k].map((x, i) => <li key={i}>{x}</li>)}</ol> : <ul>{p[k].map((x, i) => <li key={i}>{x}</li>)}</ul>}
            </div>
          ))}
        </div>
        {editing && (
          <div className="row" style={{ marginTop: 12 }}>
            <span className="muted small">One item per line.</span>
            <span style={{ flex: 1 }} />
            <button className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn primary" onClick={save}>Save SIPOC</button>
          </div>
        )}
      </section>
      <section className="sheet">
        <h3 style={{ marginTop: 0 }}>Hand-off steps ({p.matrix.length})</h3>
        <p className="lede small">{canEdit
          ? 'You can validate this process. For each step, approve it, approve it with changes, or send it back for rework with a note.'
          : 'Only the admin or an assigned owner of this process can validate these steps. Use the discussion thread for questions.'}</p>
        {p.matrix.length === 0 && <div className="empty">No hand-off steps for this process yet.</div>}
        {p.matrix.map((s) => <StepCard key={s.id} s={s} color={p.color} canEdit={canEdit} onSaved={reload} />)}
        <Comments type="process" id={p.id} />
      </section>
    </>
  );
}
