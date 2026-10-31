// Glosario de una línea por término (skill: "Glosario mínimo para la interfaz"), en voseo.
export const GLOSARIO = {
  precio: 'Precio: último precio de cierre de la acción, en pesos.',
  pe: 'P/E: cuántos años de ganancia actual estás pagando por la acción.',
  ev_ebitda: 'EV/EBITDA: lo mismo que el P/E, pero mirando el valor de toda la empresa (incluida la deuda) contra lo que gana operando.',
  vol_anual: 'Volatilidad: cuánto se mueve el precio; más alta, más sube y baja.',
  max_dd_12m: 'Caída máxima: la peor caída desde un pico dentro del último año.',
  beta_12m: 'Beta: si es mayor que 1, la acción se mueve más que el índice; si es menor, menos.',
  roe: 'ROE: cuánto gana la empresa por cada peso que pusieron sus dueños.',
  deuda_neta_ebitda: 'Deuda neta / EBITDA: en cuántos años de resultado operativo se podría pagar la deuda.',
  div_yield: 'Dividend yield: lo que paga de dividendos en un año, como porcentaje del precio.',
  if12: 'Índice IF12: promedio simple de las 12 empresas ficticias, para comparar.',
  margen_ebitda: 'Margen EBITDA: de cada peso que vende, cuánto le queda de resultado operativo.',
  crec_ingresos: 'Crecimiento de ingresos: cuánto vendió en el último año contra el año anterior.',
  mkt_cap_mm: 'Capitalización: lo que valen todas las acciones juntas al precio de hoy.',
  eps_ttm: 'Ganancia por acción: resultado neto del último año dividido por la cantidad de acciones.',
  ret_12m: 'Retorno 12 meses: cuánto subió o bajó el precio en el último año (sin contar dividendos).',
  puntaje: 'Puntaje ficticio: de 0 a 100, compara a cada empresa con las otras 11 de este mercado; no es una opinión sobre la empresa.',
  ebitda: 'EBITDA: lo que gana la empresa con su operación, antes de intereses, impuestos y amortizaciones.',
} as const;

export const PILAR_TEXTO = {
  valuacion: 'Qué tan barato está el precio contra lo que gana (P/E y EV/EBITDA; menor es mejor).',
  calidad: 'Cuánto gana por lo que vende y por lo que pusieron sus dueños (margen EBITDA y ROE).',
  crecimiento: 'Cuánto crecieron sus ingresos en el último año.',
  solidez: 'Cuánta deuda tiene contra lo que genera (deuda neta / EBITDA; menor es mejor).',
  riesgo: 'Cuánto se movió y cuánto cayó el precio (más puntaje = se movió menos).',
} as const;
