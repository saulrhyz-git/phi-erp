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
        master_data, matrix_steps, process_owners, processes, stages, process_groups RESTART IDENTITY CASCADE`);
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

seedContent().then(seedAdmin).then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
