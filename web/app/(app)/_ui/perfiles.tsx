'use client';
// "Probar con otra pyme": 6 negocios simulados (public/demo/perfiles) para ver la app con situaciones distintas.
// El backend arma los datos de cada uno; el saldo llega SIN confirmar a propósito (sumar los pagos no da el saldo real).
import { useEffect, useState } from 'react';
import { useDatos, type Vista } from './datos';
import { hoyLocal, pesos, plural, type PerfilEjemplo } from './formato';
import { Icono } from './iconos';
import s from '../app.module.css';

/** Una línea por situación, con color Y texto (el color solo no alcanza). */
const SITUACION: Record<string, { t: string; c: string }> = {
  'hueco-cercano': { t: 'Se queda sin plata en menos de 30 días', c: s.chipNeg },
  justo: { t: 'Llega justo: el aguinaldo la deja al borde', c: s.chipWarn },
  holgada: { t: 'Tiene plata de sobra', c: s.chipOk },
  'ventas-en-baja': { t: 'Las ventas vienen cayendo', c: s.chipWarn },
  estacional: { t: 'Entra la temporada baja', c: s.chipWarn },
  concentrada: { t: 'Depende de un solo cliente', c: s.chipWarn },
};

let cache: PerfilEjemplo[] | null = null;

/** Lista de perfiles (se baja una vez por sesión). */
export function usePerfiles() {
  const [lista, setLista] = useState<PerfilEjemplo[] | null>(cache);
  const [error, setError] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (cache) return;
    let vivo = true;
    fetch('/demo/perfiles/index.json')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: unknown) => {
        const ok = Array.isArray(j) ? (j as PerfilEjemplo[]).filter(x => x && typeof x.id === 'string' && typeof x.nombre === 'string') : [];
        if (!ok.length) throw new Error('vacío');
        cache = ok;
        if (vivo) { setLista(ok); setError(false); }
      })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [n]);
  return { lista, error, reintentar: () => { setError(false); setN(x => x + 1); } };
}

/** Grilla de tarjetas: nombre, rubro y cómo está hoy. Cada una carga el perfil. */
export function GrillaPerfiles({ onElegir, actual, titulo, id }: { onElegir?: (p: PerfilEjemplo) => void; actual?: string | null; titulo?: string; id: string }) {
  const { cargarPerfil } = useDatos();
  const { lista, error, reintentar } = usePerfiles();
  return (
    <section className={s.perfiles} aria-labelledby={id}>
      <div>
        <h2 className={s.h2} id={id}>{titulo ?? 'Probar con otra pyme'}</h2>
        <p className={s.sub}>Seis negocios inventados, cada uno en una situación distinta. Elegí uno y mirá qué te diría la app.</p>
      </div>
      {error && (
        <div className={s.avisoBox} role="alert">
          No pudimos traer los ejemplos. <button type="button" className={s.link} style={{ minHeight: 0 }} onClick={reintentar}>Probar de nuevo</button>
        </div>
      )}
      {!lista && !error && <div className={s.hueso} style={{ height: 120 }} role="status" aria-label="Cargando los ejemplos" />}
      {lista && (
        <ul className={s.perfilGrid}>
          {lista.map(p => {
            const sit = SITUACION[p.situacion] ?? { t: p.situacion.replace(/-/g, ' '), c: '' };
            const activo = actual === p.id;
            return (
              <li key={p.id}>
                <button type="button" className={s.perfilCard} aria-current={activo ? 'true' : undefined}
                  onClick={() => { cargarPerfil(p.id, p.nombre); onElegir?.(p); }}>
                  <strong>{p.nombre}</strong>
                  <small>{p.rubro} · {plural(p.empleados, 'empleado')}</small>
                  <span className={`${s.chip} ${s.chipMini} ${sit.c}`}>{sit.t}</span>
                  <span className={s.perfilIr} aria-hidden>{activo ? 'Lo estás viendo' : 'Ver este ejemplo →'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Banner de Inicio cuando se mira una pyme de ejemplo: quién es, qué mirar y el saldo de la demo en un toque. */
export function BannerPerfil({ v }: { v: Vista }) {
  const { ws, empezarPropio, ponerSaldo } = useDatos();
  const [otra, setOtra] = useState(false);
  const p = v.perfil;
  const nombre = p?.nombre ?? ws.perfil?.nombre ?? 'pyme de ejemplo';
  return (
    <section className={s.bannerPerfil} aria-labelledby="t-perfil">
      <div className={s.bannerPerfilCab}>
        <div>
          <span className={s.eyebrow}><Icono n="demo" size={14} /> Pyme de ejemplo</span>
          <h2 className={s.h2} id="t-perfil">Estás viendo una pyme de ejemplo: {nombre}</h2>
          {p?.rubro && <p className={s.sub}>{p.rubro}. Todo es inventado: nada de esto es tuyo.</p>}
        </div>
        <div className={s.btnRow}>
          <button type="button" className={`${s.btn} ${s.btnPri}`} onClick={empezarPropio}>Empezar con los míos</button>
          <button type="button" className={s.btn} aria-expanded={otra} aria-controls="otra-pyme" onClick={() => setOtra(o => !o)}>{otra ? 'Ocultar ejemplos' : 'Probar con otra pyme'}</button>
        </div>
      </div>
      {p?.pista && <p className={s.pista}><b>Qué mirar en este ejemplo:</b> {p.pista}</p>}
      {!v.saldo.confirmado && p && (
        <div className={s.saldoDemo}>
          <p>El saldo de arriba es una estimación: sumar los pagos no da lo que hay en la cuenta. Confirmalo como lo harías con el tuyo.</p>
          <button type="button" className={`${s.btn} ${s.btnPri}`} onClick={() => ponerSaldo(hoyLocal(), p.saldoSugerido)}>
            Usar el saldo de la demo ({pesos(p.saldoSugerido)})
          </button>
        </div>
      )}
      {otra && <div id="otra-pyme"><GrillaPerfiles id="t-otra" titulo="Elegí otra pyme" actual={ws.perfil?.id} onElegir={() => setOtra(false)} /></div>}
    </section>
  );
}

