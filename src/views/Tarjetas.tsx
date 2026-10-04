import { useState } from 'react';
import { MonthNav } from '../components/MonthNav';
import { PMModal } from '../components/PMModal';
import { RecurringModal } from '../components/RecurringModal';
import { useApp } from '../context';
import { newId } from '../data/store';
import { activePlans, plannedPayment, statementTotal, toARS } from '../lib/calc';
import { MESES, parseIso, ymOf } from '../lib/dates';
import { ars, money, usd } from '../lib/money';
import type { CardStatement, PaymentMethod, Recurring, RecurringInstance, Transaction } from '../lib/types';

const FACE: Record<string, string> = { carrefour: 'cc-carrefour', cencosud: 'cc-cencosud', naranja: 'cc-naranja' };
const dayMonth = (iso: string) => { const d = parseIso(iso); return `${d.getDate()} de ${MESES[d.getMonth()]}`; };
const PLAN_LABEL = { total: 'Total', minimo: 'Mínimo', otro: 'Otro monto' } as const;

export function Tarjetas() {
  const { pms, txs, ym, rate, statements, recurring, instances, cats, store, run, todayIso, go } = useApp();
  const [editingPm, setEditingPm] = useState<PaymentMethod | 'new' | null>(null);
  const [editingRec, setEditingRec] = useState<{ rec: Recurring | null; preset?: Partial<Recurring> } | null>(null);
  const cards = pms.filter(p => p.kind === 'credito' && !p.archived);
  const activeRec = recurring.filter(r => r.active);
  // Tópicos marcados como gasto fijo que todavía no se repiten solos
  const suggestions = cats.filter(c => c.kind === 'egreso' && c.is_fixed && !c.archived && !recurring.some(r => r.category_id === c.id && r.active));

  const payStatement = (st: CardStatement, name: string) =>
    run(() => store.saveStatement({ ...st, paid_amount: plannedPayment(st, rate), paid_at: todayIso }), `${name} marcado como pagado`);
  const unpayStatement = (st: CardStatement) =>
    run(() => store.saveStatement({ ...st, paid_amount: null, paid_at: null }), 'Pago deshecho');

  // Pagar un gasto fijo registra el movimiento, así cuenta en "En qué se va la plata"
  const payInstance = (i: RecurringInstance, r: Recurring) => {
    const tx: Transaction = {
      id: newId(), date: todayIso < i.due_date ? todayIso : i.due_date, description: r.name, amount: i.amount, currency: i.currency,
      type: 'egreso', category_id: r.category_id, payment_method_id: r.payment_method_id, plan_id: null, installment_number: null, installments_total: null,
    };
    return run(async () => {
      await store.addTransactions([tx]);
      await store.saveInstance({ ...i, paid_at: todayIso, transaction_id: tx.id });
    }, `${r.name} marcado como pagado`);
  };
  const unpayInstance = (i: RecurringInstance) => run(async () => {
    if (i.transaction_id) await store.deleteTransaction(i.transaction_id);
    await store.saveInstance({ ...i, paid_at: null, transaction_id: null });
  }, 'Pago deshecho');

  return (
    <section>
      <div className="view-head">
        <MonthNav eyebrow="Tarjetas y deudas · vencimientos de" />
        <div className="btn-row">
          <button className="btn" onClick={() => setEditingPm('new')}>Agregar tarjeta</button>
          <button className="btn primary" onClick={() => go('cierre')}>Cierre de mes</button>
        </div>
      </div>

      <div className="grid cards">
        {cards.map(c => {
          const st = statements.find(s => s.payment_method_id === c.id && s.period === ym);
          const mine = txs.filter(t => t.payment_method_id === c.id && t.type === 'egreso' && ymOf(t.date) === ym);
          const plans = activePlans(txs, ym, c.id);
          return (
            <div key={c.id} className="panel cc">
              <div className={`cc-face ${FACE[c.color ?? ''] ?? 'cc-otra'}`}>
                <div className="name">{c.name}</div>
                <div className="nums">
                  <span className="num">{c.last4 ? `•••• ${c.last4}` : ''}</span>
                  {c.closing_day && c.due_day ? <span>Cierra {c.closing_day} · Vence {c.due_day}</span> : <span className="warn-days">Faltan cierre y vencimiento</span>}
                </div>
              </div>

              {st ? (
                <dl className="kv">
                  <dt>Vence</dt><dd>{dayMonth(st.due_date)}</dd>
                  <dt>Saldo total</dt><dd className="num strong">{ars(st.total_ars)}</dd>
                  {st.total_usd > 0 && <><dt>Saldo en dólares</dt><dd className="num usd">{usd(st.total_usd)}</dd></>}
                  <dt>Pago mínimo</dt><dd className="num">{ars(st.minimum_payment)}</dd>
                  <dt>{st.paid_at ? 'Pagaste' : 'Vas a pagar'}</dt>
                  <dd className="num strong">{ars(st.paid_amount ?? plannedPayment(st, rate))}</dd>
                  <dt>Estado</dt>
                  <dd>{st.paid_at
                    ? <span className="pill ok">Pagado el {dayMonth(st.paid_at)}</span>
                    : <span className={`pill ${st.planned_kind === 'minimo' ? 'warn' : ''}`}>{PLAN_LABEL[st.planned_kind]}</span>}</dd>
                </dl>
              ) : (
                <p className="note" style={{ margin: 0 }}>Sin resumen cargado para {MESES[Number(ym.slice(5, 7)) - 1]}.</p>
              )}
              {st && !st.paid_at && st.planned_kind !== 'total' && statementTotal(st, rate) - plannedPayment(st, rate) > 0 && (
                <p className="note" style={{ margin: 0, color: 'var(--warn)' }}>Quedan {ars(statementTotal(st, rate) - plannedPayment(st, rate))} financiados.</p>
              )}

              <div className="stmt">
                <dl className="kv">
                  <dt>Consumos del mes</dt><dd className="num">{ars(mine.reduce((s, t) => s + toARS(t, rate), 0))}</dd>
                </dl>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>Cuotas de este mes</div>
                  <div className="cuotas">
                    {plans.length === 0 ? <span className="muted">Sin cuotas</span> : plans.map(p => (
                      <div key={p.plan_id}><span>{p.description} <span className="muted">{p.current}/{p.total}</span></span><span className="num">{money(p.amount, p.currency)}</span></div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="btn-row">
                {st && !st.paid_at && <button className="btn sm primary" onClick={() => payStatement(st, c.name)}>Marcar pagado</button>}
                {st?.paid_at && <button className="btn sm" onClick={() => unpayStatement(st)}>Deshacer pago</button>}
                <button className="btn sm" onClick={() => go('cierre')}>{st ? 'Editar resumen' : 'Cargar resumen'}</button>
                <button className="btn sm" onClick={() => setEditingPm(c)}>Editar tarjeta</button>
              </div>
            </div>
          );
        })}
      </div>
      {cards.length === 0 && <p className="empty">No tenés tarjetas cargadas.</p>}

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <h2>Gastos fijos</h2>
          <button className="btn sm" onClick={() => setEditingRec({ rec: null })}>Agregar</button>
        </div>
        {activeRec.length === 0 && suggestions.length === 0 && <p className="empty">Agregá el alquiler, la cuota del auto u otros gastos que se repiten todos los meses.</p>}
        {activeRec.map(r => {
          const i = instances.find(x => x.recurring_id === r.id && x.period === ym);
          return (
            <div key={r.id} className="due">
              <div className="date-chip">{i ? <><b>{i.due_date.slice(8, 10)}</b><span>{MESES[Number(i.due_date.slice(5, 7)) - 1].slice(0, 3)}</span></> : <b>{r.due_day}</b>}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{r.name}</div>
                {i?.paid_at ? <span className="pill ok">Pagado</span> : i && i.due_date < todayIso ? <span className="pill bad">Vencido</span> : <span className="pill">Pendiente</span>}
              </div>
              <div className="btn-row" style={{ justifyContent: 'flex-end', alignItems: 'center' }}>
                <span className="num">{i ? money(i.amount, i.currency) : r.default_amount ? money(r.default_amount, r.currency) : '—'}</span>
                {i && !i.paid_at && <button className="btn sm primary" onClick={() => payInstance(i, r)}>Pagar</button>}
                {i?.paid_at && <button className="btn sm" onClick={() => unpayInstance(i)}>Deshacer</button>}
                <button className="btn sm" onClick={() => setEditingRec({ rec: r })}>Editar</button>
              </div>
            </div>
          );
        })}
        {suggestions.length > 0 && (
          <div className="btn-row" style={{ marginTop: 12, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: '.85rem' }}>Agregar como gasto fijo:</span>
            {suggestions.map(c => (
              <button key={c.id} className="btn sm" onClick={() => setEditingRec({ rec: null, preset: { name: c.name, category_id: c.id } })}>+ {c.name}</button>
            ))}
          </div>
        )}
        <p className="note">Al tocar Pagar se registra el movimiento con el medio de pago del gasto. Los meses futuros se crean solos.</p>
      </div>

      {editingPm && <PMModal pm={editingPm === 'new' ? null : editingPm} defaultKind="credito" onClose={() => setEditingPm(null)} />}
      {editingRec && <RecurringModal rec={editingRec.rec} preset={editingRec.preset} onClose={() => setEditingRec(null)} />}
    </section>
  );
}
