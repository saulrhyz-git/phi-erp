import { NavLink, Link, Outlet } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Layout() {
  const { user, logout, can } = useAuth();
  const blueprint = [
    ['/', 'S-0', 'World map', 'dashboard', true],
    ['/processes', 'S-1', 'SIPOC', 'processes'],
    ['/diagrams', 'S-2', 'Swimlanes', 'diagrams'],
    ['/matrix', 'S-3', 'Data matrix', 'matrix'],
    ['/master-data', 'S-4', 'Master data & Lot', 'master_data'],
    ['/open-items', 'S-5', 'Open items', 'open_items'],
    ['/reengineering', 'S-6', 'Re-engineering', 'reengineering'],
    ['/sow', 'S-7', 'SOW & vendor', 'sow'],
    ['/documents', 'S-8', 'Documents', 'documents'],
  ].filter((l) => can(l[3]));
  const other = [
    ['/toolkit', 'T', 'Project toolkit', 'toolkit_guide'],
    ['/activity', '', 'Activity', 'activity'],
    ['/audit', '', 'Audit log', 'audit_log'],
    ['/users', '', 'Users', 'users'],
    ['/roles', '', 'Roles', 'roles'],
  ].filter((l) => can(l[3]));
  const domains = user.domains?.length ? ` · ${user.domains.join(', ')}` : '';
  return (
    <div className="shell">
      <header className="topbar">
        <Link to={can('dashboard') ? '/' : '/toolkit'} className="brand">
          <b>PHI Process Blueprint</b>
          <small>Odoo 19 implementation · blueprint & project toolkit</small>
        </Link>
        <div className="spacer" />
        <div className="userbox">
          <Link to="/account" style={{ textDecoration: 'none' }}>
            {user.name}
            <small>{user.role_name}{domains}</small>
          </Link>
          <button className="btn sm ghost" onClick={logout}>Sign out</button>
        </div>
      </header>
      <nav className="nav" aria-label="Sheets">
        {blueprint.map(([to, code, label, , end]) => (
          <NavLink key={to} to={to} end={end}>{code && <span>{code}</span>}{label}</NavLink>
        ))}
        {blueprint.length > 0 && other.length > 0 && <i className="sep" aria-hidden="true" />}
        {other.map(([to, code, label]) => (
          <NavLink key={to} to={to}>{code && <span>{code}</span>}{label}</NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
