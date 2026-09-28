// Role-based access control.
//
// A role holds, for each module, a level per action:
//   view:              'none' | 'all'
//   add, edit, delete: 'none' | 'own' | 'all'
//   status:            'none' | 'own' | 'all' — change only the status fields of a toolkit record
//                      (e.g. Not Started → In Progress). 'own' here means the user's own domain(s)
//                      PLUS project-wide records, so the whole team can keep shared items current
//                      without being able to rewrite them.
// 'own' means: records in the user's own domain(s) (toolkit modules), or processes assigned
// to the user (blueprint modules scoped by process). Project-wide records (no domain) need 'all'.
//
// System roles (Executive, Project Manager) are defined here and cannot be edited, so nobody
// can lock the project out of its own settings. Custom roles are stored in the roles table.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REGS = require('./registers.json');

export const ACTIONS = ['view', 'add', 'edit', 'status', 'delete'];
export const LEVELS = ['none', 'own', 'all'];

// scope: 'process' | 'domain' | null  (null = 'own' is not meaningful, only none/all)
// actions: the actions this module actually supports
const BLUEPRINT = [
  { key: 'dashboard', label: 'World map & dashboard', actions: ['view'] },
  { key: 'processes', label: 'S-1 SIPOC & processes', scope: 'process', actions: ['view', 'edit'] },
  { key: 'diagrams', label: 'S-2 Swimlane diagrams', actions: ['view', 'edit'] },
  { key: 'matrix', label: 'S-3 Data matrix steps & validation', scope: 'process', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'master_data', label: 'S-4 Master data & Lot (structure)', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'lot_responses', label: 'S-4 Lot fields & vendor responses', actions: ['view', 'edit'] },
  { key: 'open_items', label: 'S-5 Open items', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'reengineering', label: 'S-6 Re-engineering decisions & tracking', actions: ['view', 'edit'] },
  { key: 'reengineering_content', label: 'S-6 Re-engineering content', actions: ['view', 'edit'] },
  { key: 'sow', label: 'S-7 SOW & vendor review', actions: ['view', 'edit'] },
  { key: 'documents', label: 'S-8 Documents', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'documents_confidential', label: 'S-8 Confidential documents', actions: ['view'] },
  { key: 'comments', label: 'Discussion threads (delete = remove others\u2019 comments)', actions: ['view', 'add', 'delete'] },
  { key: 'exports', label: 'Excel & BPMN exports', actions: ['view'] },
];

// Status-like columns that people update as work progresses. Sign-offs and CCB decisions are
// deliberately excluded: those need full edit rights.
const STATUS_KEYS = {
  milestones: ['status'], comms: ['status'], raid: ['status'], change_requests: ['status'], process_inventory: ['status'],
  data_migration: ['mock_1_result', 'mock_2_result', 'mock_3_result'], uat: ['round_1', 'round_2'], defects: ['status'],
  cutover: ['status'], go_no_go: ['rag'],
};
export const TASK_STATUSES = ['Not Started', 'In Progress', 'Complete', 'At Risk', 'Blocked'];
const REGISTERS = REGS.registers.map((r) => ({ ...r, statusFields: (STATUS_KEYS[r.key] || []).filter((k) => r.columns.some((c) => c.key === k)) }));

const TOOLKIT = [
  { key: 'toolkit_guide', label: 'Toolkit guide', actions: ['view'] },
  { key: 'key_dates', label: 'Key dates & anchors', actions: ['view', 'edit'] },
  { key: 'schedule', label: 'Master schedule & Gantt', scope: 'domain', actions: ['view', 'add', 'edit', 'status', 'delete'] },
  ...REGISTERS.map((r) => ({ key: r.key, label: r.label, scope: 'domain',
    actions: r.statusFields.length ? ['view', 'add', 'edit', 'status', 'delete'] : ['view', 'add', 'edit', 'delete'] })),
];

const ADMIN = [
  { key: 'activity', label: 'Activity feed', actions: ['view'] },
  { key: 'audit_log', label: 'Audit log (read-only, immutable)', actions: ['view'] },
  { key: 'users', label: 'Users', actions: ['view', 'add', 'edit'] },
  { key: 'roles', label: 'Roles & permissions', actions: ['view', 'add', 'edit', 'delete'] },
];

