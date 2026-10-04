export type Currency = 'ARS' | 'USD';
export type TxType = 'ingreso' | 'egreso';
export type PMKind = 'debito' | 'efectivo' | 'credito' | 'banco';

export interface Category {
  id: string;
  name: string;
  kind: TxType;
  is_fixed: boolean;
  monthly_cap: number | null;
  archived: boolean;
  sort: number;
}

export interface PaymentMethod {
  id: string;
  name: string;
  kind: PMKind;
  issuer: string | null;
  last4: string | null;
  closing_day: number | null;
  due_day: number | null;
  color: string | null;
  archived: boolean;
  sort: number;
}

export interface Transaction {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  description: string;
  amount: number;
  currency: Currency;
  type: TxType;
  category_id: string | null;
  payment_method_id: string | null;
  plan_id: string | null;
  installment_number: number | null;
  installments_total: number | null;
}

export interface Settings {
  fx_source: 'oficial' | 'manual';
  fx_manual: number | null;
}

export const PM_KIND_LABEL: Record<PMKind, string> = {
  debito: 'Débito',
  efectivo: 'Efectivo',
  credito: 'Tarjeta de crédito',
  banco: 'Cuenta / transferencia',
};

export type PlanKind = 'total' | 'minimo' | 'otro';

/** Resumen mensual de una tarjeta. period = mes del vencimiento (YYYY-MM). */
export interface CardStatement {
  id: string;
  payment_method_id: string;
  period: string;
  closing_date: string | null;
  due_date: string;
  total_ars: number;
  total_usd: number;
  minimum_payment: number;
  planned_kind: PlanKind;
  /** Solo cuando planned_kind = 'otro' */
  planned_amount: number | null;
  paid_amount: number | null;
  paid_at: string | null;
}

/** Gasto fijo que se repite todos los meses */
export interface Recurring {
  id: string;
  name: string;
  category_id: string | null;
  payment_method_id: string | null;
  default_amount: number | null;
  currency: Currency;
  due_day: number;
  active: boolean;
  sort: number;
}

/** El gasto fijo de un mes en particular */
export interface RecurringInstance {
  id: string;
  recurring_id: string;
  period: string;
  due_date: string;
  amount: number;
  currency: Currency;
  paid_at: string | null;
  transaction_id: string | null;
}
