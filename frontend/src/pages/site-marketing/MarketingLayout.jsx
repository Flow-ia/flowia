import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { LightThemeProvider, useTheme } from '../../hooks/useTheme';
import Header from './components/Header';
import Footer from './components/Footer';

// Wrapper pour FORCER le light mode sur tout le site marketing, quel que
// soit le toggle dark/light que l'utilisateur a active dans l'app commercant.
export default function MarketingLayout() {
  return (
    <LightThemeProvider>
      <MarketingShell />
    </LightThemeProvider>
  );
}

function MarketingShell() {
  const { theme: t } = useTheme();
  const loc = useLocation();

  useEffect(() => {
    if (loc.hash) {
      const el = document.getElementById(loc.hash.slice(1));
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [loc.pathname, loc.hash]);

  return (
    <div style={{
      minHeight: '100vh',
      background: t.canvas,
      color: t.text,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      display: 'flex', flexDirection: 'column',
    }}>
      <Header />
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
