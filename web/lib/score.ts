// Score preliminar 0-100 (skill v2, paso 9) con los pilares y pesos de la skill, usando SOLO lo que hay.
// Un pilar sin datos queda en null ("sin datos") y no pesa: el valor se renormaliza entre los pilares medidos y el rango se
// ensancha cuanto menos cobertura hay. Con menos de 3 meses de historia o saldo sin confirmar el rango se amplía más.
// Siempre es PRELIMINAR (faltan pilares). No es una calificación crediticia.
// Variables sensibles (género, edad, origen, domicilio, etc.) NO se usan nunca: solo flujo de caja y facturación del negocio.
// TODO(cheques): concentración de libradores, rechazo de cheques recibidos y cheques propios rechazados necesitan la cartera ECHEQ.
import type { Pronostico } from './forecast';
import type { Comprobante, Movimiento } from './parse';

export type Pilar = { nombre: string; peso: number; valor: number | null; detalle: string };
export type Categoria = 'A' | 'B' | 'C' | 'D' | 'E';
export type Score = {
  valor: number | null;               // null si no hay ningún pilar medible
  rango: [number, number];
  categoria: Categoria | null;
  preliminar: true;
  pilares: Pilar[];
  faltan: string[];
};
export type MetricasFlujo = {
  mesesHistoria: number;              // meses de 30 días completos cubiertos por los movimientos
  cv: number | null;                  // coeficiente de variación de las entradas por "mes" de 30 días
  mesesNegativos: number | null;      // fracción de meses con flujo neto negativo
  concentracionTop: number | null;    // % de lo facturado al cliente más grande (0-1)
  plazoCobroDias: number | null;      // plazo medio de cobro aprendido de los clientes
};

const DIA = 86400000;
const difDias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DIA);
const clamp = (x: number, a = 0, b = 100) => Math.max(a, Math.min(b, x));
const interp = (x: number, pts: [number, number][]) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  return pts[pts.length - 1][1];
};
// Tramos de la skill: rojo 0-40, amarillo 40-70, verde 70-100, con interpolación lineal.
const T_LIQUIDEZ: [number, number][] = [[0, 0], [15, 40], [45, 70], [90, 100]];   // días de caja
const T_CV: [number, number][] = [[0.1, 100], [0.3, 70], [0.6, 40], [1, 0]];
const T_CONC: [number, number][] = [[0.2, 100], [0.4, 70], [0.7, 30], [1, 0]];     // >40% penaliza
const T_NEG: [number, number][] = [[0, 100], [0.34, 70], [0.67, 40], [1, 0]];
const T_FORMAL: [number, number][] = [[0, 0], [0.5, 40], [0.8, 70], [1, 100]];
const pct = (x: number) => `${Math.round(x * 100)}%`;
const noIngreso = (m: Movimiento) => /^(CARGA DE SALDO|DEVOLUCION RECIBIDA)/i.test(m.desc);

export function metricasFlujo(p: Pronostico, movs: Movimiento[], emi: Comprobante[] = []): MetricasFlujo {
  const ms = [...movs].sort((a, b) => a.fecha.localeCompare(b.fecha));
  let mesesHistoria = 0, cv: number | null = null, mesesNegativos: number | null = null;
  if (ms.length) {
    const buckets = Math.floor((difDias(ms[0].fecha, p.hoy) + 1) / 30);
    mesesHistoria = buckets;
    if (buckets >= 3) {
      const ent: number[] = [], neto: number[] = [];
      for (let b = 0; b < buckets; b++) {
        const hasta = difDias(p.hoy, p.hoy) - 30 * b, desde = hasta - 30; // días relativos a hoy: (desde, hasta]
        const tramo = ms.filter(m => { const d = difDias(p.hoy, m.fecha); return d > desde && d <= hasta; });
        ent.push(tramo.filter(m => m.monto > 0 && !noIngreso(m)).reduce((s, m) => s + m.monto, 0));
        neto.push(tramo.reduce((s, m) => s + m.monto, 0));
      }
      const media = ent.reduce((s, v) => s + v, 0) / ent.length;
      if (media > 0) cv = Math.sqrt(ent.reduce((s, v) => s + (v - media) ** 2, 0) / ent.length) / media;
      mesesNegativos = neto.filter(n => n < 0).length / neto.length;
    }
  }
  let concentracionTop: number | null = null;
  if (emi.length >= 3) {
    const por = new Map<string, number>();
    for (const c of emi) if (c.total > 0) por.set(c.cuit, (por.get(c.cuit) ?? 0) + c.total);
    const total = [...por.values()].reduce((s, v) => s + v, 0);
    if (total > 0) concentracionTop = Math.max(...por.values()) / total;
  }
  const cobrar = p.contrapartes.filter(c => c.lado === 'cobrar');
  const nf = cobrar.reduce((s, c) => s + c.facturas, 0);
  const plazoCobroDias = nf ? cobrar.reduce((s, c) => s + c.plazoDias * c.facturas, 0) / nf : null;
  return { mesesHistoria, cv, mesesNegativos, concentracionTop, plazoCobroDias };
}

