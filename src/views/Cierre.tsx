import { useState } from 'react';
import { Icon } from '../components/Icon';
import { useApp } from '../context';
import { newId } from '../data/store';
import { closingTargetPeriod, consumptionBetween, dateInMonth, plannedPayment, statementTotal } from '../lib/calc';
import { addMonthsYm, monthLabel, parseIso, MESES } from '../lib/dates';
import { ars, money, parseAmount, usd } from '../lib/money';
import type { CardStatement, PaymentMethod, PlanKind, Recurring, RecurringInstance } from '../lib/types';

type Item = { kind: 'card'; pm: PaymentMethod } | { kind: 'fixed'; rec: Recurring };

const fmtInput = (n: number | null | undefined) =>
  n ? n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
const shortDate = (iso: string) => { const d = parseIso(iso); return `${d.getDate()} de ${MESES[d.getMonth()]}`; };

export function Cierre() {
  const { pms, recurring, statements, instances, todayIso } = useApp();
  const [period, setPeriod] = useState(() => closingTargetPeriod(todayIso));
  const [step, setStep] = useState(0);

  const items: Item[] = [
    ...pms.filter(p => p.kind === 'credito' && !p.archived).map(pm => ({ kind: 'card' as const, pm })),
    ...recurring.filter(r => r.active).map(rec => ({ kind: 'fixed' as const, rec })),
  ];
  const done = (it: Item) => it.kind === 'card'
    ? statements.some(s => s.payment_method_id === it.pm.id && s.period === period)
    : instances.some(i => i.recurring_id === it.rec.id && i.period === period);

  const changePeriod = (n: number) => { setPeriod(addMonthsYm(period, n)); setStep(0); };
  const it = items[step];

  return (
    <section>
      <div className="view-head">
        <div>
          <div className="eyebrow">Cierre de mes · vencimientos de</div>
          <div className="month">
            <button aria-label="Mes anterior" onClick={() => changePeriod(-1)}><Icon name="left" size={16} /></button>
            <h1>{monthLabel(period)}</h1>
            <button aria-label="Mes siguiente" onClick={() => changePeriod(1)}><Icon name="right" size={16} /></button>
          </div>
        </div>
      </div>
      <div className="panel wiz">
        {items.length === 0 ? (
          <p className="empty">No tenés tarjetas ni gastos fijos. Agregalos desde Tarjetas y deudas.</p>
        ) : (
          <>
            <div className="steps" aria-label={`Paso ${Math.min(step + 1, items.length)} de ${items.length}`}>
              {items.map((x, i) => (
                <button key={i} className={`${i === step ? 'cur' : done(x) ? 'done' : ''}`} onClick={() => setStep(i)}
                  aria-label={x.kind === 'card' ? x.pm.name : x.rec.name} />
              ))}
              <button className={step >= items.length ? 'cur' : ''} onClick={() => setStep(items.length)} aria-label="Resumen" />
            </div>
            {it?.kind === 'card' && <CardStep key={`${period}-${it.pm.id}`} pm={it.pm} period={period} n={step} total={items.length} onPrev={() => setStep(step - 1)} onNext={() => setStep(step + 1)} />}
            {it?.kind === 'fixed' && <FixedStep key={`${period}-${it.rec.id}`} rec={it.rec} period={period} n={step} total={items.length} onPrev={() => setStep(step - 1)} onNext={() => setStep(step + 1)} />}
            {!it && <Summary period={period} items={items} onEdit={setStep} />}
          </>
        )}
      </div>
    </section>
  );
}

