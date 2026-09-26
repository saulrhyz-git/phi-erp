import { useOutletContext } from 'react-router-dom';

export const useToolkit = () => useOutletContext();

const TONES = {
  ok: ['complete', 'closed', 'pass', 'green', 'approved', 'accepted', 'signed', 'fit', 'low', 'done', 'resolved'],
  info: ['in progress', 'monitoring', 'config', 'circulating', 'retest', 'fixed', 'should', 'med', 'medium', '3', '4'],
  warn: ['at risk', 'amber', 'pending', 'deferred', 'signed with conditions', 'pass w/ issues', 'gap-process', 'custom', 'could', 'draft', 'partially', 'tbd', '2'],
  bad: ['blocked', 'red', 'fail', 'rejected', 'high', 'must', 'out', "won't", '1'],
};
export function tone(v) {
  const s = String(v || '').toLowerCase();
  if (!s) return null;
  for (const [t, words] of Object.entries(TONES)) if (words.includes(s)) return t;
  return 'neutral';
}
export const Badge = ({ v }) => (v ? <span className={`badge ${tone(v)}`}>{v}</span> : <span className="muted">—</span>);

export function DomainTag({ id, user }) {
  if (!id) return <span className="domain none" title="Project-wide: only roles with 'All' access can change it">Project</span>;
  return <span className={`domain${user?.domains?.includes(id) ? ' mine' : ''}`} title={user?.domains?.includes(id) ? 'Your domain' : ''}>{id}</span>;
}

// Domains the user may assign a record to, for a module + action.
export function allowedDomains(user, level, domains) {
  if (level === 'all') return [{ id: '', name: 'Project-wide (no domain)' }, ...domains];
  if (level === 'own') return domains.filter((d) => user.domains.includes(d.id));
  return [];
}
