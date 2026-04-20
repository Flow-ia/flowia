export default function Toggle({ on, onChange, colorOn='linear-gradient(90deg,#111827,#374151)' }) {
  return (
    <button onClick={onChange}
      className="w-12 h-6 rounded-full relative flex-shrink-0 transition-all"
      style={{ background: on ? colorOn : 'rgba(120,120,120,0.2)' }}>
      <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
        style={{ left: on ? '26px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
    </button>
  );
}
