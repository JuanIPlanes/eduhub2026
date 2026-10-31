// Armado de las respuestas (API y páginas) del mercado ficticio. Números sin formatear: el formato se hace en el cliente.
import { esRango, recortar, type FilaMercado, type Rango } from './calculo';
import { buscarTicker, mercado } from './datos';
import { lecturaEnPalabras } from './lectura';
import { ORDENES, esOrden, ordenar, type FilaLista, type Orden } from './lista';

export { esRango };
export type { Rango, FilaLista, Orden };
export { ORDENES, esOrden, ordenar };

export const AVISO = 'Mercado ficticio: empresas, precios y datos inventados para practicar. No es información real ni una recomendación.';

function fila(f: FilaMercado): FilaLista {
  return {
    ticker: f.empresa.ticker, nombre: f.empresa.nombre, sector: f.empresa.sector,
    precio: f.metricas.precio, ret_12m: f.metricas.ret_12m, vol_anual: f.metricas.vol_anual, pe: f.metricas.pe,
    score_total: f.puntaje.total, lectura: f.puntaje.nivel,
  };
}

export function resumen() {
  const m = mercado();
  const por12 = [...m.filas].sort((a, b) => b.metricas.ret_12m - a.metricas.ret_12m);
  const conteo = { alto: 0, medio: 0, bajo: 0 };
  for (const f of m.filas) conteo[f.puntaje.nivel]++;
  return {
    aviso: AVISO,
    fecha_corte: m.base.fecha_corte,
    if12: { serie: m.base.indice.map(p => ({ fecha: p.fecha, valor: p.valor })), ...m.if12 },
    suben: por12.slice(0, 3).map(fila),
    caen: por12.slice(-3).reverse().map(fila),
    conteo,
    peor_caida: m.peor,
    eventos_mercado: m.base.eventos.filter(e => e.ticker === null),
  };
}
export type Resumen = ReturnType<typeof resumen>;

export function empresas(sector: string | null, orden: Orden) {
  const m = mercado();
  const lista = m.filas.filter(f => !sector || f.empresa.sector === sector).map(fila);
  return { fecha_corte: m.base.fecha_corte, sectores: m.sectores, orden, sector, empresas: ordenar(lista, orden) };
}
export const sectorValido = (s: string | null) => s === null || s === '' || mercado().sectores.includes(s);

export function ficha(ticker: string, rango: Rango = 'todo') {
  const f = buscarTicker(ticker);
  if (!f) return null;
  const m = mercado();
  const t = f.empresa.ticker;
  const ventana12 = new Date(`${m.base.fecha_corte}T00:00:00Z`);
  ventana12.setUTCDate(ventana12.getUTCDate() - 365);
  const desde = ventana12.toISOString().slice(0, 10);
  const divs = m.base.dividendos[t] ?? [];
  return {
    aviso: AVISO,
    fecha_corte: m.base.fecha_corte,
    empresa: f.empresa,
    metricas: f.metricas,
    puntaje: f.puntaje,
    posicion: [...m.filas].sort((a, b) => b.puntaje.total - a.puntaje.total).findIndex(x => x.empresa.ticker === t) + 1,
    total_empresas: m.filas.length,
    trimestres: m.base.fundamentales[t].slice(-8),
    dividendos: { lista: divs, ultimos_365_dias: divs.filter(d => d.fecha_ex > desde && d.fecha_ex <= m.base.fecha_corte).reduce((a, d) => a + d.monto, 0) },
    eventos: m.base.eventos.filter(e => e.ticker === t || e.ticker === null),
    if12_ret_12m: m.if12.ret_12m,
    lectura_en_palabras: lecturaEnPalabras(f, m.if12.ret_12m!),
    rango,
    serie: recortar(m.base.precios[t], rango).map(p => ({ fecha: p.fecha, cierre: p.cierre })),
  };
}
export type Ficha = NonNullable<ReturnType<typeof ficha>>;

export function listaTickers() { return mercado().filas.map(f => ({ ticker: f.empresa.ticker, nombre: f.empresa.nombre, sector: f.empresa.sector })); }
