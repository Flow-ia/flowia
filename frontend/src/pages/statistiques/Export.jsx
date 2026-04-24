// Statistiques > Export — CSV/PDF (gate PIN admin via adminRequest).
// TabExport joint x-pin-session automatiquement (exportApi.downloadFile).
// ErrorModal pastel rouge + handler 403 « Session admin expirée » déjà en place.
import TabExport from '../settings/TabExport';

export default function Export({ employees, categories, theme }) {
  return <TabExport employees={employees} categories={categories} theme={theme}/>;
}
