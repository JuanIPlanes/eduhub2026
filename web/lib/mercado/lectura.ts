// Lectura en palabras con plantillas deterministas (sin IA): solo usa cifras de las métricas calculadas.
import { PILARES, type FilaMercado, type Pilar } from './calculo';
import { ACLARACION_PUNTAJE, NIVEL_TEXTO, numero, pct, veces } from './formato';

const pctAbs = (x: number) => pct(Math.abs(x));

function lomejor(p: Pilar, f: FilaMercado): string {
  const m = f.metricas;
  switch (p) {
    case 'valuacion': return `Lo mejor: su precio es bajo en relación con lo que gana, comparado con las otras empresas de este mercado (P/E de ${veces(m.pe)}).`;
    case 'calidad': return `Lo mejor: gana bastante por cada peso que vende (margen EBITDA de ${pct(m.margen_ebitda)}) y por cada peso que pusieron sus dueños (ROE de ${pct(m.roe)}).`;
    case 'crecimiento': return `Lo mejor: sus ingresos crecieron ${pct(m.crec_ingresos)} en el último año, más que los de la mayoría.`;
    case 'solidez': return m.deuda_neta_ebitda !== null && m.deuda_neta_ebitda <= 0
      ? 'Lo mejor: tiene más caja que deuda.'
      : `Lo mejor: tiene poca deuda en relación con lo que genera (podría pagarla con ${numero(m.deuda_neta_ebitda, 1)} años de resultado operativo).`;
    case 'riesgo': return `Lo mejor: su precio se movió menos que el de la mayoría (volatilidad de ${pct(m.vol_anual)} y una caída máxima de ${pctAbs(m.max_dd_12m)} en el año).`;
  }
}

function amirar(p: Pilar, f: FilaMercado): string {
  const m = f.metricas;
  switch (p) {
    case 'valuacion': return m.pe === null
      ? 'Lo que hay que mirar: no tiene ganancias en el último año, así que no se puede medir cuántos años de ganancia se pagan por la acción.'
      : `Lo que hay que mirar: su precio es alto en relación con lo que gana (P/E de ${veces(m.pe)}).`;
    case 'calidad': return m.roe < 0
      ? `Lo que hay que mirar: en el último año perdió plata (ROE de ${pct(m.roe)}).`
      : `Lo que hay que mirar: gana poco por cada peso que vende (margen EBITDA de ${pct(m.margen_ebitda)}).`;
    case 'crecimiento': return `Lo que hay que mirar: sus ingresos crecieron menos que los de la mayoría (${pct(m.crec_ingresos)} en el último año).`;
    case 'solidez': return `Lo que hay que mirar: tiene mucha deuda en relación con lo que genera (${numero(m.deuda_neta_ebitda, 1)} años de resultado operativo para pagarla).`;
    case 'riesgo': return `Lo que hay que mirar: su precio se mueve mucho: en este período llegó a caer ${pctAbs(m.max_dd_12m)} desde un máximo.`;
  }
}

/** 4 frases: qué hace y cómo le fue, lo mejor, lo que hay que mirar y el cierre fijo. */
export function lecturaEnPalabras(f: FilaMercado, retIF12: number): string[] {
  const { empresa: e, metricas: m, puntaje: s } = f;
  const mov = (x: number) => (x >= 0 ? `subió ${pct(x)}` : `bajó ${pctAbs(x)}`);
  const comp = m.ret_12m > retIF12 ? 'le fue mejor que al promedio' : m.ret_12m < retIF12 ? 'le fue peor que al promedio' : 'le fue igual que al promedio';
  const frase1 = `${e.nombre} es una empresa del sector ${e.sector}. En los últimos 12 meses su precio ${mov(m.ret_12m)}; el índice ficticio IF12 ${mov(retIF12)} en el mismo período, así que ${comp}.`;
  let mejor = PILARES[0].id, peor = PILARES[0].id;
  for (const p of PILARES) {
    if (s[p.id] > s[mejor]) mejor = p.id;
    if (s[p.id] < s[peor]) peor = p.id;
  }
  const cierre = `Lectura: ${NIVEL_TEXTO[s.nivel].toLowerCase()} (${numero(s.total, 1)} de 100), ${ACLARACION_PUNTAJE}.`;
  return [frase1, lomejor(mejor, f), amirar(peor, f), cierre];
}
