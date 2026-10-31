'use client';
// Proyección: saldo diario a 15/30/60/90/120 días, huecos, qué hacer (con costo), categorías, movimientos y contrapartes.
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ConDatos, SelloListo, TablaOrdenable, sellar, type Col } from '../_ui/comun';
import { BarrasApiladas, ENT, SAL, TablaBarras, armarBarras, GraficoSaldo } from '../_ui/graficos';
import { ETQ_CAT, ETQ_ORIGEN, fCorta, fNum, millones, pesos, plural, sumarDias, type Evento, type Sello } from '../_ui/formato';
import { useDatos, type Vista } from '../_ui/datos';
import { AlertaAnticipada, AvisoSimulacion, bajoPiso, ConfirmarSaldo, CostoReal, Educativo, Escenarios, opcionesOrdenadas, OrdenPagos, Piso, QueSi, SiNoHaces } from '../_ui/v2';
import type { Contraparte } from '@/lib/forecast';
import s from '../app.module.css';

const HORIZONTES = [{ d: 21, t: '3 sem' }, { d: 42, t: '6 sem' }, { d: 91, t: '13 sem' }, { d: 120, t: '4 meses' }];

export default function Proyeccion() {
  return (
    <div className={s.pagina}>
      <div className={s.cabPagina}>
        <h1>Cómo va a estar tu plata</h1>
        <p>Día por día las próximas 3 semanas y semana a semana hasta 13, con lo que vence, lo que te deben y lo que solés vender.</p>
      </div>
      <ConDatos>{v => <Contenido v={v} />}</ConDatos>
    </div>
  );
}

