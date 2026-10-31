import s from './mercado.module.css';

export default function Cargando() {
  return (
    <div className={s.cargando} role="status" aria-live="polite">
      <span className={s.sr}>Cargando el mercado ficticio…</span>
      <div className={s.esqueleto} style={{ height: 56 }} />
      <div className={s.esqueleto} style={{ height: 260 }} />
      <div className={s.esqueleto} style={{ height: 180 }} />
    </div>
  );
}
