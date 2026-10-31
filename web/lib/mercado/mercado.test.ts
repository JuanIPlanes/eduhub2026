// Prueba obligatoria del módulo Mercado ficticio: recalcula todo desde precios, fundamentales y dividendos
// y lo compara con metricas_snapshot (tolerancia 0,01 en puntajes y 0,0005 en ratios).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { calcularMercado, caidaMaxima, nivelDe, percentiles, type Nivel } from './calculo';
import { cargarBase, cargarSnapshot, parsearCsv } from './datos';
import { ErrorPedido, simular, validarPedido } from './simulador';
import { lecturaEnPalabras } from './lectura';

const base = cargarBase();
const snap = cargarSnapshot();
const filas = calcularMercado(base);

const RATIOS = ['ret_1m', 'ret_3m', 'ret_6m', 'ret_12m', 'vol_anual', 'max_dd_12m', 'beta_12m', 'pe', 'ev_ebitda',
  'deuda_neta_ebitda', 'margen_ebitda', 'roe', 'crec_ingresos', 'div_yield'] as const;
const PUNTAJES = { score_valuacion: 'valuacion', score_calidad: 'calidad', score_crecimiento: 'crecimiento', score_solidez: 'solidez', score_riesgo: 'riesgo', score_total: 'total' } as const;
const PROHIBIDO = /(?<!\p{L})(comprá|compralo|vendé|vendelo|te conviene|atractiva|con cautela)(?!\p{L})/iu;
const LECTURA: Record<string, Nivel> = { Atractiva: 'alto', Neutral: 'medio', 'Con cautela': 'bajo' };

test('la base tiene 12 empresas ficticias con ticker -F y 253+ cierres', () => {
  assert.equal(base.empresas.length, 12);
  assert.equal(Object.keys(snap).length, 12);
  for (const e of base.empresas) {
    assert.match(e.ticker, /^[A-Z]{4}-F$/);
    assert.ok(base.precios[e.ticker].length >= 253);
  }
});

test('métricas recalculadas = metricas_snapshot', () => {
  const dif: string[] = [];
  for (const f of filas) {
    const s = snap[f.empresa.ticker];
    assert.ok(s, `falta ${f.empresa.ticker} en el snapshot`);
    const comparar = (k: string, calc: number | null, esp: number | null, tol: number) => {
      if (calc === null || esp === null) { if (calc !== esp) dif.push(`${f.empresa.ticker} ${k}: ${calc} vs ${esp}`); return; }
      if (Math.abs(calc - esp) > tol) dif.push(`${f.empresa.ticker} ${k}: calculado ${calc} vs snapshot ${esp}`);
    };
    comparar('precio', f.metricas.precio, s.precio as number, 0.005);
    for (const k of RATIOS) comparar(k, f.metricas[k], s[k] as number | null, 0.0005);
    comparar('eps_ttm', f.metricas.eps_ttm, s.eps_ttm as number, 0.0005);
    comparar('mkt_cap_mm', f.metricas.mkt_cap_mm, s.mkt_cap_mm as number, 0.05 + 1e-9); // el snapshot redondea a 1 decimal
    for (const [col, k] of Object.entries(PUNTAJES)) comparar(col, f.puntaje[k], s[col] as number, 0.01);
    assert.equal(f.puntaje.nivel, LECTURA[s.lectura as string], `${f.empresa.ticker}: nivel`);
  }
  assert.deepEqual(dif, []);
});

test('DNUB-F no tiene P/E (pérdidas) y puntúa 0 en ese percentil sin romper el orden', () => {
  const d = filas.find(f => f.empresa.ticker === 'DNUB-F')!;
  assert.equal(d.metricas.pe, null);
  assert.ok(d.metricas.eps_ttm < 0);
  const orden = [...filas].sort((a, b) => b.puntaje.total - a.puntaje.total);
  assert.equal(orden.length, 12);
});

test('percentiles: empates promedian y NULL puntúa 0', () => {
  assert.deepEqual(percentiles({ a: 1, b: 2, c: 2, d: null }, true), { a: 0, b: 75, c: 75, d: 0 });
  assert.deepEqual(percentiles({ a: 1, b: 2, c: 3 }, false), { a: 100, b: 50, c: 0 });
  assert.equal(nivelDe(65), 'alto'); assert.equal(nivelDe(64.99), 'medio'); assert.equal(nivelDe(40), 'medio'); assert.equal(nivelDe(39.99), 'bajo');
  assert.equal(caidaMaxima([100, 120, 90, 130]), -0.25);
});

test('parser CSV: comillas, comas internas y CRLF', () => {
  assert.deepEqual(parsearCsv('a,b\r\n"x, ""y""",2\r\n'), [{ a: 'x, "y"', b: '2' }]);
});

