import { addMonthsIso, addMonthsYm, daysBetween, daysInMonth, MESES, nextOccurrence, ymOf } from './dates';
import { ars, splitInstallments } from './money';
import type { CardStatement, Category, PaymentMethod, Recurring, RecurringInstance, Transaction } from './types';

export const toARS = (t: Pick<Transaction, 'amount' | 'currency'>, rate: number) =>
  t.currency === 'USD' ? t.amount * rate : t.amount;

/** Lo que se va a pagar de un resumen, en pesos */
export function plannedPayment(st: CardStatement, rate: number): number {
  if (st.planned_kind === 'minimo') return st.minimum_payment;
  if (st.planned_kind === 'otro') return st.planned_amount ?? 0;
  return st.total_ars + st.total_usd * rate;
}

export const statementTotal = (st: CardStatement, rate: number) => st.total_ars + st.total_usd * rate;

export interface MonthSummary {
  ingresos: number;
  egresos: number;
  /** Gastos con débito, efectivo o transferencia (incluye fijos ya pagados) */
  egresosDirectos: number;
  /** Pagos de tarjeta del mes: lo pagado o planeado del resumen, o los consumos si no hay resumen */
  egresosTarjeta: number;
  /** Gastos fijos del mes que todavía no se pagaron */
  fijosPendientes: number;
  /** Tarjetas sin resumen cargado para el mes (se usan sus consumos como estimación) */
  tarjetasEstimadas: number;
  libre: number;
  /** Porcentaje de los ingresos ya comprometido (0 si no hubo ingresos) */
  pct: number;
}

/**
 * Resumen del mes. Los consumos con tarjeta no se restan dos veces: cuenta lo que se paga del
 * resumen que vence ese mes. Si una tarjeta no tiene resumen cargado, se usan sus consumos del mes.
 */
export function monthSummary(
  txs: Transaction[], ym: string, pms: PaymentMethod[], rate: number,
  statements: CardStatement[] = [], instances: RecurringInstance[] = [],
): MonthSummary {
  const credit = new Set(pms.filter(p => p.kind === 'credito').map(p => p.id));
  const consumos = new Map<string, number>();
  let ingresos = 0, egresosDirectos = 0;
  for (const t of txs) {
    if (ymOf(t.date) !== ym) continue;
    const v = toARS(t, rate);
    if (t.type === 'ingreso') ingresos += v;
    else if (t.payment_method_id && credit.has(t.payment_method_id)) consumos.set(t.payment_method_id, (consumos.get(t.payment_method_id) ?? 0) + v);
    else egresosDirectos += v;
  }
  let egresosTarjeta = 0, tarjetasEstimadas = 0;
  const conResumen = new Set<string>();
  for (const st of statements) {
    if (st.period !== ym) continue;
    conResumen.add(st.payment_method_id);
    egresosTarjeta += st.paid_amount ?? plannedPayment(st, rate);
  }
  for (const [pmId, v] of consumos) {
    if (conResumen.has(pmId)) continue;
    egresosTarjeta += v;
    tarjetasEstimadas++;
  }
  const fijosPendientes = instances
    .filter(i => i.period === ym && !i.paid_at)
    .reduce((s, i) => s + toARS(i, rate), 0);
  const egresos = egresosDirectos + egresosTarjeta + fijosPendientes;
  return {
    ingresos, egresos, egresosDirectos, egresosTarjeta, fijosPendientes, tarjetasEstimadas,
    libre: ingresos - egresos, pct: ingresos > 0 ? (egresos / ingresos) * 100 : 0,
  };
}

export interface CategoryRow { category: Category; spent: number; pct: number | null }

export function spendingByCategory(txs: Transaction[], ym: string, cats: Category[], rate: number): CategoryRow[] {
  const spent = new Map<string, number>();
  for (const t of txs) {
    if (t.type !== 'egreso' || ymOf(t.date) !== ym || !t.category_id) continue;
    spent.set(t.category_id, (spent.get(t.category_id) ?? 0) + toARS(t, rate));
  }
  return cats
    .filter(c => c.kind === 'egreso' && !c.archived && (spent.get(c.id) || c.monthly_cap))
    .map(c => {
      const s = spent.get(c.id) ?? 0;
      return { category: c, spent: s, pct: c.monthly_cap ? (s / c.monthly_cap) * 100 : null };
    })
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.spent - a.spent);
}

export interface Due {
  key: string;
  kind: 'tarjeta' | 'fijo';
  name: string;
  date: string;
  inDays: number;
  /** Monto a pagar en pesos; null si todavía no se cargó el resumen */
  amount: number | null;
  status: 'pendiente' | 'pagado' | 'sin-resumen';
  planKind?: CardStatement['planned_kind'];
}

