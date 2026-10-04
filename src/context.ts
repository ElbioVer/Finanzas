import { createContext, useContext } from 'react';
import type { FxQuote } from './lib/fx';
import type { CardStatement, Category, PaymentMethod, Recurring, RecurringInstance, Settings, Transaction } from './lib/types';
import type { Store } from './data/store';

export type View = 'inicio' | 'movimientos' | 'tarjetas' | 'cierre' | 'escanear' | 'ajustes';
export const VIEWS: View[] = ['inicio', 'movimientos', 'tarjetas', 'cierre', 'escanear', 'ajustes'];

export interface AppCtx {
  store: Store;
  cats: Category[];
  pms: PaymentMethod[];
  /** Movimientos desde el mes anterior al elegido hasta 6 meses después (cuotas y resúmenes) */
  txs: Transaction[];
  /** Resúmenes de tarjeta alrededor del mes elegido y del actual */
  statements: CardStatement[];
  recurring: Recurring[];
  /** Gastos fijos de cada mes, alrededor del mes elegido y del actual */
  instances: RecurringInstance[];
  settings: Settings;
  quote: FxQuote | null;
  /** Pesos por dólar que se usan para convertir */
  rate: number;
  ym: string;
  setYm: (ym: string) => void;
  todayIso: string;
  reload: () => Promise<void>;
  /** Ejecuta un cambio, recarga los datos y muestra un aviso; muestra el error si falla */
  run: (fn: () => Promise<unknown>, okMsg?: string) => Promise<boolean>;
  go: (v: View) => void;
  openTx: (tx?: Transaction) => void;
  toast: (msg: string) => void;
  email: string | null;
  signOut: () => void;
}

export const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp fuera de Ctx');
  return c;
};
