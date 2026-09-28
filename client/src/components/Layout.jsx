import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Map, Layers, GitBranch, Table2, Database, ListChecks, Sparkles, FileSignature, FolderOpen,
  Briefcase, Activity, ShieldCheck, Users, KeyRound, PanelLeftClose, PanelLeftOpen, Menu, LogOut, X, Monitor, Leaf, Contrast, Moon,
} from 'lucide-react';
import { THEMES, getTheme, setTheme } from '../theme.js';

const THEME_ICON = { system: Monitor, calm: Leaf, contrast: Contrast, dark: Moon };
import { useAuth } from '../auth.jsx';

const BLUEPRINT = [
  ['/', 'S-0', 'World map', 'dashboard', Map, true],
  ['/processes', 'S-1', 'SIPOC', 'processes', Layers],
  ['/diagrams', 'S-2', 'Swimlanes', 'diagrams', GitBranch],
  ['/matrix', 'S-3', 'Data matrix', 'matrix', Table2],
  ['/master-data', 'S-4', 'Master data & Lot', 'master_data', Database],
  ['/open-items', 'S-5', 'Open items', 'open_items', ListChecks],
  ['/reengineering', 'S-6', 'Re-engineering', 'reengineering', Sparkles],
  ['/sow', 'S-7', 'SOW & vendor', 'sow', FileSignature],
  ['/documents', 'S-8', 'Documents', 'documents', FolderOpen],
];
const PROJECT = [['/toolkit', '', 'Project toolkit', 'toolkit_guide', Briefcase]];
const ADMIN = [
  ['/activity', '', 'Activity', 'activity', Activity],
  ['/audit', '', 'Audit log', 'audit_log', ShieldCheck],
  ['/users', '', 'Users', 'users', Users],
  ['/roles', '', 'Roles', 'roles', KeyRound],
];
const ALL = [...BLUEPRINT, ...PROJECT, ...ADMIN];

const initials = (n = '') => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
const readPref = () => { try { return localStorage.getItem('phi.sidebar') === 'collapsed'; } catch { return false; } };

export default function Layout() {
  const { user, logout, can } = useAuth();
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState(readPref);
  const [open, setOpen] = useState(false);
  const [theme, setThemeState] = useState(getTheme);
  const pickTheme = (t) => { setTheme(t); setThemeState(t); };
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem('phi.sidebar', c ? 'open' : 'collapsed'); } catch { /* storage unavailable */ } return !c; });

  const section = (title, items) => {
    const list = items.filter((l) => can(l[3]));
    if (!list.length) return null;
    return (
      <>
        <div className="sb-group">{title}</div>
        {list.map(([to, code, label, , Icon, end]) => (
          <NavLink key={to} to={to} end={end} className="sb-link" title={collapsed ? `${code ? `${code} · ` : ''}${label}` : undefined}>
            <Icon size={18} strokeWidth={1.9} aria-hidden="true" /><span>{label}</span>{code && <em className="code">{code}</em>}
          </NavLink>
        ))}
      </>
    );
  };
  const current = ALL.find(([to, , , , , end]) => (end ? loc.pathname === to : loc.pathname.startsWith(to)));
  const domains = user.domains?.length ? ` · ${user.domains.join(', ')}` : '';

  return (
    <div className={`app${collapsed ? ' collapsed' : ''}${open ? ' open' : ''}`}>
      <aside className="sidebar" aria-label="Main navigation">
        <Link to={can('dashboard') ? '/' : '/toolkit'} className="sb-brand">
          <span className="sb-logo" aria-hidden="true">PHI</span>
          <div><b>Process Blueprint</b><small>Odoo 19 · blueprint & toolkit</small></div>
        </Link>
        <nav className="sb-scroll">
          {section('Process blueprint', BLUEPRINT)}
          {section('Project', PROJECT)}
          {section('Administration', ADMIN)}
        </nav>
        <div className="sb-foot">
          <Link to="/account" className="sb-user" title={collapsed ? user.name : undefined}>
            <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
            <div style={{ minWidth: 0 }}><b>{user.name}</b><small>{user.role_name}{domains}</small></div>
          </Link>
          <div className="sb-theme" role="group" aria-label="Colour theme">
            {THEMES.map(([k, label]) => {
              const Icon = THEME_ICON[k];
              return (
                <button key={k} type="button" aria-pressed={theme === k} onClick={() => pickTheme(k)} title={`${label} theme`}>
                  <Icon size={14} aria-hidden="true" /><span>{label === 'High contrast' ? 'Contrast' : label}</span>
                </button>
              );
            })}
          </div>
          <div className="sb-actions">
            <button type="button" className="sb-btn collapse-btn" onClick={toggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}<span>Collapse</span>
            </button>
            <button type="button" className="sb-btn" onClick={logout} aria-label="Sign out"><LogOut size={16} /><span>Sign out</span></button>
          </div>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />
      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-btn menu-btn" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'}>
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="crumbs">
            PHI · Odoo 19 rollout{current && <> / <b>{current[2]}</b></>}
          </div>
          <div className="spacer" />
        </header>
        <main className="content" id="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
