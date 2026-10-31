'use client';
// Piezas del "CFO de bolsillo" (skill v2): saldo honesto, alerta anticipada, resumen en 3 líneas, escenarios y
// "¿y si cobro menos?", orden de pagos, score, capa educativa y vista previa de lo que se compartiría.
// Todo tolera un servidor viejo: si falta un campo nuevo, se deduce de lo que hay o la pieza no se muestra.
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { errMonto, InputMonto } from './Cargar';
import { hoyLocal, progreso, useDatos, type Vista, type VistaCarga } from './datos';
import { describirSup, esBase } from './escenarios';
import { GraficoEscenarios, SERIES_ESC, TablaEscenarios } from './graficos';
import {
  difDias, fCorta, fLarga, fNum, leerMonto, millones, pct, pesos, plural, sumarDias, teaPct,
  type Faltante, type NombreEscenario, type OpcionV2, type OrdenPago, type Supuestos,
} from './formato';
import { Icono } from './iconos';
import s from '../app.module.css';

export const AVISO_ORIENTATIVO = 'Este diagnóstico es orientativo y no reemplaza el análisis de tu contador ni la evaluación de un banco.';

/* ====================================================================== */
/* Saldo                                                                   */
const ORIGEN: Record<string, string> = {
  manual: 'Confirmado por vos', extracto: 'Confirmado con tu extracto', 'mp-api': 'Confirmado con Mercado Pago', demo: 'Negocio de demo',
};

export function ChipSaldo({ v }: { v: Vista }) {
  const { ws } = useDatos();
  if (!v.saldo.confirmado) return <span className={`${s.chip} ${s.chipWarn}`}>Estimado, sin confirmar</span>;
  const cuando = v.saldo.origen === 'manual' && ws.saldo ? ` el ${fNum(ws.saldo.fecha).slice(0, 5)}` : '';
  return <span className={`${s.chip} ${v.saldo.origen === 'demo' ? '' : s.chipOk}`}>{ORIGEN[v.saldo.origen] ?? 'Confirmado'}{cuando}</span>;
}

/** El paso que falta cuando el saldo es una estimación. Campo numérico + fecha de hoy. */
export function ConfirmarSaldo({ v, modo = 'confirmar', onListo, botonDemo = true }: { v: Vista; modo?: 'confirmar' | 'actualizar'; onListo?: () => void; botonDemo?: boolean }) {
  const { ws, ponerSaldo } = useDatos();
  const id = useId();
  const hoy = hoyLocal();
  const esMP = ws.mp || String(v.saldo.origen).startsWith('mp');
  const [monto, setMonto] = useState(modo === 'actualizar' && ws.saldo ? String(ws.saldo.monto).replace('.', ',') : '');
  const [tocado, setTocado] = useState(false);
  const err = tocado ? errMonto(monto, false) : null;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (modo === 'actualizar') ref.current?.querySelector('input')?.focus(); }, [modo]);

  function enviar(e: FormEvent) {
    e.preventDefault();
    setTocado(true);
    const n = leerMonto(monto);
    if (errMonto(monto, false) || n === null) { document.getElementById(`${id}m`)?.focus(); return; }
    ponerSaldo(hoy, n);
    onListo?.();
  }
  const titulo = modo === 'actualizar' ? 'Actualizá tu saldo' : esMP ? 'Confirmá tu saldo de Mercado Pago' : 'Confirmá tu saldo de hoy';
  return (
    <div ref={ref} className={s.confirmar} role="region" aria-labelledby={`${id}t`}>
      {modo === 'confirmar' && <span className={s.eyebrow}>Falta un paso</span>}
      <h2 className={s.h2} id={`${id}t`}>{titulo}</h2>
      <p>{esMP ? 'Abrí la app de Mercado Pago y mirá cuánto tenés disponible. Si también tenés plata en el banco, sumala.' : 'Mirá en tu banco y en Mercado Pago cuánto tenés disponible hoy y escribí el total.'}</p>
      <form className={s.confirmarForm} onSubmit={enviar} noValidate>
        <div className={s.campo}>
          <label htmlFor={`${id}m`}>Disponible hoy, {fNum(hoy)}</label>
          <InputMonto id={`${id}m`} valor={monto} setValor={setMonto} error={err} onBlur={() => setTocado(true)} />
          {err && <span id={`${id}m-err`} className={s.campoErr} role="alert">{err}</span>}
        </div>
        <div className={s.btnRow}>
          <button type="submit" className={`${s.btn} ${s.btnPri}`}>{modo === 'actualizar' ? 'Guardar saldo' : 'Confirmar saldo'}</button>
          {onListo && modo === 'actualizar' && <button type="button" className={s.btn} onClick={onListo}>Cancelar</button>}
        </div>
      </form>
      {modo === 'confirmar' && botonDemo && v.perfil && (
        <div className={s.btnRow}>
          <button type="button" className={s.btn} onClick={() => ponerSaldo(hoy, v.perfil!.saldoSugerido)}>Usar el saldo de la demo ({pesos(v.perfil.saldoSugerido)})</button>
        </div>
      )}
      {modo === 'confirmar' && <p className={s.sub}>Hasta que lo confirmes no te decimos si te alcanza: el número de arriba es una estimación.</p>}
    </div>
  );
}

