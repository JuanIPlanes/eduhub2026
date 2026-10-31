// Researcher (skill "Analista Researcher", sección 4, MODO EDUCATIVO): recibe el bloque del Tesorero y asigna cada tramo
// de excedente a CATEGORÍAS de colocación según cuándo se necesita la plata y el perfil. Nunca nombra tickers, emisores
// ni fondos. Puro (sin red ni Node): corre igual en el servidor y en el navegador cuando el usuario cambia su perfil.
import type { BloqueResearcher, Categoria5, Estabilidad, ExcedenteTramo, Tesoreria } from './tesorero';
import type { Cita } from './openarg';

export type Perfil = 'conservador' | 'moderado' | 'agresivo';
export type Horizonte = 'menos_30' | '30_90' | '3_12' | 'mas_12';
export type Clase = { nombre: string; liquidez: string; riesgo: 'bajo' | 'medio' | 'alto'; tna: number | null; nota: string };
export type TramoInforme = {
  tramo: ExcedenteTramo; horizonte: Horizonte; horizonteTexto: string;
  clases: Clase[]; noEntran: string[];
  rendimiento: { tna: number; pesos: number; realPesos: number; referencia: string } | null;
  riesgoPrincipal: string;
};
export type Informe = {
  perfil: { tolerancia: Perfil; capacidad: Perfil; final: Perfil; explica: string };
  enUnaLinea: string;
  prioridades: string[];
  tramos: TramoInforme[];
  puedeSalirMal: string[];
  glosario: { t: string; d: string }[];
  aviso: string;
};
export type Tasas = Tesoreria['tasas'];
export type LecturaMercado = { cita: Cita; lectura: string; tono: 'pos' | 'neg' | 'neutro' };

export const AVISO_RESEARCHER = 'Esto es información educativa, no una recomendación personalizada. Las inversiones tienen riesgo y los rendimientos pasados no garantizan los futuros.';
const ORDEN: Perfil[] = ['conservador', 'moderado', 'agresivo'];
const minPerfil = (a: Perfil, b: Perfil) => ORDEN[Math.min(ORDEN.indexOf(a), ORDEN.indexOf(b))];
const DIAS_MES = 30.4;
const millones = (n: number) => `$${(Math.abs(n) / 1e6).toFixed(1).replace('.', ',')} M`;
const dm = (s: string) => `${+s.slice(8, 10)}/${+s.slice(5, 7)}`;
const dec = (x: number, d = 1) => x.toFixed(d).replace('.', ',');

/** Capacidad de riesgo que habilita la caja (sección 4.4): con score D/E o flujo inestable, como máximo conservador.
 *  El Tesorero es más estricto con C (luz amarilla): también lo deja en conservador. */
export function capacidad(score: Categoria5, estabilidad: Estabilidad): Perfil {
  if (score === 'C' || score === 'D' || score === 'E' || estabilidad === 'baja') return 'conservador';
  if (score === 'B' || estabilidad === 'media') return 'moderado';
  return 'agresivo';
}

export function horizonteDe(dias: number): Horizonte {
  return dias < 30 ? 'menos_30' : dias < 90 ? '30_90' : dias <= 365 ? '3_12' : 'mas_12';
}
const TEXTO_H: Record<Horizonte, string> = { menos_30: 'Menos de 30 días', '30_90': '30 a 90 días', '3_12': '3 a 12 meses', mas_12: 'Más de 12 meses' };

