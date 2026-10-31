import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticar, escalera, type OpcionesTesoreria } from './tesorero';
import { analizarMercado, investigar } from './researcher';
import { calcularExcedente } from './excedente';
import { sumar, type Dia, type Evento, type Hueco, type Pronostico } from './forecast';
import type { Recomendacion } from './advice';
import { contexto } from './openarg';
import type { MetricasFlujo, Score } from './score';

const ctx = contexto();
const HOY = '2026-11-01';
const rec: Recomendacion = { alerta: '', opciones: [], elegida: null, contexto: [], aviso: '', ordenPagos: null };
const scoreB: Score = { valor: 75, rango: [68, 82], categoria: 'B', preliminar: true, pilares: [], faltan: ['Cartera de cheques y ECHEQ'] };
const flujoOk: MetricasFlujo = { mesesHistoria: 6, cv: 0.1, mesesNegativos: 0, concentracionTop: 0.2, plazoCobroDias: 20 };
const op: OpcionesTesoreria = { score: scoreB, flujo: flujoOk };
const historia = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map(mes => ({ mes, entradas: 3_000_000, salidas: 2_800_000 }));

// Pronóstico sintético: saldos diarios (se repite el último hasta 120 días), sueldos mensuales de 1.000.000 y egresos diarios.
function pron(saldoInicial: number, saldos: number[], huecos: Hueco[] = []): Pronostico {
  const serie: Dia[] = Array.from({ length: 120 }, (_, i) => ({ fecha: sumar(HOY, i + 1), saldo: saldos[Math.min(i, saldos.length - 1)], entradas: 0, salidas: 90_000 }));
  const eventos: Evento[] = [0, 1, 2, 3].map(k => ({ fecha: sumar(HOY, 5 + 30 * k), concepto: 'Sueldos', categoria: 'sueldos', monto: -1_000_000, origen: 'recurrente' }));
  return { hoy: HOY, saldoInicial, ipcMensual: ctx.ipcMensual, serie, eventos, horizontes: [], hueco: huecos[0] ?? null, huecos, aprendizajes: [], contrapartes: [], historia };
}

test('con hueco: el tesorero no da luz verde, no pasa nada al researcher y propone qué hacer', () => {
  const h: Hueco = { inicio: sumar(HOY, 20), fin: sumar(HOY, 25), minimo: -500_000, fechaMinimo: sumar(HOY, 22), dias: 5, areaNegativa: 2_000_000 };
  const p = pron(2_000_000, [...Array(19).fill(1_000_000), -500_000, 1_000_000], [h]);
  const t = diagnosticar(p, calcularExcedente(p, ctx), rec, null, ctx, op);
  assert.equal(t.veredicto.decision, 'no_invertir');
  assert.equal(t.bloque, null);
  assert.ok(t.acciones.length > 0 && t.acciones.length <= 3);
});

test('caja holgada: luz verde y la escalera nunca toca la reserva', () => {
  const p = pron(20_000_000, [...Array(40).fill(18_000_000), ...Array(60).fill(12_000_000), 15_000_000]);
  const ex = calcularExcedente(p, ctx);
  const t = diagnosticar(p, ex, rec, null, ctx, op);
  assert.equal(t.veredicto.decision, 'invertir');
  const b = t.bloque!;
  const total = b.excedentes.reduce((s, x) => s + x.monto, 0);
  assert.equal(total, 20_000_000 - b.reserva_operativa.monto, 'la escalera reparte todo lo que hay sobre la reserva');
  // Regla de oro: la plata de cada tramo está libre durante todo su plazo.
  for (const x of b.excedentes) {
    const min = Math.min(...p.serie.filter(d => d.fecha < x.se_necesita_el).map(d => d.saldo));
    const masLargos = b.excedentes.filter(y => y.dias_horizonte >= x.dias_horizonte).reduce((s, y) => s + y.monto, 0);
    assert.ok(min - b.reserva_operativa.monto >= masLargos - 1, `tramo a ${x.dias_horizonte} días excede lo libre`);
  }
});

test('escalera: tramos ordenados del más corto al más largo', () => {
  const p = pron(20_000_000, [...Array(10).fill(15_000_000), 12_000_000]);
  const e = escalera(p, 5_000_000);
  // 15 M sobre la reserva: 8 M se usan antes del día 30 (el saldo baja a 15 M y después a 12 M); 7 M quedan libres los 120 días.
  assert.deepEqual(e.map(x => x.monto), [8_000_000, 7_000_000]);
  assert.ok(e[0].dias_horizonte < e[1].dias_horizonte);
});

test('researcher: categorías por horizonte, sin nombres propios, y el perfil lo limita la caja', () => {
  const p = pron(20_000_000, [...Array(10).fill(15_000_000), 12_000_000]);
  const t = diagnosticar(p, calcularExcedente(p, ctx), rec, null, ctx, op);
  const inf = investigar(t.bloque!, t.tasas, 'agresivo');
  assert.equal(inf.tramos[0].horizonte, 'menos_30');
  assert.ok(!inf.tramos[0].clases.some(c => c.nombre === 'Plazo fijo'), 'el plazo fijo (30 días mínimo) no entra en menos de 30 días');
  assert.ok(inf.tramos.every(x => x.clases.every(c => !/acci[oó]n|cedear/i.test(c.nombre))), 'sin renta variable con horizonte < 12 meses');
  assert.ok(inf.tramos.every(x => x.clases.every(c => !/\b(banco|galicia|santander|al30|gd30)\b/i.test(c.nombre))));
  assert.match(inf.aviso, /no una recomendación personalizada/);
  const fragil = investigar({ ...t.bloque!, score: { valor: 40, categoria: 'D', preliminar: true } }, t.tasas, 'agresivo');
  assert.equal(fragil.perfil.final, 'conservador');
});

test('researcher: lectura del mercado argentino con fuente en cada dato', () => {
  const p = pron(20_000_000, [20_000_000]);
  const t = diagnosticar(p, calcularExcedente(p, ctx), rec, null, ctx, op);
  const l = analizarMercado(t.tasas);
  assert.equal(l.length, 6);
  assert.ok(l.every(x => x.cita.url.startsWith('http') && x.cita.periodo && x.lectura.length > 20));
  assert.equal(l.find(x => x.cita === ctx.citas.adelantos)!.tono, 'neg');
});

test('saldo sin confirmar: no hay luz verde aunque "sobre" plata, y la primera acción es confirmarlo', () => {
  const p = { ...pron(20_000_000, [20_000_000]), confiable: false };
  const t = diagnosticar(p, calcularExcedente(p, ctx), rec, null, ctx, op);
  assert.equal(t.veredicto.decision, 'no_invertir');
  assert.equal(t.bloque, null);
  assert.match(t.acciones[0].titulo, /Confirmá tu saldo/);
});

test('score D o E: la caja está frágil y no se arma el bloque', () => {
  const p = pron(20_000_000, [...Array(40).fill(18_000_000), 15_000_000]);
  const t = diagnosticar(p, calcularExcedente(p, ctx), rec, null, ctx, { ...op, score: { ...scoreB, valor: 30, categoria: 'E' } });
  assert.equal(t.veredicto.decision, 'no_invertir');
  assert.equal(t.bloque, null);
});
