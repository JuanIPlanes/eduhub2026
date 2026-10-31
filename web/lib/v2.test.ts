// Skill v2: saldo honesto, escenarios, alerta anticipada, costo real, orden de pagos, excedente/score y bloque Researcher.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pronosticar, sumar, type Dia, type Evento, type Pronostico } from './forecast';
import { recomendar, teaDescuento, teaDescubierto, teaProntoPago } from './advice';
import { alertar, alertaAnticipada } from './alertas';
import { calcularExcedente, reservaOperativa } from './excedente';
import { calcularEscenarios } from './escenarios';
import { calcularScore, metricasFlujo } from './score';
import { procesarSupuestos } from './supuestos';
import { procesarManual } from './manual';
import { saldoMP, limpiarCacheSaldoMP, limpiarCacheMP } from './mercadopago';
import { contexto } from './openarg';
import { POST } from '../app/api/analizar/route';
import { parseComprobantes, parseExtracto, type Movimiento } from './parse';

const leer = (f: string) => fs.readFileSync(`public/demo/${f}`, 'utf8');
const ctx = contexto();
const HOY = '2026-11-01';
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const demo = () => ({ movs: parseExtracto(leer('extracto_banco_esquina.csv')), rec: parseComprobantes(leer('mis_comprobantes_recibidos.csv')), emi: parseComprobantes(leer('mis_comprobantes_emitidos.csv')) });

// Pronóstico sintético con saldos diarios dados.
function pron(saldos: number[], eventos: Evento[] = [], confiable = true): Pronostico {
  const serie: Dia[] = Array.from({ length: 120 }, (_, i) => ({ fecha: sumar(HOY, i + 1), saldo: saldos[Math.min(i, saldos.length - 1)], entradas: 0, salidas: 0 }));
  const min = serie.reduce((a, b) => (b.saldo < a.saldo ? b : a));
  const ini = serie.findIndex(d => d.saldo < 0);
  const hueco = ini < 0 ? null : { inicio: serie[ini].fecha, fin: null, minimo: min.saldo, fechaMinimo: min.fecha, dias: serie.length - ini, areaNegativa: -min.saldo * 5 };
  return { hoy: HOY, saldoInicial: saldos[0], ipcMensual: ctx.ipcMensual, serie, eventos, horizontes: [{ dias: 90, saldoFinal: serie[89].saldo, minimo: min.saldo, fechaMinimo: min.fecha }], hueco, huecos: hueco ? [hueco] : [], aprendizajes: [], contrapartes: [], historia: [], confiable };
}
const sueldos = (): Evento[] => [0, 1, 2, 3].map(k => ({ fecha: sumar(HOY, 5 + 30 * k), concepto: 'Sueldos', categoria: 'sueldos', monto: -1_000_000, origen: 'recurrente' }));

beforeEach(() => { limpiarCacheSaldoMP(); limpiarCacheMP(); });

// --- 1) Saldo honesto ---

test('saldoMP: 403/404/red => null sin lanzar; con balance usa available_balance', async () => {
  const f = (status: number, cuerpo: unknown = {}) => (async () => json(cuerpo, status)) as unknown as typeof fetch;
  assert.equal(await saldoMP('t1', 7, { fetch: f(403), sinCache: true }), null);
  assert.equal(await saldoMP('t1', 7, { fetch: f(404), sinCache: true }), null);
  assert.equal(await saldoMP('t1', 7, { fetch: (async () => { throw new Error('red'); }) as unknown as typeof fetch, sinCache: true }), null);
  assert.equal(await saldoMP('t1', 7, { fetch: f(200, { available_balance: 1300 }), sinCache: true }), 1300);
  assert.equal(await saldoMP('t1', 7, { fetch: f(200, { available_balance: 'x' }), sinCache: true }), null);
  let url = '';
  await saldoMP('t1', 7, { fetch: (async (u: string) => { url = u; return json({}, 403); }) as unknown as typeof fetch, sinCache: true });
  assert.match(url, /\/users\/7\/mercadopago_account\/balance$/);
});

test('pronosticar: saldoConfirmado:false => confiable:false; por defecto true', () => {
  const m: Movimiento[] = [{ fecha: '2026-10-15', desc: 'ACRED MERCADO PAGO', monto: 5000 }];
  assert.equal(pronosticar(m, [], [], { ipcMensual: 0.02, saldoConfirmado: false }).confiable, false);
  assert.equal(pronosticar(m, [], [], { ipcMensual: 0.02 }).confiable, true);
});

