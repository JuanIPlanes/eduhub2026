// POST /api/analizar: proyecta la caja combinando TODAS las fuentes que lleguen y devuelve pronóstico, recomendación y
// el bloque `dashboard` (lo mismo que /api/dashboard), así la app hace una sola llamada.
//
// Pedido: application/json o multipart/form-data (en multipart, los objetos van como string JSON y los booleanos como "true"):
//   archivos     (solo multipart) uno o varios CSV: extracto, reportes de Mercado Pago, Mis Comprobantes, boletas, nómina.
//   fuente       'mp' => suma los movimientos de la cuenta de Mercado Pago del usuario. El token sale de la cookie cifrada
//                (POST /api/mp/token u OAuth) o de MP_ACCESS_TOKEN: con token se lee SOLO la API real (resumen.mercadopago
//                = 'api', nunca se mezcla historia simulada). Sin token es la simulación de la Carpintería Los Aromos.
//                La API de MP NO trae facturas de ARCA: las facturas vienen de CSV, fotos (`extras`) o `manual`.
//   extras       lista (máx. 50) de comprobantes leídos con /api/foto que se SUMAN a los recibidos/emitidos:
//                  [{ "lado": "recibido" | "emitido", "comprobante": <objeto `comprobante` tal cual lo devuelve /api/foto> }]
//                Validado con zod; uno inválido => 400 { error }. es_comprobante=false se ignora. Un "emitido" entra como
//                cobro a un cliente sin nombre, con plazo estimado de 30 días.
//   manual       { saldo?: { fecha:'yyyy-mm-dd', monto }, movimientos?: [{ fecha, desc, monto con signo }] (máx. 500),
//                  comprobantes?: [mismo shape que extras] }. `saldo` fija el saldo de caja a esa fecha; los movimientos
//                posteriores se aplican encima. Con solo `saldo` la proyección sale degradada (ver resumen.avisos).
//   supuestos    { ventas?: 0,3-1,5 (factor sobre las ventas: 0,8 = -20%), demoraCobros?: 0-60 (días extra de atraso en cobros a clientes) }.
//                Modifica SOLO el pronóstico principal ("¿y si cobro menos?"); en multipart va como string JSON. Fuera de rango => 400.
//   manual.minimoSeguridad  (opcional) saldo mínimo de seguridad en pesos; por defecto 30 días de egresos fijos.
//   demo         true => datos de ejemplo de La Esquina (con `escenario`: 'holgada' y `compromisos`: boletas+nómina). Un JSON
//                sin ninguna otra fuente también es demo (compatibilidad).
//   ia           true => el `mensaje` lo redacta el LLM (tope duro de 8 s; si no responde sale el texto por reglas).
//                Por defecto NO se llama al LLM: mensaje = { texto, fuente: 'reglas' }.
//   pyme         nombre para el dashboard (opcional).
// Salida: resumen { movimientos, recibidos, emitidos, boletas, empleados, ignorados, insumos, extras?, mercadopago?, avisos[],
//     saldo { valor, origen: 'extracto'|'manual'|'mp-api'|'mp-estimado'|'demo'|'sin-saldo', confirmado, nota? } },
//   pronostico (sin eventos de ventas; trae `confiable` y `supuestos`), escenarios { base, pesimista, optimista },
//   alerta (anticipada, o null), minimoSeguridad, score (preliminar), alertas, recomendacion, excedente, mensaje, citas y
//   dashboard { pyme, demo, corte, mensual, etiquetas, ventasMensuales, eventos } (eventos completos, con ventas).
// Regla: un saldo ESTIMADO jamás se presenta como verdadero. Con Mercado Pago real sin saldo manual, el saldo sale de sumar
// 90 días de pagos (no es el saldo real; la API de balance rechaza los tokens normales): origen 'mp-estimado', confirmado:false,
// pronostico.confiable:false, y ni el excedente, ni la recomendación ni las alertas afirman que "te alcanza".
// TODO(cheques): la skill v2 (pasos 4, 6, 7, 9) pide una cartera de cheques/ECHEQ; todavía no se carga (ver resumen.avisos).
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { detectar, parseBoletas, parseComprobantes, parseExtracto, parseNomina, type Comprobante, type Movimiento } from '@/lib/parse';
import { ErrorMP, movimientosMP, saldoMP } from '@/lib/mercadopago';
import { alertaAnticipada, alertar } from '@/lib/alertas';
import { pronosticar } from '@/lib/forecast';
import { recomendar } from '@/lib/advice';
import { contexto } from '@/lib/openarg';
import { mensajeReglas, redactar } from '@/lib/ia';
import { calcularExcedente, reservaOperativa } from '@/lib/excedente';
import { calcularEscenarios } from '@/lib/escenarios';
import { calcularScore, metricasFlujo } from '@/lib/score';
import { diagnosticar } from '@/lib/tesorero';
import { procesarSupuestos } from '@/lib/supuestos';
import { procesarExtras } from '@/lib/extras';
import { procesarManual } from '@/lib/manual';
import { armarDashboard } from '@/lib/dashboard';
import { tokenDeCookie } from '@/lib/mpcookie';

