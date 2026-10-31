import Link from 'next/link';
import s from './mercado.module.css';

export default function NoEncontrada() {
  return (
    <div className={s.card}>
      <h1 style={{ fontSize: 20 }}>Esa empresa no está en el mercado ficticio</h1>
      <p className={s.nota}>Los tickers de esta práctica terminan en -F (por ejemplo, AURA-F).</p>
      <div className={s.acciones}><Link href="/mercado" className={`${s.btn} ${s.btnPri}`}>Ver las 12 empresas</Link></div>
    </div>
  );
}
