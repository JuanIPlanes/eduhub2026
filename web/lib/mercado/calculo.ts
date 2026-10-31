// Mercado ficticio: tipos y fórmulas puras (sin fs ni dependencias), según skills/Modulo_Mercado_Ficticio_SKILL.md.
// Ventana de 12 meses = últimos 253 cierres (252 retornos). Retornos nominales en ARS.

export const VENTANA_12M = 253;
export const HORIZONTE_MIN_RENTA_VARIABLE_MESES = 12;
export const UMBRAL_ALTO = 65;
export const UMBRAL_MEDIO = 40;

export type Empresa = {
  ticker: string; nombre: string; sector: string; descripcion: string; moneda: string; acciones_mm: number;
};
export type Precio = { fecha: string; apertura: number; maximo: number; minimo: number; cierre: number; volumen: number };
export type PuntoIndice = { fecha: string; valor: number; retorno: number };
export type Trimestre = {
  periodo: string; fecha_cierre: string; fecha_publicacion: string;
  ingresos_mm: number; ebitda_mm: number; resultado_neto_mm: number; deuda_neta_mm: number; patrimonio_mm: number;
};
export type Dividendo = { fecha_ex: string; monto: number };
export type Evento = { id: number; fecha: string; ticker: string | null; tipo: string; titulo: string; impacto_pct: number };

export type Base = {
  fecha_corte: string;
  empresas: Empresa[];
  precios: Record<string, Precio[]>;        // ordenados por fecha
  indice: PuntoIndice[];                    // ordenado por fecha
  fundamentales: Record<string, Trimestre[]>; // ordenados por fecha de cierre
  dividendos: Record<string, Dividendo[]>;  // ordenados por fecha ex
  eventos: Evento[];
};

export type Metricas = {
  precio: number;
  ret_1m: number; ret_3m: number; ret_6m: number; ret_12m: number;
  vol_anual: number; max_dd_12m: number; beta_12m: number;
  mkt_cap_mm: number; eps_ttm: number;
  pe: number | null; ev_ebitda: number | null; deuda_neta_ebitda: number | null;
  margen_ebitda: number; roe: number; crec_ingresos: number; div_yield: number;
};
export type Pilar = 'valuacion' | 'calidad' | 'crecimiento' | 'solidez' | 'riesgo';
export const PILARES: { id: Pilar; nombre: string; peso: number }[] = [
  { id: 'valuacion', nombre: 'Valuación', peso: 0.25 },
  { id: 'calidad', nombre: 'Calidad', peso: 0.25 },
  { id: 'crecimiento', nombre: 'Crecimiento', peso: 0.15 },
  { id: 'solidez', nombre: 'Solidez', peso: 0.15 },
  { id: 'riesgo', nombre: 'Riesgo', peso: 0.20 },
];
export type Nivel = 'alto' | 'medio' | 'bajo';
export type Puntaje = Record<Pilar, number> & { total: number; nivel: Nivel };
export type FilaMercado = { empresa: Empresa; metricas: Metricas; puntaje: Puntaje };