function CardStep({ pm, period, n, total, onPrev, onNext }: { pm: PaymentMethod; period: string; n: number; total: number; onPrev: () => void; onNext: () => void }) {
  const { statements, txs, rate, store, run } = useApp();
  const existing = statements.find(s => s.payment_method_id === pm.id && s.period === period);
  const [closing, setClosing] = useState(existing?.closing_date ?? (pm.closing_day ? dateInMonth(addMonthsYm(period, -1), pm.closing_day) : ''));
  const [due, setDue] = useState(existing?.due_date ?? (pm.due_day ? dateInMonth(period, pm.due_day) : ''));
  const [totalArs, setTotalArs] = useState(fmtInput(existing?.total_ars));
  const [totalUsd, setTotalUsd] = useState(fmtInput(existing?.total_usd));
  const [minimum, setMinimum] = useState(fmtInput(existing?.minimum_payment));
  const [kind, setKind] = useState<PlanKind>(existing?.planned_kind ?? 'total');
  const [other, setOther] = useState(fmtInput(existing?.planned_amount));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const val = (s: string) => (s.trim() ? parseAmount(s) : 0);
  const tA = val(totalArs), tU = val(totalUsd), mn = val(minimum), ot = val(other);
  const totalPesos = tA + tU * rate;
  const paying = kind === 'total' ? totalPesos : kind === 'minimo' ? mn : ot;
  const financed = totalPesos - paying;
  const hint = closing ? consumptionBetween(txs, pm.id, closing) : null;

  async function save() {
    if (!due) return setError('Elegí la fecha de vencimiento.');
    if ([tA, tU, mn].some(Number.isNaN) || (kind === 'otro' && Number.isNaN(ot))) return setError('Revisá los montos. Ejemplo: 264.900,50');
    if (kind === 'otro' && !(ot > 0)) return setError('Escribí cuánto vas a pagar.');
    setError(null); setBusy(true);
    const st: CardStatement = {
      id: existing?.id ?? newId(), payment_method_id: pm.id, period,
      closing_date: closing || null, due_date: due, total_ars: tA, total_usd: tU, minimum_payment: mn,
      planned_kind: kind, planned_amount: kind === 'otro' ? ot : null,
      paid_amount: existing?.paid_amount ?? null, paid_at: existing?.paid_at ?? null,
    };
    // Si la tarjeta todavía no tenía días habituales, se toman de este resumen
    const learn = (!pm.closing_day && closing) || !pm.due_day
      ? { ...pm, closing_day: pm.closing_day ?? (closing ? Number(closing.slice(8, 10)) : null), due_day: pm.due_day ?? Number(due.slice(8, 10)) }
      : null;
    const ok = await run(async () => {
      await store.saveStatement(st);
      if (learn) await store.savePaymentMethod(learn);
    }, `Resumen de ${pm.name} guardado`);
    setBusy(false);
    if (ok) onNext();
  }

  return (
    <>
      <div className="eyebrow">Paso {n + 1} de {total} · Resumen de tarjeta</div>
      <h2 style={{ margin: '4px 0 16px' }}>{pm.name}</h2>
      <div className="grid" style={{ gap: 14 }}>
        <div className="row2">
          <div className="field"><label htmlFor="w-cierre">Fecha de cierre</label><input className="input" type="date" id="w-cierre" value={closing} onChange={e => setClosing(e.target.value)} /></div>
          <div className="field"><label htmlFor="w-venc">Fecha de vencimiento</label><input className="input" type="date" id="w-venc" value={due} onChange={e => setDue(e.target.value)} /></div>
        </div>
        <div className="row3">
          <div className="field"><label htmlFor="w-tot">Total en pesos</label><input className="input num" id="w-tot" inputMode="decimal" value={totalArs} onChange={e => setTotalArs(e.target.value)} placeholder="0,00" /></div>
          <div className="field"><label htmlFor="w-usd">Total en dólares</label><input className="input num" id="w-usd" inputMode="decimal" value={totalUsd} onChange={e => setTotalUsd(e.target.value)} placeholder="0,00" /></div>
          <div className="field"><label htmlFor="w-min">Pago mínimo</label><input className="input num" id="w-min" inputMode="decimal" value={minimum} onChange={e => setMinimum(e.target.value)} placeholder="0,00" /></div>
        </div>
        {hint && (hint.ars > 0 || hint.usd > 0) && (
          <p className="note" style={{ margin: 0 }}>Según lo que cargaste en la app, entre cierres gastaste {ars(hint.ars)}{hint.usd ? ` y ${usd(hint.usd)}` : ''} con esta tarjeta.</p>
        )}
        <div className="field">
          <label>¿Cuánto vas a pagar?</label>
          <div className="choice">
            <label><input type="radio" name="w-pay" checked={kind === 'total'} onChange={() => setKind('total')} /><b>Total</b><small>{ars(totalPesos)}</small></label>
            <label><input type="radio" name="w-pay" checked={kind === 'minimo'} onChange={() => setKind('minimo')} /><b>Mínimo</b><small>{ars(mn || 0)}</small></label>
            <label><input type="radio" name="w-pay" checked={kind === 'otro'} onChange={() => setKind('otro')} /><b>Otro monto</b>
              <input className="input num" aria-label="Otro monto" inputMode="decimal" value={other} onChange={e => setOther(e.target.value)} onFocus={() => setKind('otro')} placeholder="$" style={{ padding: '4px 8px', marginTop: 4 }} />
            </label>
          </div>
        </div>
        {totalPesos > 0 && (
          <p className="note" style={{ margin: 0, color: financed > 0.005 ? 'var(--warn)' : 'var(--ok)' }}>
            {financed > 0.005 ? `Quedan ${ars(financed)} financiados. Te va a cobrar intereses en el próximo resumen.` : 'Pagás todo: sin intereses el mes que viene.'}
          </p>
        )}
        {tU > 0 && <p className="note" style={{ margin: 0 }}>Los dólares se convierten al oficial de hoy ({ars(rate)}).</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      <div className="wiz-foot">
        <button className="btn" onClick={onPrev} disabled={n === 0}>Anterior</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onNext}>Saltar</button>
          <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar y seguir'}</button>
        </div>
      </div>
    </>
  );
}

