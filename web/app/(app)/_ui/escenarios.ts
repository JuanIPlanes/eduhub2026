// Cuentas del lado del navegador para los escenarios y el "¿y si cobro menos?".
// Se usan solo cuando el servidor no los calcula (backend viejo) o como vista previa inmediata mientras recalcula.
// Todo lo que sale de acá se rotula "aproximado" en la interfaz.
import { sumarDias, type Escenario, type NombreEscenario, type Pronostico, type Supuestos } from './formato';

type Dia = Pronostico['serie'][number];
type Hueco = Pronostico['huecos'][number];

export const SUP_BASE: Supuestos = {};
export const esBase = (s?: Supuestos | null) => !s || ((s.ventas ?? 1) === 1 && !(s.demoraCobros ?? 0));
export const mismoSup = (a?: Supuestos | null, b?: Supuestos | null) =>
  (a?.ventas ?? 1) === (b?.ventas ?? 1) && (a?.demoraCobros ?? 0) === (b?.demoraCobros ?? 0);

/** Supuestos de la skill para los escenarios de referencia. */
export const SUP_ESCENARIO: Record<NombreEscenario, Supuestos> = {
  base: {},
  pesimista: { ventas: 0.9, demoraCobros: 15 },
  optimista: { ventas: 1.1 },
};

const COBROS = new Set(['ventas', 'cobro_clientes']);

export function huecosDe(serie: Dia[]): Hueco[] {
  const out: Hueco[] = [];
  let h: Hueco | null = null;
  for (const d of serie) {
    if (d.saldo < 0) {
      if (!h) h = { inicio: d.fecha, fin: null, minimo: d.saldo, fechaMinimo: d.fecha, dias: 0, areaNegativa: 0 };
      h.dias++; h.areaNegativa += -d.saldo;
      if (d.saldo < h.minimo) { h.minimo = d.saldo; h.fechaMinimo = d.fecha; }
    } else if (h) { h.fin = d.fecha; out.push(h); h = null; }
  }
  if (h) out.push(h);
  return out;
}

/** Aplica "vendés X% menos" y "te pagan N días tarde" a una proyección ya calculada. */
export function aplicarSupuestos(p: Pronostico, sup: Supuestos): Pronostico {
  if (esBase(sup)) return p;
  const f = sup.ventas ?? 1, demora = Math.round(sup.demoraCobros ?? 0);
  const delta = new Map<string, number>();
  const sumar = (fe: string, m: number) => delta.set(fe, (delta.get(fe) ?? 0) + m);
  const eventos = p.eventos.map(e => {
    if (!(e.monto > 0 && COBROS.has(e.categoria) && e.fecha > p.hoy)) return e;
    const nuevo = e.monto * f;
    const fecha = demora ? sumarDias(e.fecha, demora) : e.fecha;
    sumar(e.fecha, -e.monto); sumar(fecha, nuevo);
    return { ...e, monto: nuevo, fecha };
  });
  let acum = 0;
  const serie = p.serie.map(d => {
    const dl = delta.get(d.fecha) ?? 0;
    acum += dl;
    return { ...d, entradas: Math.max(0, d.entradas + dl), saldo: d.saldo + acum };
  });
  const huecos = huecosDe(serie);
  const horizontes = p.horizontes.map(hz => {
    const tramo = serie.slice(0, hz.dias);
    if (!tramo.length) return hz;
    const min = tramo.reduce((a, b) => (b.saldo < a.saldo ? b : a));
    return { ...hz, saldoFinal: tramo[tramo.length - 1].saldo, minimo: min.saldo, fechaMinimo: min.fecha };
  });
  return { ...p, serie, eventos, huecos, hueco: huecos[0] ?? null, horizontes };
}

export function escenarioDe(p: Pronostico): Escenario {
  const serie = p.serie.map(d => ({ fecha: d.fecha, saldo: d.saldo }));
  const min = serie.length ? serie.reduce((a, b) => (b.saldo < a.saldo ? b : a)) : { fecha: p.hoy, saldo: p.saldoInicial };
  const h = huecosDe(p.serie)[0];
  return { serie, minimo: min.saldo, fechaMinimo: min.fecha, hueco: h ? { inicio: h.inicio, dias: h.dias, minimo: h.minimo } : null };
}

export function escenariosLocales(p: Pronostico): Record<NombreEscenario, Escenario> {
  return {
    base: escenarioDe(p),
    pesimista: escenarioDe(aplicarSupuestos(p, SUP_ESCENARIO.pesimista)),
    optimista: escenarioDe(aplicarSupuestos(p, SUP_ESCENARIO.optimista)),
  };
}

/** "cobrás 20% menos y te pagan 15 días tarde" */
export function describirSup(s: Supuestos): string {
  const partes: string[] = [];
  const f = s.ventas ?? 1;
  if (f < 1) partes.push(`cobrás ${Math.round((1 - f) * 100)}% menos`);
  if (f > 1) partes.push(`cobrás ${Math.round((f - 1) * 100)}% más`);
  if (s.demoraCobros) partes.push(`te pagan ${s.demoraCobros} días tarde`);
  return partes.join(' y ') || 'todo sigue como hasta ahora';
}
