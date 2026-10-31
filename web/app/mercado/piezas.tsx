// Piezas chicas sin estado (sirven en servidor y cliente). Los colores siempre van con texto o símbolo.
import Link from 'next/link';
import type { Nivel } from '@/lib/mercado/calculo';
import type { FilaLista } from '@/lib/mercado/lista';
import { ACLARACION_PUNTAJE, NIVEL_TEXTO, numero, pctSigno, pesos } from '@/lib/mercado/formato';
import s from './mercado.module.css';

export function Variacion({ v, sufijo }: { v: number | null; sufijo?: string }) {
  if (v === null || !Number.isFinite(v)) return <span className={s.igual}>—</span>;
  const c = Math.abs(v) < 0.0005 ? s.igual : v > 0 ? s.sube : s.baja;
  const flecha = Math.abs(v) < 0.0005 ? '=' : v > 0 ? '▲' : '▼';
  return <span className={`${c} ${s.num}`}><span aria-hidden="true">{flecha} </span>{pctSigno(v)}{sufijo ? ` ${sufijo}` : ''}</span>;
}

export function NivelChip({ nivel }: { nivel: Nivel }) {
  return (
    <span className={`${s.nivel} ${s[`nivel_${nivel}`]}`} title={`${NIVEL_TEXTO[nivel]}, ${ACLARACION_PUNTAJE}`}>
      {NIVEL_TEXTO[nivel]}<span className={s.sr}>, {ACLARACION_PUNTAJE}</span>
    </span>
  );
}

export function FilaEmpresa({ f, dato = 'puntaje' }: { f: FilaLista; dato?: 'puntaje' | 'ret' }) {
  return (
    <Link href={`/mercado/${f.ticker}`} className={s.filaEmp}>
      <span className={s.filaIzq}>
        <span className={s.ticker}>{f.ticker}</span>
        <span className={s.nombreEmp}>{f.nombre}</span>
        <span className={s.sectorTxt}>{f.sector}</span>
      </span>
      <span className={s.filaDer}>
        {dato === 'puntaje' ? (
          <>
            <span className={`${s.puntajeNum} ${s.num}`}>{numero(f.score_total, 1)} <small>/ 100</small></span>
            <NivelChip nivel={f.lectura} />
          </>
        ) : (
          <span className={s.num} style={{ fontWeight: 650, fontSize: 16 }}><Variacion v={f.ret_12m} /></span>
        )}
        <span className={s.filaNums}>
          <span className={s.num}>{pesos(f.precio)}</span>
          {dato === 'puntaje' && <span>12m <Variacion v={f.ret_12m} /></span>}
        </span>
      </span>
    </Link>
  );
}
