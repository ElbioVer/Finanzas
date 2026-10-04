import { buildInstallments } from '../lib/calc';
import { addMonthsIso, today, ymOf } from '../lib/dates';
import type { CardStatement, Category, PaymentMethod, Recurring, RecurringInstance, Settings, Transaction } from '../lib/types';
import { defaultCategories, defaultPaymentMethods } from './defaults';
import { newId, type Store } from './store';

const KEY = 'finanzas.demo.v2';

interface DemoData {
  cats: Category[]; pms: PaymentMethod[]; txs: Transaction[]; settings: Settings;
  statements: CardStatement[]; recurring: Recurring[]; instances: RecurringInstance[];
}

function sample(): DemoData {
  const cats = defaultCategories();
  const pms = defaultPaymentMethods();
  const c = (n: string) => cats.find(x => x.name === n)!.id;
  const p = (n: string) => pms.find(x => x.name === n)!.id;
  for (const [n, cap] of [['Supermercado', 260000], ['Nafta', 90000], ['Salud', 40000], ['Hogar', 120000], ['Suscripciones', 35000], ['Salidas', 80000]] as const) {
    cats.find(x => x.name === n)!.monthly_cap = cap;
  }
  Object.assign(pms.find(x => x.name === 'TC Naranja')!, { closing_day: 26, due_day: 7, last4: '4417' });
  Object.assign(pms.find(x => x.name === 'TC Carrefour')!, { closing_day: 2, due_day: 13, last4: '0932' });

  const ym = ymOf(today());
  const d = (day: number) => `${ym}-${String(day).padStart(2, '0')}`;
  const tx = (date: string, description: string, amount: number, type: Transaction['type'], cat: string, pmName: string, currency: Transaction['currency'] = 'ARS'): Omit<Transaction, 'id' | 'plan_id' | 'installment_number' | 'installments_total'> =>
    ({ date, description, amount, currency, type, category_id: c(cat), payment_method_id: p(pmName) });
  const one = (b: ReturnType<typeof tx>) => buildInstallments(b, 1, newId);
  const txs: Transaction[] = [
    ...one(tx(d(1), 'Sueldo', 1850000, 'ingreso', 'Sueldo', 'Galicia')),
    ...one(tx(d(2), 'Carrefour Market', 48730, 'egreso', 'Supermercado', 'TC Carrefour')),
    ...one(tx(d(2), 'YPF', 35000, 'egreso', 'Nafta', 'Galicia')),
    ...one(tx(d(3), 'Farmacity', 12480, 'egreso', 'Salud', 'Efectivo')),
    ...one(tx(d(3), 'Netflix', 9.99, 'egreso', 'Suscripciones', 'TC Naranja', 'USD')),
    ...one(tx(d(3), 'Venta bici usada', 60000, 'ingreso', 'Ingreso extra', 'Efectivo')),
    ...one(tx(d(4), 'Coto', 227150, 'egreso', 'Supermercado', 'Galicia')),
    ...buildInstallments(tx(d(4), 'Frávega · Smart TV', 537000, 'egreso', 'Hogar', 'TC Cencosud'), 6, newId),
    ...buildInstallments(tx(addMonthsIso(d(10), -4), 'Celular', 734400, 'egreso', 'Hogar', 'TC Naranja'), 12, newId),
  ];
  const recurring: Recurring[] = [
    { id: newId(), name: 'Alquiler', category_id: c('Alquiler'), payment_method_id: p('Galicia'), default_amount: 420000, currency: 'ARS', due_day: 10, active: true, sort: 1 },
    { id: newId(), name: 'Cuota Auto', category_id: c('Cuota Auto'), payment_method_id: p('Galicia'), default_amount: 285000, currency: 'ARS', due_day: 15, active: true, sort: 2 },
  ];
  const statements: CardStatement[] = [
    { id: newId(), payment_method_id: p('TC Naranja'), period: ym, closing_date: addMonthsIso(d(26), -1), due_date: d(7), total_ars: 264900, total_usd: 42.5, minimum_payment: 39700, planned_kind: 'total', planned_amount: null, paid_amount: null, paid_at: null },
  ];
  return { cats, pms, txs, settings: { fx_source: 'oficial', fx_manual: 1450 }, statements, recurring, instances: [] };
}

export function createDemoStore(): Store {
  let data: DemoData;
  try {
    const raw = localStorage.getItem(KEY);
    data = raw ? JSON.parse(raw) : sample();
  } catch {
    data = sample();
  }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* sin almacenamiento */ } };
  persist();
  const upsert = <T extends { id: string }>(list: T[], item: T) => {
    const i = list.findIndex(x => x.id === item.id);
    if (i >= 0) list[i] = item; else list.push(item);
  };
  const bySort = <T extends { sort: number; name: string }>(a: T, b: T) => a.sort - b.sort || a.name.localeCompare(b.name);

  return {
    mode: 'demo',
    async listCategories() { return [...data.cats].sort(bySort); },
    async saveCategory(c) { upsert(data.cats, c); persist(); },
    async listPaymentMethods() { return [...data.pms].sort(bySort); },
    async savePaymentMethod(p) { upsert(data.pms, p); persist(); },
    async listTransactions(from, to) {
      return data.txs.filter(t => t.date >= from && t.date <= to).sort((a, b) => b.date.localeCompare(a.date));
    },
    async addTransactions(rows) { data.txs.push(...rows); persist(); },
    async updateTransaction(t) { upsert(data.txs, t); persist(); },
    async deleteTransaction(id) { data.txs = data.txs.filter(t => t.id !== id); persist(); },
    async deletePlan(planId) { data.txs = data.txs.filter(t => t.plan_id !== planId); persist(); },
    async getSettings() { return data.settings; },
    async saveSettings(s) { data.settings = s; persist(); },
    async listStatements(from, to) { return data.statements.filter(x => x.period >= from && x.period <= to); },
    async saveStatement(st) { upsert(data.statements, st); persist(); },
    async listRecurring() { return [...data.recurring].sort(bySort); },
    async saveRecurring(r) { upsert(data.recurring, r); persist(); },
    async listInstances(from, to) { return data.instances.filter(x => x.period >= from && x.period <= to); },
    async ensureInstances(list) {
      for (const i of list) {
        if (!data.instances.some(x => x.recurring_id === i.recurring_id && x.period === i.period)) data.instances.push(i);
      }
      persist();
    },
    async saveInstance(i) { upsert(data.instances, i); persist(); },
  };
}

export function resetDemo() {
  try { localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ }
}
