// Formato es-AR para el módulo (separador de miles con punto y coma decimal). Puro: sirve en cliente y servidor.
import type { Nivel } from './calculo';

const nf = (min: number, max: number) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: min, maximumFractionDigits: max });
const N0 = nf(0, 0), N1 = nf(1, 1), N2 = nf(2, 2);
export const SIN_DATO = '—';

export const numero = (x: number | null | undefined, dec = 2) =>
  x === null || x === undefined || !Number.isFinite(x) ? SIN_DATO : (dec === 0 ? N0 : dec === 1 ? N1 : N2).format(x);
/** 0.1922 → "19,2 %" (sin signo). */
export const pct = (x: number | null | undefined, dec = 1) => (x === null || x === undefined || !Number.isFinite(x) ? SIN_DATO : `${numero(x * 100, dec).replace('-', '−')} %`);
/** 0.1922 → "+19,2 %"; −0.06 → "−6,0 %". */
export const pctSigno = (x: number | null | undefined, dec = 1) => {
  if (x === null || x === undefined || !Number.isFinite(x)) return SIN_DATO;
  const v = Math.abs(x * 100) < 0.05 ? 0 : x;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${numero(Math.abs(v * 100), dec)} %`;
};
export const pesos = (x: number | null | undefined, dec = 2) =>
  x === null || x === undefined || !Number.isFinite(x) ? SIN_DATO : `${x < 0 ? '−' : ''}$ ${numero(Math.abs(x), dec)}`;
/** Millones de ARS: 1356973.8 → "$ 1,36 billones" / "$ 210.794 M". */
export const millones = (mm: number | null | undefined) => {
  if (mm === null || mm === undefined || !Number.isFinite(mm)) return SIN_DATO;
  const s = mm < 0 ? '−' : '', a = Math.abs(mm);
  return a >= 1_000_000 ? `${s}$ ${numero(a / 1_000_000, 2)} billones` : `${s}$ ${numero(a, 0)} M`;
};
export const veces = (x: number | null | undefined, dec = 1) => (x === null || x === undefined || !Number.isFinite(x) ? SIN_DATO : `${numero(x, dec)}×`);

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** "2026-10-30" → "30 oct 2026". */
export const fecha = (iso: string) => { const [a, m, d] = iso.split('-').map(Number); return `${d} ${MESES[m - 1]} ${a}`; };
export const fechaCorta = (iso: string) => { const [a, m] = iso.split('-').map(Number); return `${MESES[m - 1]} ${String(a).slice(2)}`; };
export const fechaLarga = (iso: string) => { const [a, m, d] = iso.split('-').map(Number); return `${d} de ${MESES_LARGO[m - 1]} de ${a}`; };

export const NIVEL_TEXTO: Record<Nivel, string> = { alto: 'Puntaje alto', medio: 'Puntaje medio', bajo: 'Puntaje bajo' };
export const ACLARACION_PUNTAJE = 'según el puntaje ficticio de esta práctica';

export const horizonteTexto = (meses: number) => (meses > 24 ? 'más de 24 meses' : `${meses} ${meses === 1 ? 'mes' : 'meses'}`);
