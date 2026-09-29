import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useApi } from '../hooks.js';
import { ErrorNote, Modal } from './ui.jsx';
import LinkPicker, { toOptions } from './LinkPicker.jsx';

const lines = (t) => t.split('\n').map((x) => x.trim()).filter(Boolean);

// Add a process to the world map (Project Manager / Superadmin).
export function AddProcessModal({ open, onClose, defaultStage }) {
  const nav = useNavigate();
  const { data: opts } = useApi(open ? '/processes/options' : null);
  const [f, setF] = useState({ id: '', name: '', stage_id: defaultStage ?? '', group_id: '', domain_id: '', owner_dept: '', fit: 'Configure', odoo_home: '',
    customers: '', outputs: '', diagrams: [], reengineering: [], sow_items: [] });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const o = toOptions(opts);
  const save = async () => {
    setBusy(true);
    try {
      const r = await api('/processes', { method: 'POST', body: {
        id: f.id, name: f.name, group_id: f.group_id || opts?.groups[0]?.id, stage_id: f.stage_id === '' ? null : Number(f.stage_id),
        domain_id: f.domain_id || null, owner_dept: f.owner_dept, fit: f.fit, odoo_home: f.odoo_home,
        customers: lines(f.customers), outputs: lines(f.outputs), diagrams: f.diagrams, reengineering: f.reengineering, sow_items: f.sow_items,
      } });
      onClose(); nav(`/processes/${r.id}`);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} title="Add a process to the world map" onClose={onClose} wide
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy || !opts}>{busy ? 'Adding…' : 'Add process'}</button></>}>
      {opts && (
        <>
          <ErrorNote error={err} />
          <p className="small muted" style={{ marginTop: 0 }}>Start with who the process serves and what they receive — you can fill in the full COPIS and hand-off steps on the process page next.</p>
          <div className="grid2">
            <label className="field"><span>Process ID (e.g. 20 or X3)</span><input type="text" value={f.id} onChange={(e) => setF({ ...f, id: e.target.value.toUpperCase() })} maxLength={4} /></label>
            <label className="field"><span>Process name</span><input type="text" value={f.name} onChange={set('name')} /></label>
            <label className="field"><span>Value-chain stage</span>
              <select value={f.stage_id} onChange={set('stage_id')}><option value="">Cross-cutting (below the stages)</option>{opts.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label className="field"><span>Colour group</span>
              <select value={f.group_id || opts.groups[0]?.id} onChange={set('group_id')}>{opts.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
            <label className="field"><span>Domain (its domain owners can edit the COPIS and add hand-off steps)</span>
              <select value={f.domain_id} onChange={set('domain_id')}><option value="">No domain — Project Manager only</option>{opts.domains.map((d) => <option key={d.id} value={d.id}>{d.id} · {d.name}</option>)}</select></label>
            <label className="field"><span>Accountable owner (department)</span><input type="text" value={f.owner_dept} onChange={set('owner_dept')} /></label>
            <label className="field"><span>Customers — one per line</span><textarea value={f.customers} onChange={set('customers')} style={{ minHeight: 70 }} /></label>
            <label className="field"><span>Outputs — one per line</span><textarea value={f.outputs} onChange={set('outputs')} style={{ minHeight: 70 }} /></label>
            <label className="field"><span>Fit with Odoo 19</span><select value={f.fit} onChange={set('fit')}>{['Standard', 'Configure', 'Extend'].map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="field"><span>Indicative Odoo 19 home</span><input type="text" value={f.odoo_home} onChange={set('odoo_home')} /></label>
          </div>
          <h4 style={{ margin: '6px 0 8px' }}>Map it to the rest of the blueprint</h4>
          <div className="linkgrid">
            <LinkPicker label="Swimlane diagrams" options={o.diagrams} value={f.diagrams} onChange={(v) => setF({ ...f, diagrams: v })} />
            <LinkPicker label="Re-engineering opportunities" options={o.reengineering} value={f.reengineering} onChange={(v) => setF({ ...f, reengineering: v })} />
            <LinkPicker label="AWB SOW items" options={o.sow_items} value={f.sow_items} onChange={(v) => setF({ ...f, sow_items: v })} />
          </div>
          <p className="small muted">The process also gets a “Not assessed” row in the SOW gap analysis, and appears in the COPIS list, data matrix and Excel export.</p>
        </>
      )}
    </Modal>
  );
}

// Hand-off step add/edit form, including its links.
export function StepModal({ open, onClose, processId, step, onSaved }) {
  const { data: opts } = useApi(open ? '/processes/options' : null);
  const blank = { ref: '', step: '', trigger_event: '', data_fields: '', handoff: '', exceptions: '', fit: 'Configure', sow_items: [], reengineering: [], diagrams: [] };
  const [f, setF] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setErr(null); setF(open ? (step ? { ...blank, ...step } : blank) : null); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const o = toOptions(opts);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      const body = { step: f.step, trigger_event: f.trigger_event, data_fields: f.data_fields, handoff: f.handoff, exceptions: f.exceptions, fit: f.fit,
        sow_items: f.sow_items, reengineering: f.reengineering, diagrams: f.diagrams, ...(f.ref ? { ref: f.ref } : {}) };
      if (step) await api(`/matrix/${step.id}`, { method: 'PUT', body });
      else await api('/matrix', { method: 'POST', body: { ...body, process_id: processId } });
      onClose(); onSaved();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} title={step ? `Edit hand-off step ${step.ref}` : 'Add a hand-off step'} onClose={onClose} wide
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy || !opts}>{busy ? 'Saving…' : step ? 'Save step' : 'Add step'}</button></>}>
      {f && opts && (
        <>
          <ErrorNote error={err} />
          <div className="grid2">
            <label className="field"><span>Step</span><input type="text" value={f.step} onChange={set('step')} placeholder="e.g. Issue official receipt for reservation fee" /></label>
            <div className="grid2" style={{ gap: 12 }}>
              <label className="field"><span>Ref {step ? '' : '(blank = next number)'}</span><input type="text" value={f.ref} onChange={set('ref')} placeholder={`${processId}.n`} /></label>
              <label className="field"><span>Fit</span><select value={f.fit} onChange={set('fit')}>{['Standard', 'Configure', 'Extend'].map((x) => <option key={x}>{x}</option>)}</select></label>
            </div>
            <label className="field"><span>a. Trigger event</span><textarea value={f.trigger_event} onChange={set('trigger_event')} style={{ minHeight: 60 }} /></label>
            <label className="field"><span>b. Inputs & data fields</span><textarea value={f.data_fields} onChange={set('data_fields')} style={{ minHeight: 60 }} /></label>
            <label className="field"><span>c. System hand-off</span><textarea value={f.handoff} onChange={set('handoff')} style={{ minHeight: 60 }} /></label>
            <label className="field"><span>d. Exceptions / edge cases</span><textarea value={f.exceptions} onChange={set('exceptions')} style={{ minHeight: 60 }} /></label>
          </div>
          <h4 style={{ margin: '6px 0 8px' }}>Map this step</h4>
          <div className="linkgrid">
            <LinkPicker label="Swimlane diagrams" options={o.diagrams} value={f.diagrams} onChange={(v) => setF({ ...f, diagrams: v })} />
            <LinkPicker label="Re-engineering opportunities" options={o.reengineering} value={f.reengineering} onChange={(v) => setF({ ...f, reengineering: v })} />
            <LinkPicker label="AWB SOW items" options={o.sow_items} value={f.sow_items} onChange={(v) => setF({ ...f, sow_items: v })} />
          </div>
        </>
      )}
    </Modal>
  );
}

