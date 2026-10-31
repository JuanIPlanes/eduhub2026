// /mercado — Resumen del mercado ficticio: IF12, las que más subieron/cayeron y ranking por puntaje.
import Link from 'next/link';
import { empresas, resumen } from '@/lib/mercado/vistas';
import { ACLARACION_PUNTAJE, fechaLarga, numero } from '@/lib/mercado/formato';
import Grafico from './Grafico';
import Ranking from './Ranking';
import { FilaEmpresa, Variacion } from './piezas';
import { GLOSARIO } from './glosario';
import s from './mercado.module.css';

export const dynamic = 'force-static';

export default function ResumenMercado() {
  const r = resumen();
  const lista = empresas(null, 'score');
  const serie = r.if12.serie;
  const ult = serie[serie.length - 1].valor;

  return (
    <div className={s.pagina}>
      <div className={s.cabPagina}>
        <span className={s.eyebrow}>Práctica · 12 empresas inventadas</span>
        <h1>Mercado ficticio</h1>
        <p className={s.bajada}>Datos al {fechaLarga(r.fecha_corte)}. Precios en pesos. Sirve para aprender a leer acciones sin poner plata: nada de esto existe.</p>
      </div>

      <section className={s.card} aria-labelledby="t-if12">
        <div className={s.cardCab}>
          <h2 id="t-if12">Índice ficticio IF12</h2>
          <span className={s.notaChica}>{GLOSARIO.if12.replace('Índice IF12: ', '')}</span>
        </div>
        <div className={s.fichaPrecio}>
          <span className={`${s.valorGrande} ${s.num}`}>{numero(ult, 2)}</span>
          <span className={s.nota}>puntos (base 100 el 1 nov 2024)</span>
        </div>
        <dl className={`${s.if12Fila} ${s.num}`} style={{ margin: 0 }}>
          {([['1 mes', r.if12.ret_1m], ['3 meses', r.if12.ret_3m], ['6 meses', r.if12.ret_6m], ['12 meses', r.if12.ret_12m]] as const).map(([k, v]) => (
            <div key={k} className={s.dato}><dt>{k}</dt><dd><Variacion v={v} /></dd></div>
          ))}
        </dl>
        <Grafico
          titulo="Índice ficticio IF12" formato="indice"
          fechas={serie.map(p => p.fecha)}
          series={[{ id: 'if12', nombre: 'IF12', valores: serie.map(p => p.valor), estilo: 'principal' }]}
          rangos={['1m', '3m', '6m', '12m']} rangoInicial="12m"
          eventos={r.eventos_mercado}
        />
      </section>

      <div className={s.grid2}>
        <section className={s.card} aria-labelledby="t-suben">
          <div className={s.cardCab}><h2 id="t-suben">Las que más subieron</h2><span className={s.notaChica}>últimos 12 meses</span></div>
          <ol className={s.lista}>{r.suben.map(f => <li key={f.ticker}><FilaEmpresa f={f} dato="ret" /></li>)}</ol>
        </section>
        <section className={s.card} aria-labelledby="t-caen">
          <div className={s.cardCab}><h2 id="t-caen">Las que más cayeron</h2><span className={s.notaChica}>últimos 12 meses</span></div>
          <ol className={s.lista}>{r.caen.map(f => <li key={f.ticker}><FilaEmpresa f={f} dato="ret" /></li>)}</ol>
        </section>
      </div>

      <section className={s.card} aria-labelledby="t-ranking">
        <div className={s.cardCab}>
          <h2 id="t-ranking">Ranking por puntaje</h2>
          <span className={s.notaChica}>{r.conteo.alto} con puntaje alto · {r.conteo.medio} medio · {r.conteo.bajo} bajo</span>
        </div>
        <p className={s.nota}>
          Puntaje de 0 a 100 {ACLARACION_PUNTAJE}: compara a cada empresa con las otras 11 de este mercado en valuación, calidad, crecimiento, solidez y riesgo.
          Alto es 65 o más, medio de 40 a 65 y bajo menos de 40. No es una opinión sobre qué hacer.
        </p>
        <Ranking filas={lista.empresas} sectores={lista.sectores} />
      </section>

      <section className={s.card} aria-labelledby="t-sim">
        <h2 id="t-sim">Simulador de cartera ficticia</h2>
        <p className={s.nota}>Armá una cartera de práctica con hasta 8 empresas y mirá cómo se habría movido en el último año. No mueve plata ni usa los datos de tu caja.</p>
        <div className={s.acciones}><Link href="/mercado/simulador" className={`${s.btn} ${s.btnPri}`}>Abrir el simulador</Link></div>
      </section>

      <details className={`${s.card} ${s.glos}`}>
        <summary>Glosario: qué significa cada término</summary>
        <dl className={s.glosario}>
          {Object.values(GLOSARIO).map(t => { const [k, ...v] = t.split(': '); return <div key={k}><dt>{k}</dt><dd>{v.join(': ')}</dd></div>; })}
        </dl>
      </details>
    </div>
  );
}
