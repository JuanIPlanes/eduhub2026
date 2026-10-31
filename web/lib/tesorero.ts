// Tesorero (skill "Analista de Caja"): decide si hay luz verde para colocar el excedente y, si no, qué hacer primero.
// Adaptado de la rama tesorero-researcher (Agustín Leiva): el score ya no se calcula acá (se usa el de lib/score.ts, una sola
// fuente de verdad) y la decisión respeta el saldo sin confirmar. Determinístico: el LLM no interviene en puntajes ni montos.
import { ETIQUETA, type Categoria } from './categorias';
import type { Recomendacion } from './advice';
import type { Alertas } from './alertas';
import type { Excedente } from './excedente';
import { fmt, type Pronostico } from './forecast';
import type { Contexto } from './openarg';
import { estabilidadFlujo, type Categoria as Categoria5, type MetricasFlujo, type Score } from './score';

export type { Categoria5 };
export type Decision = 'invertir' | 'cautela' | 'no_invertir';
export type Accion = { titulo: string; porque: string; impacto: string; plazo: string };
export type Estabilidad = 'alta' | 'media' | 'baja';

// Bloque de salida hacia el Researcher (paso 12 de la skill v2). Tramos por plazo, seudonimizado, solo con consentimiento.
export type ExcedenteTramo = { monto: number; moneda: 'ARS'; disponible_desde: string; se_necesita_el: string; dias_horizonte: number; uso_futuro: string };
export type BloqueResearcher = {
  fecha_corte: string;
  reserva_operativa: { monto: number; moneda: 'ARS'; criterio: string };
  deuda_cara_vigente: { tipo: string; saldo: number; tea: number }[];
  excedentes: ExcedenteTramo[];
  score: { valor: number; categoria: Categoria5; preliminar: boolean };
  estabilidad_flujo: Estabilidad;
};

export type Tesoreria = {
  veredicto: { decision: Decision; titulo: string; motivo: string };
  acciones: Accion[];
  bloque: BloqueResearcher | null;
  estabilidad: Estabilidad;
  // Datos de mercado (BCRA/INDEC vía OpenARG) que el Researcher usa para asignar y para su lectura del mercado argentino.
  tasas: Pick<Contexto, 'ipcMensual' | 'tnaPlazoFijo' | 'tnaAdelantos' | 'tnaDocumentos' | 'pfRealSemestre' | 'irregularidad' | 'irregularidadAntes'> & { citas: Contexto['citas'] };
  aviso: string;
};

const AVISO = 'Este diagnóstico es orientativo y no reemplaza el análisis de tu contador ni la evaluación de un banco. El score es interno y preliminar: no es una calificación crediticia oficial ni reemplaza la Central de Deudores del BCRA.';
const millones = (n: number) => `$${(Math.abs(n) / 1e6).toFixed(1).replace('.', ',')} M`;
const dm = (s: string) => `${+s.slice(8, 10)}/${+s.slice(5, 7)}`;

/** Escalera de excedentes: cuánta plata sobra por encima de la reserva y hasta cuándo, en tramos de 30, 90 y 120 días.
 *  Lo que se necesita antes va al tramo corto (más líquido); nunca se le asigna a un tramo más plata de la que sobra en
 *  TODO su plazo. */
export function escalera(p: Pronostico, reserva: number, cortes = [30, 90]): ExcedenteTramo[] {
  const serie = p.serie;
  if (!serie.length) return [];
  const hs = [...cortes.filter(c => c < serie.length), serie.length];
  const minHasta = (h: number) => {
    let m = { saldo: p.saldoInicial, fecha: p.hoy };
    for (const d of serie.slice(0, h)) if (d.saldo < m.saldo) m = d;
    return m;
  };
  const disponible = (h: number) => Math.max(0, minHasta(h).saldo - reserva);
  const tramos: ExcedenteTramo[] = [];
  let previo = Math.max(0, p.saldoInicial - reserva);
  hs.forEach((h, i) => {
    const libreTodoElPlazo = disponible(h);
    // La plata que sobra hasta el corte anterior pero no hasta este se necesita cuando el saldo toca su mínimo en este tramo.
    const monto = previo - libreTodoElPlazo;
    const lim = minHasta(h).fecha;
    if (monto > 0) tramos.push(tramo(p, monto, lim));
    previo = libreTodoElPlazo;
    if (i === hs.length - 1 && libreTodoElPlazo > 0) {
      tramos.push({ monto: Math.round(libreTodoElPlazo), moneda: 'ARS', disponible_desde: p.hoy, se_necesita_el: serie[serie.length - 1].fecha, dias_horizonte: serie.length, uso_futuro: `sin destino previsto en los ${serie.length} días proyectados` });
    }
  });
  // Tramos chicos (< 3% del total o < $100.000) se suman al tramo anterior, que es más corto y por lo tanto más prudente.
  const total = tramos.reduce((s, t) => s + t.monto, 0);
  const out: ExcedenteTramo[] = [];
  for (const t of tramos) {
    if (out.length && (t.monto < 100_000 || t.monto < total * 0.03)) out[out.length - 1].monto += t.monto;
    else out.push({ ...t });
  }
  return out;
}

