import { useState, useEffect } from 'react';
import { bookingApi } from '../../../../utils/api';
import TeamTab from '../components/TeamTab';

export default function TabHorairesEmployes({ employees, theme, showToast }) {
  const t = theme;
  const [businessHours, setBusinessHours] = useState([]);
  const [bizBreaks,     setBizBreaks]     = useState([]);
  const [loaded,        setLoaded]        = useState(false);

  useEffect(() => {
    Promise.all([
      bookingApi.getHours().catch(() => []),
      bookingApi.getBreaks().catch(() => []),
    ]).then(([hrs, brks]) => {
      setBusinessHours(Array.isArray(hrs) ? hrs : []);
      setBizBreaks(Array.isArray(brks) ? brks : []);
      setLoaded(true);
    });
  }, []);

  if (!loaded) return (
    <div style={{ padding:48, textAlign:'center' }}>
      <svg className="animate-spin" width="26" height="26" viewBox="0 0 24 24"
           style={{ color:t.text, display:'inline-block' }}>
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
        <path d="M12 2 a10 10 0 0 1 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </div>
  );

  return (
    <TeamTab
      employees={employees.filter(e => e.is_active !== false)}
      businessHours={businessHours}
      bizBreaks={bizBreaks}
      showToast={showToast}
      theme={theme}/>
  );
}