test('excedente con saldo sin confirmar: hay:false y el motivo pide confirmar', () => {
  const e = calcularExcedente(pron([10_000_000], sueldos(), false), ctx);
  assert.equal(e.hay, false);
  assert.equal(e.motivo, 'Confirmá tu saldo actual para calcularlo');
  assert.equal(e.monto, 0);
  assert.equal(e.paraResearcher, null);
  assert.equal(calcularExcedente(pron([10_000_000], sueldos(), true), ctx).hay, true);
});

test('recomendar y alertas con saldo sin confirmar: nunca afirman "no te quedás sin plata"', () => {
  const sin = pron([10_000_000], sueldos(), false);
  const r = recomendar(sin, [], [], [], ctx);
  assert.doesNotMatch(r.alerta, /no te quedás sin caja|no te quedás sin plata/);
  assert.match(r.alerta, /sin confirmar/);
  const al = alertar(sin);
  const a = al.alertas.find(x => x.tipo === 'saldo_sin_confirmar');
  assert.ok(a && /sin confirmar/.test(a.titulo));
  const hueco = pron([1_000_000, 500_000, -200_000], [], false);
  assert.match(recomendar(hueco, [], [], [], ctx).alerta, /Estimado/);
  assert.match(alertar(hueco).alertas.find(x => x.tipo === 'hueco')!.titulo, /sin confirmar/);
  assert.match(recomendar(pron([10_000_000], sueldos(), true), [], [], [], ctx).alerta, /no te quedás sin caja/);
});

// --- 2) Escenarios y supuestos ---

test('supuestos: validación con zod y rangos', () => {
  assert.deepEqual(procesarSupuestos({ ventas: 0.8, demoraCobros: 20 }), { ok: true, supuestos: { ventas: 0.8, demoraCobros: 20 } });
  assert.deepEqual(procesarSupuestos('{"ventas":1.2}'), { ok: true, supuestos: { ventas: 1.2 } });
  for (const malo of ['no json', { ventas: 0.2 }, { ventas: 1.6 }, { demoraCobros: -1 }, { demoraCobros: 61 }, { ventas: 'poco' }]) assert.equal(procesarSupuestos(malo).ok, false, JSON.stringify(malo));
});

test('pronosticar: ventasFactor y demoraCobros mueven ventas y cobros; exponen supuestos', () => {
  const { movs, rec, emi } = demo();
  const op = { ipcMensual: ctx.ipcMensual };
  const base = pronosticar(movs, rec, emi, op);
  const menos = pronosticar(movs, rec, emi, { ...op, ventasFactor: 0.8 });
  const suma = (p: Pronostico, o: string) => p.eventos.filter(e => e.origen === o).reduce((s, e) => s + e.monto, 0);
  assert.ok(Math.abs(suma(menos, 'proyección de ventas') / suma(base, 'proyección de ventas') - 0.8) < 0.01);
  const tarde = pronosticar(movs, rec, emi, { ...op, demoraCobros: 30 });
  const prim = (p: Pronostico) => p.eventos.filter(e => e.origen === 'factura pendiente' && e.monto > 0).map(e => e.fecha).sort()[0];
  assert.ok(prim(tarde) > prim(base));
  assert.ok(tarde.serie[44].saldo <= base.serie[44].saldo);
  assert.equal(base.supuestos!.ventasFactor, 1);
  assert.equal(menos.supuestos!.ventasFactor, 0.8);
  assert.equal(tarde.supuestos!.demoraCobros, 30);
  assert.equal(base.supuestos!.ventasCrecenConIpc, true);
  assert.ok(base.supuestos!.notas.some(n => /inflación/.test(n)));
});

test('escenarios: pesimista <= base <= optimista, shape y supuestos fijos; los del pedido no los tocan', () => {
  const { movs, rec, emi } = demo();
  const op = { ipcMensual: ctx.ipcMensual };
  const principal = pronosticar(movs, rec, emi, { ...op, ventasFactor: 0.5 });
  const e = calcularEscenarios(movs, rec, emi, op, principal, true).escenarios;
  assert.ok(e.pesimista.minimo <= e.base.minimo && e.base.minimo <= e.optimista.minimo, `${e.pesimista.minimo} ${e.base.minimo} ${e.optimista.minimo}`);
  assert.equal(e.base.serie.length, 120);
  assert.deepEqual(Object.keys(e.base.serie[0]), ['fecha', 'saldo']);
  assert.deepEqual(e.base.supuestos, { ventas: 1, demoraCobros: 0 });
  assert.deepEqual(e.pesimista.supuestos, { ventas: 0.9, demoraCobros: 15 });
  assert.deepEqual(e.optimista.supuestos, { ventas: 1.1, demoraCobros: 0 });
  const sin = calcularEscenarios(movs, rec, emi, op, pronosticar(movs, rec, emi, op), false).escenarios;
  assert.deepEqual(sin.base, e.base);
  if (e.base.hueco) assert.deepEqual(Object.keys(e.base.hueco), ['inicio', 'dias', 'minimo']);
});

