// Simulador de cartera ficticia: pesos constantes (rebalanceo diario implícito) sobre los últimos 253 cierres.
// Puro: recibe la base ya cargada. El monto es opcional y no se guarda en ningún lado.
import {
  HORIZONTE_MIN_RENTA_VARIABLE_MESES, VENTANA_12M, caidaMaxima, desvio, logRetornos,
  type Base, type FilaMercado,
} from './calculo';

export const MAX_POSICIONES = 8;
export const AVISO_POSICION = 0.4;
export const AVISO_SECTOR = 0.6;
export const RUEDAS_MES = 21;

export type Posicion = { ticker: string; peso: number }; // peso en % (0–100]
export type PedidoSimulacion = { monto?: number; horizonte_meses: number; posiciones: Posicion[] };

export type ResultadoSimulacion =
  | {
    simulable: false; horizonte_meses: number; minimo_meses: number;
    peor_caida: { ticker: string; nombre: string; max_dd_12m: number };
  }
  | {
    simulable: true; horizonte_meses: number;
    ventana: { desde: string; hasta: string; ruedas: number };
    posiciones: { ticker: string; nombre: string; sector: string; peso: number }[];
    cartera: { ret_12m: number; vol_anual: number; max_dd_12m: number; peor_mes: { ret: number; desde: string; hasta: string } };
    if12: { ret_12m: number };
    concentracion: {
      mayor_posicion: { ticker: string; peso: number };
      sectores: { sector: string; peso: number }[];
      avisos: string[];
    };
    serie: { fecha: string; cartera: number; if12: number }[]; // base 100 al inicio de la ventana
    pesos?: PesosSimulados;
  };
export type PesosSimulados = { monto: number; peor_mes: number; queda_tras_caida_max: number; resultado_12m: number };

export class ErrorPedido extends Error {}

/** Valida el cuerpo del POST. Tira ErrorPedido con un mensaje para la persona usuaria. */
export function validarPedido(cuerpo: unknown, tickersValidos: Set<string>): PedidoSimulacion {
  if (!cuerpo || typeof cuerpo !== 'object') throw new ErrorPedido('Falta el cuerpo del pedido.');
  const c = cuerpo as Record<string, unknown>;
  const h = c.horizonte_meses;
  if (typeof h !== 'number' || !Number.isInteger(h) || h < 1 || h > 600) throw new ErrorPedido('El horizonte tiene que ser una cantidad entera de meses (1 a 600).');
  let monto: number | undefined;
  if (c.monto !== undefined && c.monto !== null) {
    if (typeof c.monto !== 'number' || !Number.isFinite(c.monto) || c.monto <= 0 || c.monto > 1e13) throw new ErrorPedido('El monto tiene que ser un número mayor que cero.');
    monto = c.monto;
  }
  if (!Array.isArray(c.posiciones)) throw new ErrorPedido('Faltan las posiciones.');
  if (c.posiciones.length < 1) throw new ErrorPedido('Agregá al menos una empresa.');
  if (c.posiciones.length > MAX_POSICIONES) throw new ErrorPedido(`Como máximo ${MAX_POSICIONES} posiciones.`);
  const vistos = new Set<string>();
  const posiciones: Posicion[] = c.posiciones.map((p: unknown) => {
    const x = (p ?? {}) as Record<string, unknown>;
    const t = typeof x.ticker === 'string' ? x.ticker.trim().toUpperCase() : '';
    if (!tickersValidos.has(t)) throw new ErrorPedido('Hay una empresa que no está en este mercado ficticio.');
    if (vistos.has(t)) throw new ErrorPedido(`${t} está repetida.`);
    vistos.add(t);
    if (typeof x.peso !== 'number' || !Number.isFinite(x.peso) || x.peso <= 0 || x.peso > 100) throw new ErrorPedido(`El peso de ${t} tiene que estar entre 0 y 100.`);
    return { ticker: t, peso: x.peso };
  });
  const total = posiciones.reduce((a, p) => a + p.peso, 0);
  if (Math.abs(total - 100) > 0.01) throw new ErrorPedido(`Los pesos suman ${Math.round(total * 100) / 100}%; tienen que sumar 100%.`);
  return { monto, horizonte_meses: h, posiciones };
}

