import { useState, useEffect } from 'react';
import { bookingApi } from '../../../../utils/api';
import TeamTab from '../components/TeamTab';

export default function TabHorairesEmployes({ employees, theme, showToast }) {
  const [businessHours, setBusinessHours] = useState([]);
  const [bizBreaks,     setBizBreaks]     = useState([]);
  const [loaded,        setLoaded]        = useState(false);

  useEffect(() => {
    Promise.all([
      bookingApi.getHours().catch(()=>[]),
      bookingApi.getBreaks().catch(()=>[]),
    ]).then(([hrs, brks]) => {
      setBusinessHours(Array.isArray(hrs)?hrs:[]);
      setBizBreaks(Array.isArray(brks)?brks:[]);
      setLoaded(true);
    });
  }, []);

  if (!loaded) return (
    <div style={{ padding:48, textAlign:'center' }}>
      <div style={{ width:28,height:28,borderRadius:99,border:'2px solid rgba(17,24,39,0.2)',
        borderTopColor:'#1a73e8',animation:'spin .8s linear infinite',margin:'0 auto' }}/>
    </div>
  );

  return (
    <TeamTab
      employees={employees.filter(e=>e.is_active!==false)}
      businessHours={businessHours}
      bizBreaks={bizBreaks}
      showToast={showToast}
      theme={theme}
    />
  );
}
