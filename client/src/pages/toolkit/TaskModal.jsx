import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Comments, ErrorNote, Modal } from '../../components/ui.jsx';
import { addDays, fmtD } from '../../schedule.js';
import { DomainTag, allowedDomains } from './common.jsx';

export const STATUSES = ['Not Started', 'In Progress', 'Complete', 'At Risk', 'Blocked'];
const TYPES = ['Task', 'Milestone', 'Workstream', 'Blackout'];
const BLANK = { code: '', phase: '', name: '', type: 'Task', owner: '', domain_id: '', anchor: 'BRD', offset_days: 0, duration_days: 5, use_hypercare: false, notes: '', status: 'Not Started' };

export default function TaskModal({ task, meta, settings, onClose, onSaved }) {
  const { user, can, level } = useAuth();
  const isNew = task && !task.id;
  const [f, setF] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { if (task) { setF({ ...BLANK, phase: meta.phases[0].code, ...task, domain_id: task.domain_id || '' }); setErr(null); } }, [task]); // eslint-disable-line
  if (!task || !f) return <Modal open={false} onClose={onClose} />;
  const editable = isNew ? can('schedule', 'add') : can('schedule', 'edit', { domain: task.domain_id });
  const statusOnly = !isNew && !editable && can('schedule', 'status', { domain: task.domain_id });
  const doms = allowedDomains(user, level('schedule', isNew ? 'add' : 'edit'), meta.domains);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const start = settings ? addDays(settings.anchors[f.anchor], Number(f.offset_days) || 0) : '';
  const dur = f.type === 'Milestone' ? 0 : f.use_hypercare ? settings?.hypercare_days : Number(f.duration_days) || 0;
  const end = start && (dur ? addDays(start, dur - 1) : start);

  const save = async () => {
    try {
      if (statusOnly) { await api(`/toolkit/tasks/${task.id}`, { method: 'PUT', body: { status: f.status } }); onSaved(); return; }
      const body = { ...f, offset_days: Number(f.offset_days), duration_days: Number(f.duration_days), domain_id: f.domain_id || null };
      ['id', 'sort', 'updated_at', 'updated_by', 'updated_by_name', 'domain_name', 'comment_count', 'start', 'end', 'duration', 'weeks'].forEach((k) => delete body[k]);
      if (isNew) await api('/toolkit/tasks', { method: 'POST', body });
      else await api(`/toolkit/tasks/${task.id}`, { method: 'PUT', body });
      onSaved();
    } catch (e) { setErr(e); }
  };
  const del = async () => {
    if (!window.confirm(`Delete ${task.code} ${task.name}?`)) return;
    try { await api(`/toolkit/tasks/${task.id}`, { method: 'DELETE' }); onSaved(); } catch (e) { setErr(e); }
  };
  const p = (k) => ({ value: f[k] ?? '', onChange: set(k), disabled: !editable });

  return (
    <Modal wide open title={isNew ? 'Add schedule item' : `${task.code} · ${task.name}`} onClose={onClose}
      footer={<>
        {!isNew && can('schedule', 'delete', { domain: task.domain_id }) && <button className="btn danger" onClick={del}>Delete</button>}
        <span style={{ flex: 1 }} />
        <button className="btn ghost" onClick={onClose}>{editable || statusOnly ? 'Cancel' : 'Close'}</button>
        {(editable || statusOnly) && <button className="btn primary" onClick={save}>{isNew ? 'Add' : statusOnly ? 'Update status' : 'Save changes'}</button>}
      </>}>
      <ErrorNote error={err} />
      {!editable && (statusOnly
        ? <div className="notice">You can update the status of this {task.domain_id ? `${task.domain_id}` : 'project-wide'} item. Other fields are read-only for your role.</div>
        : <div className="notice">Read-only for your role{task.domain_id ? ` (this item belongs to ${task.domain_id})` : ' (project-wide item)'}.</div>)}
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div><b>{fmtD(start)}</b><span>Start</span></div>
        <div><b>{fmtD(end)}</b><span>End</span></div>
        <div><b>{dur ? `${dur} d · ${Math.round(dur / 7 * 10) / 10} wk` : 'Milestone'}</b><span>Duration</span></div>
      </div>
      <div className="grid2">
        <label className="field"><span>ID</span><input type="text" {...p('code')} /></label>
        <label className="field"><span>Phase</span><select {...p('phase')}>{meta.phases.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}</select></label>
        <label className="field" style={{ gridColumn: '1/-1' }}><span>Task / milestone</span><input type="text" {...p('name')} /></label>
        <label className="field"><span>Type</span><select {...p('type')}>{TYPES.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="field"><span>Status</span><select {...p('status')} disabled={!editable && !statusOnly}><option value="">—</option>{STATUSES.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="field"><span>Owner</span><input type="text" {...p('owner')} /></label>
        <label className="field"><span>Domain</span>
          {editable ? <select {...p('domain_id')}>{doms.map((d) => <option key={d.id} value={d.id}>{d.id ? `${d.id} — ${d.name}` : d.name}</option>)}</select> : <div><DomainTag id={task.domain_id} user={user} /></div>}
        </label>
        <label className="field"><span>Anchored to</span>
          <select {...p('anchor')}><option value="PRE">PRE — pre-work start</option><option value="BRD">BRD — BRD kickoff</option><option value="GL">GL — Go-Live</option></select></label>
        <label className="field"><span>Offset from anchor (days, can be negative)</span><input type="text" inputMode="numeric" {...p('offset_days')} /></label>
        <label className="field"><span>Duration (calendar days)</span><input type="text" inputMode="numeric" {...p('duration_days')} disabled={!editable || f.type === 'Milestone' || f.use_hypercare} /></label>
        <label className="row small" style={{ alignSelf: 'center' }}><input type="checkbox" checked={!!f.use_hypercare} onChange={set('use_hypercare')} disabled={!editable} /> Use hypercare length from Key dates</label>
        <label className="field" style={{ gridColumn: '1/-1' }}><span>Deliverable / notes</span><textarea {...p('notes')} /></label>
      </div>
      {!isNew && <Comments type="tk_task" id={task.id} />}
    </Modal>
  );
}