export function calcularScore(p: Pronostico, movs: Movimiento[], emi: Comprobante[] = [], m: MetricasFlujo = metricasFlujo(p, movs, emi)): Score {
  const confirmado = p.confiable !== false;
  // 1) Liquidez (25%): días de caja = saldo / egreso diario proyectado.
  const egresoDiario = p.serie.reduce((s, d) => s + d.salidas, 0) / Math.max(1, p.serie.length);
  const dias = egresoDiario > 0 ? Math.max(0, p.saldoInicial) / egresoDiario : null;
  const liquidez: Pilar = { nombre: 'Liquidez', peso: 25, valor: dias === null ? null : Math.round(interp(dias, T_LIQUIDEZ)),
    detalle: dias === null ? 'Sin datos: no se proyectan egresos.' : `Tu caja cubre unos ${Math.round(dias)} días de gastos${confirmado ? '' : ' (estimado: el saldo está sin confirmar)'}.` };
  // 2) Endeudamiento y solvencia (20%): requiere balance y deudas.
  const deuda: Pilar = { nombre: 'Endeudamiento y solvencia', peso: 20, valor: null, detalle: 'Sin datos: falta el balance y las deudas.' };
  // 3) Calidad del flujo (20%): estabilidad (CV mensual), meses negativos y concentración de clientes.
  const subs: number[] = [], det: string[] = [];
  if (m.cv !== null) { subs.push(interp(m.cv, T_CV)); det.push(`ingresos con variación de ${pct(m.cv)} entre meses`); }
  if (m.mesesNegativos !== null) { subs.push(interp(m.mesesNegativos, T_NEG)); det.push(`${pct(m.mesesNegativos)} de los meses con flujo negativo`); }
  if (m.concentracionTop !== null) { subs.push(interp(m.concentracionTop, T_CONC)); det.push(`tu cliente más grande es el ${pct(m.concentracionTop)} de lo facturado`); }
  const flujo: Pilar = { nombre: 'Calidad del flujo', peso: 20, valor: subs.length ? Math.round(subs.reduce((s, v) => s + v, 0) / subs.length) : null,
    detalle: det.length ? `${det.join('; ')}.` : 'Sin datos suficientes (hacen falta 3 meses de movimientos o facturas emitidas).' };
  // 4) Comportamiento de pago (20%): requiere vencimientos de facturas recibidas, cheques propios y planes de pago.
  const pago: Pilar = { nombre: 'Comportamiento de pago', peso: 20, valor: null, detalle: 'Sin datos: faltan vencimientos de facturas recibidas, cheques propios y planes de pago.' };
  // 5) Formalidad y trazabilidad (15%): facturación emitida frente a lo acreditado (últimos 90 días).
  const desde90 = difDias(p.hoy, p.hoy) - 90;
  const fact = emi.filter(c => c.total > 0 && difDias(p.hoy, c.fecha) > desde90 && c.fecha <= p.hoy).reduce((s, c) => s + c.total, 0);
  const acred = movs.filter(x => x.monto > 0 && !noIngreso(x) && difDias(p.hoy, x.fecha) > desde90).reduce((s, x) => s + x.monto, 0);
  const ratio = fact > 0 && acred > 0 ? Math.min(1, fact / acred) : null;
  const formal: Pilar = { nombre: 'Formalidad y trazabilidad', peso: 15, valor: ratio === null ? null : Math.round(interp(ratio, T_FORMAL)),
    detalle: ratio === null ? 'Sin datos: falta la facturación emitida para compararla con lo que entra a la cuenta.' : `Facturaste el equivalente al ${pct(ratio)} de lo acreditado en 90 días.` };

  const pilares = [liquidez, deuda, flujo, pago, formal];
  const medidos = pilares.filter(x => x.valor !== null);
  const pesoMedido = medidos.reduce((s, x) => s + x.peso, 0);
  const faltan: string[] = [];
  if (!confirmado) faltan.push('Saldo confirmado (hoy es una estimación)');
  if (m.mesesHistoria < 3) faltan.push('Más historia: con menos de 3 meses no se mide la estabilidad de los ingresos');
  if (deuda.valor === null) faltan.push('Deudas y balance (endeudamiento y solvencia)');
  if (pago.valor === null) faltan.push('Historial de pago a proveedores, cheques propios y planes de pago');
  if (formal.valor === null || m.concentracionTop === null) faltan.push('Facturas emitidas (concentración de clientes y formalidad)');
  faltan.push('Cartera de cheques y ECHEQ');
  if (!pesoMedido) return { valor: null, rango: [0, 100], categoria: null, preliminar: true, pilares, faltan };

  const valor = Math.round(medidos.reduce((s, x) => s + x.peso * x.valor!, 0) / pesoMedido);
  const margen = 6 + 24 * (1 - pesoMedido / 100) + (m.mesesHistoria < 3 ? 8 : 0) + (confirmado ? 0 : 12);
  const rango: [number, number] = [Math.round(clamp(valor - margen)), Math.round(clamp(valor + margen))];
  const categoria: Categoria = valor >= 80 ? 'A' : valor >= 65 ? 'B' : valor >= 50 ? 'C' : valor >= 35 ? 'D' : 'E';
  return { valor, rango, categoria, preliminar: true, pilares, faltan };
}

export const estabilidadFlujo = (m: MetricasFlujo): 'alta' | 'media' | 'baja' => m.cv === null ? 'media' : m.cv < 0.25 ? 'alta' : m.cv < 0.5 ? 'media' : 'baja';
export function riesgoCobros(m: MetricasFlujo): 'bajo' | 'medio' | 'alto' {
  if (m.concentracionTop === null && m.plazoCobroDias === null) return 'medio'; // sin datos de clientes
  const pts = Number((m.concentracionTop ?? 0) > 0.4) + Number((m.plazoCobroDias ?? 0) > 45);
  return pts === 0 ? 'bajo' : pts === 1 ? 'medio' : 'alto';
}
