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
