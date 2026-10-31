'use client';
// Excedente: cuánto sobra de forma segura, por cuántos días, y qué CLASES genéricas de colocación encajan.
// No nombra emisores ni productos, no recomienda: deriva a un agente habilitado solo con consentimiento expreso.
import Link from 'next/link';
import { ConDatos, Faltantes } from '../_ui/comun';
import { Contacto, LEGAL, Rendimiento, SinGastos, Ventana } from '../_ui/excedente';
import { fCorta, pct, pesos, plural, type Excedente } from '../_ui/formato';
import { useDatos, type Vista } from '../_ui/datos';
import { FaltaSaldo } from '../_ui/v2';
import EnlaceMercado from '@/app/mercado/EnlaceMercado';
import s from '../app.module.css';

const VACIO_EX: Excedente = { hay: false, saldoActual: 0, colchon: 0, monto: 0, ventana: null, minimoProyectado: 0, rendimiento: null, clases: [], aviso: '' };

export default function PaginaExcedente() {
  return (
    <div className={s.pagina}>
      <div className={s.cabPagina}>
        <h1>Que la plata que te sobra no duerma</h1>
        <p>El <b>excedente</b> es lo que te sobra después de cubrir todos tus pagos de las próximas semanas y tu piso de seguridad. Acá ves cuánto es, por cuántos días, y qué tipos de colocación entran en ese plazo.</p>
      </div>
      <ConDatos>{v => <Contenido v={v} />}</ConDatos>
      <p className={s.legal} role="note">{LEGAL}</p>
    </div>
  );
}

function Contenido({ v }: { v: Vista }) {
  const ex = v.excedente;
  const { calculando } = useDatos();
  if (ex === undefined && calculando) return <div className={s.hueso} style={{ height: 220 }} role="status" aria-label="Calculando el excedente" />;
  if (!v.confiable) {
    return (
      <>
        <section className={s.card} aria-labelledby="t-falta">
          <h2 className={s.sr} id="t-falta">Falta confirmar tu saldo</h2>
          <FaltaSaldo que="Para calcular cuánto te sobra y por cuántos días necesitamos tu saldo real, no una estimación." />
          <Contacto v={v} ex={ex ?? VACIO_EX} />
        </section>
        {ex && ex.clases.length > 0 && <Clases ex={ex} titulo="Tipos de colocación (para cuando sepamos cuánto sobra)" />}
      </>
    );
  }
  if (!ex) {
    return (
      <section className={s.card} aria-labelledby="t-pend">
        <h2 className={s.h2} id="t-pend">El cálculo de excedente no está disponible</h2>
        <p className={s.sub}>El servidor no devolvió el excedente para este cálculo. Cuando esté, vas a ver acá el monto que podés colocar sin riesgo de quedarte sin caja, por cuántos días y cuánto rendiría, antes y después de la inflación.</p>
        <div className={s.btnRow}><Link href="/proyeccion" className={s.btn}>Ver la proyección</Link></div>
      </section>
    );
  }
  return ex.hay ? <ConExcedente v={v} ex={ex} /> : <SinExcedente v={v} ex={ex} />;
}

function Desglose({ ex }: { ex: Excedente }) {
  return (
    <dl className={s.desglose}>
      <div><dt>Saldo hoy</dt><dd className={s.num}>{pesos(ex.saldoActual)}</dd></div>
      <div><dt>Lo más bajo que llega tu caja</dt><dd className={`${s.num} ${ex.minimoProyectado < 0 ? s.neg : ''}`}>{pesos(ex.minimoProyectado)}</dd></div>
      <div><dt>Piso de seguridad (no se toca)</dt><dd className={s.num}>{pesos(ex.colchon)}</dd></div>
      <div><dt>Excedente disponible</dt><dd className={`${s.num} ${ex.monto > 0 ? s.pos : ''}`}>{pesos(ex.monto)}</dd></div>
    </dl>
  );
}

