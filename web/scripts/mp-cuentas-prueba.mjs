// Crea cuentas de PRUEBA de Mercado Pago (usuarios de test, MLA) con POST /users/test y guarda sus credenciales
// en web/.mp-cuentas-prueba.json (ignorado por git; no se imprimen contraseñas).
// Uso (desde web/):  node scripts/mp-cuentas-prueba.mjs               -> simulación: muestra qué haría
//                    node scripts/mp-cuentas-prueba.mjs --crear 2      -> crea 2 cuentas
// Requiere el Access Token de PRODUCCIÓN de tu app en MP_CUENTAS_TOKEN (las cuentas quedan asociadas a tu cuenta de Developers).
// Límites de Mercado Pago: máx. 15 cuentas de prueba por cuenta de desarrollador y no hay API para borrarlas.
// El saldo ficticio NO se puede cargar por API: se asigna a mano en el panel (Tus integraciones → Cuentas de prueba).
import fs from 'node:fs';

const env = {};
try {
  for (const l of fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* sin .env.local */ }
// Crear usuarios de prueba exige el token de PRODUCCIÓN de una cuenta real (con un token de usuario de prueba responde 403).
// Pasalo solo por entorno en esta ejecución: MP_CUENTAS_TOKEN=... node scripts/mp-cuentas-prueba.mjs --crear 2
const TOKEN = process.env.MP_CUENTAS_TOKEN || env.MP_CUENTAS_TOKEN || process.env.MP_ACCESS_TOKEN || env.MP_ACCESS_TOKEN;
const i = process.argv.indexOf('--crear');
const cantidad = i >= 0 ? Math.max(1, Math.min(5, parseInt(process.argv[i + 1] ?? '', 10) || 1)) : 0;
const SALIDA = new URL('../.mp-cuentas-prueba.json', import.meta.url);

if (!TOKEN) { console.error('Falta MP_CUENTAS_TOKEN (Access Token de producción de tu app)'); process.exit(1); }
if (!cantidad) {
  console.log('Simulación: no se crea nada. Para crear 2 cuentas: node scripts/mp-cuentas-prueba.mjs --crear 2');
  process.exit(0);
}

let previas = [];
try { previas = JSON.parse(fs.readFileSync(SALIDA, 'utf8')); } catch { /* primera vez */ }
if (previas.length + cantidad > 15) { console.error(`Superaría el máximo de 15 cuentas (ya guardaste ${previas.length}).`); process.exit(1); }

const nuevas = [];
for (let n = 1; n <= cantidad; n++) {
  const descripcion = `CFO de Bolsillo demo ${previas.length + n}`;
  const r = await fetch('https://api.mercadopago.com/users/test', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ site_id: 'MLA', description: descripcion }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) { console.error(`No se pudo crear "${descripcion}": HTTP ${r.status} ${j.message ?? j.error ?? ''}`); break; }
  nuevas.push({ descripcion, id: j.id, usuario: j.nickname, contrasena: j.password, estado: j.site_status, creada: new Date().toISOString() });
  fs.writeFileSync(SALIDA, JSON.stringify([...previas, ...nuevas], null, 2), { mode: 0o600 });
  console.log(`✓ ${descripcion}: id ${j.id}, usuario ${j.nickname} (credenciales en web/.mp-cuentas-prueba.json)`);
}
console.log(`\nCuentas creadas: ${nuevas.length}. Falta cargarles saldo ficticio a mano en el panel de Mercado Pago Developers.`);
