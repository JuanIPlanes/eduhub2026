// Capa de IA. Opcional: sin clave la app funciona con los textos armados por reglas.
// Proveedor: Anthropic (ANTHROPIC_API_KEY) si está; si no, OpenRouter (OPENROUTER_API_KEY) usando SOLO modelos gratuitos (":free").
// El LLM nunca calcula montos: redacta sobre cifras ya calculadas y lee fotos de comprobantes.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';
import type { Pronostico } from './forecast';
import type { Recomendacion } from './advice';
import type { Alertas } from './alertas';

const MODELO = 'claude-opus-5-5';
// Opus 5.5: el pensamiento no se puede apagar y el esfuerzo por defecto es "medium": lo fijamos explícito.
const ESFUERZO = 'low' as const;
const proveedor = () => (process.env.ANTHROPIC_API_KEY ? 'anthropic' : process.env.OPENROUTER_API_KEY ? 'openrouter' : null);
const hayClave = () => proveedor() !== null;

// OpenRouter gratis: los ids terminan en ":free" (sin costo). Se filtra todo lo que no lo sea, así una variable mal puesta nunca genera gasto.
// El catálogo gratuito rota seguido (un modelo fijo puede pasar a pago y dar 404): se consulta el catálogo público y se prefieren
// estos modelos si siguen gratis. Se pueden forzar con OPENROUTER_MODELS_TEXTO / OPENROUTER_MODELS_VISION (ids separados por coma).
const PREFERIDOS = ['google/gemma-4-31b-it:free', 'nvidia/nemotron-3-ultra-550b-a55b:free', 'google/gemma-4-26b-a4b-it:free', 'nvidia/nemotron-3.5-super-vl:free'];
const NO_SIRVE = /code|safety|lfm/; // modelos de código, moderación o demasiado chicos
let catalogo: { t: number; modelos: { id: string; imagen: boolean }[] } | null = null;
async function gratuitos(): Promise<{ id: string; imagen: boolean }[]> {
  if (catalogo && Date.now() - catalogo.t < 3_600_000) return catalogo.modelos;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(10_000) });
    const d = await res.json() as { data: { id: string; architecture?: { input_modalities?: string[] } }[] };
    const modelos = d.data.filter(m => m.id.endsWith(':free') && !NO_SIRVE.test(m.id))
      .map(m => ({ id: m.id, imagen: Boolean(m.architecture?.input_modalities?.includes('image')) }));
    if (modelos.length) catalogo = { t: Date.now(), modelos };
  } catch (e) { logError('catalogo-openrouter', e); }
  return catalogo?.modelos ?? PREFERIDOS.map(id => ({ id, imagen: true }));
}
async function modelosGratis(forzados: string | undefined, imagen: boolean): Promise<string[]> {
  const f = forzados?.split(',').map(x => x.trim()).filter(x => x.endsWith(':free'));
  if (f?.length) return f;
  const ok = (await gratuitos()).filter(m => !imagen || m.imagen).map(m => m.id);
  const orden = [...PREFERIDOS.filter(id => ok.includes(id)), ...ok.filter(id => !PREFERIDOS.includes(id))];
  return (orden.length ? orden : PREFERIDOS).slice(0, 3);
}
const MODELOS_TEXTO = () => modelosGratis(process.env.OPENROUTER_MODELS_TEXTO, false);
const MODELOS_VISION = () => modelosGratis(process.env.OPENROUTER_MODELS_VISION, true);

