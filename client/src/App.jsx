import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Processes from './pages/Processes.jsx';
import ProcessDetail from './pages/ProcessDetail.jsx';
import Matrix from './pages/Matrix.jsx';
import Diagrams from './pages/Diagrams.jsx';
import DiagramView from './pages/DiagramView.jsx';
import MasterData from './pages/MasterData.jsx';
import OpenItems from './pages/OpenItems.jsx';
import Activity from './pages/Activity.jsx';
import Users from './pages/Users.jsx';
import Account from './pages/Account.jsx';
import ReEngineering from './pages/ReEngineering.jsx';
import ReEngineeringDetail from './pages/ReEngineeringDetail.jsx';
import Sow from './pages/Sow.jsx';
import Documents from './pages/Documents.jsx';
import Roles from './pages/Roles.jsx';
import Audit from './pages/Audit.jsx';
import ToolkitLayout from './pages/toolkit/ToolkitLayout.jsx';
import ToolkitGuide from './pages/toolkit/Guide.jsx';
import KeyDates from './pages/toolkit/KeyDates.jsx';
import Schedule from './pages/toolkit/Schedule.jsx';
import Register from './pages/toolkit/Register.jsx';
import ToolkitConfig from './pages/toolkit/Config.jsx';

function Protected({ children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (user === undefined) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (user.must_change_password && loc.pathname !== '/account') return <Navigate to="/account" replace />;
  return children;
}

function NoAccess() {
  return <div className="sheet"><h2>Not available to your role</h2><p className="lede">Ask the Project Manager if you need access to this page.</p></div>;
}

export default function App() {
  const { can } = useAuth();
  const gate = (module, el) => (can(module) ? el : <NoAccess />);
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={can('dashboard') ? <Dashboard /> : <Navigate to="/toolkit" replace />} />
        <Route path="processes" element={gate('processes', <Processes />)} />
        <Route path="processes/:id" element={gate('processes', <ProcessDetail />)} />
        <Route path="matrix" element={gate('matrix', <Matrix />)} />
        <Route path="diagrams" element={gate('diagrams', <Diagrams />)} />
        <Route path="diagrams/:id" element={gate('diagrams', <DiagramView />)} />
        <Route path="master-data" element={gate('master_data', <MasterData />)} />
        <Route path="open-items" element={gate('open_items', <OpenItems />)} />
        <Route path="reengineering" element={gate('reengineering', <ReEngineering />)} />
        <Route path="reengineering/:id" element={gate('reengineering', <ReEngineeringDetail />)} />
        <Route path="sow" element={gate('sow', <Sow />)} />
        <Route path="documents" element={gate('documents', <Documents />)} />
        <Route path="activity" element={gate('activity', <Activity />)} />
        <Route path="audit" element={gate('audit_log', <Audit />)} />
        <Route path="users" element={gate('users', <Users />)} />
        <Route path="roles" element={gate('roles', <Roles />)} />
        <Route path="toolkit" element={<ToolkitLayout />}>
          <Route index element={gate('toolkit_guide', <ToolkitGuide />)} />
          <Route path="key-dates" element={gate('key_dates', <KeyDates />)} />
          <Route path="schedule" element={gate('schedule', <Schedule />)} />
          <Route path="configure" element={gate('toolkit_config', <ToolkitConfig />)} />
          <Route path=":register" element={<Register />} />
        </Route>
        <Route path="account" element={<Account />} />
        <Route path="*" element={<div className="sheet"><h2>Page not found</h2><p>Use the sheet index above to find your way back.</p></div>} />
      </Route>
    </Routes>
  );
}