function FixedStep({ rec, period, n, total, onPrev, onNext }: { rec: Recurring; period: string; n: number; total: number; onPrev: () => void; onNext: () => void }) {
  const { instances, store, run } = useApp();
  const existing = instances.find(i => i.recurring_id === rec.id && i.period === period);
  const previous = existing?.amount ?? rec.default_amount;
  const [due, setDue] = useState(existing?.due_date ?? dateInMonth(period, rec.due_day));
  const [amount, setAmount] = useState(fmtInput(existing?.amount ?? rec.default_amount));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const v = amount.trim() ? parseAmount(amount) : 0;
    if (Number.isNaN(v)) return setError('Revisá el monto. Ejemplo: 420.000,00');
    if (!due) return setError('Elegí la fecha de vencimiento.');
    setError(null); setBusy(true);
    const inst: RecurringInstance = existing
      ? { ...existing, due_date: due, amount: v }
      : { id: newId(), recurring_id: rec.id, period, due_date: due, amount: v, currency: rec.currency, paid_at: null, transaction_id: null };
    // Un aumento (o baja) sigue en los meses siguientes que todavía tenían el monto anterior
    const changed = previous !== null && previous !== undefined && v !== previous;
    const following = changed ? instances.filter(i => i.recurring_id === rec.id && i.period > period && !i.paid_at && i.amount === previous) : [];
    const ok = await run(async () => {
      await store.saveInstance(inst);
      for (const f of following) await store.saveInstance({ ...f, amount: v });
      if (changed) await store.saveRecurring({ ...rec, default_amount: v });
    }, `${rec.name} guardado`);
    setBusy(false);
    if (ok) onNext();
  }

  return (
    <>
      <div className="eyebrow">Paso {n + 1} de {total} · Gasto fijo</div>
      <h2 style={{ margin: '4px 0 16px' }}>{rec.name}</h2>
      <div className="row2">
        <div className="field"><label htmlFor="w-fvenc">Fecha de vencimiento</label><input className="input" type="date" id="w-fvenc" value={due} onChange={e => setDue(e.target.value)} /></div>
        <div className="field"><label htmlFor="w-famt">Monto {rec.currency === 'USD' ? 'en dólares' : ''}</label><input className="input num" id="w-famt" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" /></div>
      </div>
      {existing?.paid_at && <p className="note" style={{ color: 'var(--ok)' }}>Ya está pagado este mes.</p>}
      <p className="note" style={{ marginTop: 12 }}>Si el monto no cambia, solo confirmá. Si cambia (por ejemplo, el aumento del alquiler), el nuevo monto sigue en los meses siguientes.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="wiz-foot">
        <button className="btn" onClick={onPrev} disabled={n === 0}>Anterior</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onNext}>Saltar</button>
          <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar y seguir'}</button>
        </div>
      </div>
    </>
  );
}

