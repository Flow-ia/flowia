// /portail-client — marketplace publique de commercants FlowIA.
//
// Style Planity : hero avec barre de recherche unifiee + bouton "Pres de moi"
// (geoloc), grille de cards merchants avec badges programmes (parrainage,
// fidelite, code promo, paiement en ligne, RDV immediat).
//
// FDS-2026 : pas d'emoji, fw <= 500, bordures 0.5/1px, pas de gradient.
// Aucune auth requise. Cache backend 60s. Geoloc opt-in (clic explicite).
import { useEffect, useRef, useState } from 'react';
import { pubApi } from '../../utils/api';
import { I } from '../../utils/icons';
import { S, primaryBtnStyle, primaryHover, ghostBtnStyle, ghostHover } from './components/shadcn';
import { PageHero } from './components/Shared';
import MerchantSearchCard from './components/MerchantSearchCard';
import { BUSINESS_TYPES } from '../../utils/businessTypes';

const PAGE_SIZE = 24;

// Style commun des chips de filtre type de commerce.
function chipStyle(active) {
  return {
    padding: '7px 12px', borderRadius: 999, cursor: 'pointer',
    fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
    background: active ? S.fg : S.bg,
    color: active ? S.fgInv : S.fg,
    border: `1px solid ${active ? S.fg : S.border}`,
    transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
    whiteSpace: 'nowrap',
  };
}

// Geoloc — utilisee uniquement sur clic explicite (pas de prompt automatique).
function getBrowserGeolocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocalisation indisponible.'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { timeout: 8000, maximumAge: 60_000 },
    );
  });
}