function Contenido({ v }: { v: Vista }) {
  const p = v.pronostico;
  const [horizonte, setHorizonte] = useState(91);
  const [vista, setVista] = useState<'esc' | 'dia'>('esc');
  const min = p.serie.length ? p.serie.reduce((a, b) => (b.saldo < a.saldo ? b : a)) : null;
  const primero = p.huecos[0] ?? null;
  const piso = v.minimoSeguridad?.monto ?? null;
  return (
    <>
      <AvisoSimulacion />
      {!v.confiable && (
        <section className={s.card} aria-label="Confirmar saldo">
          <ConfirmarSaldo v={v} />
        </section>
      )}
      <AlertaAnticipada v={v} conLink={false} />

      <section className={s.kpis} aria-label="Lo principal">
        <div className={s.kpi}><span>{v.confiable ? 'Tu saldo hoy' : 'Saldo estimado'}</span><b className={`${s.num} ${!v.confiable ? s.estimado : p.saldoInicial < 0 ? s.neg : ''}`}>{millones(p.saldoInicial)}</b><small>{v.confiable ? `al ${fNum(p.hoy)}` : 'sin confirmar'}</small></div>
        <div className={s.kpi}><span>Primer día que te falta plata</span>
          {v.confiable ? <><b className={primero ? s.neg : s.pos}>{primero ? fCorta(primero.inicio) : 'Ninguno'}</b><small>{primero ? `${plural(primero.dias, 'día')} · hasta ${millones(primero.minimo)}` : `en las próximas ${Math.floor(p.serie.length / 7)} semanas`}</small></>
            : <><b>?</b><small>confirmá tu saldo para saberlo</small></>}
        </div>
        {min && <div className={s.kpi}><span>Lo más bajo que llega</span><b className={`${s.num} ${min.saldo < 0 ? s.neg : ''}`}>{millones(min.saldo)}</b><small>el {fCorta(min.fecha)}{!v.confiable ? ' (estimado)' : ''}</small></div>}
        <div className={s.kpi}><span>Tu piso de seguridad</span><b className={s.num}>{piso !== null ? millones(piso) : 'Sin definir'}</b><small>{v.minimoSeguridad?.propio ? 'lo elegiste vos' : 'unos 30 días de gastos fijos'}</small></div>
      </section>

      <section className={s.card} id="escenarios" aria-labelledby={vista === 'esc' ? 't-esc' : 't-saldo'}>
        <div className={s.seg} role="group" aria-label="Cómo verlo" style={{ justifySelf: 'start' }}>
          <button type="button" aria-pressed={vista === 'esc'} onClick={() => setVista('esc')}>Tres escenarios</button>
          <button type="button" aria-pressed={vista === 'dia'} onClick={() => setVista('dia')}>Día por día, con movimientos</button>
        </div>
        {vista === 'esc' ? <Escenarios v={v} /> : (
          <>
            <div className={s.cardHead}>
              <div>
                <h2 className={s.h2} id="t-saldo">Tu plata día por día</h2>
                <p className={s.sub}>Lo que cae bajo cero es plata que te falta: un descubierto que hoy no tenés acordado.</p>
              </div>
              <div className={s.seg} role="radiogroup" aria-label="Cuánto mirar hacia adelante">
                {HORIZONTES.map(h => <button key={h.d} type="button" role="radio" aria-checked={horizonte === h.d} onClick={() => setHorizonte(h.d)}>{h.t}</button>)}
              </div>
            </div>
            <GraficoSaldo p={p} horizonte={horizonte} piso={piso} />
          </>
        )}
        {v.confiable && <QueSi v={v} />}
        <Piso v={v} />
      </section>

      <div className={`${s.cols} ${s.c12}`}>
        <section className={s.card} aria-labelledby="t-huecos">
          <h2 className={s.h2} id="t-huecos">Días en que te falta plata</h2>
          {!v.confiable ? <p className={s.sub}>Confirmá tu saldo para saber si hay días en que te falta plata.</p> : p.huecos.length ? (
            <ul className={s.lista}>
              {p.huecos.map((hu, i) => (
                <li key={hu.inicio} className={s.item} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                  <span className={s.itemTexto}>
                    <strong>{p.huecos.length > 1 ? `Hueco ${i + 1}: d` : 'D'}esde el {fCorta(hu.inicio)}</strong>
                    <small>{plural(hu.dias, 'día')} en rojo{hu.fin ? `, hasta el ${fCorta(sumarDias(hu.fin, -1))}` : ', sigue después del horizonte'} · peor día {fCorta(hu.fechaMinimo)}</small>
                  </span>
                  <span className={`${s.monto} ${s.num} ${s.neg}`}>{millones(hu.minimo)}</span>
                </li>
              ))}
            </ul>
          ) : <p className={s.sub}>Lo bueno: tu plata no baja de cero en las próximas {Math.floor(p.serie.length / 7)} semanas.</p>}
          {p.aprendizajes.length > 0 && (
            <details className={s.details}>
              <summary>Lo que vimos de tu negocio</summary>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 13.5, color: 'var(--ink-2)' }}>
                {p.aprendizajes.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </details>
          )}
        </section>
        <section className={s.card} id="cubrir" aria-labelledby="t-cubrir"><Cubrir v={v} /></section>
      </div>

      {v.mensual ? <Categorias v={v} /> : (
        <section className={s.card}><h2 className={s.h2}>Entradas y salidas por categoría</h2><p className={s.sub}>No disponible para esta fuente de datos todavía.</p></section>
      )}

      <div className={`${s.cols} ${s.cAncho}`}>
        <section className={s.card} id="movimientos" aria-labelledby="t-mov"><Movimientos p={v.pronostico} /></section>
        <section className={s.card} aria-labelledby="t-contra"><Contrapartes lista={p.contrapartes} /></section>
      </div>

      <section className={s.card} aria-labelledby="t-macro">
        <div><h2 className={s.h2} id="t-macro">Tasas e inflación de referencia</h2><p className={s.sub}>Usamos datos públicos del BCRA y el INDEC para calcular costos y rendimientos. La lectura completa, con la fuente de cada dato y qué significa para tu plata, está en Inicio.</p></div>
        <div className={s.btnRow}><Link href="/#t-mercado" className={s.btn}>Ver la lectura del mercado argentino</Link></div>
      </section>
      <Educativo v={v} terminos={['Hueco', 'Piso de seguridad', 'Escenario', 'TEA']} />
    </>
  );
}

/* ---------- Cómo cubrir el hueco ---------- */
const CONSENT_BANCO = 'Autorizo a CFO de Bolsillo a compartir mi proyección de caja y la evidencia que la respalda con la entidad indicada, para que me contacte con una propuesta de financiamiento.';

