// Lectura de los CSV del mercado ficticio (data/mercado/) en el servidor. Solo lectura, cacheado en memoria.
// No toca ningún dato de caja del usuario.
import fs from 'node:fs';
import path from 'node:path';
import {
  calcularMercado, peorCaida, retornosIF12,
  type Base, type Dividendo, type Empresa, type Evento, type FilaMercado, type Precio, type PuntoIndice, type Trimestre,
} from './calculo';

export const DIR_MERCADO = path.join(process.cwd(), 'data', 'mercado');

/** Parser CSV mínimo (RFC 4180: comillas dobles, comas y saltos dentro de comillas, CRLF). */
export function parsearCsv(texto: string): Record<string, string>[] {
  const filas: string[][] = [];
  let fila: string[] = [], campo = '', comillas = false;
  const t = texto.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else comillas = false; }
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === ',') { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.length > 1 || fila[0] !== '') filas.push(fila);
      fila = [];
    } else campo += ch;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  const [cab, ...resto] = filas;
  return resto.map(f => Object.fromEntries(cab.map((c, i) => [c, f[i] ?? ''])));
}

const leer = (dir: string, tabla: string) => parsearCsv(fs.readFileSync(path.join(dir, `${tabla}.csv`), 'utf8'));
const num = (s: string) => {
  const n = Number(s);
  if (s.trim() === '' || !Number.isFinite(n)) throw new Error(`Número inválido en CSV: "${s}"`);
  return n;
};
const numONull = (s: string) => (s.trim() === '' ? null : num(s));
function agrupar<T>(filas: Record<string, string>[], map: (f: Record<string, string>) => T, orden: (x: T) => string) {
  const out: Record<string, T[]> = {};
  for (const f of filas) (out[f.ticker] ??= []).push(map(f));
  for (const k of Object.keys(out)) out[k].sort((a, b) => orden(a).localeCompare(orden(b)));
  return out;
}

export function cargarBase(dir = DIR_MERCADO): Base {
  const meta = Object.fromEntries(leer(dir, 'meta').map(f => [f.clave, f.valor]));
  const empresas: Empresa[] = leer(dir, 'empresas')
    .map(f => ({ ticker: f.ticker, nombre: f.nombre, sector: f.sector, descripcion: f.descripcion, moneda: f.moneda, acciones_mm: num(f.acciones_circulacion_mm) }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
  const precios = agrupar<Precio>(leer(dir, 'precios_diarios'), f => ({
    fecha: f.fecha, apertura: num(f.apertura), maximo: num(f.maximo), minimo: num(f.minimo), cierre: num(f.cierre), volumen: num(f.volumen),
  }), p => p.fecha);
  const indice: PuntoIndice[] = leer(dir, 'indice_diario')
    .map(f => ({ fecha: f.fecha, valor: num(f.valor), retorno: num(f.retorno_diario) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const fundamentales = agrupar<Trimestre>(leer(dir, 'fundamentales_trimestrales'), f => ({
    periodo: f.periodo, fecha_cierre: f.fecha_cierre, fecha_publicacion: f.fecha_publicacion,
    ingresos_mm: num(f.ingresos_mm), ebitda_mm: num(f.ebitda_mm), resultado_neto_mm: num(f.resultado_neto_mm),
    deuda_neta_mm: num(f.deuda_neta_mm), patrimonio_mm: num(f.patrimonio_mm),
  }), q => q.fecha_cierre);
  const dividendos = agrupar<Dividendo>(leer(dir, 'dividendos'), f => ({ fecha_ex: f.fecha_ex, monto: num(f.monto_por_accion) }), d => d.fecha_ex);
  const eventos: Evento[] = leer(dir, 'eventos_ficticios')
    .map(f => ({ id: num(f.id), fecha: f.fecha, ticker: f.ticker || null, tipo: f.tipo, titulo: f.titulo, impacto_pct: num(f.impacto_pct) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const e of empresas) {
    if (!precios[e.ticker]?.length || !fundamentales[e.ticker] || fundamentales[e.ticker].length < 8) {
      throw new Error(`Faltan precios o 8 trimestres para ${e.ticker}`);
    }
  }
  return { fecha_corte: meta.fecha_corte, empresas, precios, indice, fundamentales, dividendos, eventos };
}

/** metricas_snapshot.csv (dato de prueba de las fórmulas). Los vacíos vuelven como null. */
export function cargarSnapshot(dir = DIR_MERCADO): Record<string, Record<string, number | string | null>> {
  const out: Record<string, Record<string, number | string | null>> = {};
  for (const f of leer(dir, 'metricas_snapshot')) {
    out[f.ticker] = Object.fromEntries(Object.entries(f).map(([k, v]) =>
      [k, k === 'ticker' || k === 'fecha_corte' || k === 'lectura' ? v : numONull(v)]));
  }
  return out;
}

export type Mercado = {
  base: Base;
  filas: FilaMercado[];
  porTicker: Map<string, FilaMercado>;
  sectores: string[];
  if12: ReturnType<typeof retornosIF12>;
  peor: ReturnType<typeof peorCaida>;
};

let cache: Mercado | null = null;
/** Base + métricas calculadas una sola vez por proceso (los datos son estáticos). */
export function mercado(): Mercado {
  if (cache) return cache;
  const base = cargarBase();
  const filas = calcularMercado(base);
  cache = {
    base, filas,
    porTicker: new Map(filas.map(f => [f.empresa.ticker, f])),
    sectores: [...new Set(base.empresas.map(e => e.sector))].sort((a, b) => a.localeCompare(b, 'es')),
    if12: retornosIF12(base),
    peor: peorCaida(filas),
  };
  return cache;
}

/** Valida un ticker contra la tabla de empresas (nunca se arma nada con el texto del usuario). */
export function buscarTicker(t: unknown): FilaMercado | null {
  if (typeof t !== 'string' || t.length > 12) return null;
  return mercado().porTicker.get(t.trim().toUpperCase()) ?? null;
}
