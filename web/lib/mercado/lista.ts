// Fila del ranking y su orden (puro: lo usan la API y el ranking del cliente).
import type { Nivel } from './calculo';

export type FilaLista = {
  ticker: string; nombre: string; sector: string;
  precio: number; ret_12m: number; vol_anual: number; pe: number | null;
  score_total: number; lectura: Nivel;
};

export const ORDENES = ['score', 'ret_12m', 'vol', 'pe'] as const;
export type Orden = (typeof ORDENES)[number];
export const esOrden = (x: unknown): x is Orden => typeof x === 'string' && (ORDENES as readonly string[]).includes(x);

/** Puntaje y retorno de mayor a menor; volatilidad y P/E de menor a mayor. P/E vacío (sin ganancias) siempre al final. */
export function ordenar<T extends FilaLista>(xs: T[], orden: Orden): T[] {
  const pe = (a: number | null, b: number | null) => (a === null && b === null ? 0 : a === null ? 1 : b === null ? -1 : a - b);
  return [...xs].sort((a, b) => {
    const r = orden === 'score' ? b.score_total - a.score_total
      : orden === 'ret_12m' ? b.ret_12m - a.ret_12m
        : orden === 'vol' ? a.vol_anual - b.vol_anual
          : pe(a.pe, b.pe);
    return r || a.ticker.localeCompare(b.ticker);
  });
}
