// Excedente de caja: cuánta plata sobra de forma segura y por cuánto tiempo, y qué CLASES de colocación
// (nunca emisores ni productos con nombre) encajan en esa ventana. La derivación a una ALyC es aparte y con consentimiento.
import { fmt, sumar, type Pronostico } from './forecast';
import type { Cita, Contexto } from './openarg';
import { estabilidadFlujo, riesgoCobros, type MetricasFlujo, type Score } from './score';

export type ClaseColocacion = {
  id: 'liquidez_diaria' | 'plazo_fijo' | 'caucion' | 'renta_fija_corta';
  nombre: string;                       // genérico: "Fondo de liquidez diaria", "Plazo fijo", "Caución", "Renta fija a corto plazo"
  plazoMinDias: number;
  liquidez: 'inmediata' | '24 h' | 'al vencimiento';
  riesgo: 'bajo' | 'medio';
  tnaRef: number | null;                // % TNA de referencia (BCRA vía OpenARG) o null si no hay dato
  encaja: boolean;                      // el plazo mínimo entra en la ventana sin tocar el colchón
  nota: string;                         // una línea en lenguaje simple
  cita?: Cita;
};

export type Excedente = {
  hay: boolean;
  saldoActual: number;
  colchon: number;                      // reserva intocable (p. ej. un mes de egresos fijos)
  monto: number;                        // excedente invertible con seguridad (0 si no hay)
  ventana: { desde: string; hasta: string; dias: number } | null;
  minimoProyectado: number;
  rendimiento: { tna: number; pesos: number; realPesos: number } | null; // pesos en la ventana; real = descontada la inflación proyectada
  clases: ClaseColocacion[];
  colchonCriterio?: string;             // cómo se calculó la reserva (30 días de egresos fijos, o lo que fijó el usuario)
  motivo?: string;                      // por qué no hay excedente
  aviso: string;
  // Bloque del paso 12 para el Analista Researcher / ALyC. Solo se entrega CON CONSENTIMIENTO del usuario. Seudonimizado:
  // sin nombres ni CUIT de contrapartes. null si no hay excedente.
  paraResearcher?: BloqueResearcher | null;
};

export type BloqueResearcher = {
  fecha_corte: string;
  reserva_operativa: { monto: number; moneda: 'ARS'; criterio: string };
  deuda_cara_vigente: { tipo: string; saldo: number; tea: number }[];
  compromisos_proximos: { tipo: string; monto: number; moneda: 'ARS'; fecha_de_pago: string }[];
  excedentes: { monto: number; moneda: 'ARS'; disponible_desde: string; se_necesita_el: string; dias_horizonte: number; uso_futuro: string; liquidez_requerida: 'inmediata' | '24-48 hs' | 'plazo' }[];
  escalera_de_vencimientos: { fecha: string; monto_necesario: number; origen: 'sueldos' | 'cheques emitidos' | 'impuestos' | 'otro' }[];
  preferencia_de_destino: 'banco' | 'alyc' | 'indistinto';
  riesgo_de_cobros: 'bajo' | 'medio' | 'alto';
  score: { valor: number; categoria: string; preliminar: boolean };
  estabilidad_flujo: 'alta' | 'media' | 'baja';
};


// Reserva operativa (skill v2, 8.2 y 12): 30 días de egresos fijos, ajustable por el usuario. Nunca se invierte.
// Los fijos salen de los eventos proyectados (sueldos, cargas, alquiler, impuestos y servicios: nómina cargada, boletas o
// recurrentes aprendidos del extracto), llevados a 30 días. Sin ningún egreso fijo detectado (p. ej. solo pagos a proveedores
// de Mercado Pago) se usa como respaldo el 25% del egreso mensual medio y el criterio lo dice.
const PCT_EGRESO_MENSUAL = 0.25;
const FIJOS = new Set(['sueldos', 'cargas_sociales', 'alquiler', 'impuestos', 'servicios']);
const DIAS_MES = 30.4;
const CRITERIO = '30 días de egresos fijos';
const AVISO = 'Esto es una estimación con tus números, no asesoramiento financiero. Antes de colocar plata, comparás condiciones con la entidad que elijas y no tocás la reserva.';

const fechaCorta = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const pesos = (n: number) => `$${fmt(n)}`;

export function reservaOperativa(p: Pronostico): { monto: number; criterio: string } {
  const fijos = p.eventos.filter(e => e.monto < 0 && FIJOS.has(e.categoria)).reduce((s, e) => s - e.monto, 0) / Math.max(1, p.serie.length / 30);
  if (fijos > 0) return { monto: Math.round(fijos), criterio: CRITERIO };
  const egresos = p.serie.reduce((s, d) => s + d.salidas, 0) / Math.max(1, p.serie.length / DIAS_MES);
  return { monto: Math.round(egresos * PCT_EGRESO_MENSUAL), criterio: '25% del egreso mensual (no se detectaron egresos fijos)' };
}

