export default function InfoRow({ icon, label, value, t, border }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3" style={border?{borderTop:`1px solid ${t.border}`}:{}}>
      <span style={{ fontSize:16, width:22, textAlign:'center', flexShrink:0 }}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color:t.muted }}>{label}</p>
        <p className="text-sm font-semibold mt-0.5 break-words" style={{ color:t.text }}>{value||'-'}</p>
      </div>
    </div>
  );
}
