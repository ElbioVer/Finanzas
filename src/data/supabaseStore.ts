import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CardStatement, Category, PaymentMethod, Recurring, RecurringInstance, Settings, Transaction } from '../lib/types';
import { defaultCategories, defaultPaymentMethods } from './defaults';
import type { Store } from './store';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

function rows(res: { data: Record<string, unknown>[] | null; error: { message: string } | null }) {
  return check(res) ?? [];
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

const toCategory = (r: Record<string, unknown>): Category => ({
  id: r.id as string, name: r.name as string, kind: r.kind as Category['kind'], is_fixed: !!r.is_fixed,
  monthly_cap: num(r.monthly_cap), archived: !!r.archived, sort: Number(r.sort ?? 0),
});
const toPM = (r: Record<string, unknown>): PaymentMethod => ({
  id: r.id as string, name: r.name as string, kind: r.kind as PaymentMethod['kind'], issuer: (r.issuer as string) ?? null,
  last4: (r.last4 as string) ?? null, closing_day: num(r.closing_day), due_day: num(r.due_day), color: (r.color as string) ?? null,
  archived: !!r.archived, sort: Number(r.sort ?? 0),
});
const toTx = (r: Record<string, unknown>): Transaction => ({
  id: r.id as string, date: r.date as string, description: r.description as string, amount: Number(r.amount),
  currency: r.currency as Transaction['currency'], type: r.type as Transaction['type'],
  category_id: (r.category_id as string) ?? null, payment_method_id: (r.payment_method_id as string) ?? null,
  plan_id: (r.plan_id as string) ?? null, installment_number: num(r.installment_number), installments_total: num(r.installments_total),
});

const toStatement = (r: Record<string, unknown>): CardStatement => ({
  id: r.id as string, payment_method_id: r.payment_method_id as string, period: r.period as string,
  closing_date: (r.closing_date as string) ?? null, due_date: r.due_date as string,
  total_ars: Number(r.total_ars), total_usd: Number(r.total_usd), minimum_payment: Number(r.minimum_payment),
  planned_kind: r.planned_kind as CardStatement['planned_kind'], planned_amount: num(r.planned_amount),
  paid_amount: num(r.paid_amount), paid_at: (r.paid_at as string) ?? null,
});
const toRecurring = (r: Record<string, unknown>): Recurring => ({
  id: r.id as string, name: r.name as string, category_id: (r.category_id as string) ?? null,
  payment_method_id: (r.payment_method_id as string) ?? null, default_amount: num(r.default_amount),
  currency: r.currency as Recurring['currency'], due_day: Number(r.due_day), active: !!r.active, sort: Number(r.sort ?? 0),
});
const toInstance = (r: Record<string, unknown>): RecurringInstance => ({
  id: r.id as string, recurring_id: r.recurring_id as string, period: r.period as string, due_date: r.due_date as string,
  amount: Number(r.amount), currency: r.currency as RecurringInstance['currency'],
  paid_at: (r.paid_at as string) ?? null, transaction_id: (r.transaction_id as string) ?? null,
});

export function createSupabaseStore(sb: SupabaseClient): Store {
  let seeded: Promise<void> | null = null;

  /**
   * La primera vez que entrás, carga los tópicos y medios de pago iniciales.
   * Lo hace la función seed_defaults de la base, que usa un bloqueo para que
   * abrir la app en dos lugares a la vez no los cargue dos veces.
   */
  function ensureSeed() {
    seeded ??= (async () => {
      const { error } = await sb.rpc('seed_defaults', { cats: defaultCategories(), pms: defaultPaymentMethods() });
      if (!error) return;
      // Base sin el script 0002: carga directa (puede duplicar si se abre en dos lugares a la vez)
      if (error.code !== 'PGRST202') throw new Error(error.message);
      const { count, error: countError } = await sb.from('categories').select('id', { count: 'exact', head: true });
      if (countError) throw new Error(countError.message);
      if (count === 0) {
        check(await sb.from('categories').insert(defaultCategories()));
        check(await sb.from('payment_methods').insert(defaultPaymentMethods()));
      }
    })().catch(e => { seeded = null; throw e; });
    return seeded;
  }

  return {
    mode: 'supabase',
    async listCategories() {
      await ensureSeed();
      return rows(await sb.from('categories').select('*').order('sort').order('name')).map(toCategory);
    },
    async saveCategory(c) { check(await sb.from('categories').upsert(c)); },
    async listPaymentMethods() {
      await ensureSeed();
      return rows(await sb.from('payment_methods').select('*').order('sort').order('name')).map(toPM);
    },
    async savePaymentMethod(p) { check(await sb.from('payment_methods').upsert(p)); },
    async listTransactions(from, to) {
      const all: Record<string, unknown>[] = [];
      const page = 1000;
      for (let i = 0; ; i += page) {
        const chunk = rows(await sb.from('transactions').select('*').gte('date', from).lte('date', to)
          .order('date', { ascending: false }).order('created_at', { ascending: false }).range(i, i + page - 1));
        all.push(...chunk);
        if (chunk.length < page) break;
      }
      return all.map(toTx);
    },
    async addTransactions(list) { check(await sb.from('transactions').insert(list)); },
    async updateTransaction(t) { check(await sb.from('transactions').update(t).eq('id', t.id)); },
    async deleteTransaction(id) { check(await sb.from('transactions').delete().eq('id', id)); },
    async deletePlan(planId) { check(await sb.from('transactions').delete().eq('plan_id', planId)); },
    async getSettings(): Promise<Settings> {
      const r = check<Record<string, unknown> | null>(await sb.from('settings').select('*').maybeSingle());
      return r ? { fx_source: r.fx_source as Settings['fx_source'], fx_manual: num(r.fx_manual) } : { fx_source: 'oficial', fx_manual: null };
    },
    async saveSettings(s) { check(await sb.from('settings').upsert({ ...s, updated_at: new Date().toISOString() })); },
    async listStatements(from, to) {
      return rows(await sb.from('card_statements').select('*').gte('period', from).lte('period', to).order('due_date')).map(toStatement);
    },
    async saveStatement(st) { check(await sb.from('card_statements').upsert(st)); },
    async listRecurring() {
      return rows(await sb.from('recurring_expenses').select('*').order('sort').order('name')).map(toRecurring);
    },
    async saveRecurring(r) { check(await sb.from('recurring_expenses').upsert(r)); },
    async listInstances(from, to) {
      return rows(await sb.from('recurring_instances').select('*').gte('period', from).lte('period', to).order('due_date')).map(toInstance);
    },
    async ensureInstances(list) {
      if (!list.length) return;
      // La restricción única (usuario, gasto, mes) evita duplicados aunque se abra en dos lugares a la vez
      check(await sb.from('recurring_instances').upsert(list, { onConflict: 'user_id,recurring_id,period', ignoreDuplicates: true }));
    },
    async saveInstance(i) { check(await sb.from('recurring_instances').upsert(i)); },
  };
}