export type OpcionesExcedente = { reserva?: number; score?: Score; flujo?: MetricasFlujo };

export function calcularExcedente(p: Pronostico, ctx: Contexto, op: OpcionesExcedente = {}): Excedente {
  const saldoActual = Math.round(p.saldoInicial);
  const res = reservaOperativa(p);
  const colchon = op.reserva ?? res.monto;
  const criterio = op.reserva !== undefined ? 'monto fijado por el usuario' : res.criterio;
  const confiable = p.confiable !== false;
  const serie = p.serie;

  // Ventana segura: hasta el último día antes de que el saldo proyectado baje del colchón (tope: el horizonte).
  let k = serie.findIndex(d => d.saldo < colchon);
  if (k < 0) k = serie.length;
  // Sin egresos aprendidos la reserva da 0 y todo el saldo parecería excedente: sin historial no se calcula.
  const sinHistorial = colchon <= 0;
  const sinVentana = !confiable || sinHistorial || k === 0 || saldoActual < colchon;
  const tramo = sinVentana ? [] : serie.slice(0, k);
  const minimoProyectado = tramo.length ? Math.min(saldoActual, ...tramo.map(d => d.saldo)) : Math.min(saldoActual, ...serie.map(d => d.saldo));
  const monto = sinVentana ? 0 : Math.max(0, minimoProyectado - colchon);
  const ventana = !sinVentana && monto > 0 ? { desde: p.hoy, hasta: tramo[tramo.length - 1].fecha, dias: tramo.length } : null;

  const cPF = ctx.citas.plazoFijo;
  const tna = ctx.tnaPlazoFijo;
  const def: Omit<ClaseColocacion, 'encaja'>[] = [
    { id: 'liquidez_diaria', nombre: 'Fondo de liquidez diaria', plazoMinDias: 0, liquidez: 'inmediata', riesgo: 'bajo', tnaRef: tna,
      nota: 'Rescatás cuando quieras. La tasa mostrada es la del plazo fijo, que usamos como referencia aproximada: la real varía y no tenemos un dato propio.', cita: cPF },
    { id: 'plazo_fijo', nombre: 'Plazo fijo', plazoMinDias: 30, liquidez: 'al vencimiento', riesgo: 'bajo', tnaRef: tna,
      nota: 'Plata inmovilizada al menos 30 días a tasa conocida de antemano.', cita: cPF },
    { id: 'caucion', nombre: 'Caución', plazoMinDias: 1, liquidez: 'al vencimiento', riesgo: 'bajo', tnaRef: null,
      nota: 'Préstamo garantizado a 1-7 días, para sobrantes muy cortos. No tenemos una tasa de referencia cargada: consultala al momento de operar.' },
    { id: 'renta_fija_corta', nombre: 'Renta fija a corto plazo', plazoMinDias: 60, liquidez: '24 h', riesgo: 'medio', tnaRef: null,
      nota: 'Instrumentos de deuda de corto plazo: pueden rendir más, pero el precio varía y podés perder en el camino. Sin tasa de referencia cargada.' },
  ];
  const clases: ClaseColocacion[] = def.map(c => ({ ...c, encaja: !!ventana && c.plazoMinDias <= ventana.dias }));

  let rendimiento: Excedente['rendimiento'] = null;
  let aviso = AVISO;
  if (ventana) {
    // Mejor clase que encaja con tasa de referencia; si empatan, el plazo fijo (dato real) antes que el proxy del fondo.
    const orden: ClaseColocacion['id'][] = ['plazo_fijo', 'liquidez_diaria'];
    const mejor = clases.filter(c => c.encaja && c.tnaRef !== null)
      .sort((a, b) => b.tnaRef! - a.tnaRef! || orden.indexOf(a.id) - orden.indexOf(b.id))[0];
    if (mejor) {
      const bruto = monto * mejor.tnaRef! / 100 * ventana.dias / 365;
      const inflacion = monto * (Math.pow(1 + ctx.ipcMensual, ventana.dias / DIAS_MES) - 1);
      rendimiento = { tna: mejor.tnaRef!, pesos: Math.round(bruto), realPesos: Math.round(bruto - inflacion) };
      if (rendimiento.realPesos < 0) {
        mejor.nota += ` Ojo: con la inflación proyectada, en ${ventana.dias} días perdés ${pesos(-rendimiento.realPesos)} de poder de compra (nominalmente ganás ${pesos(rendimiento.pesos)}); en el último semestre el plazo fijo rindió ${ctx.citas.pfReal.valor} real.`;
      }
    }
    if (ventana.dias < serie.length) {
      aviso += ` La ventana es corta: el ${fechaCorta(serie[k].fecha)} la caja proyectada baja de la reserva.`;
    }
  }

  let motivo: string | undefined;
  if (!ventana) {
    if (!confiable) motivo = 'Confirmá tu saldo actual para calcularlo';
    else if (sinHistorial) motivo = 'Todavía no tengo tus gastos: con solo el saldo no puedo saber cuánto te sobra de forma segura. Cargá movimientos o conectá Mercado Pago para calcularlo.';
    else if (saldoActual < colchon || k === 0) motivo = `Hoy tu caja (${pesos(saldoActual)}) no supera la reserva de ${pesos(colchon)} (${criterio}). No hay excedente para colocar.`;
    else motivo = `Tu caja no queda por encima de la reserva de ${pesos(colchon)} en el tramo seguro. No hay excedente para colocar.`;
  }

  const base = { hay: !!ventana, saldoActual, colchon, colchonCriterio: criterio, monto: Math.round(monto), ventana, minimoProyectado: Math.round(minimoProyectado), rendimiento, clases, ...(motivo && { motivo }), aviso };
  return { ...base, paraResearcher: ventana && op.score && op.score.valor !== null && op.flujo ? armarBloque(p, base, op.score, op.flujo) : null };
}