// Process placement (PM) and mapping (PM or its domain owners).
export function MappingPanel({ p, canManage, canEdit, onSaved }) {
  const { data: opts } = useApi('/processes/options');
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState(null);
  const o = toOptions(opts);
  const start = () => { setMsg(null); setF({ stage_id: p.stage_id ?? '', group_id: p.group_id, domain_id: p.domain_id || '', ...p.links }); };
  const save = async () => {
    try {
      const body = { diagrams: f.diagrams, reengineering: f.reengineering, sow_items: f.sow_items };
      if (canManage) Object.assign(body, { stage_id: f.stage_id === '' ? null : Number(f.stage_id), group_id: f.group_id, domain_id: f.domain_id || null });
      await api(`/processes/${p.id}`, { method: 'PUT', body });
      setF(null); setMsg({ type: 'ok', text: 'Mapping saved.' }); onSaved();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
  };
  if (!f) {
    return (
      <>
        {msg && <div className={`notice ${msg.type}`}>{msg.text}</div>}
        {(canEdit || canManage) && <button className="btn sm" onClick={start}>Edit placement & mapping</button>}
      </>
    );
  }
  return (
    <div className="creq-edit" style={{ margin: '10px 0 16px' }}>
      {msg && <div className={`notice ${msg.type}`}>{msg.text}</div>}
      {opts && (
        <>
          <div className="grid2">
            <label className="field"><span>Value-chain stage</span>
              <select value={f.stage_id} disabled={!canManage} onChange={(e) => setF({ ...f, stage_id: e.target.value })}>
                <option value="">Cross-cutting</option>{opts.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label className="field"><span>Colour group</span>
              <select value={f.group_id} disabled={!canManage} onChange={(e) => setF({ ...f, group_id: e.target.value })}>{opts.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
            <label className="field"><span>Domain {canManage ? '' : '(set by the Project Manager)'}</span>
              <select value={f.domain_id} disabled={!canManage} onChange={(e) => setF({ ...f, domain_id: e.target.value })}>
                <option value="">No domain</option>{opts.domains.map((d) => <option key={d.id} value={d.id}>{d.id} · {d.name}</option>)}</select></label>
          </div>
          <div className="linkgrid">
            <LinkPicker label="Swimlane diagrams" options={o.diagrams} value={f.diagrams} onChange={(v) => setF({ ...f, diagrams: v })} />
            <LinkPicker label="Re-engineering opportunities" options={o.reengineering} value={f.reengineering} onChange={(v) => setF({ ...f, reengineering: v })} />
            <LinkPicker label="AWB SOW items" options={o.sow_items} value={f.sow_items} onChange={(v) => setF({ ...f, sow_items: v })} />
          </div>
          <div className="row" style={{ marginTop: 10 }}><span style={{ flex: 1 }} />
            <button className="btn ghost" onClick={() => setF(null)}>Cancel</button><button className="btn primary" onClick={save}>Save mapping</button></div>
        </>
      )}
    </div>
  );
}
