// Toolkit configuration: register definitions, schedule phases and guide content, stored in the
// database and editable in the app. Each server process keeps a cached copy and re-reads it when
// the shared version number changes (so both PM2 instances stay in step).
import { createRequire } from 'node:module';
import { pool } from '../db/pool.js';
import { setRegistry } from './permissions.js';

const require = createRequire(import.meta.url);
const DEFAULTS = require('./registers.json');

// Status-like columns in the shipped registers (sign-offs and CCB decisions are deliberately excluded).
const DEFAULT_STATUS_KEYS = {
  milestones: ['status'], comms: ['status'], raid: ['status'], change_requests: ['status'], process_inventory: ['status'],
  data_migration: ['mock_1_result', 'mock_2_result', 'mock_3_result'], uat: ['round_1', 'round_2'], defects: ['status'],
  cutover: ['status'], go_no_go: ['rag'],
};

export const DEFAULT_GUIDE = {
  intro: 'Pre-BRD work + AWB implementation (SOW S343096) → Go-Live → 90-day hypercare. Everything the project team needs to plan, track and sign off, in one place.',
  rules: [
    'Fix the process before you touch the software.',
    'Over-communicate the “why” — then do it again.',
    'Protect the people raising hand-flags. Raising a real issue early is never blamed; the RAID log is open to everyone.',
  ],
  confirm: [
    'The stretched timeline (about 32 weeks vs the SOW’s 20) — effect on AWB fees, resourcing and billing milestones (RAID R-01, task 0.3).',
    'AWB billing / payment milestones from SOW S343096 — add them to Milestones.',
    'Onsite days in Cebu (SOW: mainly remote from Manila; onsite for kickoff, key workshops, UAT, training, go-live).',
    'The Go-Live date and cutover over the 30-Aug-2027 National Heroes Day holiday (RAID R-10).',
    '2027 holiday dates against the official Proclamation and Cebu local declarations.',
  ],
  schedule_note: "AWB's SOW S343096 defines six phases over 20 weeks plus 90 days of hypercare. Phase names, module waves and overlaps are kept; durations are stretched to reach a September 2027 Go-Live. The extra weeks go where ERP projects usually fail: finance year-end around BRD, Holy Week, three mock migrations, two SIT and two UAT rounds, a parallel billing run and a buffer before Go/No-Go. Go-Live on 1-Sep-2027 starts Odoo on a clean accounting period.",
  folders: [
    '00_Governance — charter, SteerCo decks & minutes, sign-offs, contract & SOW', '01_Plan — status reports and exports',
    '02_As-Is — process maps, pain point log, Shadow IT samples', '03_BRD — Pre-BRD Dossier, BRD drafts & signed version, fit-gap',
    '04_Design — FDDs, To-Be maps, change requests', '05_Data — cleansing reports, migration templates, mock results, reconciliations',
    '06_Testing — SIT/UAT scripts, evidence, defect exports', '07_Training — materials, attendance, assessments, SOPs',
    '08_Cutover — runbook, Go/No-Go, final reconciliation', '09_Hypercare — ticket reports, exit review, lessons learned',
  ],
  naming: '<Folder#>_<Document>_<v#>_<YYYY-MM-DD>, e.g. 03_BRD_OrderToCash_v2_2027-02-26.docx. Signed finals get _SIGNED. Share links, not attachments. Files that need version control and the audit trail belong in S-8 Documents.',
};

let state = { version: -1, checkedAt: 0, registers: [], phases: [], guide: DEFAULT_GUIDE };

export const statusFieldsOf = (reg) => reg.columns.filter((c) => c.status && c.type === 'select' && !c.archived).map((c) => c.key);
const withDerived = (key, def, sort, archived) => ({ ...def, key, sort, archived, statusFields: statusFieldsOf(def) });

// Loads defaults the first time (fresh install or upgrade from before migration 006).
export async function ensureDefaults(db = pool) {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM tk_registers');
  if (rows[0].n === 0) {
    for (const [i, r] of DEFAULTS.registers.entries()) {
      const statusKeys = DEFAULT_STATUS_KEYS[r.key] || [];
      const { key, ...def } = r;
      def.columns = def.columns.map((c) => (statusKeys.includes(c.key) ? { ...c, status: true } : c));
      await db.query('INSERT INTO tk_registers(key, def, sort) VALUES ($1,$2,$3) ON CONFLICT (key) DO NOTHING', [key, JSON.stringify(def), i]);
    }
  }
  await db.query(`INSERT INTO tk_settings(key, value) VALUES ('phases', $1) ON CONFLICT (key) DO NOTHING`, [JSON.stringify(DEFAULTS.phases)]);
  await db.query(`INSERT INTO tk_settings(key, value) VALUES ('guide', $1) ON CONFLICT (key) DO NOTHING`, [JSON.stringify(DEFAULT_GUIDE)]);
}

async function load() {
  const [regs, settings, ver] = await Promise.all([
    pool.query('SELECT key, def, sort, archived FROM tk_registers ORDER BY sort, key'),
    pool.query("SELECT key, value FROM tk_settings WHERE key IN ('phases','guide')"),
    pool.query('SELECT version FROM tk_registry_version WHERE id=1'),
  ]);
  const s = Object.fromEntries(settings.rows.map((x) => [x.key, x.value]));
  state = {
    version: Number(ver.rows[0]?.version || 0),
    checkedAt: Date.now(),
    registers: regs.rows.map((r) => withDerived(r.key, r.def, r.sort, r.archived)),
    phases: s.phases || DEFAULTS.phases,
    guide: { ...DEFAULT_GUIDE, ...(s.guide || {}) },
  };
  setRegistry(state.registers, state.phases);
}

// Cheap check (at most every 3 s per process) — reloads only when another change bumped the version.
export async function refresh(force = false) {
  if (!force && Date.now() - state.checkedAt < 3000) return;
  const { rows } = await pool.query('SELECT version FROM tk_registry_version WHERE id=1');
  const v = Number(rows[0]?.version || 0);
  if (force || v !== state.version) await load();
  else state.checkedAt = Date.now();
}

// Call inside the transaction that changed the configuration; the caller then calls refresh(true).
export async function bump(c) {
  await c.query('UPDATE tk_registry_version SET version = version + 1 WHERE id=1');
}

export const getRegisters = (includeArchived = false) => state.registers.filter((r) => includeArchived || !r.archived);
export const getRegister = (key) => state.registers.find((r) => r.key === key && !r.archived);
export const getPhases = () => state.phases;
export const getGuide = () => state.guide;
