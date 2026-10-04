import { describe, expect, it } from 'vitest';
import { buildAlerts, buildInstallments, installmentProjection, monthSummary, spendingByCategory, upcomingDues } from './calc';
import { addMonthsIso, nextOccurrence } from './dates';
import { parseAmount, splitInstallments } from './money';
import type { Category, PaymentMethod, Transaction } from './types';

let seq = 0;
const id = () => `id${++seq}`;

const pm = (p: Partial<PaymentMethod>): PaymentMethod => ({ id: id(), name: 'X', kind: 'debito', issuer: null, last4: null, closing_day: null, due_day: null, color: null, archived: false, sort: 0, ...p });
const cat = (c: Partial<Category>): Category => ({ id: id(), name: 'C', kind: 'egreso', is_fixed: false, monthly_cap: null, archived: false, sort: 0, ...c });
const tx = (t: Partial<Transaction>): Transaction => ({ id: id(), date: '2026-10-05', description: 'd', amount: 0, currency: 'ARS', type: 'egreso', category_id: null, payment_method_id: null, plan_id: null, installment_number: null, installments_total: null, ...t });

describe('parseAmount', () => {
  it.each([
    ['12.500', 12500], ['12500', 12500], ['1.234,56', 1234.56], ['1234,5', 1234.5],
    ['1234.56', 1234.56], ['$ 3.000', 3000], ['1.234.567', 1234567], ['', NaN], ['abc', NaN], ['-5', NaN],
  ])('%s → %s', (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected);
  });
});

describe('cuotas', () => {
  it('reparte el total y la última cuota absorbe el redondeo', () => {
    const parts = splitInstallments(100, 3);
    expect(parts).toEqual([33.33, 33.33, 33.34]);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
  });

  it('arma una fila por mes con el mismo plan', () => {
    const rows = buildInstallments({ date: '2026-01-31', description: 'TV', amount: 600, currency: 'ARS', type: 'egreso', category_id: null, payment_method_id: 'tc' }, 3, id);
    expect(rows.map(r => r.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(rows.map(r => r.installment_number)).toEqual([1, 2, 3]);
    expect(new Set(rows.map(r => r.plan_id)).size).toBe(1);
    expect(rows[0].plan_id).not.toBeNull();
  });

  it('una compra en 1 pago no tiene plan', () => {
    const [r] = buildInstallments({ date: '2026-01-10', description: 'x', amount: 5, currency: 'ARS', type: 'egreso', category_id: null, payment_method_id: null }, 1, id);
    expect(r.plan_id).toBeNull();
    expect(r.installments_total).toBeNull();
  });

  it('proyecta las cuotas de los próximos meses', () => {
    const rows = buildInstallments({ date: '2026-10-04', description: 'TV', amount: 600, currency: 'ARS', type: 'egreso', category_id: null, payment_method_id: 'tc' }, 3, id);
    const p = installmentProjection(rows, '2026-10', 4, 1000);
    expect(p.map(x => x.total)).toEqual([200, 200, 200, 0]);
    expect(p.map(x => x.ym)).toEqual(['2026-10', '2026-11', '2026-12', '2027-01']);
  });
});

describe('fechas', () => {
  it('suma meses respetando meses cortos', () => {
    expect(addMonthsIso('2026-12-31', 2)).toBe('2027-02-28');
  });
  it('encuentra el próximo vencimiento', () => {
    expect(nextOccurrence(10, '2026-10-04')).toBe('2026-10-10');
    expect(nextOccurrence(4, '2026-10-04')).toBe('2026-10-04');
    expect(nextOccurrence(2, '2026-10-04')).toBe('2026-11-02');
    expect(nextOccurrence(31, '2026-11-05')).toBe('2026-11-30');
    expect(nextOccurrence(5, '2026-12-20')).toBe('2027-01-05');
  });
});

describe('resumen del mes', () => {
  const tc = pm({ kind: 'credito', name: 'TC Naranja' });
  const deb = pm({ kind: 'debito', name: 'Galicia' });
  const txs = [
    tx({ type: 'ingreso', amount: 1000000, payment_method_id: deb.id }),
    tx({ amount: 200000, payment_method_id: deb.id }),
    tx({ amount: 50000, payment_method_id: tc.id }),
    tx({ amount: 10, currency: 'USD', payment_method_id: tc.id }),
    tx({ amount: 999999, date: '2026-11-01', payment_method_id: deb.id }),
  ];

  it('separa débito de tarjeta y convierte dólares', () => {
    const s = monthSummary(txs, '2026-10', [tc, deb], 1500);
    expect(s.ingresos).toBe(1000000);
    expect(s.egresosDirectos).toBe(200000);
    expect(s.egresosTarjeta).toBe(65000);
    expect(s.libre).toBe(735000);
    expect(s.pct).toBeCloseTo(26.5);
  });

  it('no divide por cero sin ingresos', () => {
    expect(monthSummary([tx({ amount: 5 })], '2026-10', [], 1).pct).toBe(0);
  });
});

describe('alertas', () => {
  it('avisa topes superados, vencimientos cercanos y tarjetas sin días', () => {
    const sup = cat({ name: 'Supermercado', monthly_cap: 100000 });
    const nafta = cat({ name: 'Nafta', monthly_cap: 100000 });
    const naranja = pm({ kind: 'credito', name: 'TC Naranja', closing_day: 26, due_day: 7 });
    const cencosud = pm({ kind: 'credito', name: 'TC Cencosud' });
    const txs = [tx({ amount: 85000, category_id: sup.id }), tx({ amount: 20000, category_id: nafta.id })];
    const alerts = buildAlerts({ txs, ym: '2026-10', cats: [sup, nafta], pms: [naranja, cencosud], rate: 1, todayIso: '2026-10-04' });
    expect(alerts.map(a => a.title)).toEqual([
      'Vence TC Naranja en 3 días',
      'Supermercado: 85% del tope',
      'Definí cierre y vencimiento de TC Cencosud',
    ]);
  });

  it('ordena tópicos por porcentaje del tope y omite los vacíos sin tope', () => {
    const a = cat({ name: 'A', monthly_cap: 1000 });
    const b = cat({ name: 'B', monthly_cap: 100 });
    const c = cat({ name: 'C' });
    const rows = spendingByCategory([tx({ amount: 100, category_id: a.id }), tx({ amount: 90, category_id: b.id })], '2026-10', [a, b, c], 1);
    expect(rows.map(r => r.category.name)).toEqual(['B', 'A']);
  });

  it('ordena los vencimientos por cercanía', () => {
    const x = pm({ kind: 'credito', name: 'X', due_day: 20 });
    const y = pm({ kind: 'credito', name: 'Y', due_day: 7 });
    expect(upcomingDues([x, y], '2026-10-04').map(d => d.pm.name)).toEqual(['Y', 'X']);
  });
});
