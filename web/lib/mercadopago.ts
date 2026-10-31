// Proveedor Mercado Pago: trae pagos de la cuenta (API v1/payments/search) y los convierte a Movimiento[].
// Token (pegado por el usuario en /api/mp/token, OAuth o MP_ACCESS_TOKEN) => se lee SOLO la API real. Sin token => la
// simulación public/demo/mp/mp_pagos.json (Carpintería Los Aromos). Los montos nunca pasan por el LLM.
// OJO: la API de Mercado Pago NO trae facturas de ARCA (ni recibidas ni emitidas): solo pagos/cobros de la cuenta.
// Las facturas tienen que venir de CSV de "Mis Comprobantes", fotos (/api/foto) o carga manual.
import { createHash } from 'node:crypto';
import type { Movimiento } from './parse';

export type PagoMP = {
  id: number; status: string; description?: string | null; operation_type?: string;
  date_created: string; date_approved?: string | null; date_last_updated?: string | null;
  transaction_amount: number; transaction_amount_refunded?: number;
  transaction_details?: { net_received_amount?: number };
  collector_id?: number; payer?: { id?: number | string | null };
};

const API = 'https://api.mercadopago.com';
const DIAS_HISTORIAL = 90;
const POR_PAGINA = 100;
const MAX_PAGINAS = 30; // tope: 3000 pagos en 90 días
const CONCURRENCIA = 5;
const TIMEOUT_MS = 8000;
const TTL_CACHE_MS = 60_000;

const dia = (iso?: string | null) => (iso ?? '').slice(0, 10);
const redondear = (n: number) => Math.round(n * 100) / 100;

// Cobros aprobados entran por el neto (ya sin comisión MP); devoluciones y contracargos salen. Las descripciones
// reproducen el estilo de un extracto para que categorizar() las clasifique: cobros con QR/link ("MERCADO PAGO") son
// ventas, las transferencias recibidas son cobros a clientes y la carga de saldo no cuenta como venta.
// Los pagos donde la cuenta es la compradora son salidas.
export function mapearPagos(pagos: PagoMP[], userId?: number): Movimiento[] {
  const out: Movimiento[] = [];
  for (const p of pagos) {
    const nota = (p.description ?? '').trim().slice(0, 80);
    const comprador = userId !== undefined && p.collector_id !== undefined && p.collector_id !== userId;
    const transf = p.operation_type === 'money_transfer';
    const bruto = p.transaction_amount;
    if (comprador) {
      if (p.status === 'approved' || p.status === 'refunded' || p.status === 'charged_back') {
        const f = dia(p.date_approved ?? p.date_created);
        if (f && bruto > 0) out.push({ fecha: f, desc: `${transf ? 'TRANSF A' : 'PAGO A PROV'} ${nota}`.trim(), monto: -redondear(bruto) });
        if (p.status === 'refunded' && f) out.push({ fecha: dia(p.date_last_updated) || f, desc: `DEVOLUCION RECIBIDA MERCADO PAGO ${nota}`.trim(), monto: redondear(p.transaction_amount_refunded ?? bruto) });
      }
      continue;
    }
    if (p.status === 'approved' || p.status === 'refunded' || p.status === 'charged_back') {
      const f = dia(p.date_approved ?? p.date_created);
      const neto = p.transaction_details?.net_received_amount ?? bruto;
      const desc = p.operation_type === 'account_fund' ? `CARGA DE SALDO ${nota}` : transf ? `TRANSF RECIBIDA ${nota}` : `ACRED MERCADO PAGO ${nota}`;
      if (f && neto > 0) out.push({ fecha: f, desc: desc.trim(), monto: redondear(neto) });
    }
    if (p.status === 'refunded' || p.status === 'charged_back') {
      const monto = p.status === 'refunded' ? p.transaction_amount_refunded ?? bruto : bruto;
      const f = dia(p.date_last_updated) || dia(p.date_approved ?? p.date_created);
      if (f && monto > 0) out.push({ fecha: f, desc: `${p.status === 'refunded' ? 'DEVOLUCION' : 'CONTRACARGO'} MERCADO PAGO ${nota}`.trim(), monto: -redondear(monto) });
    }
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export type OpcionesMP = {
  fetch?: typeof fetch;   // inyectable para tests
  esperaReintentoMs?: number;
  ahora?: () => number;   // reloj del caché (tests)
  sinCache?: boolean;
};

export class ErrorMP extends Error {
  constructor(mensaje: string, readonly status?: number) { super(mensaje); }
}

// GET con timeout por request (8 s) y 1 reintento ante 429/5xx o falla de red. Nunca incluye el token en el error.
async function mp<T>(token: string, ruta: string, op: OpcionesMP = {}): Promise<T> {
  const f = op.fetch ?? fetch;
  let ultimo: ErrorMP | undefined;
  for (let intento = 0; intento < 2; intento++) {
    if (intento) await new Promise(r => setTimeout(r, op.esperaReintentoMs ?? 400));
    try {
      const res = await f(API + ruta, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) return await res.json() as T;
      ultimo = new ErrorMP(`Mercado Pago respondió ${res.status} en ${ruta.split('?')[0]}`, res.status);
      if (res.status !== 429 && res.status < 500) throw ultimo;
    } catch (e) {
      if (e instanceof ErrorMP && e.status !== undefined && e.status !== 429 && e.status < 500) throw e;
      ultimo = e instanceof ErrorMP ? e : new ErrorMP(`No pude comunicarme con Mercado Pago (${e instanceof Error && e.name === 'TimeoutError' ? 'tiempo agotado' : 'error de red'})`);
    }
  }
  throw ultimo!;
}

// Datos de la cuenta dueña del token. Lanza ErrorMP (status 401/403 si el token no sirve).
export async function cuentaMP(token: string, op: OpcionesMP = {}): Promise<{ id: number; apodo?: string }> {
  const u = await mp<{ id: number; nickname?: string }>(token, '/users/me', op);
  if (typeof u.id !== 'number') throw new ErrorMP('Mercado Pago no devolvió la cuenta');
  return { id: u.id, ...(u.nickname && { apodo: u.nickname }) };
}

type Resultado = { pagos: PagoMP[]; userId: number };
const cache = new Map<string, { t: number; p: Promise<Resultado> }>();
export const limpiarCacheMP = () => cache.clear();

async function descargar(token: string, hoy: Date, op: OpcionesMP): Promise<Resultado> {
  const desde = new Date(hoy.getTime() - DIAS_HISTORIAL * 86400000).toISOString();
  const pagina = (offset: number) => {
    const q = new URLSearchParams({ sort: 'date_created', criteria: 'desc', range: 'date_created', begin_date: desde, end_date: hoy.toISOString(), limit: String(POR_PAGINA), offset: String(offset) });
    return mp<{ paging: { total: number; limit?: number }; results: PagoMP[] }>(token, `/v1/payments/search?${q}`, op);
  };
  // La identidad y la primera página no dependen entre sí: van juntas.
  const [yo, primera] = await Promise.all([mp<{ id: number }>(token, '/users/me', op), pagina(0)]);
  const pagos = [...primera.results];
  const paso = primera.paging.limit || primera.results.length || POR_PAGINA;
  const total = Math.min(primera.paging.total, MAX_PAGINAS * paso);
  const offsets: number[] = [];
  for (let o = paso; o < total && primera.results.length; o += paso) offsets.push(o);
  const trozos: PagoMP[][] = new Array(offsets.length);
  let sig = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, offsets.length) }, async () => {
    while (sig < offsets.length) { const k = sig++; trozos[k] = (await pagina(offsets[k])).results; }
  }));
  for (const t of trozos) pagos.push(...t);
  return { pagos, userId: yo.id };
}