test('rendimiento: la demo responde en < 2 s con el pronóstico, los 3 escenarios y la recomendación', () => {
  const { movs, rec, emi } = demo();
  const op = { ipcMensual: ctx.ipcMensual };
  const t = Date.now();
  const p = pronosticar(movs, rec, emi, op);
  calcularEscenarios(movs, rec, emi, op, p, false);
  recomendar(p, movs, rec, emi, ctx);
  assert.ok(Date.now() - t < 2000, `${Date.now() - t} ms`);
});

// --- 3) Alerta anticipada ---

test('alerta anticipada: hueco en 30 días del base, formato de la skill y días de margen', () => {
  const ev: Evento[] = [{ fecha: sumar(HOY, 17), concepto: 'Pago a PROVEEDOR SA', categoria: 'proveedores', monto: -900_000, origen: 'factura pendiente' }];
  const saldos = [...Array(16).fill(500_000), ...Array(104).fill(-400_000)];
  const a = alertaAnticipada(pron(saldos, ev), pron(saldos, ev), 0)!;
  assert.equal(a.tipo, 'hueco'); assert.equal(a.escenario, 'base');
  assert.equal(a.fecha, sumar(HOY, 17)); assert.equal(a.diasMargen, 17); assert.equal(a.faltante, 400_000);
  assert.match(a.texto, /^El \S+ \d+\/\d+ te faltarían \$400\.000 para pagar Pago a PROVEEDOR SA\. Tenés 17 días para resolverlo\. Estas son tus opciones, de la más barata a la más cara\.$/);
  assert.equal(a.confirmado, true);
});

test('alerta anticipada: hueco a 45 días solo en el pesimista, y mínimo de seguridad', () => {
  const ok = pron([5_000_000]);
  const mal = pron([...Array(44).fill(5_000_000), ...Array(76).fill(-1)]);
  const a = alertaAnticipada(ok, mal, 0)!;
  assert.equal(a.escenario, 'pesimista'); assert.match(a.texto, /^Si cobrás 15 días más tarde/);
  assert.equal(alertaAnticipada(ok, ok, 0), null);
  const m = alertaAnticipada(ok, ok, 6_000_000)!;
  assert.equal(m.tipo, 'minimo'); assert.equal(m.faltante, 1_000_000);
  assert.match(m.texto, /mínimo de seguridad \(\$6\.000\.000\)/);
  const tarde = pron([...Array(34).fill(5_000_000), -5]);
  assert.equal(alertaAnticipada(tarde, ok, 0), null);
  assert.equal(alertaAnticipada(ok, tarde, 0)!.escenario, 'pesimista');
  const sc = alertaAnticipada(pron([-1], [], false), ok, 0)!;
  assert.equal(sc.confirmado, false); assert.match(sc.texto, /sin confirmar/);
});

test('minimoSeguridad: 30 días de egresos fijos, ajustable en manual', () => {
  assert.equal(reservaOperativa(pron([1], sueldos())).monto, 1_000_000);
  assert.equal(reservaOperativa(pron([1], sueldos())).criterio, '30 días de egresos fijos');
  assert.equal(calcularExcedente(pron([10_000_000], sueldos()), ctx, { reserva: 4_000_000 }).colchon, 4_000_000);
  const ok = procesarManual({ minimoSeguridad: 250000 });
  assert.ok(ok.ok && ok.manual.minimoSeguridad === 250000);
  assert.equal(procesarManual({ minimoSeguridad: -5 }).ok, false);
});

// --- 4) Costo real y orden de pagos ---

