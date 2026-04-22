// src/pages/employee-agenda/index.jsx — Redesign Stripe/Linear — toutes fonctionnalités préservées
// Vue multi-colonnes → /agenda (ou /agenda/views)
// Vue employé seul   → /agenda/views/:employeeId (URL persistante au refresh + partageable)
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { bookingApi } from '../../utils/api';
import { useTheme } from '../../hooks/useTheme';
import EmpAgendaMain from './tabs/EmpAgendaMain';
import MultiColumnAgenda from './components/MultiColumnAgenda';

export default function EmployeeAgenda({ employees=[], onTxCreated }) {
  const { theme }               = useTheme();
  const { employeeId }          = useParams();
  const navigate                = useNavigate();
  const [services, setServices] = useState([]);

  useEffect(()=>{ bookingApi.getServices().then(setServices).catch(()=>{}); }, []);

  const selectedEmp = employeeId
    ? employees.find(e => String(e.id) === String(employeeId))
    : null;

  // URL pointe vers un employé introuvable (suppression, désactivation, mauvaise URL)
  // → retour à la vue multi-colonnes plutôt qu'un écran blanc. Attendre que les
  // employés soient chargés avant de conclure qu'il est introuvable.
  useEffect(() => {
    if (employeeId && employees.length > 0 && !selectedEmp) {
      navigate('/agenda', { replace: true });
    }
  }, [employeeId, employees, selectedEmp, navigate]);

  if (employeeId && selectedEmp) {
    return (
      <EmpAgendaMain
        employee={selectedEmp}
        services={services}
        allEmployees={employees}
        onBack={() => navigate('/agenda')}
        onTxCreated={onTxCreated||(()=>{})}
        theme={theme}
      />
    );
  }

  return (
    <MultiColumnAgenda
      employees={employees}
      services={services}
      onTxCreated={onTxCreated||(()=>{})}
      onSelectEmployee={emp => navigate(`/agenda/views/${emp.id}`)}
      theme={theme}
    />
  );
}
