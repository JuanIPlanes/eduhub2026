// /mercado/[ticker] — Ficha de una empresa ficticia.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PILARES, type Metricas } from '@/lib/mercado/calculo';
import { ficha, listaTickers } from '@/lib/mercado/vistas';
import { ACLARACION_PUNTAJE, NIVEL_TEXTO, fecha, fechaLarga, millones, numero, pct, pesos, veces } from '@/lib/mercado/formato';
import Grafico from '../Grafico';
import { NivelChip, Variacion } from '../piezas';
import { GLOSARIO, PILAR_TEXTO } from '../glosario';
import s from '../mercado.module.css';

export function generateStaticParams() {
  return listaTickers().map(t => ({ ticker: t.ticker }));
}

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const { ticker } = await params;
  const f = ficha(decodeURIComponent(ticker));
  return { title: f ? `${f.empresa.ticker} (ficticia) · Mercado ficticio` : 'Mercado ficticio' };
}

const def = (k: keyof typeof GLOSARIO) => GLOSARIO[k].split(': ').slice(1).join(': ');

type Tarjeta = { id: string; nombre: string; valor: string; exp: string; sinDato?: boolean };
function tarjetas(m: Metricas): Tarjeta[] {
  return [
    m.pe === null
      ? { id: 'pe', nombre: 'P/E', valor: 'Sin ganancias', exp: 'Perdió plata en el último año, así que no se puede calcular cuántos años de ganancia se pagan.', sinDato: true }
      : { id: 'pe', nombre: 'P/E', valor: veces(m.pe), exp: def('pe') },
    { id: 'ev', nombre: 'EV/EBITDA', valor: veces(m.ev_ebitda), exp: def('ev_ebitda'), sinDato: m.ev_ebitda === null },
    { id: 'de', nombre: 'Deuda neta / EBITDA', valor: m.deuda_neta_ebitda === null ? '—' : `${numero(m.deuda_neta_ebitda, 1)} años`, exp: def('deuda_neta_ebitda'), sinDato: m.deuda_neta_ebitda === null },
    { id: 'mg', nombre: 'Margen EBITDA', valor: pct(m.margen_ebitda), exp: def('margen_ebitda') },
    { id: 'roe', nombre: 'ROE', valor: pct(m.roe), exp: def('roe') },
    { id: 'cr', nombre: 'Crecimiento de ingresos', valor: pct(m.crec_ingresos), exp: def('crec_ingresos') },
    { id: 'vol', nombre: 'Volatilidad anual', valor: pct(m.vol_anual), exp: def('vol_anual') },
    { id: 'dd', nombre: 'Caída máxima (12 meses)', valor: pct(m.max_dd_12m), exp: def('max_dd_12m') },
    { id: 'beta', nombre: 'Beta', valor: numero(m.beta_12m, 2), exp: def('beta_12m') },
    { id: 'dy', nombre: 'Dividend yield', valor: pct(m.div_yield), exp: def('div_yield') },
    { id: 'cap', nombre: 'Capitalización', valor: millones(m.mkt_cap_mm), exp: def('mkt_cap_mm') },
    { id: 'eps', nombre: 'Ganancia por acción', valor: pesos(m.eps_ttm), exp: def('eps_ttm') },
  ];
}