test('fórmulas de costo (paso 5)', () => {
  const nominal = 1_000_000, tna = 0.5, n = 60, neto = nominal * (1 - tna * n / 365);
  assert.ok(Math.abs(neto - 917_808.2) < 1);
  assert.ok(Math.abs(teaDescuento(nominal, neto, n) - (Math.pow(nominal / neto, 365 / n) - 1)) < 1e-12);
  assert.ok(Math.abs(teaDescubierto(0.5) - (Math.pow(1 + 0.5 / 365, 365) - 1)) < 1e-12);
  assert.ok(Math.abs(teaProntoPago(0.03, 60, 30) - 0.447) < 0.005); // "alrededor del 45%"
});

test('recomendar: cada opción trae tea, costoPeriodo y estimado; ordenPagos por prioridad de la skill', () => {
  const { movs, rec, emi } = demo();
  const p = pronosticar(movs, rec, emi, { ipcMensual: ctx.ipcMensual });
  assert.ok(p.hueco);
  const r = recomendar(p, movs, rec, emi, ctx);
  for (const o of r.opciones) {
    assert.ok('tea' in o && 'costoPeriodo' in o && typeof o.estimado === 'boolean', o.id);
    if (o.id !== 'renegociar') assert.ok(o.tea! > 0 && o.costoPeriodo! > 0 && o.estimado);
  }
  const adel = r.opciones.find(o => o.id === 'adelanto')!;
  assert.ok(Math.abs(adel.tea! - teaDescubierto(ctx.tnaAdelantos / 100)) < 1e-12);
  const desc = r.opciones.find(o => o.id === 'descontar');
  if (desc) assert.ok(desc.tea! > ctx.tnaDocumentos / 100);
  assert.ok(r.ordenPagos && r.ordenPagos.items.length > 0);
  const pr = r.ordenPagos!.items.map(i => i.prioridad);
  assert.deepEqual(pr, [...pr].sort((a, b) => a - b));
  for (const i of r.ordenPagos!.items) { assert.equal(i.postergable, i.prioridad >= 3); assert.equal(i.diasEstirables === 0, i.prioridad === 1); }
  assert.equal(recomendar(pron([10_000_000], sueldos()), [], [], [], ctx).ordenPagos, null);
});

// --- 5) Excedente, bloque Researcher y score ---

test('bloque paraResearcher: claves exactas del paso 12 y sin nombres de contrapartes', () => {
  const h = {
    movs: parseExtracto(leer('holgada/extracto_banco_esquina.csv')), rec: parseComprobantes(leer('holgada/mis_comprobantes_recibidos.csv')), emi: parseComprobantes(leer('holgada/mis_comprobantes_emitidos.csv')),
  };
  const p = pronosticar(h.movs, h.rec, h.emi, { ipcMensual: ctx.ipcMensual });
  const flujo = metricasFlujo(p, h.movs, h.emi);
  const score = calcularScore(p, h.movs, h.emi, flujo);
  const e = calcularExcedente(p, ctx, { score, flujo });
  assert.equal(e.hay, true);
  const b = e.paraResearcher!;
  assert.deepEqual(Object.keys(b), ['fecha_corte', 'reserva_operativa', 'deuda_cara_vigente', 'compromisos_proximos', 'excedentes', 'escalera_de_vencimientos', 'preferencia_de_destino', 'riesgo_de_cobros', 'score', 'estabilidad_flujo']);
  assert.equal(b.fecha_corte, p.hoy);
  assert.deepEqual(b.reserva_operativa, { monto: e.colchon, moneda: 'ARS', criterio: '30 días de egresos fijos' });
  assert.deepEqual(Object.keys(b.excedentes[0]), ['monto', 'moneda', 'disponible_desde', 'se_necesita_el', 'dias_horizonte', 'uso_futuro', 'liquidez_requerida']);
  assert.equal(b.excedentes[0].monto, e.monto);
  assert.deepEqual(Object.keys(b.score), ['valor', 'categoria', 'preliminar']);
  assert.ok(['alta', 'media', 'baja'].includes(b.estabilidad_flujo) && ['bajo', 'medio', 'alto'].includes(b.riesgo_de_cobros));
  assert.ok(b.compromisos_proximos.length > 0 && b.escalera_de_vencimientos.length > 0);
  const txt = JSON.stringify(b).toUpperCase();
  for (const c of [...p.contrapartes, ...h.rec, ...h.emi]) {
    assert.ok(!txt.includes(c.nombre.toUpperCase()), `nombre filtrado: ${c.nombre}`);
    assert.ok(!txt.includes(c.cuit), `cuit filtrado: ${c.cuit}`);
  }
  assert.ok(b.compromisos_proximos.some(c => /^Proveedor [A-Z]/.test(c.tipo)));
});