// Categorías por tramo (sección 4.3 y matriz 4.5). La TNA solo se informa donde hay un dato real cargado (plazo fijo BCRA).
function clasesPara(h: Horizonte, perfil: Perfil, tnaPF: number): { clases: Clase[]; noEntran: string[] } {
  const fciMM: Clase = { nombre: 'Fondo money market (FCI)', liquidez: 'Inmediata', riesgo: 'bajo', tna: null, nota: 'Rescatás cuando quieras. Rinde algo menos que un plazo fijo; la tasa cambia todos los días.' };
  const caucion: Clase = { nombre: 'Caución colocadora', liquidez: '1 a 30 días', riesgo: 'bajo', tna: null, nota: 'Le prestás a otro inversor con garantía del mercado, por días. Se opera por una ALyC.' };
  const remunerada: Clase = { nombre: 'Cuenta remunerada', liquidez: 'Inmediata', riesgo: 'bajo', tna: null, nota: 'La plata queda en la cuenta y paga interés diario. Revisá el tope y la tasa.' };
  const pf: Clase = { nombre: 'Plazo fijo', liquidez: 'Al vencimiento', riesgo: 'bajo', tna: tnaPF, nota: 'Tasa conocida de antemano. Mínimo 30 días: elegí un vencimiento anterior al pago.' };
  const letra: Clase = { nombre: 'Letras del Tesoro a tasa fija', liquidez: '24 h (vendiendo)', riesgo: 'bajo', tna: null, nota: 'Elegí una que venza antes de la fecha del pago, así cobrás el valor completo.' };
  const fciRF: Clase = { nombre: 'FCI de renta fija corto plazo', liquidez: '24 a 48 h', riesgo: 'medio', tna: null, nota: 'Cartera de bonos y letras cortas. El valor de la cuotaparte puede bajar algunos días.' };
  const cer: Clase = { nombre: 'Bonos CER cortos', liquidez: '24 h (vendiendo)', riesgo: 'medio', tna: null, nota: 'Ajustan por inflación: protegen el poder de compra si la inflación sube.' };
  const soberanoPesos: Clase = { nombre: 'Bonos soberanos cortos en pesos', liquidez: '24 h (vendiendo)', riesgo: 'medio', tna: null, nota: 'Más rendimiento posible, pero el precio se mueve: si vendés antes de que venza, podés perder.' };

  if (h === 'menos_30') return { clases: [fciMM, caucion, remunerada], noEntran: ['Plazo fijo (mínimo 30 días)', 'Bonos y acciones (riesgo de precio)'] };
  if (h === '30_90') return { clases: [pf, letra, fciRF, fciMM], noEntran: ['Bonos largos y acciones (riesgo de precio para un plazo tan corto)'] };
  const base = [pf, letra, cer, fciRF];
  if (perfil === 'conservador') return { clases: base, noEntran: ['Acciones y CEDEARs', 'Bonos largos', 'Obligaciones negociables de alto rendimiento'] };
  if (perfil === 'moderado') return { clases: [...base, soberanoPesos], noEntran: ['Acciones (la plata vuelve a necesitarse antes de 12 meses)', 'ON en dólares (el pago futuro es en pesos)'] };
  return { clases: [...base, soberanoPesos], noEntran: ['Acciones y CEDEARs (solo con excedente a más de 12 meses)', 'Concentrar todo en un solo instrumento'] };
}

const RIESGO: Record<Horizonte, string> = {
  menos_30: 'Que la tasa baje: rinde poco, pero no perdés valor nominal.',
  '30_90': 'Inmovilizar la plata: si vence después del pago, no la tenés a tiempo.',
  '3_12': 'Precio: si tenés que vender antes del vencimiento, podés perder.',
  mas_12: 'Volatilidad: puede haber caídas fuertes en el camino.',
};

export function investigar(b: BloqueResearcher, tasas: Tasas, tolerancia: Perfil = 'moderado'): Informe {
  const cap = capacidad(b.score.categoria, b.estabilidad_flujo);
  const final = minPerfil(tolerancia, cap);
  const explica = final === tolerancia ? `Tu perfil es ${final}: tu caja lo banca.`
    : `Te animás a ${tolerancia}, pero tu caja todavía no lo banca (score ${b.score.categoria}, flujo ${b.estabilidad_flujo === 'alta' ? 'estable' : b.estabilidad_flujo === 'media' ? 'algo variable' : 'inestable'}). Usamos ${final}.`;

  const tnaPF = tasas.tnaPlazoFijo;
  const tramos: TramoInforme[] = b.excedentes.map(t => {
    const h = horizonteDe(t.dias_horizonte);
    const { clases, noEntran } = clasesPara(h, final, tnaPF);
    // Rendimiento de referencia: plazo fijo (dato BCRA). Para menos de 30 días, el plazo fijo no entra y se usa solo como
    // techo aproximado de lo que puede dar un money market.
    const bruto = t.monto * tnaPF / 100 * t.dias_horizonte / 365;
    const inflacion = t.monto * (Math.pow(1 + tasas.ipcMensual, t.dias_horizonte / DIAS_MES) - 1);
    const rendimiento = { tna: tnaPF, pesos: Math.round(bruto), realPesos: Math.round(bruto - inflacion),
      referencia: h === 'menos_30' ? 'techo aproximado: tasa de plazo fijo' : 'tasa de plazo fijo 30-59 días' };
    return { tramo: t, horizonte: h, horizonteTexto: TEXTO_H[h], clases, noEntran, rendimiento, riesgoPrincipal: RIESGO[h] };
  });


  const partes = tramos.map(x => `${millones(x.tramo.monto)} en categorías de ${x.horizonte === 'menos_30' ? 'rescate inmediato' : x.horizonte === '30_90' ? 'plazo fijo o letras' : 'renta fija corta en pesos'} hasta el ${dm(x.tramo.se_necesita_el)}`);
  const enUnaLinea = `Una forma de ordenarlo: ${millones(b.reserva_operativa.monto)} de reserva quieta y, por plazos, ${partes.join('; ')}. Es información educativa: la decisión es tuya.`;

  const prioridades = [
    `1. Reserva intacta: ${millones(b.reserva_operativa.monto)} no se invierten en nada con riesgo de precio.`,
    b.deuda_cara_vigente.length ? `2. Cancelá primero la deuda cara (${b.deuda_cara_vigente.map(d => d.tipo).join(', ')}): ganar menos de lo que pagás de interés es perder.`
      : '2. Deuda cara: no vemos préstamos ni descubiertos en tus datos. Si tenés alguno, cargalo: cancelarlo puede rendir más que cualquier inversión.',
    '3. Invertir según cuándo vas a necesitar cada parte (regla de oro: nunca a más plazo que la fecha del pago, y en la misma moneda del pago).',
  ];

  const puedeSalirMal = [
    'Que la caja real se aparte de la proyección (un cliente que paga tarde). Por eso cada tramo vence antes de su pago y la reserva no se toca.',
    'Que la inflación suba: el plazo fijo y las letras a tasa fija pierden poder de compra.',
    ...(tramos.some(x => x.horizonte === '3_12') ? ['En bonos, que tengas que vender antes del vencimiento a un precio más bajo.'] : []),
    'La proyección llega a 120 días: más allá no sabemos qué necesita la caja, así que no hay renta variable en este análisis.',
  ];

  const glosario = [
    { t: 'Reserva', d: 'Un mes de gastos fijos que no se invierte: es tu seguro.' },
    { t: 'FCI money market', d: 'Fondo que invierte en lo más corto y seguro; sacás la plata en el día.' },
    { t: 'Caución', d: 'Préstamo de días entre inversores, garantizado por el mercado.' },
    { t: 'TNA', d: 'Tasa nominal anual: $100 al 30% TNA por 30 días rinden unos $2,5.' },
    { t: 'CER', d: 'Índice que sigue a la inflación; un bono CER ajusta su capital por ese índice.' },
    { t: 'Duration', d: 'Cuánto se mueve el precio de un bono si cambian las tasas.' },
  ];

  return { perfil: { tolerancia, capacidad: cap, final, explica }, enUnaLinea, prioridades, tramos, puedeSalirMal, glosario, aviso: AVISO_RESEARCHER };
}

