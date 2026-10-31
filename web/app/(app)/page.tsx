'use client';
// Inicio. Sin datos: arranque en 10 segundos (3 formas de cargar + demo en un clic).
// Con datos: saldo y alerta arriba, y los dos bloques que importan: próximos vencimientos y lo que podría generar el excedente.
import Link from 'next/link';
import { useState } from 'react';
import { Checklist, ConDatos, Esqueleto } from './_ui/comun';
import { Generando } from './_ui/excedente';
import { GraficoSaldo } from './_ui/graficos';
import { difDias, enDias, ETQ_ORIGEN, fCorta, fNum, millones, plural, pesos, sumarDias, type Evento } from './_ui/formato';
import { hoyLocal, progreso, useDatos, type Vista } from './_ui/datos';
import { AlertaAnticipada, AvisoSimulacion, ChipSaldo, ConfirmarSaldo, Educativo, Resumen3, ResumenEscenarios, ScoreCard } from './_ui/v2';
import { Icono, type NombreIcono } from './_ui/iconos';
import { BannerPerfil, GrillaPerfiles } from './_ui/perfiles';
import { Tesorero } from './_ui/tesorero';
import { iniciarTour, useTourVisto } from './_ui/recorrido';
import s from './app.module.css';

export default function Inicio() {
  const { listo, ws, vista, calculando } = useDatos();
  if (!listo) return <div className={s.pagina}><Esqueleto /></div>;
  if (ws.modo === 'vacio' && !vista) return <Bienvenida />;
  if (!vista && calculando && ws.modo === 'propio') return <div className={s.pagina}><Checklist compacto /><Esqueleto /></div>;
  return <div className={s.pagina}><ConDatos>{v => <Hoy v={v} />}</ConDatos></div>;
}