/** Motivo por el que algo queda deshabilitado mientras el saldo no está confirmado. */
export function FaltaSaldo({ que }: { que: string }) {
  const { abrirCarga } = useDatos();
  return (
    <div className={`${s.estadoCaja} ${s.estWarn}`} role="note">
      <Icono n="info" />
      <strong>Primero confirmá tu saldo</strong>
      <p>{que} Con un saldo estimado podríamos decirte que te sobra plata que no tenés.
        {' '}<button type="button" className={s.link} style={{ minHeight: 0 }} onClick={() => abrirCarga('saldo')}>Confirmar mi saldo</button></p>
    </div>
  );
}

/* ====================================================================== */
/* Alerta anticipada                                                        */
type Alerta = { nivel: 'neg' | 'warn'; texto: string; sub?: string };

function pagoMayor(v: Vista, fecha: string): string | null {
  const e = v.pronostico.eventos.filter(x => x.fecha === fecha && x.monto < 0).sort((a, b) => a.monto - b.monto)[0];
  return e ? e.concepto : null;
}
const saldoEn = (v: Vista, f: string) => v.pronostico.serie.find(d => d.fecha === f)?.saldo ?? null;

/** Primer día en que el saldo base queda por debajo del piso (sin estar en rojo). */
export function bajoPiso(v: Vista) {
  const piso = v.minimoSeguridad?.monto;
  if (!piso) return null;
  const d = v.pronostico.serie.find(x => x.saldo < piso);
  return d ? { fecha: d.fecha, saldo: d.saldo, piso } : null;
}

export function alertaDe(v: Vista): Alerta | null {
  if (!v.confiable) return null;
  const p = v.pronostico;
  const h = p.hueco;
  if (v.alertaAnticipada) {
    // El servidor ya trae el texto con el formato de la skill; separamos la invitación final para mostrarla abajo.
    const [texto, resto] = v.alertaAnticipada.texto.split(/\s(?=Estas son tus opciones)/);
    return v.alertaAnticipada.confirmado ? { nivel: v.alertaAnticipada.nivel, texto, sub: resto } : null;
  }
  if (v.alertaAnticipada === null) return null;
  const dias = (f: string) => difDias(p.hoy, f);
  const plazo = (n: number) => (n <= 0 ? 'Es hoy: hay que resolverlo ya.' : `Tenés ${plural(n, 'día')} para resolverlo.`);
  if (h && dias(h.inicio) <= 30) {
    const falta = -(saldoEn(v, h.inicio) ?? h.minimo);
    const z = pagoMayor(v, h.inicio);
    return {
      nivel: 'neg',
      texto: `El ${fLarga(h.inicio)} te faltarían ${pesos(falta)}${z ? ` para pagar ${z}` : ' para cubrir tus pagos'}. ${plazo(dias(h.inicio))}`,
      sub: h.minimo < -falta ? `El peor día es el ${fCorta(h.fechaMinimo)}: te faltarían ${millones(-h.minimo)}. Abajo están tus opciones, de la más barata a la más cara.` : 'Abajo están tus opciones, de la más barata a la más cara.',
    };
  }
  const hp = v.escenarios.pesimista.hueco;
  if (!h && hp && dias(hp.inicio) <= 60) {
    return {
      nivel: 'warn',
      texto: `Si te pagan más tarde y vendés menos, el ${fLarga(hp.inicio)} te faltarían ${pesos(-hp.minimo)}. Tenés ${plural(Math.max(0, dias(hp.inicio)), 'día')} para prepararte.`,
      sub: 'No es lo más probable, pero conviene tener un plan: mirá qué pagos podés mover.',
    };
  }
  const bp = bajoPiso(v);
  if (!h && bp && dias(bp.fecha) <= 60) {
    return {
      nivel: 'warn',
      texto: `El ${fLarga(bp.fecha)} tu plata baja de tu piso de seguridad: te quedarían ${pesos(bp.saldo)} y tu piso es ${pesos(bp.piso)}. Tenés ${plural(Math.max(0, dias(bp.fecha)), 'día')} para acomodarlo.`,
    };
  }
  if (h) {
    const falta = -(saldoEn(v, h.inicio) ?? h.minimo);
    const z = pagoMayor(v, h.inicio);
    return { nivel: 'warn', texto: `El ${fLarga(h.inicio)} te faltarían ${pesos(falta)}${z ? ` para pagar ${z}` : ''}. Tenés ${plural(dias(h.inicio), 'día')} para resolverlo con calma.` };
  }
  return null;
}

export function AlertaAnticipada({ v, conLink = true }: { v: Vista; conLink?: boolean }) {
  const a = alertaDe(v);
  if (!a) return null;
  return (
    <section className={`${s.alertaCard} ${a.nivel === 'neg' ? s.alertaNeg : s.alertaWarn}`} role={a.nivel === 'neg' ? 'alert' : 'status'} aria-label="Alerta anticipada">
      <Icono n="alerta" size={24} />
      <div>
        <strong>{a.texto}</strong>
        {a.sub && <p>{a.sub}</p>}
      </div>
      {conLink && <Link href="/proyeccion#cubrir" className={`${s.btn} ${a.nivel === 'neg' ? s.btnPri : ''}`}>Ver qué hacer</Link>}
    </section>
  );
}

