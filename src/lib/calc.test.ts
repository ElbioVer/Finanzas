import { describe, expect, it } from 'vitest';
import { buildAlerts, buildInstallments, closingTargetPeriod, consumptionBetween, dateInMonth, installmentProjection, missingInstances, monthSummary, plannedPayment, spendingByCategory, upcomingDues } from './calc';
import { addMonthsIso, nextOccurrence } from './dates';
import { ars, parseAmount, splitInstallments, usd } from './money';
import type { CardStatement, Category, PaymentMethod, Recurring, RecurringInstance, Transaction } from './types';

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

describe('formato de montos', () => {
  it('muestra siempre 2 decimales', () => {
    expect(ars(1910000)).toBe('$ 1.910.000,00');
    expect(ars(1234.5)).toBe('$ 1.234,50');
    expect(ars(-254658.456)).toBe('$ -254.658,46');
    expect(usd(9.99)).toBe('US$ 9,99');
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
      'TC Naranja: vence en 3 días',
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
    expect(upcomingDues({ pms: [x, y], todayIso: '2026-10-04', rate: 1 }).map(d => d.name)).toEqual(['Y', 'X']);
  });
});

const st = (p: Partial<CardStatement>): CardStatement => ({ id: id(), payment_method_id: 'tc', period: '2026-10', closing_date: '2026-09-26', due_date: '2026-10-07', total_ars: 0, total_usd: 0, minimum_payment: 0, planned_kind: 'total', planned_amount: null, paid_amount: null, paid_at: null, ...p });
const rec = (r: Partial<Recurring>): Recurring => ({ id: id(), name: 'Alquiler', category_id: null, payment_method_id: null, default_amount: null, currency: 'ARS', due_day: 10, active: true, sort: 0, ...r });
const inst = (i: Partial<RecurringInstance>): RecurringInstance => ({ id: id(), recurring_id: 'r', period: '2026-10', due_date: '2026-10-10', amount: 0, currency: 'ARS', paid_at: null, transaction_id: null, ...i });

describe('resúmenes de tarjeta', () => {
  it('calcula lo que se va a pagar según la opción elegida', () => {
    const base = { total_ars: 100000, total_usd: 10, minimum_payment: 20000, planned_amount: 50000 };
    expect(plannedPayment(st({ ...base, planned_kind: 'total' }), 1500)).toBe(115000);
    expect(plannedPayment(st({ ...base, planned_kind: 'minimo' }), 1500)).toBe(20000);
    expect(plannedPayment(st({ ...base, planned_kind: 'otro' }), 1500)).toBe(50000);
  });

  it('no cuenta dos veces los consumos de una tarjeta con resumen', () => {
    const tc = pm({ id: 'tc', kind: 'credito' });
    const tc2 = pm({ id: 'tc2', kind: 'credito' });
    const deb = pm({ kind: 'debito' });
    const txs = [
      tx({ type: 'ingreso', amount: 1000000 }),
      tx({ amount: 80000, payment_method_id: tc.id }),   // consumo: va al resumen de noviembre
      tx({ amount: 30000, payment_method_id: tc2.id }),  // tarjeta sin resumen: se estima
      tx({ amount: 50000, payment_method_id: deb.id }),
      tx({ amount: 420000, payment_method_id: deb.id }), // alquiler ya pagado
    ];
    const statements = [st({ payment_method_id: 'tc', total_ars: 200000, minimum_payment: 30000, planned_kind: 'minimo' })];
    const instances = [inst({ amount: 285000 }), inst({ amount: 420000, paid_at: '2026-10-01' })];
    const s = monthSummary(txs, '2026-10', [tc, tc2, deb], 1, statements, instances);
    expect(s.egresosTarjeta).toBe(30000 + 30000);
    expect(s.tarjetasEstimadas).toBe(1);
    expect(s.egresosDirectos).toBe(470000);
    expect(s.fijosPendientes).toBe(285000);
    expect(s.libre).toBe(1000000 - 470000 - 60000 - 285000);
  });

  it('usa lo pagado cuando el resumen ya se pagó', () => {
    const tc = pm({ id: 'tc', kind: 'credito' });
    const s = monthSummary([], '2026-10', [tc], 1, [st({ total_ars: 100000, paid_amount: 90000, paid_at: '2026-10-05' })]);
    expect(s.egresosTarjeta).toBe(90000);
  });

  it('suma los consumos entre el cierre anterior y este cierre', () => {
    const txs = [
      tx({ date: '2026-08-26', amount: 1, payment_method_id: 'tc' }),
      tx({ date: '2026-08-27', amount: 10, payment_method_id: 'tc' }),
      tx({ date: '2026-09-26', amount: 100, payment_method_id: 'tc' }),
      tx({ date: '2026-09-27', amount: 1000, payment_method_id: 'tc' }),
      tx({ date: '2026-09-01', amount: 5, currency: 'USD', payment_method_id: 'tc' }),
      tx({ date: '2026-09-01', amount: 7, payment_method_id: 'otra' }),
    ];
    expect(consumptionBetween(txs, 'tc', '2026-09-26')).toEqual({ ars: 110, usd: 5 });
  });
});

