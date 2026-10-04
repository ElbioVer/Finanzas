const CACHE_KEY = 'finanzas.fx.oficial';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface FxQuote { venta: number; compra: number; fecha: string }

function readCache(): (FxQuote & { at: number }) | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Dólar oficial (BNA) desde dolarapi.com, con caché local de 6 horas. */
export async function fetchOficial(): Promise<FxQuote | null> {
  const cached = readCache();
  if (cached && Date.now() - cached.at < MAX_AGE_MS) return cached;
  try {
    const res = await fetch('https://dolarapi.com/v1/dolares/oficial');
    if (!res.ok) throw new Error(String(res.status));
    const j = await res.json();
    const q: FxQuote = { venta: Number(j.venta), compra: Number(j.compra), fecha: j.fechaActualizacion };
    if (!q.venta) throw new Error('sin cotización');
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...q, at: Date.now() })); } catch { /* sin almacenamiento */ }
    return q;
  } catch {
    return cached;
  }
}
