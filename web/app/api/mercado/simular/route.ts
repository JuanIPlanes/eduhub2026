// POST /api/mercado/simular — cartera ficticia. Cuerpo: { monto?, horizonte_meses, posiciones: [{ ticker, peso }] }.
// No se guarda nada; el monto (opcional) solo se usa para expresar resultados en pesos dentro de esta respuesta.
import { NextResponse } from 'next/server';
import { mercado } from '@/lib/mercado/datos';
import { ErrorPedido, simular, validarPedido } from '@/lib/mercado/simulador';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let cuerpo: unknown;
  try { cuerpo = await req.json(); } catch { return NextResponse.json({ error: 'El cuerpo tiene que ser JSON.' }, { status: 400 }); }
  const m = mercado();
  try {
    const pedido = validarPedido(cuerpo, new Set(m.porTicker.keys()));
    return NextResponse.json(simular(m.base, m.filas, pedido, m.peor), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof ErrorPedido) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
