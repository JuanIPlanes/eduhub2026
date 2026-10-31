'use client';
// Hoja "Cargar": un solo lugar para sumar datos. Saldo, movimiento, factura (foto, CSV o a mano), archivos y Mercado Pago.
// Es un <dialog> modal (foco atrapado, Esc cierra); en el teléfono se ve como hoja desde abajo.
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { hoyLocal, marcarOAuth, mpDisponible, useDatos, type Lado, type VistaCarga } from './datos';
import { kb, leerMonto, pesos, type ComprobanteIn } from './formato';
import { Icono, type NombreIcono } from './iconos';
import s from '../app.module.css';

const TITULOS: Record<VistaCarga, string> = {
  menu: '¿Qué querés cargar?', saldo: 'Saldo de hoy', movimiento: 'Un ingreso o un gasto', factura: 'Factura o boleta',
  archivos: 'Subir archivos', mp: 'Conectar Mercado Pago',
};

export default function HojaCarga() {
  const { carga, cerrarCarga, abrirCarga, ws } = useDatos();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (carga && !d.open) d.showModal();
    else if (!carga && d.open) d.close();
  }, [carga]);

  return (
    <dialog ref={ref} className={s.hoja} aria-labelledby="hoja-titulo" onClose={cerrarCarga}
      onClick={e => { if (e.target === ref.current) cerrarCarga(); }}>
      {carga && (
        <div className={s.hojaIn}>
          <div className={s.hojaCab}>
            {carga !== 'menu'
              ? <button type="button" className={s.iconBtn} onClick={() => abrirCarga('menu')} aria-label="Volver a las opciones"><Icono n="atras" size={22} /></button>
              : <span className={s.agarre} aria-hidden />}
            <h2 id="hoja-titulo" className={s.hojaTitulo}>{carga === 'saldo' && ws.mp ? 'Confirmá tu saldo de Mercado Pago' : TITULOS[carga]}</h2>
            <button type="button" className={s.iconBtn} onClick={cerrarCarga} aria-label="Cerrar"><Icono n="cerrar" size={22} /></button>
          </div>
          {ws.modo === 'demo' && carga !== 'menu' && carga !== 'mp' && (
            <p className={s.notaDemo}>Estás en la demo. Al guardar un dato tuyo salimos de la demo y arrancamos solo con lo tuyo.</p>
          )}
          {ws.modo === 'perfil' && carga !== 'menu' && carga !== 'mp' && carga !== 'saldo' && (
            <p className={s.notaDemo}>Estás viendo una pyme de ejemplo. Al guardar un dato tuyo salimos del ejemplo y arrancamos solo con lo tuyo.</p>
          )}
          <div className={s.hojaCuerpo}>
            {carga === 'menu' && <Menu />}
            {carga === 'saldo' && <FormSaldo />}
            {carga === 'movimiento' && <FormMovimiento />}
            {carga === 'factura' && <FormFactura />}
            {carga === 'archivos' && <FormArchivos />}
            {carga === 'mp' && <ConectarMP />}
          </div>
        </div>
      )}
    </dialog>
  );
}

