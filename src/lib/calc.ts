import { addMonthsIso, addMonthsYm, daysBetween, nextOccurrence, ymOf } from './dates';
import { ars, splitInstallments } from './money';
import type { Category, PaymentMethod, Transaction } from './types';

export const toARS = (t: Pick<Transaction, 'amount' | 'currency'>, rate: number) =>
  t.currency === 'USD' ? t.amount * rate : t.amount;

export interface MonthSummary {
  ingresos: number;
  egresos: number;
  egresosDirectos: number;
  egresosTarjeta: number;
  libre: number;
  /** Porcentaje de los ingresos ya gastado (0 si no hubo ingresos) */
  pct: number;
}

export function monthSummary(txs: Transaction[], ym: string, pms: PaymentMethod[], rate: number): MonthSummary {
  const credit = new Set(pms.filter(p => p.kind === 'credito').map(p => p.id));
  let ingresos = 0, egresosDirectos = 0, egresosTarjeta = 0;
  for (const t of txs) {
    if (ymOf(t.date) !== ym) continue;
    const v = toARS(t, rate);
    if (t.type === 'ingreso') ingresos += v;
    else if (t.payment_method_id && credit.has(t.payment_method_id)) egresosTarjeta += v;
    else egresosDirectos += v;
  }
  const egresos = egresosDirectos + egresosTarjeta;
  return { ingresos, egresos, egresosDirectos, egresosTarjeta, libre: ingresos - egresos, pct: ingresos > 0 ? (egresos / ingresos) * 100 : 0 };
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

export interface Due { pm: PaymentMethod; date: string; inDays: number }

export function upcomingDues(pms: PaymentMethod[], todayIso: string): Due[] {
  return pms
    .filter(p => p.kind === 'credito' && !p.archived && p.due_day)
    .map(p => {
      const date = nextOccurrence(p.due_day!, todayIso);
      return { pm: p, date, inDays: daysBetween(todayIso, date) };
    })
    .sort((a, b) => a.inDays - b.inDays);
}

export type AlertLevel = 'bad' | 'warn' | 'info';
export interface Alert { level: AlertLevel; title: string; detail: string; action?: 'tarjetas' | 'ajustes' }

export function buildAlerts(opts: {
  txs: Transaction[]; ym: string; cats: Category[]; pms: PaymentMethod[]; rate: number; todayIso: string;
}): Alert[] {
  const { txs, ym, cats, pms, rate, todayIso } = opts;
  const out: Alert[] = [];
  for (const d of upcomingDues(pms, todayIso)) {
    if (d.inDays <= 3) {
      const when = d.inDays === 0 ? 'hoy' : d.inDays === 1 ? 'mañana' : `en ${d.inDays} días`;
      out.push({ level: 'bad', title: `Vence ${d.pm.name} ${when}`, detail: 'Revisá el resumen y pagalo a tiempo', action: 'tarjetas' });
    }
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