/* ---------- sin datos ---------- */
function Bienvenida() {
  const { abrirCarga, cargarDemo } = useDatos();
  const visto = useTourVisto();
  const acciones: { v: 'mp' | 'archivos' | 'menu'; i: NombreIcono; t: string; d: string }[] = [
    { v: 'mp', i: 'mp', t: 'Conectar Mercado Pago', d: 'Traemos tus cobros y pagos de los últimos 90 días. Después confirmás tu saldo.' },
    { v: 'archivos', i: 'archivo', t: 'Subir archivos', d: 'Extracto del banco, comprobantes de ARCA, boletas.' },
    { v: 'menu', i: 'factura', t: 'Cargar a mano', d: 'Tu saldo, un gasto o una factura. Cuatro datos.' },
  ];
  return (
    <div className={`${s.pagina} ${s.bienvenida}`}>
      <section className={s.promesa} aria-labelledby="t-promesa">
        <span className={s.eyebrow}>CFO de Bolsillo</span>
        <h1 id="t-promesa">Sabé hoy si te va a alcanzar la plata. Y qué hacer con la que sobra.</h1>
        <p>Te mostramos cómo va a estar tu plata las próximas semanas: qué vence, qué día te falta para pagar y qué hacer con la que sobra.</p>
        {/* La demo guiada se ofrece hasta que el usuario la ve; después queda en Datos. */}
        {visto === false && (
          <div className={s.btnRow}>
            <button type="button" className={`${s.btn} ${s.btnDemo}`} onClick={() => { cargarDemo(); iniciarTour(); }}>
              <Icono n="demo" size={18} />Ver demo en 1 clic
            </button>
            <span className={s.sub}>Te mostramos paso a paso cómo usar la app, con un negocio inventado.</span>
          </div>
        )}
      </section>

      <section aria-labelledby="t-empezar" className={s.empezar}>
        <h2 className={s.h2} id="t-empezar">Empezá con tus datos</h2>
        <ul className={s.acciones3}>
          {acciones.map(a => (
            <li key={a.v}>
              <button type="button" className={s.accionGrande} onClick={() => abrirCarga(a.v)}>
                <span className={s.accionIco}><Icono n={a.i} size={26} /></span>
                <strong>{a.t}</strong>
                <small>{a.d}</small>
                <span className={s.accionIr} aria-hidden>Empezar →</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <GrillaPerfiles id="t-perfiles" />

      <Checklist />

      <section className={s.glosario} aria-label="Palabras que vas a ver">
        <div><b>Saldo</b><span>La plata que tenés hoy, en el banco y en Mercado Pago.</span></div>
        <div><b>Vencimiento</b><span>El día que tenés que pagar algo: una factura, un impuesto, los sueldos.</span></div>
        <div><b>Excedente</b><span>Lo que te sobra después de cubrir todo y tu piso de seguridad. Puede rendir mientras no lo usás.</span></div>
      </section>
      <p className={s.legal}>Tus datos quedan en este navegador; los mandamos al servidor solo para hacer la cuenta. No compartimos nada sin tu permiso.</p>
    </div>
  );
}

/* ---------- con datos ---------- */
const OBLIG = new Set(['sueldos', 'aguinaldo', 'cargas_sociales', 'impuestos', 'alquiler', 'servicios', 'proveedores', 'otros', 'retiros', 'bancarios']);

function Hoy({ v }: { v: Vista }) {
  const p = v.pronostico;
  const { ws } = useDatos();
  const [editar, setEditar] = useState(false);
  const incompleto = ws.modo === 'propio' && progreso(ws, v).some(x => !x.hecho);
  const lateral = incompleto || !!v.score;
  const viejo = ws.saldo ? difDias(ws.saldo.fecha, hoyLocal()) : 0;
  return (
    <>
      {ws.modo === 'perfil' && <BannerPerfil v={v} />}
      <AvisoSimulacion />
      <AlertaAnticipada v={v} />
      <div className={`${s.cols} ${lateral ? s.c21 : ''}`}>
        <section className={`${s.card} ${s.protagonista}`} aria-labelledby="t-saldo">
          <div className={s.hero}>
            <span className={s.eyebrow} id="t-saldo">{v.confiable ? 'Tu saldo hoy' : 'Tu saldo estimado'} · {fNum(p.hoy)}</span>
            <span className={`${s.heroNum} ${s.num} ${!v.confiable ? s.estimado : p.saldoInicial < 0 ? s.neg : ''}`}>{pesos(p.saldoInicial)}</span>
            <span className={s.heroFila}>
              <ChipSaldo v={v} />
              <span className={s.heroSub}>{v.pyme}{v.ficticia ? ' (negocio inventado)' : ''}</span>
            </span>
            {!v.confiable && v.saldo.nota && <p className={s.sub}>{v.saldo.nota}</p>}
          </div>
          {!v.confiable ? <ConfirmarSaldo v={v} botonDemo={false} />
            : editar ? <ConfirmarSaldo v={v} modo="actualizar" onListo={() => setEditar(false)} />
              : (
                <>
                  {ws.saldo && (
                    <p className={s.sub}>
                      {viejo > 2 ? <>Lo cargaste hace {plural(viejo, 'día')}. </> : null}
                      <button type="button" className={s.link} style={{ minHeight: 0 }} onClick={() => setEditar(true)}>Actualizar saldo</button>
                    </p>
                  )}
                  <Resumen3 v={v} />
                </>
              )}
        </section>
        {lateral && (
          <div className={s.pila}>
            {incompleto && <Checklist compacto />}
            <ScoreCard v={v} />
          </div>
        )}
      </div>

      <div className={`${s.cols} ${s.c2}`}>
        <Vencimientos v={v} />
        <Generando v={v} />
      </div>

      <div className={`${s.cols} ${s.c2}`}>
        <ResumenEscenarios v={v} />
        <Grafico30 v={v} id="t-30" />
      </div>

      <Tesorero v={v} />

      <Educativo v={v} terminos={['Saldo', 'Hueco', 'Piso de seguridad', 'Escenario', 'Excedente']} />
    </>
  );
}

function Grafico30({ v, id }: { v: Vista; id: string }) {
  return (
    <section className={s.card} aria-labelledby={id}>
      <div className={s.cardHead}>
        <div><h2 className={s.h2} id={id}>Tu plata los próximos 30 días</h2><p className={s.sub}>{v.confiable ? 'Tocá o pasá el mouse para ver cada día.' : 'Con el saldo estimado: confirmalo para que sea real.'}</p></div>
        <Link href="/proyeccion" className={s.link}>Ver las próximas semanas</Link>
      </div>
      <GraficoSaldo p={v.pronostico} horizonte={30} compacto conTabla={false} piso={v.minimoSeguridad?.monto ?? null} />
    </section>
  );
}

function Vencimientos({ v }: { v: Vista }) {
  const p = v.pronostico;
  const { abrirCarga } = useDatos();
  const fin = sumarDias(p.hoy, 30);
  const todos: Evento[] = p.eventos
    .filter(e => e.fecha > p.hoy && e.fecha <= fin && e.monto < 0 && OBLIG.has(e.categoria))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.monto - b.monto);
  const lista = todos.slice(0, 6);
  const total = todos.reduce((a, e) => a + e.monto, 0);
  const vencidas = v.alertas?.alertas.find(a => a.tipo === 'vencida');
  const saldoEn = (f: string) => p.serie.find(d => d.fecha === f)?.saldo ?? null;

  return (
    <section className={`${s.card} ${s.protagonista}`} aria-labelledby="t-venc">
      <div className={s.cardHead}>
        <div>
          <h2 className={s.h2} id="t-venc">Próximos vencimientos</h2>
          <p className={s.sub}>{todos.length ? <>En los próximos 30 días pagás <b className={s.num}>{millones(-total)}</b> en {plural(todos.length, 'vencimiento')}.</> : 'Lo que tenés que pagar y cuándo.'}</p>
        </div>
        <button type="button" className={s.btnChico} onClick={() => abrirCarga('factura')}>+ Factura</button>
      </div>
      {vencidas && (
        <div className={`${s.estadoCaja} ${s.estNeg}`} role="alert">
          <Icono n="alerta" />
          <strong>{vencidas.titulo}</strong>
          <p>{vencidas.detalle}</p>
        </div>
      )}
      {lista.length ? (
        <ul className={s.lista}>
          {lista.map((e, i) => {
            const despues = v.confiable ? saldoEn(e.fecha) : null; // con saldo estimado no decimos cuánto te queda
            const dias = difDias(p.hoy, e.fecha);
            const estimado = e.origen === 'factura estimada' || e.origen === 'recurrente' || e.origen === 'proyección de ventas';
            const estado = despues != null && despues < 0 ? { t: 'No alcanza', c: s.chipNeg } : dias <= 3 ? { t: enDias(dias).replace(/^en /, 'En '), c: s.chipWarn } : estimado ? { t: 'Estimado', c: '' } : { t: ETQ_ORIGEN[e.origen] ?? 'Programado', c: s.chipAcc };
            return (
              <li key={i} className={`${s.item} ${s.itemVenc}`}>
                <span className={s.fecha}><b className={s.num}>{+e.fecha.slice(8, 10)}</b><small>{fCorta(e.fecha).split(' ')[0]}</small></span>
                <span className={s.itemTexto}>
                  <strong title={e.concepto}>{e.concepto}</strong>
                  <small><span className={`${s.chip} ${s.chipMini} ${estado.c}`}>{estado.t}</span>{despues != null && <span className={s.quedan}>te quedan <b className={`${s.num} ${despues < 0 ? s.neg : ''}`}>{millones(despues)}</b></span>}</small>
                </span>
                <span className={`${s.monto} ${s.num}`}>{millones(e.monto)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className={s.vacioChico}>
          <p>No vemos pagos en los próximos 30 días. Si tenés facturas, impuestos o sueldos por pagar, cargalos y te avisamos antes de que venzan.</p>
          <button type="button" className={`${s.btn} ${s.btnPri}`} onClick={() => abrirCarga('factura')}>Cargar una factura</button>
        </div>
      )}
      {todos.length > lista.length && <p className={s.sub}>Y {plural(todos.length - lista.length, 'vencimiento')} más.</p>}
      <div className={s.btnRow}>
        <Link href="/proyeccion#movimientos" className={s.link}>Ver todos los movimientos</Link>
        <Link href="/datos#avisos" className={s.link}>Avisarme antes de cada vencimiento</Link>
      </div>
    </section>
  );
}
