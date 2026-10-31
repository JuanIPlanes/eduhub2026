'use client';
// Recorrido guiado: después de "Ver demo en 1 clic" recorre solo la app (resalta cada zona, cambia de sección y prueba
// "¿Y si cobro menos?") para que el usuario aprenda los pasos. Avanza solo, pero se puede pausar, retroceder o saltar.
// Cuando lo termina o lo cierra queda marcado como visto y la bienvenida deja de ofrecer la demo en 1 clic.
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useDatos } from './datos';
import s from '../app.module.css';

const CLAVE = 'cfo-tour-visto';
const EV_INICIAR = 'cfo-tour-iniciar';
const EV_ESTADO = 'cfo-tour-estado';

const leerVisto = () => { try { return localStorage.getItem(CLAVE) === '1'; } catch { return false; } };
function marcarVisto(v: boolean) {
  try { if (v) localStorage.setItem(CLAVE, '1'); else localStorage.removeItem(CLAVE); } catch { /* sin storage */ }
  window.dispatchEvent(new Event(EV_ESTADO));
}

/** ¿El usuario ya vio el recorrido? (false hasta leer el storage, para no mostrar y esconder la demo de golpe). */
export function useTourVisto(): boolean | null {
  return useSyncExternalStore(
    cb => { window.addEventListener(EV_ESTADO, cb); window.addEventListener('storage', cb); return () => { window.removeEventListener(EV_ESTADO, cb); window.removeEventListener('storage', cb); }; },
    () => leerVisto(),
    () => null,
  );
}

export const iniciarTour = () => window.dispatchEvent(new Event(EV_INICIAR));
export const reiniciarTour = () => marcarVisto(false);

type Paso = {
  ruta: string;
  /** Selector de la zona a resaltar; sin él el paso sale centrado. */
  donde?: string;
  titulo: string;
  texto: string;
  /** Qué hace la app sola durante este paso. */
  accion?: 'cobrar-menos';
  seg?: number;
};

const PASOS: Paso[] = [
  { ruta: '/', donde: '[aria-labelledby="t-saldo"]', titulo: '1 · Tu saldo de hoy', texto: 'Arriba ves cuánta plata tenés y, abajo, si te alcanza para lo que viene. Si el saldo no está confirmado, te lo pedimos: sin él no hay veredicto.' },
  { ruta: '/', donde: '[aria-labelledby="t-venc"]', titulo: '2 · Qué vence y cuándo', texto: 'Los próximos pagos, ordenados por fecha. Cada uno te dice cuánto te queda después de pagarlo. Con "+ Factura" sumás uno nuevo.' },
  { ruta: '/', donde: '[aria-labelledby="t-genera"]', titulo: '3 · Lo que sobra no duerme', texto: 'Si después de cubrir todo y tu piso de seguridad te sobra plata, acá ves cuánto es y qué podría generar mientras no la usás.' },
  { ruta: '/', donde: '[aria-labelledby="t-30"]', titulo: '4 · Tus próximos 30 días', texto: 'El gráfico muestra tu saldo día por día. Pasá el mouse o tocá para ver cada fecha: la parte roja son los días en que te falta plata.' },
  { ruta: '/', donde: '[data-tour="cargar"]', titulo: '5 · Cargá tus datos', texto: 'Este botón está siempre a mano. Conectás Mercado Pago, subís el extracto del banco o cargás un gasto o una factura a mano. Al guardar algo tuyo, salís de la demo.' },
  { ruta: '/', donde: '[data-tour="nav-/proyeccion"]', titulo: '6 · Pasamos a "Semanas"', texto: 'En el menú, "Semanas" muestra cómo va a estar tu plata más adelante. Vamos para allá.', seg: 4 },
  { ruta: '/proyeccion', donde: '[data-tour="quesi"]', titulo: '7 · ¿Y si cobro menos?', texto: 'Probá un mal escenario sin tocar tus datos. Ahora bajamos las ventas 20% y mirá cómo cambia la proyección. Con "Volver a lo normal" lo deshacés.', accion: 'cobrar-menos', seg: 9 },
  { ruta: '/proyeccion', donde: '[data-tour="nav-/excedente"]', titulo: '8 · Pasamos a "Lo que sobra"', texto: 'Esa prueba ya la deshicimos. Ahora vamos a ver cuánta plata podés colocar sin ponerte en riesgo.', seg: 4 },
  { ruta: '/excedente', donde: '[aria-labelledby="t-monto"]', titulo: '9 · Cuánto podés colocar', texto: 'Acá está la cuenta completa: lo que tenés, lo que vas a pagar y tu reserva. Lo que queda arriba es lo que podés mover sin riesgo.' },
  { ruta: '/excedente', donde: '[data-tour="nav-/datos"]', titulo: '10 · Pasamos a "Datos"', texto: 'Por último, "Datos": lo que cargaste, tus avisos de vencimientos y cómo borrar todo.', seg: 4 },
  { ruta: '/datos', titulo: '¡Listo! Ya sabés usarla', texto: 'Los pasos son: confirmar tu saldo, mirar qué vence, probar "¿Y si cobro menos?" y ver cuánto sobra. Cuando quieras, empezá con tus datos.' },
];

