// Recomendación: compara cómo cubrir el hueco con costos calculados sobre tasas reales (BCRA vía OpenARG).
// Orquesta, no asesora: no nombra instrumentos ni emisores; deriva a entidades habilitadas.
import { fechaLarga, fmt, pronosticar, sumar, type Evento, type Opciones, type Pronostico } from './forecast';
import type { Comprobante, Movimiento } from './parse';
import type { Cita, Contexto } from './openarg';

export type Opcion = {
  id: 'renegociar' | 'descontar' | 'adelanto';
  titulo: string; detalle: string; costo: number; cubre: boolean; citas: Cita[];
  // Costo real (skill v2, paso 5). Tasas como fracción (0,45 = 45%). costoPeriodo: costo sobre lo recibido/usado durante el plazo.
  tea: number | null; costoPeriodo: number | null;
  estimado: boolean;                  // true si la tasa es la de referencia BCRA y no la real del banco del usuario
};
// Pagos del hueco ordenados por la prioridad del paso 7 (1 = se paga primero; 5 = se ajusta primero).
export type PagoOrdenado = { prioridad: 1 | 2 | 3 | 4 | 5; grupo: string; concepto: string; fecha: string; monto: number; postergable: boolean; diasEstirables: number; costoProbable: string; estimado: true };
export type OrdenPagos = { items: PagoOrdenado[]; totalPostergable: number; cubreHueco: boolean };
export type Recomendacion = { alerta: string; opciones: Opcion[]; elegida: Opcion['id'] | null; contexto: string[]; aviso: string; ordenPagos: OrdenPagos | null };

// Fórmulas de la skill v2, paso 5.
export const teaDescuento = (nominal: number, neto: number, n: number) => Math.pow(nominal / neto, 365 / n) - 1;
export const teaDescubierto = (tnaFraccion: number) => Math.pow(1 + tnaFraccion / 365, 365) - 1;
// Pronto pago a proveedor: descuento d (fracción) por pagar p días antes de un vencimiento de n días.
export const teaProntoPago = (d: number, n: number, p: number) => Math.pow(1 + d / (1 - d), 365 / (n - p)) - 1;

const GRUPOS: Record<string, { prioridad: PagoOrdenado['prioridad']; grupo: string }> = {
  sueldos: { prioridad: 1, grupo: 'Sueldos, cargas e impuestos' }, aguinaldo: { prioridad: 1, grupo: 'Sueldos, cargas e impuestos' },
  cargas_sociales: { prioridad: 1, grupo: 'Sueldos, cargas e impuestos' }, impuestos: { prioridad: 1, grupo: 'Sueldos, cargas e impuestos' },
  alquiler: { prioridad: 2, grupo: 'Operación crítica' }, servicios: { prioridad: 2, grupo: 'Operación crítica' },
  // TODO(cheques/descuentos): la prioridad 3 (proveedores con descuento por pronto pago o riesgo comercial) y los cheques propios
  // emitidos (prioridad 1) necesitan datos que todavía no se cargan; hoy todo proveedor cae en "resto".
  proveedores: { prioridad: 4, grupo: 'Resto de proveedores' }, otros: { prioridad: 4, grupo: 'Otros pagos' }, bancarios: { prioridad: 4, grupo: 'Otros pagos' },
  retiros: { prioridad: 5, grupo: 'Retiros y gastos postergables' },
};
const ESTIRABLE: Record<number, [number, string]> = {
  1: [0, 'Sin margen: dejar de pagar acá tiene el costo más alto (rechazo bancario, intimaciones o pérdida de planes de pago).'],
  2: [5, 'Se puede estirar unos días avisando antes; puede haber recargo por mora o corte del servicio.'],
  3: [10, 'Perdés el descuento por pronto pago o arriesgás la relación comercial.'],
  4: [15, 'Se negocia avisando antes del vencimiento; puede haber intereses o menos plazo de crédito a futuro.'],
  5: [30, 'Es lo primero que se ajusta: no tiene costo financiero.'],
};
// Pagos entre hoy y el punto más bajo del hueco, de mayor a menor prioridad de pago. Los plazos estirables son sugerencias (estimado).
export function ordenarPagos(p: Pronostico, falta: number, hasta: string): OrdenPagos {
  const items: PagoOrdenado[] = p.eventos.filter((e: Evento) => e.monto < 0 && e.categoria !== 'ventas' && e.fecha > p.hoy && e.fecha <= hasta).map(e => {
    const g = GRUPOS[e.categoria] ?? GRUPOS.otros;
    const [dias, costo] = ESTIRABLE[g.prioridad];
    return { prioridad: g.prioridad, grupo: g.grupo, concepto: e.concepto, fecha: e.fecha, monto: -e.monto, postergable: g.prioridad >= 3, diasEstirables: dias, costoProbable: costo, estimado: true as const };
  }).sort((a, b) => a.prioridad - b.prioridad || a.fecha.localeCompare(b.fecha) || b.monto - a.monto).slice(0, 20);
  const totalPostergable = items.filter(i => i.postergable).reduce((s, i) => s + i.monto, 0);
  return { items, totalPostergable: Math.round(totalPostergable), cubreHueco: totalPostergable >= falta };
}
const millones = (n: number) => `$${(Math.abs(n) / 1e6).toFixed(1).replace('.', ',')} M`;

