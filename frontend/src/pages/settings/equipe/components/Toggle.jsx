// Toggle sobre : fond colore (via prop colorOn) quand on, gris quand off.
// Le prop colorOn accepte une couleur pleine (pas de gradient).
export default function Toggle({ on, onChange, colorOn = '#111827' }) {
  return (
    <button onClick={onChange}
            style={{ width:44, height:22, borderRadius:99,
                     position:'relative', flexShrink:0,
                     border:'none', cursor:'pointer',
                     background: on ? colorOn : 'rgba(120,120,120,0.2)',
                     transition:'background 0.2s',
                     fontFamily:'inherit' }}>
      <div style={{ width:18, height:18, borderRadius:'50%',
                    background:'white',
                    position:'absolute', top:2,
                    left: on ? 24 : 2,
                    transition:'left 0.15s',
                    boxShadow:'0 1px 2px rgba(0,0,0,0.15)' }}/>
    </button>
  );
}
