// Réglages > Équipe > Membres — EmployeeForm + 6 permissions + EmployeePinManager.
import TabEmployees from '../../settings/equipe/tabs/TabEmployees';

export default function Membres({ employees, onAddEmp, onUpdEmp, onDelEmp, onPatchEmp, showToast, theme }) {
  return (
    <TabEmployees employees={employees}
                  onAdd={onAddEmp} onUpd={onUpdEmp} onDel={onDelEmp} onPatchEmp={onPatchEmp}
                  showToast={showToast} theme={theme}/>
  );
}