// `extra`: boletas/nómina del pedido, para que las alternativas se evalúen sobre los mismos compromisos que el pronóstico principal.
export function recomendar(p: Pronostico, movs: Movimiento[], rec: Comprobante[], emi: Comprobante[], ctx: Contexto, extra: Pick<Opciones, 'boletas' | 'nomina'> = {}): Recomendacion {
  const aviso = 'Esto es información para decidir, no asesoramiento financiero. Las condiciones finales las fija cada entidad.';
  const contexto = [
    `Los bancos están más exigentes: la morosidad de las empresas y familias pasó de ${ctx.citas.irregularidad.valor} (${ctx.citas.irregularidad.periodo}). Llegar con la caja ordenada y comprobable te da ventaja.`,
  ];
  const confiable = p.confiable !== false;
  const sinConfirmar = 'Ojo: tu saldo está sin confirmar (es una estimación), así que no puedo asegurarte nada. Cargá tu saldo de hoy para confirmarlo.';
  if (!p.hueco) {
    const h90 = p.horizontes.find(h => h.dias === 90)!;
    if (!confiable) {
      contexto.push(sinConfirmar);
      return { alerta: 'Con el saldo que tengo (estimado, sin confirmar) no veo un faltante en los próximos 120 días, pero no puedo afirmar que no te quedes sin plata. Confirmá tu saldo de hoy para saberlo.', opciones: [], elegida: null, contexto, aviso, ordenPagos: null };
    }
    contexto.push(`Si te sobra plata, ojo: el plazo fijo rindió ${ctx.citas.pfReal.valor} real en ${ctx.citas.pfReal.periodo}. Antes de inmovilizar, mirá tu mínimo proyectado (${millones(h90.minimo)} el ${fechaLarga(h90.fechaMinimo)}).`);
    return { alerta: `Buenas noticias: en los próximos 120 días no te quedás sin caja. Tu punto más bajo es ${millones(h90.minimo)} el ${fechaLarga(h90.fechaMinimo)}.`, opciones: [], elegida: null, contexto, aviso, ordenPagos: null };
  }

  const h = p.hueco;
  const falta = -h.minimo;
  const enDias = Math.round((Date.parse(h.inicio) - Date.parse(p.hoy)) / 86400000);
  const alerta = `⚠️ ${confiable ? '' : '(Estimado, saldo sin confirmar) '}El ${fechaLarga(h.inicio)} (en ${enDias} días) te ${confiable ? 'falta' : 'faltaría'} plata: hasta ${millones(h.minimo)} el ${fechaLarga(h.fechaMinimo)} y estás en rojo ${h.dias} ${h.dias === 1 ? 'día' : 'días'}.` +
    (p.huecos.length > 1 ? ` Hay ${p.huecos.length - 1} hueco${p.huecos.length > 2 ? 's' : ''} más adelante (el próximo, el ${fechaLarga(p.huecos[1].inicio)}).` : '');
  // Mismo punto de partida y supuestos que el principal (saldo anclado al día de corte).
  const op = { ipcMensual: p.ipcMensual, hoy: p.hoy, saldoInicial: { fecha: p.hoy, monto: p.saldoInicial }, ventasFactor: p.supuestos?.ventasFactor, demoraCobros: p.supuestos?.demoraCobros, ...extra };
  // ¿La alternativa cubre ESTE hueco? (anticipar cobros puede correr el problema más adelante)
  const minEnHueco = (alt: Pronostico) => Math.min(...alt.serie.filter(d => d.fecha >= h.inicio && (!h.fin || d.fecha < h.fin)).map(d => d.saldo));
  const opciones: Opcion[] = [];

  // A) Renegociar el plazo con el proveedor que más pesa en la ventana del hueco (costo financiero 0)
  const ventana = p.eventos.filter(e => e.categoria === 'proveedores' && e.fecha >= sumar(h.inicio, -20) && e.fecha <= h.fechaMinimo);
  const porProv = new Map<string, number>();
  for (const e of ventana) porProv.set(e.cuit!, (porProv.get(e.cuit!) ?? 0) - e.monto);
  const [cuitTop, montoTop] = [...porProv].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (cuitTop) {
    const prov = p.contrapartes.find(c => c.cuit === cuitTop)!;
    const alt = pronosticar(movs, rec, emi, { ...op, plazoExtra: { [cuitTop]: 15 } });
    const resto = minEnHueco(alt);
    const cubre = resto >= 0;
    opciones.push({ id: 'renegociar', titulo: `Pedile 15 días más a ${prov.nombre}`,
      detalle: `Hoy le pagás a ${prov.plazoDias} días. Pasando a ${prov.plazoDias + 15}, corrés ${millones(montoTop)} de pagos fuera del hueco. ${cubre ? 'Con eso solo, cubrís este hueco.' : `El faltante baja a ${millones(resto)}.`}`,
      costo: 0, cubre, citas: [], tea: 0, costoPeriodo: 0, estimado: false });
  }

  // B) Descontar facturas de clientes (FCE / ECHEQ) que cobrás después del hueco
  const futuras = p.eventos.filter(e => e.categoria === 'cobro_clientes' && e.origen === 'factura pendiente' && e.fecha > h.inicio)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  let acum = 0, costoDesc = 0, neto = 0, diasPond = 0;
  const anticipos: { cuit: string; numero: string; fecha: string }[] = [];
  const fechaAnt = sumar(h.inicio, -2);
  for (const e of futuras) {
    if (acum >= falta) break;
    const numero = e.concepto.match(/fact\. ([^),]+)/)?.[1] ?? '';
    anticipos.push({ cuit: e.cuit!, numero, fecha: fechaAnt });
    acum += e.monto;
    const n = Math.max(0, Date.parse(e.fecha) - Date.parse(fechaAnt)) / 86400000;
    const netoI = e.monto * (1 - (ctx.tnaDocumentos / 100) * n / 365); // paso 5: neto = nominal × (1 − tna × n / 365)
    costoDesc += e.monto - netoI; neto += netoI; diasPond += e.monto * n;
  }
  if (anticipos.length) {
    const resto = minEnHueco(pronosticar(movs, rec, emi, { ...op, anticipos }));
    const cliente = futuras[0].concepto.replace(/^Cobro de /, '').replace(/ \(.*$/, '');
    opciones.push({ id: 'descontar', titulo: `Descontá ${anticipos.length} factura${anticipos.length > 1 ? 's' : ''} de ${cliente}`,
      detalle: `Adelantás ${millones(acum)} que ibas a cobrar más tarde. Costo estimado ≈ $${fmt(costoDesc)} a la tasa de descuento de documentos (${ctx.citas.documentos.valor}, ${ctx.citas.documentos.periodo}). ${resto < 0 ? `Queda un faltante de ${millones(resto)}.` : 'Cubre este hueco completo.'}`,
      costo: Math.round(costoDesc), cubre: resto >= 0, citas: [ctx.citas.documentos],
      costoPeriodo: neto > 0 ? acum / neto - 1 : null, tea: neto > 0 && diasPond > 0 ? teaDescuento(acum, neto, diasPond / acum) : null, estimado: true });
  }

  // C) Adelanto en cuenta corriente: costo = intereses sobre el saldo negativo día a día
  const costoAdel = h.areaNegativa * (ctx.tnaAdelantos / 100) / 365;
  opciones.push({ id: 'adelanto', titulo: 'Acuerdo de descubierto (adelanto en cuenta corriente)',
    detalle: `Cubre todo el hueco: ≈ $${fmt(costoAdel)} de intereses a ${ctx.citas.adelantos.valor} (${ctx.citas.adelantos.periodo}) por ${h.dias} días. La clave: tenerlo acordado antes del ${fechaLarga(h.inicio)}. Sin acuerdo, el banco puede rechazarte pagos y cheques. Te armamos la carpeta para pedirlo hoy.`,
    costo: Math.round(costoAdel), cubre: true, citas: [ctx.citas.adelantos],
    costoPeriodo: (ctx.tnaAdelantos / 100) * h.dias / 365, tea: teaDescubierto(ctx.tnaAdelantos / 100), estimado: true });

  // Orden: primero lo que cubre, después lo más barato
  opciones.sort((a, b) => Number(b.cubre) - Number(a.cubre) || a.costo - b.costo);
  contexto.push(`La diferencia entre adelanto (${ctx.citas.adelantos.valor}) y descuento de documentos (${ctx.citas.documentos.valor}) es de ${(ctx.tnaAdelantos - ctx.tnaDocumentos).toFixed(1).replace('.', ',')} puntos: planificar con tiempo es plata.`);
  const ordenPagos = ordenarPagos(p, falta, h.fechaMinimo);
  return { alerta, opciones, elegida: opciones[0].id, contexto, aviso, ordenPagos };
}
