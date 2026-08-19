// MerchantResetSection — UI super-admin pour reinitialiser des donnees d'un
// commercant (transactions sur place, transactions agenda, RDV, ou tout).
// Confirmation OBLIGATOIRE par saisie exacte du business_name pour limiter
// les fausses manips. Backend = POST /api/admin/merchants/:id/reset.
import { useState } from 'react';
import { resetMerchantData } from '../lib/admin.js';

// Features qui supportent un range de dates (transactions/RDV/all).
// Les autres ('credits', 'clients') sont des wipes globaux sans plage temporelle.
const NO_DATE_FEATURES = new Set(['credits', 'clients']);

const FEATURES = [
  {
    key: 'transactions_walkin',
    label: 'Encaissements sur place',
    desc: "Supprime les ventes/transactions creees depuis la caisse SANS lien avec un RDV. Garde l'agenda intact.",
  },
  {
    key: 'transactions_appointment',
    label: 'Encaissements via RDV (agenda)',
    desc: "Supprime les transactions liees a un RDV ET remet le statut 'paid=false' sur ces RDV (ils restent presents dans l'agenda).",
  },
  {
    key: 'transactions_all',
    label: 'TOUS les encaissements',
    desc: "Supprime toutes les transactions (sur place + RDV) + remet 'paid=false' sur les RDV concernes.",
  },
  {
    key: 'appointments',
    label: "RDV / agenda",
    desc: "Supprime les RDV (passes, futurs, annules) + leurs lignes detaillees + leurs encaissements lies.",
  },
  {
    key: 'all',
    label: 'TOUT (RDV + encaissements)',
    desc: "Remise a zero complete : tous les RDV + toutes les transactions. Le commerce, ses employes, sa configuration et ses clients restent intacts.",
  },
  {
    key: 'credits',
    label: 'Crédits & dettes (factory reset)',
    desc: "Remet a ZERO tous les credits/avoirs et toutes les ardoises (dettes) des clients chez ce commercant. Vide aussi le registre Creances orphelines. Apres : aucun client n'a plus de solde non nul. NE TOUCHE PAS aux fiches client ni a l'historique de transactions/RDV.",
  },
  {
    key: 'clients',
    label: 'Fichier clients (factory reset)',
    desc: "SUPPRIME TOUTES les fiches clients de ce commercant + les notes + la fidelite + les credits + le registre Creances. Les transactions/RDV passes sont anonymises (montants conserves pour la compta, coordonnees personnelles effacees). Les comptes plateforme Salon DZ des clients (qui leur permettent de reserver chez d'autres commercants) restent intacts.",
  },
];

