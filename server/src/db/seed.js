import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { pool, tx } from './pool.js';

const force = process.argv.includes('--force');

async function seedContent() {
  const data = JSON.parse(readFileSync(join(config.seedDir, 'blueprint.json'), 'utf8'));
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM processes');
  if (rows[0].n > 0 && !force) {
    console.log('Blueprint content already present — skipping. Use `npm run seed:force` to reset it (users are kept).');
    return;
  }
  await tx(async (c) => {
    if (force) {
      await c.query(`TRUNCATE comments, activity_log, diagram_versions, diagrams, open_items, lot_touchpoints,
        master_data, matrix_steps, process_owners, sow_gaps, processes, stages, process_groups RESTART IDENTITY CASCADE`);
    }
    for (const [i, g] of data.groups.entries()) {
      await c.query('INSERT INTO process_groups(id,name,color,sort) VALUES ($1,$2,$3,$4)', [g.id, g.name, g.color, i]);
    }
    const stageId = {};
    for (const [i, s] of data.stages.entries()) {
      const r = await c.query('INSERT INTO stages(name,sort) VALUES ($1,$2) RETURNING id', [s, i]);
      stageId[s] = r.rows[0].id;
    }
    for (const [i, p] of data.processes.entries()) {
      await c.query(
        `INSERT INTO processes(id,group_id,stage_id,name,owner_dept,odoo_home,fit,from_reference,sort,suppliers,inputs,steps,outputs,customers)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [p.id, p.group, p.stage ? stageId[p.stage] : null, p.name, p.owner_dept, p.odoo_home, p.fit, p.from_reference, i,
          JSON.stringify(p.suppliers), JSON.stringify(p.inputs), JSON.stringify(p.steps), JSON.stringify(p.outputs), JSON.stringify(p.customers)]);
    }
    for (const [i, m] of data.matrix.entries()) {
      await c.query(
        `INSERT INTO matrix_steps(ref,process_id,step,trigger_event,data_fields,handoff,exceptions,fit,sort)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [m.ref, m.process_id, m.step, m.trigger_event, m.data_fields, m.handoff, m.exceptions, m.fit, i]);
    }
    for (const [i, r] of data.master_data.entries()) {
      await c.query('INSERT INTO master_data(object,owning_process,key_fields,odoo_home,used_by,sort) VALUES ($1,$2,$3,$4,$5,$6)',
        [r.object, r.owning_process, r.key_fields, r.odoo_home, r.used_by, i]);
    }
    for (const [i, r] of data.lot_touchpoints.entries()) {
      await c.query('INSERT INTO lot_touchpoints(process_label,effect,sort) VALUES ($1,$2,$3)', [r.process_label, r.effect, i]);
    }
    for (const [i, r] of data.open_items.entries()) {
      await c.query('INSERT INTO open_items(code,title,detail,sort) VALUES ($1,$2,$3,$4)', [`Q${i + 1}`, r.title, r.detail, i]);
    }
    for (const [i, d] of data.diagrams.entries()) {
      const xml = readFileSync(join(config.seedDir, 'bpmn', d.file), 'utf8');
      await c.query('INSERT INTO diagrams(id,title,covers,description,file_name,sort,current_version) VALUES ($1,$2,$3,$4,$5,$6,1)',
        [d.id, d.title, d.covers, d.description, d.file, i]);
      await c.query("INSERT INTO diagram_versions(diagram_id,version,xml,note) VALUES ($1,1,$2,'Initial blueprint (Rev. B)')", [d.id, xml]);
    }
  });
  console.log(`Seeded ${data.processes.length} processes, ${data.matrix.length} matrix steps, ${data.diagrams.length} diagrams.`);
}

