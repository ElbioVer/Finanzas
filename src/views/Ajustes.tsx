import { useState, type FormEvent } from 'react';
import { PMModal } from '../components/PMModal';
import { useApp } from '../context';
import { newId } from '../data/store';
import { resetDemo } from '../data/demoStore';
import { ars, parseAmount } from '../lib/money';
import { PM_KIND_LABEL, type Category, type PaymentMethod, type TxType } from '../lib/types';

export function Ajustes() {
  const { cats, pms, store, run, settings, quote, rate, email, signOut } = useApp();
  const [kind, setKind] = useState<TxType>('egreso');
  const [newName, setNewName] = useState('');
  const [newCap, setNewCap] = useState('');
  const [newFixed, setNewFixed] = useState(false);
  const [editingPm, setEditingPm] = useState<PaymentMethod | 'new' | null>(null);
  const [manual, setManual] = useState(settings.fx_manual ? String(settings.fx_manual) : '');

  const list = cats.filter(c => c.kind === kind && !c.archived);

  async function addTopic(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const cap = parseAmount(newCap);
    const c: Category = {
      id: newId(), name, kind, is_fixed: kind === 'egreso' && newFixed, monthly_cap: kind === 'egreso' && cap > 0 ? cap : null,
      archived: false, sort: Math.max(0, ...cats.map(x => x.sort)) + 1,
    };
    if (await run(() => store.saveCategory(c), `Agregaste ${name}`)) { setNewName(''); setNewCap(''); setNewFixed(false); }
  }

  function saveCap(c: Category, raw: string) {
    const cap = parseAmount(raw);
    const next = raw.trim() === '' ? null : cap > 0 ? cap : c.monthly_cap;
    if (next !== c.monthly_cap) run(() => store.saveCategory({ ...c, monthly_cap: next }), `Tope de ${c.name} actualizado`);
  }

  function saveFx(source: 'oficial' | 'manual') {
    const m = parseAmount(manual);
    run(() => store.saveSettings({ fx_source: source, fx_manual: m > 0 ? m : null }), 'Cotización guardada');
  }

  return (
    <section>
      <div className="view-head"><div><div className="eyebrow">Configuración</div><h1>Tópicos y alertas</h1></div></div>
      <div className="grid g-set">
        <div className="panel">
          <div className="panel-head">
            <h2>Tópicos</h2>
            <div className="seg" role="group" aria-label="Tipo de tópico">
              <button aria-pressed={kind === 'egreso'} onClick={() => setKind('egreso')}>Egresos</button>
              <button aria-pressed={kind === 'ingreso'} onClick={() => setKind('ingreso')}>Ingresos</button>
            </div>
          </div>
          {list.map(c => (
            <div key={c.id} className="topic">
              <div>
                <div style={{ fontWeight: 600 }}>{c.name}</div>
                <span className="muted" style={{ fontSize: '.8rem' }}>{c.kind === 'ingreso' ? 'Ingreso' : c.is_fixed ? 'Gasto fijo mensual' : 'Gasto variable'}</span>
              </div>
              {kind === 'egreso'
                ? <input className="input num inline-cap" aria-label={`Tope mensual de ${c.name}`} defaultValue={c.monthly_cap ? c.monthly_cap.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''} placeholder="Sin tope" onBlur={e => saveCap(c, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
                : <span />}
              <button className="btn sm" onClick={() => run(() => store.saveCategory({ ...c, archived: true }), `Quitaste ${c.name}`)}>Quitar</button>
            </div>
          ))}
          <form onSubmit={addTopic} style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="row2" style={{ gridTemplateColumns: kind === 'egreso' ? '1fr 130px' : '1fr' }}>
              <div className="field"><label htmlFor="t-name">Nuevo tópico de {kind}</label><input className="input" id="t-name" value={newName} onChange={e => setNewName(e.target.value)} placeholder={kind === 'egreso' ? 'Ej: Gimnasio' : 'Ej: Freelance'} maxLength={60} /></div>
              {kind === 'egreso' && <div className="field"><label htmlFor="t-cap">Tope mensual $</label><input className="input num" id="t-cap" inputMode="numeric" value={newCap} onChange={e => setNewCap(e.target.value)} placeholder="Opcional" /></div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {kind === 'egreso' ? <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.88rem' }}><input type="checkbox" checked={newFixed} onChange={e => setNewFixed(e.target.checked)} />Es un gasto fijo mensual</label> : <span />}
              <button className="btn primary" type="submit">Agregar</button>
            </div>
          </form>
          <p className="note">El tope sirve para las alertas: te avisamos al llegar al 80% y al 100%.</p>
        </div>

        <div className="grid">
          <div className="panel">
            <div className="panel-head"><h2>Medios de pago</h2><button className="btn sm" onClick={() => setEditingPm('new')}>Agregar</button></div>
            {pms.filter(p => !p.archived).map(p => (
              <div key={p.id} className="set-row">
                <p>{p.name}<small>{PM_KIND_LABEL[p.kind]}{p.kind === 'credito' ? (p.closing_day && p.due_day ? ` · cierra ${p.closing_day}, vence ${p.due_day}` : ' · faltan cierre y vencimiento') : ''}</small></p>
                <button className="btn sm" onClick={() => setEditingPm(p)}>Editar</button>
              </div>
            ))}
          </div>

          <div className="panel">
            <h2 style={{ marginBottom: 6 }}>Dólar</h2>
            <div className="set-row">
              <p>Cotización para convertir USD<small>{settings.fx_source === 'oficial' ? 'Dólar oficial, se actualiza sola' : 'Valor manual'}</small></p>
              <div className="seg" role="group" aria-label="Fuente de la cotización">
                <button aria-pressed={settings.fx_source === 'oficial'} onClick={() => saveFx('oficial')}>Oficial</button>
                <button aria-pressed={settings.fx_source === 'manual'} onClick={() => saveFx('manual')}>Manual</button>
              </div>
            </div>
            <div className="set-row">
              <p>Valor que se usa<small>{settings.fx_source === 'oficial' ? (quote ? `Oficial venta, actualizado ${new Date(quote.fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}` : 'Sin conexión: se usa el valor manual') : 'Cargado por vos'}</small></p>
              <span className="num usd">{rate ? `${ars(rate)} por US$` : 'Sin valor'}</span>
            </div>
            <div className="set-row">
              <p>Valor manual<small>Se usa si elegís Manual o si no hay conexión</small></p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input num inline-cap" aria-label="Valor manual del dólar" inputMode="decimal" value={manual} onChange={e => setManual(e.target.value)} placeholder="Ej: 1450" />
                <button className="btn sm" onClick={() => saveFx(settings.fx_source)}>Guardar</button>
              </div>
            </div>
          </div>

          <div className="panel">
            <h2 style={{ marginBottom: 6 }}>Cuenta</h2>
            {store.mode === 'supabase' ? (
              <div className="set-row"><p>{email}<small>Tus datos se sincronizan entre el celular y la PC</small></p><button className="btn sm" onClick={signOut}>Cerrar sesión</button></div>
            ) : (
              <div className="set-row"><p>Modo demo<small>Borra los cambios y vuelve a los datos de ejemplo</small></p><button className="btn sm" onClick={() => { resetDemo(); location.reload(); }}>Reiniciar demo</button></div>
            )}
            <p className="note">Las alertas por notificación y Google Calendar llegan en la etapa 3.</p>
          </div>
        </div>
      </div>
      {editingPm && <PMModal pm={editingPm === 'new' ? null : editingPm} defaultKind="debito" onClose={() => setEditingPm(null)} />}
    </section>
  );
}
