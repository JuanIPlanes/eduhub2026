// Carga manual del usuario para /api/analizar (campo `manual`): saldo de caja a una fecha, movimientos sueltos y
// comprobantes. Se valida con zod; los montos de los movimientos llevan signo (+ entra, - sale).
import { z } from 'zod';
import type { Comprobante, Movimiento } from './parse';
import { ExtrasSchema, procesarExtras } from './extras';

export const MAX_MOVIMIENTOS_MANUALES = 500;
const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'la fecha debe ser yyyy-mm-dd').refine(f => !Number.isNaN(Date.parse(f)), 'fecha inválida');
const Monto = z.number().finite().refine(n => Math.abs(n) < 1e12, 'monto inválido');

export const ManualSchema = z.object({
  saldo: z.object({ fecha: Fecha, monto: Monto }).optional(),
  movimientos: z.array(z.object({ fecha: Fecha, desc: z.string().trim().max(120).default(''), monto: Monto.refine(n => n !== 0, 'el monto no puede ser 0') })).max(MAX_MOVIMIENTOS_MANUALES).optional(),
  comprobantes: ExtrasSchema.optional(),
  // Saldo mínimo de seguridad fijado por el usuario (si no, 30 días de egresos fijos).
  minimoSeguridad: z.number().finite().min(0).max(1e12).optional(),
});

export type Manual = {
  saldo?: { fecha: string; monto: number };
  movimientos: Movimiento[];
  recibidos: Comprobante[]; emitidos: Comprobante[];
  minimoSeguridad?: number;
};
export type ResultadoManual = { ok: true; manual: Manual } | { ok: false; error: string };

export function procesarManual(crudo: unknown): ResultadoManual {
  let v = crudo;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return { ok: false, error: 'El campo manual no es un JSON válido.' }; } }
  const r = ManualSchema.safeParse(v);
  if (!r.success) { const i = r.error.issues[0]; return { ok: false, error: `manual inválido: ${i?.path.join('.') || 'formato'} ${i?.message ?? ''}`.trim() }; }
  let recibidos: Comprobante[] = [], emitidos: Comprobante[] = [];
  if (r.data.comprobantes?.length) {
    const c = procesarExtras(r.data.comprobantes, 'manual');
    if (!c.ok) return { ok: false, error: c.error };
    ({ recibidos, emitidos } = c);
  }
  return { ok: true, manual: { saldo: r.data.saldo, movimientos: (r.data.movimientos ?? []).map(m => ({ fecha: m.fecha, desc: m.desc || 'Movimiento manual', monto: m.monto })), recibidos, emitidos, minimoSeguridad: r.data.minimoSeguridad } };
}
