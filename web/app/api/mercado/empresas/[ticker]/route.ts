// GET /api/mercado/empresas/:ticker?rango=1m|3m|6m|12m|todo — ficha de una empresa ficticia.
import { NextResponse, type NextRequest } from 'next/server';
import { esRango, ficha } from '@/lib/mercado/vistas';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const rango = req.nextUrl.searchParams.get('rango') || 'todo';
  if (!esRango(rango)) return NextResponse.json({ error: 'rango tiene que ser 1m, 3m, 6m, 12m o todo.' }, { status: 400 });
  const f = ficha(decodeURIComponent(ticker), rango);
  if (!f) return NextResponse.json({ error: 'Esa empresa no está en el mercado ficticio.' }, { status: 404 });
  return NextResponse.json(f);
}