function Summary({ period, items, onEdit }: { period: string; items: Item[]; onEdit: (i: number) => void }) {
  const { statements, instances, rate, go } = useApp();
  let sum = 0, missing = 0;
  const rows = items.map((it, i) => {
    if (it.kind === 'card') {
      const st = statements.find(s => s.payment_method_id === it.pm.id && s.period === period);
      if (!st) { missing++; return { i, name: it.pm.name, date: null, amount: null, tag: 'Falta cargar' }; }
      const pay = plannedPayment(st, rate);
      sum += st.paid_at ? 0 : pay;
      const tag = st.paid_at ? 'Pagado' : st.planned_kind === 'minimo' ? `Mínimo (total ${ars(statementTotal(st, rate))})` : st.planned_kind === 'otro' ? 'Pago parcial' : 'Total';
      return { i, name: it.pm.name, date: st.due_date, amount: pay, tag };
    }
    const inst = instances.find(x => x.recurring_id === it.rec.id && x.period === period);
    if (!inst) { missing++; return { i, name: it.rec.name, date: null, amount: null, tag: 'Falta cargar' }; }
    const v = inst.currency === 'USD' ? inst.amount * rate : inst.amount;
    sum += inst.paid_at ? 0 : v;
    return { i, name: it.rec.name, date: inst.due_date, amount: v, tag: inst.paid_at ? 'Pagado' : inst.currency === 'USD' ? `Fijo · ${money(inst.amount, 'USD')}` : 'Fijo' };
  }).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));

  return (
    <>
      <h2 style={{ marginBottom: 4 }}>{missing ? `Te faltan ${missing}` : `Listo, cerraste ${monthLabel(period).toLowerCase()}`}</h2>
      <p className="muted" style={{ marginTop: 0 }}>Vencimientos de {monthLabel(period).toLowerCase()}. Tocá uno para corregirlo.</p>
      <div>
        {rows.map(r => (
          <div key={r.i} className="due" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => onEdit(r.i)} onKeyDown={e => { if (e.key === 'Enter') onEdit(r.i); }}>
            <div className="date-chip">{r.date ? <><b>{r.date.slice(8, 10)}</b><span>{MESES[Number(r.date.slice(5, 7)) - 1].slice(0, 3)}</span></> : <b>—</b>}</div>
            <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>{r.name}</div><span className={`pill ${r.tag === 'Falta cargar' ? 'warn' : r.tag === 'Pagado' ? 'ok' : r.tag.startsWith('Mínimo') ? 'warn' : ''}`}>{r.tag}</span></div>
            <span className="num">{r.amount !== null ? ars(r.amount) : ''}</span>
          </div>
        ))}
      </div>
      <div className="set-row" style={{ borderTop: '1px solid var(--line)', marginTop: 6 }}>
        <p><b>Total a pagar</b><small>{rows.filter(r => r.date).length} vencimientos{rows[0]?.date ? `, el primero el ${shortDate(rows.find(r => r.date)!.date!)}` : ''}</small></p>
        <span className="num" style={{ fontSize: '1.15rem' }}>{ars(sum)}</span>
      </div>
      <div className="wiz-foot">
        <button className="btn" onClick={() => onEdit(0)}>Revisar desde el principio</button>
        <button className="btn primary" onClick={() => go('inicio')}>Ir a Inicio</button>
      </div>
    </>
  );
}