// ---- Bloque del paso 12 (seudonimizado) ----
const OBLIGACIONES = new Set(['sueldos', 'aguinaldo', 'cargas_sociales', 'impuestos', 'alquiler', 'servicios', 'proveedores', 'otros']);
const TIPO: Record<string, string> = { sueldos: 'sueldos', aguinaldo: 'aguinaldo', cargas_sociales: 'cargas sociales', impuestos: 'impuestos', alquiler: 'alquiler', servicios: 'servicios', proveedores: 'proveedor', otros: 'otro pago' };
const letra = (i: number) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : '');

function armarBloque(p: Pronostico, e: Omit<Excedente, 'paraResearcher'>, score: Score, flujo: MetricasFlujo): BloqueResearcher {
  // Contrapartes seudonimizadas por orden de aparición: "Proveedor A", "Proveedor B"... (nunca nombre ni CUIT).
  const alias = new Map<string, string>();
  const nombre = (cuit?: string) => { if (!cuit) return 'proveedor'; if (!alias.has(cuit)) alias.set(cuit, `Proveedor ${letra(alias.size)}`); return alias.get(cuit)!; };
  const salidas = p.eventos.filter(x => x.monto < 0 && OBLIGACIONES.has(x.categoria));
  const compromisos = salidas.filter(x => x.fecha <= sumar(p.hoy, 30)).slice(0, 20)
    .map(x => ({ tipo: x.categoria === 'proveedores' ? nombre(x.cuit) : TIPO[x.categoria] ?? 'otro pago', monto: Math.round(-x.monto), moneda: 'ARS' as const, fecha_de_pago: x.fecha }));
  const v = e.ventana!;
  const total = p.serie.length;
  const seNecesita = v.dias < total ? sumar(v.hasta, 1) : v.hasta;
  const proximo = v.dias < total ? salidas.filter(x => x.fecha >= seNecesita && x.fecha <= sumar(seNecesita, 5)).sort((a, b) => a.monto - b.monto)[0] : undefined;
  const origen = (c: string): 'sueldos' | 'impuestos' | 'otro' => (c === 'sueldos' || c === 'aguinaldo' || c === 'cargas_sociales' ? 'sueldos' : c === 'impuestos' ? 'impuestos' : 'otro');
  const escalera = new Map<string, { fecha: string; monto_necesario: number; origen: 'sueldos' | 'impuestos' | 'otro' }>();
  for (const x of salidas) { const o = origen(x.categoria), k = `${x.fecha}|${o}`; const c = escalera.get(k) ?? { fecha: x.fecha, monto_necesario: 0, origen: o }; c.monto_necesario += Math.round(-x.monto); escalera.set(k, c); }
  return {
    fecha_corte: p.hoy,
    reserva_operativa: { monto: e.colchon, moneda: 'ARS', criterio: e.colchonCriterio ?? CRITERIO },
    deuda_cara_vigente: [], // sin datos de deuda cargados (adelantos, préstamos): ver resumen.avisos
    compromisos_proximos: compromisos,
    excedentes: [{ monto: e.monto, moneda: 'ARS', disponible_desde: p.hoy, se_necesita_el: seNecesita, dias_horizonte: v.dias,
      uso_futuro: proximo ? (TIPO[proximo.categoria] ?? 'otro pago') : 'sin necesidad identificada en el horizonte',
      liquidez_requerida: v.dias <= 3 ? 'inmediata' : v.dias <= 14 ? '24-48 hs' : 'plazo' }],
    escalera_de_vencimientos: [...escalera.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 15),
    preferencia_de_destino: 'indistinto',
    riesgo_de_cobros: riesgoCobros(flujo),
    score: { valor: score.valor!, categoria: score.categoria!, preliminar: score.preliminar },
    estabilidad_flujo: estabilidadFlujo(flujo),
  };
}
