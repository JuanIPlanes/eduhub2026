// Genera SEIS pymes FICTICIAS (rubros y situaciones de caja distintas) en public/demo/perfiles/<id>/:
// mp_pagos.json (forma de GET /v1/payments/search, 90 días), exports de ARCA (recibidos/emitidos), boletas, nómina y perfil.json.
// Misma lógica que scripts/gen-pyme-mp.mjs (pagos de la cuenta + facturas que concilian por monto y nombre/CUIT), pero
// parametrizada por perfil y con semilla propia: cada perfil es determinístico e independiente.
// Todos los nombres, CUIT y montos son inventados (pesos de oct-2026, IPC ~2% mensual).
//
// TRAMPA A PROPÓSITO: perfil.json trae saldoActual (lo que el dueño confirmaría a mano el 30/10/2026) y saldoInicial90d
// (lo que había en la cuenta 90 días antes). saldoInicial90d + neto90d = saldoActual, pero SUMAR solo los pagos
// (neto90d) NO da el saldo real: por eso la app pide confirmarlo.
// Uso: node scripts/gen-perfiles-mp.mjs
import fs from 'node:fs';

const USER = 1000;
const DESDE = '2026-08-01';
const HOY = '2026-10-30';
const IPC_MES = 0.02;
const FERIADOS = ['2026-08-17', '2026-10-12'];
const PESO_DIA = [0, 1.1, 1, 1, 1.1, 1.2, 0.6]; // dom..sáb

// ── Utilidades de fecha (compartidas)
const s2d = s => new Date(s + 'T00:00:00Z');
const d2s = d => d.toISOString().slice(0, 10);
const add = (d, n) => new Date(d.getTime() + n * 86400000);
const habil = d => d.getUTCDay() % 6 !== 0 && !FERIADOS.includes(d2s(d));
const proxHabil = d => { while (!habil(d)) d = add(d, 1); return d; };
const mesesDesdeOct = d => (d.getUTCFullYear() - 2026) * 12 + d.getUTCMonth() - 9;
const infl = d => Math.pow(1 + IPC_MES, mesesDesdeOct(d));
const ar = n => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fdm = s => s.split('-').reverse().join('/');
const netoIva = t => Math.round(t / 1.21 * 100) / 100;

// Interpolación lineal de una curva [[fecha, valor], ...] (tendencia o estacionalidad de las ventas).
const curva = (pts, d) => {
  const t = d.getTime(), p = pts.map(([f, v]) => [s2d(f).getTime(), v]);
  if (t <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) if (t <= p[i][0]) return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * (t - p[i - 1][0]) / (p[i][0] - p[i - 1][0]);
  return p[p.length - 1][1];
};

