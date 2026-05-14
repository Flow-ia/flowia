import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import MerchantsListPage from './pages/MerchantsListPage.jsx';
import MerchantDetailPage from './pages/MerchantDetailPage.jsx';
import ClientsListPage from './pages/ClientsListPage.jsx';
import ClientDetailPage from './pages/ClientDetailPage.jsx';
import AuditPage from './pages/AuditPage.jsx';
import SearchPage from './pages/SearchPage.jsx';
import LegacyMultiPage from './pages/LegacyMultiPage.jsx';
import MaintenancePage from './pages/MaintenancePage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import './styles/global.css';

function Protected({ children }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard"          element={<Protected><DashboardPage /></Protected>} />
        <Route path="/merchants"          element={<Protected><MerchantsListPage /></Protected>} />
        <Route path="/merchants/:id"      element={<Protected><MerchantDetailPage /></Protected>} />
        <Route path="/clients"            element={<Protected><ClientsListPage /></Protected>} />
        <Route path="/clients/:id"        element={<Protected><ClientDetailPage /></Protected>} />
        <Route path="/search"             element={<Protected><SearchPage /></Protected>} />
        <Route path="/audit"              element={<Protected><AuditPage /></Protected>} />
        <Route path="/legacy-multi"       element={<Protected><LegacyMultiPage /></Protected>} />
        <Route path="/maintenance"        element={<Protected><MaintenancePage /></Protected>} />
        <Route path="/settings"           element={<Protected><SettingsPage /></Protected>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
