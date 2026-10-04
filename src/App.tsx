import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Icon, IconSprite, type IconName } from './components/Icon';
import { TxModal } from './components/TxModal';
import { Ctx, VIEWS, type AppCtx, type View } from './context';
import { createDemoStore } from './data/demoStore';
import { createSupabaseStore, supabase } from './data/supabaseStore';
import { addMonthsYm, monthEnd, monthStart, today, ymOf } from './lib/dates';
import { fetchOficial, type FxQuote } from './lib/fx';
import type { CardStatement, Category, PaymentMethod, Recurring, RecurringInstance, Settings, Transaction } from './lib/types';
import { missingInstances } from './lib/calc';
import { newId } from './data/store';
import { Cierre } from './views/Cierre';
import { Ajustes } from './views/Ajustes';
import { Inicio } from './views/Inicio';
import { Login } from './views/Login';
import { Movimientos } from './views/Movimientos';
import { Proximamente } from './views/Proximamente';
import { Tarjetas } from './views/Tarjetas';

const NAV: { view: View; label: string; icon: IconName }[] = [
  { view: 'inicio', label: 'Inicio', icon: 'home' },
  { view: 'movimientos', label: 'Movimientos', icon: 'list' },
  { view: 'tarjetas', label: 'Tarjetas y deudas', icon: 'card' },
  { view: 'cierre', label: 'Cierre de mes', icon: 'cal' },
  { view: 'escanear', label: 'Escanear ticket', icon: 'scan' },
  { view: 'ajustes', label: 'Tópicos y alertas', icon: 'gear' },
];

const viewFromHash = (): View => {
  const h = location.hash.slice(1) as View;
  return VIEWS.includes(h) ? h : 'inicio';
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!authReady) return <div className="loading">Cargando…</div>;
  if (supabase && !session) return <Login />;
  return <Shell key={session?.user.id ?? 'demo'} email={session?.user.email ?? null} />;
}