function tramo(p: Pronostico, monto: number, fecha: string): ExcedenteTramo {
  const dias = Math.max(1, Math.round((Date.parse(fecha) - Date.parse(p.hoy)) / 86400000));
  // Para qué se necesita: las salidas más grandes de la semana que termina en ese mínimo.
  const desde = new Date(Date.parse(fecha) - 7 * 86400000).toISOString().slice(0, 10);
  const porCat = new Map<Categoria, number>();
  for (const e of p.eventos) if (e.monto < 0 && e.fecha > desde && e.fecha <= fecha) porCat.set(e.categoria, (porCat.get(e.categoria) ?? 0) - e.monto);
  const top = [...porCat].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => ETIQUETA[c].toLowerCase());
  return { monto: Math.round(monto), moneda: 'ARS', disponible_desde: p.hoy, se_necesita_el: fecha, dias_horizonte: dias, uso_futuro: top.length ? top.join(' y ') : 'pagos de esa semana' };
}

export type OpcionesTesoreria = { score?: Score; flujo?: MetricasFlujo };

export function diagnosticar(p: Pronostico, ex: Excedente | null, r: Recomendacion, al: Alertas | null, ctx: Contexto, op: OpcionesTesoreria = {}): Tesoreria {
  const serie = p.serie;
  const reserva = ex?.colchon ?? 0;
  const saldo = p.saldoInicial;
  const score = op.score;
  const cat: Categoria5 | null = score?.categoria ?? null;
  const valor = score?.valor ?? null;
  const preliminar = score?.preliminar ?? true;
  const estabilidad: Estabilidad = op.flujo ? estabilidadFlujo(op.flujo) : 'media';
  const vencidas = al?.resumen.vencidas ?? 0;

  // --- Veredicto del tesorero ---
  let decision: Decision, titulo: string, motivo: string;
  if (p.confiable === false) {
    decision = 'no_invertir'; titulo = 'Todavía no: confirmá tu saldo';
    motivo = 'Tu saldo está sin confirmar: con una estimación no se puede saber cuánto te sobra. Confirmalo y lo calculo.';
  } else if (p.hueco) {
    decision = 'no_invertir'; titulo = 'Todavía no: primero cubrí el hueco';
    motivo = `El ${dm(p.hueco.inicio)} te falta plata (llegás a ${millones(p.hueco.minimo).replace('$', '−$')}). Colocar plata ahora sería poner en riesgo pagos que ya tenés.`;
  } else if (!ex?.hay || ex.monto <= 0) {
    decision = 'no_invertir'; titulo = 'Todavía no: primero armá la reserva';
    motivo = ex?.motivo ?? 'Tu caja proyectada no deja plata por encima de la reserva.';
  } else if (cat === 'D' || cat === 'E') {
    decision = 'no_invertir'; titulo = 'Todavía no: la caja está frágil';
    motivo = `El score da ${valor} (${cat}). Aunque hoy sobre algo, conviene usarlo para ordenar la caja antes de inmovilizarlo.`;
  } else if (cat === null || cat === 'C' || estabilidad === 'baja') {
    decision = 'cautela'; titulo = 'Luz amarilla: solo opciones conservadoras';
    motivo = `Te sobran ${millones(ex.monto)} sobre la reserva, pero ${cat === null ? 'todavía no hay datos para medir el score' : cat === 'C' ? `el score es ${valor} (C)` : 'tus ingresos varían mucho'}. Las categorías quedan limitadas al perfil conservador.`;
  } else {
    decision = 'invertir'; titulo = 'Luz verde: hay excedente para colocar';
    motivo = `Sin huecos en ${serie.length} días, reserva de ${millones(reserva)} cubierta y score ${valor} (${cat}). Se arma el detalle por plazos.`;
  }

  // --- Plan de acción (top 3), por impacto ---
  const acciones: Accion[] = [];
  if (p.confiable === false) acciones.push({ titulo: 'Confirmá tu saldo actual', porque: 'Sin el saldo real, la proyección y el excedente son estimaciones.', impacto: 'Habilita el cálculo del excedente', plazo: 'Hoy' });
  if (p.hueco) {
    const o = r.opciones.find(x => x.id === r.elegida) ?? r.opciones[0];
    if (o) acciones.push({ titulo: o.titulo, porque: o.detalle, impacto: o.cubre ? `Evitás ${p.hueco.dias} días en rojo` : 'Achica el faltante', plazo: `Antes del ${dm(p.hueco.inicio)}` });
    const adel = r.opciones.find(x => x.id === 'adelanto');
    if (adel && adel !== o) acciones.push({ titulo: 'Dejá acordado un descubierto antes de necesitarlo', porque: 'Un descubierto acordado es mucho más barato y seguro que uno no acordado, y evita rechazos de pagos.', impacto: `Costo estimado $${fmt(adel.costo)} si lo usás`, plazo: 'Esta semana' });
  }
  if (vencidas) acciones.push({ titulo: 'Pagá o regularizá las boletas vencidas', porque: 'Suman intereses por mora y bajan tu calificación en el banco.', impacto: 'Mejora la previsión de pagos', plazo: 'Lo antes posible' });
  if (reserva > 0 && saldo < reserva) {
    const semanal = (reserva - saldo) / 12;
    acciones.push({ titulo: `Armá la reserva de ${millones(reserva)}`, porque: 'Es un mes de gastos fijos: la plata que te salva si un cliente paga tarde.', impacto: `Separando ${millones(semanal)} por semana, la completás en 3 meses`, plazo: '12 semanas' });
  }
  if (op.flujo?.cv != null && op.flujo.cv >= 0.5) acciones.push({ titulo: 'Bajá la dependencia de pocos meses buenos', porque: 'Tus ingresos varían mucho; sumar clientes o ventas regulares hace la caja previsible.', impacto: 'Sube la calidad del flujo', plazo: '3 a 6 meses' });
  if (decision !== 'no_invertir') {
    acciones.push({ titulo: 'Mantené la reserva quieta y líquida', porque: `Los ${millones(reserva)} de reserva no se colocan en nada con riesgo de precio: son tu seguro.`, impacto: 'Protege los pagos de los próximos 30 días', plazo: 'Siempre' });
    if (score?.faltan.length) acciones.push({ titulo: 'Cargá lo que falta para afinar el score', porque: score.faltan[0], impacto: 'Score más completo y confiable', plazo: '10 minutos' });
  }
  acciones.push({ titulo: 'Consultá tu situación en la Central de Deudores del BCRA', porque: 'Es lo primero que mira un banco. La consulta por CUIT es pública y gratuita.', impacto: 'Sabés con qué te van a evaluar', plazo: 'Hoy' });

  // --- Bloque para el Researcher (solo con luz verde o amarilla) ---
  const bloque: BloqueResearcher | null = decision === 'no_invertir' ? null : {
    fecha_corte: p.hoy,
    reserva_operativa: { monto: reserva, moneda: 'ARS', criterio: ex?.colchonCriterio ?? '30 días de egresos fijos' },
    deuda_cara_vigente: [],
    excedentes: escalera(p, reserva),
    score: { valor: valor ?? 0, categoria: cat ?? 'C', preliminar },
    estabilidad_flujo: estabilidad,
  };

  return {
    veredicto: { decision, titulo, motivo },
    acciones: acciones.slice(0, 3),
    bloque, estabilidad,
    tasas: { ipcMensual: ctx.ipcMensual, tnaPlazoFijo: ctx.tnaPlazoFijo, tnaAdelantos: ctx.tnaAdelantos, tnaDocumentos: ctx.tnaDocumentos,
      pfRealSemestre: ctx.pfRealSemestre, irregularidad: ctx.irregularidad, irregularidadAntes: ctx.irregularidadAntes, citas: ctx.citas },
    aviso: AVISO,
  };
}
