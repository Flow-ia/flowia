import { useState, useRef } from 'react';

// Autocomplétion adresse via api-adresse.data.gouv.fr (France)
// Même backend que l'écran d'inscription (AuthFlow).
// onSelect reçoit { address, city, postalCode, lat, lng } quand l'utilisateur clique une suggestion.
const cache = new Map();

export default function AddressAutocomplete({
  value,
  onChange,       // (textValue) => void — appelé à chaque frappe
  onSelect,       // ({address, city, postalCode, lat, lng}) => void — quand un résultat est choisi
  placeholder = '12 rue de la Paix, Paris',
  theme,
  inputStyle = {},
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [busy,        setBusy]        = useState(false);
  const [focus,       setFocus]       = useState(false);
  const timerRef = useRef(null);

  const search = (val) => {
    onChange?.(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!val || val.trim().length < 4) { setSuggestions([]); return; }
    timerRef.current = setTimeout(async () => {
      const key = val.trim().toLowerCase();
      if (cache.has(key)) { setSuggestions(cache.get(key)); return; }
      setBusy(true);
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 3500);
        const r = await fetch(
          `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(val)}&limit=5`,
          { signal: ctrl.signal }
        );
        clearTimeout(timeout);
        const data = await r.json();
        const features = data.features || [];
        cache.set(key, features);
        setSuggestions(features);
      } catch { setSuggestions([]); }
      finally { setBusy(false); }
    }, 500);
  };

  const pick = (s) => {
    const p = s.properties || {};
    onSelect?.({
      address:    p.name || p.label || '',
      city:       p.city || '',
      postalCode: p.postcode || '',
      lat:        s.geometry?.coordinates?.[1] || null,
      lng:        s.geometry?.coordinates?.[0] || null,
    });
    setSuggestions([]);
  };

  return (
    <div style={{ position:'relative' }}>
      <div style={{ position:'relative' }}>
        <input
          type="text"
          value={value || ''}
          onChange={e => search(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 200)}
          placeholder={placeholder}
          autoComplete="off"
          style={inputStyle}
        />
        {busy && (
          <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
            fontSize:11, color: theme?.muted || '#94a3b8' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </span>
        )}
      </div>
      {focus && suggestions.length > 0 && (
        <div style={{ position:'absolute', zIndex:999, width:'100%',
          background: theme?.card || 'white',
          border: `1px solid ${theme?.border || '#e2e8f0'}`,
          borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.12)',
          top:'calc(100% + 4px)', maxHeight:220, overflowY:'auto' }}>
          {suggestions.map((s, i) => {
            const p = s.properties || {};
            return (
              <button key={i} type="button" onClick={() => pick(s)}
                style={{ width:'100%', textAlign:'left', padding:'10px 14px',
                  border:'none', background:'none', cursor:'pointer',
                  fontSize:12, color: theme?.text || '#1e293b',
                  borderBottom: `1px solid ${theme?.border || '#f1f5f9'}`,
                  lineHeight:1.4 }}
                onMouseEnter={e=>e.currentTarget.style.background = theme?.cardAlt || '#f8fafc'}
                onMouseLeave={e=>e.currentTarget.style.background='none'}>
                <span style={{ fontWeight:600 }}>{p.name}</span>
                <span style={{ color: theme?.muted || '#64748b', marginLeft:6 }}>
                  {p.postcode} {p.city}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
