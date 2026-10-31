'use client';
// Datos: lo que cargaste (con quitar/deshacer), de dónde sale el cálculo, avisos de vencimientos, huellas y sello,
// la demo y "Borrar mis datos".
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Avisos from '../../components/chat/Avisos';
import { Checklist, Faltantes } from '../_ui/comun';
import { mpDisponible, nombreFuente, useDatos } from '../_ui/datos';
import { fNum, kb, millones, pesos } from '../_ui/formato';
import { Icono } from '../_ui/iconos';
import { GrillaPerfiles } from '../_ui/perfiles';
import { iniciarTour } from '../_ui/recorrido';
import s from '../app.module.css';

export default function Datos() {
  const { ws, vista, mp, sellos, abrirCarga, quitar, quitarSaldo, desconectarMP, cargarDemo, empezarPropio, borrarTodo, calculando } = useDatos();
  const [copiado, setCopiado] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const router = useRouter();

  async function copiar(h: string) {
    try { await navigator.clipboard.writeText(h); setCopiado(h); setTimeout(() => setCopiado(null), 1800); } catch { setCopiado(null); }
  }
  const propio = ws.modo === 'propio';
  const nada = propio && !ws.mp && !ws.archivos.length && !ws.saldo && !ws.movimientos.length && !ws.facturas.length;
  const huella = (nombre: string) => vista?.insumos.find(i => i.nombre === nombre)?.sha256;

  return (
    <div className={s.pagina}>
      <div className={s.cabPagina}>
        <h1>Tus datos</h1>
        <p>Todo lo que cargaste para calcular tu caja. Se guarda solo en este navegador; lo mandamos al servidor únicamente para hacer la cuenta.</p>
      </div>

      <div className={`${s.cols} ${s.c21}`}>
        <section className={s.card} aria-labelledby="t-cargaste">
          <div className={s.cardHead}>
            <div>
              <h2 className={s.h2} id="t-cargaste">Lo que cargaste</h2>
              <p className={s.sub}>Calculando con: {nombreFuente(ws)}{vista ? ` · corte al ${fNum(vista.pronostico.hoy)}` : ''}</p>
            </div>
            <button type="button" className={`${s.btn} ${s.btnPri}`} onClick={() => abrirCarga()}><Icono n="mas" size={18} />Cargar</button>
          </div>

          {ws.modo === 'demo' && (
            <div className={s.vacioChico}>
              <p><b>Estás usando la demo</b> ({ws.demo?.mp ? 'Mercado Pago simulado' : ws.demo?.escenario === 'holgada' ? 'caso con plata de sobra' : ws.demo?.compromisos ? 'con boletas y nómina' : 'pyme gastronómica'}). Nada de esto es tuyo.</p>
              <button type="button" className={`${s.btn} ${s.btnPri}`} onClick={empezarPropio}>Empezar con los míos</button>
            </div>
          )}
          {ws.modo === 'perfil' && (
            <div className={s.vacioChico}>
              <p><b>Estás viendo una pyme de ejemplo:</b> {vista?.pyme ?? ws.perfil?.nombre}. Nada de esto es tuyo{ws.saldo ? ', salvo el saldo que confirmaste' : ''}.</p>
              <button type="button" className={`${s.btn} ${s.btnPri}`} onClick={empezarPropio}>Empezar con los míos</button>
            </div>
          )}
          {(ws.modo === 'vacio' || nada) && <p className={s.sub}>Todavía no cargaste nada. Tocá “Cargar” para sumar tu saldo, una factura, tus archivos o tu cuenta de Mercado Pago.</p>}

          {propio && (
            <ul className={s.cargados}>
              {ws.mp && (
                <li>
                  <span className={s.accionIco}><Icono n="mp" size={20} /></span>
                  <span className={s.itemTexto}><strong>Mercado Pago{mp.cuenta?.apodo ? ` · ${mp.cuenta.apodo}` : ''}</strong>
                    <small>{mpDisponible(mp) ? 'Conectada' : 'Sin conexión: volvé a conectarla'} · cobros y pagos{vista?.resumen.mercadopago === 'simulacion' ? ' (simulados: el servidor no tiene acceso real)' : ''}</small></span>
                  <span className={s.btnRow}>
                    {!mpDisponible(mp) && <button type="button" className={s.btnChico} onClick={() => abrirCarga('mp')}>Conectar</button>}
                    <button type="button" className={s.btnChico} onClick={desconectarMP}>Desconectar</button>
                  </span>
                </li>
              )}
              {ws.saldo && (
                <li>
                  <span className={s.accionIco}><Icono n="saldo" size={20} /></span>
                  <span className={s.itemTexto}><strong>Saldo: <span className={s.num}>{pesos(ws.saldo.monto)}</span></strong><small>al {fNum(ws.saldo.fecha)}</small></span>
                  <span className={s.btnRow}>
                    <button type="button" className={s.btnChico} onClick={() => abrirCarga('saldo')}>Cambiar</button>
                    <button type="button" className={s.btnChico} onClick={quitarSaldo} aria-label="Quitar saldo"><Icono n="basura" size={16} /></button>
                  </span>
                </li>
              )}
              {ws.archivos.map(a => (
                <li key={a.id}>
                  <span className={s.accionIco}><Icono n="archivo" size={20} /></span>
                  <span className={s.itemTexto}><strong title={a.nombre}>{a.nombre}</strong>
                    <small>{a.texto ? kb(a.bytes) : 'Muy grande para guardarlo en el navegador: volvé a subirlo para usarlo'}{huella(a.nombre) ? ' · leído' : ''}</small></span>
                  <button type="button" className={s.btnChico} onClick={() => quitar('archivo', a.id)} aria-label={`Quitar ${a.nombre}`}><Icono n="basura" size={16} /></button>
                </li>
              ))}
              {ws.movimientos.map(m => (
                <li key={m.id}>
                  <span className={s.accionIco}><Icono n="mov" size={20} /></span>
                  <span className={s.itemTexto}><strong title={m.desc}>{m.desc}</strong><small>{m.monto >= 0 ? 'Ingreso' : 'Gasto'} · {fNum(m.fecha)}</small></span>
                  <span className={`${s.monto} ${s.num} ${m.monto < 0 ? s.neg : s.pos}`}>{millones(m.monto)}</span>
                  <button type="button" className={s.btnChico} onClick={() => quitar('movimiento', m.id)} aria-label={`Quitar ${m.desc}`}><Icono n="basura" size={16} /></button>
                </li>
              ))}
              {ws.facturas.map(f => (
                <li key={f.id}>
                  <span className={s.accionIco}><Icono n={f.origen === 'foto' ? 'foto' : 'factura'} size={20} /></span>
                  <span className={s.itemTexto}><strong title={f.comprobante.razon_social_emisor ?? ''}>{f.comprobante.razon_social_emisor || 'Factura'}</strong>
                    <small>{f.lado === 'recibido' ? 'A pagar' : 'A cobrar'}{f.comprobante.fecha_vencimiento ? ` · vence ${fNum(f.comprobante.fecha_vencimiento)}` : f.comprobante.fecha_emision ? ` · emitida ${fNum(f.comprobante.fecha_emision)}` : ''}{f.saldada ? ' · ya saldada, no cuenta' : ''}</small></span>
                  <span className={`${s.monto} ${s.num}`}>{f.comprobante.total != null ? millones(f.comprobante.total) : ''}</span>
                  <button type="button" className={s.btnChico} onClick={() => quitar('factura', f.id)} aria-label={`Quitar factura de ${f.comprobante.razon_social_emisor || 'sin nombre'}`}><Icono n="basura" size={16} /></button>
                </li>
              ))}
            </ul>
          )}
          {calculando && <p className={s.sub} role="status">Recalculando con lo último que cargaste…</p>}
          {vista && vista.ignorados.length > 0 && <div className={s.avisoBox}>No reconocí el formato de: {vista.ignorados.join(', ')}. Revisá que tengan encabezados de fecha, montos y CUIT, o bajá un ejemplo desde “Cargar › Archivos CSV”.</div>}
          {vista && <Faltantes v={vista} titulo="Qué le falta al cálculo" />}
        </section>

        <div className={s.pila}>
          <Checklist compacto />
          {vista && (
            <section className={s.card} aria-labelledby="t-leido">
              <h2 className={s.h2} id="t-leido">Lo que leímos</h2>
              <div className={s.kpis} style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
                <div className={s.kpi}><span>Movimientos</span><b className={s.num}>{vista.resumen.movimientos}</b><small>banco, Mercado Pago o a mano</small></div>
                <div className={s.kpi}><span>Facturas</span><b className={s.num}>{vista.resumen.recibidos + vista.resumen.emitidos}</b><small>{vista.resumen.recibidos} a pagar · {vista.resumen.emitidos} a cobrar</small></div>
                <div className={s.kpi}><span>Boletas</span><b className={s.num}>{vista.resumen.boletas}</b><small>con vencimiento</small></div>
                <div className={s.kpi}><span>Nómina</span><b className={s.num}>{vista.resumen.empleados}</b><small>empleados</small></div>
              </div>
            </section>
          )}
        </div>
      </div>

      <section className={s.card} id="avisos" aria-labelledby="t-avisos">
        <div><h2 className={s.h2} id="t-avisos">Avisos de vencimientos</h2>
          <p className={s.sub}>Te avisamos en este dispositivo o por WhatsApp/SMS: 3 días antes, el día anterior y el día del vencimiento, y si ves que te vas a quedar sin plata.</p></div>
        {vista?.alertas ? (
          <>
            <div className={s.kpis} style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
              <div className={s.kpi}><span>Vencidas</span><b className={`${s.num} ${vista.alertas.resumen.vencidas ? s.neg : ''}`}>{vista.alertas.resumen.vencidas}</b></div>
              <div className={s.kpi}><span>Vence en 7 días</span><b className={s.num}>{millones(vista.alertas.resumen.vence7)}</b></div>
              <div className={s.kpi}><span>En 30 días</span><b className={s.num}>{millones(vista.alertas.resumen.vence30)}</b></div>
            </div>
            <div className={`${s.btnRow} ${s.avisosAqui} ${s.avisosIzq}`} style={{ alignItems: 'center' }}>
              <Avisos alertas={vista.alertas} />
              <span className={s.sub}>Tocá la campana para elegir por dónde te avisamos.</span>
            </div>
          </>
        ) : <p className={s.sub}>Cuando cargues tus datos vas a poder activar los avisos.</p>}
        <p className={s.sub}>¿Querés ver cómo llega por WhatsApp? <Link href="/demo">Abrí la demo del canal</Link>.</p>
      </section>

      <div className={`${s.cols} ${s.c2}`}>
        <section className={s.card} aria-labelledby="t-huellas">
          <div><h2 className={s.h2} id="t-huellas">Huellas y sello</h2>
            <p className={s.sub}>Cada archivo leído tiene una huella (SHA-256) que cambia si se toca un solo carácter. Cuando autorizás compartir tu carpeta con un banco o un agente, la sellamos para que puedan comprobar que nadie la modificó.</p></div>
          {vista?.insumos.length ? (
            <ul className={s.lista}>
              {vista.insumos.map(a => (
                <li key={a.nombre + a.sha256} className={s.archivo}>
                  <strong>{a.nombre}</strong>
                  <button type="button" className={s.link} onClick={() => copiar(a.sha256)} aria-label={`Copiar huella de ${a.nombre}`}>{copiado === a.sha256 ? 'Copiada' : 'Copiar'}</button>
                  <code className={s.mono}>sha256 {a.sha256}</code>
                </li>
              ))}
            </ul>
          ) : <p className={s.sub}>Todavía no hay archivos leídos. Mercado Pago y lo cargado a mano no son archivos.</p>}
          <div className={s.btnRow}>
            <Link href="/sello" className={s.btn}><Icono n="sello" size={18} />{sellos.length ? `Ver ${sellos.length === 1 ? 'la carpeta sellada' : `las ${sellos.length} carpetas selladas`}` : 'Cómo funciona el sello'}</Link>
          </div>
        </section>

        <section className={s.card} aria-labelledby="t-demo">
          <div><h2 className={s.h2} id="t-demo">Probar con la demo</h2>
            <p className={s.sub}>Negocios inventados para ver la app funcionando sin cargar nada. Para presentar, abrí la app con <code className={s.mono}>/?demo=1</code>.</p></div>
          <div className={s.btnRow}>
            <button type="button" className={`${s.btn} ${s.btnPri}`} onClick={() => { cargarDemo(); router.push('/'); iniciarTour(); }}>Ver el recorrido guiado</button>
            <button type="button" className={s.btn} onClick={() => cargarDemo()}>Pyme con hueco de caja</button>
            <button type="button" className={s.btn} onClick={() => cargarDemo({ escenario: 'holgada' })}>Pyme con plata de sobra</button>
            <button type="button" className={s.btn} onClick={() => cargarDemo({ compromisos: true })}>Con boletas y nómina</button>
            <button type="button" className={s.btn} onClick={() => cargarDemo({ mp: true })}>Mercado Pago simulado</button>
          </div>
          <p className={s.sub}>O elegí una de las seis pymes de ejemplo, más abajo.</p>
          {propio && !nada && <p className={s.sub}>Ojo: pasar a la demo reemplaza lo que cargaste. Si querés conservarlo, no lo hagas.</p>}
        </section>
      </div>

      <GrillaPerfiles id="t-perfiles" actual={ws.perfil?.id} onElegir={() => router.push('/')} />

      <section className={`${s.card} ${s.peligro}`} aria-labelledby="t-borrar">
        <div><h2 className={s.h2} id="t-borrar">Borrar mis datos</h2>
          <p className={s.sub}>Saca de este navegador todo lo que cargaste, el último cálculo y las carpetas selladas de esta sesión, y desconecta Mercado Pago. No se puede deshacer.</p></div>
        {!confirmar ? (
          <div className={s.btnRow}><button type="button" className={`${s.btn} ${s.btnPeligro}`} onClick={() => setConfirmar(true)}>Borrar mis datos</button></div>
        ) : (
          <div className={s.btnRow} role="group" aria-label="Confirmar borrado">
            <span className={s.sub} style={{ alignSelf: 'center' }}>¿Seguro? Se borra todo.</span>
            <button type="button" className={`${s.btn} ${s.btnPeligroLleno}`} onClick={() => { borrarTodo(); setConfirmar(false); }} autoFocus>Sí, borrar todo</button>
            <button type="button" className={s.btn} onClick={() => setConfirmar(false)}>Cancelar</button>
          </div>
        )}
      </section>
    </div>
  );
}