type MensajeOR = { role: 'system' | 'user'; content: string | unknown[] };
// Llama a OpenRouter (chat completions). Devuelve el texto o lanza con el estado HTTP para el log.
async function openrouter(models: string[], messages: MensajeOR[], json = false, intento = 1): Promise<string> {
  const res = await fetch(process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'CFO de Bolsillo' },
    body: JSON.stringify({ models, messages, max_tokens: 3000, // los modelos con razonamiento gastan tokens pensando antes de responder
    temperature: 0.3, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status} ${(await res.text()).slice(0, 200)}`);
  const d = await res.json() as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
  const c = d.choices?.[0];
  if (!c?.message?.content || c.finish_reason === 'length') {
    if (intento < 2) return openrouter(models, messages, json, intento + 1); // a veces el modelo gratuito responde vacío: un reintento
    throw new Error('OpenRouter: respuesta vacía o cortada');
  }
  return c.message.content.trim();
}
// Timeout corto (el chat no puede quedar colgado) y 1 reintento automático del SDK (429/5xx/red).
const cliente = () => new Anthropic({ timeout: 45_000, maxRetries: 1 });

// Si el clasificador de seguridad rechaza el pedido, la API lo reintenta del lado servidor en otro modelo.
const CON_FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } as const;

// Intenta con fallback de refusals; si la API lo rechaza (400 por beta/modelo no soportado) reintenta sin él.
async function conFallback<T>(llamar: (extra: { betas?: string[]; fallbacks?: 'default' }) => Promise<T>): Promise<T> {
  try {
    return await llamar({ betas: [...CON_FALLBACK.betas], fallbacks: CON_FALLBACK.fallbacks });
  } catch (e) {
    if (e instanceof Anthropic.BadRequestError) return await llamar({});
    throw e;
  }
}

// Motivo en español para el usuario, sin detalles técnicos. El detalle va al log del servidor.
function motivoError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
    return 'La clave de la IA no es válida o no tiene permisos. Revisá ANTHROPIC_API_KEY.';
  if (e instanceof Anthropic.RateLimitError) return 'La IA está recibiendo muchas consultas. Probá de nuevo en un minuto.';
  if (e instanceof Anthropic.APIConnectionTimeoutError) return 'La IA tardó demasiado en responder. Probá de nuevo.';
  if (e instanceof Anthropic.APIConnectionError) return 'No pude conectarme con la IA. Revisá la conexión y probá de nuevo.';
  if (e instanceof Anthropic.InternalServerError) return 'La IA tiene un problema momentáneo. Probá de nuevo en unos minutos.';
  if (e instanceof Anthropic.BadRequestError) return 'No pude procesar esa imagen. Probá con otra foto más nítida.';
  return 'No pude leer la foto en este momento. Probá de nuevo.';
}
const logError = (donde: string, e: unknown) =>
  console.error(`[ia:${donde}]`, e instanceof Anthropic.APIError ? `${e.constructor.name} ${e.status ?? ''} ${e.message}` : e);

// Criterios destilados de las skills de /skills (Analista de Caja, Analista Researcher y Macro Argentina).
// Se aplican solo como reglas de redacción: los cálculos (liquidez, scoring, Monte Carlo, TIR) los hace el código, nunca el modelo.
const SISTEMA = `Sos el "CFO de Bolsillo", un asistente de caja para dueños de pymes argentinas que escribe por WhatsApp.
Escribí en español rioplatense, de vos, claro y cálido, sin jerga financiera. Primera respuesta CORTA: unas 3 líneas (máximo 70 palabras), en un solo párrafo corrido: sin títulos, viñetas ni enumeraciones con números.
Usá SOLO las cifras y fechas que te paso, copiadas tal cual vienen escritas (no redondees, no conviertas a "millones", no sumes ni restes); no inventes números.

Cómo hablar (criterio de analista de caja):
- Hablá en lenguaje de resultado: "cómo va a estar tu plata las próximas semanas", "un día en que te falta plata para pagar X", "tus cobros tardan". Nunca digas "agente", "modelo", "proyección a 13 semanas", "escenario base" ni nombres de herramientas o de pasos internos.
- Primero lo que está bien (si hay algo en los datos), después el problema y lo que se puede hacer. Tono constructivo, sin dramatizar ni asustar.
- Hacelo entendible con la plata del propio dueño, con una analogía corta solo si suma; si usás un término técnico, explicalo en pocas palabras. Ofrecé profundizar en una sola cosa a la vez.
- Todo lo calculado con tasas de referencia, supuestos o saldo no confirmado llevalo rotulado "(estimado)". Si el saldo viene sin confirmar, decilo claro y pedí que lo confirme: nunca afirmes "no te quedás sin plata" ni "te alcanza" sobre un saldo estimado. Nunca presentes una estimación como un hecho.
- Seudonimización: no repitas CUIT, ni datos personales de terceros, ni nada que identifique a un cliente o proveedor más de lo que ya viene escrito en los datos; no agregues información que no esté. No hagas juicios sobre evasión ni sobre la persona.
- No decidas por el dueño: cada opción tiene costo y elige él. Nunca recomiendes un destino o una opción sin mostrar su costo y al menos una alternativa. Derivar a un banco, ALyC o contador es solo una sugerencia, nunca algo que ya hiciste, y ningún dato sale sin su consentimiento.

Qué NO hacer (marco regulatorio):
- No nombres tickers, bonos, fondos, bancos ni entidades concretas, ni digas "comprá", "vendé" o "invertí". Si hablás de colocar plata, solo categorías generales (plazo fijo, caución, fondo de corto plazo), con su riesgo y plazo, y que el plazo de la inversión no supere la fecha en que se necesita la plata.
- No des pronósticos macro ni de mercado propios; si los datos traen un contexto con fuente y fecha, citalo con esa fecha. El puntaje es preliminar: no es un scoring ni una calificación crediticia oficial.
- Solo si mencionás dónde colocar plata (plazo fijo, caución, fondos), cerrá con "Esto es información educativa, no una recomendación personalizada."; si no, no lo agregues.
- No repitas todas las opciones con sus cifras: nombrá a lo sumo dos y dejá el detalle para las tarjetas de abajo. Un mensaje corto vale más que uno completo.
Terminá invitando a elegir una de las opciones que se muestran debajo del mensaje.`;

// Lo que la IA nunca debe decirle a un usuario: órdenes de operar o instrumentos puntuales (modo educativo de la skill del Researcher).
const PROHIBIDO = /(?<![\p{L}])(?:(?:comprá|vendé|invertí)(?:l[oa]s?)?|(?:compral|vendel|invertil)[oa]s?)(?![\p{L}])|\b(?:AL|GD|AE)\d{2}\b|\bCEDEARs?\b/iu;

const NUM = /\d[\d.,]*\d|\d/g;
// Compara por valor (es-AR): "37" y "37,0" son la misma cifra; "1.234" son mil doscientos treinta y cuatro.
const norm = (s: string) => {
  const v = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
  return String(Number(v));
};
// El texto de la IA solo puede traer números que ya estaban en los datos (guarda anti-alucinación de cifras).
function numerosAjenos(texto: string, datos: string): string[] {
  const permitidos = new Set((datos.match(NUM) ?? []).map(norm));
  // Los marcadores de lista ("1)", "2)") no son cifras.
  return (texto.replace(/(^|\s)\d\)/g, '$1').match(NUM) ?? []).filter(n => !permitidos.has(norm(n)));
}
const palabras = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

// Texto armado solo con reglas (sin LLM): lo que /api/analizar devuelve por defecto.
export const mensajeReglas = (r: Recomendacion): { texto: string; fuente: 'reglas' } => ({ texto: [r.alerta, ...r.contexto].join('\n\n'), fuente: 'reglas' });

// `timeoutMs`: tope duro; si el LLM no responde a tiempo se devuelve el texto por reglas (la llamada sigue hasta su
// propio timeout pero nadie la espera). Sin `timeoutMs` espera lo que tarde el proveedor (scripts/probar-ia.ts).
export async function redactar(p: Pronostico, r: Recomendacion, al?: Alertas, timeoutMs?: number): Promise<{ texto: string; fuente: 'ia' | 'reglas' }> {
  if (!timeoutMs) return redactarSinTope(p, r, al);
  let t: ReturnType<typeof setTimeout>;
  const tope = new Promise<{ texto: string; fuente: 'reglas' }>(ok => { t = setTimeout(() => { console.warn(`[ia:redactar] sin respuesta en ${timeoutMs} ms, uso reglas`); ok(mensajeReglas(r)); }, timeoutMs); });
  try { return await Promise.race([redactarSinTope(p, r, al), tope]); } finally { clearTimeout(t!); }
}

async function redactarSinTope(p: Pronostico, r: Recomendacion, al?: Alertas): Promise<{ texto: string; fuente: 'ia' | 'reglas' }> {
  const base = [r.alerta, ...r.contexto].join('\n\n');
  if (!hayClave()) return { texto: base, fuente: 'reglas' };
  try {
    const datos = {
      alerta: r.alerta,
      saldoConfirmado: p.confiable !== false, // false => el saldo es una estimación: no afirmar que alcanza ni que no alcanza
      opciones: r.opciones.map(o => ({ titulo: o.titulo, detalle: o.detalle, cubre: o.cubre, ...(o.estimado && { rotulo: '(estimado)' }) })),
      contexto: r.contexto,
      aprendizajes: p.aprendizajes.slice(0, 4),
      vencimientos: al ? { proximos7dias: al.resumen.vence7, proximos30dias: al.resumen.vence30, boletasVencidas: al.resumen.vencidas, alertas: al.alertas.slice(0, 3).map(a => a.titulo) } : undefined,
    };
    const json = JSON.stringify(datos, null, 1);
    const pedido = `Redactá el mensaje para el dueño con estos datos:\n${json}`;
    let texto: string;
    if (proveedor() === 'openrouter') {
      texto = await openrouter(await MODELOS_TEXTO(), [{ role: 'system', content: SISTEMA }, { role: 'user', content: pedido }]);
    } else {
      const res = await conFallback(extra =>
        cliente().beta.messages.create({
          model: MODELO,
          max_tokens: 4000, // margen para el pensamiento adaptativo, que no se puede apagar
          output_config: { effort: ESFUERZO },
          system: SISTEMA,
          messages: [{ role: 'user', content: pedido }],
          ...extra,
        }),
      );
      // refusal (clasificadores de seguridad, incluso tras el fallback) o corte por largo: no usar el texto parcial.
      if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') return { texto: base, fuente: 'reglas' };
      texto = res.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('').trim();
    }
    if (!texto) return { texto: base, fuente: 'reglas' };
    const ajenos = numerosAjenos(texto, json);
    if (ajenos.length || palabras(texto) > 120 || PROHIBIDO.test(texto)) {
      console.warn('[ia:redactar] texto descartado por cifras ajenas, largo excesivo o lenguaje de recomendación:', ajenos.join(', '), palabras(texto), 'palabras |', JSON.stringify(texto));
      return { texto: base, fuente: 'reglas' };
    }
    return { texto, fuente: 'ia' };
  } catch (e) {
    logError('redactar', e);
    return { texto: base, fuente: 'reglas' };
  }
}

const ComprobanteFoto = z.object({
  es_comprobante: z.boolean(),
  tipo: z.string().describe('Ej: Factura A, Factura B, Factura C, Ticket, Remito'),
  fecha_emision: z.string().describe('yyyy-mm-dd'),
  fecha_vencimiento: z.string().describe('yyyy-mm-dd o vacío si no figura'),
  cuit_emisor: z.string().describe('solo dígitos'),
  razon_social_emisor: z.string(),
  numero: z.string(),
  total: z.number().describe('Importe total en pesos'),
});
export type ComprobanteFoto = z.infer<typeof ComprobanteFoto>;

export type ResultadoFoto = { ok: true; comprobante: ComprobanteFoto } | { ok: false; motivo: string };

export const MOTIVO_SIN_IA = 'La lectura de fotos necesita configurar la IA (ANTHROPIC_API_KEY u OPENROUTER_API_KEY).';
const PEDIDO_FOTO = 'Extraé los datos de este comprobante argentino (factura, ticket o remito). Si no es un comprobante, es_comprobante=false y dejá los demás campos vacíos o en 0. Fechas en yyyy-mm-dd; CUIT solo dígitos; total en pesos como número.';
export const hayIA = hayClave;

// Lee una foto de comprobante. Nunca lanza: devuelve { ok:false, motivo } con un mensaje entendible en español.
export async function leerFoto(base64: string, mediaType: 'image/jpeg' | 'image/png' | 'image/webp'): Promise<ResultadoFoto> {
  if (!hayClave()) return { ok: false, motivo: MOTIVO_SIN_IA };
  try {
    if (proveedor() === 'openrouter') {
      const campos = Object.entries(z.toJSONSchema(ComprobanteFoto).properties ?? {}).map(([k, v]) => `"${k}": ${(v as { type?: string }).type}`).join(', ');
      const txt = await openrouter(await MODELOS_VISION(), [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
        { type: 'text', text: `${PEDIDO_FOTO}
Respondé SOLO con un objeto JSON con exactamente estas claves: { ${campos} }.` },
      ] }], true);
      const ok = ComprobanteFoto.safeParse(JSON.parse(txt.replace(/^```(?:json)?|```$/g, '').trim()));
      return ok.success ? { ok: true, comprobante: ok.data } : { ok: false, motivo: 'No pude leer la foto con claridad. Probá con una imagen más nítida.' };
    }
    const res = await conFallback(extra =>
      cliente().beta.messages.parse({
        model: MODELO,
        max_tokens: 4000,
        output_config: { effort: ESFUERZO, format: betaZodOutputFormat(ComprobanteFoto) },
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: PEDIDO_FOTO },
        ] }],
        ...extra,
      }),
    );
    if (res.stop_reason === 'refusal') return { ok: false, motivo: 'La IA no pudo procesar esa imagen. Probá con otra foto.' };
    if (res.stop_reason === 'max_tokens' || !res.parsed_output) return { ok: false, motivo: 'No pude leer la foto con claridad. Probá con una imagen más nítida.' };
    return { ok: true, comprobante: res.parsed_output };
  } catch (e) {
    logError('leerFoto', e);
    return { ok: false, motivo: motivoError(e) };
  }
}