export function enPesos(r: { cartera: { ret_12m: number; max_dd_12m: number; peor_mes: { ret: number } } }, monto: number): PesosSimulados {
  return {
    monto,
    peor_mes: monto * r.cartera.peor_mes.ret,
    queda_tras_caida_max: monto * (1 + r.cartera.max_dd_12m),
    resultado_12m: monto * r.cartera.ret_12m,
  };
}

export function simular(base: Base, filas: FilaMercado[], pedido: PedidoSimulacion, peor: { ticker: string; nombre: string; max_dd_12m: number }): ResultadoSimulacion {
  if (pedido.horizonte_meses < HORIZONTE_MIN_RENTA_VARIABLE_MESES) {
    return { simulable: false, horizonte_meses: pedido.horizonte_meses, minimo_meses: HORIZONTE_MIN_RENTA_VARIABLE_MESES, peor_caida: peor };
  }
  const info = new Map(filas.map(f => [f.empresa.ticker, f.empresa]));
  const w = pedido.posiciones.map(p => p.peso / 100);
  const ventanas = pedido.posiciones.map(p => base.precios[p.ticker].slice(-VENTANA_12M));
  const fechas = base.indice.slice(-VENTANA_12M).map(p => p.fecha);
  const idx = base.indice.slice(-VENTANA_12M).map(p => p.valor);
  for (const v of ventanas) {
    if (v.length !== VENTANA_12M || v.some((p, i) => p.fecha !== fechas[i])) throw new Error('Las fechas de precios no coinciden con el índice.');
  }

  // Valor de la cartera con pesos constantes: V[t] = V[t-1] × (1 + Σ w_i r_i[t]).
  const valor = [1];
  for (let t = 1; t < VENTANA_12M; t++) {
    let r = 0;
    for (let i = 0; i < w.length; i++) r += w[i] * (ventanas[i][t].cierre / ventanas[i][t - 1].cierre - 1);
    valor.push(valor[t - 1] * (1 + r));
  }
  let peorMes = { ret: Infinity, desde: fechas[0], hasta: fechas[RUEDAS_MES] };
  for (let t = 0; t + RUEDAS_MES < VENTANA_12M; t++) {
    const r = valor[t + RUEDAS_MES] / valor[t] - 1;
    if (r < peorMes.ret) peorMes = { ret: r, desde: fechas[t], hasta: fechas[t + RUEDAS_MES] };
  }
  const cartera = {
    ret_12m: valor[valor.length - 1] - 1,
    vol_anual: desvio(logRetornos(valor)) * Math.sqrt(252),
    max_dd_12m: caidaMaxima(valor),
    peor_mes: peorMes,
  };

  const sectores = new Map<string, number>();
  pedido.posiciones.forEach((p, i) => { const s = info.get(p.ticker)!.sector; sectores.set(s, (sectores.get(s) ?? 0) + w[i]); });
  const listaSect = [...sectores].map(([sector, peso]) => ({ sector, peso })).sort((a, b) => b.peso - a.peso);
  const mayor = pedido.posiciones.reduce((a, b) => (b.peso > a.peso ? b : a));
  const avisos: string[] = [];
  for (const p of pedido.posiciones) if (p.peso / 100 > AVISO_POSICION) avisos.push(`${p.ticker} pesa ${fmtPct(p.peso / 100)} de la cartera: más del 40% en una sola empresa concentra mucho el riesgo.`);
  for (const s of listaSect) if (s.peso > AVISO_SECTOR) avisos.push(`El sector ${s.sector} pesa ${fmtPct(s.peso)}: más del 60% en un solo sector concentra mucho el riesgo.`);

  const out: ResultadoSimulacion = {
    simulable: true,
    horizonte_meses: pedido.horizonte_meses,
    ventana: { desde: fechas[0], hasta: fechas[fechas.length - 1], ruedas: VENTANA_12M },
    posiciones: pedido.posiciones.map(p => { const e = info.get(p.ticker)!; return { ticker: p.ticker, nombre: e.nombre, sector: e.sector, peso: p.peso }; }),
    cartera,
    if12: { ret_12m: idx[idx.length - 1] / idx[0] - 1 },
    concentracion: { mayor_posicion: { ticker: mayor.ticker, peso: mayor.peso / 100 }, sectores: listaSect, avisos },
    serie: fechas.map((fecha, i) => ({ fecha, cartera: 100 * valor[i], if12: (100 * idx[i]) / idx[0] })),
  };
  if (pedido.monto !== undefined) out.pesos = enPesos(out, pedido.monto);
  return out;
}

function fmtPct(x: number) { return `${(x * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`; }