/**
 * Próximos vencimientos (y los vencidos sin pagar): resúmenes cargados, gastos fijos del mes
 * y, para tarjetas sin resumen, el próximo día de vencimiento habitual.
 */
export function upcomingDues(opts: {
  pms: PaymentMethod[]; todayIso: string; rate: number;
  statements?: CardStatement[]; recurring?: Recurring[]; instances?: RecurringInstance[];
}): Due[] {
  const { pms, todayIso, rate, statements = [], recurring = [], instances = [] } = opts;
  const out: Due[] = [];
  const thisYm = ymOf(todayIso);
  for (const p of pms.filter(p => p.kind === 'credito' && !p.archived)) {
    const pending = statements
      .filter(st => st.payment_method_id === p.id && !st.paid_at && (st.due_date >= todayIso || st.period === thisYm))
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    if (pending.length) {
      for (const st of pending) {
        out.push({ key: st.id, kind: 'tarjeta', name: p.name, date: st.due_date, inDays: daysBetween(todayIso, st.due_date), amount: plannedPayment(st, rate), status: 'pendiente', planKind: st.planned_kind });
      }
    } else if (p.due_day) {
      const date = nextOccurrence(p.due_day, todayIso);
      const loaded = statements.some(st => st.payment_method_id === p.id && st.period === ymOf(date));
      if (!loaded) out.push({ key: p.id, kind: 'tarjeta', name: p.name, date, inDays: daysBetween(todayIso, date), amount: null, status: 'sin-resumen' });
    }
  }
  const names = new Map(recurring.map(r => [r.id, r]));
  for (const i of instances) {
    const r = names.get(i.recurring_id);
    if (!r || !r.active || i.paid_at) continue;
    if (i.due_date < todayIso && i.period !== thisYm) continue;
    out.push({ key: i.id, kind: 'fijo', name: r.name, date: i.due_date, inDays: daysBetween(todayIso, i.due_date), amount: toARS(i, rate), status: 'pendiente' });
  }
  return out.sort((a, b) => a.inDays - b.inDays || a.name.localeCompare(b.name));
}

/** Mes del cierre que conviene cargar: desde el día 15, el mes siguiente. */
export function closingTargetPeriod(todayIso: string): string {
  const ym = ymOf(todayIso);
  return Number(todayIso.slice(8, 10)) >= 15 ? addMonthsYm(ym, 1) : ym;
}

