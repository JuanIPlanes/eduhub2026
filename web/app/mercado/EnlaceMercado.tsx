// Tarjeta/enlace reutilizable al simulador del mercado ficticio (pensada para ubicarla en Excedente).
// Solo arma un link: no lee ni guarda datos de caja. Si recibe monto y horizonte, los pasa por query.
import Link from 'next/link';
import s from './EnlaceMercado.module.css';

export function hrefSimulador(monto?: number | null, horizonteMeses?: number | null): string {
  const q = new URLSearchParams();
  if (typeof monto === 'number' && Number.isFinite(monto) && monto > 0) q.set('monto', String(Math.floor(monto)));
  if (typeof horizonteMeses === 'number' && Number.isInteger(horizonteMeses) && horizonteMeses > 0) q.set('horizonte', String(horizonteMeses));
  const t = q.toString();
  return `/mercado/simulador${t ? `?${t}` : ''}`;
}

export default function EnlaceMercado({ monto, horizonteMeses, className }: { monto?: number | null; horizonteMeses?: number | null; className?: string }) {
  return (
    <Link href={hrefSimulador(monto, horizonteMeses)} className={`${s.enlace} ${className ?? ''}`}>
      <span className={s.chip}>Ficticio</span>
      <span className={s.texto}>
        <strong>Practicá con un mercado ficticio</strong>
        <span>¿Y si lo que sobra fuera de largo plazo? Armá una cartera de práctica con empresas inventadas. No mueve plata y tu reserva no se toca.</span>
      </span>
      <span className={s.flecha} aria-hidden="true">→</span>
    </Link>
  );
}
