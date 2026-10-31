// Formato es-AR y tipos de las respuestas que consume la app. Solo tipos de lib/ (nada de código de servidor).
import type { Pronostico, Evento } from '@/lib/forecast';
import type { Recomendacion } from '@/lib/advice';
import type { Cita } from '@/lib/openarg';
import type { Alertas } from '@/lib/alertas';
import type { Categoria } from '@/lib/categorias';
import type { Excedente } from '@/lib/excedente';
import type { Tesoreria } from '@/lib/tesorero';

export type { Pronostico, Evento, Recomendacion, Cita, Alertas, Categoria, Excedente, Tesoreria };

export type Insumo = { nombre: string; sha256: string };
export type MesCat = { mes: string; real: boolean; dias: number; diasMes: number; porCategoria: Partial<Record<Categoria, number>> };

// POST /api/dashboard
export type RespDashboard = {
  pyme: string; demo: boolean; corte: string;
  resumen: { movimientos: number; recibidos: number; emitidos: number; ignorados: string[]; insumos: Insumo[] };
  pronostico: Pronostico; recomendacion: Recomendacion; citas: Record<string, Cita>;
  mensual: MesCat[]; ventasMensuales: number;
  excedente?: Excedente;
};
// POST /api/analizar (contrato nuevo: combina fuentes y trae `dashboard` y `resumen.avisos`; ambos opcionales para
// tolerar el servidor viejo).
export type RespAnalizar = {
  resumen: {
    movimientos: number; recibidos: number; emitidos: number; boletas: number; empleados: number; ignorados: string[]; insumos: Insumo[];
    mercadopago?: 'api' | 'simulacion' | 'mixto'; extras?: number; avisos?: string[];
    saldo?: SaldoInfo;
    /** Solo con `perfil` en el pedido: la pyme de ejemplo y la trampa a propósito (el saldo llega sin confirmar). */
    perfil?: PerfilResumen;
  };
  pronostico: Pronostico; alertas: Alertas; recomendacion: Recomendacion;
  mensaje?: { texto: string; fuente: 'ia' | 'reglas' }; citas: Record<string, Cita>;
  excedente?: Excedente;
  dashboard?: { pyme?: string; demo?: boolean; corte?: string; mensual?: MesCat[]; etiquetas?: Record<string, string>; ventasMensuales?: number; eventos?: Evento[] };
  // Campos del contrato v2 ("CFO de bolsillo"). Todos opcionales: un servidor viejo no los manda.
  escenarios?: Partial<Record<NombreEscenario, Escenario>>;
  minimoSeguridad?: number;
  score?: Score;
  alertaAnticipada?: unknown;
  /** Tesorero: veredicto con semáforo, plan de acción y bloque para el Researcher. Ausente en un servidor viejo. */
  tesoreria?: Tesoreria;
};
export type PerfilResumen = { id: string; nombre: string; rubro?: string; pista?: string; saldoSugerido: number };
/** Una de las pymes simuladas de /demo/perfiles/index.json. */
export type PerfilEjemplo = { id: string; nombre: string; rubro: string; empleados: number; descripcion: string; saldoActual: number; situacion: string; pista: string };

/* ---------- contrato v2 (todo opcional) ---------- */
export type OrigenSaldo = 'extracto' | 'manual' | 'mp-api' | 'mp-estimado' | 'demo';
export type SaldoInfo = { valor: number; origen: OrigenSaldo | string; confirmado: boolean; nota?: string };
/** Factor de ventas (0.3–1.5) y días de demora en los cobros (0–60). */
export type Supuestos = { ventas?: number; demoraCobros?: number };
export type NombreEscenario = 'base' | 'pesimista' | 'optimista';
export type Escenario = {
  serie: { fecha: string; saldo: number }[]; minimo: number; fechaMinimo: string;
  hueco: { inicio: string; dias: number; minimo: number } | null;
};
export type Pilar = { nombre: string; peso: number; valor: number | null; detalle?: string };
export type Faltante = string | { texto?: string; label?: string; carga?: string };
export type Score = {
  valor: number; rango?: [number, number]; categoria: 'A' | 'B' | 'C' | 'D' | 'E' | string; preliminar?: boolean;
  pilares?: Pilar[]; faltan?: Faltante[];
};
export type OrdenPago = { concepto: string; monto: number; prioridad: number; plazoEstirable?: number | boolean | string; fecha?: string; grupo?: string; costoProbable?: string };
/** Opción para cubrir un hueco, con los campos nuevos de costo real. */
export type OpcionV2 = Recomendacion['opciones'][number] & { tea?: number; costoPeriodo?: number; estimado?: boolean };

