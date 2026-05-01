import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { I } from '../../utils/icons';
import { PageHero } from './components/Shared';

export default function ClientPortal() {
  const { theme: t } = useTheme();
  const [query, setQuery] = useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    // V1 : pas de marketplace - on indique que la recherche arrive bientôt.
    // À terme, brancher sur /api/pub/search-salons côté backend.
  };

  const inp = {
    width: '100%', padding: '14px 18px',
    borderRadius: 10, fontSize: 15, fontFamily: 'inherit',
    background: t.inputBg, border: `0.5px solid ${t.borderInput}`,
    color: t.text, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <>
      <PageHero
        label="Portail client"
        title="Accédez à votre espace personnel"
        subtitle="Retrouvez vos rendez-vous, votre historique et vos points de fidélité depuis le site de votre salon."
      />

      <section style={{ padding: '40px 24px 80px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{
            padding: 32, borderRadius: 14,
            background: t.canvas, border: `0.5px solid ${t.border}`,
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 500, color: t.text, margin: 0, marginBottom: 8 }}>
              Trouver mon salon
            </h2>
            <p style={{ fontSize: 14, color: t.textSub, lineHeight: 1.6, margin: 0, marginBottom: 22 }}>
              Saisissez le nom du salon où vous prenez rendez-vous. Vous serez redirigé·e vers sa page de réservation pour vous connecter à votre espace client.
            </p>
            <form onSubmit={handleSearch} style={{ position: 'relative', marginBottom: 8 }}>
              <I.Search style={{
                position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                width: 16, height: 16, color: t.muted, pointerEvents: 'none',
              }} />
              <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Nom du salon, ville…"
                style={{ ...inp, paddingLeft: 44 }} />
            </form>
            <p style={{ fontSize: 12, color: t.muted, margin: 0, lineHeight: 1.5 }}>
              {"La recherche globale arrive bientôt. En attendant, demandez le lien direct à votre salon ou cherchez son nom suivi de \"FlowIA\" sur Google."}
            </p>
          </div>

          <div style={{ marginTop: 40 }}>
            <h3 style={{ fontSize: 16, fontWeight: 500, color: t.text, margin: 0, marginBottom: 18 }}>
              {"Comment ça marche ?"}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                {
                  Ic: I.Search, title: 'Trouvez votre salon',
                  desc: "Demandez à votre salon son lien de réservation FlowIA, ou scannez son QR code en vitrine.",
                },
                {
                  Ic: I.User, title: 'Connectez-vous',
                  desc: "Sur la page de votre salon, cliquez sur \"Connexion\". Vous pouvez utiliser votre Google ou créer un compte simple.",
                },
                {
                  Ic: I.Calendar, title: 'Gérez vos RDV',
                  desc: "Accédez à votre historique, prenez de nouveaux rendez-vous, suivez vos points de fidélité et consultez vos passages.",
                },
              ].map((s) => (
                <div key={s.title} style={{
                  padding: 18, borderRadius: 12,
                  background: t.cardAlt, border: `0.5px solid ${t.border}`,
                  display: 'flex', gap: 14,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: t.canvas, border: `0.5px solid ${t.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <s.Ic style={{ width: 16, height: 16, color: t.text }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 500, color: t.text, margin: 0, marginBottom: 2 }}>
                      {s.title}
                    </p>
                    <p style={{ fontSize: 13, color: t.textSub, margin: 0, lineHeight: 1.55 }}>
                      {s.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{
            marginTop: 40, padding: 18, borderRadius: 10,
            background: t.cardAlt, border: `0.5px solid ${t.border}`,
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <I.Mail style={{ width: 16, height: 16, color: t.muted, flexShrink: 0, marginTop: 3 }} />
            <p style={{ fontSize: 13, color: t.textSub, margin: 0, lineHeight: 1.6 }}>
              {"Besoin d'aide pour retrouver votre compte ? Écrivez-nous à "}
              <a href="mailto:contact@flowiapro.com" style={{ color: t.text }}>contact@flowiapro.com</a>
              {" et nous vous orientons vers votre salon."}
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