/* ====================================================================== */
/* Resumen en 3 líneas + la acción más importante                          */
type Accion = { texto: string; href?: string; carga?: VistaCarga };

export function accionPrincipal(v: Vista, incompleto: boolean): Accion {
  if (!v.confiable) return { texto: 'Confirmá tu saldo', carga: 'saldo' };
  if (v.pronostico.hueco) return { texto: 'Ver cómo cubrir el hueco', href: '/proyeccion#cubrir' };
  if (bajoPiso(v)) return { texto: 'Ver qué pagos podés mover', href: '/proyeccion#cubrir' };
  if (v.excedente?.hay) return { texto: 'Hacer que la plata que te sobra no duerma', href: '/excedente' };
  if (incompleto) return { texto: 'Cargar lo que falta', carga: 'menu' };
  return { texto: 'Avisarme antes de cada vencimiento', href: '/datos#avisos' };
}

export function Resumen3({ v }: { v: Vista }) {
  const { ws, abrirCarga } = useDatos();
  const p = v.pronostico;
  const h = p.hueco;
  const semanas = Math.max(1, Math.floor(p.serie.length / 7));
  const min = p.serie.length ? p.serie.reduce((a, b) => (b.saldo < a.saldo ? b : a)) : null;
  const bp = bajoPiso(v);
  const incompleto = ws.modo === 'propio' && progreso(ws, v).some(x => !x.hecho);
  const acc = accionPrincipal(v, incompleto);

  const l1: ReactNode = h
    ? (difDias(p.hoy, h.inicio) > 1
      ? <>Hasta el {fCorta(sumarDias(h.inicio, -1))} cubrís todo. <b>El {fLarga(h.inicio)} te falta plata para pagar.</b></>
      : <><b>Esta semana te falta plata para pagar</b>: arrancá por las opciones sin costo.</>)
    : bp ? <>Te alcanza, pero <b>el {fCorta(bp.fecha)} tu plata baja de tu piso de seguridad</b>.</>
      : <><b>Te alcanza:</b> no te falta plata en las próximas {semanas} semanas.</>;
  const l2: ReactNode = v.score
    ? <>Tu salud financiera: <b className={s.num}>{Math.round(v.score.valor)}/100</b>, categoría {v.score.categoria}{v.score.preliminar ? (v.score.rango && v.score.rango[0] !== v.score.rango[1] ? ` (preliminar: entre ${Math.round(v.score.rango[0])} y ${Math.round(v.score.rango[1])})` : ' (preliminar)') : ''}.</>
    : min ? <>Lo más bajo que llega tu plata: <b className={`${s.num} ${min.saldo < 0 ? s.neg : ''}`}>{millones(min.saldo)}</b>, el {fCorta(min.fecha)}.</> : null;
  const l3: ReactNode = <>Lo más importante ahora: <b>{acc.texto.toLowerCase()}</b>.</>;

  return (
    <div className={s.resumen3}>
      <ol aria-label="Resumen">
        <li>{l1}</li>
        {l2 && <li>{l2}</li>}
        <li>{l3}</li>
      </ol>
      <div className={s.btnRow}>
        {acc.href ? <Link href={acc.href} className={`${s.btn} ${s.btnPri}`}>{acc.texto}</Link>
          : <button type="button" className={`${s.btn} ${s.btnPri}`} onClick={() => abrirCarga(acc.carga)}>{acc.texto}</button>}
        {!acc.href?.startsWith('/proyeccion') && <Link href="/proyeccion" className={s.btn}>Ver las próximas semanas</Link>}
      </div>
    </div>
  );
}
const rangoTxt = (v: number, r?: [number, number]) => (r && r[0] !== r[1] ? `${Math.round(r[0])}–${Math.round(r[1])}` : `${Math.round(v)}`);

/* ====================================================================== */
/* ¿Y si cobro menos?                                                       */
const BAJAS = [{ f: 1, t: 'Como siempre' }, { f: 0.9, t: '−10%' }, { f: 0.8, t: '−20%' }, { f: 0.7, t: '−30%' }];

export function QueSi({ v }: { v: Vista }) {
  const { supuestos, ponerSupuestos, calculando } = useDatos();
  const id = useId();
  const f = supuestos.ventas ?? 1;
  const tarde = (supuestos.demoraCobros ?? 0) >= 15;
  const poner = (x: Supuestos) => ponerSupuestos({ ...supuestos, ...x });
  const activo = !esBase(supuestos);
  const p = v.pronostico;
  const min = p.serie.length ? p.serie.reduce((a, b) => (b.saldo < a.saldo ? b : a)) : null;
  const pendiente = !!calculando && activo;
  return (
    <div className={s.queSi} data-tour="quesi">
      <div className={s.queSiFila}>
        <span className={s.queSiEtq} id={`${id}a`}>¿Y si cobro menos?</span>
        <div className={s.seg} role="radiogroup" aria-labelledby={`${id}a`}>
          {BAJAS.map(b => <button key={b.f} type="button" role="radio" aria-checked={Math.abs(f - b.f) < 0.001} onClick={() => poner({ ventas: b.f })}>{b.t}</button>)}
        </div>
      </div>
      <label className={s.switch}>
        <input type="checkbox" role="switch" checked={tarde} onChange={e => poner({ demoraCobros: e.target.checked ? 15 : 0 })} />
        <span aria-hidden className={s.switchPista} />
        <span>¿Y si me pagan 15 días tarde?</span>
      </label>
      <p className={s.queSiRes} role="status" aria-live="polite">
        {!activo ? 'Probá cómo cambia tu plata si cobrás menos o más tarde. No cambia nada de lo que cargaste.'
          : <>Si {describirSup(supuestos)}: {p.hueco
            ? <>te faltaría plata desde el <b>{fCorta(p.hueco.inicio)}</b> (hasta <b className={`${s.num} ${s.neg}`}>{millones(p.hueco.minimo)}</b>).</>
            : min ? <>no te falta plata; lo más bajo es <b className={s.num}>{millones(min.saldo)}</b> el {fCorta(min.fecha)}.</> : null}
            {pendiente ? ' Calculando…' : v.simulacion?.aproximada ? ' (aproximado)' : ''}
            {' '}<button type="button" className={s.link} style={{ minHeight: 0 }} onClick={() => ponerSupuestos({})}>Volver a lo normal</button></>}
      </p>
    </div>
  );
}

