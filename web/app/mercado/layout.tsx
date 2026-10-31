// Sección aparte "Mercado ficticio" (hermana de /demo, fuera de (app)). La franja de aviso es fija y no se puede cerrar.
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import Nav from './Nav';
import s from './mercado.module.css';

export const metadata: Metadata = {
  title: 'Mercado ficticio · CFO de Bolsillo',
  description: 'Práctica con un mercado de acciones inventado: empresas, precios y datos ficticios. No es información real ni una recomendación.',
};

export default function MercadoLayout({ children }: { children: ReactNode }) {
  return (
    <div className={s.mk}>
      <a href="#contenido" className={s.saltar}>Saltar al contenido</a>
      <div className={s.franja} role="note" aria-label="Aviso: mercado ficticio">
        <p className={s.franjaIn}>
          <span className={s.franjaChip} aria-hidden="true">Ficticio</span>
          <span><strong>Mercado ficticio:</strong> empresas, precios y datos inventados para practicar. No es información real ni una recomendación.</span>
        </p>
      </div>
      <header className={s.cab}>
        <div className={s.cabIn}>
          <Link href="/" className={s.volver}>← Volver a la app</Link>
          <Nav />
        </div>
      </header>
      <main id="contenido" className={s.main} tabIndex={-1}>{children}</main>
    </div>
  );
}
