'use client';
// Piezas del excedente compartidas por Inicio y Excedente: aviso legal, pedido de contacto con consentimiento
// (sellado con destino 'alyc-demo') y el resumen "mientras tanto, tu plata podría estar generando".
import Link from 'next/link';
import { useId, useState } from 'react';
import { SelloListo, sellar } from './comun';
import { FaltaSaldo, VistaPreviaResearcher } from './v2';
import { useDatos, type Vista } from './datos';
import { difDias, fCorta, fNum, pct, pesos, plural, type Excedente, type Sello } from './formato';
import s from '../app.module.css';

export const LEGAL = 'CFO de Bolsillo no es un agente de bolsa ni asesor financiero, no custodia fondos y no recomienda emisores ni productos. Las tasas son de referencia (BCRA) y no garantizan resultados. Las condiciones reales las informa cada entidad habilitada por la CNV o el BCRA.';
export const CONSENT = 'Autorizo a CFO de Bolsillo a compartir mi proyección de caja y el excedente estimado con un agente habilitado por la CNV, para que me contacte. Entiendo que no es una recomendación de inversión.';

/** Barra de la ventana: cuántos de los próximos días la plata puede estar colocada. */
export function Ventana({ v, ex }: { v: Vista; ex: Excedente }) {
  const w = ex.ventana;
  if (!w) return null;
  const total = Math.max(1, v.pronostico.serie.length);
  const izq = Math.max(0, Math.min(100, (difDias(v.pronostico.hoy, w.desde) / total) * 100));
  const ancho = Math.max(2, Math.min(100 - izq, (w.dias / total) * 100));
  return (
    <div className={s.ventana}>
      <div className={s.ventanaBarra} role="img" aria-label={`La plata puede estar colocada ${w.dias} de los próximos ${total} días`}><i style={{ left: `${izq}%`, width: `${ancho}%` }} /></div>
      <div className={s.ventanaEtq}><span>hoy {fNum(v.pronostico.hoy).slice(0, 5)}</span><span>{w.dias < total ? `hasta el ${fCorta(w.hasta)}` : ''}</span><span>{total} días</span></div>
    </div>
  );
}

/** Rendimiento estimado: nominal, real, y la comparación honesta con dejarla quieta. */
export function Rendimiento({ ex }: { ex: Excedente }) {
  const r = ex.rendimiento;
  if (!r || !ex.ventana) return null;
  const inflacion = r.pesos - r.realPesos; // lo que se come la inflación en la ventana
  return (
    <div className={s.rinde}>
      <div><span>Podría generar</span><b className={`${s.num} ${s.pos}`}>+{pesos(r.pesos)}</b><small>en {plural(ex.ventana.dias, 'día')}, a {pct(r.tna)} anual de referencia</small></div>
      <div><span>Descontada la inflación</span><b className={`${s.num} ${r.realPesos < 0 ? s.neg : s.pos}`}>{r.realPesos >= 0 ? '+' : ''}{pesos(r.realPesos)}</b>
        <small>{r.realPesos < 0 ? 'Con la inflación proyectada pierde poder de compra.' : 'Le gana a la inflación proyectada.'}</small></div>
      <div><span>Si la dejás quieta</span><b className={`${s.num} ${s.neg}`}>{pesos(-inflacion)}</b><small>lo que la inflación le saca en esos días</small></div>
    </div>
  );
}

/** Sin gastos conocidos la reserva da cero y todo parece sobrante: lo decimos antes de mostrar el número. */
export function SinGastos() {
  const { abrirCarga } = useDatos();
  return (
    <div className={s.avisoBox} role="note">
      Todavía no conocemos tus gastos, así que no podemos calcular la reserva y este número está inflado.
      {' '}<button type="button" className={s.link} style={{ minHeight: 0 }} onClick={() => abrirCarga()}>Cargá movimientos o facturas</button> para que sea real.
    </div>
  );
}