// ── Un perfil completo a partir de su configuración
function generar(cfg, pi) {
  let seed = cfg.seed;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const jitter = (x, p) => Math.round(x * (1 + (rnd() * 2 - 1) * p));
  const elegir = lista => { let r = rnd() * lista.reduce((s, x) => s + x.peso, 0); for (const x of lista) if ((r -= x.peso) <= 0) return x; return lista[0]; };
  let kc = 0;
  const cuit = () => { kc++; return `30${pi + 1}${String((kc * 7919 + 1234567) % 10000000).padStart(7, '0')}${(kc + pi) % 10}`; };
  const iso = (fecha, hora) => `${fecha}T${String(hora).padStart(2, '0')}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}:00.000-03:00`;
  const desde = s2d(DESDE), hoy = s2d(HOY);
  const dentro = d => d >= desde && d <= hoy;

  const pagos = [];
  let idV = 95000000 + pi * 100000, idC = 96000000 + pi * 100000;

  // Cobro de la cuenta: MP descuenta su comisión en cobros con QR/tarjeta; las transferencias entran enteras.
  // Ocasionalmente se devuelve (total o parcial): la devolución sale de la cuenta.
  function cobro(d, desc, bruto, tipo) {
    if (!dentro(d)) return;
    const f = d2s(d), t = iso(f, 9 + Math.floor(rnd() * 9));
    const p = { id: ++idV, status: 'approved', operation_type: tipo, description: desc, date_created: t, date_approved: t, date_last_updated: t,
      transaction_amount: bruto, transaction_amount_refunded: 0,
      transaction_details: { net_received_amount: tipo === 'money_transfer' ? bruto : Math.round(bruto * (1 - cfg.comision) * 100) / 100 }, collector_id: USER, payer: { id: 2000 + Math.floor(rnd() * 500) } };
    if (tipo !== 'money_transfer' && rnd() < cfg.devol) {
      const f2 = d2s(new Date(Math.min(add(d, 1 + Math.floor(rnd() * 5)).getTime(), hoy.getTime())));
      p.status = 'refunded'; p.transaction_amount_refunded = rnd() < 0.6 ? bruto : Math.round(bruto * 0.5);
      p.date_last_updated = iso(f2, 11);
    }
    pagos.push(p);
  }
  // Pago de la cuenta a un tercero (la cuenta es la compradora).
  function pago(d, desc, monto, tipo = 'regular_payment') {
    if (!dentro(d)) return;
    const t = iso(d2s(d), 10 + Math.floor(rnd() * 6));
    pagos.push({ id: ++idC, status: 'approved', operation_type: tipo, description: desc, date_created: t, date_approved: t, date_last_updated: t,
      transaction_amount: monto, collector_id: 3000 + Math.floor(rnd() * 90), payer: { id: USER } });
  }

  // ── Ventas del día a día: cobros con QR / link de pago. cfg.ventasMes = ventas brutas por QR/link en un mes de curva 1.
  const ticketProm = cfg.catalogo.reduce((s, x) => s + x.p * x.peso, 0) / cfg.catalogo.reduce((s, x) => s + x.peso, 0);
  const ticketsDia = cfg.ventasMes / (ticketProm * 26 * (cfg.abreDomingo ? 1.2 : 1));
  for (let d = desde; d <= hoy; d = add(d, 1)) {
    const w = d.getUTCDay();
    if (PESO_DIA[w] === 0 && !cfg.abreDomingo) continue;
    if (!habil(d) && w !== 6 && !cfg.abreFeriados) continue;
    const media = ticketsDia * (cfg.abreDomingo && w === 0 ? 1.3 : PESO_DIA[w]) * curva(cfg.curva, d);
    const n = media < 0.5 ? (rnd() < media ? 1 : 0) : Math.round(media * (0.7 + rnd() * 0.6)); // pocas ventas grandes: sorteo en vez de redondear a 0
    for (let k = 0; k < n; k++) {
      const it = elegir(cfg.catalogo);
      cobro(d, `${it.n} - ${rnd() < 0.55 ? 'cobro QR' : 'link de pago'}`, Math.round(jitter(it.p * infl(d), 0.12) / 100) * 100, 'regular_payment');
    }
  }

  // ── Gastos fijos mensuales. Montos en pesos de oct-2026; sueldos y cargas crecen por paritaria (2,5%/mes).
  const sumaNeto = cfg.nomina.reduce((s, n) => s + n[1], 0);
  const cargas = Math.round(sumaNeto * 0.275);
  const g = cfg.gastos;
  const FIJOS = [ // [día, descripción, monto oct-26, tipo, paritaria?, [concepto boleta, emisor] si va a boletas, también en dic?]
    g.alquiler && [3, `ALQUILER ${g.alquilerDe} ${cfg.inmobiliaria}`, g.alquiler, 'money_transfer'],
    [5, `PAGO HABERES NOMINA ${cfg.nomina.length} EMPL`, sumaNeto, 'money_transfer', true],
    g.tasa && [5, `TASA municipal comercio ${cfg.municipio}`, g.tasa, 'regular_payment', false, ['Tasa municipal comercio', cfg.municipio]],
    g.telecom && [8, 'TELECOM internet y telefonia', g.telecom, 'regular_payment'],
    [10, 'VEP ARCA F931 CARGAS SOCIALES', cargas, 'money_transfer', true],
    g.luz && [12, 'EPEC energia electrica', g.luz, 'regular_payment', false, ['Servicio de energía EPEC', 'EPEC'], true],
    g.iibb && [15, 'VEP RENTAS IIBB', g.iibb, 'money_transfer', false, ['IIBB anticipo octubre', 'Rentas provincial']],
    g.iva && [18, 'VEP ARCA IVA DDJJ', g.iva, 'money_transfer', false, ['IVA octubre', 'ARCA']],
    g.agua && [22, 'AGUAS servicio de agua', g.agua, 'regular_payment', false, ['Servicio de agua', 'Aguas locales']],
    g.seguro && [25, 'SEGURO integral y ART', g.seguro, 'regular_payment', false, ['Seguro integral y ART', 'Aseguradora del Centro']],
    g.honorarios && [26, 'HONORARIOS estudio contable', g.honorarios, 'money_transfer'],
    g.retiro && [28, 'RETIRO SOCIO TRANSF CTA PROPIA', g.retiro, 'money_transfer'],
  ].filter(Boolean);
  for (let m = 0; m < 4; m++) { // jul..oct (solo cae en la ventana lo posterior al 1/8)
    for (const [dia, desc, base, tipo, par] of FIJOS) {
      const f = proxHabil(new Date(Date.UTC(2026, 6 + m, dia)));
      pago(f, desc, jitter(base * (par ? Math.pow(1.025, mesesDesdeOct(f)) : infl(f)), par ? 0.01 : 0.06), tipo);
    }
    if (g.gas && m % 2 === 1) { const f = proxHabil(new Date(Date.UTC(2026, 6 + m, 20))); pago(f, 'ECOGAS gas natural bimestral', jitter(g.gas * infl(f), 0.1)); }
  }
  // Compras/mantenimiento irregular
  for (const irr of cfg.irregulares ?? []) for (let d = add(desde, 3 + Math.floor(rnd() * 8)); d <= hoy; d = add(d, irr.cada + Math.floor(rnd() * 8))) pago(proxHabil(d), irr.desc, jitter(irr.base * infl(d), 0.4));

  // Inversiones puntuales (no se repiten: el pronóstico no debería proyectarlas)
  for (const [f, desc, monto] of cfg.unicos ?? []) pago(proxHabil(s2d(f)), desc, monto, 'money_transfer');

  // ── Facturas recibidas (proveedores) y su pago por transferencia a N días. Las facturas arrancan en marzo para que haya historia.
  const PROV = cfg.proveedores.map(p => ({ ...p, cuit: cuit() }));
  const recibidos = [];
  let nro = 2000 + pi * 500;
  for (const p of PROV) {
    for (let d = add(s2d('2026-03-02'), Math.floor(rnd() * 5)); d <= hoy; d = add(d, p.cada)) {
      const total = jitter(p.base * infl(d), 0.12);
      recibidos.push({ fecha: d2s(d), tipo: '1 - Factura A', pv: 3, nro: ++nro, cuit: p.cuit, nom: p.nom, total });
      pago(proxHabil(add(d, p.plazo)), `${p.nom} CUIT ${p.cuit}`, total, 'money_transfer');
    }
  }
  // ── Facturas emitidas a empresas (FCE) y su cobro por transferencia
  const CLIENTES = cfg.clientes.map(c => ({ ...c, cuit: cuit() }));
  const emitidos = [];
  let nroE = 300 + pi * 100;
  for (const c of CLIENTES) {
    for (let d = add(s2d('2026-03-04'), Math.floor(rnd() * 10)); d <= hoy; d = add(d, c.cada)) {
      const total = jitter(c.base * infl(d) * curva(c.curva ?? [['2026-03-01', 1]], d), 0.15);
      emitidos.push({ fecha: d2s(d), tipo: '201 - Factura de Crédito Electrónica MiPyMEs (FCE) A', pv: 4, nro: ++nroE, cuit: c.cuit, nom: c.nom, total });
      cobro(proxHabil(add(d, jitter(c.plazo, 0.08))), c.nom, total, 'money_transfer');
    }
  }
  pagos.sort((a, b) => a.date_approved.localeCompare(b.date_approved));

  // ── Saldo: el dueño confirma saldoActual; saldoInicial90d es lo que había 90 días antes (se deduce de los movimientos).
  const neto90d = pagos.reduce((s, p) => p.payer.id === USER ? s - p.transaction_amount
    : s + p.transaction_details.net_received_amount - (p.status === 'refunded' ? p.transaction_amount_refunded : 0), 0);
  const saldoInicial90d = Math.round(cfg.saldoActual - neto90d);

  // ── Archivos de ARCA, boletas y nómina
  const linea = r => [fdm(r.fecha), r.tipo, r.pv, r.nro, r.nro, '7612345678901' + (r.nro % 10), 'CUIT', r.cuit, r.nom, '1,00', '$', ar(netoIva(r.total)), ar(0), ar(0), ar(r.total - netoIva(r.total)), ar(r.total)].join(';');
  const hdr = q => `Fecha;Tipo;Punto de Venta;Número Desde;Número Hasta;Cód. Autorización;Tipo Doc. ${q};Nro. Doc. ${q};Denominación ${q};Tipo Cambio;Moneda;Imp. Neto Gravado;Imp. Neto No Gravado;Imp. Op. Exentas;IVA;Imp. Total`;
  const porFecha = (a, b) => a.fecha.localeCompare(b.fecha);
  const nov = new Date('2026-11-15T00:00:00Z'), dic = new Date('2026-12-15T00:00:00Z');
  const venc = { 'Tasa municipal comercio': '05', 'Servicio de energía EPEC': '12', 'IIBB anticipo octubre': '16', 'IVA octubre': '18', 'Servicio de agua': '23', 'Seguro integral y ART': '25' };
  const BOLETAS = [];
  for (const [, , base, , , bol, tambienDic] of FIJOS) if (bol) {
    BOLETAS.push([`${venc[bol[0]]}/11/2026`, bol[0], bol[1], Math.round(base * infl(nov) / 1000) * 1000]);
    if (tambienDic) BOLETAS.push([`10/12/2026`, bol[0], bol[1], Math.round(base * infl(dic) / 1000) * 1000]);
  }
  if (g.gas) BOLETAS.push(['20/11/2026', 'Servicio de gas bimestral', 'Ecogas', Math.round(g.gas * infl(nov) / 1000) * 1000]);
  BOLETAS.sort((a, b) => a[0].split('/').reverse().join('').localeCompare(b[0].split('/').reverse().join('')));

  const dir = `public/demo/perfiles/${cfg.id}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/mp_pagos.json`, JSON.stringify({ userId: USER, pagos }, null, 1));
  fs.writeFileSync(`${dir}/mis_comprobantes_recibidos.csv`, hdr('Emisor') + '\n' + recibidos.sort(porFecha).map(linea).join('\n') + '\n');
  fs.writeFileSync(`${dir}/mis_comprobantes_emitidos.csv`, hdr('Receptor') + '\n' + emitidos.sort(porFecha).map(linea).join('\n') + '\n');
  fs.writeFileSync(`${dir}/boletas_vencimientos.csv`, 'Vencimiento;Concepto;Emisor;Importe\n' + BOLETAS.map(b => `${b[0]};${b[1]};${b[2]};${ar(b[3])}`).join('\n') + '\n');
  fs.writeFileSync(`${dir}/nomina_octubre.csv`, 'Legajo;Empleado;Neto a pagar;Cargas sociales;Fecha de pago;Vencimiento cargas\n' +
    cfg.nomina.map(([e, n], i) => `${i + 1};${e};${ar(n)};${ar(Math.round(n * 0.275))};05/11/2026;10/11/2026`).join('\n') + '\n');

  const perfil = { id: cfg.id, nombre: cfg.nombre, rubro: cfg.rubro, empleados: cfg.nomina.length, descripcion: cfg.descripcion,
    saldoActual: cfg.saldoActual, saldoInicial90d, neto90d: Math.round(neto90d), fechaSaldo: HOY, situacion: cfg.situacion, pista: cfg.pista };
  fs.writeFileSync(`${dir}/perfil.json`, JSON.stringify(perfil, null, 2) + '\n');
  return { perfil, pagos: pagos.length, recibidos: recibidos.length, emitidos: emitidos.length };
}

