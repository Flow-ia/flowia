// /marketplace — marketplace publique des salons Salon DZ.
//
// Version marche algerien : le visiteur arrive depuis la porte homme/femme
// ("/", GenderGate) avec un segment. La page se theme selon le segment
// (barber vert cote hommes, girly rose cote femmes) et propose des filtres
// adaptes : prestations (cils, coloration, barbe, ...), fourchette de prix
// en DA, distance ("pres de moi"), disponibilite sous 7 jours, et des tris
// (plus proche, mieux note, RDV le plus tot).
//
// Donnees : /api/pub/marketplace ne renvoie ni prix, ni note, ni dispo —
// ces infos sont enrichies client-side via useSalonEnrichment (endpoints
// publics existants, compatibles backend prod). Les filtres prix/prestations
// ne s'appliquent qu'aux salons deja enrichis (un salon en cours de
// chargement reste visible : on n'ecarte jamais sur donnee inconnue).
//
// FDS-2026 : pas d'emoji, fw <= 500, bordures 0.5/1px, pas de gradient.
// Aucune auth requise. Cache backend 60s. Geoloc opt-in (clic explicite).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { pubApi } from '../../utils/api';
import { I } from '../../utils/icons';
import { S, ghostBtnStyle, ghostHover } from './components/shadcn';
import Seo from './components/Seo';
import MerchantSearchCard from './components/MerchantSearchCard';
import { useSalonEnrichment, nextSlotLabel } from './components/useSalonEnrichment';

const PAGE_SIZE = 24;

// ── Segments marche DZ ───────────────────────────────────────────────────────
// types       : business_type inclus dans le segment (filtre client-side —
//               l'API ne supporte qu'un seul type a la fois).
// prestations : chips de filtre, matchees par mots-cles sur les noms de
//               services / categories du salon (insensible casse + accents).
const SEGMENTS = {
  homme: {
    key: 'homme',
    accent: '#0a7a3d', accentBg: '#f0fdf4', accentBorder: '#bbf7d0',
    label: 'Espace hommes',
    title: 'Barbiers & coiffeurs pour hommes',
    subtitle: "Coupe, degrade, barbe : trouvez votre barbershop en Algerie et reservez en ligne en quelques secondes.",
    types: ['barbier', 'salon_mixte'],
    prestations: [
      { key: 'coupe',       label: 'Coupe',         kw: ['coupe', 'degrade', 'tondeuse'] },
      { key: 'barbe',       label: 'Barbe',         kw: ['barbe', 'rasage'] },
      { key: 'coupe_barbe', label: 'Coupe + Barbe', kw: ['coupe + barbe', 'coupe+barbe', 'combo'] },
      { key: 'soin',        label: 'Soins',         kw: ['soin', 'massage', 'visage'] },
    ],
  },
  femme: {
    key: 'femme',
    accent: '#db2777', accentBg: '#fdf2f8', accentBorder: '#fbcfe8',
    label: 'Espace femmes',
    title: 'Coiffure, cils & beaute pour femmes',
    subtitle: "Coiffure, coloration, extensions de cils, onglerie, soins : les salons et instituts qui vous ressemblent, partout en Algerie.",
    types: ['coiffeur_femme', 'salon_mixte', 'onglerie', 'institut_beaute', 'spa'],
    prestations: [
      { key: 'cils',       label: 'Cils',              kw: ['cil'] },
      { key: 'coiffure',   label: 'Coiffure',          kw: ['coupe', 'brushing', 'coiff', 'lissage', 'chignon', 'extension'] },
      { key: 'coloration', label: 'Coloration',        kw: ['color', 'meche', 'balayage', 'henn'] },
      { key: 'ongles',     label: 'Onglerie',          kw: ['ongle', 'manucure', 'pedicure', 'vernis', 'gel'] },
      { key: 'soin',       label: 'Soins & epilation', kw: ['soin', 'visage', 'hammam', 'massage', 'epilation'] },
      { key: 'maquillage', label: 'Maquillage',        kw: ['maquillage', 'makeup', 'mariee'] },
    ],
  },
};

