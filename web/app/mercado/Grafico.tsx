'use client';
// Gráfico de líneas propio (SVG, sin librerías): selector de rango, cruz con tooltip (mouse, toque y teclado),
// marcadores de eventos ficticios tocables y tabla alternativa con los mismos datos.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { RANGOS, type Evento, type Rango } from '@/lib/mercado/calculo';
import { fecha, fechaCorta, numero, pctSigno, pesos } from '@/lib/mercado/formato';
import s from './mercado.module.css';

export type Serie = { id: string; nombre: string; valores: number[]; estilo: 'principal' | 'referencia' };
type Formato = 'pesos' | 'indice' | 'base100';

const ROTULO_RANGO: Record<Rango, string> = { '1m': '1M', '3m': '3M', '6m': '6M', '12m': '12M', todo: 'Todo' };
const NOMBRE_RANGO: Record<Rango, string> = { '1m': 'último mes', '3m': 'últimos 3 meses', '6m': 'últimos 6 meses', '12m': 'últimos 12 meses', todo: 'todo el período' };

function fmt(v: number, f: Formato, eje = false) {
  if (f === 'pesos') return pesos(v, eje ? 0 : 2);
  return numero(v, eje ? 0 : 1);
}

function marcas(min: number, max: number, n = 4): number[] {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const paso = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / paso) * paso, hi = Math.ceil(max / paso) * paso;
  const out: number[] = [];
  for (let v = lo; v <= hi + paso / 2; v += paso) out.push(Math.round(v / paso) * paso);
  return out;
}

