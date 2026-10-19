// Builds a BPMN 2.0 swimlane diagram for one Customer Requirement (KPI), end in mind:
//   the customer (a collapsed pool) asks for the requirement → PHI works through the steps of every process
//   mapped to the KPI, in value-chain order, one lane per accountable department → the outputs that prove the
//   KPI are produced → the end event is "KPI met" and the result goes back to the customer.
// Hand-off steps where the KPI is measured are annotated on the process that owns them.
// The layout (DI) is computed here so the diagram opens ready to use in the browser editor.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

const POOL_X = 0;
const LANE_X = 30;          // lanes start right of the pool label band
const CUST_Y = 10, CUST_H = 60;
const POOL_Y = 110;
const LANE_H = 210;
const COL_W = 190;
const FIRST_X = 110;        // x of the start event column inside the lanes
const TASK_W = 150, TASK_H = 76;
const EVT = 36;
const DATA_W = 36, DATA_H = 50;

/**
 * kpi: { id, customer, requirement, name, definition, target, unit }
 * processes: [{ id, name, owner_dept, role, steps: [text], proving: [text], measured: [ 'ref name' ] }] in value-chain order
 */
export function buildKpiSwimlane(kpi, processes) {
  const P = `K${kpi.id.replace(/[^0-9A-Za-z]/g, '')}`;           // id prefix, e.g. KKPI05
  const id = (s) => `${P}_${s}`;

  // Lanes: one per accountable department, in the order processes first need them.
  const lanes = [];
  const laneOf = {};
  for (const p of processes) {
    const name = (p.owner_dept || '').trim() || `${p.id} ${p.name}`;
    if (!(name in laneOf)) { laneOf[name] = lanes.length; lanes.push({ name, nodes: [] }); }
    p.lane = laneOf[name];
  }
  if (!lanes.length) lanes.push({ name: 'Primary Homes', nodes: [] });

  // Flow: start → every process step in order → end. One column per node.
  const nodes = [];
  const add = (n) => { n.col = nodes.length; nodes.push(n); lanes[n.lane].nodes.push(n.id); return n; };
  add({ id: id('Start'), kind: 'start', lane: processes[0]?.lane ?? 0, name: clip(`${kpi.customer}: ${kpi.requirement}`, 70) });
  for (const p of processes) {
    const steps = p.steps.length ? p.steps : [`${p.id} ${p.name}`];
    p.tasks = steps.map((s, i) => add({
      id: id(`P${p.id}_${i + 1}`), kind: 'task', lane: p.lane, process: p,
      name: clip(`${p.id} · ${s}${p.role === 'Contributes' && i === 0 ? ' (contributes)' : ''}`, 90),
    }));
  }
  const last = processes.length ? processes[processes.length - 1] : null;
  add({ id: id('End'), kind: 'end', lane: last?.lane ?? 0, name: clip(`${kpi.id} met${kpi.target ? `: ${kpi.target}` : ''}`, 60) });

  const width = FIRST_X + nodes.length * COL_W + 260;      // room for the KPI note right of the end event
  const laneY = (i) => POOL_Y + i * LANE_H;
  const poolH = lanes.length * LANE_H;
  const box = (n) => {
    const cx = FIRST_X + n.col * COL_W + TASK_W / 2;
    const cy = laneY(n.lane) + 40 + TASK_H / 2;
    if (n.kind === 'task') return { x: cx - TASK_W / 2, y: cy - TASK_H / 2, w: TASK_W, h: TASK_H, cx, cy };
    return { x: cx - EVT / 2, y: cy - EVT / 2, w: EVT, h: EVT, cx, cy };
  };
  for (const n of nodes) n.b = box(n);

  // Sequence flows between consecutive nodes (orthogonal when the lane changes).
  const flows = [];
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const a = nodes[i], b = nodes[i + 1];
    const wp = [[a.b.x + a.b.w, a.b.cy]];
    if (a.lane !== b.lane) { const mx = Math.round((a.b.x + a.b.w + b.b.x) / 2); wp.push([mx, a.b.cy], [mx, b.b.cy]); }
    wp.push([b.b.x, b.b.cy]);
    const hand = a.kind === 'task' && b.kind === 'task' && a.process.id !== b.process.id;
    flows.push({ id: id(`Flow${i + 1}`), from: a.id, to: b.id, wp, name: hand ? `${a.process.id} → ${b.process.id}` : '' });
  }

  // Proving outputs: data objects under the last task of each process; measurement points: annotations.
  const data = [];
  const notes = [];
  for (const p of processes) {
    const t = p.tasks[p.tasks.length - 1];
    p.proving.forEach((o, j) => {
      const x = t.b.x + 10 + j * (DATA_W + 54), y = laneY(p.lane) + LANE_H - DATA_H - 46;
      data.push({ id: id(`Data${p.id}_${j + 1}`), refId: id(`DataRef${p.id}_${j + 1}`), name: clip(`${o} (proves ${kpi.id})`, 60), task: t, b: { x, y, w: DATA_W, h: DATA_H } });
    });
    if (p.measured.length) {
      notes.push({ id: id(`Note${p.id}`), text: clip(`Measure ${kpi.id} here: ${p.measured.join('; ')}`, 160), task: p.tasks[0],
        b: { x: p.tasks[0].b.x, y: laneY(p.lane) + 4, w: Math.min(COL_W * p.tasks.length - 30, 300), h: 30 } });
    }
  }
  const end = nodes[nodes.length - 1];
  const kpiNote = { id: id('NoteKpi'), text: clip(`${kpi.id} ${kpi.name}${kpi.definition ? ` — ${kpi.definition}` : ''}${kpi.target ? ` · Target ${kpi.target}` : ''}`, 220),
    b: { x: end.b.x + end.b.w + 40, y: end.b.cy - 40, w: 200, h: 80 } };

  const outputs = processes.flatMap((p) => p.proving);
  const msgIn = { id: id('MsgIn'), name: clip(kpi.requirement, 50), from: id('Customer'), to: nodes[0].id };
  const msgOut = { id: id('MsgOut'), name: clip(outputs.length ? outputs.join(', ') : `${kpi.id} result`, 50), from: end.id, to: id('Customer') };

  // ---- semantic model
  const x = [];
  x.push('<?xml version="1.0" encoding="UTF-8"?>');
  x.push('<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" '
    + `id="${id('Definitions')}" targetNamespace="https://primaryhomes.com.ph/bpmn/kpi" exporter="PHI Enterprise Process Blueprint" exporterVersion="KPI generator 1">`);
  x.push(`  <bpmn:collaboration id="${id('Collaboration')}">`);
  x.push(`    <bpmn:documentation>${esc(`Generated from ${kpi.id} — ${kpi.customer} requires: ${kpi.requirement}. KPI: ${kpi.name}${kpi.target ? `, target ${kpi.target}` : ''}. Processes: ${processes.map((p) => `${p.id} ${p.name} (${p.role})`).join('; ') || 'none mapped yet'}.`)}</bpmn:documentation>`);
  x.push(`    <bpmn:participant id="${id('PartPHI')}" name="Primary Homes, Inc." processRef="${id('Process')}" />`);
  x.push(`    <bpmn:participant id="${id('Customer')}" name="${esc(`Customer: ${kpi.customer}`)}" />`);
  for (const m of [msgIn, msgOut]) x.push(`    <bpmn:messageFlow id="${m.id}" name="${esc(m.name)}" sourceRef="${m.from}" targetRef="${m.to}" />`);
  x.push('  </bpmn:collaboration>');
  x.push(`  <bpmn:process id="${id('Process')}" name="${esc(`${kpi.id} ${kpi.name}`)}" isExecutable="false">`);
  x.push(`    <bpmn:laneSet id="${id('LaneSet')}">`);
  lanes.forEach((l, i) => {
    x.push(`      <bpmn:lane id="${id(`Lane${i + 1}`)}" name="${esc(l.name)}">`);
    for (const n of l.nodes) x.push(`        <bpmn:flowNodeRef>${n}</bpmn:flowNodeRef>`);
    x.push('      </bpmn:lane>');
  });
  x.push('    </bpmn:laneSet>');
  const inc = (nid) => flows.filter((f) => f.to === nid).map((f) => `<bpmn:incoming>${f.id}</bpmn:incoming>`).join('');
  const out = (nid) => flows.filter((f) => f.from === nid).map((f) => `<bpmn:outgoing>${f.id}</bpmn:outgoing>`).join('');
  for (const n of nodes) {
    if (n.kind === 'start') x.push(`    <bpmn:startEvent id="${n.id}" name="${esc(n.name)}">${out(n.id)}<bpmn:messageEventDefinition id="${id('StartMsg')}" /></bpmn:startEvent>`);
    else if (n.kind === 'end') x.push(`    <bpmn:endEvent id="${n.id}" name="${esc(n.name)}">${inc(n.id)}<bpmn:messageEventDefinition id="${id('EndMsg')}" /></bpmn:endEvent>`);
    else {
      const outs = data.filter((d) => d.task === n).map((d) => `<bpmn:dataOutputAssociation id="${id(`Assoc_${d.refId}`)}"><bpmn:targetRef>${d.refId}</bpmn:targetRef></bpmn:dataOutputAssociation>`).join('');
      x.push(`    <bpmn:task id="${n.id}" name="${esc(n.name)}">${inc(n.id)}${out(n.id)}${outs}</bpmn:task>`);
    }
  }
  for (const d of data) {
    x.push(`    <bpmn:dataObjectReference id="${d.refId}" name="${esc(d.name)}" dataObjectRef="${d.id}" />`);
    x.push(`    <bpmn:dataObject id="${d.id}" />`);
  }
  for (const f of flows) x.push(`    <bpmn:sequenceFlow id="${f.id}"${f.name ? ` name="${esc(f.name)}"` : ''} sourceRef="${f.from}" targetRef="${f.to}" />`);
  for (const nt of notes) {
    x.push(`    <bpmn:textAnnotation id="${nt.id}"><bpmn:text>${esc(nt.text)}</bpmn:text></bpmn:textAnnotation>`);
    x.push(`    <bpmn:association id="${nt.id}_Assoc" sourceRef="${nt.task.id}" targetRef="${nt.id}" />`);
  }
  x.push(`    <bpmn:textAnnotation id="${kpiNote.id}"><bpmn:text>${esc(kpiNote.text)}</bpmn:text></bpmn:textAnnotation>`);
  x.push(`    <bpmn:association id="${kpiNote.id}_Assoc" sourceRef="${end.id}" targetRef="${kpiNote.id}" />`);
  x.push('  </bpmn:process>');

  // ---- diagram interchange
  const bounds = (b) => `<dc:Bounds x="${Math.round(b.x)}" y="${Math.round(b.y)}" width="${Math.round(b.w)}" height="${Math.round(b.h)}" />`;
  const wps = (pts) => pts.map(([px, py]) => `<di:waypoint x="${Math.round(px)}" y="${Math.round(py)}" />`).join('');
  x.push(`  <bpmndi:BPMNDiagram id="${id('Diagram')}">`);
  x.push(`    <bpmndi:BPMNPlane id="${id('Plane')}" bpmnElement="${id('Collaboration')}">`);
  x.push(`      <bpmndi:BPMNShape id="${id('PartPHI_di')}" bpmnElement="${id('PartPHI')}" isHorizontal="true">${bounds({ x: POOL_X, y: POOL_Y, w: width, h: poolH })}</bpmndi:BPMNShape>`);
  lanes.forEach((l, i) => x.push(`      <bpmndi:BPMNShape id="${id(`Lane${i + 1}_di`)}" bpmnElement="${id(`Lane${i + 1}`)}" isHorizontal="true">${bounds({ x: LANE_X, y: laneY(i), w: width - LANE_X, h: LANE_H })}</bpmndi:BPMNShape>`));
  x.push(`      <bpmndi:BPMNShape id="${id('Customer_di')}" bpmnElement="${id('Customer')}" isHorizontal="true">${bounds({ x: POOL_X, y: CUST_Y, w: width, h: CUST_H })}</bpmndi:BPMNShape>`);
  for (const n of nodes) {
    const label = n.kind === 'task' ? '' : `<bpmndi:BPMNLabel>${bounds({ x: n.b.cx - 70, y: n.b.y + n.b.h + 6, w: 140, h: 40 })}</bpmndi:BPMNLabel>`;
    x.push(`      <bpmndi:BPMNShape id="${n.id}_di" bpmnElement="${n.id}">${bounds(n.b)}${label}</bpmndi:BPMNShape>`);
  }
  for (const d of data) {
    x.push(`      <bpmndi:BPMNShape id="${d.refId}_di" bpmnElement="${d.refId}">${bounds(d.b)}<bpmndi:BPMNLabel>${bounds({ x: d.b.x - 20, y: d.b.y + d.b.h + 2, w: 90, h: 28 })}</bpmndi:BPMNLabel></bpmndi:BPMNShape>`);
    x.push(`      <bpmndi:BPMNEdge id="${id(`Assoc_${d.refId}`)}_di" bpmnElement="${id(`Assoc_${d.refId}`)}">${wps([[d.task.b.cx, d.task.b.y + d.task.b.h], [d.b.x + d.b.w / 2, d.b.y]])}</bpmndi:BPMNEdge>`);
  }
  for (const f of flows) {
    const lbl = f.name ? `<bpmndi:BPMNLabel>${bounds({ x: f.wp[1][0] + 4, y: (f.wp[1][1] + f.wp[f.wp.length - 1][1]) / 2 - 8, w: 70, h: 16 })}</bpmndi:BPMNLabel>` : '';
    x.push(`      <bpmndi:BPMNEdge id="${f.id}_di" bpmnElement="${f.id}">${wps(f.wp)}${lbl}</bpmndi:BPMNEdge>`);
  }
  for (const nt of notes) {
    x.push(`      <bpmndi:BPMNShape id="${nt.id}_di" bpmnElement="${nt.id}">${bounds(nt.b)}</bpmndi:BPMNShape>`);
    x.push(`      <bpmndi:BPMNEdge id="${nt.id}_Assoc_di" bpmnElement="${nt.id}_Assoc">${wps([[nt.task.b.cx, nt.task.b.y], [nt.task.b.cx, nt.b.y + nt.b.h]])}</bpmndi:BPMNEdge>`);
  }
  x.push(`      <bpmndi:BPMNShape id="${kpiNote.id}_di" bpmnElement="${kpiNote.id}">${bounds(kpiNote.b)}</bpmndi:BPMNShape>`);
  x.push(`      <bpmndi:BPMNEdge id="${kpiNote.id}_Assoc_di" bpmnElement="${kpiNote.id}_Assoc">${wps([[end.b.x + end.b.w, end.b.cy], [kpiNote.b.x, end.b.cy]])}</bpmndi:BPMNEdge>`);
  const s = nodes[0];
  x.push(`      <bpmndi:BPMNEdge id="${msgIn.id}_di" bpmnElement="${msgIn.id}">${wps([[s.b.cx, CUST_Y + CUST_H], [s.b.cx, s.b.y]])}<bpmndi:BPMNLabel>${bounds({ x: s.b.cx + 6, y: CUST_Y + CUST_H + 8, w: 150, h: 28 })}</bpmndi:BPMNLabel></bpmndi:BPMNEdge>`);
  x.push(`      <bpmndi:BPMNEdge id="${msgOut.id}_di" bpmnElement="${msgOut.id}">${wps([[end.b.cx, end.b.y], [end.b.cx, CUST_Y + CUST_H]])}<bpmndi:BPMNLabel>${bounds({ x: end.b.cx - 156, y: CUST_Y + CUST_H + 8, w: 150, h: 28 })}</bpmndi:BPMNLabel></bpmndi:BPMNEdge>`);
  x.push('    </bpmndi:BPMNPlane>');
  x.push('  </bpmndi:BPMNDiagram>');
  x.push('</bpmn:definitions>');
  return x.join('\n');
}
