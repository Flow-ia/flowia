// src/pages/employee-agenda/index.jsx — Redesign Stripe/Linear — toutes fonctionnalités préservées
import { useState, useEffect } from 'react';
import { bookingApi } from '../../utils/api';
import { useTheme } from '../../hooks/useTheme';
import EmpAgendaMain from './tabs/EmpAgendaMain';
import MultiColumnAgenda from './components/MultiColumnAgenda';

export default function EmployeeAgenda({ employees=[], onTxCreated }) {
  const { theme }                     = useTheme();
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [services, setServices]       = useState([]);
  const [view, setView]               = useState('multi');

  useEffect(()=>{ bookingApi.getServices().then(setServices).catch(()=>{}); }, []);

  if (view==='single' && selectedEmp) {
    return (
      <EmpAgendaMain
        employee={selectedEmp}
        services={services}
        allEmployees={employees}
        onBack={()=>{ setSelectedEmp(null); setView('multi'); }}
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
      onSelectEmployee={emp=>{ setSelectedEmp(emp); setView('single'); }}
      theme={theme}
    />
  );
}
