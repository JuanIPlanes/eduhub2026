'use client';
// Shell de la app: barra lateral en escritorio, cabecera compacta + pestañas abajo en el teléfono.
// "+ Cargar" siempre a mano (botón en la barra lateral, flotante en el teléfono), aviso de demo, progreso y toasts.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import Avisos from '../../components/chat/Avisos';
import HojaCarga from './Cargar';
import Recorrido from './recorrido';
import { nombreFuente, useDatos } from './datos';
import { Icono, type NombreIcono } from './iconos';
import s from '../app.module.css';

export const SECCIONES: readonly { href: string; label: string; titulo: string; icono: NombreIcono }[] = [
  { href: '/', label: 'Inicio', titulo: 'Inicio', icono: 'hoy' },
  { href: '/proyeccion', label: 'Semanas', titulo: 'Cómo va a estar tu plata', icono: 'proy' },
  { href: '/excedente', label: 'Lo que sobra', titulo: 'Lo que te sobra', icono: 'exc' },
  { href: '/datos', label: 'Datos', titulo: 'Tus datos', icono: 'datos' },
];

type Tema = 'auto' | 'light' | 'dark';
function useTema(): [Tema, () => void] {
  const [tema, setTema] = useState<Tema>('auto');
  useEffect(() => {
    try { const t = localStorage.getItem('cfo-tema'); if (t === 'light' || t === 'dark') setTema(t); } catch { /* sin storage */ }
  }, []);
  const ciclar = () => setTema(t => {
    const n: Tema = t === 'auto' ? 'dark' : t === 'dark' ? 'light' : 'auto';
    const html = document.documentElement;
    if (n === 'auto') delete html.dataset.theme; else html.dataset.theme = n;
    try { if (n === 'auto') localStorage.removeItem('cfo-tema'); else localStorage.setItem('cfo-tema', n); } catch { /* sin storage */ }
    return n;
  });
  return [tema, ciclar];
}

function BotonTema() {
  const [tema, ciclar] = useTema();
  const nombre = tema === 'auto' ? 'automático' : tema === 'dark' ? 'oscuro' : 'claro';
  return (
    <button type="button" className={s.iconBtn} onClick={ciclar} aria-label={`Tema ${nombre}. Cambiar tema`} title={`Tema: ${nombre}`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden>
        {tema === 'dark' ? <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
          : tema === 'light' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>
            : <><circle cx="12" cy="12" r="8" /><path d="M12 4v16a8 8 0 0 0 0-16z" fill="currentColor" /></>}
      </svg>
    </button>
  );
}

/** Progreso honesto: qué se está mandando y cuánto lleva. */
function Progreso() {
  const { calculando } = useDatos();
  const [, tic] = useState(0);
  useEffect(() => {
    if (!calculando) return;
    const id = setInterval(() => tic(x => x + 1), 1000);
    return () => clearInterval(id);
  }, [calculando]);
  if (!calculando) return null;
  const seg = Math.floor((Date.now() - calculando.desde) / 1000);
  const fuentes = calculando.fuentes.join(', ');
  return (
    <div className={s.progreso}>
      <span className={s.progresoBarra} aria-hidden />
      <span className={s.progresoTxt}>
        <span role="status">{seg < 8 ? `Recalculando tu caja con ${fuentes}…` : 'Sigue trabajando. Mercado Pago o archivos grandes pueden tardar un poco más.'}</span>
        {seg >= 2 && <span aria-hidden>{seg} s</span>}
      </span>
    </div>
  );
}

function Toast() {
  const { toast, cerrarToast } = useDatos();
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(cerrarToast, toast.deshacer ? 7000 : 4500);
    return () => clearTimeout(id);
  }, [toast, cerrarToast]);
  return (
    <div className={s.toastZona} role="status" aria-live="polite">
      {toast && (
        <div className={`${s.toast} ${toast.tono === 'error' ? s.toastErr : ''}`} key={toast.id}>
          <Icono n={toast.tono === 'error' ? 'alerta' : 'ok'} size={20} />
          <span>{toast.texto}</span>
          {toast.deshacer && <button type="button" className={s.toastBtn} onClick={() => { toast.deshacer!(); cerrarToast(); }}>Deshacer</button>}
          <button type="button" className={s.toastX} onClick={cerrarToast} aria-label="Cerrar aviso"><Icono n="cerrar" size={18} /></button>
        </div>
      )}
    </div>
  );
}

