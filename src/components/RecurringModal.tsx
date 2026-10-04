import { useState, type FormEvent } from 'react';
import { useApp } from '../context';
import { newId } from '../data/store';
import { parseAmount } from '../lib/money';
import type { Currency, Recurring } from '../lib/types';

export function RecurringModal({ rec, preset, onClose }: { rec: Recurring | null; preset?: Partial<Recurring>; onClose: () => void }) {
  const { cats, pms, recurring, store, run } = useApp();
  const base = rec ?? preset ?? {};
  const [name, setName] = useState(base.name ?? '');
  const [amount, setAmount] = useState(base.default_amount ? base.default_amount.toLocaleString('es-AR', { minimumFractionDigits: 2 }) : '');
  const [currency, setCurrency] = useState<Currency>(base.currency ?? 'ARS');
  const [day, setDay] = useState(base.due_day ? String(base.due_day) : '');
  const [categoryId, setCategoryId] = useState(base.category_id ?? '');
  const [pmId, setPmId] = useState(base.payment_method_id ?? pms.find(p => p.kind === 'debito' && !p.archived)?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(active: boolean) {
    const d = Number(day);
    const v = amount.trim() ? parseAmount(amount) : null;
    if (!name.trim()) return setError('Escribí un nombre.');
    if (!Number.isInteger(d) || d < 1 || d > 31) return setError('El día de vencimiento tiene que ser un número del 1 al 31.');
    if (v !== null && Number.isNaN(v)) return setError('Revisá el monto. Ejemplo: 420.000,00');
    setError(null); setBusy(true);
    const item: Recurring = {
      id: rec?.id ?? newId(), name: name.trim(), category_id: categoryId || null, payment_method_id: pmId || null,
      default_amount: v, currency, due_day: d, active, sort: rec?.sort ?? Math.max(0, ...recurring.map(r => r.sort)) + 1,
    };
    const ok = await run(() => store.saveRecurring(item), active ? 'Gasto fijo guardado' : `Quitaste ${item.name}`);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <div className="scrim" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal" onSubmit={(e: FormEvent) => { e.preventDefault(); save(true); }}>
        <div className="panel-head" style={{ margin: 0 }}>
          <h2>{rec ? `Editar ${rec.name}` : 'Nuevo gasto fijo'}</h2>
          <button type="button" className="btn sm" onClick={onClose}>Cerrar</button>
        </div>
        <div className="field"><label htmlFor="r-name">Nombre</label><input className="input" id="r-name" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Alquiler" maxLength={60} /></div>
        <div className="row3" style={{ gridTemplateColumns: '1fr 110px 110px' }}>
          <div className="field"><label htmlFor="r-amt">Monto habitual</label><input className="input num" id="r-amt" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Opcional" /></div>
          <div className="field"><label htmlFor="r-cur">Moneda</label><select className="input" id="r-cur" value={currency} onChange={e => setCurrency(e.target.value as Currency)}><option value="ARS">Pesos</option><option value="USD">Dólares</option></select></div>
          <div className="field"><label htmlFor="r-day">Vence el día</label><input className="input num" id="r-day" inputMode="numeric" value={day} onChange={e => setDay(e.target.value)} placeholder="1 a 31" /></div>
        </div>
        <div className="row2">
          <div className="field"><label htmlFor="r-cat">Tópico</label>
            <select className="input" id="r-cat" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">Sin tópico</option>
              {cats.filter(c => c.kind === 'egreso' && (!c.archived || c.id === categoryId)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="r-pm">Se paga con</label>
            <select className="input" id="r-pm" value={pmId} onChange={e => setPmId(e.target.value)}>
              <option value="">Sin especificar</option>
              {pms.filter(p => !p.archived || p.id === pmId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <p className="note" style={{ margin: 0 }}>Cada mes se crea solo con este monto. En el cierre de mes podés ajustarlo (por ejemplo, el aumento del alquiler).</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy} style={{ justifyContent: 'center' }}>Guardar</button>
        {rec && <button type="button" className="btn danger" disabled={busy} style={{ justifyContent: 'center' }} onClick={() => save(false)}>Dejar de repetir {rec.name}</button>}
      </form>
    </div>
  );
}
