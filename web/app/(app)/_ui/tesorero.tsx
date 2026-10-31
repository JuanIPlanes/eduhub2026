'use client';
// Tarjeta del tesorero: semáforo (luz verde, amarilla o roja) con su motivo, las 3 acciones que más importan y, con luz
// verde o amarilla, el informe educativo por plazos del Researcher (categorías, nunca emisores ni productos).
// Debajo, SIEMPRE, la lectura del mercado argentino (#t-mercado). Todo tolera que el servidor no mande `tesoreria`.
import { useEffect, useMemo, useState } from 'react';
import { analizarMercado, AVISO_RESEARCHER, investigar, type Informe, type LecturaMercado, type Perfil } from '@/lib/researcher';
import { useDatos, type Vista } from './datos';
import { fCorta, millones, pct, pesos, plural, type Tesoreria } from './formato';
import { Icono } from './iconos';
import s from '../app.module.css';

type Luz = { texto: string; box: string; chip: string; icono: 'ok' | 'alerta' | 'info' };
const LUZ: Record<string, Luz> = {
  invertir: { texto: 'Luz verde', box: s.estOk, chip: s.chipOk, icono: 'ok' },
  cautela: { texto: 'Luz amarilla', box: s.estWarn, chip: s.chipWarn, icono: 'alerta' },
  no_invertir: { texto: 'Luz roja', box: s.estNeg, chip: s.chipNeg, icono: 'alerta' },
};
const ESTAB: Record<string, string> = { alta: 'Ingresos parejos', media: 'Ingresos algo variables', baja: 'Ingresos muy variables' };
/** El título ya trae "Luz verde: ..."; la luz se muestra aparte, así que la sacamos del texto. */
const sinLuz = (t: string) => { const x = t.replace(/^Luz (verde|amarilla|roja):\s*/i, ''); return x.charAt(0).toUpperCase() + x.slice(1); };

export function Tesorero({ v }: { v: Vista }) {
  const t = v.tesoreria;
  const { recalcular, calculando } = useDatos();
  // Llegar con #t-mercado (desde Proyección): el bloque existe recién cuando hay datos, así que bajamos a él al montarse.
  useEffect(() => {
    if (window.location.hash !== '#t-mercado') return;
    const id = setTimeout(() => document.getElementById('t-mercado')?.scrollIntoView({ block: 'start' }), 120);
    return () => clearTimeout(id);
  }, [t]);

  if (!t) {
    return (
      <section className={s.card} aria-labelledby="t-tesorero">
        <div><h2 className={s.h2} id="t-tesorero">¿Hay plata para colocar?</h2>
          <p className={s.sub}>Todavía no tenemos el diagnóstico del tesorero para este cálculo. Actualizá para traerlo.</p></div>
        <div className={s.btnRow}><button type="button" className={s.btn} disabled={!!calculando} onClick={recalcular}>{calculando ? 'Actualizando…' : 'Actualizar el cálculo'}</button></div>
        <p className={s.legal} role="note">{AVISO_RESEARCHER}</p>
      </section>
    );
  }
  return <Diagnostico t={t} v={v} />;
}

