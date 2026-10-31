'use client';
// Ranking por puntaje con búsqueda, filtro por sector y orden. Recibe la lista ya calculada en el servidor.
import { useId, useMemo, useState } from 'react';
import { ordenar, type FilaLista, type Orden } from '@/lib/mercado/lista';
import { FilaEmpresa } from './piezas';
import s from './mercado.module.css';

const ORDEN_TEXTO: Record<Orden, string> = {
  score: 'Puntaje (mayor primero)', ret_12m: 'Retorno 12 meses (mayor primero)', vol: 'Volatilidad (menor primero)', pe: 'P/E (menor primero)',
};

export default function Ranking({ filas, sectores }: { filas: FilaLista[]; sectores: string[] }) {
  const [texto, setTexto] = useState('');
  const [sector, setSector] = useState('');
  const [orden, setOrden] = useState<Orden>('score');
  const id = useId();
  const visibles = useMemo(() => {
    const q = texto.trim().toLocaleLowerCase('es');
    return ordenar(filas.filter(f => (!sector || f.sector === sector) && (!q || f.ticker.toLocaleLowerCase('es').includes(q) || f.nombre.toLocaleLowerCase('es').includes(q))), orden);
  }, [filas, texto, sector, orden]);
  const limpiar = () => { setTexto(''); setSector(''); };

  return (
    <div className={s.col}>
      <div className={s.filtros}>
        <div className={s.campo}>
          <label htmlFor={`${id}-q`}>Buscar por nombre o ticker</label>
          <input id={`${id}-q`} className={s.input} type="search" value={texto} onChange={e => setTexto(e.target.value)} placeholder="Ej.: Aurora o AURA-F" autoComplete="off" />
        </div>
        <div className={s.campo}>
          <label htmlFor={`${id}-s`}>Sector</label>
          <select id={`${id}-s`} className={s.select} value={sector} onChange={e => setSector(e.target.value)}>
            <option value="">Todos los sectores</option>
            {sectores.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div className={s.campo}>
          <label htmlFor={`${id}-o`}>Ordenar por</label>
          <select id={`${id}-o`} className={s.select} value={orden} onChange={e => setOrden(e.target.value as Orden)}>
            {(Object.keys(ORDEN_TEXTO) as Orden[]).map(o => <option key={o} value={o}>{ORDEN_TEXTO[o]}</option>)}
          </select>
        </div>
      </div>
      <p className={s.sr} aria-live="polite">{visibles.length} {visibles.length === 1 ? 'empresa' : 'empresas'} en la lista.</p>
      {visibles.length ? (
        <ol className={s.lista} aria-label="Ranking de empresas ficticias">
          {visibles.map(f => <li key={f.ticker}><FilaEmpresa f={f} /></li>)}
        </ol>
      ) : (
        <div className={s.vacio}>
          <p>No hay empresas que coincidan con ese filtro.</p>
          <button type="button" className={s.btn} onClick={limpiar}>Ver todas</button>
        </div>
      )}
      {orden === 'pe' && <p className={s.notaChica}>Las empresas sin ganancias no tienen P/E y quedan al final.</p>}
    </div>
  );
}
