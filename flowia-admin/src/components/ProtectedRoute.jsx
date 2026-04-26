import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { isAuthenticated, bootstrapAuth } from '../lib/auth.js';

export default function ProtectedRoute({ children }) {
  const initiallyAuthed = isAuthenticated();
  const [loading, setLoading] = useState(!initiallyAuthed);
  const [authed, setAuthed]   = useState(initiallyAuthed);

  useEffect(() => {
    if (initiallyAuthed) return;
    let cancelled = false;
    (async () => {
      const ok = await bootstrapAuth();
      if (cancelled) return;
      setAuthed(!!ok);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [initiallyAuthed]);

  if (loading) return <div className="splash">{"Verification de la session..."}</div>;
  if (!authed) return <Navigate to="/login" replace />;
  return children;
}