function Diagnostico({ t, v }: { t: Tesoreria; v: Vista }) {
  const { abrirCarga } = useDatos();
  const d = t.veredicto.decision;
  const sinSaldo = !v.confiable;
  // Sin saldo confirmado no hay veredicto: no es "luz roja" (la caja no está mal), es que falta un paso.
  const luz = sinSaldo ? { texto: 'Sin luz todavía', box: s.estWarn, chip: s.chipWarn, icono: 'info' as const } : LUZ[d] ?? LUZ.no_invertir;
  return (
    <section className={s.card} aria-labelledby="t-tesorero">
      <div>
        <h2 className={s.h2} id="t-tesorero">¿Hay plata para colocar?</h2>
        <p className={s.sub}>Tu tesorero mira cómo está tu caja y te dice si hay luz verde, qué hacer primero y qué tipos de colocación entran. Es información educativa.</p>
      </div>

      <div className={`${s.estadoCaja} ${luz.box}`} role={d === 'no_invertir' && !sinSaldo ? 'alert' : 'status'}>
        <Icono n={luz.icono} />
        <strong><span className={`${s.chip} ${s.chipMini} ${luz.chip} ${s.luz}`}><i className={s.luzPunto} aria-hidden />{luz.texto}</span> {sinLuz(t.veredicto.titulo)}</strong>
        <p>{t.veredicto.motivo}</p>
      </div>
      {sinSaldo && (
        <div className={s.btnRow}>
          <button type="button" className={`${s.btn} ${s.btnPri}`} onClick={() => abrirCarga('saldo')}>Confirmar mi saldo</button>
        </div>
      )}
      <div className={s.badges}>
        {v.score && <span className={s.chip}>Salud de tu caja: <b className={s.num}>{Math.round(v.score.valor)}/100</b> · {String(v.score.categoria)}{v.score.preliminar ? ' (preliminar)' : ''}</span>}
        <span className={s.chip}>{ESTAB[t.estabilidad] ?? 'Ingresos sin medir'}</span>
      </div>

      {t.acciones.length > 0 && (
        <div>
          <h3 className={s.h3}>{d === 'no_invertir' ? 'Qué hacer primero' : 'Lo que haría tu tesorero'}</h3>
          <ol className={s.acciones}>
            {t.acciones.slice(0, 3).map((a, i) => (
              <li key={i}>
                <strong>{a.titulo}</strong>
                <small>{a.porque}</small>
                <span className={s.badges}><span className={`${s.chip} ${s.chipMini} ${s.chipAcc}`}>{a.impacto}</span><span className={`${s.chip} ${s.chipMini}`}>{a.plazo}</span></span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {t.bloque && <InformePlazos t={t} />}
      <Mercado t={t} />
      <p className={s.avisoBox} role="note">{AVISO_RESEARCHER}</p>
      <p className={s.legal}>{t.aviso}</p>
    </section>
  );
}

/* ---------- informe por plazos (luz verde o amarilla) ---------- */
const PERFILES: { id: Perfil; t: string }[] = [{ id: 'conservador', t: 'Conservador' }, { id: 'moderado', t: 'Moderado' }];

function InformePlazos({ t }: { t: Tesoreria }) {
  const [tolerancia, setTolerancia] = useState<Perfil>('moderado');
  const inf = useMemo<Informe | null>(() => { try { return investigar(t.bloque!, t.tasas, tolerancia); } catch { return null; } }, [t, tolerancia]);
  if (!inf) return null;
  const total = inf.tramos.reduce((a, x) => a + x.tramo.monto, 0);
  const ultimo = inf.tramos[inf.tramos.length - 1];
  return (
    <div className={s.research} aria-labelledby="t-informe">
      <div className={s.cardHead}>
        <div>
          <span className={s.eyebrow}>Informe educativo</span>
          <h3 className={s.h3} id="t-informe">Cómo ordenar los {millones(total)} que están arriba de tu reserva</h3>
        </div>
        <div className={s.seg} role="radiogroup" aria-label="Cuánto riesgo te animás a tomar">
          {PERFILES.map(p => <button key={p.id} type="button" role="radio" aria-checked={tolerancia === p.id} onClick={() => setTolerancia(p.id)}>{p.t}</button>)}
        </div>
      </div>
      <p className={s.perfilExplica} role="status" aria-live="polite">{inf.perfil.explica}</p>
      {inf.tramos.length > 1 && ultimo && <p className={s.sub}>Solo {millones(ultimo.tramo.monto)} te sobran los {ultimo.tramo.dias_horizonte} días; el resto lo vas a necesitar antes, por eso va a plazos más cortos.</p>}
      <p>{inf.enUnaLinea}</p>
      <ul className={s.prioridades}>{inf.prioridades.map((x, i) => <li key={i}>{x}</li>)}</ul>

      <div className={s.tramos}>
        {inf.tramos.map((x, i) => (
          <article key={i} className={s.tramo} aria-label={`${millones(x.tramo.monto)}, ${x.horizonteTexto}`}>
            <header>
              <b className={`${s.num} ${s.tramoMonto}`}>{millones(x.tramo.monto)}</b>
              <span className={`${s.chip} ${s.chipMini} ${s.chipAcc}`}>{x.horizonteTexto}</span>
            </header>
            <p className={s.sub}>Se necesita el <b>{fCorta(x.tramo.se_necesita_el)}</b> ({plural(x.tramo.dias_horizonte, 'día')}) para {x.tramo.uso_futuro}.</p>
            <ul className={s.catLista}>
              {x.clases.map(c => (
                <li key={c.nombre}>
                  <strong>{c.nombre}</strong>
                  <small>{c.nota}</small>
                  <span className={s.badges}>
                    <span className={`${s.chip} ${s.chipMini}`}>Liquidez: {c.liquidez}</span>
                    <span className={`${s.chip} ${s.chipMini} ${c.riesgo === 'medio' ? s.chipWarn : c.riesgo === 'alto' ? s.chipNeg : ''}`}>Riesgo {c.riesgo}</span>
                    {c.tna !== null && <span className={`${s.chip} ${s.chipMini}`}>{pct(c.tna)} TNA</span>}
                  </span>
                </li>
              ))}
            </ul>
            {x.rendimiento && (
              <p className={s.tramoRinde}>
                Como referencia: <b className={`${s.num} ${s.pos}`}>+{pesos(x.rendimiento.pesos)}</b> en {plural(x.tramo.dias_horizonte, 'día')} ({x.rendimiento.referencia}, {pct(x.rendimiento.tna)}).
                {' '}Descontada la inflación: <b className={`${s.num} ${x.rendimiento.realPesos < 0 ? s.neg : s.pos}`}>{x.rendimiento.realPesos >= 0 ? '+' : ''}{pesos(x.rendimiento.realPesos)}</b>.
              </p>
            )}
            <p className={s.sub}><b>Riesgo principal:</b> {x.riesgoPrincipal}</p>
            {x.noEntran.length > 0 && <p className={s.sub}><b>No entra:</b> {x.noEntran.join(' · ')}.</p>}
          </article>
        ))}
      </div>

      <details className={s.details}>
        <summary>Lo que puede salir mal</summary>
        <ul className={s.plegable}>{inf.puedeSalirMal.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </details>
      <details className={s.details}>
        <summary>Glosario</summary>
        <dl className={s.plegable}>{inf.glosario.map(g => <div key={g.t}><dt>{g.t}</dt><dd>{g.d}</dd></div>)}</dl>
      </details>
    </div>
  );
}

/* ---------- lectura del mercado argentino (siempre visible) ---------- */
function lecturas(t: Tesoreria): LecturaMercado[] {
  try {
    if (!t.tasas?.citas) return [];
    return analizarMercado(t.tasas).filter(l => l.cita && l.cita.dato);
  } catch { return []; }
}

function Mercado({ t }: { t: Tesoreria }) {
  const datos = useMemo(() => lecturas(t), [t]);
  return (
    <section className={s.research} id="t-mercado" aria-labelledby="t-mercado-h" tabIndex={-1}>
      <div>
        <span className={s.eyebrow}>Mercado argentino</span>
        <h3 className={s.h3} id="t-mercado-h">Lectura del mercado argentino</h3>
        <p className={s.sub}>Datos públicos del BCRA y el INDEC, del último período disponible, y qué significan para la plata de tu negocio.</p>
      </div>
      {datos.length ? (
        <div className={s.mercado}>
          {datos.map(l => (
            <article key={l.cita.dato} className={s.dato}>
              <span>{l.cita.dato}</span>
              <b className={`${s.num} ${l.tono === 'pos' ? s.pos : l.tono === 'neg' ? s.neg : ''}`}>{l.cita.valor}</b>
              <p>{l.lectura}</p>
              <small>{l.cita.periodo} · <a href={l.cita.url} target="_blank" rel="noopener noreferrer">{l.cita.fuente}<span className={s.sr}> (se abre en otra pestaña)</span></a></small>
            </article>
          ))}
        </div>
      ) : <p className={s.sub}>No pudimos traer los datos del mercado en este cálculo. Actualizá en un rato.</p>}
    </section>
  );
}