/** TEA como porcentaje: el servidor puede mandarla como fracción (0,45) o como porcentaje (45). */
export const teaPct = (t: number) => (Math.abs(t) < 10 ? t * 100 : t);
/** Comprobante con la forma de /api/foto (y de `extras` en /api/analizar). */
export type ComprobanteIn = {
  es_comprobante?: boolean; tipo?: string | null; fecha_emision?: string | null; fecha_vencimiento?: string | null;
  cuit_emisor?: string | null; razon_social_emisor?: string | null; numero?: string | null; total?: number | null;
};
export type Sello = { hash: string; modo: 'testnet' | 'simulado' | string; url?: string; tx?: string; fecha?: string; motivo: string; destino: string };

/* ---------- números ---------- */
const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** "$ 1.234.567" con signo menos tipográfico. */
export const pesos = (n: number) => `${n < 0 ? '−' : ''}$ ${nf0.format(Math.abs(Math.round(n)))}`;
/** "$ 1,2 M" para millones; debajo de un millón, monto completo. */
export const millones = (n: number) => Math.abs(n) < 1e6 ? pesos(n) : `${n < 0 ? '−' : ''}$ ${nf1.format(Math.abs(n) / 1e6)} M`;
/** Eje de gráficos: "$1,2 M", "$800 k", "$0". */
export const ejeM = (n: number) => {
  if (n === 0) return '$0';
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e6) return `${s}$${nf1.format(a / 1e6).replace(/,0$/, '')} M`;
  return `${s}$${nf0.format(a / 1e3)} k`;
};
export const pct = (n: number, d = 1) => `${n.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`;

/* ---------- fechas (ISO "2026-10-31") ---------- */
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const DIAS_L = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dt = (f: string) => new Date(f.slice(0, 10) + 'T00:00:00Z');
export const fCorta = (f: string) => `${DIAS[dt(f).getUTCDay()]} ${+f.slice(8, 10)}/${+f.slice(5, 7)}`;
export const fLarga = (f: string) => `${DIAS_L[dt(f).getUTCDay()]} ${+f.slice(8, 10)} de ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][+f.slice(5, 7) - 1]}`;
export const fNum = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
export const fDia = (f: string) => `${+f.slice(8, 10)} ${MESES[+f.slice(5, 7) - 1]}`;
export const sumarDias = (f: string, n: number) => new Date(dt(f).getTime() + n * 86400000).toISOString().slice(0, 10);
export const difDias = (a: string, b: string) => Math.round((dt(b).getTime() - dt(a).getTime()) / 86400000);
export const enDias = (n: number) => (n <= 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`);
export const plural = (n: number, s: string, p = s + 's') => `${n} ${n === 1 ? s : p}`;
/** Fecha de hoy en la zona del navegador, "yyyy-mm-dd". */
export const hoyLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
/** Lee un monto escrito a la argentina ("1.234.567,50", "$ 250000", "250000.5"). null si no es un número. */
export function leerMonto(t: string): number | null {
  let s = t.replace(/[$\s]/g, '').replace(/^\+/, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
export const kb = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1).replace('.', ',')} MB`);

export const ETQ_CAT: Record<string, string> = {
  ventas: 'Ventas', cobro_clientes: 'Cobros a clientes', sueldos: 'Sueldos', aguinaldo: 'Aguinaldo', cargas_sociales: 'Cargas sociales',
  impuestos: 'Impuestos', alquiler: 'Alquiler', servicios: 'Servicios', proveedores: 'Proveedores', retiros: 'Retiros de socios',
  bancarios: 'Gastos bancarios', otros: 'Otros',
};
export const ETQ_ORIGEN: Record<string, string> = {
  'factura pendiente': 'Factura pendiente', 'factura estimada': 'Estimada', recurrente: 'Recurrente', 'proyección de ventas': 'Estimada',
  'calendario legal': 'Calendario legal', 'descuento de factura': 'Factura descontada', 'boleta cargada': 'Boleta', 'boleta vencida': 'Boleta vencida',
  'nómina cargada': 'Nómina',
};
