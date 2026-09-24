import { useEffect, useState } from 'react';
import { Modal, ErrorNote } from './ui.jsx';

// fields: [{ key, label, type: 'text'|'textarea'|'select'|'date'|'number', options }]
export default function EditModal({ open, title, record, fields, onClose, onSave }) {
  const [form, setForm] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  // Load the record into the form each time the dialog opens (not on every render).
  useEffect(() => { if (open && record) { setForm(Object.fromEntries(fields.map((f) => [f.key, record[f.key] ?? '']))); setErr(null); } }, [open]); // eslint-disable-line
  const save = async () => {
    setBusy(true);
    try {
      const body = Object.fromEntries(fields.map((f) => {
        let v = form[f.key];
        if (f.type === 'number') v = v === '' || v === null ? null : Number(v);
        if (f.type === 'date') v = v || null;
        return [f.key, v];
      }));
      await onSave(body);
      onClose();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} title={title} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>Save</button></>}>
      <ErrorNote error={err} />
      {fields.map((f) => {
        const p = { value: form[f.key] ?? '', onChange: (e) => setForm({ ...form, [f.key]: e.target.value }) };
        return (
          <label className="field" key={f.key}><span>{f.label}</span>
            {f.type === 'textarea' ? <textarea {...p} /> :
              f.type === 'select' ? <select {...p}>{f.options.map((o) => <option key={o} value={o}>{o || '—'}</option>)}</select> :
                <input type={f.type === 'number' ? 'text' : (f.type || 'text')} inputMode={f.type === 'number' ? 'decimal' : undefined} {...p} />}
          </label>
        );
      })}
    </Modal>
  );
}
