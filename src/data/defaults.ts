import type { Category, PaymentMethod } from '../lib/types';
import { newId } from './store';

const cat = (name: string, kind: Category['kind'], sort: number, extra: Partial<Category> = {}): Category =>
  ({ id: newId(), name, kind, is_fixed: false, monthly_cap: null, archived: false, sort, ...extra });

export function defaultCategories(): Category[] {
  return [
    cat('Sueldo', 'ingreso', 1),
    cat('Aguinaldo', 'ingreso', 2),
    cat('Ingreso extra', 'ingreso', 3),
    cat('Alquiler', 'egreso', 10, { is_fixed: true }),
    cat('Cuota Auto', 'egreso', 11, { is_fixed: true }),
    cat('Servicios', 'egreso', 12, { is_fixed: true }),
    cat('Supermercado', 'egreso', 20),
    cat('Nafta', 'egreso', 21),
    cat('Salud', 'egreso', 22),
    cat('Hogar', 'egreso', 23),
    cat('Suscripciones', 'egreso', 24),
    cat('Salidas', 'egreso', 25),
    cat('Otros gastos', 'egreso', 99),
  ];
}

const pm = (name: string, kind: PaymentMethod['kind'], sort: number, extra: Partial<PaymentMethod> = {}): PaymentMethod =>
  ({ id: newId(), name, kind, issuer: null, last4: null, closing_day: null, due_day: null, color: null, archived: false, sort, ...extra });

export function defaultPaymentMethods(): PaymentMethod[] {
  return [
    pm('Galicia', 'debito', 1, { issuer: 'Banco Galicia' }),
    pm('Efectivo', 'efectivo', 2),
    pm('TC Carrefour', 'credito', 10, { issuer: 'Carrefour', color: 'carrefour' }),
    pm('TC Cencosud', 'credito', 11, { issuer: 'Cencosud', color: 'cencosud' }),
    pm('TC Naranja', 'credito', 12, { issuer: 'Naranja X', color: 'naranja' }),
  ];
}