// ---------- estadística ----------
export function media(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / xs.length; }
export function desvio(xs: number[]): number { // muestral, ddof = 1
  const m = media(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}
export function covarianza(a: number[], b: number[]): number { // ddof = 1
  const ma = media(a), mb = media(b);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (a.length - 1);
}
export function retornosSimples(xs: number[]): number[] { return xs.slice(1).map((x, i) => x / xs[i] - 1); }
export function logRetornos(xs: number[]): number[] { return xs.slice(1).map((x, i) => Math.log(x / xs[i])); }
export function caidaMaxima(xs: number[]): number {
  let pico = -Infinity, peor = 0;
  for (const x of xs) { pico = Math.max(pico, x); peor = Math.min(peor, x / pico - 1); }
  return peor;
}
const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Fecha ISO menos n días (calendario). */
export function restarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Retornos 1m/3m/6m/12m de una serie de cierres (21, 63, 126 y 252 ruedas atrás). */
export function retornos(c: number[]) {
  const ult = c[c.length - 1];
  const atras = (k: number) => (c.length > k ? ult / c[c.length - 1 - k] - 1 : null);
  return { ret_1m: atras(21), ret_3m: atras(63), ret_6m: atras(126), ret_12m: atras(VENTANA_12M - 1) };
}

/** Retornos simples del IF12 en la ventana de 12 meses (desde el valor publicado). */
export function retornosIndice12m(indice: PuntoIndice[]): number[] {
  return retornosSimples(indice.slice(-VENTANA_12M).map(p => p.valor));
}

export function calcularMetricas(base: Base, ticker: string): Metricas {
  const empresa = base.empresas.find(e => e.ticker === ticker);
  if (!empresa) throw new Error(`Ticker desconocido: ${ticker}`);
  const c = base.precios[ticker].map(p => p.cierre);
  const w = c.slice(-VENTANA_12M);
  const precio = c[c.length - 1];
  const r = retornos(c);
  const ri = retornosIndice12m(base.indice);
  const rs = retornosSimples(w);

  const q = base.fundamentales[ticker];
  const ttm = q.slice(-4), prev = q.slice(-8, -4), ult = q[q.length - 1];
  const rnTtm = suma(ttm.map(x => x.resultado_neto_mm));
  const ebitdaTtm = suma(ttm.map(x => x.ebitda_mm));
  const ingTtm = suma(ttm.map(x => x.ingresos_mm));
  const eps = rnTtm / empresa.acciones_mm;
  const mkt = precio * empresa.acciones_mm;

  const desde = restarDias(base.fecha_corte, 365);
  const div = suma((base.dividendos[ticker] ?? []).filter(d => d.fecha_ex > desde && d.fecha_ex <= base.fecha_corte).map(d => d.monto));

  return {
    precio,
    ret_1m: r.ret_1m!, ret_3m: r.ret_3m!, ret_6m: r.ret_6m!, ret_12m: r.ret_12m!,
    vol_anual: desvio(logRetornos(w)) * Math.sqrt(252),
    max_dd_12m: caidaMaxima(w),
    beta_12m: covarianza(rs, ri) / covarianza(ri, ri),
    mkt_cap_mm: mkt,
    eps_ttm: eps,
    pe: eps > 0 ? precio / eps : null,
    ev_ebitda: ebitdaTtm > 0 ? (mkt + ult.deuda_neta_mm) / ebitdaTtm : null,
    deuda_neta_ebitda: ebitdaTtm > 0 ? ult.deuda_neta_mm / ebitdaTtm : null,
    margen_ebitda: ebitdaTtm / ingTtm,
    roe: rnTtm / ult.patrimonio_mm,
    crec_ingresos: ingTtm / suma(prev.map(x => x.ingresos_mm)) - 1,
    div_yield: div / precio,
  };
}

/**
 * Percentil dentro del grupo: mejor = 100, peor = 0, empates promedian, NULL puntúa 0.
 * Con n valores válidos: 100 × (peores + 0,5 × iguales sin contarse a sí misma) / (n − 1).
 */
export function percentiles(vals: Record<string, number | null>, mayorEsMejor: boolean): Record<string, number> {
  const validos = Object.values(vals).filter((v): v is number => v !== null);
  const n = validos.length;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(vals)) {
    if (v === null || n < 2) { out[k] = 0; continue; }
    const peores = validos.filter(x => (mayorEsMejor ? x < v : x > v)).length;
    const iguales = validos.filter(x => x === v).length - 1;
    out[k] = (100 * (peores + 0.5 * iguales)) / (n - 1);
  }
  return out;
}

export function nivelDe(total: number): Nivel {
  return total >= UMBRAL_ALTO ? 'alto' : total >= UMBRAL_MEDIO ? 'medio' : 'bajo';
}

export function calcularPuntajes(m: Record<string, Metricas>): Record<string, Puntaje> {
  const col = (k: keyof Metricas) => Object.fromEntries(Object.entries(m).map(([t, x]) => [t, x[k] as number | null]));
  const pe = percentiles(col('pe'), false), ev = percentiles(col('ev_ebitda'), false);
  const mg = percentiles(col('margen_ebitda'), true), ro = percentiles(col('roe'), true);
  const cr = percentiles(col('crec_ingresos'), true), de = percentiles(col('deuda_neta_ebitda'), false);
  const vo = percentiles(col('vol_anual'), false), dd = percentiles(col('max_dd_12m'), true);
  const out: Record<string, Puntaje> = {};
  for (const t of Object.keys(m)) {
    const p = {
      valuacion: (pe[t] + ev[t]) / 2, calidad: (mg[t] + ro[t]) / 2, crecimiento: cr[t], solidez: de[t], riesgo: (vo[t] + dd[t]) / 2,
    };
    const total = PILARES.reduce((a, x) => a + x.peso * p[x.id], 0);
    out[t] = { ...p, total, nivel: nivelDe(total) };
  }
  return out;
}

/** Todas las métricas y puntajes del mercado, en el orden de la tabla de empresas. */
export function calcularMercado(base: Base): FilaMercado[] {
  const m = Object.fromEntries(base.empresas.map(e => [e.ticker, calcularMetricas(base, e.ticker)]));
  const s = calcularPuntajes(m);
  return base.empresas.map(e => ({ empresa: e, metricas: m[e.ticker], puntaje: s[e.ticker] }));
}

/** Retornos del IF12 (1m, 3m, 6m, 12m) con las mismas reglas que las acciones. */
export function retornosIF12(base: Base) { return retornos(base.indice.map(p => p.valor)); }

/** La peor caída máxima de 12 meses de la tabla (para explicar la regla del horizonte). */
export function peorCaida(filas: FilaMercado[]): { ticker: string; nombre: string; max_dd_12m: number } {
  const f = filas.reduce((a, b) => (b.metricas.max_dd_12m < a.metricas.max_dd_12m ? b : a));
  return { ticker: f.empresa.ticker, nombre: f.empresa.nombre, max_dd_12m: f.metricas.max_dd_12m };
}

export const RANGOS = { '1m': 22, '3m': 64, '6m': 127, '12m': VENTANA_12M, todo: Infinity } as const;
export type Rango = keyof typeof RANGOS;
export function esRango(x: unknown): x is Rango { return typeof x === 'string' && Object.prototype.hasOwnProperty.call(RANGOS, x); }
export function recortar<T>(serie: T[], rango: Rango): T[] {
  const n = RANGOS[rango];
  return Number.isFinite(n) ? serie.slice(-n) : serie.slice();
}
