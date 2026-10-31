// Escenarios de caja (skill v2, paso 6). Definición CLARA:
//  - base       = comportamiento histórico, SIN los `supuestos` del pedido.
//  - pesimista  = cobros a clientes +15 días y ventas −10%. FIJO.
//  - optimista  = ventas +10% y cobros en el plazo histórico. FIJO.
// Los `supuestos` del pedido modifican solo el pronóstico principal (`pronostico`), nunca estos tres.
// Todos proyectan con la misma inflación que el principal (las ventas crecen con el IPC mensual).
// TODO(cheques): la skill v2 pide además rechazo de cheques al nivel de referencia del sistema en el pesimista; sin cartera de
// cheques/ECHEQ cargada no se modela (ver resumen.avisos).
import { pronosticar, type Opciones, type Pronostico } from './forecast';
import type { Comprobante, Movimiento } from './parse';

export type Escenario = {
  serie: { fecha: string; saldo: number }[];
  minimo: number; fechaMinimo: string;
  hueco: { inicio: string; dias: number; minimo: number } | null;
  supuestos: { ventas: number; demoraCobros: number };
};
export const PESIMISTA = { ventas: 0.9, demoraCobros: 15 };
export const OPTIMISTA = { ventas: 1.1, demoraCobros: 0 };

export function aEscenario(p: Pronostico): Escenario {
  const min = p.serie.reduce((a, b) => (b.saldo < a.saldo ? b : a), p.serie[0]);
  const h = p.hueco;
  return {
    serie: p.serie.map(d => ({ fecha: d.fecha, saldo: d.saldo })), minimo: min.saldo, fechaMinimo: min.fecha,
    hueco: h ? { inicio: h.inicio, dias: h.dias, minimo: h.minimo } : null,
    supuestos: { ventas: p.supuestos?.ventasFactor ?? 1, demoraCobros: p.supuestos?.demoraCobros ?? 0 },
  };
}

// `opBase`: opciones SIN supuestos del usuario. `principal`: el pronóstico ya calculado (con supuestos, si hay);
// `conSupuestos` indica si difiere del base (si no, se reutiliza como base y se ahorra una corrida).
export function calcularEscenarios(movs: Movimiento[], rec: Comprobante[], emi: Comprobante[], opBase: Opciones, principal: Pronostico, conSupuestos: boolean) {
  const base = conSupuestos ? pronosticar(movs, rec, emi, opBase) : principal;
  const pesimista = pronosticar(movs, rec, emi, { ...opBase, ventasFactor: PESIMISTA.ventas, demoraCobros: PESIMISTA.demoraCobros });
  const optimista = pronosticar(movs, rec, emi, { ...opBase, ventasFactor: OPTIMISTA.ventas, demoraCobros: OPTIMISTA.demoraCobros });
  return {
    escenarios: { base: aEscenario(base), pesimista: aEscenario(pesimista), optimista: aEscenario(optimista) },
    pron: { base, pesimista, optimista },
  };
}