function readStoredSegment() {
  try {
    const s = localStorage.getItem('salondz_segment');
    return s === 'homme' || s === 'femme' ? s : null;
  } catch { return null; }
}

// Normalisation pour le matching prestations : minuscules + accents supprimes.
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Un salon matche une prestation si l'un de ses services (nom ou categorie)
// contient un des mots-cles. Retourne true si l'enrichissement n'est pas
// encore charge (on ne masque jamais sur donnee inconnue).
function matchesPrestation(enrichEntry, presta) {
  if (!presta) return true;
  if (!enrichEntry) return true;
  const haystacks = (enrichEntry.services || []).map(s =>
    norm(`${s.name || ''} ${s.booking_category_name || ''} ${s.category_name || ''}`)
  );
  if (!haystacks.length) return true; // pas de services publies → ne pas masquer
  return haystacks.some(h => presta.kw.some(k => h.includes(k)));
}

// Fourchette de prix (DA) : garde le salon si sa gamme [priceMin, priceMax]
// recoupe [min, max]. Salon non enrichi ou sans prix → conserve.
function matchesPrice(enrichEntry, min, max) {
  if (min == null && max == null) return true;
  if (!enrichEntry || enrichEntry.priceMin == null) return true;
  if (max != null && enrichEntry.priceMin > max) return false;
  if (min != null && enrichEntry.priceMax < min) return false;
  return true;
}

