'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import s from './mercado.module.css';

const LINKS = [
  { href: '/mercado', label: 'Resumen' },
  { href: '/mercado/simulador', label: 'Simulador' },
];

export default function Nav() {
  const ruta = usePathname();
  return (
    <nav className={s.nav} aria-label="Mercado ficticio">
      {LINKS.map(l => {
        const activo = l.href === '/mercado' ? ruta === '/mercado' || (!!ruta?.startsWith('/mercado/') && !ruta.startsWith('/mercado/simulador')) : ruta?.startsWith(l.href);
        return <Link key={l.href} href={l.href} className={s.navLink} aria-current={activo ? 'page' : undefined}>{l.label}</Link>;
      })}
    </nav>
  );
}
