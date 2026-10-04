import { useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../context';
import { newId } from '../data/store';
import { buildInstallments } from '../lib/calc';
import { parseAmount } from '../lib/money';
import type { Currency, Transaction, TxType } from '../lib/types';

const CUOTAS = [1, 2, 3, 6, 9, 12, 18, 24];

export function TxModal({ tx, onClose }: { tx: Transaction | null; onClose: () => void }) {
  const { cats, pms, store, run, todayIso } = useApp();
  const editing = !!tx;
  const [type, setType] = useState<TxType>(tx?.type ?? 'egreso');
  const [description, setDescription] = useState(tx?.description ?? '');
  const [amount, setAmount] = useState(tx ? String(tx.amount).replace('.', ',') : '');
  const [currency, setCurrency] = useState<Currency>(tx?.currency ?? 'ARS');
  const [categoryId, setCategoryId] = useState(tx?.category_id ?? '');
  const [pmId, setPmId] = useState(tx?.payment_method_id ?? '');
  const [date, setDate] = useState(tx?.date ?? todayIso);
  const [cuotas, setCuotas] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const catOptions = cats.filter(c => c.kind === type && (!c.archived || c.id === tx?.category_id));
  const pmOptions = pms.filter(p => !p.archived || p.id === tx?.payment_method_id);
  const pm = pms.find(p => p.id === pmId);
  const isCredit = pm?.kind === 'credito' && type === 'egreso';

  // Al cambiar de ingreso a egreso, el tópico elegido deja de servir
  useEffect(() => {
    if (categoryId && !catOptions.some(c => c.id === categoryId)) setCategoryId('');
  }, [type]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = parseAmount(amount);
    if (!description.trim()) return setError('Escribí una descripción.');
    if (!(value > 0)) return setError('Escribí un monto mayor a cero. Ejemplo: 12.500 o 12500,50');
    if (!date) return setError('Elegí una fecha.');
    setError(null);
    setBusy(true);
    const base = {
      date, description: description.trim(), amount: value, currency, type,
      category_id: categoryId || null, payment_method_id: pmId || null,
    };
    const ok = editing
      ? await run(() => store.updateTransaction({ ...tx!, ...base }), 'Movimiento actualizado')
      : await run(
          () => store.addTransactions(buildInstallments(base, isCredit ? cuotas : 1, newId)),
          isCredit && cuotas > 1 ? `Compra cargada en ${cuotas} cuotas` : 'Movimiento guardado',
        );
    setBusy(false);
    if (ok) onClose();
  }

  async function remove(all: boolean) {
    setBusy(true);
    const ok = await run(
      () => (all && tx!.plan_id ? store.deletePlan(tx!.plan_id) : store.deleteTransaction(tx!.id)),
      all ? 'Se eliminaron todas las cuotas' : 'Movimiento eliminado',
    );
    setBusy(false);
    if (ok) onClose();
  }

  const perCuota = isCredit && cuotas > 1 && parseAmount(amount) > 0 ? parseAmount(amount) / cuotas : null;

  return (
    <div className="scrim" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal" onSubmit={submit} aria-labelledby="tx-title">
        <div className="panel-head" style={{ margin: 0 }}>
          <h2 id="tx-title">{editing ? 'Editar movimiento' : 'Nuevo movimiento'}</h2>
          <button type="button" className="btn sm" onClick={onClose}>Cerrar</button>
        </div>
        <div className="seg" role="group" aria-label="Tipo" style={{ alignSelf: 'flex-start' }}>
          <button type="button" aria-pressed={type === 'ingreso'} onClick={() => setType('ingreso')}>Ingreso</button>
          <button type="button" aria-pressed={type === 'egreso'} onClick={() => setType('egreso')}>Egreso</button>
        </div>
        <div className="field">
          <label htmlFor="n-desc">Descripción</label>
          <input className="input" id="n-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder={type === 'ingreso' ? 'Ej: Sueldo' : 'Ej: Verdulería'} maxLength={120} autoFocus={!editing} />
        </div>
        <div className="row2" style={{ gridTemplateColumns: '1fr 110px' }}>
          <div className="field">
            <label htmlFor="n-amt">{isCredit && cuotas > 1 ? 'Monto total de la compra' : 'Monto'}</label>
            <input className="input num" id="n-amt" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0" />
          </div>
          <div className="field">
            <label htmlFor="n-cur">Moneda</label>
            <select className="input" id="n-cur" value={currency} onChange={e => setCurrency(e.target.value as Currency)}>
              <option value="ARS">Pesos</option>
              <option value="USD">Dólares</option>
            </select>
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="n-cat">Tópico</label>
            <select className="input" id="n-cat" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">Sin tópico</option>
              {catOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="n-pay">{type === 'ingreso' ? 'Dónde entró' : 'Medio de pago'}</label>
            <select className="input" id="n-pay" value={pmId} onChange={e => setPmId(e.target.value)}>
              <option value="">Sin especificar</option>
              {pmOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="n-date">{isCredit && cuotas > 1 ? 'Fecha de compra' : 'Fecha'}</label>
            <input className="input" type="date" id="n-date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          {isCredit && !editing && (
            <div className="field">
              <label htmlFor="n-cuo">Cuotas</label>
              <select className="input" id="n-cuo" value={cuotas} onChange={e => setCuotas(Number(e.target.value))}>
                {CUOTAS.map(n => <option key={n} value={n}>{n === 1 ? '1 pago' : `${n} cuotas`}</option>)}
              </select>
            </div>
          )}
          {editing && tx!.installments_total && (
            <div className="field"><label>Cuota</label><div className="input num" aria-readonly>{tx!.installment_number} de {tx!.installments_total}</div></div>
          )}
        </div>
        {perCuota && <p className="note" style={{ margin: 0 }}>Se cargan {cuotas} cuotas de {currency === 'USD' ? 'US$' : '$'} {perCuota.toLocaleString('es-AR', { maximumFractionDigits: 2 })}, una por mes.</p>}
        {editing && tx!.plan_id && <p className="note" style={{ margin: 0 }}>Los cambios se aplican solo a esta cuota.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy} style={{ justifyContent: 'center' }}>{busy ? 'Guardando…' : 'Guardar'}</button>
        {editing && (confirmDelete ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn danger" disabled={busy} onClick={() => remove(false)}>{tx!.plan_id ? 'Eliminar esta cuota' : 'Sí, eliminar'}</button>
            {tx!.plan_id && <button type="button" className="btn danger" disabled={busy} onClick={() => remove(true)}>Eliminar todas las cuotas</button>}
            <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>Cancelar</button>
          </div>
        ) : (
          <button type="button" className="btn danger" style={{ justifyContent: 'center' }} onClick={() => setConfirmDelete(true)}>Eliminar movimiento</button>
        ))}
      </form>
    </div>
  );
}
