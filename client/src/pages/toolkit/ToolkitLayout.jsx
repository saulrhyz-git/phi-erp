import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth.jsx';
import { useApi } from '../../hooks.js';
import { ErrorNote, Loading } from '../../components/ui.jsx';


export default function ToolkitLayout() {
  const { can } = useAuth();
  const loc = useLocation();
  const configuring = loc.pathname.startsWith('/toolkit/configure');
  const meta = useApi('/toolkit/meta');
  const summary = useApi('/toolkit/summary');
  if (meta.error) return <div className="sheet"><ErrorNote error={meta.error} /></div>;
  if (!meta.data) return <div className="sheet"><Loading /></div>;
  const count = (k) => summary.data?.registers?.[k]?.n;
  return (
    <div className={`tk${configuring ? ' tk-full' : ''}`}>
      {configuring && <div><Link className="btn sm ghost" to="/toolkit">← Back to the toolkit</Link></div>}
      <aside className="tk-side" aria-label="Toolkit sections">
        <h5>Overview</h5>
        {can('toolkit_guide') && <NavLink to="/toolkit" end>Guide & status</NavLink>}
        {can('key_dates') && <NavLink to="/toolkit/key-dates">Key dates</NavLink>}
        {can('schedule') && <NavLink to="/toolkit/schedule">Master schedule<small>Gantt</small></NavLink>}
        {[...new Set(meta.data.registers.map((r) => r.group))].map((g) => {
          const regs = meta.data.registers.filter((r) => r.group === g && can(r.key));
          if (!regs.length) return null;
          return (
            <div key={g} style={{ display: 'contents' }}>
              <h5>{g}</h5>
              {regs.map((r) => <NavLink key={r.key} to={`/toolkit/${r.key.replace(/_/g, '-')}`}>{r.label}{count(r.key) !== undefined && <small>{count(r.key)}</small>}</NavLink>)}
            </div>
          );
        })}
        {can('toolkit_config') && (<><h5>Settings</h5><NavLink to="/toolkit/configure">Configure toolkit</NavLink></>)}
      </aside>
      <main className="tk-main">
        <Outlet context={{ meta: meta.data, summary: summary.data, reloadSummary: summary.reload, reloadMeta: () => { meta.reload(); summary.reload(); } }} />
      </main>
    </div>
  );
}