/** Aviso fijo de que se está viendo una prueba de "¿y si…?". */
export function AvisoSimulacion() {
  const { supuestos, ponerSupuestos } = useDatos();
  if (esBase(supuestos)) return null;
  return (
    <div className={s.avisoSim} role="status">
      <span>Estás viendo una prueba: <b>{describirSup(supuestos)}</b>.</span>
      <button type="button" className={s.btnChico} onClick={() => ponerSupuestos({})}>Volver a lo normal</button>
    </div>
  );
}

/* ====================================================================== */
/* Escenarios                                                               */
const HORIZ = [{ d: 21, t: '3 sem' }, { d: 42, t: '6 sem' }, { d: 91, t: '13 sem' }, { d: 120, t: '4 meses' }];

export function Escenarios({ v }: { v: Vista }) {
  const [horizonte, setHorizonte] = useState(91);
  const [vis, setVis] = useState<Record<NombreEscenario, boolean>>({ base: true, pesimista: true, optimista: true });
  const [tabla, setTabla] = useState(false);
  const piso = v.minimoSeguridad?.monto ?? null;
  return (
    <>
      <div className={s.cardHead}>
        <div>
          <h2 className={s.h2} id="t-esc">Tres caminos posibles</h2>
          <p className={s.sub}>Lo más probable (base), si las cosas vienen peor (pesimista) y si vienen mejor (optimista).{v.escenariosAprox ? ' Pesimista y optimista: aproximados.' : ''}</p>
        </div>
        <div className={s.seg} role="radiogroup" aria-label="Cuánto mirar hacia adelante">
          {HORIZ.map(h => <button key={h.d} type="button" role="radio" aria-checked={horizonte === h.d} onClick={() => setHorizonte(h.d)}>{h.t}</button>)}
        </div>
      </div>
      <div className={s.legend} role="group" aria-label="Mostrar u ocultar escenarios">
        {SERIES_ESC.map(x => (
          <button key={x.id} type="button" className={s.legBtn} aria-pressed={vis[x.id]} disabled={x.id === 'base'}
            onClick={() => setVis(o => ({ ...o, [x.id]: !o[x.id] }))}>
            <i className={`${s.sw} ${s.swLinea}`} style={{ borderColor: x.color, borderTopStyle: x.dash ? 'dashed' : 'solid' }} />{x.nombre}
          </button>
        ))}
        {piso !== null && <span><i className={`${s.sw} ${s.swLinea}`} style={{ borderColor: 'var(--ink-2)', borderTopStyle: 'dashed' }} />Piso de seguridad</span>}
      </div>
      <GraficoEscenarios esc={v.escenarios} hoy={v.pronostico.hoy} saldoInicial={v.pronostico.saldoInicial} horizonte={horizonte} visibles={vis} piso={piso} />
      <ul className={s.escExplica}>
        {SERIES_ESC.map(x => {
          const e = v.escenarios[x.id];
          return (
            <li key={x.id}>
              <i className={`${s.sw} ${s.swLinea}`} style={{ borderColor: x.color, borderTopStyle: x.dash ? 'dashed' : 'solid' }} aria-hidden />
              <span><b>{x.nombre}.</b> {v.supuestosTexto[x.id]} <span className={s.sub}>{e.hueco ? `Te falta plata desde el ${fCorta(e.hueco.inicio)}.` : `Lo más bajo: ${millones(e.minimo)} el ${fCorta(e.fechaMinimo)}.`}</span></span>
            </li>
          );
        })}
      </ul>
      {v.supuestosTexto.general?.length ? <p className={s.sub}>También asumimos: {v.supuestosTexto.general.join(' ')}</p> : null}
      <button type="button" className={s.link} aria-expanded={tabla} onClick={() => setTabla(t => !t)}>{tabla ? 'Ocultar la tabla' : 'Ver los escenarios en una tabla'}</button>
      {tabla && <TablaEscenarios esc={v.escenarios} horizonte={horizonte} />}
    </>
  );
}

