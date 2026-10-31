// GET /api/mercado/empresas?sector=&orden=score|ret_12m|vol|pe — mercado ficticio, solo lectura.
import { NextResponse, type NextRequest } from 'next/server';
import { ORDENES, empresas, esOrden, sectorValido } from '@/lib/mercado/vistas';

export const runtime = 'nodejs';

export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const sector = q.get('sector') || null;
  const orden = q.get('orden') || 'score';
  if (!esOrden(orden)) return NextResponse.json({ error: `orden tiene que ser uno de: ${ORDENES.join(', ')}` }, { status: 400 });
  if (!sectorValido(sector)) return NextResponse.json({ error: 'Ese sector no existe en el mercado ficticio.' }, { status: 400 });
  return NextResponse.json(empresas(sector, orden));
}