function BannerDemo() {
  const { ws, empezarPropio, cargarDemo } = useDatos();
  if (ws.modo !== 'demo') return null;
  return (
    <div className={s.bannerDemo} role="note">
      <span><b>Estás viendo datos de demo</b> <span className={s.bannerExtra}>de un negocio inventado.</span></span>
      <div className={s.btnRow}>
        {!ws.demo?.escenario && !ws.demo?.mp && <button type="button" className={s.btnChico} onClick={() => cargarDemo({ escenario: 'holgada' })}>Caso con sobrante</button>}
        {ws.demo?.escenario && <button type="button" className={s.btnChico} onClick={() => cargarDemo()}>Caso con hueco</button>}
        <button type="button" className={`${s.btnChico} ${s.btnChicoPri}`} onClick={empezarPropio}>Empezar con los míos</button>
      </div>
    </div>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const ruta = usePathname();
  const { vista, ws, calculando, abrirCarga } = useDatos();
  const actual = SECCIONES.find(x => x.href === ruta) ?? (ruta === '/sello' ? { titulo: 'Sello verificable' } : SECCIONES[0]);

  // Registra el service worker para que la app sea instalable y reciba avisos.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  const subtitulo = calculando ? 'Recalculando…' : vista ? `${vista.pyme}${vista.ficticia ? ' · demo' : ''}` : ws.modo === 'vacio' ? 'Empezá cargando tus datos' : 'Tus datos';

  return (
    <div className={s.app}>
      <a href="#contenido" className={s.saltar}>Saltar al contenido</a>
      <div className={s.shell}>
        <aside className={s.sidebar} aria-label="Navegación principal">
          <div className={s.marca}>
            <span className={s.logo} aria-hidden>CB</span>
            <div><strong>CFO de Bolsillo</strong><small>Tu plata, las próximas semanas</small></div>
          </div>
          <button type="button" data-tour="cargar" className={`${s.btn} ${s.btnPri} ${s.btnBloque} ${s.btnCargar}`} onClick={() => abrirCarga()}>
            <Icono n="mas" size={20} />Cargar datos
          </button>
          <nav className={s.nav} aria-label="Secciones">
            {SECCIONES.map(x => (
              <Link key={x.href} href={x.href} data-tour={`nav-${x.href}`} className={s.navItem} aria-current={x.href === ruta ? 'page' : undefined}>
                <Icono n={x.icono} size={20} />{x.label}
              </Link>
            ))}
          </nav>
          <div className={s.sideFoot}>
            <div className={s.fuentePill}>
              <span>Calculando con</span>
              <b>{nombreFuente(ws)}</b>
            </div>
            <Link href="/demo">Demo del canal WhatsApp →</Link>
          </div>
        </aside>

        <div className={s.columna}>
          <header className={s.top}>
            <div className={s.topFila}>
              <span className={s.logo} aria-hidden>CB</span>
              <div className={s.topTexto}>
                <strong>{actual.titulo}</strong>
                <small>{subtitulo}</small>
              </div>
              <div className={`${s.topAcc} ${s.avisosAqui}`}>
                {vista?.alertas && <Avisos alertas={vista.alertas} />}
                <BotonTema />
              </div>
            </div>
            <Progreso />
          </header>
          <BannerDemo />
          <main id="contenido" className={s.main} tabIndex={-1}>{children}</main>
        </div>
      </div>

      <button type="button" data-tour="cargar" className={s.fab} onClick={() => abrirCarga()} aria-label="Cargar datos">
        <Icono n="mas" size={22} /><span>Cargar</span>
      </button>

      <nav className={s.tabbar} aria-label="Secciones">
        {SECCIONES.map(x => (
          <Link key={x.href} href={x.href} data-tour={`nav-${x.href}`} className={s.tab} aria-current={x.href === ruta ? 'page' : undefined}>
            <Icono n={x.icono} size={22} /><span>{x.label}</span>
          </Link>
        ))}
      </nav>
      <Toast />
      <HojaCarga />
      <Recorrido />
    </div>
  );
}