/** Fecha con el día pedido dentro del mes, ajustada a meses cortos */
export function dateInMonth(ym: string, day: number): string {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${String(Math.min(day, daysInMonth(y, m))).padStart(2, '0')}`;
}

/** Consumos con una tarjeta entre el cierre anterior (excluido) y este cierre (incluido) */
export function consumptionBetween(txs: Transaction[], pmId: string, closingIso: string) {
  const from = addMonthsIso(closingIso, -1);
  let ars = 0, usd = 0;
  for (const t of txs) {
    if (t.type !== 'egreso' || t.payment_method_id !== pmId || t.date <= from || t.date > closingIso) continue;
    if (t.currency === 'USD') usd += t.amount; else ars += t.amount;
  }
  return { ars, usd };
}

export type AlertLevel = 'bad' | 'warn' | 'info';
export interface Alert { level: AlertLevel; title: string; detail: string; action?: 'tarjetas' | 'ajustes' | 'cierre' }

const whenText = (n: number) => (n < 0 ? `venció hace ${-n} ${n === -1 ? 'día' : 'días'}` : n === 0 ? 'vence hoy' : n === 1 ? 'vence mañana' : `vence en ${n} días`);

export function buildAlerts(opts: {
  txs: Transaction[]; ym: string; cats: Category[]; pms: PaymentMethod[]; rate: number; todayIso: string;
  statements?: CardStatement[]; recurring?: Recurring[]; instances?: RecurringInstance[];
}): Alert[] {
  const { txs, ym, cats, pms, rate, todayIso, statements = [], recurring = [], instances = [] } = opts;
  const out: Alert[] = [];
  for (const d of upcomingDues({ pms, todayIso, rate, statements, recurring, instances })) {
    if (d.inDays > 3) continue;
    const detail = d.amount !== null ? `A pagar ${ars(d.amount)}` : 'Cargá el resumen para saber cuánto pagar';
    out.push({ level: 'bad', title: `${d.name}: ${whenText(d.inDays)}`, detail, action: d.kind === 'tarjeta' && d.amount === null ? 'cierre' : 'tarjetas' });
  }
  for (const st of statements) {
    if (st.paid_at || st.planned_kind !== 'minimo' || st.due_date < todayIso) continue;
    const resto = statementTotal(st, rate) - st.minimum_payment;
    if (resto <= 0) continue;
    const pm = pms.find(p => p.id === st.payment_method_id);
    out.push({ level: 'warn', title: `${pm?.name ?? 'Tarjeta'}: vas a pagar el mínimo`, detail: `Quedan ${ars(resto)} financiados con interés`, action: 'tarjetas' });
  }
  if (ymOf(todayIso) === ym) {
    for (const r of spendingByCategory(txs, ym, cats, rate)) {
      if (r.pct !== null && r.pct >= 80) {
        out.push({
          level: r.pct >= 100 ? 'bad' : 'warn',
          title: `${r.category.name}: ${Math.round(r.pct)}% del tope`,
          detail: `Gastaste ${ars(r.spent)} de ${ars(r.category.monthly_cap!)}`,
        });
      }
    }
  }
  const target = closingTargetPeriod(todayIso);
  const sinResumen = pms.filter(p => p.kind === 'credito' && !p.archived && !statements.some(st => st.payment_method_id === p.id && st.period === target));
  if (target !== ymOf(todayIso) && sinResumen.length) {
    out.push({ level: 'info', title: 'Cierre de mes: cargá los resúmenes', detail: `Faltan ${sinResumen.length} de ${MESES[Number(target.slice(5, 7)) - 1]}`, action: 'cierre' });
  }
  const missing = pms.filter(p => p.kind === 'credito' && !p.archived && (!p.closing_day || !p.due_day));
  if (missing.length) {
    out.push({
      level: 'info',
      title: missing.length === 1 ? `Definí cierre y vencimiento de ${missing[0].name}` : `Definí cierre y vencimiento de ${missing.length} tarjetas`,
      detail: 'Así te avisamos antes de cada vencimiento',
      action: 'tarjetas',
    });
  }
  return out;
}

/** Total de cuotas de tarjeta por mes, desde `fromYm` durante `months` meses. */
export function installmentProjection(txs: Transaction[], fromYm: string, months: number, rate: number) {
  const totals = Array.from({ length: months }, (_, i) => ({ ym: addMonthsYm(fromYm, i), total: 0 }));
  const idx = new Map(totals.map((t, i) => [t.ym, i]));
  for (const t of txs) {
    if (!t.plan_id || t.type !== 'egreso') continue;
    const i = idx.get(ymOf(t.date));
    if (i !== undefined) totals[i].total += toARS(t, rate);
  }
  return totals;
}

export interface ActivePlan { plan_id: string; description: string; current: number; total: number; amount: number; currency: Transaction['currency'] }

/** Compras en cuotas que tienen una cuota en el mes `ym`, por medio de pago. */
export function activePlans(txs: Transaction[], ym: string, pmId: string): ActivePlan[] {
  return txs
    .filter(t => t.plan_id && t.payment_method_id === pmId && ymOf(t.date) === ym)
    .map(t => ({ plan_id: t.plan_id!, description: t.description, current: t.installment_number ?? 1, total: t.installments_total ?? 1, amount: t.amount, currency: t.currency }));
}

/** Arma las filas de una compra en cuotas: una por mes, mismo plan_id. */
export function buildInstallments(base: Omit<Transaction, 'id' | 'plan_id' | 'installment_number' | 'installments_total'>, n: number, newId: () => string): Transaction[] {
  if (n <= 1) return [{ ...base, id: newId(), plan_id: null, installment_number: null, installments_total: null }];
  const plan = newId();
  return splitInstallments(base.amount, n).map((amount, i) => ({
    ...base,
    id: newId(),
    amount,
    date: addMonthsIso(base.date, i),
    plan_id: plan,
    installment_number: i + 1,
    installments_total: n,
  }));
}


/**
 * Instancias que faltan para los meses pedidos. El monto sale del último mes cargado (así sigue
 * un aumento) o, si es el primero, del monto habitual del gasto.
 */
export function missingInstances(recurring: Recurring[], existing: RecurringInstance[], periods: string[], newId: () => string): RecurringInstance[] {
  const out: RecurringInstance[] = [];
  for (const r of recurring) {
    if (!r.active) continue;
    const mine = existing.filter(i => i.recurring_id === r.id).sort((a, b) => a.period.localeCompare(b.period));
    for (const period of periods) {
      if (mine.some(i => i.period === period)) continue;
      const prev = [...mine].reverse().find(i => i.period < period);
      out.push({
        id: newId(), recurring_id: r.id, period, due_date: dateInMonth(period, r.due_day),
        amount: prev?.amount ?? r.default_amount ?? 0, currency: r.currency, paid_at: null, transaction_id: null,
      });
    }
  }
  return out;
}