const validos = new Set(base.empresas.map(e => e.ticker));
const peor = filas.reduce((a, b) => (b.metricas.max_dd_12m < a.metricas.max_dd_12m ? b : a));
const peorInfo = { ticker: peor.empresa.ticker, nombre: peor.empresa.nombre, max_dd_12m: peor.metricas.max_dd_12m };

test('simulador: una sola empresa al 100% reproduce sus métricas de 12 meses', () => {
  for (const f of filas) {
    const r = simular(base, filas, { horizonte_meses: 24, posiciones: [{ ticker: f.empresa.ticker, peso: 100 }] }, peorInfo);
    assert.ok(r.simulable);
    assert.ok(Math.abs(r.cartera.ret_12m - f.metricas.ret_12m) < 1e-9);
    assert.ok(Math.abs(r.cartera.vol_anual - f.metricas.vol_anual) < 1e-9);
    assert.ok(Math.abs(r.cartera.max_dd_12m - f.metricas.max_dd_12m) < 1e-9);
    assert.equal(r.concentracion.avisos.length, 2); // 100% en una empresa y en un sector
  }
});

test('simulador: horizonte menor a 12 meses no arma cartera y devuelve la peor caída real de la tabla', () => {
  const r = simular(base, filas, { horizonte_meses: 6, posiciones: [{ ticker: 'AURA-F', peso: 100 }] }, peorInfo);
  assert.equal(r.simulable, false);
  if (!r.simulable) { assert.equal(r.peor_caida.ticker, 'DNUB-F'); assert.ok(Math.abs(r.peor_caida.max_dd_12m - -0.7481) < 0.0005); }
});

test('simulador: cartera repartida, monto en pesos y concentración', () => {
  const pedido = validarPedido({ monto: 1_000_000, horizonte_meses: 24, posiciones: [{ ticker: 'aura-f', peso: 50 }, { ticker: 'CALD-F', peso: 25 }, { ticker: 'ISLA-F', peso: 25 }] }, validos);
  const r = simular(base, filas, pedido, peorInfo);
  assert.ok(r.simulable && r.pesos);
  assert.ok(Math.abs(r.pesos.queda_tras_caida_max - 1_000_000 * (1 + r.cartera.max_dd_12m)) < 1e-6);
  assert.ok(r.cartera.peor_mes.ret < 0);
  assert.equal(r.concentracion.mayor_posicion.ticker, 'AURA-F');
  assert.equal(r.concentracion.avisos.length, 1);
  assert.equal(r.serie.length, 253);
  assert.equal(r.serie[0].cartera, 100);
});

test('simulador: validación de tickers, pesos y cantidad', () => {
  const p = (posiciones: unknown, extra = {}) => () => validarPedido({ horizonte_meses: 24, posiciones, ...extra }, validos);
  assert.throws(p([{ ticker: 'XXXX', peso: 100 }]), ErrorPedido);
  assert.throws(p([{ ticker: 'AURA-F', peso: 60 }]), ErrorPedido);
  assert.throws(p([{ ticker: 'AURA-F', peso: 50 }, { ticker: 'AURA-F', peso: 50 }]), ErrorPedido);
  assert.throws(p(base.empresas.slice(0, 9).map(e => ({ ticker: e.ticker, peso: 100 / 9 }))), ErrorPedido);
  assert.throws(p([{ ticker: 'AURA-F', peso: 100 }], { monto: -5 }), ErrorPedido);
  assert.throws(() => validarPedido({ horizonte_meses: 1.5, posiciones: [{ ticker: 'AURA-F', peso: 100 }] }, validos), ErrorPedido);
});

test('lectura en palabras: 4 frases, cierre fijo y sin verbos de recomendación', () => {
  const ret12 = base.indice[base.indice.length - 1].valor / base.indice[base.indice.length - 253].valor - 1;
  for (const f of filas) {
    const frases = lecturaEnPalabras(f, ret12);
    assert.equal(frases.length, 4);
    assert.match(frases[3], /según el puntaje ficticio de esta práctica\.$/);
    assert.doesNotMatch(frases.join(' '), PROHIBIDO);
  }
});

test('textos del módulo: sin verbos de recomendación ni rótulos viejos', () => {
  const raiz = process.cwd();
  const archivos: string[] = [];
  const recorrer = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const n of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, n.name);
      if (n.isDirectory()) recorrer(p); else if (/\.(tsx?|css)$/.test(n.name) && !n.name.endsWith('.test.ts')) archivos.push(p);
    }
  };
  ['app/mercado', 'app/api/mercado', 'lib/mercado'].forEach(d => recorrer(path.join(raiz, d)));
  assert.ok(archivos.length > 0);
  for (const a of archivos) {
    const t = fs.readFileSync(a, 'utf8');
    assert.doesNotMatch(t, PROHIBIDO, a);
  }
});
