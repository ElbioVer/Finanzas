import { useState } from 'react';
import { Icon } from '../components/Icon';
import { MonthNav } from '../components/MonthNav';
import { useApp } from '../context';
import { MESES, parseIso, ymOf } from '../lib/dates';
import { money } from '../lib/money';

type Filtro = 'todos' | 'ingreso' | 'egreso';

export function Movimientos() {
  const { txs, cats, pms, ym, openTx } = useApp();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [q, setQ] = useState('');
  const catName = new Map(cats.map(c => [c.id, c.name]));
  const pmById = new Map(pms.map(p => [p.id, p]));
  const query = q.trim().toLowerCase();

  const list = txs
    .filter(t => ymOf(t.date) === ym && (filtro === 'todos' || t.type === filtro))
    .filter(t => !query || [t.description, catName.get(t.category_id ?? ''), pmById.get(t.payment_method_id ?? '')?.name].join(' ').toLowerCase().includes(query))
    .sort((a, b) => b.date.localeCompare(a.date));

  const groups: { date: string; items: typeof list }[] = [];
  for (const t of list) {
    if (groups.at(-1)?.date !== t.date) groups.push({ date: t.date, items: [] });
    groups.at(-1)!.items.push(t);
  }

  return (
    <section>
      <div className="view-head">
        <MonthNav eyebrow="Movimientos" />
        <button className="btn primary" onClick={() => openTx()}><Icon name="plus" size={16} />Movimiento</button>
      </div>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Filtrar">
          {(['todos', 'ingreso', 'egreso'] as Filtro[]).map(f => (
            <button key={f} aria-pressed={filtro === f} onClick={() => setFiltro(f)}>{{ todos: 'Todos', ingreso: 'Ingresos', egreso: 'Egresos' }[f]}</button>
          ))}
        </div>
        <input className="search" id="q" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar comercio, tópico o tarjeta" aria-label="Buscar" />
      </div>
      <div className="panel" style={{ paddingBlock: '4px 8px' }}>
        {groups.length === 0 && <p className="empty">{query || filtro !== 'todos' ? 'No hay movimientos con ese filtro.' : 'No hay movimientos este mes. Tocá "+ Movimiento" para cargar el primero.'}</p>}
        {groups.map(g => {
          const d = parseIso(g.date);
          return (
            <div key={g.date}>
              <div className="day">{d.getDate()} de {MESES[d.getMonth()]}</div>
              {g.items.map(t => {
                const pm = pmById.get(t.payment_method_id ?? '');
                const isIn = t.type === 'ingreso';
                return (
                  <div key={t.id} className="mov" role="button" tabIndex={0} onClick={() => openTx(t)} onKeyDown={e => { if (e.key === 'Enter') openTx(t); }}>
                    <div className={`ico ${isIn ? 'in' : ''}`}>{t.description[0]?.toUpperCase()}</div>
                    <div style={{ minWidth: 0 }}>
                      <div className="t">{t.description}</div>
                      <div className="meta">
                        <span>{catName.get(t.category_id ?? '') ?? 'Sin tópico'}</span>
                        {pm && <span className={`pill ${pm.kind === 'credito' ? '' : 'ok'}`}>{pm.name}</span>}
                        {t.installments_total && <span className="pill">Cuota {t.installment_number}/{t.installments_total}</span>}
                        {t.currency === 'USD' && <span className="pill usd">USD</span>}
                      </div>
                    </div>
                    <div className={`amt num ${isIn ? 'in' : ''} ${t.currency === 'USD' ? 'usd' : ''}`}>{isIn ? '+' : '−'} {money(t.amount, t.currency)}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