function Shell({ email }: { email: string | null }) {
  const store = useMemo(() => (supabase ? createSupabaseStore(supabase) : createDemoStore()), []);
  const todayIso = today();
  const [view, setView] = useState<View>(viewFromHash);
  const [ym, setYm] = useState(ymOf(todayIso));
  const [cats, setCats] = useState<Category[]>([]);
  const [pms, setPms] = useState<PaymentMethod[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [statements, setStatements] = useState<CardStatement[]>([]);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [instances, setInstances] = useState<RecurringInstance[]>([]);
  const [settings, setSettings] = useState<Settings>({ fx_source: 'oficial', fx_manual: null });
  const [quote, setQuote] = useState<FxQuote | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number>(undefined);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const reload = useCallback(async () => {
    try {
      const cur = ymOf(todayIso);
      // Rango que cubre el mes elegido y el actual (las alertas y vencimientos miran el mes actual)
      const from = [addMonthsYm(ym, -1), addMonthsYm(cur, -1)].sort()[0];
      const to = [addMonthsYm(ym, 2), addMonthsYm(cur, 2)].sort()[1];
      const [c, p, t, s, st, rec, inst] = await Promise.all([
        store.listCategories(),
        store.listPaymentMethods(),
        store.listTransactions(monthStart(addMonthsYm(ym, -1)), monthEnd(addMonthsYm(ym, 6))),
        store.getSettings(),
        store.listStatements(from, to),
        store.listRecurring(),
        store.listInstances(from, to),
      ]);
      // Los gastos fijos del mes actual, el siguiente y el elegido (si es futuro) se crean solos
      const periods = [...new Set([cur, addMonthsYm(cur, 1), ym])].filter(x => x >= cur);
      const missing = missingInstances(rec, inst, periods, newId);
      const finalInst = missing.length ? (await store.ensureInstances(missing), await store.listInstances(from, to)) : inst;
      setCats(c); setPms(p); setTxs(t); setSettings(s);
      setStatements(st); setRecurring(rec); setInstances(finalInst);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoaded(true);
    }
  }, [store, ym, todayIso]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { fetchOficial().then(setQuote); }, []);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((v: View) => {
    if (location.hash.slice(1) !== v) location.hash = v;
    setView(v);
    window.scrollTo(0, 0);
  }, []);

  const run = useCallback(async (fn: () => Promise<unknown>, okMsg?: string) => {
    try {
      await fn();
      await reload();
      if (okMsg) toast(okMsg);
      return true;
    } catch (e) {
      toast('No se pudo guardar: ' + (e instanceof Error ? e.message : String(e)));
      return false;
    }
  }, [reload, toast]);

  const rate = settings.fx_source === 'oficial' ? quote?.venta ?? settings.fx_manual ?? 0 : settings.fx_manual ?? 0;

  const ctx: AppCtx = {
    store, cats, pms, txs, statements, recurring, instances, settings, quote, rate, ym, setYm, todayIso, reload, run, go, toast, email,
    openTx: tx => setEditing(tx ?? 'new'),
    signOut: () => { supabase?.auth.signOut(); },
  };

  let content;
  if (!loaded) content = <div className="loading">Cargando tus datos…</div>;
  else if (loadError) content = (
    <div className="panel soon-box">
      <h2>No pudimos leer tus datos</h2>
      <p className="muted" style={{ margin: 0 }}>{loadError}</p>
      <p className="note" style={{ margin: 0 }}>Revisá que hayas corrido en Supabase todos los scripts de la carpeta supabase/migrations, en orden (ver docs/SETUP.md).</p>
      <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={reload}>Reintentar</button>
    </div>
  );
  else content = {
    inicio: <Inicio />,
    movimientos: <Movimientos />,
    tarjetas: <Tarjetas />,
    cierre: <Cierre />,
    escanear: <Proximamente title="Escanear ticket" etapa={4} items={[
      'Sacás una foto del ticket y se leen comercio, fecha, total e ítems.',
      'OCR gratis en el celular, o lectura con IA cuando el ticket está gastado.',
      'Elegís débito, efectivo o tarjeta y en cuántas cuotas.',
    ]} />,
    ajustes: <Ajustes />,
  }[view];

  return (
    <Ctx.Provider value={ctx}>
      <IconSprite />
      <div className="app">
        <aside className="side" aria-label="Menú">
          <div className="brand"><i>$</i>Finanzas</div>
          {NAV.map(n => (
            <button key={n.view} className="nav-btn" aria-current={view === n.view} onClick={() => go(n.view)}>
              <Icon name={n.icon} />{n.label}
            </button>
          ))}
          <div className="side-foot">
            {store.mode === 'demo' ? <><span className="sample">Modo demo</span><br />Los datos quedan solo en este navegador.</> : <>Conectado como<br />{email}</>}
          </div>
        </aside>
        <main>
          {store.mode === 'demo' && (
            <div className="banner">
              <span><b>Modo demo:</b> estás viendo datos de ejemplo guardados en este navegador. Conectá Supabase para usar tus datos en el celular y la PC.</span>
            </div>
          )}
          {content}
        </main>
      </div>
      <nav className="tabbar" aria-label="Menú">
        {(['inicio', 'movimientos'] as View[]).map(v => <TabBtn key={v} v={v} view={view} go={go} />)}
        <button className="fab" aria-label="Nuevo movimiento" onClick={() => setEditing('new')}><span className="c"><Icon name="plus" /></span></button>
        {(['tarjetas', 'ajustes'] as View[]).map(v => <TabBtn key={v} v={v} view={view} go={go} />)}
      </nav>
      {editing && <TxModal tx={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </Ctx.Provider>
  );
}

function TabBtn({ v, view, go }: { v: View; view: View; go: (v: View) => void }) {
  const n = NAV.find(x => x.view === v)!;
  const label = { inicio: 'Inicio', movimientos: 'Movim.', tarjetas: 'Tarjetas', ajustes: 'Ajustes' }[v as string] ?? n.label;
  return <button aria-current={view === v} onClick={() => go(v)}><Icon name={n.icon} />{label}</button>;
}