/** Resumen corto de los escenarios para Inicio. */
export function ResumenEscenarios({ v }: { v: Vista }) {
  return (
    <section className={s.card} aria-labelledby="t-esc-r">
      <div className={s.cardHead}>
        <div><h2 className={s.h2} id="t-esc-r">¿Y si las cosas vienen peor?</h2><p className={s.sub}>Tu plata en tres caminos posibles.</p></div>
        <Link href="/proyeccion#escenarios" className={s.link}>Ver el gráfico</Link>
      </div>
      <ul className={s.escTiles}>
        {SERIES_ESC.map(x => {
          const e = v.escenarios[x.id];
          return (
            <li key={x.id}>
              <span><i className={`${s.sw} ${s.swLinea}`} style={{ borderColor: x.color, borderTopStyle: x.dash ? 'dashed' : 'solid' }} aria-hidden />{x.nombre}</span>
              {e.hueco
                ? <><b className={`${s.num} ${s.neg}`}>Falta plata</b><small>desde el {fCorta(e.hueco.inicio)}</small></>
                : <><b className={s.num}>{millones(e.minimo)}</b><small>lo más bajo, el {fCorta(e.fechaMinimo)}</small></>}
            </li>
          );
        })}
      </ul>
      {v.confiable ? <QueSi v={v} /> : <p className={s.sub}>Confirmá tu saldo para probar qué pasa si cobrás menos.</p>}
    </section>
  );
}