export default function ClientPortal() {
  const [query, setQuery]   = useState('');
  const [bizType, setBizType] = useState(''); // '' = tous types
  const [geo,   setGeo]     = useState(null);   // { lat, lng } ou null
  const [geoErr,setGeoErr]  = useState('');
  const [geoLoad,setGeoLoad]= useState(false);
  const [items, setItems]   = useState([]);
  const [total, setTotal]   = useState(0);
  const [hasMore,setHasMore]= useState(false);
  const [discoveryMode, setDiscoveryMode] = useState(false);
  const [loading,setLoading]= useState(false);
  const [error, setError]   = useState('');
  const [offset,setOffset]  = useState(0);
  const reqId = useRef(0);

  // Charge la premiere page au montage (sans geo, sans query) pour montrer
  // un apercu des commercants disponibles (utile en SEO / decouvrabilite).
  // Recharge sur changement de query (debounce 350 ms) ou geo.
  useEffect(() => {
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const r = await pubApi.searchMarketplace({
          q: query.trim(),
          type: bizType || undefined,
          limit: PAGE_SIZE,
          offset: 0,
          ...(geo ? { lat: geo.lat, lng: geo.lng, radius: 30 } : {}),
        });
        if (reqId.current !== id) return; // une recherche plus recente a deja repondu
        setItems(r.items || []);
        setTotal(r.total || 0);
        setHasMore(!!r.hasMore);
        setDiscoveryMode(!!r.discoveryMode);
        setOffset((r.items || []).length);
      } catch (e) {
        if (reqId.current !== id) return;
        setError(e.message || 'Erreur lors de la recherche.');
      } finally {
        if (reqId.current === id) setLoading(false);
      }
    }, query ? 350 : 0); // pas de debounce pour le premier load et les toggles
    return () => clearTimeout(t);
  }, [query, geo, bizType]);

  const loadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const r = await pubApi.searchMarketplace({
        q: query.trim(),
        type: bizType || undefined,
        limit: PAGE_SIZE,
        offset,
        ...(geo ? { lat: geo.lat, lng: geo.lng, radius: 30 } : {}),
      });
      setItems(prev => [...prev, ...(r.items || [])]);
      setHasMore(!!r.hasMore);
      setOffset(prev => prev + PAGE_SIZE);
    } catch (e) {
      setError(e.message || 'Erreur lors du chargement.');
    } finally { setLoading(false); }
  };

  const onGeoClick = async () => {
    if (geo) { setGeo(null); return; } // toggle off
    setGeoErr(''); setGeoLoad(true);
    try {
      const pos = await getBrowserGeolocation();
      setGeo(pos);
    } catch (e) {
      setGeoErr(e.message?.includes('denied') || e.code === 1
        ? 'Vous avez refuse la geolocalisation. Activez-la dans les reglages du navigateur pour voir les salons proches.'
        : 'Impossible de recuperer votre position.');
    } finally { setGeoLoad(false); }
  };

  const inputStyle = {
    width: '100%', padding: '14px 18px 14px 46px',
    borderRadius: 10, fontSize: 15, fontFamily: 'inherit',
    background: S.bg, border: `1px solid ${S.border}`,
    color: S.fg, outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  };

  return (
    <>
      <PageHero
        label="Marketplace"
        title="Trouvez votre salon et reservez en ligne"
        subtitle="Decouvrez les salons FlowIA pres de chez vous, profitez des programmes parrainage, fidelite et codes promo, et reservez en quelques secondes."
      />

      <section style={{
        padding: '0 clamp(12px, 4vw, 24px) 16px',
        background: S.bg, borderBottom: `1px solid ${S.border}`,
      }}>
        <div style={{
          maxWidth: 920, margin: '-32px auto 0',
          padding: 'clamp(12px, 3vw, 18px)', borderRadius: 14,
          background: S.bg, border: `1px solid ${S.border}`,
          boxShadow: S.shadowMd,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ position: 'relative' }}>
            <I.Search style={{
              position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
              width: 18, height: 18, color: S.fgMuted, pointerEvents: 'none',
            }}/>
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                   placeholder="Nom du salon, ville, code postal..."
                   style={inputStyle}
                   onFocus={(e) => { e.currentTarget.style.borderColor = S.fg; e.currentTarget.style.boxShadow = `0 0 0 3px ${S.bgHover}`; }}
                   onBlur={(e)  => { e.currentTarget.style.borderColor = S.border; e.currentTarget.style.boxShadow = 'none'; }}/>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <button type="button" onClick={onGeoClick} disabled={geoLoad}
                    style={{
                      ...(geo ? primaryBtnStyle() : ghostBtnStyle()),
                      height: 38, padding: '0 14px', fontSize: 13,
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}
                    {...(geo ? primaryHover : ghostHover)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              {geoLoad ? 'Localisation...' : geo ? 'Pres de moi (actif)' : 'Pres de moi'}
            </button>
            {geo && (
              <span style={{ fontSize: 12, color: S.fgMuted }}>
                Triage par distance dans un rayon de 30 km
              </span>
            )}
            {geoErr && (
              <span style={{ fontSize: 12, color: S.ax.rose }}>{geoErr}</span>
            )}
          </div>

          {/* Filtre par type de commerce */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 4 }}>
            <button type="button" onClick={() => setBizType('')}
                    style={chipStyle(bizType === '')}>
              Tous les types
            </button>
            {BUSINESS_TYPES.map(bt => (
              <button key={bt.key} type="button"
                      onClick={() => setBizType(bizType === bt.key ? '' : bt.key)}
                      style={chipStyle(bizType === bt.key)}>
                {bt.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: 'clamp(24px, 5vw, 40px) clamp(12px, 4vw, 24px) clamp(48px, 8vw, 80px)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          {/* Bandeau resultats */}
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 8, marginBottom: 18,
          }}>
            <p style={{ margin: 0, fontSize: 13, color: S.fgMuted }}>
              {loading && items.length === 0
                ? 'Recherche...'
                : discoveryMode
                  ? `Une selection de ${items.length} salons sur ${total} disponibles`
                  : total === 0
                    ? 'Aucun salon trouve.'
                    : total === 1
                      ? '1 salon trouve'
                      : `${total} salons trouves`}
              {geo && total > 0 && !discoveryMode && ' · pres de vous'}
              {query && total > 0 && ` · "${query}"`}
            </p>
          </div>

          {error && (
            <div style={{
              padding: '12px 14px', borderRadius: 10, marginBottom: 18,
              background: S.ax.roseBg, color: S.ax.rose, fontSize: 13,
            }}>{error}</div>
          )}

          {/* Grille — mobile-first : sur étroit (<300px), 1 colonne pleine
              largeur ; sinon auto-fill avec colonnes 260px min. minmax(min(100%,...))
              évite que la colonne 280px déborde sur les écrans <320px. */}
          {items.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
              gap: 'clamp(12px, 2vw, 18px)',
            }}>
              {items.map(m => <MerchantSearchCard key={m.slug} merchant={m}/>)}
            </div>
          )}

          {/* Empty state */}
          {!loading && items.length === 0 && !error && (
            <div style={{
              padding: '40px 24px', borderRadius: 14,
              background: S.bgMuted, border: `1px solid ${S.border}`,
              textAlign: 'center',
            }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: S.fg }}>
                Aucun salon ne correspond a votre recherche
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: S.fgMuted, lineHeight: 1.55 }}>
                Essayez avec un autre terme, ou activez &laquo; Pres de moi &raquo; pour decouvrir les salons proches de chez vous.
              </p>
            </div>
          )}

          {/* Load more — masque en mode decouverte */}
          {hasMore && !discoveryMode && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 30 }}>
              <button type="button" onClick={loadMore} disabled={loading}
                      style={{ ...ghostBtnStyle(), height: 40, padding: '0 22px' }}
                      {...ghostHover}>
                {loading ? 'Chargement...' : 'Voir plus de salons'}
              </button>
            </div>
          )}

          {/* CTA en mode decouverte : on incite a affiner pour voir plus */}
          {discoveryMode && total > items.length && (
            <div style={{
              marginTop: 30, padding: '20px 24px', borderRadius: 14,
              background: S.bgMuted, border: `1px solid ${S.border}`,
              textAlign: 'center',
            }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: S.fg }}>
                {total - items.length} autres salons disponibles
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: S.fgMuted, lineHeight: 1.55 }}>
                Activez &laquo; Pres de moi &raquo; ci-dessus, ou tapez le nom d&apos;un salon
                ou d&apos;une ville pour decouvrir les salons qui vous correspondent.
              </p>
            </div>
          )}

          {/* Loading skeleton bas de page */}
          {loading && items.length > 0 && (
            <p style={{ margin: '24px 0 0', textAlign: 'center', fontSize: 13, color: S.fgMuted }}>
              Chargement...
            </p>
          )}
        </div>
      </section>
    </>
  );
}
