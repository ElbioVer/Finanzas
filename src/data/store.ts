import type { CardStatement, Category, PaymentMethod, Recurring, RecurringInstance, Settings, Transaction } from '../lib/types';

export interface Store {
  mode: 'supabase' | 'demo';
  listCategories(): Promise<Category[]>;
  saveCategory(c: Category): Promise<void>;
  listPaymentMethods(): Promise<PaymentMethod[]>;
  savePaymentMethod(p: PaymentMethod): Promise<void>;
  /** Movimientos con fecha entre `from` y `to` inclusive (YYYY-MM-DD) */
  listTransactions(from: string, to: string): Promise<Transaction[]>;
  addTransactions(rows: Transaction[]): Promise<void>;
  updateTransaction(t: Transaction): Promise<void>;
  deleteTransaction(id: string): Promise<void>;
  deletePlan(planId: string): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  /** Resúmenes con período entre `from` y `to` inclusive (YYYY-MM) */
  listStatements(from: string, to: string): Promise<CardStatement[]>;
  saveStatement(s: CardStatement): Promise<void>;
  listRecurring(): Promise<Recurring[]>;
  saveRecurring(r: Recurring): Promise<void>;
  listInstances(from: string, to: string): Promise<RecurringInstance[]>;
  /** Crea las instancias que falten; si ya existe una para ese gasto y mes, la deja como está */
  ensureInstances(rows: RecurringInstance[]): Promise<void>;
  saveInstance(i: RecurringInstance): Promise<void>;
}

export const newId = () => crypto.randomUUID();