// Caché en memoria de 60 s por hash del token (y deduplica pedidos simultáneos). Un error no se cachea.
export function traerPagos(token: string, hoy = new Date(), op: OpcionesMP = {}): Promise<Resultado> {
  const k = createHash('sha256').update(token).digest('hex');
  const ahora = (op.ahora ?? Date.now)();
  const c = cache.get(k);
  if (!op.sinCache && c && ahora - c.t < TTL_CACHE_MS) return c.p;
  const p = descargar(token, hoy, op);
  if (!op.sinCache) {
    cache.set(k, { t: ahora, p });
    p.catch(() => { if (cache.get(k)?.p === p) cache.delete(k); });
    if (cache.size > 50) for (const [kk, v] of cache) if (ahora - v.t >= TTL_CACHE_MS) cache.delete(kk);
  }
  return p;
}

// Saldo real de la cuenta: GET /users/{id}/mercadopago_account/balance. Con tokens normales devuelve 403 (o 404): en ese
// caso null y el llamador sigue con un saldo ESTIMADO (nunca confirmado). Timeout corto, sin reintento, nunca lanza.
const TIMEOUT_SALDO_MS = 2500;
const cacheSaldo = new Map<string, { t: number; v: number | null }>();
export async function saldoMP(token: string, userId: number, op: OpcionesMP = {}): Promise<number | null> {
  const k = createHash('sha256').update(token).digest('hex');
  const ahora = (op.ahora ?? Date.now)();
  const c = cacheSaldo.get(k);
  if (!op.sinCache && c && ahora - c.t < TTL_CACHE_MS) return c.v;
  let v: number | null = null;
  try {
    const res = await (op.fetch ?? fetch)(`${API}/users/${userId}/mercadopago_account/balance`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_SALDO_MS) });
    if (res.ok) {
      const d = await res.json() as { available_balance?: unknown };
      if (typeof d.available_balance === 'number' && Number.isFinite(d.available_balance)) v = d.available_balance;
    }
  } catch { /* 403/404/red/timeout: saldo no disponible */ }
  if (!op.sinCache) { cacheSaldo.set(k, { t: ahora, v }); if (cacheSaldo.size > 50) for (const [kk, x] of cacheSaldo) if (ahora - x.t >= TTL_CACHE_MS) cacheSaldo.delete(kk); }
  return v;
}
export const limpiarCacheSaldoMP = () => cacheSaldo.clear();

export type OrigenMP = 'api' | 'simulacion';

// Con token (del usuario o MP_ACCESS_TOKEN) usa SOLO la API real: nunca mezcla historia simulada. Sin token, la
// simulación. MP_MODO=simulacion fuerza la simulación aunque haya token (desarrollo).
export async function movimientosMP(token: string | undefined, simulada: () => Promise<Resultado>, op: OpcionesMP = {}): Promise<{ movs: Movimiento[]; origen: OrigenMP; userId?: number }> {
  if (token && process.env.MP_MODO !== 'simulacion') {
    const v = await traerPagos(token, new Date(), op);
    return { movs: mapearPagos(v.pagos, v.userId), origen: 'api', userId: v.userId };
  }
  const s = await simulada();
  return { movs: mapearPagos(s.pagos, s.userId), origen: 'simulacion' };
}
