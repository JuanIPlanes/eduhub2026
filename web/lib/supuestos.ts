// Supuestos opcionales del pedido ("¿y si cobro menos?"): modifican SOLO el pronóstico principal.
// Los escenarios pesimista y optimista son fijos (lib/escenarios.ts) y no los usan.
import { z } from 'zod';

export const SupuestosSchema = z.object({
  ventas: z.number().finite().min(0.3).max(1.5).optional(),          // factor sobre las ventas: 0,8 = −20%
  demoraCobros: z.number().finite().min(0).max(60).optional(),       // días extra de atraso en cobros a clientes
});
export type Supuestos = { ventas?: number; demoraCobros?: number };
export type ResultadoSupuestos = { ok: true; supuestos: Supuestos } | { ok: false; error: string };

export function procesarSupuestos(crudo: unknown): ResultadoSupuestos {
  let v = crudo;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return { ok: false, error: 'El campo supuestos no es un JSON válido.' }; } }
  const r = SupuestosSchema.safeParse(v);
  if (!r.success) { const i = r.error.issues[0]; return { ok: false, error: `supuestos inválido: ${i?.path.join('.') || 'formato'} ${i?.message ?? ''}`.trim() }; }
  return { ok: true, supuestos: { ...(r.data.ventas !== undefined && { ventas: r.data.ventas }), ...(r.data.demoraCobros !== undefined && { demoraCobros: Math.round(r.data.demoraCobros) }) } };
}