async function seedProject() {
  const data = JSON.parse(readFileSync(join(config.seedDir, 'project.json'), 'utf8'));
  const empty = async (table) => (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n === 0;
  const done = [];
  await tx(async (c) => {
    if (force) await c.query('TRUNCATE reengineering, sow_meta, sow_items, sow_effort, sow_gaps, sow_observations, sow_appendix RESTART IDENTITY');
    if (force || await empty('reengineering')) {
      for (const r of data.reengineering) {
        await c.query(
          `INSERT INTO reengineering (id,title,process_refs,current_process,pain_points,proposed,justification,controls,benefits,wave,continues,
             odoo_enabler,sow_status,kpi,target,why_problem,how_fixes,control_effect,before_steps,after_steps,what_changes,roles_affected,
             sow_sections,sow_items,impact_type,awb_change,appendix_ref,effort_low,effort_high,offset_low,offset_high,build_phase,sow_wording,
             flex_category,risk,sort)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36)`,
          [r.id, r.title, r.process_refs, r.current_process, r.pain_points, r.proposed, r.justification, r.controls, r.benefits, r.wave, r.continues,
            r.odoo_enabler, r.sow_status, r.kpi, r.target, r.why_problem, r.how_fixes, r.control_effect, JSON.stringify(r.before_steps),
            JSON.stringify(r.after_steps), r.what_changes, r.roles_affected, r.sow_sections, JSON.stringify(r.sow_items), r.impact_type, r.awb_change,
            r.appendix_ref, r.effort_low, r.effort_high, r.offset_low, r.offset_high, r.build_phase, r.sow_wording, r.flex_category, r.risk, r.sort]);
      }
      done.push(`${data.reengineering.length} re-engineering opportunities`);
    }
    if (force || await empty('sow_items')) {
      for (const [k, v] of Object.entries(data.sow_meta)) await c.query('INSERT INTO sow_meta(key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', [k, JSON.stringify(v)]);
      for (const i of data.sow_items) await c.query('INSERT INTO sow_items(no,section,feature,dev_days,process_refs) VALUES ($1,$2,$3,$4,$5)', [i.no, i.section, i.feature, i.dev_days, i.process_refs]);
      for (const e of data.sow_effort) await c.query('INSERT INTO sow_effort(workstream,lead,ba,dev_lead,dev,qa,infra,stated_total,sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [e.workstream, e.lead, e.ba, e.dev_lead, e.dev, e.qa, e.infra, e.stated_total, e.sort]);
      for (const g of data.sow_gaps) await c.query(
        `INSERT INTO sow_gaps(ref,kind,process_id,title,requirement,sow_coverage,rating,gaps,action,priority,steps_affected,status,sort)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [g.ref, g.kind, g.process_id, g.title, g.requirement, g.sow_coverage, g.rating, g.gaps, g.action, g.priority, g.steps_affected, g.status, g.sort]);
      for (const o of data.sow_observations) await c.query(
        `INSERT INTO sow_observations(code,title,reference,finding,impact,internal_ask,letter_observation,letter_request,status,sort)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [o.code, o.title, o.reference, o.finding, o.impact, o.internal_ask, o.letter_observation, o.letter_request, o.status, o.sort]);
      for (const a of data.appendix) await c.query(
        'INSERT INTO sow_appendix(code,part,title,process_ref,scope,priority,status,sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [a.code, a.part, a.title, a.process_ref, a.scope, a.priority, a.status, a.sort]);
      done.push(`SOW review (${data.sow_items.length} items, ${data.sow_gaps.length} gaps, ${data.sow_observations.length} observations, ${data.appendix.length} appendix items)`);
    }
  });
  console.log(done.length ? `Seeded ${done.join('; ')}.` : 'Project workspace data already present — skipping.');
}

async function seedAdmin() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log('ADMIN_EMAIL / ADMIN_PASSWORD not set — no admin created. Run `npm run create-admin` later.');
    return;
  }
  const { rows } = await pool.query('SELECT id FROM users WHERE lower(email)=lower($1)', [ADMIN_EMAIL]);
  if (rows.length) { console.log(`Admin ${ADMIN_EMAIL} already exists.`); return; }
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await pool.query(
    "INSERT INTO users(email,name,password_hash,role,must_change_password) VALUES ($1,$2,$3,'admin',TRUE)",
    [ADMIN_EMAIL, ADMIN_NAME || 'Blueprint Admin', hash]);
  console.log(`Created admin ${ADMIN_EMAIL} — they'll be asked to change the password on first sign-in.`);
}

seedContent().then(seedProject).then(seedAdmin).then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
