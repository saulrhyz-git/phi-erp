import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { ErrorNote, Loading, SheetHead } from '../components/ui.jsx';

function EditableRow({ row, fields, canEdit, onSave, onDelete }) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState(row);
  const [err, setErr] = useState(null);
  const save = async () => {
    try { await onSave(Object.fromEntries(fields.filter((f) => f.editable !== false).map((f) => [f.key, form[f.key]]))); setEdit(false); setErr(null); }
    catch (e) { setErr(e); }
  };
  return (
    <tr>
      {fields.map((f) => (
        <td key={f.key} className={f.cls}>
          {edit && f.editable !== false
            ? <textarea value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} aria-label={f.label} style={{ minHeight: 60 }} />
            : f.bold ? <b>{row[f.key]}</b> : (row[f.key] || <span className="muted">—</span>)}
        </td>
      ))}
      <td style={{ whiteSpace: 'nowrap' }}>
        {canEdit && (edit ? (
          <>
            <button className="btn sm primary" onClick={save}>Save</button>{' '}
            <button className="btn sm ghost" onClick={() => { setEdit(false); setForm(row); }}>Cancel</button>
            {err && <div className="small" style={{ color: 'var(--bad)' }}>{err.message}</div>}
          </>
        ) : (
          <>
            <button className="btn sm ghost" onClick={() => setEdit(true)}>Edit</button>{' '}
            {onDelete && <button className="btn sm danger" onClick={onDelete}>Delete</button>}
          </>
        ))}
      </td>
    </tr>
  );
}

export default function MasterData() {
  const { can } = useAuth();
  const isAdmin = can('master_data', 'edit'); const canAddMd = can('master_data', 'add'); const isEditor = can('lot_responses', 'edit');
  const md = useApi('/master-data');
  const lot = useApi('/lot-touchpoints');
  const [newObj, setNewObj] = useState('');

  const mdFields = [
    { key: 'object', label: 'Object', bold: true, cls: 'w-md' }, { key: 'owning_process', label: 'Owning process' },
    { key: 'key_fields', label: 'Key fields', cls: 'w-lg' }, { key: 'odoo_home', label: 'Indicative Odoo home', cls: 'w-lg' }, { key: 'used_by', label: 'Used by' },
  ];
  const lotFields = [
    { key: 'process_label', label: 'Process', bold: true, cls: 'w-md', editable: isAdmin }, { key: 'effect', label: 'What it does to the Lot', cls: 'w-lg', editable: isAdmin },
    { key: 'fields_needed', label: 'Fields needed on Lot', cls: 'w-lg' }, { key: 'vendor_response', label: 'Vendor response', cls: 'w-lg' },
  ];
  const addObj = async (e) => {
    e.preventDefault();
    if (!newObj.trim()) return;
    await api('/master-data', { method: 'POST', body: { object: newObj } });
    setNewObj(''); md.reload();
  };

  return (
    <>
      <section className="sheet">
        <SheetHead code="S-4" title="Master data">
          The shared records every process reads or writes. Admins maintain this list.
        </SheetHead>
        <ErrorNote error={md.error} />
        {md.loading && !md.data ? <Loading /> : (
          <div className="tablewrap">
            <table className="t" style={{ minWidth: 900 }}>
              <thead><tr>{mdFields.map((f) => <th key={f.key}>{f.label}</th>)}<th /></tr></thead>
              <tbody>
                {md.data?.map((r) => (
                  <EditableRow key={r.id} row={r} fields={mdFields} canEdit={isAdmin}
                    onSave={async (b) => { await api(`/master-data/${r.id}`, { method: 'PUT', body: b }); md.reload(); }}
                    onDelete={async () => { if (window.confirm(`Delete ${r.object}?`)) { await api(`/master-data/${r.id}`, { method: 'DELETE' }); md.reload(); } }} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canAddMd && (
          <form className="row" style={{ marginTop: 10 }} onSubmit={addObj}>
            <input type="text" placeholder="New master data object" value={newObj} onChange={(e) => setNewObj(e.target.value)} style={{ maxWidth: 320 }} />
            <button className="btn">Add object</button>
          </form>
        )}
      </section>
      <section className="sheet">
        <SheetHead title="Lot as the master record">
          The vendor proposes the Lot as the master model — one Lot per sellable unit. Record which fields each process needs on the Lot and the vendor's answer.
        </SheetHead>
        <ErrorNote error={lot.error} />
        {lot.loading && !lot.data ? <Loading /> : (
          <div className="tablewrap">
            <table className="t" style={{ minWidth: 900 }}>
              <thead><tr>{lotFields.map((f) => <th key={f.key}>{f.label}</th>)}<th /></tr></thead>
              <tbody>
                {lot.data?.map((r) => (
                  <EditableRow key={r.id} row={r} fields={lotFields} canEdit={isEditor}
                    onSave={async (b) => { await api(`/lot-touchpoints/${r.id}`, { method: 'PUT', body: b }); lot.reload(); }} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
