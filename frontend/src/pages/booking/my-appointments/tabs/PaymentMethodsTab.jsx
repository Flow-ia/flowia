// src/pages/booking/my-appointments/tabs/PaymentMethodsTab.jsx
// Onglet : cartes sauvegardees globales FlowIA (Stripe Shared Customer).
// Liste les cartes du client global, permet de definir une carte par defaut
// et de supprimer une carte. La sauvegarde initiale se fait pendant un
// paiement de reservation -- pas d'ajout direct depuis cette page (Stripe
// SetupIntent demande un PaymentElement, et on veut pas dupliquer le flow
// ici qui n'a pas de contexte salon connecte).

import { useEffect, useState } from 'react';
import { globalClientApi } from '../../../../utils/api';
import { Confirm, useToast, Toast } from '../../../../components/UI';

export function PaymentMethodsTab({ th }) {
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null); // method object ou null
  const [toast, showToast] = useToast();

  const reload = async () => {
    setLoading(true);
    try {
      const r = await globalClientApi.paymentMethods();
      setMethods(Array.isArray(r?.methods) ? r.methods : []);
    } catch (e) {
      showToast(e.message || 'Erreur de chargement.', 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  const handleSetDefault = async (m) => {
    if (m.is_default || busyId) return;
    setBusyId(m.id);
    try {
      await globalClientApi.setDefaultPaymentMethod(m.id);
      await reload();
      showToast('Carte definie par defaut.', 'ok');
    } catch (e) {
      showToast(e.message || 'Erreur.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    const m = confirmDel;
    if (!m) return;
    setConfirmDel(null);
    setBusyId(m.id);
    try {
      await globalClientApi.deletePaymentMethod(m.id);
      await reload();
      showToast('Carte supprimee.', 'ok');
    } catch (e) {
      showToast(e.message || 'Erreur.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const isExpired = (m) => {
    if (!m.exp_month || !m.exp_year) return false;
    const now = new Date();
    return (m.exp_year < now.getFullYear())
        || (m.exp_year === now.getFullYear() && m.exp_month < (now.getMonth() + 1));
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 500, color: th.text, margin: '0 0 6px',
        letterSpacing: '-0.02em' }}>
        {"Mes moyens de paiement"}
      </h2>
      <p style={{ fontSize: 12, color: th.muted, margin: '0 0 20px', lineHeight: 1.5 }}>
        {"Ces cartes sont chiffrees par Stripe et reutilisables sur tous les salons Salon DZ. "}
        {"Pour ajouter une carte, cochez « Sauvegarder cette carte » lors d'une prochaine reservation."}
      </p>

      {loading && (
        <p style={{ fontSize: 12, color: th.muted }}>{"Chargement…"}</p>
      )}

      {!loading && methods.length === 0 && (
        <div style={{
          padding: 18, borderRadius: 12,
          background: th.card, border: `0.5px solid ${th.border}`,
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 13, color: th.muted, margin: 0 }}>
            {"Aucune carte sauvegardee pour le moment."}
          </p>
        </div>
      )}

      {!loading && methods.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {methods.map(m => {
            const expired = isExpired(m);
            const brandLabel = (m.brand || 'Carte').replace(/^./, c => c.toUpperCase());
            return (
              <div key={m.id} style={{
                padding: 14, borderRadius: 12,
                background: th.card, border: `0.5px solid ${th.border}`,
                display: 'flex', flexDirection: 'column', gap: 10,
                opacity: busyId === m.id ? 0.6 : 1,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: th.text }}>
                      {`${brandLabel} ···· ${m.last4 || '????'}`}
                    </span>
                    <span style={{ fontSize: 11, color: expired ? '#ef4444' : th.muted,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                      {m.exp_month && m.exp_year
                        ? `Expire ${String(m.exp_month).padStart(2,'0')}/${String(m.exp_year).slice(-2)}`
                        : ''}
                      {expired && ' · carte expiree'}
                    </span>
                  </div>
                  {m.is_default && (
                    <span style={{
                      fontSize: 10, fontWeight: 500, padding: '4px 9px', borderRadius: 99,
                      background: 'rgba(34,197,94,0.10)',
                      border: '0.5px solid rgba(34,197,94,0.3)',
                      color: '#15803d',
                    }}>
                      {"Par defaut"}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {!m.is_default && (
                    <button type="button"
                            onClick={() => handleSetDefault(m)}
                            disabled={busyId === m.id}
                            style={{
                              flex: 1, padding: '9px 12px', borderRadius: 9,
                              background: 'transparent',
                              border: `0.5px solid ${th.border}`,
                              color: th.text, fontSize: 12, fontWeight: 500,
                              cursor: busyId === m.id ? 'wait' : 'pointer',
                            }}>
                      {"Definir par defaut"}
                    </button>
                  )}
                  <button type="button"
                          onClick={() => setConfirmDel(m)}
                          disabled={busyId === m.id}
                          style={{
                            flex: 1, padding: '9px 12px', borderRadius: 9,
                            background: 'transparent',
                            border: '0.5px solid rgba(239,68,68,0.4)',
                            color: '#ef4444', fontSize: 12, fontWeight: 500,
                            cursor: busyId === m.id ? 'wait' : 'pointer',
                          }}>
                    {"Supprimer"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Confirm
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={handleDelete}
        title="Supprimer cette carte ?"
        message={confirmDel
          ? `La carte ${(confirmDel.brand || 'carte').replace(/^./, c => c.toUpperCase())} ···· ${confirmDel.last4 || '????'} sera supprimee. Vous devrez la ressaisir pour vos prochaines reservations Salon DZ.`
          : ''}
        danger
      />
      <Toast msg={toast?.msg} type={toast?.type} />
    </div>
  );
}