export default async function FichaEmpresa({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const crudo = decodeURIComponent(ticker);
  const f = ficha(crudo, 'todo');
  if (!f) notFound();
  if (crudo !== f.empresa.ticker) redirect(`/mercado/${f.empresa.ticker}`);
  const { empresa: e, metricas: m, puntaje: p } = f;

  return (
    <div className={s.pagina}>
      <Link href="/mercado" className={s.volver} style={{ alignSelf: 'flex-start', minHeight: 32 }}>← Resumen del mercado</Link>

      <div className={s.fichaCab}>
        <span className={s.fichaTicker}>{e.ticker}</span>
        <h1 style={{ fontSize: 'clamp(24px, 6vw, 32px)', fontWeight: 650 }}>{e.nombre}</h1>
        <div className={s.chips}>
          <span className={s.chip}>{e.sector}</span>
          <span className={s.chip}>Empresa ficticia</span>
          <NivelChip nivel={p.nivel} />
          <span className={s.notaChica}>Puesto {f.posicion} de {f.total_empresas} por puntaje</span>
        </div>
        <p className={s.nota} style={{ maxWidth: '68ch' }}>{e.descripcion}</p>
        <div className={s.fichaPrecio}>
          <span className={`${s.valorGrande} ${s.num}`}>{pesos(m.precio)}</span>
          <span className={s.nota}>cierre del {fecha(f.fecha_corte)}</span>
        </div>
        <dl className={`${s.if12Fila} ${s.num}`} style={{ margin: 0 }}>
          {([['1 mes', m.ret_1m], ['3 meses', m.ret_3m], ['6 meses', m.ret_6m], ['12 meses', m.ret_12m]] as const).map(([k, v]) => (
            <div key={k} className={s.dato}><dt>{k}</dt><dd><Variacion v={v} /></dd></div>
          ))}
        </dl>
      </div>

      <div className={s.layoutFicha}>
        <div className={s.col}>
          <section className={s.card} aria-labelledby="t-lectura">
            <h2 id="t-lectura">Lectura en palabras</h2>
            <div className={s.lectura}>{f.lectura_en_palabras.map((t, i) => <p key={i}>{t}</p>)}</div>
          </section>

          <section className={s.card} aria-labelledby="t-precio">
            <div className={s.cardCab}><h2 id="t-precio">Precio</h2><span className={s.notaChica}>en pesos, cierre diario</span></div>
            <Grafico
              titulo={`Precio de ${e.ticker}`} formato="pesos"
              fechas={f.serie.map(x => x.fecha)}
              series={[{ id: e.ticker, nombre: e.ticker, valores: f.serie.map(x => x.cierre), estilo: 'principal' }]}
              rangos={['1m', '3m', '6m', '12m', 'todo']} rangoInicial="12m"
              eventos={f.eventos}
            />
          </section>

          <section className={s.card} aria-labelledby="t-trim">
            <div className={s.cardCab}><h2 id="t-trim">Últimos 8 trimestres</h2><span className={s.notaChica}>millones de pesos</span></div>
            <div className={s.tablaPlana} tabIndex={0} role="region" aria-label="Tabla de los últimos 8 trimestres">
              <table className={`${s.tablaDatos} ${s.num}`}>
                <caption className={s.sr}>Resultados trimestrales de {e.nombre}, en millones de pesos</caption>
                <thead>
                  <tr><th scope="col">Trimestre</th><th scope="col">Ingresos</th><th scope="col"><abbr title={def('ebitda')}>EBITDA</abbr></th><th scope="col">Resultado neto</th><th scope="col">Deuda neta</th><th scope="col">Patrimonio</th></tr>
                </thead>
                <tbody>
                  {[...f.trimestres].reverse().map(q => (
                    <tr key={q.periodo}>
                      <th scope="row" style={{ fontWeight: 500 }}>{q.periodo}</th>
                      <td>{numero(q.ingresos_mm, 0)}</td><td>{numero(q.ebitda_mm, 0)}</td>
                      <td style={q.resultado_neto_mm < 0 ? { color: 'var(--neg)' } : undefined}>{numero(q.resultado_neto_mm, 0)}</td>
                      <td>{numero(q.deuda_neta_mm, 0)}</td><td>{numero(q.patrimonio_mm, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={s.notaChica}>{def('ebitda')} Un resultado neto negativo es pérdida.</p>
          </section>
        </div>

        <div className={s.col}>
          <section className={s.card} aria-labelledby="t-puntaje">
            <div className={s.cardCab}>
              <h2 id="t-puntaje">Puntaje por pilar</h2>
              <span className={`${s.puntajeNum} ${s.num}`}>{numero(p.total, 1)} <small>/ 100</small></span>
            </div>
            <p className={s.nota}>{NIVEL_TEXTO[p.nivel]} {ACLARACION_PUNTAJE}. Cada pilar compara a {e.ticker} con las otras {f.total_empresas - 1} empresas (100 = la mejor del grupo).</p>
            <ul className={s.pilares}>
              {PILARES.map(x => (
                <li key={x.id} className={s.pilar}>
                  <span className={s.pilarNom}>{x.nombre} <small>· pesa {numero(x.peso * 100, 0)} %</small></span>
                  <span className={`${s.pilarVal} ${s.num}`}>{numero(p[x.id], 0)}</span>
                  <span className={s.barra} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p[x.id])} aria-label={`${x.nombre}: ${numero(p[x.id], 0)} de 100`}>
                    <span style={{ width: `${Math.max(0, Math.min(100, p[x.id]))}%` }} />
                  </span>
                  <span className={s.pilarDesc}>{PILAR_TEXTO[x.id]}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className={s.card} aria-labelledby="t-metricas">
            <h2 id="t-metricas">Métricas</h2>
            <dl className={s.metricas}>
              {tarjetas(m).map(t => (
                <div key={t.id} className={s.metrica}>
                  <dt>{t.nombre}</dt>
                  <dd className={`${s.metricaVal} ${s.num} ${t.sinDato ? s.sinDato : ''}`}>{t.valor}</dd>
                  <dd className={s.metricaExp}>{t.exp}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className={s.card} aria-labelledby="t-div">
            <h2 id="t-div">Dividendos</h2>
            {f.dividendos.lista.length ? (
              <>
                <p className={s.nota}>
                  En los últimos 365 días pagó {pesos(f.dividendos.ultimos_365_dias)} por acción: un {pct(m.div_yield)} del precio actual (eso es el dividend yield).
                </p>
                <div className={s.tablaPlana}>
                  <table className={`${s.tablaDatos} ${s.num}`}>
                    <caption className={s.sr}>Dividendos de {e.ticker}</caption>
                    <thead><tr><th scope="col">Fecha ex</th><th scope="col">Por acción</th></tr></thead>
                    <tbody>{[...f.dividendos.lista].reverse().map(d => <tr key={d.fecha_ex}><td>{fechaLarga(d.fecha_ex)}</td><td>{pesos(d.monto)}</td></tr>)}</tbody>
                  </table>
                </div>
                <p className={s.notaChica}>Fecha ex: desde ese día, quien compra la acción ya no cobra ese dividendo.</p>
              </>
            ) : <p className={s.nota}>No pagó dividendos en el período de datos (desde noviembre de 2024).</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
