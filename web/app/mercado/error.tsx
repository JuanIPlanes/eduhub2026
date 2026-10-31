'use client';
import s from './mercado.module.css';

export default function ErrorMercado({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className={s.card} role="alert">
      <h1 style={{ fontSize: 20 }}>No pudimos cargar el mercado ficticio</h1>
      <p className={s.nota}>Puede ser un problema de conexión o del servidor. Tus datos de caja no están involucrados.</p>
      <div className={s.acciones}><button type="button" className={`${s.btn} ${s.btnPri}`} onClick={reset}>Reintentar</button></div>
    </div>
  );
}
