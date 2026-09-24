import { NavLink, Link, Outlet } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const ROLE = { admin: 'Admin', owner: 'Process owner', viewer: 'Viewer' };

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const links = [
    ['/', 'S-0', 'World map', true],
    ['/processes', 'S-1', 'SIPOC'],
    ['/diagrams', 'S-2', 'Swimlanes'],
    ['/matrix', 'S-3', 'Data matrix'],
    ['/master-data', 'S-4', 'Master data & Lot'],
    ['/open-items', 'S-5', 'Open items'],
    ['/activity', '', 'Activity'],
    ...(isAdmin ? [['/users', '', 'Users']] : []),
  ];
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <b>PHI Process Blueprint</b>
          <small>Odoo 19 implementation · BPMN 2.0</small>
        </Link>
        <div className="spacer" />
        <div className="userbox">
          <Link to="/account" style={{ textDecoration: 'none' }}>
            {user.name}
            <small>{ROLE[user.role]}</small>
          </Link>
          <button className="btn sm ghost" onClick={logout}>Sign out</button>
        </div>
      </header>
      <nav className="nav" aria-label="Sheets">
        {links.map(([to, code, label, end]) => (
          <NavLink key={to} to={to} end={end}>{code && <span>{code}</span>}{label}</NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