/** Bloque protagonista de Inicio. */
export function Generando({ v }: { v: Vista }) {
  const ex = v.excedente;
  const { calculando, abrirCarga } = useDatos();
  return (
    <section className={`${s.card} ${s.protagonista}`} aria-labelledby="t-genera">
      <div className={s.cardHead}>
        <div>
          <h2 className={s.h2} id="t-genera">Que la plata que te sobra no duerma en la cuenta</h2>
          <p className={s.sub}>El <b>excedente</b> es lo que te sobra después de cubrir todos tus pagos y tu piso de seguridad. Esa parte podría rendir algo hasta que la necesites.</p>
        </div>
      </div>
      {!v.confiable ? <FaltaSaldo que="Para saber cuánto te sobra necesitamos tu saldo real." />
        : ex === undefined ? (calculando ? <div className={s.hueso} style={{ height: 120 }} role="status" aria-label="Calculando el excedente" />
        : <p className={s.sub}>Este servidor todavía no calcula el excedente.</p>)
        : ex === null ? <p className={s.sub}>No hay excedente para este cálculo.</p>
          : ex.hay ? (
            <>
              <div className={s.hero}>
                <span className={s.eyebrow}>Te sobran sin riesgo</span>
                <span className={`${s.heroNum} ${s.heroMedio} ${s.num}`}>{pesos(ex.monto)}</span>
                {ex.ventana && <span className={s.heroSub}>por {plural(ex.ventana.dias, 'día')}, sin tocar una reserva de {pesos(ex.colchon)}</span>}
              </div>
              {ex.colchon <= 0 && <SinGastos />}
              <Ventana v={v} ex={ex} />
              <Rendimiento ex={ex} />
              {ex.colchon > 0 && <Contacto v={v} ex={ex} />}
            </>
          ) : (
            <div className={`${s.estadoCaja} ${v.pronostico.hueco ? s.estNeg : s.estAcc}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.2v.1" /></svg>
              <strong>Hoy no te sobra plata para colocar</strong>
              <p>{ex.motivo ?? 'Tu caja proyectada no deja un margen seguro por encima de la reserva.'}{v.pronostico.hueco ? ' Primero conviene cubrir el hueco.' : ''}</p>
            </div>
          )}
      {v.confiable && v.avisos.length > 0 && (
        <p className={s.sub}>Para calcularlo mejor: {v.avisos[0]} <button type="button" className={s.link} onClick={() => abrirCarga()}>Cargar</button></p>
      )}
      <div className={s.btnRow}>
        <Link href="/excedente" className={s.link}>Ver el detalle y los tipos de colocación</Link>
      </div>
      <p className={s.legal} role="note">{LEGAL}</p>
    </section>
  );
}

/** Pedido de contacto con un agente habilitado: consentimiento explícito y carpeta sellada. */
export function Contacto({ v, ex, bloqueo }: { v: Vista; ex: Excedente; bloqueo?: string | null }) {
  const { agregarSello } = useDatos();
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [ok, setOk] = useState(false);
  const [env, setEnv] = useState(false);
  const [sello, setSello] = useState<Sello | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function enviar() {
    if (!ok) return;
    setEnv(true); setErr(null);
    try {
      const titulo = `Contacto por excedente de ${pesos(ex.monto)}${ex.ventana ? ` por ${ex.ventana.dias} días` : ''}`;
      const x = await sellar(v, 'alyc-demo', { id: 'excedente', titulo }, CONSENT, {
        excedente: { monto: ex.monto, colchon: ex.colchon, ventana: ex.ventana },
        ...(v.paraResearcher && { paraResearcher: v.paraResearcher }),
      });
      setSello(x); agregarSello(x);
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setErr(/destino/i.test(m) ? 'El servidor todavía no tiene habilitado el destino "agente habilitado". No se compartió nada.' : m || 'No pude enviar el pedido.');
    } finally { setEnv(false); }
  }

  if (sello) return <SelloListo sello={sello} />;
  const motivo = bloqueo ?? (!v.confiable ? 'Disponible cuando confirmes tu saldo: sin él, el excedente puede no existir.' : null);
  return (
    <div className={s.contacto}>
      {!abierto || motivo ? (
        <>
          <button type="button" className={`${s.btn} ${s.btnPri}`} onClick={() => setAbierto(true)} disabled={!!motivo} aria-describedby={motivo ? `${id}m` : undefined}>Quiero que me contacte un agente habilitado</button>
          <p className={s.sub} id={`${id}m`}>{motivo ?? 'Un agente habilitado por la CNV te explica las alternativas y sus condiciones. No compartimos nada sin tu permiso.'}</p>
        </>
      ) : (
        <>
          <VistaPreviaResearcher datos={v.paraResearcher} />
          <label className={s.consent} htmlFor={`${id}c`}>
            <input id={`${id}c`} type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} />
            <span>{CONSENT}{v.ficticia ? ' (Demo: el destino es un agente de prueba.)' : ''}</span>
          </label>
          <div className={s.btnRow}>
            <button type="button" className={`${s.btn} ${s.btnPri}`} disabled={!ok || env} onClick={enviar}>{env ? 'Enviando y sellando…' : 'Autorizar y pedir el contacto'}</button>
            <button type="button" className={s.btn} onClick={() => { setAbierto(false); setOk(false); }}>Cancelar</button>
          </div>
        </>
      )}
      {err && <div className={s.errorBox} role="alert">No se envió el pedido.<p>{err}</p></div>}
    </div>
  );
}