export default function MerchantResetSection({ merchant }) {
  const [feature, setFeature] = useState('transactions_walkin');
  const [from, setFrom]       = useState('');
  const [to, setTo]           = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [open, setOpen]       = useState(false);   // formulaire deroule
  const [confirmOpen, setConfirmOpen] = useState(false); // modale
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [result, setResult]   = useState(null);

  const featCfg = FEATURES.find(f => f.key === feature);
  const expectedName = String(merchant?.business_name || '').trim();
  const nameOk = confirmName.trim().toLowerCase() === expectedName.toLowerCase() && expectedName.length > 0;

  function reset() {
    setOpen(false); setConfirmOpen(false);
    setFrom(''); setTo(''); setConfirmName('');
    setError(''); setResult(null);
  }

  async function doReset() {
    setBusy(true); setError(''); setResult(null);
    try {
      const r = await resetMerchantData(merchant.id, {
        feature,
        from: from || undefined,
        to:   to   || undefined,
        confirmBusinessName: confirmName,
      });
      setResult(r);
      setConfirmOpen(false);
      setConfirmName('');
    } catch (err) {
      setError(err?.message || 'Erreur reseau.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card card-danger">
      <div className="card-head">
        <h2 className="card-title">{"Reinitialiser des donnees"}</h2>
      </div>
      <p className="card-sub">
        {"Suppression DEFINITIVE (pas de corbeille). Reservez aux remises a zero demandees explicitement par le commercant ou aux comptes de demonstration."}
      </p>

      {result && (
        <div className="alert-success" style={{ marginBottom: 12 }}>
          <strong>{"Reinitialisation effectuee."}</strong>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {`Transactions supprimees: ${result.deleted?.transactions ?? 0}`}<br/>
            {`RDV supprimes: ${result.deleted?.appointments ?? 0}`}
            {result.note && <><br/>{result.note}</>}
          </div>
        </div>
      )}
      {error && <div className="alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      {!open ? (
        <button className="btn-danger" onClick={() => { setOpen(true); setError(''); setResult(null); }}>
          {"Reinitialiser..."}
        </button>
      ) : (
        <div className="form-stack">
          <label className="field">
            <span>{"Type de donnees a supprimer"}</span>
            <select value={feature} onChange={e => setFeature(e.target.value)}>
              {FEATURES.map(f => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </label>
          <p style={{ fontSize: 12, color: '#7c2d12', margin: '-4px 0 8px', lineHeight: 1.5 }}>
            {featCfg?.desc}
          </p>

          {/* Date range affiche uniquement pour les features qui le supportent.
              Credits et clients = factory reset, plage temporelle inapplicable. */}
          {!NO_DATE_FEATURES.has(feature) && (
            <>
              <div style={{ display: 'flex', gap: 12 }}>
                <label className="field" style={{ flex: 1 }}>
                  <span>{"Du (optionnel)"}</span>
                  <input type="date" value={from} onChange={e => setFrom(e.target.value)} max={to || undefined}/>
                </label>
                <label className="field" style={{ flex: 1 }}>
                  <span>{"Au (optionnel)"}</span>
                  <input type="date" value={to} onChange={e => setTo(e.target.value)} min={from || undefined}/>
                </label>
              </div>
              <p style={{ fontSize: 11, color: '#7c2d12', margin: '-4px 0 4px', opacity: 0.85 }}>
                {"Sans plage : tout l'historique est supprime."}
              </p>
            </>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-danger" onClick={() => setConfirmOpen(true)} style={{ flex: 1 }}>
              {"Continuer"}
            </button>
            <button className="btn-ghost" onClick={reset} type="button">{"Annuler"}</button>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, zIndex: 1000,
        }} onClick={(e) => { if (e.target === e.currentTarget && !busy) setConfirmOpen(false); }}>
          <div style={{
            maxWidth: 460, width: '100%', background: '#fff', borderRadius: 12,
            padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
            border: '0.5px solid rgba(239,68,68,0.4)',
          }}>
            <h3 style={{ margin: 0, fontSize: 16, color: '#991b1b' }}>
              {"Confirmer la suppression"}
            </h3>
            <div style={{
              marginTop: 12, padding: '10px 12px', borderRadius: 8,
              background: '#fef2f2', borderLeft: '3px solid #ef4444',
              fontSize: 13, lineHeight: 1.5, color: '#7c2d12',
            }}>
              <div><strong>{"Action :"}</strong> {featCfg?.label}</div>
              {!NO_DATE_FEATURES.has(feature) && (
                <div><strong>{"Periode :"}</strong> {from || to ? `${from || '...'} -> ${to || '...'}` : 'Tout l\'historique'}</div>
              )}
              <div><strong>{"Commercant :"}</strong> {expectedName}</div>
              {feature === 'credits' && (
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  {"Apres cette action : aucun client n'aura plus d'ardoise (dette) ni d'avoir chez ce commercant. Le registre Creances orphelines sera vide."}
                </div>
              )}
              {feature === 'clients' && (
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  {"Apres cette action : le fichier clients sera vide. Les comptes plateforme Salon DZ des clients (qui leur permettent de reserver chez d'autres commercants) restent intacts. L'historique transactions/RDV est conserve pour la compta mais anonymise."}
                </div>
              )}
              <div style={{ marginTop: 6, fontSize: 12 }}>
                {"Cette action est DEFINITIVE et ne peut pas etre annulee."}
              </div>
            </div>

            <label className="field" style={{ marginTop: 16 }}>
              <span style={{ fontSize: 12 }}>
                {"Pour confirmer, tapez exactement : "}
                <code style={{ background: '#fef2f2', padding: '1px 5px', borderRadius: 4, color: '#991b1b' }}>
                  {expectedName}
                </code>
              </span>
              <input
                value={confirmName}
                onChange={e => setConfirmName(e.target.value)}
                autoFocus
                placeholder={expectedName}
                disabled={busy}
              />
            </label>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                className="btn-danger"
                onClick={doReset}
                disabled={!nameOk || busy}
                style={{ flex: 1, opacity: (!nameOk || busy) ? 0.55 : 1 }}
              >
                {busy ? 'Suppression...' : 'Supprimer definitivement'}
              </button>
              <button className="btn-ghost" onClick={() => setConfirmOpen(false)} disabled={busy}>
                {"Annuler"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