export const runtime = 'nodejs';

const MENSAJE_SIN_DATOS = 'No tengo con qué proyectar todavía. Subí un extracto en CSV (fecha, importe o débito/crédito y saldo; también acepto reportes de Mercado Pago), conectá tu cuenta de Mercado Pago o cargá tu saldo a mano.';
const TIMEOUT_IA_MS = 8000;

const DEMO = ['extracto_banco_esquina.csv', 'mis_comprobantes_recibidos.csv', 'mis_comprobantes_emitidos.csv'];
const DEMO_COMPROMISOS = ['boletas_vencimientos.csv', 'nomina_octubre.csv'];
const PYME_DEMO = 'La Esquina de Nueva Córdoba';
const PYME_MP = 'Carpintería Los Aromos';

type Pedido = { perfil?: string; demo?: boolean; fuente?: string; escenario?: string; compromisos?: boolean; ia?: boolean; extras?: unknown; manual?: unknown; supuestos?: unknown; pyme?: string };
const bool = (v: unknown) => v === true || v === 'true' || v === '1';
const cadena = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);

export async function POST(req: Request) {
  const archivos: { nombre: string; texto: string }[] = [];
  const tipo = req.headers.get('content-type') ?? '';
  const multipart = tipo.includes('multipart/form-data');
  let pedido: Pedido;
  if (multipart) {
    const form = await req.formData();
    for (const v of form.getAll('archivos')) if (v instanceof File) archivos.push({ nombre: v.name, texto: await v.text() });
    const g = (k: string) => cadena(form.get(k));
    pedido = { perfil: g('perfil'), demo: bool(g('demo')), fuente: g('fuente'), escenario: g('escenario'), compromisos: bool(g('compromisos')), ia: bool(g('ia')), extras: g('extras'), manual: g('manual'), supuestos: g('supuestos'), pyme: g('pyme') };
  } else {
    const j = await req.json().catch(() => ({}));
    pedido = { perfil: cadena(j.perfil), demo: bool(j.demo), fuente: j.fuente, escenario: j.escenario, compromisos: bool(j.compromisos), ia: bool(j.ia), extras: j.extras, manual: j.manual, supuestos: j.supuestos, pyme: typeof j.pyme === 'string' ? j.pyme : undefined };
  }

  const extras = pedido.extras === undefined || pedido.extras === null ? null : procesarExtras(pedido.extras);
  if (extras && !extras.ok) return NextResponse.json({ error: extras.error }, { status: 400 });
  const manualR = pedido.manual === undefined || pedido.manual === null ? null : procesarManual(pedido.manual);
  if (manualR && !manualR.ok) return NextResponse.json({ error: manualR.error }, { status: 400 });
  const manual = manualR?.ok ? manualR.manual : null;
  const supR = pedido.supuestos === undefined || pedido.supuestos === null ? null : procesarSupuestos(pedido.supuestos);
  if (supR && !supR.ok) return NextResponse.json({ error: supR.error }, { status: 400 });
  const supuestos = supR?.ok ? supR.supuestos : {};
  const conSupuestos = (supuestos.ventas ?? 1) !== 1 || (supuestos.demoraCobros ?? 0) > 0;

  // Perfil simulado: una de las 6 pymes de public/demo/perfiles. El id se valida contra index.json (no se arma una ruta con texto libre).
  let perfil: { id: string; nombre: string; saldoActual: number; pista?: string; rubro?: string } | null = null;
  if (pedido.perfil) {
    try {
      const lista = JSON.parse(await fs.readFile(path.join(process.cwd(), 'public/demo/perfiles/index.json'), 'utf8')) as { id: string; nombre: string; saldoActual: number; pista?: string; rubro?: string }[];
      perfil = lista.find(x => x.id === pedido.perfil) ?? null;
    } catch { perfil = null; }
    if (!perfil) return NextResponse.json({ error: 'Perfil de demostración desconocido.' }, { status: 400 });
  }
  const dirMP = perfil ? `public/demo/perfiles/${perfil.id}` : 'public/demo/mp';
  const mp = pedido.fuente === 'mp' || !!perfil;
  const tokenMP = mp ? tokenDeCookie(req) ?? process.env.MP_ACCESS_TOKEN : undefined;
  const mpReal = !perfil && !!tokenMP && process.env.MP_MODO !== 'simulacion';
  // Un JSON sin ninguna otra fuente sigue siendo la demo (compatibilidad con el chat de /demo).
  const demoFiles = !mp && (pedido.demo === true || (!multipart && !manual));
  const simulado = demoFiles || (mp && !mpReal);
  const leer = (dir: string, nombre: string) => fs.readFile(path.join(process.cwd(), dir, nombre), 'utf8');
  const cargar = async (dir: string, lista: string[]) => { archivos.push(...await Promise.all(lista.map(async nombre => ({ nombre, texto: await leer(dir, nombre) })))); };
  const compromisos = pedido.compromisos || perfil ? DEMO_COMPROMISOS : [];
  if (demoFiles) await cargar(pedido.escenario === 'holgada' ? 'public/demo/holgada' : 'public/demo', [...DEMO, ...compromisos]);
  // Simulación de MP: pagos simulados + (si no subieron archivos) la ARCA/boletas/nómina de la carpintería.
  else if (mp && !mpReal && !archivos.length) await cargar(dirMP, [...DEMO.slice(1), ...compromisos]);

  const movs: Movimiento[] = [], rec: Comprobante[] = [], emi: Comprobante[] = [], boletas = [], nomina = [], ignorados: string[] = [];
  let origenMP: string | undefined, userMP: number | undefined;
  if (mp) {
    try {
      const r = await movimientosMP(tokenMP, async () => JSON.parse(await leer(dirMP, 'mp_pagos.json')));
      movs.push(...r.movs); origenMP = r.origen; userMP = r.userId;
    } catch (e) {
      const status = e instanceof ErrorMP ? e.status : undefined;
      const sinPermiso = status === 401 || status === 403;
      const msg = sinPermiso ? 'Mercado Pago rechazó el token (inválido, vencido o sin permisos). Volvé a conectarlo.' : e instanceof Error ? e.message : 'error desconocido';
      return NextResponse.json({ error: `No pude leer Mercado Pago: ${msg}` }, { status: sinPermiso ? 400 : 502 });
    }
  }
  for (const a of archivos) {
    const t = detectar(a.texto);
    if (t === 'extracto') movs.push(...parseExtracto(a.texto));
    else if (t === 'recibidos') rec.push(...parseComprobantes(a.texto));
    else if (t === 'emitidos') emi.push(...parseComprobantes(a.texto));
    else if (t === 'boletas') boletas.push(...parseBoletas(a.texto));
    else if (t === 'nomina') nomina.push(...parseNomina(a.texto));
    else ignorados.push(a.nombre);
  }
  if (extras?.ok) { rec.push(...extras.recibidos); emi.push(...extras.emitidos); }
  if (manual) { movs.push(...manual.movimientos); rec.push(...manual.recibidos); emi.push(...manual.emitidos); }
  if (!movs.length && !manual?.saldo && !rec.length && !emi.length) {
    const error = origenMP === 'api' && !archivos.length ? 'Mercado Pago no devolvió pagos en los últimos 90 días. Subí un extracto o cargá tu saldo a mano.' : MENSAJE_SIN_DATOS;
    return NextResponse.json({ error, ignorados }, { status: 400 });
  }

  // Saldo de partida y si está confirmado (un saldo estimado jamás se presenta como verdadero).
  const hoyAR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
  let saldoAncla = manual?.saldo;
  let origenSaldo: 'extracto' | 'manual' | 'mp-api' | 'mp-estimado' | 'demo' | 'sin-saldo', confirmado: boolean, notaSaldo: string | undefined;
  if (manual?.saldo) { origenSaldo = 'manual'; confirmado = true; }
  else if (perfil) { origenSaldo = 'mp-estimado'; confirmado = false; notaSaldo = `Estimado: suma los pagos de 90 días de la cuenta de ${perfil.nombre} (ficticia). No es el saldo real: confirmalo, como harías con tu cuenta.`; }
  else if (simulado) { origenSaldo = 'demo'; confirmado = true; notaSaldo = 'Datos de ejemplo: el saldo no es de una cuenta real.'; }
  else if (movs.some(m => m.saldo !== undefined)) { origenSaldo = 'extracto'; confirmado = true; }
  else if (mpReal && origenMP === 'api') {
    const real = userMP !== undefined && tokenMP ? await saldoMP(tokenMP, userMP) : null;
    if (real !== null) { saldoAncla = { fecha: hoyAR, monto: real }; origenSaldo = 'mp-api'; confirmado = true; notaSaldo = 'Saldo disponible informado por Mercado Pago.'; }
    else { origenSaldo = 'mp-estimado'; confirmado = false; notaSaldo = 'Estimado: suma los pagos y cobros de los últimos 90 días. No es tu saldo real (no incluye el saldo previo, retiros a banco ni gastos con tarjeta) y Mercado Pago no permite leerlo con este permiso. Cargá tu saldo de hoy para confirmarlo.'; }
  }
  else if (movs.length) { origenSaldo = 'extracto'; confirmado = false; notaSaldo = 'El extracto no trae columna de saldo: se estimó sumando los movimientos. Cargá tu saldo de hoy para confirmarlo.'; }
  else { origenSaldo = 'sin-saldo'; confirmado = false; notaSaldo = 'No hay saldo ni movimientos: se parte de $0. Cargá tu saldo de hoy.'; }

  const avisos: string[] = [];
  if (!confirmado && notaSaldo) avisos.push(`Saldo sin confirmar: ${notaSaldo}`);
  avisos.push('Sin cartera de cheques/ECHEQ ni datos de deudas: no se proyectan cheques recibidos o emitidos ni su riesgo de rechazo, y el score y la orden de pagos quedan sin esos datos.');
  if (origenMP === 'api' && !rec.length && !emi.length) avisos.push('Mercado Pago solo informa los pagos y cobros de la cuenta: no trae facturas de ARCA. Para proyectar cobros y pagos pendientes subí "Mis Comprobantes" (CSV), sacales foto o cargalos a mano.');
  if (origenMP === 'simulacion' && !perfil) avisos.push('Estás viendo la simulación de Mercado Pago (Carpintería Los Aromos). Conectá tu cuenta con un token para usar tus datos reales.');
  if (!movs.length) avisos.push('Sin historial de movimientos: la proyección arranca del saldo y las facturas cargadas, pero no incluye gastos recurrentes ni ventas aprendidos. Subí un extracto o conectá Mercado Pago para que sea más precisa.');
  else {
    const fechas = movs.map(m => m.fecha).sort();
    const dias = Math.round((Date.parse(fechas[fechas.length - 1]) - Date.parse(fechas[0])) / 86400000) + 1;
    if (dias < 60) avisos.push(`El historial cubre ${dias} días: con menos de 3 meses no se detectan gastos recurrentes ni estacionalidad de ventas. Sumá un extracto más largo para mejorar la precisión.`);
    if (!confirmado && origenSaldo === 'extracto') avisos.push('Sin saldo informado: el saldo inicial se estima sumando los movimientos. Cargá tu saldo de hoy a mano para anclar la proyección.');
  }
  if (!rec.length && !emi.length) avisos.push('Sin facturas (ARCA, CSV o foto): no se proyectan cobros ni pagos pendientes de clientes y proveedores.');

  const ctx = contexto();
  const fechasComp = [...rec, ...emi].map(c => c.fecha).sort();
  const hoySinMovs = !movs.length && !saldoAncla ? { hoy: fechasComp[fechasComp.length - 1] } : {};
  const opBase = { ipcMensual: ctx.ipcMensual, boletas, nomina, saldoInicial: saldoAncla, saldoConfirmado: confirmado, ...hoySinMovs };
  // Principal = base + `supuestos` del pedido; los escenarios base/pesimista/optimista no los usan (lib/escenarios.ts).
  const p = pronosticar(movs, rec, emi, { ...opBase, ventasFactor: supuestos.ventas, demoraCobros: supuestos.demoraCobros });
  const esc = calcularEscenarios(movs, rec, emi, opBase, p, conSupuestos);
  const r = recomendar(p, movs, rec, emi, ctx, { boletas, nomina });
  const al = alertar(p, boletas);
  const minimoSeguridad = manual?.minimoSeguridad ?? reservaOperativa(p).monto;
  const alerta = alertaAnticipada(p, esc.pron.pesimista, minimoSeguridad);
  const flujo = metricasFlujo(p, movs, emi);
  const score = calcularScore(p, movs, emi, flujo);
  const excedente = calcularExcedente(p, ctx, { reserva: manual?.minimoSeguridad, score, flujo });
  // Tesorero (adaptado de la rama de Leiva): veredicto de luz verde/amarilla/roja, plan de acción y escalera de excedentes por plazo.
  const tesoreria = diagnosticar(p, excedente, r, al, ctx, { score, flujo });
  // El LLM solo entra si el pedido trae ia:true (con tope duro); por defecto el mensaje sale de las reglas.
  const mensaje = pedido.ia ? await redactar(p, r, al, TIMEOUT_IA_MS) : mensajeReglas(r);
  const insumos = archivos.map(a => ({ nombre: a.nombre, sha256: createHash('sha256').update(a.texto).digest('hex') }));
  const pyme = pedido.pyme?.trim().slice(0, 80) || (perfil ? perfil.nombre : demoFiles ? PYME_DEMO : mp && !mpReal ? PYME_MP : '');

  return NextResponse.json({
    resumen: { ...(perfil && { perfil: { id: perfil.id, nombre: perfil.nombre, rubro: perfil.rubro, pista: perfil.pista, saldoSugerido: perfil.saldoActual } }), movimientos: movs.length, recibidos: rec.length, emitidos: emi.length, boletas: boletas.length, empleados: nomina.length, ignorados, insumos, avisos, ...(extras?.ok && { extras: extras.recibidos.length + extras.emitidos.length }), ...(origenMP && { mercadopago: origenMP }),
      saldo: { valor: Math.round(p.saldoInicial), origen: origenSaldo, confirmado, ...(notaSaldo && { nota: notaSaldo }) } },
    pronostico: { ...p, eventos: p.eventos.filter(e => e.categoria !== 'ventas') },
    escenarios: esc.escenarios, alerta, minimoSeguridad, score, tesoreria,
    alertas: al, recomendacion: r, excedente, mensaje, citas: ctx.citas,
    dashboard: armarDashboard(p, movs, pyme, simulado),
  });
}