describe('vencimientos y cierre de mes', () => {
  it('desde el día 15 propone cerrar el mes siguiente', () => {
    expect(closingTargetPeriod('2026-10-04')).toBe('2026-10');
    expect(closingTargetPeriod('2026-10-28')).toBe('2026-11');
    expect(closingTargetPeriod('2026-12-20')).toBe('2027-01');
  });

  it('ajusta el día a meses cortos', () => {
    expect(dateInMonth('2027-02', 31)).toBe('2027-02-28');
  });

  it('combina resúmenes, gastos fijos y tarjetas sin resumen', () => {
    const naranja = pm({ id: 'tc', kind: 'credito', name: 'TC Naranja', due_day: 7 });
    const cencosud = pm({ kind: 'credito', name: 'TC Cencosud', due_day: 20 });
    const alquiler = rec({ id: 'r', name: 'Alquiler' });
    const dues = upcomingDues({
      pms: [naranja, cencosud], todayIso: '2026-10-04', rate: 1,
      statements: [st({ total_ars: 264900 })],
      recurring: [alquiler],
      instances: [inst({ amount: 420000 }), inst({ amount: 1, period: '2026-09', due_date: '2026-09-10', paid_at: null })],
    });
    expect(dues.map(d => [d.name, d.inDays, d.amount, d.status])).toEqual([
      ['TC Naranja', 3, 264900, 'pendiente'],
      ['Alquiler', 6, 420000, 'pendiente'],
      ['TC Cencosud', 16, null, 'sin-resumen'],
    ]);
  });

  it('avisa lo vencido sin pagar y el cierre pendiente', () => {
    const tc = pm({ id: 'tc', kind: 'credito', name: 'TC Naranja', closing_day: 26, due_day: 7 });
    const alerts = buildAlerts({
      txs: [], ym: '2026-10', cats: [], pms: [tc], rate: 1, todayIso: '2026-10-28',
      statements: [st({ period: '2026-10', due_date: '2026-10-07', planned_kind: 'minimo', total_ars: 100000, minimum_payment: 15000 })],
      recurring: [rec({ id: 'r', name: 'Alquiler' })],
      instances: [inst({ amount: 420000 })],
    });
    expect(alerts.map(a => a.title)).toEqual([
      'TC Naranja: venció hace 21 días',
      'Alquiler: venció hace 18 días',
      'Cierre de mes: cargá los resúmenes',
    ]);
  });

  it('avisa cuando se va a pagar el mínimo', () => {
    const tc = pm({ id: 'tc', kind: 'credito', name: 'TC Cencosud', closing_day: 9, due_day: 20 });
    const alerts = buildAlerts({
      txs: [], ym: '2026-10', cats: [], pms: [tc], rate: 1, todayIso: '2026-10-04',
      statements: [st({ due_date: '2026-10-20', planned_kind: 'minimo', total_ars: 198300, minimum_payment: 31000 })],
    });
    expect(alerts.map(a => [a.title, a.detail])).toEqual([
      ['TC Cencosud: vas a pagar el mínimo', 'Quedan $ 167.300,00 financiados con interés'],
    ]);
  });
});

describe('gastos fijos', () => {
  it('crea el mes que falta con el monto del último mes o el habitual', () => {
    const alquiler = rec({ id: 'a', due_day: 31, default_amount: 420000 });
    const auto = rec({ id: 'b', due_day: 15, default_amount: null });
    const baja = rec({ id: 'c', active: false });
    const existing = [inst({ recurring_id: 'b', period: '2026-10', amount: 285000 }), inst({ recurring_id: 'a', period: '2026-11' })];
    const out = missingInstances([alquiler, auto, baja], existing, ['2026-10', '2026-11'], id);
    expect(out.map(i => [i.recurring_id, i.period, i.due_date, i.amount])).toEqual([
      ['a', '2026-10', '2026-10-31', 420000],
      ['b', '2026-11', '2026-11-15', 285000],
    ]);
  });

  it('un aumento sigue en los meses siguientes', () => {
    const alquiler = rec({ id: 'a', default_amount: 420000 });
    const out = missingInstances([alquiler], [inst({ recurring_id: 'a', period: '2026-10', amount: 450000 })], ['2026-11'], id);
    expect(out[0].amount).toBe(450000);
  });
});
