import type { Currency } from './types';

export const ars = (n: number) => '$ ' + Math.round(n).toLocaleString('es-AR');
export const usd = (n: number) =>
  'US$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n: number, c: Currency) => (c === 'USD' ? usd(n) : ars(n));

/**
 * Interpreta montos escritos a la argentina ("1.234,56") o con punto decimal ("1234.56").
 * Devuelve NaN si no hay un número válido.
 */
export function parseAmount(raw: string): number {
  let s = raw.trim().replace(/\s|\$|US\$/g, '');
  if (!s) return NaN;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

/** Divide un total en n cuotas de 2 decimales; la última absorbe el redondeo. */
export function splitInstallments(total: number, n: number): number[] {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? cents - base * (n - 1) : base) / 100);
}