test('score: preliminar, pilares con peso de la skill, sin datos = null; rango se ensancha sin historia o sin confirmar', () => {
  const { movs, rec, emi } = demo();
  const p = pronosticar(movs, rec, emi, { ipcMensual: ctx.ipcMensual });
  const s = calcularScore(p, movs, emi);
  assert.equal(s.preliminar, true);
  assert.deepEqual(s.pilares.map(x => [x.nombre, x.peso]), [['Liquidez', 25], ['Endeudamiento y solvencia', 20], ['Calidad del flujo', 20], ['Comportamiento de pago', 20], ['Formalidad y trazabilidad', 15]]);
  assert.equal(s.pilares[1].valor, null); assert.equal(s.pilares[3].valor, null);
  assert.ok(s.valor !== null && s.rango[0] <= s.valor && s.valor <= s.rango[1] && s.rango[1] - s.rango[0] >= 12);
  assert.ok(['A', 'B', 'C', 'D', 'E'].includes(s.categoria!));
  assert.ok(s.faltan.some(f => /cheques/i.test(f)));
  const ancho = (x: typeof s) => x.rango[1] - x.rango[0];
  const sinConf = calcularScore({ ...p, confiable: false }, movs, emi);
  assert.ok(ancho(sinConf) > ancho(s) && sinConf.faltan.some(f => /Saldo confirmado/.test(f)));
  const poca = movs.filter(m => m.fecha > sumar(p.hoy, -40));
  assert.ok(ancho(calcularScore(p, poca, emi)) > ancho(s));
  assert.ok(calcularScore(p, poca, emi).faltan.some(f => /3 meses/.test(f)));
  const vacio = calcularScore(pron([0]), [], []);
  assert.equal(vacio.valor, null); assert.equal(vacio.categoria, null);
  assert.ok(!/género|genero|edad|sexo|origen|domicilio|nacionalidad/i.test(JSON.stringify(s.pilares)));
});

// --- Integración: la ruta ---

