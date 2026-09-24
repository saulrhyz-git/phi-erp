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

function Protected({ children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (user === undefined) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (user.must_change_password && loc.pathname !== '/account') return <Navigate to="/account" replace />;
  return children;
}

export default function App() {
  const { isAdmin } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="processes" element={<Processes />} />
        <Route path="processes/:id" element={<ProcessDetail />} />
        <Route path="matrix" element={<Matrix />} />
        <Route path="diagrams" element={<Diagrams />} />
        <Route path="diagrams/:id" element={<DiagramView />} />
        <Route path="master-data" element={<MasterData />} />
        <Route path="open-items" element={<OpenItems />} />
        <Route path="reengineering" element={<ReEngineering />} />
        <Route path="reengineering/:id" element={<ReEngineeringDetail />} />
        <Route path="sow" element={<Sow />} />
        <Route path="documents" element={<Documents />} />
        <Route path="activity" element={<Activity />} />
        <Route path="account" element={<Account />} />
        {isAdmin && <Route path="users" element={<Users />} />}
        <Route path="*" element={<div className="sheet"><h2>Page not found</h2><p>Use the sheet index above to find your way back.</p></div>} />
      </Route>
    </Routes>
  );
}