/* ====================================================================== */
/* Piso de seguridad                                                        */
export function Piso({ v }: { v: Vista }) {
  const { ponerMinimo } = useDatos();
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [txt, setTxt] = useState('');
  const [tocado, setTocado] = useState(false);
  const err = tocado ? errMonto(txt) : null;
  const m = v.minimoSeguridad;
  function guardar(e: FormEvent) {
    e.preventDefault();
    setTocado(true);
    const n = leerMonto(txt);
    if (errMonto(txt) || n === null) return;
    ponerMinimo(Math.abs(n)); setAbierto(false);
  }
  return (
    <div className={s.piso}>
      <p><b>Tu piso de seguridad:</b> {m ? <span className={s.num}>{pesos(m.monto)}</span> : 'sin definir'}{m && !m.propio ? ' (calculado: unos 30 días de gastos fijos)' : m?.propio ? ' (lo elegiste vos)' : ''}. Es la plata que no querés tocar nunca.</p>
      {!abierto ? (
        <div className={s.btnRow}>
          <button type="button" className={s.btnChico} onClick={() => { setAbierto(true); setTxt(m ? String(Math.round(m.monto)) : ''); }}>Cambiar mi piso</button>
          {m?.propio && <button type="button" className={s.btnChico} onClick={() => ponerMinimo(null)}>Usar el calculado</button>}
        </div>
      ) : (
        <form className={s.confirmarForm} onSubmit={guardar} noValidate>
          <div className={s.campo}>
            <label htmlFor={`${id}p`}>¿Por debajo de cuánto no querés bajar?</label>
            <InputMonto id={`${id}p`} valor={txt} setValor={setTxt} error={err} onBlur={() => setTocado(true)} foco />
            {err && <span id={`${id}p-err`} className={s.campoErr} role="alert">{err}</span>}
          </div>
          <div className={s.btnRow}>
            <button type="submit" className={`${s.btn} ${s.btnPri}`}>Guardar piso</button>
            <button type="button" className={s.btn} onClick={() => setAbierto(false)}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ====================================================================== */
/* Orden de pagos                                                           */
const PRIORIDAD: Record<number, string> = {
  1: 'Primero: sueldos, cargas, cheques ya emitidos e impuestos',
  2: 'Después: alquiler, servicios y proveedores sin los que no podés vender',
  3: 'Proveedores con descuento por pronto pago',
  4: 'Resto de proveedores: se puede negociar el plazo',
  5: 'Retiros y gastos que podés postergar: lo primero que se ajusta',
};
const PRIO_CAT: Record<string, number> = { sueldos: 1, aguinaldo: 1, cargas_sociales: 1, impuestos: 1, alquiler: 2, servicios: 2, proveedores: 4, retiros: 5, bancarios: 5, otros: 5 };

/** Orden de pagos del servidor o, si no viene, el orden por defecto de la skill aplicado a tus pagos del período. */
function ordenDe(v: Vista): { lista: OrdenPago[]; sugerido: boolean; totalPostergable?: number; cubreHueco?: boolean } | null {
  if (v.ordenPagos) return { ...v.ordenPagos, sugerido: false };
  const h = v.pronostico.hueco;
  if (!h) return null;
  const hasta = h.fin ?? h.fechaMinimo;
  const lista = v.pronostico.eventos
    .filter(e => e.monto < 0 && e.fecha > v.pronostico.hoy && e.fecha <= hasta && PRIO_CAT[e.categoria])
    .map(e => {
      const prioridad = PRIO_CAT[e.categoria];
      return { concepto: e.concepto, monto: e.monto, prioridad, fecha: e.fecha, plazoEstirable: prioridad >= 4 ? (prioridad === 5 ? 'se puede postergar' : 'se puede negociar') : false } as OrdenPago;
    });
  return lista.length ? { lista, sugerido: true } : null;
}

const estirable = (x: OrdenPago['plazoEstirable']) =>
  typeof x === 'number' ? (x > 0 ? `Se puede estirar ${plural(x, 'día')}` : null) : typeof x === 'string' ? x.charAt(0).toUpperCase() + x.slice(1) : x ? 'Se puede estirar' : null;

export function OrdenPagos({ v }: { v: Vista }) {
  const o = ordenDe(v);
  if (!o) return null;
  const grupos = [...new Set(o.lista.map(x => x.prioridad))].sort((a, b) => a - b);
  return (
    <div className={s.orden}>
      <div>
        <h3 className={s.h3}>Qué pagar primero</h3>
        <p className={s.sub}>Antes de pedir plata prestada, mirá si podés reordenar.{o.sugerido ? ' Orden sugerido según el tipo de pago; vos podés cambiarlo.' : ' Vos podés cambiar el orden.'}</p>
      </div>
      {o.totalPostergable !== undefined && o.totalPostergable > 0 && (
        <p className={s.ordenTotal}>Moviendo lo que se puede estirar liberás <b className={s.num}>{millones(o.totalPostergable)}</b>{o.cubreHueco === true ? ': con eso solo cubrís el hueco.' : o.cubreHueco === false ? ', pero solo con eso no alcanza.' : '.'}</p>
      )}
      <details className={s.details}>
      <summary>Ver el orden de pagos ({plural(o.lista.length, 'pago')})</summary>
      <ol className={s.ordenLista}>
        {grupos.map(g => {
          const items = o.lista.filter(x => x.prioridad === g).sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? ''));
          const costo = items.find(x => x.costoProbable)?.costoProbable;
          return (
            <li key={g}>
              <span className={s.ordenCab}><span className={s.ordenNum} aria-hidden>{g}</span>{items[0].grupo ? `${items[0].grupo}` : PRIORIDAD[g] ?? `Prioridad ${g}`}</span>
              {costo && <small className={s.ordenCosto}>{costo}</small>}
              <ul>
                {items.slice(0, 5).map((x, i) => {
                  const e = estirable(x.plazoEstirable);
                  return (
                    <li key={i}>
                      <span className={s.itemTexto}><strong title={x.concepto}>{x.concepto}</strong>
                        <small>{x.fecha ? `${fCorta(x.fecha)} · ` : ''}{e ? <span className={`${s.chip} ${s.chipMini} ${s.chipAcc}`}>{e}</span> : g <= 2 ? 'No conviene atrasarlo' : ''}</small></span>
                      <span className={`${s.monto} ${s.num}`}>{millones(-Math.abs(x.monto))}</span>
                    </li>
                  );
                })}
                {items.length > 5 && <li className={s.sub}>y {plural(items.length - 5, 'pago')} más</li>}
              </ul>
            </li>
          );
        })}
      </ol>
      </details>
    </div>
  );
}

/* ====================================================================== */
/* Opciones con costo real                                                   */
export function opcionesOrdenadas(v: Vista): OpcionV2[] {
  return [...(v.recomendacion.opciones as OpcionV2[])].sort((a, b) => a.costo - b.costo);
}

export function CostoReal({ o }: { o: OpcionV2 }) {
  const est = o.estimado !== false;
  return (
    <span className={s.costoReal}>
      <span className={s.costo}><b className={s.num}>{o.costo === 0 ? 'Sin costo' : pesos(o.costo)}</b><small>te cuesta de verdad{est ? ' (estimado)' : ''}</small></span>
      {o.costo > 0 && (o.tea != null || o.costoPeriodo != null) && (
        <small className={s.num}>
          {o.tea != null && <>TEA {pct(teaPct(o.tea), 0)}</>}
          {o.tea != null && o.costoPeriodo != null && ' · '}
          {o.costoPeriodo != null && <>{pct(teaPct(o.costoPeriodo), 1)} en el plazo</>}
        </small>
      )}
    </span>
  );
}

export function SiNoHaces({ v }: { v: Vista }) {
  const h = v.pronostico.hueco;
  const t = v.siNoHaces ?? (h
    ? `El ${fCorta(h.inicio)} no vas a poder pagar todo y quedás ${plural(h.dias, 'día')} en rojo, con un pozo de hasta ${millones(-h.minimo)}. Si el banco te lo cubre con descubierto no acordado, es lo más caro y además ensucia tu historial.`
    : null);
  if (!t) return null;
  return <div className={s.siNo}><strong>Si no hacés nada</strong><p>{t}</p></div>;
}

/* ====================================================================== */
/* Score                                                                     */
const LECTURA: Record<string, string> = {
  A: 'Estás en condiciones de negociar mejores tasas y plazos.',
  B: 'Buena base, con uno o dos puntos para ajustar.',
  C: 'Te dan crédito, pero caro. Ordená antes de pedir.',
  D: 'Riesgo alto: priorizá la caja antes que crecer.',
  E: 'Urgente: hay riesgo de no cubrir pagos próximos.',
};
const tono = (n: number) => (n >= 70 ? s.medOk : n >= 40 ? s.medWarn : s.medNeg);

function cargaDe(f: Faltante): { texto: string; carga: VistaCarga } {
  const t = typeof f === 'string' ? f : f.texto ?? f.label ?? 'Dato';
  const c = typeof f === 'object' ? f.carga : undefined;
  const validas: VistaCarga[] = ['saldo', 'movimiento', 'factura', 'archivos', 'mp', 'menu'];
  if (c && (validas as string[]).includes(c)) return { texto: t, carga: c as VistaCarga };
  const x = t.toLowerCase();
  const carga: VistaCarga = /saldo/.test(x) ? 'saldo' : /mercado ?pago/.test(x) ? 'mp'
    : /factura|comprobante|arca|cliente|proveedor/.test(x) ? 'factura'
      : /extracto|movimiento|historia|mes|banco|boleta|n[oó]mina|sueldo|csv/.test(x) ? 'archivos'
        : /gasto|ingreso/.test(x) ? 'movimiento' : 'menu';
  return { texto: t, carga };
}

export function ScoreCard({ v }: { v: Vista }) {
  const { abrirCarga } = useDatos();
  const sc = v.score;
  if (!sc) return null;
  const cat = String(sc.categoria).toUpperCase();
  const pilares = sc.pilares ?? [];
  const faltan = (sc.faltan ?? []).map(cargaDe);
  return (
    <section className={s.card} aria-labelledby="t-score">
      <div className={s.scoreCab}>
        <div>
          <span className={s.eyebrow} id="t-score">Tu salud financiera</span>
          <div className={s.scoreNum}><b className={s.num}>{Math.round(sc.valor)}</b><span>/100</span></div>
        </div>
        <span className={`${s.scoreCat} ${tono(sc.valor)}`} aria-label={`Categoría ${cat}`}>{cat}</span>
      </div>
      <div className={s.badges}>
        {sc.preliminar && <span className={`${s.chip} ${s.chipWarn}`}>PRELIMINAR</span>}
        {sc.rango && sc.rango[0] !== sc.rango[1] && <span className={s.chip}>Entre {Math.round(sc.rango[0])} y {Math.round(sc.rango[1])}</span>}
      </div>
      <div className={s.medidor} role="img" aria-label={`Puntaje ${Math.round(sc.valor)} de 100`}>
        <i className={tono(sc.valor)} style={{ width: `${Math.max(2, Math.min(100, sc.valor))}%` }} />
      </div>
      <p>{LECTURA[cat] ?? ''}{sc.preliminar ? ' Con más datos el número se afina.' : ''}</p>
      {!v.confiable && <p className={s.avisoBox}>Calculado con el saldo estimado: la parte de liquidez puede estar muy lejos de la real hasta que confirmes tu saldo.</p>}
      {pilares.length > 0 && (
        <details className={s.details}>
          <summary>Ver de qué depende</summary>
          <ul className={s.pilares}>
            {pilares.map(pl => (
              <li key={pl.nombre}>
                <span className={s.pilarCab}><b>{pl.nombre}</b><small>{Math.round(pl.peso <= 1 ? pl.peso * 100 : pl.peso)}% del puntaje</small>
                  <span className={s.num}>{pl.valor === null ? 'Falta dato' : Math.round(pl.valor)}</span></span>
                <span className={s.medidor} aria-hidden>{pl.valor !== null && <i className={tono(pl.valor)} style={{ width: `${Math.max(2, Math.min(100, pl.valor))}%` }} />}</span>
                {pl.detalle && <small>{pl.detalle}</small>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {faltan.length > 0 && (
        <div className={s.faltan}>
          <strong>Qué falta cargar para afinarlo</strong>
          <div className={s.btnRow}>
            {faltan.map((f, i) => <button key={i} type="button" className={s.btnChico} onClick={() => abrirCarga(f.carga)}>+ {f.texto}</button>)}
          </div>
        </div>
      )}
      <p className={s.legal}>Puntaje interno y orientativo: no es una calificación crediticia oficial ni reemplaza la Central de Deudores del BCRA, que podés consultar gratis con tu CUIT.</p>
    </section>
  );
}

/* ====================================================================== */
/* Capa educativa                                                           */
export function analogiaDe(v: Vista): string | null {
  if (v.analogia) return v.analogia;
  const cp = v.pronostico.contrapartes;
  const prom = (l: 'cobrar' | 'pagar') => { const x = cp.filter(c => c.lado === l); return x.length ? Math.round(x.reduce((a, c) => a + c.plazoDias, 0) / x.length) : null; };
  const c = prom('cobrar'), p = prom('pagar');
  if (c !== null && p !== null && c - p >= 5) return `Tus clientes tardan unos ${c} días en pagarte y vos les pagás a tus proveedores en ${p}. Durante ${c - p} días, sos el banco de tus clientes.`;
  const h = v.pronostico.hueco;
  if (h && v.confiable) return `Un hueco es como llegar a la caja del súper con el changuito lleno: el ${fCorta(h.inicio)} lo que tenés que pagar supera lo que vas a tener en la cuenta.`;
  const r = v.excedente?.rendimiento;
  if (v.confiable && v.excedente?.hay && r && v.excedente.ventana) return `Si dejás ${millones(v.excedente.monto)} quietos ${v.excedente.ventana.dias} días, la inflación se come unos ${millones(r.pesos - r.realPesos)}. Es como dejar el hielo afuera del freezer.`;
  if (v.minimoSeguridad) return `Tu piso de seguridad (${millones(v.minimoSeguridad.monto)}) es como la reserva del tanque del auto: no la usás para el viaje, la tenés por si algo sale mal.`;
  return null;
}

const GLOSARIO: { t: string; d: string; href?: string }[] = [
  { t: 'Saldo', d: 'La plata que tenés disponible hoy, en el banco y en Mercado Pago.' },
  { t: 'Hueco', d: 'Un día en que te falta plata para pagar lo que vence.', href: '/proyeccion#cubrir' },
  { t: 'Piso de seguridad', d: 'Lo mínimo que querés tener siempre en la cuenta, por las dudas.', href: '/proyeccion#escenarios' },
  { t: 'Escenario', d: 'Un camino posible: cómo quedaría tu plata si cobrás normal, peor o mejor.', href: '/proyeccion#escenarios' },
  { t: 'TEA', d: 'Cuánto te cuesta de verdad conseguir plata, llevado a un año.', href: '/proyeccion#cubrir' },
  { t: 'Excedente', d: 'Lo que te sobra después de cubrir todo y tu piso.', href: '/excedente' },
];

export function Educativo({ v, terminos }: { v: Vista; terminos: string[] }) {
  const a = analogiaDe(v);
  const lista = GLOSARIO.filter(g => terminos.includes(g.t));
  return (
    <section className={s.educa} aria-labelledby="t-educa">
      <h2 className={s.sr} id="t-educa">Para entender los números</h2>
      {a && <p className={s.analogia}><Icono n="info" size={18} /><span>{a}</span></p>}
      {lista.length > 0 && (
        <dl className={s.glosarioMini}>
          {lista.map(g => <div key={g.t}><dt>{g.t}</dt><dd>{g.d}{g.href && <> <Link href={g.href}>Ver</Link></>}</dd></div>)}
        </dl>
      )}
      <p className={s.legal}>{AVISO_ORIENTATIVO}</p>
    </section>
  );
}

/* ====================================================================== */
/* Lo que se compartiría con la ALyC (vista previa legible, sin nombres)    */
const PRIVADO = /nombre|razon|cuit|cuil|dni|cliente|proveedor|librador|email|mail|tel|direcci|cbu|alias/i;
const ETQ: Record<string, string> = {
  fecha_corte: 'Fecha de corte', reserva_operativa: 'Reserva que no se toca', deuda_cara_vigente: 'Deudas caras',
  compromisos_proximos: 'Pagos próximos', excedentes: 'Plata que sobra', escalera_de_vencimientos: 'Cuándo la vas a necesitar',
  preferencia_de_destino: 'Dónde preferís colocarla', riesgo_de_cobros: 'Riesgo de no cobrar', score: 'Puntaje interno',
  estabilidad_flujo: 'Qué tan parejos son tus ingresos', monto: 'Monto', moneda: 'Moneda', criterio: 'Criterio', disponible_desde: 'Desde',
  se_necesita_el: 'Se necesita el', dias_horizonte: 'Días', uso_futuro: 'Para qué', liquidez_requerida: 'Liquidez', fecha: 'Fecha',
  monto_necesario: 'Monto', origen: 'Origen', tipo: 'Tipo', saldo: 'Saldo', tea: 'TEA', valor: 'Valor', categoria: 'Categoría',
  preliminar: 'Preliminar', fecha_de_pago: 'Fecha de pago',
};
const etq = (k: string) => ETQ[k] ?? (k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' '));
function valorLegible(k: string, x: unknown): string {
  if (typeof x === 'boolean') return x ? 'sí' : 'no';
  if (typeof x === 'number') return /monto|saldo|necesario/.test(k) ? pesos(x) : /tea/.test(k) ? pct(teaPct(x), 0) : String(x);
  if (typeof x === 'string') return /^\d{4}-\d{2}-\d{2}$/.test(x) ? fNum(x) : x;
  return '';
}
function Arbol({ o, nivel = 0 }: { o: Record<string, unknown>; nivel?: number }) {
  const filas = Object.entries(o).filter(([k, x]) => !PRIVADO.test(k) && x !== null && x !== undefined && !(Array.isArray(x) && !x.length));
  return (
    <dl className={nivel ? s.previewSub : s.preview}>
      {filas.map(([k, x]) => (
        <div key={k}>
          <dt>{etq(k)}</dt>
          <dd>
            {Array.isArray(x)
              ? <ul>{x.slice(0, 8).map((it, i) => <li key={i}>{it && typeof it === 'object' ? Object.entries(it as Record<string, unknown>).filter(([kk]) => !PRIVADO.test(kk)).map(([kk, vv]) => `${etq(kk)}: ${valorLegible(kk, vv)}`).filter(t => !t.endsWith(': ')).join(' · ') : valorLegible(k, it)}</li>)}{x.length > 8 && <li>y {x.length - 8} más</li>}</ul>
              : x && typeof x === 'object' ? (nivel < 2 ? <Arbol o={x as Record<string, unknown>} nivel={nivel + 1} /> : null)
                : valorLegible(k, x)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function VistaPreviaResearcher({ datos }: { datos: Record<string, unknown> | null }) {
  if (!datos) return null;
  return (
    <details className={s.details}>
      <summary>Ver lo que se compartiría</summary>
      <p className={s.sub}>Solo números y fechas de tu caja. No va tu nombre ni el de tus clientes o proveedores.</p>
      <Arbol o={datos} />
    </details>
  );
}