const SEG = 8;
const visible = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].find(e => e.getClientRects().length > 0) ?? null;

export default function Recorrido() {
  const { ws, vista, listo, empezarPropio, cargarDemo, ponerSupuestos, abrirCarga } = useDatos();
  const router = useRouter();
  const ruta = usePathname();
  const [paso, setPaso] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [lista, setLista] = useState(false);   // el paso ya encontró su zona (o se rindió)
  const [pausa, setPausa] = useState(false);
  const [encima, setEncima] = useState(false); // el mouse o el foco están sobre la tarjeta
  const [restante, setRestante] = useState(0);
  const sinMovimiento = useRef(false);
  const objetivo = useRef<HTMLElement | null>(null);
  const primeraVez = useRef(true);

  useEffect(() => { sinMovimiento.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches; }, []);

  const cerrar = useCallback((terminado = true) => {
    setPaso(null); setRect(null); setLista(false); // la prueba de "¿y si cobro menos?" se deshace sola al salir del paso
    if (terminado) marcarVisto(true);
  }, []);

  // Arranque: lo pide el botón de la bienvenida.
  useEffect(() => {
    const ir = () => { primeraVez.current = true; setPausa(sinMovimiento.current); setEncima(false); setPaso(0); };
    window.addEventListener(EV_INICIAR, ir);
    return () => window.removeEventListener(EV_INICIAR, ir);
  }, []);

  // Cada paso: ir a su sección, esperar la zona y mostrarla.
  useEffect(() => {
    if (paso === null) return;
    const p = PASOS[paso];
    setLista(false); setRect(null); objetivo.current = null;
    if (ruta !== p.ruta) { router.push(p.ruta); return; }
    if (!p.donde) { setLista(true); return; }
    const sel = p.donde;
    const limite = Date.now() + (primeraVez.current ? 25_000 : 5_000); // la primera vez esperamos el cálculo de la demo
    let vivo = true;
    const buscar = () => {
      if (!vivo) return;
      const el = visible(sel);
      if (el) {
        primeraVez.current = false;
        objetivo.current = el;
        const r = el.getBoundingClientRect();
        window.scrollBy({ top: r.top - 96, behavior: sinMovimiento.current ? 'auto' : 'smooth' });
        setTimeout(() => { if (vivo) { setRect(el.getBoundingClientRect()); setLista(true); } }, sinMovimiento.current ? 0 : 450);
      } else if (Date.now() < limite) setTimeout(buscar, 150);
      else setLista(true); // no existe en esta pyme: el paso sale centrado, sin resaltar
    };
    buscar();
    return () => { vivo = false; };
  }, [paso, ruta, router, vista]);

  // Lo que la app hace sola en el paso.
  useEffect(() => {
    if (paso === null || !lista) return;
    const a = PASOS[paso].accion;
    if (a !== 'cobrar-menos') return;
    const id = setTimeout(() => ponerSupuestos({ ventas: 0.8 }), 1400);
    return () => { clearTimeout(id); ponerSupuestos({}); };
  }, [paso, lista, ponerSupuestos]);

  // Mantiene el marco pegado a la zona (scroll, cambio de tamaño, gráfico que termina de cargar).
  useEffect(() => {
    if (paso === null || !lista) return;
    const seguir = () => { const el = objetivo.current; if (el && el.isConnected) setRect(el.getBoundingClientRect()); };
    const id = setInterval(seguir, 250);
    window.addEventListener('scroll', seguir, { passive: true });
    window.addEventListener('resize', seguir);
    return () => { clearInterval(id); window.removeEventListener('scroll', seguir); window.removeEventListener('resize', seguir); };
  }, [paso, lista]);

  // Avance automático con barra de tiempo.
  const total = paso === null ? SEG : (PASOS[paso].seg ?? SEG) * 1000;
  useEffect(() => { setRestante(total); }, [paso, lista, total]);
  const ultimo = paso === PASOS.length - 1;
  useEffect(() => {
    if (paso === null || !lista || pausa || encima || ultimo) return;
    const id = setInterval(() => setRestante(r => r - 100), 100);
    return () => clearInterval(id);
  }, [paso, lista, pausa, encima, ultimo]);
  useEffect(() => {
    if (restante <= 0 && paso !== null && !ultimo) setPaso(paso + 1);
  }, [restante, paso, ultimo]);

  // Esc cierra.
  useEffect(() => {
    if (paso === null) return;
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [paso, cerrar]);

  if (!listo || paso === null) return null;
  const p = PASOS[paso];
  const sinDemo = ws.modo === 'vacio';
  const marco = rect && lista ? { top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 } : null;
  const esperando = !lista;

  return (
    <div className={s.tour} aria-live="polite">
      {marco ? <div className={s.tourMarco} style={marco} aria-hidden /> : <div className={s.tourVelo} aria-hidden />}
      <div className={s.tourCard} role="dialog" aria-label="Recorrido guiado" onMouseEnter={() => setEncima(true)} onMouseLeave={() => setEncima(false)} onFocus={() => setEncima(true)} onBlur={() => setEncima(false)}>
        <div className={s.tourTope}>
          <span className={s.tourPaso}>Paso {paso + 1} de {PASOS.length}</span>
          <button type="button" className={s.tourX} onClick={() => cerrar()} aria-label="Cerrar el recorrido">×</button>
        </div>
        <strong className={s.tourTitulo}>{esperando ? 'Preparando la demo…' : p.titulo}</strong>
        <p className={s.tourTexto}>{esperando ? 'Estamos armando los números de un negocio inventado. Son unos segundos.' : p.texto}</p>
        {!ultimo && !esperando && !pausa && (
          <div className={s.tourBarra} aria-hidden><span style={{ width: `${Math.max(0, Math.min(100, 100 - (restante / total) * 100))}%` }} /></div>
        )}
        <div className={s.tourBotones}>
          {ultimo ? (
            <>
              <button type="button" className={`${s.btnChico} ${s.btnChicoPri}`} onClick={() => { cerrar(); empezarPropio(); router.push('/'); setTimeout(() => abrirCarga(), 250); }}>Empezar con mis datos</button>
              <button type="button" className={s.btnChico} onClick={() => { setPaso(0); }}>Ver de nuevo</button>
              <button type="button" className={s.btnChico} onClick={() => cerrar()}>Seguir mirando la demo</button>
            </>
          ) : (
            <>
              <button type="button" className={s.btnChico} onClick={() => setPaso(Math.max(0, paso - 1))} disabled={paso === 0}>Atrás</button>
              <button type="button" className={s.btnChico} onClick={() => setPausa(x => !x)} aria-pressed={pausa}>{pausa ? '▶ Seguir' : '⏸ Pausar'}</button>
              <button type="button" className={`${s.btnChico} ${s.btnChicoPri}`} onClick={() => setPaso(paso + 1)}>Siguiente</button>
              <button type="button" className={s.tourSaltar} onClick={() => cerrar()}>Saltar</button>
            </>
          )}
        </div>
        {sinDemo && !esperando && <p className={s.tourNota}>Primero cargá la demo para ver los números.
          {' '}<button type="button" className={s.link} style={{ minHeight: 0 }} onClick={() => cargarDemo()}>Cargar demo</button></p>}
      </div>
    </div>
  );
}
