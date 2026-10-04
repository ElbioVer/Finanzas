import { useState } from 'react';
import { PMModal } from '../components/PMModal';
import { useApp } from '../context';
import { activePlans, toARS } from '../lib/calc';
import { monthLabel, ymOf } from '../lib/dates';
import { ars, money, usd } from '../lib/money';
import type { PaymentMethod } from '../lib/types';

const FACE: Record<string, string> = { carrefour: 'cc-carrefour', cencosud: 'cc-cencosud', naranja: 'cc-naranja' };

export function Tarjetas() {
  const { pms, txs, ym, rate } = useApp();
  const [editing, setEditing] = useState<PaymentMethod | 'new' | null>(null);
  const cards = pms.filter(p => p.kind === 'credito' && !p.archived);

  return (
    <section>
      <div className="view-head">
        <div><div className="eyebrow">Consumos de {monthLabel(ym).toLowerCase()}</div><h1>Tarjetas y deudas</h1></div>
        <button className="btn primary" onClick={() => setEditing('new')}>Agregar tarjeta</button>
      </div>
      <div className="grid cards">
        {cards.map(c => {
          const mine = txs.filter(t => t.payment_method_id === c.id && t.type === 'egreso' && ymOf(t.date) === ym);
          const pesos = mine.filter(t => t.currency === 'ARS').reduce((s, t) => s + t.amount, 0);
          const dolares = mine.filter(t => t.currency === 'USD').reduce((s, t) => s + t.amount, 0);
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
              <dl className="kv">
                <dt>Consumos en pesos</dt><dd className="num strong">{ars(pesos)}</dd>
                <dt>Consumos en dólares</dt><dd className="num usd">{usd(dolares)}</dd>
                <dt>Total en pesos</dt><dd className="num">{ars(mine.reduce((s, t) => s + toARS(t, rate), 0))}</dd>
              </dl>
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Cuotas de este mes</div>
                <div className="cuotas">
                  {plans.length === 0 ? <span className="muted">Sin cuotas</span> : plans.map(p => (
                    <div key={p.plan_id}><span>{p.description} <span className="muted">{p.current}/{p.total}</span></span><span className="num">{money(p.amount, p.currency)}</span></div>
                  ))}
                </div>
              </div>
              <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing(c)}>Editar tarjeta</button>
            </div>
          );
        })}
      </div>
      {cards.length === 0 && <p className="empty">No tenés tarjetas cargadas.</p>}
      <div className="panel" style={{ marginTop: 16 }}>
        <h2 style={{ marginBottom: 6 }}>Próximamente</h2>
        <p className="muted" style={{ margin: 0 }}>En la etapa 2 vas a poder cargar el resumen de cada tarjeta (total, pago mínimo y lo que vas a pagar) desde el cierre de mes, y marcar como pagados el alquiler y la cuota del auto.</p>
      </div>
      {editing && <PMModal pm={editing === 'new' ? null : editing} defaultKind="credito" onClose={() => setEditing(null)} />}
    </section>
  );
}
