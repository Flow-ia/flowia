import { useState } from 'react';
import { Modal } from '../../../components/UI';
import { COLORS } from '../constants';
import Toggle from '../components/Toggle';

export default function ServiceModal({ svc, categories, onSave, onClose, theme: t }) {
  const [form, setForm] = useState({
    name:             svc?.name||'',
    description:      svc?.description||'',
    duration_minutes: svc?.duration_minutes||30,
    price:            svc?.price||'',
    color:            svc?.color||'#111827',
    is_active:        svc?.is_active!==false,
    category_id:      svc?.category_id||'',
  });
  const [saving, setSaving] = useState(false);
  const cats = (categories||[]).filter(c=>!c.parent_id);
  const DURATIONS = [15,20,30,45,60,75,90,120];

  return (
    <Modal open={true} onClose={onClose} title={svc?'Modifier le service':'Nouveau service'} theme={t}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-bold uppercase block mb-1" style={{ color:t.muted }}>Nom *</label>
          <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Ex: Coupe homme"
            className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none"
            style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text }} />
        </div>
        <div>
          <label className="text-xs font-bold uppercase block mb-1" style={{ color:t.muted }}>Durée</label>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map(d=>(
              <button key={d} onClick={()=>setForm(f=>({...f,duration_minutes:d}))}
                className="px-3 py-1.5 rounded-xl text-xs font-bold border"
                style={{ background:form.duration_minutes===d?'#111827':'transparent', borderColor:form.duration_minutes===d?'transparent':t.border, color:form.duration_minutes===d?'white':t.muted }}>
                {d}min
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold uppercase block mb-1" style={{ color:t.muted }}>Prix (€)</label>
            <input type="number" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="0.00"
              className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none"
              style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text }} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase block mb-1" style={{ color:t.muted }}>Couleur</label>
            <div className="flex gap-1.5 flex-wrap mt-1">
              {COLORS.map(c=>(
                <button key={c} onClick={()=>setForm(f=>({...f,color:c}))}
                  className="w-7 h-7 rounded-full border-2 transition-transform"
                  style={{ backgroundColor:c, borderColor:form.color===c?'white':'transparent', transform:form.color===c?'scale(1.25)':'scale(1)' }} />
              ))}
            </div>
          </div>
        </div>
        {cats.length>0&&(
          <div>
            <label className="text-xs font-bold uppercase block mb-1" style={{ color:t.muted }}>Catégorie</label>
            <select value={form.category_id} onChange={e=>setForm(f=>({...f,category_id:e.target.value}))}
              className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none"
              style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text }}>
              <option value="">Sans catégorie</option>
              {cats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="text-xs font-bold uppercase block mb-1" style={{ color:t.muted }}>Description</label>
          <textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={2}
            className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none resize-none"
            style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text }} />
        </div>
        <div className="flex items-center justify-between p-3 rounded-xl" style={{ background:t.inputBg }}>
          <span className="text-sm font-semibold" style={{ color:t.text }}>Service actif</span>
          <Toggle on={form.is_active} onChange={()=>setForm(f=>({...f,is_active:!f.is_active}))} colorOn="linear-gradient(90deg,#4ade80,#22c55e)" />
        </div>
        <button disabled={!form.name||saving} onClick={async()=>{ setSaving(true); try { await onSave(form); onClose(); } finally { setSaving(false); } }}
          className="w-full py-3.5 rounded-2xl font-bold text-white disabled:opacity-40"
          style={{ background:'#111827' }}>
          {saving?'Enregistrement...':'Enregistrer'}
        </button>
      </div>
    </Modal>
  );
}
