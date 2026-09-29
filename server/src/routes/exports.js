import { Router } from 'express';
import ExcelJS from 'exceljs';
import archiver from 'archiver';
import { q } from '../db/pool.js';
import { auditEvent } from '../lib/util.js';

const r = Router();
const stamp = () => new Date().toISOString().slice(0, 10);
const NAVY = 'FF0F1D4A';
const bullets = (a) => (a || []).map((x) => `• ${x}`).join('\n');
const numbered = (a) => (a || []).map((x, i) => `${i + 1}. ${x}`).join('\n');
const STATUS = { pending: 'Pending', approved: 'Approved', changes: 'Approved with changes', rework: 'Needs rework' };

function addSheet(wb, name, columns, rows) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map(([header, key, width]) => ({ header, key, width }));
  ws.addRows(rows);
  ws.getRow(1).eachCell((c) => {
    c.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  ws.eachRow((row, i) => {
    if (i === 1) return;
    row.eachCell({ includeEmpty: true }, (c) => {
      c.font = { name: 'Arial', size: 10 };
      c.alignment = { vertical: 'top', wrapText: true };
    });
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

r.get('/xlsx', async (req, res) => {
  const [procs, steps, md, lot, items, reeng, gaps, obs, app] = await Promise.all([
    q(`SELECT p.*, g.name AS group_name, s.name AS stage_name,
              COALESCE((SELECT string_agg(u.name, ', ') FROM process_owners po JOIN users u ON u.id=po.user_id WHERE po.process_id=p.id),'') AS owners
         FROM processes p JOIN process_groups g ON g.id=p.group_id LEFT JOIN stages s ON s.id=p.stage_id ORDER BY p.sort`),
    q(`SELECT m.*, p.name AS process_name, u.name AS validated_by_name FROM matrix_steps m JOIN processes p ON p.id=m.process_id
         LEFT JOIN users u ON u.id=m.validated_by ORDER BY p.sort, m.sort`),
    q('SELECT * FROM master_data ORDER BY sort'),
    q('SELECT * FROM lot_touchpoints ORDER BY sort'),
    q('SELECT * FROM open_items ORDER BY sort, id'),
    q('SELECT * FROM reengineering ORDER BY sort'),
    q('SELECT * FROM sow_gaps ORDER BY sort'),
    q('SELECT * FROM sow_observations ORDER BY sort'),
    q('SELECT * FROM sow_appendix ORDER BY sort'),
  ]);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PHI Enterprise Process Blueprint';
  wb.created = new Date();

  const readme = wb.addWorksheet('README');
  readme.columns = [{ width: 24 }, { width: 110 }];
  readme.addRows([
    ['PHI Enterprise Process Blueprint — Odoo 19'],
    [],
    ['Exported', new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })],
    ['Exported by', req.user.name],
    ['Contents', 'Process Catalogue · COPIS · Data Matrix (with validation status) · Master Data · Lot Touchpoints · Open Items · Re-engineering · SOW Gap Analysis · SOW Observations · SOW Appendix A-B'],
    ['Key decisions', 'Vendor proposes the Lot as the master model. TORC = taxes and other related charges.'],
    ['Note', 'This is a snapshot of the live blueprint. Make changes in the web app so validation history is kept.'],
  ]);
  readme.getCell('A1').font = { name: 'Arial', size: 16, bold: true, color: { argb: NAVY } };

  addSheet(wb, 'Process Catalogue',
    [['Proc ID', 'id', 8], ['Process', 'name', 38], ['Stage', 'stage', 18], ['Domain', 'group', 26], ['Accountable owner', 'owner_dept', 28],
      ['Assigned owners', 'owners', 26], ['Indicative Odoo 19 home', 'odoo_home', 55], ['Fit', 'fit', 11], ['In reference flow', 'ref', 12]],
    procs.rows.map((p) => ({ ...p, stage: p.stage_name || 'Cross-cutting', group: p.group_name, ref: p.from_reference ? 'Yes' : 'Proposed' })));
  addSheet(wb, 'COPIS',
    [['Proc ID', 'id', 8], ['Process', 'name', 28], ['Customers', 'c', 30], ['Outputs', 'o', 34], ['Process steps', 'p', 44], ['Inputs', 'i', 36], ['Suppliers', 's', 32]],
    procs.rows.map((p) => ({ id: p.id, name: p.name, c: bullets(p.customers), o: bullets(p.outputs), p: numbered(p.steps), i: bullets(p.inputs), s: bullets(p.suppliers) })));
  addSheet(wb, 'Data Matrix',
    [['Ref', 'ref', 7], ['Proc ID', 'process_id', 8], ['Process', 'process_name', 26], ['Step', 'step', 26], ['a. Trigger event', 'trigger_event', 30],
      ['b. Inputs & data fields', 'data_fields', 50], ['c. System hand-off', 'handoff', 46], ['d. Exceptions / edge cases', 'exceptions', 46], ['Fit', 'fit', 11],
      ['Validation', 'status', 20], ['Validation comment', 'validation_comment', 40], ['Validated by', 'validated_by_name', 20], ['Validated at', 'validated_at', 18]],
    steps.rows.map((m) => ({ ...m, status: STATUS[m.validation_status] })));
  addSheet(wb, 'Master Data',
    [['Object', 'object', 26], ['Owning process', 'owning_process', 14], ['Key fields', 'key_fields', 60], ['Indicative Odoo home', 'odoo_home', 50], ['Used by', 'used_by', 22]], md.rows);
  addSheet(wb, 'Lot Touchpoints',
    [['Process', 'process_label', 36], ['What it does to the Lot', 'effect', 60], ['Fields needed on Lot', 'fields_needed', 40], ['Vendor response', 'vendor_response', 40]], lot.rows);
  addSheet(wb, 'Open Items',
    [['#', 'code', 6], ['Item', 'title', 36], ['Detail', 'detail', 70], ['Owner', 'owner', 20], ['Decision', 'decision', 40], ['Target date', 'target_date', 13], ['Status', 'status', 12]],
    items.rows);

  const stepText = (a) => (a || []).map((s, i) => `${i + 1}. ${s.tag ? `[${s.tag}] ` : ''}${s.text}`).join('\n');
  addSheet(wb, 'Re-engineering',
    [['ID', 'id', 7], ['Opportunity', 'title', 28], ['Process', 'process_refs', 10], ['Current process', 'current_process', 40], ['Proposed', 'proposed', 44],
      ['Why change', 'why_problem', 40], ['How it fixes it', 'how_fixes', 40], ['Control effect', 'control_effect', 34], ['Before steps', 'before', 44], ['After steps', 'after', 46],
      ['Wave', 'wave', 18], ['Impact on SOW', 'impact_type', 20], ['AWB change', 'awb_change', 40], ['Appendix', 'appendix_ref', 9],
      ['Effort low (md)', 'effort_low', 9], ['Effort high (md)', 'effort_high', 9], ['KPI', 'kpi', 28], ['Target', 'target', 18], ['Baseline', 'kpi_baseline', 14],
      ['PHI decision', 'phi_decision', 16], ['PHI owner', 'phi_owner', 16], ['Negotiation status', 'negotiation_status', 16], ['PHI comments', 'phi_comments', 30]],
    reeng.rows.map((r) => ({ ...r, before: stepText(r.before_steps), after: stepText(r.after_steps), effort_low: Number(r.effort_low), effort_high: Number(r.effort_high) })));
  addSheet(wb, 'SOW Gap Analysis',
    [['Ref', 'ref', 7], ['Kind', 'kind', 10], ['Title / process', 'title', 28], ['Rating', 'rating', 12], ['SOW coverage', 'sow_coverage', 36], ['Gaps', 'gaps', 50],
      ['Action', 'action', 40], ['Priority', 'priority', 10], ['PHI response', 'phi_response', 30], ['Vendor response', 'vendor_response', 30], ['Status', 'status', 18]],
    gaps.rows.map((g) => ({ ...g, title: g.title || g.process_id })));
  addSheet(wb, 'SOW Observations',
    [['#', 'code', 6], ['Observation', 'title', 30], ['SOW reference', 'reference', 18], ['Finding', 'finding', 50], ['Request to AWB', 'letter_request', 50],
      ['Owner', 'owner', 16], ['Vendor response', 'vendor_response', 36], ['Status', 'status', 16]], obs.rows);
  addSheet(wb, 'SOW Appendix A-B',
    [['#', 'code', 6], ['Item', 'title', 30], ['Process', 'process_ref', 10], ['Scope / confirmation', 'scope', 60], ['Priority', 'priority', 10],
      ['Vendor response', 'vendor_response', 36], ['Vendor estimate (md)', 'vendor_estimate', 12], ['Status', 'status', 16]],
    app.rows.map((a) => ({ ...a, vendor_estimate: a.vendor_estimate === null ? null : Number(a.vendor_estimate) })));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  await auditEvent('EXPORT', { summary: 'Downloaded blueprint Excel workbook' });
  res.setHeader('Content-Disposition', `attachment; filename="PHI_Process_Blueprint_${stamp()}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

r.get('/bpmn.zip', async (req, res) => {
  const { rows } = await q(
    `SELECT d.file_name, v.xml FROM diagrams d JOIN diagram_versions v ON v.diagram_id=d.id AND v.version=d.current_version ORDER BY d.sort`);
  res.setHeader('Content-Type', 'application/zip');
  await auditEvent('EXPORT', { summary: 'Downloaded BPMN diagrams zip' });
  res.setHeader('Content-Disposition', `attachment; filename="PHI_BPMN_Diagrams_${stamp()}.zip"`);
  const zip = archiver('zip', { zlib: { level: 9 } });
  zip.on('error', (err) => res.destroy(err));
  zip.pipe(res);
  for (const d of rows) zip.append(d.xml, { name: d.file_name });
  await zip.finalize();
});

export default r;
