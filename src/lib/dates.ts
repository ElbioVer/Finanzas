export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Fecha local en formato YYYY-MM-DD */
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoDate(new Date());

/** Mes en formato YYYY-MM */
export const ymOf = (iso: string) => iso.slice(0, 7);

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addMonthsYm(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export const daysInMonth = (y: number, m1: number) => new Date(y, m1, 0).getDate();

/** Suma meses a una fecha manteniendo el día, o el último día si el mes es más corto. */
export function addMonthsIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1 + n, 1);
  const day = Math.min(d, daysInMonth(target.getFullYear(), target.getMonth() + 1));
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(day)}`;
}

export const monthStart = (ym: string) => `${ym}-01`;
export function monthEnd(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${pad(daysInMonth(y, m))}`;
}

export function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const s = MESES[m - 1];
  return `${s[0].toUpperCase()}${s.slice(1)} ${y}`;
}

export const shortMonth = (ym: string) => MESES[Number(ym.slice(5, 7)) - 1].slice(0, 3);

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((parseIso(toIso).getTime() - parseIso(fromIso).getTime()) / 864e5);
}

/** Próxima fecha (hoy incluido) en que cae el día `day` del mes, ajustado a meses cortos. */
export function nextOccurrence(day: number, fromIso: string): string {
  const [y, m, d] = fromIso.split('-').map(Number);
  const thisMonth = Math.min(day, daysInMonth(y, m));
  if (thisMonth >= d) return `${y}-${pad(m)}-${pad(thisMonth)}`;
  const next = new Date(y, m, 1);
  const ny = next.getFullYear(), nm = next.getMonth() + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(day, daysInMonth(ny, nm)))}`;
}
