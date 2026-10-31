'use client';
// Simulador de cartera ficticia. Monto y horizonte pueden venir por query (?monto=...&horizonte=...) desde Excedente.
// El monto nunca sale del navegador: al servidor solo van el horizonte y las posiciones; los pesos se calculan acá.
import { useId, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { HORIZONTE_MIN_RENTA_VARIABLE_MESES } from '@/lib/mercado/calculo';
import { MAX_POSICIONES, enPesos, type ResultadoSimulacion } from '@/lib/mercado/simulador';
import { fecha, horizonteTexto, numero, pct, pesos } from '@/lib/mercado/formato';
import Grafico from '../Grafico';
import { Variacion } from '../piezas';
import s from '../mercado.module.css';

type EmpresaSel = { ticker: string; nombre: string; sector: string };
type Peor = { ticker: string; nombre: string; max_dd_12m: number };
type Fila = { clave: number; ticker: string; peso: string };
type Simulado = Extract<ResultadoSimulacion, { simulable: true }>;
type Estado = { tipo: 'idle' } | { tipo: 'cargando' } | { tipo: 'error'; msg: string } | { tipo: 'ok'; r: Simulado };

const OPCIONES_HORIZONTE = [3, 6, 12, 24, 25];

function leerMonto(x: string | null): number | null {
  if (!x) return null;
  const n = Number(x.replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 && n <= 1e13 ? n : null;
}
function leerHorizonte(x: string | null): number | null {
  if (!x) return null;
  const n = Number.parseInt(x, 10);
  return Number.isInteger(n) && n >= 1 && n <= 600 ? n : null;
}
const aNumero = (t: string) => { const n = Number(t.replace(',', '.')); return t.trim() === '' || !Number.isFinite(n) ? null : n; };

export default function Simulador({ empresas, peor }: { empresas: EmpresaSel[]; peor: Peor }) {
  const sp = useSearchParams();
  const montoMax = leerMonto(sp.get('monto'));
  const horizonteQ = leerHorizonte(sp.get('horizonte') ?? sp.get('horizonte_meses'));
  const id = useId();

  const [montoTxt, setMontoTxt] = useState(montoMax ? numero(montoMax, 0) : '');
  const [horizonte, setHorizonte] = useState<number | null>(horizonteQ);
  const [filas, setFilas] = useState<Fila[]>([{ clave: 1, ticker: '', peso: '' }]);
  const [sig, setSig] = useState(2);
  const [estado, setEstado] = useState<Estado>({ tipo: 'idle' });

  const monto = leerMonto(montoTxt);
  const montoError = montoTxt && !monto ? 'Escribí un monto mayor que cero.'
    : montoMax && monto && monto > montoMax ? `No puede superar el excedente que trajiste (${pesos(montoMax, 0)}).` : null;
  const opciones = useMemo(() => [...new Set([...OPCIONES_HORIZONTE, ...(horizonteQ ? [horizonteQ] : [])])].sort((a, b) => a - b), [horizonteQ]);
  const corto = horizonte !== null && horizonte < HORIZONTE_MIN_RENTA_VARIABLE_MESES;

  const pesosNum = filas.map(f => aNumero(f.peso));
  const total = pesosNum.reduce<number>((a, p) => a + (p ?? 0), 0);
  const totalOk = Math.abs(total - 100) <= 0.01;
  const filasOk = filas.every((f, i) => f.ticker && pesosNum[i] !== null && pesosNum[i]! > 0 && pesosNum[i]! <= 100);
  const puede = !!monto && !montoError && horizonte !== null && !corto && filasOk && totalOk && estado.tipo !== 'cargando';
  const falta = !monto ? 'Falta el monto.' : montoError ? montoError : horizonte === null ? 'Falta el plazo.' : !filasOk ? 'Elegí una empresa y un peso en cada fila.' : !totalOk ? 'Los pesos tienen que sumar 100 %.' : '';

  const cambiar = (clave: number, cambio: Partial<Fila>) => { setFilas(fs => fs.map(f => (f.clave === clave ? { ...f, ...cambio } : f))); setEstado({ tipo: 'idle' }); };
  const agregar = () => { if (filas.length < MAX_POSICIONES) { setFilas(fs => [...fs, { clave: sig, ticker: '', peso: '' }]); setSig(sig + 1); setEstado({ tipo: 'idle' }); } };
  const quitar = (clave: number) => { setFilas(fs => (fs.length > 1 ? fs.filter(f => f.clave !== clave) : [{ ...fs[0], ticker: '', peso: '' }])); setEstado({ tipo: 'idle' }); };
  const repartir = () => {
    const n = filas.length, base = Math.floor((10000 / n)) / 100;
    setFilas(fs => fs.map((f, i) => ({ ...f, peso: numero(i === n - 1 ? 100 - base * (n - 1) : base, 2).replace(/,00$/, '') })));
    setEstado({ tipo: 'idle' });
  };

  async function simular() {
    if (!puede) return;
    setEstado({ tipo: 'cargando' });
    try {
      const res = await fetch('/api/mercado/simular', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ horizonte_meses: horizonte, posiciones: filas.map((f, i) => ({ ticker: f.ticker, peso: pesosNum[i] })) }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j) { setEstado({ tipo: 'error', msg: j?.error ?? 'El servidor no respondió bien.' }); return; }
      if (!j.simulable) { setEstado({ tipo: 'idle' }); return; }
      setEstado({ tipo: 'ok', r: j as Simulado });
    } catch {
      setEstado({ tipo: 'error', msg: 'No hubo conexión con el servidor.' });
    }
  }

  return (
    <div className={s.pagina}>
      <div className={s.cabPagina}>
        <span className={s.eyebrow}>Práctica · cartera ficticia</span>
        <h1>Simulador de cartera</h1>
        <p className={s.bajada}>Elegí hasta {MAX_POSICIONES} empresas ficticias, repartí el monto y mirá cómo se habría movido esa cartera en los últimos 12 meses.</p>
      </div>

      <section className={s.card} aria-labelledby="t-practica">
        <h2 id="t-practica">Tu práctica</h2>
        <div className={s.aviso}>
          <strong>Tu caja es real; este mercado es ficticio.</strong>
          <span>El simulador es práctica: no mueve plata, no se conecta con ninguna entidad y no usa ni guarda los datos de tu caja. El monto queda en esta pantalla: al servidor solo le llegan las empresas y los porcentajes.</span>
        </div>
        <div className={s.grid2}>
          <div className={s.campo}>
            <label htmlFor={`${id}-monto`}>{montoMax ? 'Monto a simular (hasta tu excedente)' : 'Monto para practicar, en pesos'}</label>
            <input
              id={`${id}-monto`} className={`${s.input} ${s.num}`} inputMode="numeric" autoComplete="off" placeholder="Ej.: 1.000.000"
              value={montoTxt} aria-invalid={!!montoError} aria-describedby={`${id}-monto-ayuda`}
              onChange={e => { const d = e.target.value.replace(/[^\d]/g, '').slice(0, 13); setMontoTxt(d ? numero(Number(d), 0) : ''); }}
            />
            <span id={`${id}-monto-ayuda`} className={montoError ? s.baja : s.notaChica} style={{ fontSize: 12.5 }}>
              {montoError ?? (montoMax
                ? `Viene de tu pantalla Excedente: ${pesos(montoMax, 0)} es el máximo. La reserva operativa y lo comprometido en pagos próximos nunca se suman acá.`
                : 'Elegilo vos: no se toma de tu caja.')}
            </span>
          </div>
          <div className={s.campo}>
            <label htmlFor={`${id}-hor`}>¿En cuánto tiempo vas a necesitar esa plata?</label>
            <select id={`${id}-hor`} className={s.select} value={horizonte ?? ''} onChange={e => { setHorizonte(e.target.value ? Number(e.target.value) : null); setEstado({ tipo: 'idle' }); }}>
              <option value="">Elegí un plazo</option>
              {opciones.map(h => <option key={h} value={h}>{h > 24 ? 'Más de 24 meses' : `${h} meses`}</option>)}
            </select>
            <span className={s.notaChica} style={{ fontSize: 12.5 }}>Las acciones solo se simulan si el plazo es de {HORIZONTE_MIN_RENTA_VARIABLE_MESES} meses o más.</span>
          </div>
        </div>
      </section>

      {corto && (
        <section className={`${s.aviso} ${s.avisoFuerte}`} role="status" aria-labelledby="t-corto">
          <strong id="t-corto">Con este plazo no se arma la cartera</strong>
          <p>
            Este excedente lo vas a necesitar en menos de {HORIZONTE_MIN_RENTA_VARIABLE_MESES} meses. Las acciones pueden caer mucho en ese plazo:
            en este mercado ficticio, la peor caída de un año fue de {pct(Math.abs(peor.max_dd_12m))} (empresa {peor.ticker}).
            Para plata de corto plazo conviene priorizar liquidez.
          </p>
        </section>
      )}

      {!corto && horizonte === null && (
        <p className={s.nota}>Elegí el plazo para seguir. Con menos de {HORIZONTE_MIN_RENTA_VARIABLE_MESES} meses el simulador no arma cartera y te explica por qué.</p>
      )}

      {!corto && horizonte !== null && (
        <section className={s.card} aria-labelledby="t-cartera">
          <div className={s.cardCab}>
            <h2 id="t-cartera">Tu cartera ficticia</h2>
            <span className={s.notaChica}>Plazo: {horizonteTexto(horizonte)}</span>
          </div>
          <ul className={s.posiciones}>
            {filas.map((f, i) => {
              const usadas = new Set(filas.filter(x => x.clave !== f.clave).map(x => x.ticker));
              return (
                <li key={f.clave} className={s.posicion}>
                  <div className={s.campo}>
                    <label htmlFor={`${id}-t${f.clave}`}>Empresa {i + 1}</label>
                    <select id={`${id}-t${f.clave}`} className={s.select} value={f.ticker} onChange={e => cambiar(f.clave, { ticker: e.target.value })}>
                      <option value="">Elegí una empresa</option>
                      {empresas.filter(e => !usadas.has(e.ticker)).map(e => <option key={e.ticker} value={e.ticker}>{e.ticker} · {e.nombre}</option>)}
                    </select>
                  </div>
                  <div className={s.campo}>
                    <label htmlFor={`${id}-p${f.clave}`}>Peso %</label>
                    <input id={`${id}-p${f.clave}`} className={`${s.input} ${s.num}`} inputMode="decimal" autoComplete="off" placeholder="0"
                      value={f.peso} onChange={e => cambiar(f.clave, { peso: e.target.value.replace(/[^\d.,]/g, '').slice(0, 6) })} />
                  </div>
                  <button type="button" className={s.quitar} onClick={() => quitar(f.clave)} aria-label={`Quitar la empresa ${i + 1}${f.ticker ? ` (${f.ticker})` : ''}`}>×</button>
                </li>
              );
            })}
          </ul>
          <div className={s.acciones}>
            <button type="button" className={s.btnTexto} onClick={agregar} disabled={filas.length >= MAX_POSICIONES}>+ Agregar empresa ({filas.length} de {MAX_POSICIONES})</button>
            <button type="button" className={s.btnTexto} onClick={repartir}>Repartir en partes iguales</button>
          </div>
          <div className={`${s.total} ${totalOk ? s.totalOk : s.totalMal}`} aria-live="polite">
            <span>Total de los pesos</span>
            <strong className={s.num}>{numero(total, total % 1 ? 2 : 0)} %{totalOk ? ' · listo' : total < 100 ? ` · faltan ${numero(100 - total, 2).replace(/,00$/, '')} %` : ` · sobran ${numero(total - 100, 2).replace(/,00$/, '')} %`}</strong>
          </div>
          <div className={s.acciones}>
            <button type="button" className={`${s.btn} ${s.btnPri}`} onClick={simular} disabled={!puede} aria-describedby={`${id}-falta`} aria-busy={estado.tipo === 'cargando'}>
              {estado.tipo === 'cargando' ? 'Simulando…' : 'Simular'}
            </button>
            <span id={`${id}-falta`} className={s.notaChica}>{falta}</span>
          </div>
        </section>
      )}

      {estado.tipo === 'error' && !corto && (
        <div className={s.card} role="alert">
          <strong>No se pudo simular.</strong>
          <p className={s.nota}>{estado.msg}</p>
          <div className={s.acciones}><button type="button" className={s.btn} onClick={simular} disabled={!puede}>Reintentar</button></div>
        </div>
      )}

      {estado.tipo === 'ok' && !corto && monto && <Resultado r={estado.r} monto={Math.min(monto, montoMax ?? Infinity)} />}
    </div>
  );
}

function Resultado({ r, monto }: { r: Simulado; monto: number }) {
  const p = enPesos(r, monto);
  const pm = r.cartera.peor_mes;
  return (
    <section className={s.card} aria-labelledby="t-res" aria-live="polite">
      <div className={s.cardCab}>
        <h2 id="t-res">Cómo le habría ido</h2>
        <span className={s.notaChica}>del {fecha(r.ventana.desde)} al {fecha(r.ventana.hasta)} ({r.ventana.ruedas} cierres)</span>
      </div>
      <dl className={s.tiles}>
        <div className={s.tile}><dt>Cartera, 12 meses</dt><dd className={s.metricaVal}><Variacion v={r.cartera.ret_12m} /></dd></div>
        <div className={s.tile}><dt>Índice IF12, 12 meses</dt><dd className={s.metricaVal}><Variacion v={r.if12.ret_12m} /></dd></div>
        <div className={s.tile}><dt>Volatilidad anual</dt><dd className={`${s.metricaVal} ${s.num}`}>{pct(r.cartera.vol_anual)}</dd></div>
        <div className={s.tile}><dt>Caída máxima</dt><dd className={`${s.metricaVal} ${s.num}`}>{pct(r.cartera.max_dd_12m)}</dd></div>
      </dl>

      <Grafico
        titulo="Cartera ficticia contra el IF12 (base 100)" formato="base100"
        fechas={r.serie.map(x => x.fecha)}
        series={[
          { id: 'cartera', nombre: 'Cartera', valores: r.serie.map(x => x.cartera), estilo: 'principal' },
          { id: 'if12', nombre: 'IF12', valores: r.serie.map(x => x.if12), estilo: 'referencia' },
        ]}
        rangos={['12m']} rangoInicial="12m"
      />
      <p className={s.notaChica}>Las dos líneas arrancan en 100 para comparar: 110 quiere decir que subió un 10 %.</p>

      <div className={s.grid2}>
        <div className={s.aviso}>
          <strong>Qué pasaría con tu plata</strong>
          <span>
            Con una caída igual a la máxima de este año ({pct(Math.abs(r.cartera.max_dd_12m))}), de <b className={s.num}>{pesos(monto, 0)}</b> quedarían <b className={s.num}>{pesos(p.queda_tras_caida_max, 0)}</b>.
          </span>
          <span>
            {pm.ret < 0
              ? <>Peor mes (21 ruedas, del {fecha(pm.desde)} al {fecha(pm.hasta)}): <b className={s.baja}>▼ {pct(Math.abs(pm.ret))}</b>, o sea <b className={s.num}>{pesos(p.peor_mes, 0)}</b> sobre lo simulado.</>
              : <>No tuvo ningún mes (21 ruedas) con pérdida en este período.</>}
          </span>
        </div>
        <div className={s.aviso}>
          <strong>Concentración</strong>
          <span>Mayor posición: {r.concentracion.mayor_posicion.ticker} con {pct(r.concentracion.mayor_posicion.peso)}.</span>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {r.concentracion.sectores.map(x => <li key={x.sector}>{x.sector}: <span className={s.num}>{pct(x.peso)}</span></li>)}
          </ul>
        </div>
      </div>
      {r.concentracion.avisos.length > 0 && (
        <div className={`${s.aviso} ${s.avisoFuerte}`}>
          <strong>Aviso de concentración</strong>
          {r.concentracion.avisos.map(a => <span key={a}>{a}</span>)}
        </div>
      )}
      <p className={s.cierre}>Resultados pasados de un mercado ficticio. No anticipan nada ni son una recomendación.</p>
    </section>
  );
}
