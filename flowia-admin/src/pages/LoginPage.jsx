import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, login2fa, isAuthenticated } from '../lib/auth.js';

export default function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep]               = useState(1);
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [twoFactorToken, setTwoFTok]  = useState('');
  const [code, setCode]               = useState('');
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);

  useEffect(() => {
    if (isAuthenticated()) navigate('/dashboard', { replace: true });
  }, [navigate]);

  async function onSubmitStep1(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result && result.requires2fa) {
        setTwoFTok(result.twoFactorToken);
        setStep(2);
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      setError(err && err.message ? err.message : 'Identifiants invalides.');
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitStep2(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login2fa(twoFactorToken, code);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err && err.message ? err.message : 'Code invalide.');
    } finally {
      setLoading(false);
    }
  }

  function backToStep1() {
    setStep(1);
    setCode('');
    setTwoFTok('');
    setError('');
  }

  return (
    <div className="login-wrap">
      {step === 1 && (
        <form className="login-card" onSubmit={onSubmitStep1} autoComplete="off">
          <div className="login-brand">FlowIA</div>
          <h1 className="login-title">Admin</h1>
          <p className="login-sub">{"Acces restreint"}</p>

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </label>

          <label className="field">
            <span>{"Mot de passe"}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      )}

      {step === 2 && (
        <form className="login-card" onSubmit={onSubmitStep2} autoComplete="off">
          <div className="login-brand">FlowIA</div>
          <h1 className="login-title">{"Verification 2FA"}</h1>
          <p className="login-sub">{"Saisissez le code a 6 chiffres affiche par votre application d'authentification."}</p>

          <label className="field">
            <span>Code</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
              autoFocus
              style={{ letterSpacing: '0.5em', fontSize: '18px', textAlign: 'center' }}
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading || code.length !== 6}>
            {loading ? 'Verification...' : 'Valider'}
          </button>
          <button type="button" className="btn-ghost" onClick={backToStep1} style={{ marginTop: '4px' }}>
            {"Retour"}
          </button>
        </form>
      )}
    </div>
  );
}