async function post(body: unknown) {
  const r = await POST(new Request('http://x/api/analizar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: r.status, j: await r.json() as any };
}

test('ruta: demo trae resumen.saldo, escenarios, score, minimoSeguridad y responde rápido', async () => {
  await post({ demo: true });
  const t = Date.now();
  const { status, j } = await post({ demo: true });
  assert.equal(status, 200);
  assert.ok(Date.now() - t < 2000, `${Date.now() - t} ms`);
  assert.equal(j.resumen.saldo.origen, 'demo'); assert.equal(j.resumen.saldo.confirmado, true);
  assert.equal(j.pronostico.confiable, true);
  assert.deepEqual(Object.keys(j.escenarios), ['base', 'pesimista', 'optimista']);
  assert.ok(typeof j.minimoSeguridad === 'number' && j.score.preliminar === true);
  assert.ok('alerta' in j);
  assert.ok(j.resumen.avisos.some((a: string) => /cheques/i.test(a)));
});

test('ruta: supuestos modifican solo el principal; inválidos => 400', async () => {
  const a = (await post({ demo: true })).j, b = (await post({ demo: true, supuestos: { ventas: 0.6, demoraCobros: 30 } })).j;
  assert.deepEqual(a.escenarios, b.escenarios);
  assert.notDeepEqual(a.pronostico.serie, b.pronostico.serie);
  assert.equal(b.pronostico.supuestos.ventasFactor, 0.6); assert.equal(b.pronostico.supuestos.demoraCobros, 30);
  assert.equal((await post({ demo: true, supuestos: { ventas: 3 } })).status, 400);
  assert.equal((await post({ demo: true, supuestos: { demoraCobros: 90 } })).status, 400);
});

test('ruta: manual.saldo es el ancla confirmada; con minimoSeguridad propio', async () => {
  const { j } = await post({ manual: { saldo: { fecha: '2026-10-31', monto: 1300 }, minimoSeguridad: 500 } });
  assert.equal(j.resumen.saldo.origen, 'manual'); assert.equal(j.resumen.saldo.confirmado, true); assert.equal(j.resumen.saldo.valor, 1300);
  assert.equal(j.pronostico.confiable, true); assert.equal(j.minimoSeguridad, 500);
});

test('ruta: Mercado Pago real sin saldo => mp-estimado, confiable:false y nada afirma que alcanza', async () => {
  const original = globalThis.fetch;
  const pago = (id: number, monto: number) => ({ id, status: 'approved', operation_type: 'regular_payment', date_created: '2026-10-20T10:00:00.000-03:00', date_approved: '2026-10-20T10:00:00.000-03:00', transaction_amount: monto, collector_id: 7 });
  const llamadas: string[] = [];
  const montar = (balance: Response) => {
    globalThis.fetch = (async (u: string | URL | Request) => {
      const url = new URL(String(u)); llamadas.push(url.pathname);
      if (url.pathname === '/users/me') return json({ id: 7 });
      if (url.pathname.endsWith('/balance')) return balance;
      return json({ paging: { total: 3, limit: 100, offset: 0 }, results: [pago(1, 3_000_000), pago(2, 2_000_000), pago(3, 1_177_407)] });
    }) as typeof fetch;
  };
  const antes = { t: process.env.MP_ACCESS_TOKEN, m: process.env.MP_MODO };
  process.env.MP_ACCESS_TOKEN = 'tok-v2-estimado'; delete process.env.MP_MODO;
  try {
    montar(json({ message: 'forbidden' }, 403));
    const { status, j } = await post({ fuente: 'mp' });
    assert.equal(status, 200);
    assert.ok(llamadas.some(x => x.endsWith('/balance')), 'intentó leer el saldo real');
    assert.equal(j.resumen.saldo.origen, 'mp-estimado'); assert.equal(j.resumen.saldo.confirmado, false);
    assert.equal(j.pronostico.confiable, false);
    assert.equal(j.excedente.hay, false); assert.equal(j.excedente.motivo, 'Confirmá tu saldo actual para calcularlo');
    assert.doesNotMatch(j.recomendacion.alerta, /no te quedás sin caja/);
    assert.ok(j.alertas.alertas.some((a: any) => a.tipo === 'saldo_sin_confirmar'));
    assert.ok(j.resumen.avisos.some((a: string) => /Saldo sin confirmar/.test(a)));
    assert.equal(j.score.rango[1] - j.score.rango[0] >= 20, true);
    limpiarCacheSaldoMP(); limpiarCacheMP(); process.env.MP_ACCESS_TOKEN = 'tok-v2-real';
    montar(json({ available_balance: 1300 }));
    const ok = (await post({ fuente: 'mp' })).j;
    assert.equal(ok.resumen.saldo.origen, 'mp-api'); assert.equal(ok.resumen.saldo.confirmado, true); assert.equal(ok.resumen.saldo.valor, 1300);
    assert.equal(ok.pronostico.confiable, true);
    limpiarCacheMP();
    const man = (await post({ fuente: 'mp', manual: { saldo: { fecha: '2026-10-31', monto: 2000 } } })).j;
    assert.equal(man.resumen.saldo.origen, 'manual'); assert.equal(man.resumen.saldo.confirmado, true);
  } finally {
    globalThis.fetch = original;
    if (antes.t === undefined) delete process.env.MP_ACCESS_TOKEN; else process.env.MP_ACCESS_TOKEN = antes.t;
    if (antes.m !== undefined) process.env.MP_MODO = antes.m;
  }
});

test('ruta: perfiles simulados arrancan con saldo sin confirmar; al confirmarlo cada uno da su situación', async () => {
  const ids = JSON.parse(fs.readFileSync('public/demo/perfiles/index.json', 'utf8')) as { id: string; saldoActual: number; situacion: string }[];
  assert.equal(ids.length, 6);
  for (const x of ids) {
    const a = await post({ perfil: x.id });
    assert.equal(a.status, 200, x.id);
    assert.equal(a.j.resumen.saldo.origen, 'mp-estimado'); assert.equal(a.j.resumen.saldo.confirmado, false);
    assert.equal(a.j.resumen.perfil.saldoSugerido, x.saldoActual);
    assert.equal(a.j.excedente.hay, false, 'sin confirmar nunca hay excedente');
    const hoy = a.j.pronostico.hoy as string;
    const b = await post({ perfil: x.id, manual: { saldo: { fecha: hoy, monto: x.saldoActual } } });
    assert.equal(b.j.resumen.saldo.confirmado, true);
    if (x.situacion === 'holgada') assert.equal(b.j.excedente.hay, true, x.id);
    if (x.situacion === 'hueco-cercano') assert.ok(b.j.pronostico.hueco, x.id);
  }
  const mala = await post({ perfil: '../../etc/passwd' });
  assert.equal(mala.status, 400);
});
