import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, setup2fa, enable2fa, disable2fa } from '../lib/auth.js';
import AppShell from '../components/AppShell.jsx';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [me, setMe]               = useState(null);
  const [setupData, setSetupData] = useState(null); // { secret, qrDataUrl }
  const [code, setCode]           = useState('');
  const [password, setPassword]   = useState('');
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');

  async function refreshMe() {
    try {
      const data = await getMe();
      setMe(data);
    } catch {
      navigate('/login', { replace: true });
    }
  }
  useEffect(() => { refreshMe(); }, []);

  async function startSetup() {
    setError(''); setSuccess('');
    setBusy(true);
    try {
      const data = await setup2fa();
      setSetupData(data);
    } catch (err) {
      setError(err && err.message ? err.message : 'Erreur.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    setBusy(true);
    try {
      await enable2fa(setupData.secret, code);
      setSetupData(null);
      setCode('');
      setSuccess('2FA activee.');
      await refreshMe();
    } catch (err) {
      setError(err && err.message ? err.message : 'Code invalide.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDisable(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    setBusy(true);
    try {
      await disable2fa(password, code);
      setPassword(''); setCode('');
      setSuccess('2FA desactivee.');
      await refreshMe();
    } catch (err) {
      setError(err && err.message ? err.message : 'Erreur.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell me={me} footer="Salon DZ Admin — Reglages">
      <h1 className="dash-title">{"Reglages compte"}</h1>

        <section className="card">
          <div className="card-head">
            <h2 className="card-title">{"Authentification a deux facteurs"}</h2>
            <span className={"badge " + (me?.totp_enabled ? 'badge-on' : 'badge-off')}>
              {me?.totp_enabled ? 'Active' : 'Inactive'}
            </span>
          </div>
          <p className="card-sub">
            {"Une application d'authentification (Google Authenticator, Authy, 1Password, etc.) genere un code a 6 chiffres a saisir apres votre mot de passe. Tous les codes precedents deviennent invalides."}
          </p>

          {error   && <div className="login-error">{error}</div>}
          {success && <div className="login-success">{success}</div>}

          {me && !me.totp_enabled && !setupData && (
            <button className="btn-primary" onClick={startSetup} disabled={busy}>
              {busy ? '...' : 'Activer la 2FA'}
            </button>
          )}

          {setupData && (
            <form onSubmit={confirmEnable} className="totp-setup">
              <p className="totp-step">{"1. Scannez ce QR code avec votre application :"}</p>
              <div className="totp-qr">
                <img src={setupData.qrDataUrl} alt="QR code 2FA" width={240} height={240} />
              </div>
              <p className="totp-step">{"2. Ou saisissez la cle manuellement :"}</p>
              <code className="totp-secret">{setupData.secret}</code>
              <p className="totp-step">{"3. Entrez le code a 6 chiffres affiche :"}</p>
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
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button type="submit" className="btn-primary" disabled={busy || code.length !== 6} style={{ flex: 1 }}>
                  {busy ? '...' : 'Confirmer'}
                </button>
                <button type="button" className="btn-ghost" onClick={() => { setSetupData(null); setCode(''); setError(''); }}>
                  {"Annuler"}
                </button>
              </div>
            </form>
          )}

          {me && me.totp_enabled && (
            <form onSubmit={confirmDisable} className="totp-disable">
              <p className="card-sub" style={{ marginBottom: '12px' }}>
                {"Pour desactiver, confirmez votre mot de passe + un code valide."}
              </p>
              <label className="field" style={{ marginBottom: '12px' }}>
                <span>{"Mot de passe"}</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
              <label className="field" style={{ marginBottom: '12px' }}>
                <span>{"Code 2FA actuel"}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  required
                  style={{ letterSpacing: '0.5em', textAlign: 'center' }}
                />
              </label>
              <button type="submit" className="btn-danger" disabled={busy || code.length !== 6 || !password}>
                {busy ? '...' : 'Desactiver la 2FA'}
              </button>
            </form>
          )}
        </section>

        <section className="card">
          <h2 className="card-title">{"Compte"}</h2>
          <ul className="dash-list">
            <li><span className="k">Email</span><span className="v">{me?.email || '—'}</span></li>
            <li><span className="k">{"Role"}</span><span className="v">{me?.role || '—'}</span></li>
            <li><span className="k">{"Derniere connexion"}</span><span className="v">{me?.last_login_at ? new Date(me.last_login_at).toLocaleString('fr-FR') : '—'}</span></li>
          </ul>
        </section>
    </AppShell>
  );
}
