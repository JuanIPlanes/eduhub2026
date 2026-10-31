// /mercado/simulador — acepta ?monto=...&horizonte=... (por ejemplo, desde Excedente). Sin esos datos, los pide.
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { listaTickers } from '@/lib/mercado/vistas';
import { mercado } from '@/lib/mercado/datos';
import Cargando from '../loading';
import Simulador from './Simulador';

export const dynamic = 'force-static';
export const metadata: Metadata = { title: 'Simulador de cartera · Mercado ficticio' };

export default function PaginaSimulador() {
  const { peor } = mercado();
  return (
    <Suspense fallback={<Cargando />}>
      <Simulador empresas={listaTickers()} peor={peor} />
    </Suspense>
  );
}
