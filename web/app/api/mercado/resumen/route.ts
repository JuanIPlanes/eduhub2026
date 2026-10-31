// GET /api/mercado/resumen — mercado ficticio, solo lectura.
import { NextResponse } from 'next/server';
import { resumen } from '@/lib/mercado/vistas';

export const runtime = 'nodejs';

export function GET() {
  return NextResponse.json(resumen());
}