// Style commun des chips de filtre, teinte par l'accent du segment.
function chipStyle(active, accent) {
  return {
    padding: '7px 12px', borderRadius: 999, cursor: 'pointer',
    fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
    background: active ? accent : S.bg,
    color: active ? '#fff' : S.fg,
    border: `1px solid ${active ? accent : S.border}`,
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
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSegment = searchParams.get('segment');
  const [segmentKey, setSegmentKey] = useState(
    urlSegment === 'homme' || urlSegment === 'femme'
      ? urlSegment
      : (readStoredSegment() || 'homme')
  );
  const seg = SEGMENTS[segmentKey];

  const [query, setQuery]   = useState('');
  const [geo,   setGeo]     = useState(null);   // { lat, lng } ou null
  const [geoErr,setGeoErr]  = useState('');
  const [geoLoad,setGeoLoad]= useState(false);
  const [radius, setRadius] = useState(30);     // km — filtre distance
  const [presta, setPresta] = useState('');     // key prestation ou ''
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [sort, setSort]     = useState('default'); // default|distance|rating|dispo
  const [dispoOnly, setDispoOnly] = useState(false);
  const [items, setItems]   = useState([]);
  const [total, setTotal]   = useState(0);
  const [hasMore,setHasMore]= useState(false);
  const [discoveryMode, setDiscoveryMode] = useState(false);
  const [loading,setLoading]= useState(false);
  const [error, setError]   = useState('');
  const [offset,setOffset]  = useState(0);
  const reqId = useRef(0);

  // Segment ↔ URL ↔ localStorage (le choix de la porte "/" est conserve).
  const switchSegment = (key) => {
    if (key === segmentKey) return;
    setSegmentKey(key);
    setPresta('');
    try { localStorage.setItem('salondz_segment', key); } catch {}
    setSearchParams({ segment: key }, { replace: true });
  };
  useEffect(() => {
    if (urlSegment !== segmentKey) setSearchParams({ segment: segmentKey }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Charge la premiere page au montage. Recharge sur changement de query
  // (debounce 350 ms), geo ou rayon. Le filtrage segment/prestations/prix se
  // fait client-side (l'API ne connait ni segments multi-types ni prix).
  useEffect(() => {
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const r = await pubApi.searchMarketplace({
          q: query.trim(),
          limit: PAGE_SIZE,
          offset: 0,
          ...(geo ? { lat: geo.lat, lng: geo.lng, radius } : {}),
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
  }, [query, geo, radius]);

  const loadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const r = await pubApi.searchMarketplace({
        q: query.trim(),
        limit: PAGE_SIZE,
        offset,
        ...(geo ? { lat: geo.lat, lng: geo.lng, radius } : {}),
      });
      setItems(prev => [...prev, ...(r.items || [])]);
      setHasMore(!!r.hasMore);
      setOffset(prev => prev + PAGE_SIZE);
    } catch (e) {
      setError(e.message || 'Erreur lors du chargement.');
    } finally { setLoading(false); }
  };

  const onGeoClick = async () => {
    if (geo) { setGeo(null); if (sort === 'distance') setSort('default'); return null; } // toggle off
    setGeoErr(''); setGeoLoad(true);
    try {
      const pos = await getBrowserGeolocation();
      setGeo(pos);
      return pos;
    } catch (e) {
      setGeoErr(e.message?.includes('denied') || e.code === 1
        ? 'Vous avez refuse la geolocalisation. Activez-la dans les reglages du navigateur pour voir les salons proches.'
        : 'Impossible de recuperer votre position.');
      return null;
    } finally { setGeoLoad(false); }
  };

  // Tri "plus proche" : active la geoloc si besoin, puis trie par distance.
  const onSortDistance = async () => {
    if (sort === 'distance') { setSort('default'); return; }
    if (!geo) {
      const pos = await onGeoClick();
      if (!pos) return; // geoloc refusee → on ne change pas le tri
    }
    setSort('distance');
  };

  // ── Enrichissement (prix, note, dispo) ────────────────────────────────────
  const withAvail = sort === 'dispo' || dispoOnly;
  const { enrich, avail } = useSalonEnrichment(items, withAvail);

  // ── Pipeline filtres + tri client-side ────────────────────────────────────
  const prestaDef = seg.prestations.find(p => p.key === presta) || null;
  const pMin = priceMin !== '' && Number.isFinite(Number(priceMin)) ? Number(priceMin) : null;
  const pMax = priceMax !== '' && Number.isFinite(Number(priceMax)) ? Number(priceMax) : null;

  const visible = useMemo(() => {
    let list = items.filter(m =>
      // Segment : business_type inclus (type inconnu/null → visible partout).
      (!m.businessType || seg.types.includes(m.businessType))
      && matchesPrestation(enrich[m.slug], prestaDef)
      && matchesPrice(enrich[m.slug], pMin, pMax)
      // Dispo sous 7 jours : n'ecarte que les salons sondes ET complets.
      && (!dispoOnly || !(avail[m.slug]?.none))
    );
    if (sort === 'distance') {
      list = [...list].sort((a, b) =>
        (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    } else if (sort === 'rating') {
      list = [...list].sort((a, b) =>
        (enrich[b.slug]?.rating ?? -1) - (enrich[a.slug]?.rating ?? -1));
    } else if (sort === 'dispo') {
      const rank = (m) => {
        const n = avail[m.slug];
        if (!n) return 10_000;            // pas encore sonde → fin de liste
        if (n.none) return 20_000;        // complet 7 jours → tout en bas
        const [h, min] = String(n.time || '').split(':').map(v => parseInt(v, 10) || 0);
        return n.dayOffset * 1440 + h * 60 + min;
      };
      list = [...list].sort((a, b) => rank(a) - rank(b));
    }
    return list;
  }, [items, seg, enrich, avail, prestaDef, pMin, pMax, sort, dispoOnly]);

  const inputStyle = {
    width: '100%', padding: '14px 18px 14px 46px',
    borderRadius: 10, fontSize: 15, fontFamily: 'inherit',
    background: S.bg, border: `1px solid ${S.border}`,
    color: S.fg, outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  };
  const priceInputStyle = {
    width: 96, padding: '8px 10px', borderRadius: 8,
    fontSize: 13, fontFamily: 'inherit', background: S.bg,
    border: `1px solid ${S.border}`, color: S.fg, outline: 'none',
    boxSizing: 'border-box',
  };
  const sortChip = (key) => chipStyle(sort === key, seg.accent);

  const segPill = (key, label) => (
    <button type="button" onClick={() => switchSegment(key)}
            style={{
              padding: '8px 16px', borderRadius: 999, cursor: 'pointer',
              fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
              background: segmentKey === key ? SEGMENTS[key].accent : S.bg,
              color: segmentKey === key ? '#fff' : S.fg,
              border: `1px solid ${segmentKey === key ? SEGMENTS[key].accent : S.border}`,
              transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
            }}>
      {label}
    </button>
  );

  return (
    <>
      <Seo
        path="/marketplace"
        title={segmentKey === 'femme'
          ? 'Salons de coiffure, cils & beaute pour femmes en Algerie | Salon DZ'
          : 'Barbiers & coiffeurs pour hommes en Algerie | Salon DZ'}
        description={seg.subtitle}
      />

      {/* Hero theme par segment */}
      <section style={{
        background: seg.accentBg, borderBottom: `1px solid ${seg.accentBorder}`,
        padding: 'clamp(28px, 6vw, 52px) clamp(12px, 4vw, 24px) 56px',
      }}>
        <div style={{ maxWidth: 920, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 18 }}>
            {segPill('homme', 'Hommes')}
            {segPill('femme', 'Femmes')}
          </div>
          <p style={{
            margin: '0 0 8px', fontSize: 12, fontWeight: 500, letterSpacing: 1.2,
            textTransform: 'uppercase', color: seg.accent,
          }}>
            {seg.label}
          </p>
          <h1 style={{
            margin: '0 0 10px', fontSize: 'clamp(24px, 4vw, 34px)',
            fontWeight: 500, letterSpacing: -0.8, color: S.fg,
          }}>
            {seg.title}
          </h1>
          <p style={{ margin: '0 auto', fontSize: 14.5, color: S.fgMuted, maxWidth: 560, lineHeight: 1.6 }}>
            {seg.subtitle}
          </p>
        </div>
      </section>

      {/* Barre recherche + filtres */}
      <section style={{
        padding: '0 clamp(12px, 4vw, 24px) 16px',
        background: S.bg, borderBottom: `1px solid ${S.border}`,
      }}>
        <div style={{
          maxWidth: 920, margin: '-36px auto 0',
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
                   placeholder="Nom du salon, ville (Alger, Oran, Constantine...)"
                   style={inputStyle}
                   onFocus={(e) => { e.currentTarget.style.borderColor = seg.accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${seg.accentBg}`; }}
                   onBlur={(e)  => { e.currentTarget.style.borderColor = S.border; e.currentTarget.style.boxShadow = 'none'; }}/>
          </div>

          {/* Geoloc + rayon */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <button type="button" onClick={onGeoClick} disabled={geoLoad}
                    style={{
                      ...(geo
                        ? { ...ghostBtnStyle(), background: seg.accent, border: `1px solid ${seg.accent}`, color: '#fff' }
                        : ghostBtnStyle()),
                      height: 38, padding: '0 14px', fontSize: 13,
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}
                    {...(geo ? {} : ghostHover)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              {geoLoad ? 'Localisation...' : geo ? 'Pres de moi (actif)' : 'Pres de moi'}
            </button>
            {geo && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: S.fgMuted }}>
                {"Rayon"}
                <select value={radius} onChange={(e) => setRadius(parseInt(e.target.value, 10))}
                        style={{
                          padding: '5px 8px', borderRadius: 8, fontSize: 12,
                          fontFamily: 'inherit', border: `1px solid ${S.border}`,
                          background: S.bg, color: S.fg,
                        }}>
                  <option value={5}>5 km</option>
                  <option value={10}>10 km</option>
                  <option value={20}>20 km</option>
                  <option value={30}>30 km</option>
                  <option value={50}>50 km</option>
                </select>
              </span>
            )}
            {geoErr && (
              <span style={{ fontSize: 12, color: S.ax.rose }}>{geoErr}</span>
            )}
          </div>

          {/* Prestations du segment */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 4 }}>
            <button type="button" onClick={() => setPresta('')}
                    style={chipStyle(presta === '', seg.accent)}>
              {"Toutes les prestations"}
            </button>
            {seg.prestations.map(p => (
              <button key={p.key} type="button"
                      onClick={() => setPresta(presta === p.key ? '' : p.key)}
                      style={chipStyle(presta === p.key, seg.accent)}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Prix (DA) + dispo */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, fontWeight: 500, color: S.fg }}>{"Prix (DA)"}</span>
            <input type="number" min="0" inputMode="numeric" placeholder="Min"
                   value={priceMin} onChange={(e) => setPriceMin(e.target.value)}
                   style={priceInputStyle} aria-label="Prix minimum en dinars"/>
            <span style={{ fontSize: 12, color: S.fgSubtle }}>{"–"}</span>
            <input type="number" min="0" inputMode="numeric" placeholder="Max"
                   value={priceMax} onChange={(e) => setPriceMax(e.target.value)}
                   style={priceInputStyle} aria-label="Prix maximum en dinars"/>
            <button type="button" onClick={() => setDispoOnly(v => !v)}
                    style={chipStyle(dispoOnly, seg.accent)}>
              {"Disponible sous 7 jours"}
            </button>
          </div>

          {/* Tris */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, fontWeight: 500, color: S.fg, marginRight: 2 }}>{"Trier :"}</span>
            <button type="button" onClick={() => setSort('default')} style={sortChip('default')}>
              {"Recommandes"}
            </button>
            <button type="button" onClick={onSortDistance} style={sortChip('distance')}>
              {"Le plus proche"}
            </button>
            <button type="button" onClick={() => setSort(sort === 'rating' ? 'default' : 'rating')} style={sortChip('rating')}>
              {"Mieux notes"}
            </button>
            <button type="button" onClick={() => setSort(sort === 'dispo' ? 'default' : 'dispo')} style={sortChip('dispo')}>
              {"RDV le plus tot"}
            </button>
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
                : visible.length === 0
                  ? 'Aucun salon trouve.'
                  : visible.length === 1
                    ? '1 salon'
                    : `${visible.length} salons`}
              {geo && visible.length > 0 && ' · pres de vous'}
              {query && visible.length > 0 && ` · "${query}"`}
              {sort === 'dispo' && ' · tri par prochain RDV'}
              {sort === 'rating' && ' · tri par note'}
            </p>
          </div>

          {error && (
            <div style={{
              padding: '12px 14px', borderRadius: 10, marginBottom: 18,
              background: S.ax.roseBg, color: S.ax.rose, fontSize: 13,
            }}>{error}</div>
          )}

          {/* Grille — mobile-first : auto-fill avec colonnes 260px min.
              minmax(min(100%,...)) evite le debordement sur ecrans <320px. */}
          {visible.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
              gap: 'clamp(12px, 2vw, 18px)',
            }}>
              {visible.map(m => (
                <MerchantSearchCard
                  key={m.slug}
                  merchant={m}
                  accent={seg.accent}
                  accentBg={seg.accentBg}
                  enrichment={enrich[m.slug]}
                  nextSlot={withAvail ? (avail[m.slug] ?? null) : undefined}
                  nextSlotText={withAvail ? nextSlotLabel(avail[m.slug]) : null}
                />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && visible.length === 0 && !error && (
            <div style={{
              padding: '40px 24px', borderRadius: 14,
              background: S.bgMuted, border: `1px solid ${S.border}`,
              textAlign: 'center',
            }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: S.fg }}>
                {"Aucun salon ne correspond a vos criteres"}
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: S.fgMuted, lineHeight: 1.55 }}>
                {"Essayez d'elargir la fourchette de prix, de retirer un filtre, ou activez « Pres de moi » pour decouvrir les salons proches de chez vous."}
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
                {`${total - items.length} autres salons disponibles`}
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: S.fgMuted, lineHeight: 1.55 }}>
                {"Activez « Pres de moi » ci-dessus, ou tapez le nom d'un salon ou d'une ville pour decouvrir les salons qui vous correspondent."}
              </p>
            </div>
          )}

          {/* Loading bas de page */}
          {loading && items.length > 0 && (
            <p style={{ margin: '24px 0 0', textAlign: 'center', fontSize: 13, color: S.fgMuted }}>
              {"Chargement..."}
            </p>
          )}
        </div>
      </section>
    </>
  );
}