export const MODULE_GROUPS = [
  { key: 'blueprint', label: 'Process blueprint', modules: BLUEPRINT },
  { key: 'toolkit', label: 'Project toolkit', modules: TOOLKIT },
  { key: 'admin', label: 'Administration', modules: ADMIN },
];
export const MODULES = Object.fromEntries(MODULE_GROUPS.flatMap((g) => g.modules.map((m) => [m.key, { ...m, group: g.key }])));
export const TOOLKIT_REGISTERS = REGISTERS;
export const TOOLKIT_PHASES = REGS.phases;

const allOf = (level) => Object.fromEntries(Object.values(MODULES).map((m) => [m.key,
  Object.fromEntries(ACTIONS.map((a) => [a, m.actions.includes(a) ? (a === 'view' ? 'all' : level) : 'none']))]));

export const SYSTEM_ROLES = {
  executive: allOf('none'),         // sees everything, changes nothing
  project_manager: allOf('all'),    // sees and changes everything
};

// Turns stored JSON (which may use "*" and "group:<key>" defaults) into a complete, valid map.
export function normalizePermissions(raw = {}) {
  const out = {};
  for (const m of Object.values(MODULES)) {
    const src = raw[m.key] ?? raw[`group:${m.group}`] ?? raw['*'] ?? {};
    const p = {};
    for (const a of ACTIONS) {
      let v = m.actions.includes(a) ? (src[a] ?? 'none') : 'none';
      if (!LEVELS.includes(v)) v = 'none';
      if (a === 'view' && v === 'own') v = 'all';
      if (v === 'own' && !m.scope) v = 'none';     // 'own' only means something for scoped modules
      p[a] = v;
    }
    // Anyone who can change a module must be able to see it.
    if (p.view === 'none' && ['add', 'edit', 'delete'].some((a) => p[a] !== 'none')) p.view = 'all';
    out[m.key] = p;
  }
  return out;
}

export function effectivePermissions(role) {
  if (role.is_system && SYSTEM_ROLES[role.key]) return SYSTEM_ROLES[role.key];
  return normalizePermissions(role.permissions);
}

// ctx: { domain } for domain-scoped records (null/undefined domain = project-wide),
//      { processId } for process-scoped records, or {} to ask "could this user do it anywhere?"
export function can(user, module, action, ctx = {}) {
  const level = user?.permissions?.[module]?.[action] ?? 'none';
  if (level === 'all') return true;
  if (level !== 'own') return false;
  const scope = MODULES[module]?.scope;
  if (scope === 'process') {
    if ('processId' in ctx) return user.process_ids.includes(ctx.processId);
    return user.process_ids.length > 0;
  }
  if (scope === 'domain') {
    // Status updates: own domain(s) plus shared, project-wide records.
    if (action === 'status') return 'domain' in ctx ? !ctx.domain || user.domains.includes(ctx.domain) : true;
    if ('domain' in ctx) return !!ctx.domain && user.domains.includes(ctx.domain);
    return user.domains.length > 0;
  }
  return false;
}

export function forbidden(message = "You don't have permission to do that.") {
  const e = new Error(message);
  e.status = 403;
  return e;
}

export function assertCan(user, module, action, ctx = {}, message) {
  if (!can(user, module, action, ctx)) {
    let msg = message;
    if (!msg) {
      const label = MODULES[module]?.label || module;
      const level = user?.permissions?.[module]?.[action];
      if (action === 'status') msg = `Your role can't update the status of ${label} records${ctx.domain ? ` in ${ctx.domain}` : ''}.`;
      else if (level === 'own' && 'domain' in ctx) msg = ctx.domain ? `You can only ${action} ${label} records in your own domain.` : `Only a Project Manager can ${action} project-wide ${label} records.`;
      else if (level === 'own' && 'processId' in ctx) msg = `You can only ${action} processes assigned to you (${ctx.processId} is not).`;
      else msg = `Your role doesn't allow you to ${action} ${label}.`;
    }
    throw forbidden(msg);
  }
}

export const requireView = (module) => (req, res, next) =>
  (can(req.user, module, 'view') ? next() : next(forbidden(`Your role doesn't include ${MODULES[module]?.label || module}.`)));

export const requireAction = (module, action) => (req, res, next) =>
  (can(req.user, module, action) ? next() : next(forbidden(`Your role doesn't allow you to ${action} ${MODULES[module]?.label || module}.`)));