/** Lectura del mercado argentino (secciones 1 y 4.6 del skill): cada dato oficial con fuente y fecha, y qué significa para la
 *  plata de una pyme. Se muestra siempre, haya o no luz verde: las tasas activas importan también para cubrir un hueco. */
export function analizarMercado(m: Tasas): LecturaMercado[] {
  const pfMes = m.tnaPlazoFijo / 1200, ipc = m.ipcMensual;
  const brecha = (pfMes - ipc) * 100;
  const out: LecturaMercado[] = [
    { cita: m.citas.ipc, tono: 'neutro',
      lectura: `$1 M que dejás quieto pierde unos $${Math.round(ipc * 1e6).toLocaleString('es-AR')} de poder de compra por mes. Tener plata parada también cuesta.` },
    { cita: m.citas.plazoFijo, tono: brecha >= 0 ? 'pos' : 'neg',
      lectura: `Paga ${dec(pfMes * 100, 2)}% por mes: ${brecha >= 0 ? `le gana a la inflación por ${dec(brecha, 2)} puntos` : `pierde contra la inflación por ${dec(-brecha, 2)} puntos`}. Su inflación de equilibrio es ${dec(pfMes * 100, 2)}% mensual: con más inflación que eso, conviene lo que ajusta por CER.` },
    { cita: m.citas.pfReal, tono: m.pfRealSemestre >= 0 ? 'pos' : 'neg',
      lectura: m.pfRealSemestre >= 0 ? 'En el último semestre el plazo fijo le ganó a la inflación.'
        : `Quien renovó plazos fijos el último semestre perdió ${dec(-m.pfRealSemestre * 100)}% de poder de compra. Para más de 3 meses, mirá instrumentos CER.` },
    { cita: m.citas.adelantos, tono: 'neg',
      lectura: `Es lo que cuesta cubrir un hueco con descubierto. Endeudarte al ${dec(m.tnaAdelantos)}% para colocar al ${dec(m.tnaPlazoFijo)}% es perder ${dec(m.tnaAdelantos - m.tnaPlazoFijo)} puntos: si tenés deuda así, cancelarla es la mejor inversión.` },
    { cita: m.citas.documentos, tono: 'neutro',
      lectura: `Descontar facturas o cheques sale ${dec(m.tnaAdelantos - m.tnaDocumentos)} puntos menos que el descubierto. Si te falta plata, conviene anticipar cobros antes que girar en descubierto.` },
    { cita: m.citas.irregularidad, tono: m.irregularidad > m.irregularidadAntes ? 'neg' : 'pos',
      lectura: m.irregularidad > m.irregularidadAntes ? 'Hay más deudores atrasados: los bancos prestan con más cuidado. Llegar con la caja ordenada y comprobable te da ventaja.'
        : 'Bajó la morosidad: los bancos tienen más margen para prestar.' },
  ];
  return out;
}