// ── Los seis perfiles. `curva` modula la cantidad de ventas diarias (tendencia / temporada); gastos en pesos de oct-2026.
const PERFILES = [
  { // 1. Hueco cercano: mucha mercadería con plazos cortos de pago y cobros a clientes a 45 días
    id: 'ferreteria-tres-cruces', seed: 1101, nombre: 'Ferretería Tres Cruces', rubro: 'Ferretería', municipio: 'Municipalidad de Río Cuarto', inmobiliaria: 'INMOB LA ESQUINA',
    descripcion: 'Ferretería de barrio con 4 empleados. Vende por mostrador (QR y tarjeta) y a dos constructoras en cuenta corriente, pero compra mucha mercadería con plazos cortos.',
    situacion: 'hueco-cercano', pista: 'La caja se queda sin plata en menos de 30 días: sueldos, F.931 e IVA caen antes de que entren los cobros de las constructoras.',
    saldoActual: 6500000, comision: 0.0601, devol: 0.02, ventasMes: 19000000, abreFeriados: false,
    curva: [['2026-08-01', 1], ['2026-10-30', 1]],
    catalogo: [{ n: 'Tornillos y fijaciones', p: 14000, peso: 4 }, { n: 'Herramientas manuales', p: 38000, peso: 3 }, { n: 'Pintura látex 20 lts', p: 120000, peso: 2 }, { n: 'Caños y sanitarios', p: 85000, peso: 2.5 }, { n: 'Materiales eléctricos', p: 42000, peso: 3 }, { n: 'Taladro percutor', p: 165000, peso: 0.8 }, { n: 'Cemento y cal x10', p: 95000, peso: 1.5 }],
    nomina: [['Encargado', 1350000], ['Vendedor mostrador 1', 1050000], ['Vendedor mostrador 2', 1050000], ['Depósito y reparto', 950000]],
    gastos: { alquiler: 1700000, alquilerDe: 'local comercial', tasa: 150000, telecom: 70000, luz: 480000, iibb: 700000, iva: 1900000, agua: 60000, seguro: 160000, honorarios: 200000, retiro: 1200000 },
    irregulares: [{ desc: 'Flete y reparto de materiales', base: 90000, cada: 10 }],
    proveedores: [{ nom: 'DISTRIBUIDORA HERRAMIENTAS DEL CENTRO SRL', cada: 10, base: 2000000, plazo: 14 }, { nom: 'CORRALON MAYORISTA LOS PINOS SA', cada: 10, base: 1600000, plazo: 14 }, { nom: 'PINTURERIA INDUSTRIAL NORTE SRL', cada: 21, base: 1000000, plazo: 10 }, { nom: 'ELECTRO MATERIALES CUYO SRL', cada: 14, base: 800000, plazo: 12 }],
    clientes: [{ nom: 'CONSTRUCTORA LOS ROBLES SRL', cada: 21, base: 4000000, plazo: 45 }, { nom: 'DESARROLLOS URBANOS TRES RIOS SA', cada: 28, base: 4600000, plazo: 50 }] },
  { // 2. Caja justa: aguinaldo (18/12) e impuestos por venir
    id: 'taller-el-piston', seed: 2202, nombre: 'Taller Mecánico El Pistón', rubro: 'Taller mecánico', municipio: 'Municipalidad de Villa Maria', inmobiliaria: 'INMOB CENTRO',
    descripcion: 'Taller mecánico y gomería con 6 empleados. Cobra reparaciones por QR/tarjeta y mantiene flotas de empresas con factura a 30 días.',
    situacion: 'justo', pista: 'Hoy no hay hueco, pero el aguinaldo del 18/12 y los impuestos de diciembre dejan la caja al borde: conviene reservar desde ya.',
    saldoActual: 8500000, comision: 0.0601, devol: 0.02, ventasMes: 16500000, abreFeriados: false,
    curva: [['2026-08-01', 1], ['2026-10-30', 1]],
    catalogo: [{ n: 'Service y cambio de aceite', p: 120000, peso: 4 }, { n: 'Frenos y pastillas', p: 190000, peso: 3 }, { n: 'Alineación y balanceo', p: 70000, peso: 3 }, { n: 'Cubiertas x2', p: 420000, peso: 1.5 }, { n: 'Reparación de motor', p: 900000, peso: 0.4 }, { n: 'Diagnóstico y electricidad', p: 85000, peso: 3 }],
    nomina: [['Jefe de taller', 1500000], ['Mecánico 1', 1250000], ['Mecánico 2', 1250000], ['Electricista del automotor', 1200000], ['Gomero', 1000000], ['Administración', 1050000]],
    gastos: { alquiler: 1500000, alquilerDe: 'galpón taller', tasa: 140000, telecom: 65000, luz: 520000, iibb: 560000, iva: 1250000, agua: 70000, seguro: 230000, honorarios: 210000, retiro: 1800000 },
    unicos: [['2026-09-15', 'Compra de elevador hidraulico y scanner', 7500000]], irregulares: [{ desc: 'Herramental y descartables', base: 120000, cada: 14 }],
    proveedores: [{ nom: 'AUTOPARTES DEL VALLE SRL', cada: 7, base: 1100000, plazo: 15 }, { nom: 'LUBRICANTES ANDINOS SA', cada: 14, base: 1000000, plazo: 21 }, { nom: 'NEUMATICOS PAMPEANOS SRL', cada: 21, base: 1200000, plazo: 20 }, { nom: 'REPUESTOS FRENOS DEL SUR SRL', cada: 14, base: 650000, plazo: 15 }],
    clientes: [{ nom: 'TRANSPORTE ALTOS DEL RIO SRL', cada: 14, base: 2300000, plazo: 30 }, { nom: 'REMISES CENTRO SRL', cada: 14, base: 1800000, plazo: 28 }, { nom: 'LOGISTICA PAMPA NORTE SA', cada: 21, base: 2200000, plazo: 35 }] },
  { // 3. Caja holgada con excedente
    id: 'estudio-brujula', seed: 3303, nombre: 'Estudio Brújula Diseño', rubro: 'Estudio de diseño', municipio: 'Municipalidad de Rosario', inmobiliaria: 'INMOB DEL PUERTO',
    descripcion: 'Estudio de diseño gráfico e identidad de marca con 3 empleados. Pocos gastos fijos, clientes corporativos que pagan a 30 días y mucha caja acumulada.',
    situacion: 'holgada', pista: 'Después de reservar un mes de gastos fijos sobra una cifra importante y por varios meses: hay excedente para colocar.',
    saldoActual: 30000000, comision: 0.0601, devol: 0.015, ventasMes: 2500000, abreFeriados: false,
    curva: [['2026-08-01', 1], ['2026-10-30', 1.05]],
    catalogo: [{ n: 'Logo y papelería', p: 380000, peso: 3 }, { n: 'Pieza para redes (pack)', p: 210000, peso: 4 }, { n: 'Identidad de marca completa', p: 1100000, peso: 1 }, { n: 'Diseño de packaging', p: 650000, peso: 1.5 }],
    nomina: [['Directora creativa', 1900000], ['Diseñador senior', 1500000], ['Administración y cuentas', 1200000]],
    gastos: { alquiler: 1300000, alquilerDe: 'oficina', tasa: 70000, telecom: 80000, luz: 160000, iibb: 450000, iva: 1050000, agua: 25000, seguro: 90000, honorarios: 230000, retiro: 2200000 },
    irregulares: [{ desc: 'Licencias de software y fuentes', base: 160000, cada: 30 }],
    proveedores: [{ nom: 'IMPRENTA GRAFICA DEL LITORAL SRL', cada: 21, base: 800000, plazo: 15 }, { nom: 'SOFTWARE Y NUBE ESTUDIOS SA', cada: 30, base: 450000, plazo: 7 }],
    clientes: [{ nom: 'BODEGAS LA CUMBRE SA', cada: 21, base: 3600000, plazo: 30 }, { nom: 'GRUPO DESARROLLISTA PARANA SRL', cada: 28, base: 4200000, plazo: 30 }, { nom: 'LABORATORIOS ALTA VISTA SA', cada: 30, base: 3900000, plazo: 35 }, { nom: 'COOPERATIVA AGRICOLA DEL SUR LTDA', cada: 35, base: 2700000, plazo: 28 }] },
  { // 4. Ventas en baja: cada mes cobra menos
    id: 'carpinteria-quebracho', seed: 4404, nombre: 'Carpintería y Muebles Quebracho', rubro: 'Carpintería', municipio: 'Municipalidad de San Luis', inmobiliaria: 'INMOB DEL PARQUE',
    descripcion: 'Carpintería de muebles a medida con 4 empleados. Las ventas vienen cayendo mes a mes desde el invierno mientras los costos siguen la inflación.',
    situacion: 'ventas-en-baja', pista: 'Las acreditaciones bajan mes a mes (agosto > septiembre > octubre) y los gastos no: la caja se achica y el hueco aparece en un par de meses.',
    saldoActual: 5000000, comision: 0.0601, devol: 0.025, ventasMes: 17000000, abreFeriados: false,
    curva: [['2026-08-01', 1.2], ['2026-09-01', 0.98], ['2026-10-01', 0.78], ['2026-10-30', 0.62]],
    catalogo: [{ n: 'Silla de roble', p: 85000, peso: 4 }, { n: 'Mesa ratona de paraíso', p: 190000, peso: 3 }, { n: 'Escritorio melamina', p: 320000, peso: 3 }, { n: 'Biblioteca a medida', p: 410000, peso: 2.5 }, { n: 'Placard 2 puertas', p: 560000, peso: 1.5 }, { n: 'Reparación y laqueado', p: 70000, peso: 3 }],
    nomina: [['Maestro carpintero', 1450000], ['Oficial carpintero', 1150000], ['Ayudante de taller', 950000], ['Administración y ventas', 1050000]],
    gastos: { alquiler: 1250000, alquilerDe: 'taller', tasa: 130000, telecom: 60000, luz: 460000, iibb: 330000, iva: 700000, agua: 65000, seguro: 160000, honorarios: 190000, retiro: 1100000, gas: 190000 },
    unicos: [['2026-09-08', 'Compra de seccionadora y canteadora', 7000000]], irregulares: [{ desc: 'Afilado y repuestos sierra', base: 70000, cada: 20 }],
    proveedores: [{ nom: 'MADERAS DEL OESTE SA', cada: 14, base: 1200000, plazo: 21 }, { nom: 'HERRAJES PUNTANOS SRL', cada: 30, base: 640000, plazo: 15 }, { nom: 'BARNICES Y LACAS DEL SUR SRL', cada: 30, base: 420000, plazo: 10 }],
    clientes: [{ nom: 'ESTUDIO JURIDICO MORENO Y ASOCIADOS SRL', cada: 30, base: 1500000, plazo: 35, curva: [['2026-03-01', 1.3], ['2026-08-01', 1], ['2026-10-30', 0.55]] }, { nom: 'HOTEL BOUTIQUE LAS RETAMAS SA', cada: 28, base: 1500000, plazo: 40, curva: [['2026-03-01', 1.3], ['2026-08-01', 1], ['2026-10-30', 0.6]] }] },
  { // 5. Estacional: gastronomía/turismo, temporada alta que termina
    id: 'hosteria-cerro-nevado', seed: 5505, nombre: 'Cervecería y Cabañas Cerro Nevado', rubro: 'Gastronomía y turismo', municipio: 'Municipalidad de Villa La Cumbre', inmobiliaria: 'INMOB DEL LAGO',
    descripcion: 'Cervecería artesanal con cabañas en zona de montaña y 9 empleados. Vende mucho en temporada de invierno y vacaciones; de noviembre a diciembre entra la temporada baja.',
    situacion: 'estacional', pista: 'Las acreditaciones ya vienen bajando de temporada alta a baja (agosto > septiembre > octubre) y los sueldos y el aguinaldo no bajan: el hueco asoma a principios de diciembre y es mucho más profundo si las ventas caen a la mitad.',
    saldoActual: 16500000, comision: 0.045, devol: 0.02, ventasMes: 36000000, abreFeriados: true, abreDomingo: true,
    curva: [['2026-08-01', 1.3], ['2026-09-10', 1.05], ['2026-10-10', 0.8], ['2026-10-30', 0.65]],
    catalogo: [{ n: 'Cena para dos con cerveza', p: 86000, peso: 4 }, { n: 'Pinta y picada', p: 42000, peso: 5 }, { n: 'Almuerzo familiar', p: 120000, peso: 3 }, { n: 'Estadía en cabaña (noche)', p: 190000, peso: 1.2 }, { n: 'Pack de cervezas para llevar', p: 38000, peso: 2.5 }],
    nomina: [['Encargado general', 1500000], ['Cocinero', 1300000], ['Ayudante de cocina', 1000000], ['Mozo 1', 950000], ['Mozo 2', 950000], ['Mozo 3', 950000], ['Barman', 1050000], ['Cabañas y limpieza', 900000], ['Administración', 1100000]],
    gastos: { alquiler: 1600000, alquilerDe: 'local gastronomico', tasa: 220000, telecom: 85000, luz: 780000, iibb: 760000, iva: 1250000, agua: 90000, seguro: 240000, honorarios: 260000, retiro: 2500000, gas: 330000 },
    unicos: [['2026-08-20', 'Remodelacion de salon y cabanas', 14000000]], irregulares: [{ desc: 'Reparaciones de cabañas y equipos', base: 150000, cada: 12 }],
    proveedores: [{ nom: 'MALTA Y LUPULO PATAGONICO SRL', cada: 14, base: 1700000, plazo: 15 }, { nom: 'CARNES DEL VALLE SA', cada: 7, base: 1100000, plazo: 7 }, { nom: 'DISTRIBUIDORA DE BEBIDAS ANDINA SRL', cada: 14, base: 1000000, plazo: 14 }, { nom: 'VERDULERIA MAYORISTA LA HUERTA SRL', cada: 7, base: 600000, plazo: 7 }],
    clientes: [{ nom: 'AGENCIA DE TURISMO ANDES VIVOS SRL', cada: 21, base: 2400000, plazo: 30, curva: [['2026-03-01', 0.9], ['2026-08-01', 1.5], ['2026-10-30', 0.9]] }, { nom: 'EMPRESA DE EVENTOS CUMBRE SA', cada: 30, base: 2100000, plazo: 35 }] },
  { // 6. Cliente concentrado: >50% de lo facturado a un solo cliente que paga a 55 días
    id: 'vivero-los-talas', seed: 6606, nombre: 'Vivero Los Talas', rubro: 'Vivero', municipio: 'Municipalidad de Pilar', inmobiliaria: 'INMOB DEL CAMINO',
    descripcion: 'Vivero con 5 empleados. Vende plantas al público por QR, pero más de la mitad de lo que factura es para una desarrolladora de loteos que le paga a 55 días.',
    situacion: 'concentrada', pista: 'Más del 50% de las ventas depende de un solo cliente que paga a 55 días: si se demora un mes, aparece un hueco aunque hoy la caja esté bien.',
    saldoActual: 8500000, comision: 0.0601, devol: 0.02, ventasMes: 5500000, abreFeriados: false,
    curva: [['2026-08-01', 0.85], ['2026-10-01', 1.15], ['2026-10-30', 1.2]],
    catalogo: [{ n: 'Plantas de interior', p: 22000, peso: 5 }, { n: 'Árboles frutales', p: 48000, peso: 3 }, { n: 'Sustrato y fertilizantes', p: 30000, peso: 4 }, { n: 'Macetas de cerámica', p: 36000, peso: 3 }, { n: 'Set de jardín completo', p: 95000, peso: 1.2 }],
    nomina: [['Encargado de vivero', 1250000], ['Viverista 1', 1000000], ['Viverista 2', 1000000], ['Peón de campo', 900000], ['Administración y ventas', 1050000]],
    gastos: { alquiler: 1200000, alquilerDe: 'predio vivero', tasa: 110000, telecom: 55000, luz: 380000, iibb: 430000, iva: 560000, agua: 140000, seguro: 150000, honorarios: 180000, retiro: 1300000 },
    irregulares: [{ desc: 'Insumos de riego y herramientas', base: 90000, cada: 12 }],
    proveedores: [{ nom: 'SEMILLAS Y PLANTINES DEL NORTE SRL', cada: 14, base: 1050000, plazo: 15 }, { nom: 'AGROINSUMOS PILAR SA', cada: 21, base: 650000, plazo: 14 }, { nom: 'MACETAS Y CERAMICA ARTESANAL SRL', cada: 30, base: 420000, plazo: 10 }],
    clientes: [{ nom: 'DESARROLLADORA LOTEOS DEL SOL SA', cada: 15, base: 5000000, plazo: 55 }, { nom: 'PAISAJISMO VERDE VIVO SRL', cada: 30, base: 900000, plazo: 30 }] },
];

const resumen = [];
for (let i = 0; i < PERFILES.length; i++) {
  const r = generar(PERFILES[i], i);
  resumen.push(r.perfil);
  console.log(`${r.perfil.id}: pagos=${r.pagos} recibidos=${r.recibidos} emitidos=${r.emitidos} saldoActual=${ar(r.perfil.saldoActual)} saldoInicial90d=${ar(r.perfil.saldoInicial90d)} neto90d=${ar(r.perfil.neto90d)}`);
}
fs.writeFileSync('public/demo/perfiles/index.json', JSON.stringify(resumen.map(p => ({ id: p.id, nombre: p.nombre, rubro: p.rubro, empleados: p.empleados, descripcion: p.descripcion, saldoActual: p.saldoActual, situacion: p.situacion, pista: p.pista })), null, 2) + '\n');