function SinExcedente({ v, ex }: { v: Vista; ex: Excedente }) {
  return (
    <>
      <div className={`${s.cols} ${s.c21}`}>
        <section className={s.card} aria-labelledby="t-no">
          <div className={`${s.estadoCaja} ${v.pronostico.hueco ? s.estNeg : s.estAcc}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.2v.1" /></svg>
            <strong id="t-no">Hoy no te sobra plata para colocar</strong>
            <p>{ex.motivo ?? 'Tu caja proyectada no deja un margen seguro por encima de la reserva.'}</p>
          </div>
          {v.pronostico.hueco && <div className={s.btnRow}><Link href="/proyeccion#cubrir" className={`${s.btn} ${s.btnPri}`}>Primero, cubrir el hueco</Link></div>}
          <Faltantes v={v} />
        </section>
        <section className={s.card} aria-labelledby="t-cuentas"><h2 className={s.h2} id="t-cuentas">Las cuentas</h2><Desglose ex={ex} /></section>
      </div>
      {ex.clases.length > 0 && <Clases ex={ex} titulo="Tipos de colocación (para cuando sobre)" />}
      <p className={s.legal}>{ex.aviso}</p>
    </>
  );
}

function ConExcedente({ v, ex }: { v: Vista; ex: Excedente }) {
  const w = ex.ventana;
  return (
    <>
      <div className={`${s.cols} ${s.c21}`}>
        <section className={`${s.card} ${s.protagonista}`} aria-labelledby="t-monto">
          <div className={s.hero}>
            <span className={s.eyebrow} id="t-monto">Podés colocar sin riesgo</span>
            <span className={`${s.heroNum} ${s.num}`}>{pesos(ex.monto)}</span>
            {w && <span className={s.heroSub}>por {plural(w.dias, 'día')}, del {fCorta(w.desde)} al {fCorta(w.hasta)}</span>}
          </div>
          {ex.colchon <= 0 && <SinGastos />}
          <Ventana v={v} ex={ex} />
          <Rendimiento ex={ex} />
          {ex.colchon > 0 && <Contacto v={v} ex={ex} />}
        </section>
        <section className={s.card} aria-labelledby="t-cuentas">
          <h2 className={s.h2} id="t-cuentas">Cómo lo calculamos</h2>
          <Desglose ex={ex} />
          <p className={s.sub}>El piso cubre tus gastos fijos aunque las ventas vengan peor. El excedente es lo que queda por encima del día más flojo de tu plata y del piso, durante todo el plazo. La plata que vas a necesitar antes no se coloca a un plazo más largo.</p>
          <Faltantes v={v} />
        </section>
      </div>
      <Clases ex={ex} titulo="Tipos de colocación que entran en ese plazo" />
      <section className={s.practica} aria-labelledby="t-practica">
        <h2 className={s.sr} id="t-practica">Practicar con un mercado ficticio</h2>
        <EnlaceMercado monto={ex.monto} horizonteMeses={w ? Math.max(1, Math.round(w.dias / 30)) : undefined} />
        <p className={s.sub}>Es práctica con datos ficticios. Tu caja real no viaja al módulo: del enlace solo van el monto y el plazo que ves acá.</p>
      </section>
      <p className={s.legal}>{ex.aviso}</p>
    </>
  );
}

function Clases({ ex, titulo }: { ex: Excedente; titulo: string }) {
  const orden = [...ex.clases].sort((a, b) => Number(b.encaja) - Number(a.encaja));
  return (
    <section className={s.card} aria-labelledby="t-clases">
      <div><h2 className={s.h2} id="t-clases">{titulo}</h2><p className={s.sub}>Tipos genéricos, sin emisores ni productos. Tasa anual (TNA) de referencia del BCRA.</p></div>
      <ul className={s.clases} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {orden.map(c => (
          <li key={c.id} className={`${s.clase} ${c.encaja ? '' : s.claseNo}`}>
            <span className={s.badges}>
              <span className={`${s.chip} ${c.encaja ? s.chipOk : ''}`}>{c.encaja ? '✓ Entra en el plazo' : 'No entra en el plazo'}</span>
              <span className={`${s.chip} ${c.riesgo === 'medio' ? s.chipWarn : ''}`}>Riesgo {c.riesgo}</span>
            </span>
            <strong style={{ fontFamily: 'var(--f-d)', fontSize: 16 }}>{c.nombre}</strong>
            <span className={`${s.tna} ${s.num}`}>{c.tnaRef != null ? pct(c.tnaRef) : 's/d'}<small>TNA ref.</small></span>
            <dl className={s.atributos}>
              <dt>Plazo mínimo</dt><dd>{c.plazoMinDias <= 1 ? 'sin plazo' : `${c.plazoMinDias} días`}</dd>
              <dt>Liquidez</dt><dd>{c.liquidez}</dd>
            </dl>
            <p style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{c.nota}</p>
            {c.cita && <a href={c.cita.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>{c.cita.fuente} · {c.cita.periodo}</a>}
          </li>
        ))}
      </ul>
    </section>
  );
}
