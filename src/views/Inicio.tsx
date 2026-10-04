import { Icon } from '../components/Icon';
import { MonthNav } from '../components/MonthNav';
import { useApp } from '../context';
import { buildAlerts, installmentProjection, monthSummary, spendingByCategory, upcomingDues } from '../lib/calc';
import { DIAS, MESES, parseIso, shortMonth } from '../lib/dates';
import { ars } from '../lib/money';

export function Inicio() {
  const { txs, cats, pms, rate, ym, todayIso, go, openTx } = useApp();
  const s = monthSummary(txs, ym, pms, rate);
  const rows = spendingByCategory(txs, ym, cats, rate);
  const alerts = buildAlerts({ txs, ym, cats, pms, rate, todayIso });
  const dues = upcomingDues(pms, todayIso);
  const proj = installmentProjection(txs, ym, 6, rate);
  const projMax = Math.max(1, ...proj.map(p => p.total));
  const t = parseIso(todayIso);
  const pct = Math.min(100, s.pct);

  return (
    <section>
      <div className="view-head">
        <MonthNav eyebrow={`${DIAS[t.getDay()]} ${t.getDate()} de ${MESES[t.getMonth()]}`} />
        <button className="btn primary" onClick={() => openTx()}><Icon name="plus" size={16} />Movimiento</button>
      </div>

      <div className="grid">
        <div className="panel balance">
          <div className="hero">
            <span className="eyebrow">Te queda en el mes</span>
            <span className="big num" style={s.libre < 0 ? { color: 'var(--bad)' } : undefined}>{ars(s.libre)}</span>
            <div className="meter"><span style={{ width: `${pct}%`, background: pct > 90 ? 'var(--warn)' : undefined }} /></div>
            <span className="sub">{s.ingresos > 0 ? `Gastaste el ${Math.round(s.pct)}% de lo que entró` : 'Todavía no cargaste ingresos este mes'}</span>
          </div>
          <div>
            <span className="eyebrow">Ingresos</span>
            <span className="big num in">{ars(s.ingresos)}</span>
            <span className="sub">Sueldo + extras</span>
          </div>
          <div>
            <span className="eyebrow">Egresos</span>
            <span className="big num">{ars(s.egresos)}</span>
            <span className="sub">Débito y efectivo {ars(s.egresosDirectos)} · Tarjetas {ars(s.egresosTarjeta)}</span>
          </div>
        </div>

        <div className="grid g-dash">
          <div className="grid">
            <div className="panel">
              <div className="panel-head"><h2>Alertas</h2>{alerts.length > 0 && <span className="pill warn">{alerts.length} {alerts.length === 1 ? 'activa' : 'activas'}</span>}</div>
              {alerts.length === 0 ? <p className="empty">Todo en orden. No hay alertas.</p> : alerts.map((a, i) => (
                <div key={i} className={`alert ${a.level}`}>
                  <span className="stripe" />
                  <p>{a.title}<br /><small>{a.detail}</small></p>
                  {a.action ? <button className="btn sm" onClick={() => go(a.action!)}>Ver</button> : <span />}
                </div>
              ))}
            </div>
            <div className="panel">
              <div className="panel-head"><h2>En qué se va la plata</h2><span className="muted" style={{ fontSize: '.8rem' }}>vs. tope mensual</span></div>
              {rows.length === 0 ? <p className="empty">Cuando cargues gastos, acá vas a ver cuánto llevás en cada tópico.</p> : rows.map(r => (
                <div key={r.category.id} className="cat-row">
                  <span>{r.category.name}</span>
                  <div className="track" title={r.pct !== null ? `${Math.round(r.pct)}% del tope` : 'Sin tope'}>
                    <div className={`fill ${r.pct !== null && r.pct >= 80 ? 'over' : ''}`} style={{ width: `${r.pct !== null ? Math.min(100, r.pct) : 100}%`, opacity: r.pct === null ? 0.35 : 1 }} />
                  </div>
                  <span className="num">{ars(r.spent)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid">
            <div className="panel">
              <div className="panel-head"><h2>Próximos vencimientos</h2><button className="btn sm" onClick={() => go('tarjetas')}>Ver todo</button></div>
              {dues.length === 0 ? <p className="empty">Cargá el día de vencimiento de tus tarjetas para verlos acá.</p> : dues.map(d => {
                const date = parseIso(d.date);
                return (
                  <div key={d.pm.id} className="due">
                    <div className={`date-chip ${d.inDays <= 3 ? 'soon' : ''}`}><b>{String(date.getDate()).padStart(2, '0')}</b><span>{MESES[date.getMonth()].slice(0, 3)}</span></div>
                    <div><div style={{ fontWeight: 600 }}>{d.pm.name}</div><span className="muted" style={{ fontSize: '.78rem' }}>{d.inDays === 0 ? 'vence hoy' : d.inDays === 1 ? 'vence mañana' : `en ${d.inDays} días`}</span></div>
                    <span className="pill">Resumen</span>
                  </div>
                );
              })}
            </div>
            <div className="panel">
              <div className="panel-head"><h2>Cuotas ya comprometidas</h2><span className="muted" style={{ fontSize: '.8rem' }}>próximos 6 meses</span></div>
              {proj.every(p => p.total === 0) ? <p className="empty">No tenés compras en cuotas.</p> : (
                <div className="proj">
                  {proj.map(p => (
                    <div key={p.ym}>
                      <span className="v">{p.total ? `${Math.round(p.total / 1000)}k` : '0'}</span>
                      <span className="bar" style={{ height: `${Math.max(4, (p.total / projMax) * 100)}px` }} />
                      {shortMonth(p.ym)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
