import { useState, type FormEvent } from 'react';
import { useApp } from '../context';
import { newId } from '../data/store';
import { PM_KIND_LABEL, type PaymentMethod, type PMKind } from '../lib/types';

const COLORS = [['', 'Verde'], ['carrefour', 'Azul'], ['cencosud', 'Gris'], ['naranja', 'Naranja']];

const dayOrNull = (s: string) => {
  const n = Number(s);
  return s.trim() && Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
};

export function PMModal({ pm, defaultKind, onClose }: { pm: PaymentMethod | null; defaultKind: PMKind; onClose: () => void }) {
  const { store, run, pms } = useApp();
  const [name, setName] = useState(pm?.name ?? '');
  const [kind, setKind] = useState<PMKind>(pm?.kind ?? defaultKind);
  const [last4, setLast4] = useState(pm?.last4 ?? '');
  const [closing, setClosing] = useState(pm?.closing_day ? String(pm.closing_day) : '');
  const [due, setDue] = useState(pm?.due_day ? String(pm.due_day) : '');
  const [color, setColor] = useState(pm?.color ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const credit = kind === 'credito';

  async function save(archived: boolean) {
    if (!name.trim()) return setError('Escribí un nombre.');
    if (last4 && !/^\d{4}$/.test(last4)) return setError('Los últimos 4 números tienen que ser 4 dígitos.');
    if (credit && ((closing && !dayOrNull(closing)) || (due && !dayOrNull(due)))) return setError('Los días tienen que ser números del 1 al 31.');
    setError(null); setBusy(true);
    const item: PaymentMethod = {
      id: pm?.id ?? newId(), name: name.trim(), kind, issuer: pm?.issuer ?? null,
      last4: credit && last4 ? last4 : null,
      closing_day: credit ? dayOrNull(closing) : null,
      due_day: credit ? dayOrNull(due) : null,
      color: credit ? color || null : null,
      archived, sort: pm?.sort ?? Math.max(0, ...pms.map(p => p.sort)) + 1,
    };
    const ok = await run(() => store.savePaymentMethod(item), archived ? `Quitaste ${item.name}` : 'Guardado');
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <div className="scrim" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal" onSubmit={(e: FormEvent) => { e.preventDefault(); save(false); }}>
        <div className="panel-head" style={{ margin: 0 }}>
          <h2>{pm ? `Editar ${pm.name}` : 'Nuevo medio de pago'}</h2>
          <button type="button" className="btn sm" onClick={onClose}>Cerrar</button>
        </div>
        <div className="row2">
          <div className="field"><label htmlFor="pm-name">Nombre</label><input className="input" id="pm-name" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: TC Visa Galicia" maxLength={60} /></div>
          <div className="field">
            <label htmlFor="pm-kind">Tipo</label>
            <select className="input" id="pm-kind" value={kind} onChange={e => setKind(e.target.value as PMKind)}>
              {(Object.keys(PM_KIND_LABEL) as PMKind[]).map(k => <option key={k} value={k}>{PM_KIND_LABEL[k]}</option>)}
            </select>
          </div>
        </div>
        {credit && <>
          <div className="row3">
            <div className="field"><label htmlFor="pm-close">Día de cierre</label><input className="input num" id="pm-close" inputMode="numeric" value={closing} onChange={e => setClosing(e.target.value)} placeholder="1 a 31" /></div>
            <div className="field"><label htmlFor="pm-due">Día de vencimiento</label><input className="input num" id="pm-due" inputMode="numeric" value={due} onChange={e => setDue(e.target.value)} placeholder="1 a 31" /></div>
            <div className="field"><label htmlFor="pm-last4">Últimos 4 números</label><input className="input num" id="pm-last4" inputMode="numeric" maxLength={4} value={last4} onChange={e => setLast4(e.target.value)} placeholder="Opcional" /></div>
          </div>
          <p className="note" style={{ margin: 0 }}>Los días cambian un poco cada mes. Poné los habituales; en el cierre de mes vas a poder ajustar las fechas exactas de cada resumen.</p>
          <div className="field">
            <label htmlFor="pm-color">Color de la tarjeta</label>
            <select className="input" id="pm-color" value={color} onChange={e => setColor(e.target.value)}>
              {COLORS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy} style={{ justifyContent: 'center' }}>Guardar</button>
        {pm && <button type="button" className="btn danger" disabled={busy} style={{ justifyContent: 'center' }} onClick={() => save(true)}>Quitar {pm.name}</button>}
        {pm && <p className="note" style={{ margin: 0 }}>Al quitarlo, los movimientos que ya cargaste con este medio se conservan.</p>}
      </form>
    </div>
  );
}