/* ---------- menú ---------- */
function Menu() {
  const { abrirCarga, ws, mp } = useDatos();
  const items: { v: VistaCarga; i: NombreIcono; t: string; d: string; extra?: ReactNode }[] = [
    { v: 'saldo', i: 'saldo', t: 'Saldo de hoy', d: 'Cuánta plata tenés hoy, sumando banco y Mercado Pago.', extra: ws.saldo ? <span className={`${s.chip} ${s.chipOk}`}>{pesos(ws.saldo.monto)}</span> : ws.mp ? <span className={`${s.chip} ${s.chipWarn}`}>Falta confirmar</span> : null },
    { v: 'factura', i: 'factura', t: 'Factura o boleta', d: 'Lo que tenés que pagar o te tienen que pagar, con su vencimiento. Con foto o a mano.' },
    { v: 'movimiento', i: 'mov', t: 'Un ingreso o un gasto', d: 'Algo que ya cobraste o pagaste.' },
    { v: 'archivos', i: 'archivo', t: 'Archivos CSV', d: 'Extracto del banco, Mis Comprobantes de ARCA, boletas o nómina.' },
    { v: 'mp', i: 'mp', t: 'Mercado Pago', d: 'Conectá tu cuenta y traemos tus cobros y pagos.', extra: ws.mp && mpDisponible(mp) ? <span className={`${s.chip} ${s.chipOk}`}>Conectada</span> : null },
  ];
  return (
    <ul className={s.menuCarga}>
      {items.map(x => (
        <li key={x.v}>
          <button type="button" className={s.accion} onClick={() => abrirCarga(x.v)}>
            <span className={s.accionIco}><Icono n={x.i} size={24} /></span>
            <span className={s.accionTxt}><strong>{x.t}</strong><small>{x.d}</small></span>
            {x.extra}
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------- piezas de formulario ---------- */
function Campo({ id, label, ayuda, error, children }: { id: string; label: string; ayuda?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <div className={s.campo}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <span id={`${id}-err`} className={s.campoErr} role="alert">{error}</span>
        : ayuda ? <span id={`${id}-ayuda`} className={s.campoAyuda}>{ayuda}</span> : null}
    </div>
  );
}
const desc = (id: string, error?: string | null, ayuda?: unknown) => (error ? `${id}-err` : ayuda ? `${id}-ayuda` : undefined);

export function InputMonto({ id, valor, setValor, error, onBlur, conAyuda = false, foco = false }: { id: string; valor: string; setValor: (v: string) => void; error?: string | null; onBlur?: () => void; conAyuda?: boolean; foco?: boolean }) {
  return (
    <div className={s.montoWrap}>
      <span aria-hidden>$</span>
      <input id={id} className={s.input} inputMode="decimal" autoComplete="off" placeholder="0" value={valor} autoFocus={foco}
        onChange={e => setValor(e.target.value)} onBlur={onBlur} aria-invalid={!!error} aria-describedby={desc(id, error, conAyuda)} />
    </div>
  );
}

export function errMonto(t: string, positivo = true) {
  if (!t.trim()) return 'Escribí el monto, por ejemplo 1.250.000';
  const n = leerMonto(t);
  if (n === null) return 'No entendí el número. Usá solo dígitos, puntos y coma: 1.250.000,50';
  if (positivo && n <= 0) return 'El monto tiene que ser mayor a cero.';
  return null;
}

/* ---------- saldo ---------- */
function FormSaldo() {
  const { ws, ponerSaldo, cerrarCarga } = useDatos();
  const id = useId();
  const [monto, setMonto] = useState(ws.saldo ? String(ws.saldo.monto).replace('.', ',') : '');
  const [fecha, setFecha] = useState(hoyLocal()); // actualizar = el saldo de hoy
  const [tocado, setTocado] = useState(false);
  const err = tocado ? errMonto(monto, false) : null;

  function enviar(e: FormEvent) {
    e.preventDefault();
    setTocado(true);
    const n = leerMonto(monto);
    if (errMonto(monto, false) || n === null) { document.getElementById(`${id}m`)?.focus(); return; }
    ponerSaldo(fecha, n);
    cerrarCarga();
  }
  return (
    <form className={s.form} onSubmit={enviar} noValidate>
      {ws.mp ? (
        <div className={s.honesto}>
          <Icono n="mp" size={20} />
          <p><b>Abrí la app de Mercado Pago y mirá cuánto tenés disponible.</b> Mercado Pago no nos deja ver ese número, y sin él no podemos decirte si te alcanza. Si también tenés plata en el banco, sumala.</p>
        </div>
      ) : (
        <p className={s.explica}>El <b>saldo</b> es la plata que tenés disponible hoy. Sumá lo del banco y lo de Mercado Pago. Si estás en descubierto, ponelo con signo menos.</p>
      )}
      {ws.saldo && <p className={s.sub}>La última vez cargaste {pesos(ws.saldo.monto)} al {ws.saldo.fecha.split('-').reverse().join('/')}.</p>}
      <Campo id={`${id}m`} label={ws.mp ? '¿Cuánto tenés disponible hoy?' : '¿Cuánto tenés hoy?'} error={err} ayuda="En pesos.">
        <InputMonto id={`${id}m`} valor={monto} setValor={setMonto} error={err} onBlur={() => setTocado(true)} conAyuda foco />
      </Campo>
      <Campo id={`${id}f`} label="Al día" ayuda="Normalmente, hoy.">
        <input id={`${id}f`} type="date" className={s.input} value={fecha} max={hoyLocal()} onChange={e => setFecha(e.target.value || hoyLocal())} aria-describedby={`${id}f-ayuda`} />
      </Campo>
      <button type="submit" className={`${s.btn} ${s.btnPri} ${s.btnBloque}`}>{ws.mp ? 'Confirmar mi saldo' : 'Guardar saldo'}</button>
    </form>
  );
}

/* ---------- movimiento ---------- */
function FormMovimiento() {
  const { sumarMovimiento, cerrarCarga } = useDatos();
  const id = useId();
  const [tipo, setTipo] = useState<'ingreso' | 'egreso'>('egreso');
  const [fecha, setFecha] = useState(hoyLocal());
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [tocado, setTocado] = useState({ c: false, m: false });
  const errC = tocado.c && !concepto.trim() ? 'Contanos qué fue, por ejemplo "Alquiler del local".' : null;
  const errM = tocado.m ? errMonto(monto) : null;

  function enviar(e: FormEvent) {
    e.preventDefault();
    setTocado({ c: true, m: true });
    const n = leerMonto(monto);
    if (!concepto.trim()) { document.getElementById(`${id}c`)?.focus(); return; }
    if (errMonto(monto) || n === null) { document.getElementById(`${id}m`)?.focus(); return; }
    sumarMovimiento({ fecha, desc: concepto.trim(), monto: tipo === 'ingreso' ? Math.abs(n) : -Math.abs(n) });
    cerrarCarga();
  }
  return (
    <form className={s.form} onSubmit={enviar} noValidate>
      <fieldset className={s.lados}>
        <legend className={s.sr}>Tipo de movimiento</legend>
        <label className={s.lado}><input type="radio" name={`${id}t`} checked={tipo === 'egreso'} onChange={() => setTipo('egreso')} /><span><strong>Salió plata</strong><small>Un pago o un gasto</small></span></label>
        <label className={s.lado}><input type="radio" name={`${id}t`} checked={tipo === 'ingreso'} onChange={() => setTipo('ingreso')} /><span><strong>Entró plata</strong><small>Un cobro o una venta</small></span></label>
      </fieldset>
      <Campo id={`${id}c`} label="Concepto" error={errC}>
        <input id={`${id}c`} className={s.input} value={concepto} onChange={e => setConcepto(e.target.value)} onBlur={() => setTocado(t => ({ ...t, c: true }))}
          placeholder={tipo === 'egreso' ? 'Ej.: Alquiler del local' : 'Ej.: Cobro cliente Pérez'} maxLength={80} aria-invalid={!!errC} aria-describedby={desc(`${id}c`, errC)} autoComplete="off" />
      </Campo>
      <div className={s.fila2}>
        <Campo id={`${id}m`} label="Monto" error={errM}>
          <InputMonto id={`${id}m`} valor={monto} setValor={setMonto} error={errM} onBlur={() => setTocado(t => ({ ...t, m: true }))} />
        </Campo>
        <Campo id={`${id}f`} label="Fecha" ayuda="Ya pasó. Lo que viene, cargalo como factura.">
          <input id={`${id}f`} type="date" className={s.input} value={fecha} max={hoyLocal()} onChange={e => setFecha(e.target.value || hoyLocal())} aria-describedby={`${id}f-ayuda`} />
        </Campo>
      </div>
      <button type="submit" className={`${s.btn} ${s.btnPri} ${s.btnBloque}`}>Guardar {tipo === 'ingreso' ? 'ingreso' : 'gasto'}</button>
    </form>
  );
}

/* ---------- factura ---------- */
type Foto = { estado: 'leyendo'; nombre: string } | { estado: 'ok'; nombre: string } | { estado: 'error'; motivo: string } | null;

function FormFactura() {
  const { sumarFactura, cerrarCarga, abrirCarga } = useDatos();
  const id = useId();
  const [lado, setLado] = useState<Lado>('recibido');
  const [nombre, setNombre] = useState('');
  const [cuit, setCuit] = useState('');
  const [emision, setEmision] = useState(hoyLocal());
  const [venc, setVenc] = useState('');
  const [total, setTotal] = useState('');
  const [saldada, setSaldada] = useState(false);
  const [extra, setExtra] = useState<Pick<ComprobanteIn, 'tipo' | 'numero'>>({});
  const [tocado, setTocado] = useState({ n: false, t: false, v: false });
  const [foto, setFoto] = useState<Foto>(null);
  const img = useRef<HTMLInputElement>(null);
  const paga = lado === 'recibido';

  const errN = tocado.n && !nombre.trim() ? (paga ? '¿A quién le tenés que pagar?' : '¿Quién te tiene que pagar?') : null;
  const errT = tocado.t ? errMonto(total) : null;
  const errV = tocado.v && venc && venc < emision ? 'El vencimiento no puede ser antes de la emisión.' : null;

  async function leerFoto(f: File) {
    setFoto({ estado: 'leyendo', nombre: f.name });
    try {
      const fd = new FormData(); fd.append('foto', f);
      const r = await fetch('/api/foto', { method: 'POST', body: fd });
      if (r.status === 404) { setFoto({ estado: 'error', motivo: 'La lectura de fotos no está disponible en este servidor.' }); return; }
      const d: { ok?: boolean; motivo?: string; comprobante?: ComprobanteIn } | null = await r.json().catch(() => null);
      if (!d?.ok || !d.comprobante) { setFoto({ estado: 'error', motivo: d?.motivo ?? 'No pude leer la foto.' }); return; }
      const c = d.comprobante;
      if (c.razon_social_emisor) setNombre(c.razon_social_emisor);
      if (c.cuit_emisor) setCuit(c.cuit_emisor);
      if (c.fecha_emision) setEmision(c.fecha_emision);
      if (c.fecha_vencimiento) setVenc(c.fecha_vencimiento);
      if (c.total != null) setTotal(String(c.total).replace('.', ','));
      setExtra({ tipo: c.tipo, numero: c.numero });
      setFoto({ estado: 'ok', nombre: f.name });
    } catch { setFoto({ estado: 'error', motivo: 'Se cortó la conexión al subir la foto.' }); }
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    setTocado({ n: true, t: true, v: true });
    const n = leerMonto(total);
    if (!nombre.trim()) { document.getElementById(`${id}n`)?.focus(); return; }
    if (errMonto(total) || n === null) { document.getElementById(`${id}t`)?.focus(); return; }
    if (venc && venc < emision) { document.getElementById(`${id}v`)?.focus(); return; }
    sumarFactura({
      lado, saldada, origen: foto?.estado === 'ok' ? 'foto' : 'manual',
      comprobante: { es_comprobante: true, tipo: extra.tipo || 'Factura', numero: extra.numero ?? '', fecha_emision: emision, fecha_vencimiento: venc || null, cuit_emisor: cuit.replace(/\D/g, '') || null, razon_social_emisor: nombre.trim(), total: Math.abs(n) },
    });
    cerrarCarga();
  }

  return (
    <form className={s.form} onSubmit={enviar} noValidate>
      <fieldset className={s.lados}>
        <legend className={s.sr}>¿Quién paga?</legend>
        <label className={s.lado}><input type="radio" name={`${id}l`} checked={paga} onChange={() => setLado('recibido')} /><span><strong>Tengo que pagarla</strong><small>Proveedor, servicio, impuesto</small></span></label>
        <label className={s.lado}><input type="radio" name={`${id}l`} checked={!paga} onChange={() => setLado('emitido')} /><span><strong>Me la tienen que pagar</strong><small>La hice yo a un cliente</small></span></label>
      </fieldset>

      <div className={s.atajos}>
        <button type="button" className={s.btn} onClick={() => img.current?.click()} disabled={foto?.estado === 'leyendo'}>
          <Icono n="foto" size={20} />{foto?.estado === 'leyendo' ? 'Leyendo la foto…' : 'Sacar o subir foto'}
        </button>
        <button type="button" className={s.btn} onClick={() => abrirCarga('archivos')}><Icono n="archivo" size={20} />CSV de ARCA</button>
        <input ref={img} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) leerFoto(f); }} />
      </div>
      <div role="status" aria-live="polite">
        {foto?.estado === 'leyendo' && <p className={s.progresoTxt}><span className={s.puntito} aria-hidden />Leyendo emisor, fechas y total de {foto.nombre}. Tarda unos segundos.</p>}
        {foto?.estado === 'ok' && <p className={`${s.chip} ${s.chipOk}`}>Leímos la foto. Revisá los datos antes de guardar.</p>}
        {foto?.estado === 'error' && <div className={s.avisoBox}>{foto.motivo} Podés cargarla a mano acá abajo: son 4 datos.</div>}
      </div>

      <Campo id={`${id}n`} label={paga ? 'Proveedor o a quién le pagás' : 'Cliente'} error={errN}>
        <input id={`${id}n`} className={s.input} value={nombre} onChange={e => setNombre(e.target.value)} onBlur={() => setTocado(t => ({ ...t, n: true }))}
          placeholder={paga ? 'Ej.: Distribuidora Norte' : 'Ej.: Hotel Patio Olmos'} maxLength={120} aria-invalid={!!errN} aria-describedby={desc(`${id}n`, errN)} autoComplete="off" />
      </Campo>
      <div className={s.fila2}>
        <Campo id={`${id}t`} label="Total" error={errT}>
          <InputMonto id={`${id}t`} valor={total} setValor={setTotal} error={errT} onBlur={() => setTocado(t => ({ ...t, t: true }))} />
        </Campo>
        <Campo id={`${id}c`} label="CUIT (opcional)" ayuda="Ayuda a aprender cuánto tarda en pagar o cobrar.">
          <input id={`${id}c`} className={s.input} inputMode="numeric" value={cuit} onChange={e => setCuit(e.target.value)} placeholder="30-12345678-9" maxLength={13} aria-describedby={`${id}c-ayuda`} autoComplete="off" />
        </Campo>
      </div>
      <div className={s.fila2}>
        <Campo id={`${id}e`} label="Fecha de emisión">
          <input id={`${id}e`} type="date" className={s.input} value={emision} onChange={e => setEmision(e.target.value || hoyLocal())} />
        </Campo>
        <Campo id={`${id}v`} label="Vence" error={errV} ayuda="El día que hay que pagarla. Si no sabés, dejalo vacío.">
          <input id={`${id}v`} type="date" className={s.input} value={venc} min={emision} onChange={e => setVenc(e.target.value)} onBlur={() => setTocado(t => ({ ...t, v: true }))} aria-invalid={!!errV} aria-describedby={desc(`${id}v`, errV, true)} />
        </Campo>
      </div>
      <label className={s.consent}>
        <input type="checkbox" checked={saldada} onChange={e => setSaldada(e.target.checked)} />
        <span>{paga ? 'Ya la pagué' : 'Ya me la pagaron'}. <span className={s.sub}>Se guarda en tu lista pero no cambia la proyección.</span></span>
      </label>
      <button type="submit" className={`${s.btn} ${s.btnPri} ${s.btnBloque}`}>Guardar factura</button>
    </form>
  );
}

/* ---------- archivos ---------- */
const EJEMPLOS = [
  { href: '/demo/extracto_banco_esquina.csv', t: 'Extracto del banco', d: 'Lo bajás del home banking: fecha, concepto, importe y saldo.' },
  { href: '/demo/mis_comprobantes_recibidos.csv', t: 'Facturas recibidas (ARCA)', d: 'Mis Comprobantes › Recibidos. Lo que te facturan tus proveedores.' },
  { href: '/demo/mis_comprobantes_emitidos.csv', t: 'Facturas emitidas (ARCA)', d: 'Mis Comprobantes › Emitidos. Lo que les facturaste a tus clientes.' },
  { href: '/demo/boletas_vencimientos.csv', t: 'Boletas con vencimiento', d: 'Impuestos, servicios, cuotas: concepto, vencimiento e importe.' },
  { href: '/demo/nomina_octubre.csv', t: 'Nómina', d: 'Sueldos netos, cargas sociales y fechas de pago.' },
];

function FormArchivos() {
  const { sumarArchivos, ws, cerrarCarga } = useDatos();
  const [sobre, setSobre] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function elegir(files: FileList | null) {
    if (!files?.length) return;
    const lista = Array.from(files);
    const malos = lista.filter(f => !/\.(csv|txt)$/i.test(f.name) && f.type !== 'text/csv');
    if (malos.length) { setErr(`${malos.map(f => f.name).join(', ')} no es un CSV. Exportalo como CSV desde tu banco o desde ARCA.`); return; }
    if (lista.some(f => f.size > 5 * 1024 * 1024)) { setErr('Un archivo pesa más de 5 MB. Probá exportando menos meses.'); return; }
    setErr(null);
    await sumarArchivos(lista);
    cerrarCarga();
  }
  const propios = ws.modo === 'propio' ? ws.archivos : [];
  return (
    <div className={s.form}>
      <div className={s.drop} data-sobre={sobre}
        onDragOver={e => { e.preventDefault(); setSobre(true); }} onDragLeave={() => setSobre(false)}
        onDrop={e => { e.preventDefault(); setSobre(false); elegir(e.dataTransfer.files); }}>
        <Icono n="archivo" size={28} />
        <strong>Arrastrá tus archivos acá</strong>
        <span>o</span>
        <button type="button" className={`${s.btn} ${s.btnPri}`} onClick={() => input.current?.click()}>Elegir archivos CSV</button>
        <input ref={input} type="file" multiple accept=".csv,text/csv,.txt" hidden onChange={e => { elegir(e.target.files); e.target.value = ''; }} />
        <small>Podés subir varios juntos. Reconocemos cada uno solo.</small>
      </div>
      {err && <div className={s.errorBox} role="alert">No pude sumar los archivos.<p>{err}</p></div>}
      {propios.length > 0 && (
        <div className={s.subidos}>
          <span className={s.eyebrow}>Ya subiste</span>
          <ul>{propios.map(a => <li key={a.id}><Icono n="ok" size={16} />{a.nombre} <small>{kb(a.bytes)}</small></li>)}</ul>
        </div>
      )}
      <div className={s.ejemplos}>
        <span className={s.eyebrow}>Qué archivos sirven · bajá un ejemplo</span>
        <ul>
          {EJEMPLOS.map(x => (
            <li key={x.href}><a href={x.href} download><strong>{x.t}</strong></a><small>{x.d}</small></li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ---------- Mercado Pago ---------- */
export function ConectarMP() {
  const { mp, ws, conectarToken, desconectarMP, usarMP, recalcular, calculando, cargarDemo, cerrarCarga } = useDatos();
  const id = useId();
  const [token, setToken] = useState('');
  const [ver, setVer] = useState(false);
  const [estado, setEstado] = useState<{ t: 'quieto' } | { t: 'conectando' } | { t: 'error'; m: string }>({ t: 'quieto' });
  const [saliendo, setSaliendo] = useState(false);
  const usando = ws.modo === 'propio' && ws.mp && mpDisponible(mp);
  const limpio = token.trim();
  const formatoMal = limpio && !/^(APP_USR|TEST)-[\w-]{20,}$/.test(limpio) ? 'No parece un Access Token: empieza con APP_USR- y es largo. Copialo completo.' : null;

  async function conectar(e: FormEvent) {
    e.preventDefault();
    if (!limpio || formatoMal) { document.getElementById(`${id}t`)?.focus(); return; }
    setEstado({ t: 'conectando' });
    const r = await conectarToken(limpio);
    if (r.ok) { setToken(''); setEstado({ t: 'quieto' }); }
    else setEstado({ t: 'error', m: r.error });
  }

  const nombreCuenta = mp.cuenta?.apodo ?? (mp.cuenta?.id ? `Cuenta ${mp.cuenta.id}` : mp.via === 'env' ? 'Cuenta de prueba del servidor' : 'Tu cuenta');

  return (
    <div className={s.form}>
      <div className={s.honesto}>
        <Icono n="info" size={20} />
        <p><b>Qué trae:</b> tus cobros y pagos de Mercado Pago de los últimos 90 días. <b>No trae facturas de ARCA</b>: esas sumalas con una foto, el CSV de Mis Comprobantes o a mano.</p>
      </div>

      {usando ? (
        <div className={s.mpConectado} role="status">
          <span className={s.accionIco}><Icono n="mp" size={24} /></span>
          <div><strong>{nombreCuenta}</strong><small>Conectada{mp.via === 'oauth' ? ' con Mercado Pago' : mp.via === 'token' ? ' con tu Access Token' : ''}{calculando ? ' · trayendo datos…' : ''}</small></div>
          <div className={s.btnRow}>
            <button type="button" className={s.btn} onClick={recalcular} disabled={!!calculando}>Actualizar</button>
            <button type="button" className={s.btn} disabled={saliendo} onClick={async () => { setSaliendo(true); await desconectarMP(); setSaliendo(false); }}>{saliendo ? 'Desconectando…' : 'Desconectar'}</button>
          </div>
        </div>
      ) : (
        <>
          {mpDisponible(mp) && (
            <div className={s.mpConectado}>
              <span className={s.accionIco}><Icono n="mp" size={24} /></span>
              <div><strong>{nombreCuenta}</strong><small>{mp.via === 'env' ? 'Ya está configurada en este servidor.' : 'Ya está conectada en este navegador.'}</small></div>
              <button type="button" className={`${s.btn} ${s.btnPri}`} onClick={usarMP}>Usar esta cuenta</button>
            </div>
          )}

          {mp.configurado && (
            <div className={s.via}>
              <strong>La forma más rápida</strong>
              <p>Te lleva a Mercado Pago, autorizás la lectura y volvés acá.</p>
              <a className={`${s.btn} ${s.btnPri} ${s.btnBloque}`} href="/api/mp/auth" onClick={() => marcarOAuth()}>Conectar con Mercado Pago</a>
            </div>
          )}

          <form className={s.via} onSubmit={conectar} noValidate>
            <strong>{mp.configurado ? 'O pegá tu Access Token' : 'Pegá tu Access Token'}</strong>
            <ol className={s.pasos}>
              <li><span>Entrá a <a href="https://www.mercadopago.com.ar/developers/panel" target="_blank" rel="noopener noreferrer">Mercado Pago Developers ↗</a> con tu cuenta.</span></li>
              <li><span>Elegí tu aplicación (o creá una, es gratis) y abrí <b>Credenciales de producción</b>.</span></li>
              <li><span>Copiá el <b>Access Token</b> (empieza con APP_USR-) y pegalo acá.</span></li>
            </ol>
            <Campo id={`${id}t`} label="Access Token" error={estado.t === 'error' ? estado.m : formatoMal}
              ayuda={limpio.startsWith('TEST-') ? 'Es un token de prueba: va a traer datos de prueba, no los de tu negocio.' : undefined}>
              <div className={s.tokenWrap}>
                <input id={`${id}t`} className={`${s.input} ${s.mono}`} type={ver ? 'text' : 'password'} value={token} onChange={e => { setToken(e.target.value); if (estado.t === 'error') setEstado({ t: 'quieto' }); }}
                  placeholder="APP_USR-…" autoComplete="off" spellCheck={false} autoCapitalize="off"
                  aria-invalid={estado.t === 'error' || !!formatoMal} aria-describedby={desc(`${id}t`, estado.t === 'error' ? estado.m : formatoMal, limpio.startsWith('TEST-'))} />
                <button type="button" className={s.btn} onClick={() => setVer(v => !v)} aria-pressed={ver}>{ver ? 'Ocultar' : 'Mostrar'}</button>
              </div>
            </Campo>
            <p className={s.candado}><Icono n="candado" size={16} />Lo guardamos cifrado en una cookie de este navegador. Solo lo usamos para leer tus cobros y pagos. Podés desconectar cuando quieras.</p>
            <button type="submit" className={`${s.btn} ${mp.configurado ? '' : s.btnPri} ${s.btnBloque}`} disabled={estado.t === 'conectando' || !limpio}>
              {estado.t === 'conectando' ? 'Conectando con Mercado Pago…' : 'Conectar y traer mis datos'}
            </button>
          </form>
        </>
      )}
      {ws.modo === 'demo' && !usando && <p className={s.sub}>Al conectar salís de la demo y ves solo tus datos.</p>}
      {!usando && !(ws.modo === 'demo' && ws.demo?.mp) && (
        <p className={s.sub}>¿Solo querés ver cómo queda? <button type="button" className={s.link} onClick={() => { cargarDemo({ mp: true }); cerrarCarga(); }}>Probá con una cuenta simulada</button></p>
      )}
      {mp.cargado && !mp.configurado && !mpDisponible(mp) && <p className={s.sub}>La conexión directa con un clic no está habilitada en este servidor; el Access Token funciona igual.</p>}
    </div>
  );
}