export default function Grafico({
  fechas, series, formato, titulo, rangos = ['1m', '3m', '6m', '12m'], rangoInicial = '12m', eventos = [],
}: {
  fechas: string[]; series: Serie[]; formato: Formato; titulo: string;
  rangos?: Rango[]; rangoInicial?: Rango; eventos?: Evento[];
}) {
  const [rango, setRango] = useState<Rango>(rangoInicial);
  const [hover, setHover] = useState<number | null>(null);
  const [porTeclado, setPorTeclado] = useState(false);
  const [evSel, setEvSel] = useState<number | null>(null);
  const [W, setW] = useState(640);
  const caja = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    const el = caja.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => { const w = Math.round(e.contentRect.width); if (w > 0) setW(w); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = RANGOS[rango];
  const ini = Number.isFinite(n) ? Math.max(0, fechas.length - n) : 0;
  const fs = useMemo(() => fechas.slice(ini), [fechas, ini]);
  const vs = useMemo(() => series.map(x => x.valores.slice(ini)), [series, ini]);
  const largo = fs.length;
  const H = W < 520 ? 220 : 280;
  const multi = series.length > 1;
  const M = { t: 12, b: 26, l: formato === 'pesos' ? 60 : 40, r: multi ? 58 : 14 };

  const todos = vs.flat();
  const ys = marcas(Math.min(...todos), Math.max(...todos));
  const lo = ys[0], hi = ys[ys.length - 1];
  const x = (i: number) => M.l + (largo <= 1 ? 0 : (i / (largo - 1)) * (W - M.l - M.r));
  const y = (v: number) => M.t + (1 - (v - lo) / (hi - lo || 1)) * (H - M.t - M.b);
  const camino = (v: number[]) => v.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join('');
  const principal = series.findIndex(z => z.estilo === 'principal');
  const pv = vs[principal >= 0 ? principal : 0];

  // Etiquetas directas al final de cada línea, separadas para que no se pisen (mínimo 14 px).
  const yEtiq = (() => {
    const orden = vs.map((v, k) => ({ k, y: y(v[largo - 1]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < orden.length; i++) if (orden[i].y - orden[i - 1].y < 14) orden[i].y = orden[i - 1].y + 14;
    const out: number[] = [];
    orden.forEach(o => { out[o.k] = Math.min(o.y, H - M.b); });
    return out;
  })();
  const xMarcas = [0, 1, 2, 3].map(k => Math.round((k * (largo - 1)) / 3));
  const fmtX = (i: number) => (largo <= 70 ? fecha(fs[i]).replace(/ \d{4}$/, '') : fechaCorta(fs[i]));

  // Eventos visibles en el rango: se ubican en la primera rueda con fecha ≥ la del evento.
  const evs = eventos
    .map(e => ({ e, i: fs.findIndex(f => f >= e.fecha) }))
    .filter(z => z.i >= 0 && fs[0] <= z.e.fecha);
  const sel = evs.find(z => z.e.id === evSel) ?? null;

  function mover(ev: PointerEvent<SVGSVGElement>) {
    const r = ev.currentTarget.getBoundingClientRect();
    const px = ((ev.clientX - r.left) * W) / r.width;
    const i = Math.round(((px - M.l) / (W - M.l - M.r)) * (largo - 1));
    setPorTeclado(false);
    setHover(Math.max(0, Math.min(largo - 1, i)));
  }
  function tecla(ev: KeyboardEvent<SVGSVGElement>) {
    const actual = hover ?? largo - 1;
    const paso = ev.shiftKey ? 10 : 1;
    let nuevo: number | null = null;
    if (ev.key === 'ArrowLeft') nuevo = Math.max(0, actual - paso);
    else if (ev.key === 'ArrowRight') nuevo = Math.min(largo - 1, actual + paso);
    else if (ev.key === 'Home') nuevo = 0;
    else if (ev.key === 'End') nuevo = largo - 1;
    else if (ev.key === 'Escape') { setHover(null); return; }
    if (nuevo !== null) { ev.preventDefault(); setPorTeclado(true); setHover(nuevo); }
  }

  const variacion = (v: number[]) => v[v.length - 1] / v[0] - 1;
  const resumenTxt = `${titulo}, ${NOMBRE_RANGO[rango]}: ${series.map((z, k) => `${z.nombre} ${fmt(vs[k][0], formato)} a ${fmt(vs[k][largo - 1], formato)} (${pctSigno(variacion(vs[k]))})`).join('; ')}.`;
  const paso = Math.max(1, Math.ceil(largo / 40));
  const filasTabla = fs.map((f, i) => i).filter(i => i % paso === 0 || i === largo - 1);
  const tipTexto = hover !== null ? `${fecha(fs[hover])}: ${series.map((z, k) => `${z.nombre} ${fmt(vs[k][hover], formato)}`).join(', ')}` : '';

  return (
    <div className={s.graf}>
      <div className={s.grafBarra}>
        {multi ? (
          <div className={s.leyenda} aria-hidden="true">
            {series.map(z => <span key={z.id}><i className={z.estilo === 'principal' ? s.marca : s.marcaPunteada} style={z.estilo === 'principal' ? { background: 'var(--accent)' } : undefined} />{z.nombre}</span>)}
          </div>
        ) : <span className={s.notaChica}>Variación en el rango: <b className={variacion(pv) >= 0 ? s.sube : s.baja}>{variacion(pv) >= 0 ? '▲' : '▼'} {pctSigno(variacion(pv))}</b></span>}
        {rangos.length > 1 && (
          <div className={s.seg} role="group" aria-label="Rango del gráfico">
            {rangos.map(r => (
              <button key={r} type="button" aria-pressed={r === rango} onClick={() => { setRango(r); setHover(null); }} aria-label={NOMBRE_RANGO[r]}>{ROTULO_RANGO[r]}</button>
            ))}
          </div>
        )}
      </div>

      <div className={s.lienzo} ref={caja}>
        <svg
          viewBox={`0 0 ${W} ${H}`} role="img" aria-label={resumenTxt} tabIndex={0}
          aria-describedby={`${id}-ayuda`}
          onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setHover(null)}
          onKeyDown={tecla} onBlur={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`${id}-area`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.16" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ys.map(v => (
            <g key={v}>
              <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={1} />
              <text x={M.l - 8} y={y(v)} dy="0.32em" textAnchor="end" className={s.ejeTexto}>{fmt(v, formato, true)}</text>
            </g>
          ))}
          {xMarcas.map((i, k) => (
            <text key={k} x={x(i)} y={H - 6} textAnchor={k === 0 ? 'start' : k === 3 ? 'end' : 'middle'} className={s.ejeTexto}>{fmtX(i)}</text>
          ))}
          {!multi && <path d={`${camino(pv)}L${x(largo - 1)},${y(lo)}L${x(0)},${y(lo)}Z`} fill={`url(#${id}-area)`} />}
          {series.map((z, k) => (
            <path key={z.id} d={camino(vs[k])} fill="none"
              stroke={z.estilo === 'principal' ? 'var(--accent)' : 'var(--muted)'} strokeWidth={2}
              strokeDasharray={z.estilo === 'referencia' ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {series.map((z, k) => (
            <g key={`fin-${z.id}`}>
              <circle cx={x(largo - 1)} cy={y(vs[k][largo - 1])} r={4} fill={z.estilo === 'principal' ? 'var(--accent)' : 'var(--muted)'} stroke="var(--surface)" strokeWidth={2} />
              {multi && <text x={x(largo - 1) + 8} y={yEtiq[k]} dy="0.32em" className={s.etiquetaSerie}>{z.nombre}</text>}
            </g>
          ))}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={H - M.b} stroke="var(--line-2)" strokeWidth={1} />
              {series.map((z, k) => (
                <circle key={z.id} cx={x(hover)} cy={y(vs[k][hover])} r={4.5} fill={z.estilo === 'principal' ? 'var(--accent)' : 'var(--muted)'} stroke="var(--surface)" strokeWidth={2} />
              ))}
            </g>
          )}
        </svg>

        {evs.map(({ e, i }) => (
          <button
            key={e.id} type="button" className={s.evBtn} aria-pressed={evSel === e.id}
            style={{ left: `${(x(i) / W) * 100}%`, top: `${(y(pv[i]) / H) * 100}%` }}
            aria-label={`Evento ficticio del ${fecha(e.fecha)}: ${e.titulo}`}
            onClick={() => setEvSel(evSel === e.id ? null : e.id)}
          ><span /></button>
        ))}

        {hover !== null && (
          <div className={s.tip} aria-hidden="true"
            style={x(hover) > W / 2 ? { right: `${W - x(hover) + 10}px` } : { left: `${x(hover) + 10}px` }}>
            <b>{fecha(fs[hover])}</b>
            {series.map((z, k) => (
              <div key={z.id} className={s.tipSerie}>
                {multi && <i className={z.estilo === 'principal' ? s.marca : s.marcaPunteada} style={z.estilo === 'principal' ? { background: 'var(--accent)' } : undefined} />}
                <span>{multi ? `${z.nombre}: ` : ''}<b className={s.num}>{fmt(vs[k][hover], formato)}</b></span>
              </div>
            ))}
          </div>
        )}
      </div>
      <p id={`${id}-ayuda`} className={s.sr}>Con el gráfico enfocado, usá las flechas izquierda y derecha para recorrer los días.</p>
      <p className={s.sr} aria-live="polite">{porTeclado ? tipTexto : ''}</p>

      {evs.length > 0 && (
        sel ? (
          <div className={s.evPanel} role="status">
            <span className={s.notaChica}>{fecha(sel.e.fecha)} · {sel.e.ticker ? 'Noticia de la empresa' : 'Noticia de todo el mercado'} (ficticia)</span>
            <strong>{sel.e.titulo}</strong>
            <span>Impacto en el precio ese día: <b className={sel.e.impacto_pct >= 0 ? s.sube : s.baja}>{sel.e.impacto_pct >= 0 ? '▲' : '▼'} {pctSigno(sel.e.impacto_pct / 100)}</b></span>
          </div>
        ) : <p className={s.notaChica}>Los puntos con borde ámbar son noticias ficticias ({evs.length} en este rango). Tocá uno para ver el titular y el impacto.</p>
      )}

      <details className={s.tabla}>
        <summary>Ver los datos en tabla</summary>
        <div className={s.tablaWrap} tabIndex={0} role="region" aria-label={`Tabla de ${titulo}`}>
          <table className={`${s.tablaDatos} ${s.num}`}>
            <caption className={s.sr}>{titulo}, {NOMBRE_RANGO[rango]}{paso > 1 ? `, una fila cada ${paso} ruedas` : ''}</caption>
            <thead><tr><th scope="col">Fecha</th>{series.map(z => <th key={z.id} scope="col">{z.nombre}</th>)}</tr></thead>
            <tbody>
              {filasTabla.map(i => (
                <tr key={fs[i]}><td>{fecha(fs[i])}</td>{series.map((z, k) => <td key={z.id}>{fmt(vs[k][i], formato)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        {evs.length > 0 && (
          <div className={s.tablaPlana} style={{ marginTop: 8 }}>
            <table className={`${s.tablaDatos} ${s.num}`}>
              <caption className={s.sr}>Eventos ficticios en el rango</caption>
              <thead><tr><th scope="col">Fecha</th><th scope="col" style={{ textAlign: 'left' }}>Evento ficticio</th><th scope="col">Impacto</th></tr></thead>
              <tbody>
                {evs.map(({ e }) => <tr key={e.id}><td>{fecha(e.fecha)}</td><td style={{ textAlign: 'left', whiteSpace: 'normal' }}>{e.titulo}</td><td>{pctSigno(e.impacto_pct / 100)}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </div>
  );
}
