import type { Category, PaymentMethod, Settings, Transaction } from '../lib/types';

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
}

export const newId = () => crypto.randomUUID();