function Cubrir({ v }: { v: Vista }) {
  const r = v.recomendacion;
  const { agregarSello } = useDatos();
  const [elegida, setElegida] = useState<string | null>(r.elegida);
  const [ok, setOk] = useState(false);
  const [env, setEnv] = useState(false);
  const [sello, setSello] = useState<Sello | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setElegida(r.elegida); setOk(false); setSello(null); setErr(null); }, [r]);
  const op = r.opciones.find(o => o.id === elegida) ?? null;
  const opciones = opcionesOrdenadas(v);
  const necesita = !!v.pronostico.hueco || !!bajoPiso(v);

  async function pedir() {
    if (!op || !ok) return;
    setEnv(true); setErr(null);
    try {
      const x = await sellar(v, 'banco-demo', { id: op.id, titulo: op.titulo }, CONSENT_BANCO);
      setSello(x); agregarSello(x);
    } catch (e) { setErr(e instanceof Error ? e.message : 'No pude sellar la carpeta.'); }
    finally { setEnv(false); }
  }

  return (
    <>
      <div>
        <h2 className={s.h2} id="t-cubrir">Qué hacer</h2>
        {v.confiable && <p className={s.sub}>{r.alerta.replace(/^⚠️\s*/, '')}</p>}
      </div>
      {!v.confiable ? (
        <p className={s.sub}>Cuando confirmes tu saldo te decimos si vas a necesitar plata y cuánto te costaría cada opción.</p>
      ) : (
        <>
          <OrdenPagos v={v} />
          {opciones.length > 0 ? (
            <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
              <legend className={s.h3} style={{ padding: 0, marginBottom: 8 }}>Tus opciones, de la más barata a la más cara</legend>
              <div className={s.opciones}>
                {opciones.map(o => (
                  <label key={o.id} className={s.opcion}>
                    <input type="radio" name="opcion" checked={elegida === o.id} onChange={() => setElegida(o.id)} />
                    <span className={s.badges}>
                      {o.id === r.elegida && <span className={`${s.chip} ${s.chipAcc}`}>La más barata que cubre todo</span>}
                      <span className={`${s.chip} ${o.cubre ? s.chipOk : s.chipWarn}`}>{o.cubre ? '✓ Cubre el hueco' : 'Lo cubre en parte'}</span>
                    </span>
                    <strong>{o.titulo}</strong>
                    <CostoReal o={o} />
                    <p>{o.detalle}</p>
                    {o.citas.map(c => <a key={c.dato} href={c.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5 }}>{c.dato}: {c.valor} ({c.periodo})</a>)}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : <p>{necesita ? 'Todavía no tenemos opciones de financiamiento para este caso: empezá por reordenar los pagos.' : <>Lo bueno: no necesitás pedir plata en las próximas {Math.floor(v.pronostico.serie.length / 7)} semanas. {v.excedente?.hay ? 'Mirá qué hacer con la que te sobra.' : ''}</>}</p>}
          <SiNoHaces v={v} />
        </>
      )}

      {v.confiable && opciones.length > 0 && (sello ? <SelloListo sello={sello} /> : (
        <>
          <label className={s.consent}>
            <input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} />
            <span>{CONSENT_BANCO} Destino: Banco de la demo.</span>
          </label>
          <button type="button" className={`${s.btn} ${s.btnPri}`} disabled={!ok || !op || env} onClick={pedir}>
            {env ? 'Sellando la carpeta…' : 'Sellar carpeta y pedir que un banco me contacte'}
          </button>
        </>
      ))}
      {err && <div className={s.errorBox} role="alert">No pude sellar la carpeta.<p>{err}</p></div>}
      <p className={s.legal}>{r.aviso}</p>
    </>
  );
}

/* ---------- Categorías ---------- */
function Categorias({ v }: { v: Vista }) {
  const [tabla, setTabla] = useState(false);
  const ent = useMemo(() => armarBarras(v.mensual!, 'ent'), [v.mensual]);
  const sal = useMemo(() => armarBarras(v.mensual!, 'sal'), [v.mensual]);
  const parcial = [...ent, ...sal].some(b => b.parcial);
  const extra = v.resumen.boletas > 0 || v.resumen.empleados > 0;
  return (
    <section className={s.card} aria-labelledby="t-cat">
      <div className={s.cardHead}>
        <div>
          <h2 className={s.h2} id="t-cat">Entradas y salidas por categoría</h2>
          <p className={s.sub}>Barras lisas: extracto real. Rayadas: meses proyectados.{extra ? ' No incluye las boletas ni la nómina cargadas.' : ''}</p>
        </div>
        <div className={s.seg} role="group" aria-label="Vista">
          <button type="button" aria-pressed={!tabla} onClick={() => setTabla(false)}>Gráfico</button>
          <button type="button" aria-pressed={tabla} onClick={() => setTabla(true)}>Tabla</button>
        </div>
      </div>
      <div className={`${s.cols} ${s.c2}`}>
        <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>Entradas por mes</h3>
          {tabla ? <TablaBarras barras={ent} grupos={ENT} titulo="Entradas por mes y categoría" /> : <BarrasApiladas barras={ent} grupos={ENT} titulo="Entradas por mes" />}
        </div>
        <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>Salidas por mes</h3>
          {tabla ? <TablaBarras barras={sal} grupos={SAL} titulo="Salidas por mes y categoría" /> : <BarrasApiladas barras={sal} grupos={SAL} titulo="Salidas por mes" />}
        </div>
      </div>
      {parcial && <p className={s.sub}>* Mes incompleto: solo cubre parte de los días.</p>}
    </section>
  );
}

/* ---------- Movimientos y contrapartes ---------- */
function Movimientos({ p }: { p: Vista['pronostico'] }) {
  const [conVentas, setConVentas] = useState(false);
  const fin = sumarDias(p.hoy, 30);
  const hayVentas = p.eventos.some(e => e.categoria === 'ventas');
  const filas = useMemo(() => p.eventos.filter(e => e.fecha > p.hoy && e.fecha <= fin && (conVentas || e.categoria !== 'ventas')), [p, fin, conVentas]);
  const cols: Col<Evento>[] = [
    { id: 'fecha', label: 'Fecha', val: e => e.fecha, cell: e => <span className={s.num} style={{ whiteSpace: 'nowrap' }}>{fCorta(e.fecha)}</span> },
    { id: 'concepto', label: 'Concepto', val: e => e.concepto, cls: s.concepto },
    { id: 'cat', label: 'Categoría', val: e => ETQ_CAT[e.categoria] ?? e.categoria },
    { id: 'monto', label: 'Monto', num: true, val: e => e.monto, cell: e => <span className={e.monto < 0 ? s.neg : undefined}>{pesos(e.monto)}</span> },
    { id: 'origen', label: 'Origen', val: e => ETQ_ORIGEN[e.origen] ?? e.origen, cell: e => <span className={s.chip}>{ETQ_ORIGEN[e.origen] ?? e.origen}</span> },
  ];
  const tot = filas.reduce((a, e) => a + e.monto, 0);
  return (
    <>
      <div><h2 className={s.h2} id="t-mov">Próximos 30 días</h2><p className={s.sub}>Pagos y cobros hasta el {fNum(fin)}. Tocá un encabezado para ordenar.</p></div>
      <div className={s.toolbar}>
        {hayVentas && <label><input type="checkbox" checked={conVentas} onChange={e => setConVentas(e.target.checked)} /> Incluir ventas diarias</label>}
        <span className={s.num}>{plural(filas.length, 'movimiento')} · neto {millones(tot)}</span>
      </div>
      <TablaOrdenable cols={cols} rows={filas} inicial={{ id: 'fecha', dir: 1 }} caption="Próximos 30 días: pagos y cobros" vacio="No hay movimientos en la ventana." clave={(e, i) => `${e.fecha}${e.concepto}${i}`} alta />
    </>
  );
}

function Contrapartes({ lista }: { lista: Contraparte[] }) {
  const cols: Col<Contraparte>[] = [
    { id: 'nombre', label: 'Contraparte', val: c => c.nombre, cls: s.concepto },
    { id: 'lado', label: 'Relación', val: c => c.lado, cell: c => <span className={s.chip}>{c.lado === 'pagar' ? 'Proveedor' : 'Cliente'}</span> },
    { id: 'plazo', label: 'Plazo', num: true, val: c => c.plazoDias, cell: c => `${c.plazoDias} días` },
    { id: 'cad', label: 'Cadencia', num: true, val: c => c.cadenciaDias ?? 0, cell: c => (c.cadenciaDias ? `cada ${c.cadenciaDias} d` : 's/d') },
    { id: 'monto', label: 'Monto típico', num: true, val: c => c.montoTipico, cell: c => pesos(c.montoTipico) },
    { id: 'pend', label: 'Pendientes', num: true, val: c => c.pendientes, cell: c => `${c.pendientes} de ${c.facturas}` },
  ];
  return (
    <>
      <div><h2 className={s.h2} id="t-contra">Contrapartes</h2><p className={s.sub}>Plazo y cadencia aprendidos cruzando las facturas de ARCA con el banco.</p></div>
      <TablaOrdenable cols={cols} rows={lista} inicial={{ id: 'monto', dir: -1 }} caption="Contrapartes" vacio="Sin comprobantes cargados." clave={c => c.cuit + c.lado} alta />
    </>
  );
}
