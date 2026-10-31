---
name: modulo-mercado-ficticio
description: Agrega a la web "CFO de Bolsillo" una sección de Mercado que analiza acciones de empresas FICTICIAS con datos ficticios (precios, balances, dividendos, eventos y un índice inventados), con ranking, ficha por empresa, comparador, lectura en palabras y un simulador de cartera conectado a la pantalla Excedente. Usala siempre que se pida modificar la página para sumar análisis de acciones, mercado, renta variable, ranking de empresas o un simulador de inversión de excedentes, aunque no se nombre "módulo de mercado". Incluye la base de datos (SQLite + CSV), el esquema, las fórmulas con datos de prueba y las reglas de lenguaje y de seguridad que no se pueden saltear.
---

# Módulo Mercado ficticio para CFO de Bolsillo

## Para quién es esto
Para quien programa la página (o su agente de código). Antes de tocar nada, leé este archivo entero y después **inspeccioná el repo**: quien armó esta skill vio la página publicada pero **no el código fuente**, así que todo lo que diga sobre el stack es una suposición a confirmar.

## Qué es la página hoy (lo que se ve desde afuera)
- Nombre: **CFO de Bolsillo**. Bajada: "Tu caja a 120 días". Descripción: "Tu caja proyectada a 120 días, con avisos y qué hacer con lo que falta o lo que sobra."
- Rutas visibles: `/` (Inicio), `/proyeccion`, `/excedente`, `/datos`, `/demo` (demo del canal WhatsApp). Botón "Cargar datos".
- Se comporta como app móvil: meta tags de app web instalable, viewport con `viewport-fit=cover`, color de tema `#0e1118` (fondo oscuro). Hay navegación inferior con 4 pestañas y link "Saltar al contenido".
- Las meta tags sugieren **Next.js**; confirmalo en el repo. Si es otro stack, adaptá los nombres de archivos pero no las reglas.
- Respetá lo existente: tema oscuro, tipografía, componentes de tarjetas y gráficos que ya haya. No introduzcas una librería de UI nueva si ya hay una.

## Objetivo del módulo
Que el usuario pueda **explorar y entender un mercado de acciones simulado** y vea cómo se relaciona con lo que sobra en su caja. Es un complemento didáctico de la función principal del producto (avisar cuándo va a faltar plata y qué hacer), **no la reemplaza ni compite con ella**. La pantalla Inicio y la Proyección no cambian.

## Reglas que no se pueden saltear
1. **Todo es ficticio y tiene que verse.** En cada pantalla del módulo, una franja fija arriba con el texto: *"Mercado ficticio: empresas, precios y datos inventados para practicar. No es información real ni una recomendación."* No se oculta, no se puede cerrar y no desaparece al hacer scroll en móvil.
2. **Nada de datos reales.** No uses tickers, nombres, precios ni noticias de empresas reales, ni como relleno. Los tickers ficticios terminan en `-F` y deben mostrarse completos.
3. **Nada de "comprá" o "vendé".** Las lecturas son `Atractiva`, `Neutral` y `Con cautela` y siempre se acompañan de "según el puntaje ficticio de esta práctica". No uses verbos de recomendación personalizada.
4. **La reserva operativa nunca se toca.** Ninguna pantalla del módulo puede sugerir usar la reserva ni la caja necesaria para vencimientos próximos. Ver "Conexión con Excedente".
5. **Renta variable solo con horizonte largo.** Si el excedente se necesita en menos de 12 meses (parámetro `HORIZONTE_MIN_RENTA_VARIABLE_MESES = 12`, configurable), el simulador no arma cartera y explica por qué (ver "Conexión con Excedente").
6. **Privacidad.** El módulo no envía a ningún servicio externo los datos de caja del usuario. Si más adelante se agrega una explicación con IA, se le pasan solo datos del mercado ficticio, nunca los de la pyme.
7. **No inventar cifras en pantalla.** Todo número sale de la base o de las fórmulas de este archivo. Si falta un dato, se muestra "—" y no un valor supuesto.
8. **Lenguaje simple, en voseo rioplatense**, sin jerga sin explicar. Cada término técnico tiene un tooltip o un glosario de una línea.

## Los datos
Carpeta que acompaña a esta skill:
```
db/schema.sql              esquema (SQLite; migrable a PostgreSQL)
db/mercado_ficticio.db     base ya generada
db/seed.py                 generador reproducible (semilla fija; regenera la base y los CSV)
db/verificar.py            recalcula las métricas desde las tablas base y las compara con metricas_snapshot (modelo para tu test)
csv/*.csv                  las mismas tablas en CSV
```
**Contenido (corte 30/10/2026):** 12 empresas ficticias de 12 sectores; 521 días hábiles de precios (01/11/2024 a 30/10/2026, sin feriados) en ARS; 8 trimestres de balances por empresa; dividendos; 9 eventos ficticios (ya incluidos en los precios); un índice ficticio **IF12** (equiponderado, base 100) y una tabla `metricas_snapshot` con las métricas ya calculadas.

| tabla | para qué |
|---|---|
| `meta` | aviso legal, fecha de corte, tasa de referencia ficticia (30%), versión |
| `empresas` | ticker, nombre, sector, descripción, acciones en circulación |
| `precios_diarios` | apertura, máximo, mínimo, cierre y volumen por día |
| `indice_diario` | valor y retorno diario del IF12 |
| `fundamentales_trimestrales` | ingresos, EBITDA, resultado neto, deuda neta y patrimonio (millones de ARS) |
| `dividendos` | fecha ex y monto por acción |
| `eventos_ficticios` | noticias inventadas con su impacto en el precio |
| `metricas_snapshot` | **datos de prueba** para validar tus cálculos |

**Cómo integrarlo:** si el proyecto ya tiene base de datos, importá los CSV a tablas con prefijo `mkt_` (por ejemplo `mkt_empresas`). Si no, podés leer el archivo SQLite directamente en el servidor (solo lectura). Los datos son estáticos: no hace falta actualización en vivo. Para regenerarlos: `python3 db/seed.py` (requiere `numpy`).

Dos casos borde a propósito, para que la UI los resuelva bien:
- **DNUB-F** (Delta Nube) pierde plata: su P/E es `NULL`; la UI muestra "Sin ganancias" y no un cero.
- **GLAC-F** (Glaciar Litio) tiene P/E muy alto y mucha volatilidad.

## API propuesta
Solo lectura. Respuestas en JSON, números sin formatear (el formato se hace en el cliente, con separador de miles y coma decimal es-AR).

| método y ruta | devuelve |
|---|---|
| `GET /api/mercado/resumen` | fecha de corte, IF12 (serie y retorno 1m, 3m, 12m), top 3 y bottom 3 por retorno 12m, conteo por lectura |
| `GET /api/mercado/empresas?sector=&orden=score\|ret_12m\|vol\|pe` | lista con ticker, nombre, sector, precio, ret_12m, score_total, lectura |
| `GET /api/mercado/empresas/:ticker` | ficha: datos de la empresa, métricas, puntajes por pilar, últimos 8 trimestres, dividendos, eventos, serie de precios (parámetro `rango=1m\|3m\|6m\|12m\|todo`) |
| `GET /api/mercado/comparar?tickers=A,B,C` | hasta 3 empresas con las mismas métricas lado a lado |
| `POST /api/mercado/simular` | cuerpo: `{monto, horizonte_meses, posiciones:[{ticker, peso}]}`; devuelve métricas de la cartera (ver "Simulador") |

Validá siempre `ticker` contra la tabla `empresas` (nada de armar SQL con texto del usuario) y limitá `tickers` a 3 y `posiciones` a 8.

## Fórmulas (el backend las calcula; la tabla `metricas_snapshot` es tu dato de prueba)
Ventana de 12 meses = **últimos 253 cierres** (252 retornos). Todos los retornos son nominales en ARS.

| métrica | cálculo |
|---|---|
| `ret_1m`, `ret_3m`, `ret_6m` | `cierre[-1] / cierre[-22] - 1`, `[-64]`, `[-127]` (21, 63 y 126 ruedas atrás) |
| `ret_12m` | `cierre[-1] / cierre[-253] - 1` |
| `vol_anual` | desvío estándar muestral (ddof=1) de los log-retornos de la ventana × √252 |
| `max_dd_12m` | mínimo de `cierre / máximo_acumulado - 1` dentro de la ventana (número negativo) |
| `beta_12m` | cov(retorno simple de la acción, retorno del IF12) / var(retorno del IF12), ddof=1, misma ventana |
| `mkt_cap_mm` | precio × acciones en circulación (millones) |
| `eps_ttm` | resultado neto de los últimos 4 trimestres / acciones |
| `pe` | precio / eps_ttm; `NULL` si eps_ttm ≤ 0 |
| `ev_ebitda` | (mkt_cap + deuda neta del último trimestre) / EBITDA ttm; `NULL` si EBITDA ttm ≤ 0 |
| `deuda_neta_ebitda` | deuda neta del último trimestre / EBITDA ttm; `NULL` si EBITDA ttm ≤ 0 |
| `margen_ebitda` | EBITDA ttm / ingresos ttm |
| `roe` | resultado neto ttm / patrimonio del último trimestre |
| `crec_ingresos` | ingresos de los últimos 4 trimestres / ingresos de los 4 anteriores − 1 |
| `div_yield` | dividendos por acción con fecha ex en los últimos 365 días / precio |

"ttm" = últimos 4 trimestres. "Último trimestre" = 2026-Q2.

### Puntaje ficticio (0–100)
Cada métrica se convierte en **percentil dentro de las 12 empresas** (mejor = 100, peor = 0; empates promedian; valores `NULL` puntúan 0; con n valores válidos, `100 × (peores + 0,5 × iguales_sin_contar_a_sí_misma) / (n − 1)`).

| pilar | peso | cómo se arma |
|---|---|---|
| Valuación | 25% | promedio de percentil de `pe` y de `ev_ebitda` (menor es mejor) |
| Calidad | 25% | promedio de percentil de `margen_ebitda` y `roe` (mayor es mejor) |
| Crecimiento | 15% | percentil de `crec_ingresos` (mayor es mejor) |
| Solidez | 15% | percentil de `deuda_neta_ebitda` (menor es mejor) |
| Riesgo | 20% | promedio de percentil de `vol_anual` (menor es mejor) y de `max_dd_12m` (menos negativo es mejor) |

`score_total` = suma ponderada. **Lectura:** ≥ 65 `Atractiva` · 40 a 65 `Neutral` · < 40 `Con cautela`. El puntaje es relativo a este mercado de 12 empresas: aclaralo en pantalla.

**Prueba obligatoria:** un test que recalcule todo desde `precios_diarios`, `fundamentales_trimestrales` y `dividendos`, y compare contra `metricas_snapshot` con tolerancia de 0,01 en puntajes y 0,0005 en ratios. Si no coincide, el error está en tu código, no en la base.

## Pantallas
Agregá una pestaña **Mercado** en la navegación. Hoy hay 4 pestañas y el botón "Cargar": si una quinta no entra cómoda en móvil, ubicá Mercado como sección dentro de **Excedente** (una pestaña interna) y dejá la navegación como está. Decidilo viendo cómo queda en pantalla de 360 px de ancho.

1. **`/mercado` Resumen.** Franja "ficticio". Gráfico del IF12 con selector 1m/3m/6m/12m. Tarjetas "Las que más subieron" y "Las que más cayeron" en 12 meses. Ranking por puntaje con filtro por sector. Cada fila: ticker, nombre, precio, retorno 12m, puntaje, lectura (color + texto, nunca solo color).
2. **`/mercado/[ticker]` Ficha.** Gráfico de precio con marcadores de eventos ficticios (al tocar, muestra el titular y el impacto). Métricas en tarjetas con una línea de explicación. Puntaje por pilar en barras. Tabla de los últimos 8 trimestres. Dividendos. Y la **lectura en palabras** (ver abajo).
3. **`/mercado/comparar`.** Hasta 3 empresas. Tabla con las mismas métricas y resalte del mejor valor de cada fila.
4. **Bloque en `/excedente`: "¿Y si lo que sobra fuera de largo plazo?"** Ver la sección siguiente.

Estados a resolver: cargando, error de red (con botón de reintento), sin resultados por filtro, y valores `NULL` ("Sin ganancias", "—").

## Lectura en palabras (sin IA, con plantillas)
Generala con reglas deterministas a partir de las métricas, para que sea reproducible y no invente nada. Ejemplo de estructura de 3 a 4 frases:
1. **Qué hace y cómo le fue:** "*{nombre}* es una empresa de {sector}. En los últimos 12 meses su precio {subió|bajó} {x}%, {más|menos} que el índice ficticio ({y}%)."
2. **Lo mejor:** el pilar con puntaje más alto, traducido. Ej.: Calidad alta → "gana bastante por cada peso que vende".
3. **Lo que hay que mirar:** el pilar más bajo. Ej.: Riesgo bajo → "su precio se mueve mucho: en este período llegó a caer {dd}% desde un máximo".
4. **Cierre fijo:** "Lectura: {lectura} según el puntaje ficticio de esta práctica."

Si más adelante quieren una versión con IA, que reciba solo estos datos como entrada y tenga la instrucción de no agregar ninguna cifra que no esté en ellos.

## Conexión con Excedente
La pantalla Excedente ya existe y decide qué hacer con lo que sobra. **No cambies su lógica actual**; solo agregá el bloque nuevo al final, y solo si hay excedente calculado.

**Entradas** (las que ya tenga la app): monto del excedente, y la fecha en que se necesita ese dinero (horizonte). Si no existe el dato de horizonte, pedilo con un selector (3, 6, 12, 24 o más de 24 meses).

**Reglas:**
- Si `horizonte < HORIZONTE_MIN_RENTA_VARIABLE_MESES`: no se muestra el simulador. Se muestra: *"Este excedente lo vas a necesitar en menos de {n} meses. Las acciones pueden caer mucho en ese plazo: en este mercado ficticio, la peor caída de un año fue de {x}% (empresa {ticker}). Para plata de corto plazo conviene priorizar liquidez."* El {x} sale del peor `max_dd_12m` de la tabla.
- Si `horizonte ≥ el mínimo`: se habilita el simulador. El monto máximo simulable es el excedente; **nunca** se suma la reserva operativa ni lo comprometido en cheques o pagos próximos.
- Se aclara siempre que **la caja del usuario es real y el mercado es ficticio**: el simulador es práctica, no mueve plata ni se conecta con ninguna entidad.

## Simulador de cartera ficticia
Entrada: monto, horizonte y hasta 8 posiciones con peso (los pesos suman 100%; mostrá el total mientras se edita y bloqueá "Simular" si no suma 100).

Salida, calculada sobre los últimos 253 cierres con rebalanceo diario implícito (cartera de pesos constantes):
- retorno de los últimos 12 meses de la cartera y del IF12 (para comparar);
- volatilidad anual y caída máxima de la cartera;
- peor mes (ventana móvil de 21 ruedas) expresado en pesos sobre el monto simulado;
- "qué pasaría con tu plata": con una caída igual a la caída máxima observada, el monto que quedaría;
- concentración: mayor peso individual y por sector, con aviso si una posición supera el 40% o un sector el 60%.

Cerrá siempre con el texto: *"Resultados pasados de un mercado ficticio. No anticipan nada ni son una recomendación."*

## Orden de trabajo sugerido
1. Inspeccionar el repo: stack, componentes, tema, cómo se lee hoy la base y cómo está armada la navegación.
2. Cargar la base y escribir el test de las fórmulas contra `metricas_snapshot`.
3. API de solo lectura (`resumen`, `empresas`, `empresas/:ticker`).
4. Pantallas `/mercado` y `/mercado/[ticker]`, con la franja de aviso y los estados vacíos o de error.
5. Comparador.
6. Bloque en Excedente con la regla del horizonte, y después el simulador.
7. Revisión final con la lista de abajo.

## Criterios de aceptación
- [ ] La franja "Mercado ficticio" aparece en todas las pantallas del módulo y no se puede ocultar.
- [ ] No hay ningún nombre, ticker ni dato real en el código, la base ni los textos.
- [ ] Las métricas calculadas coinciden con `metricas_snapshot` (test automático en verde).
- [ ] DNUB-F muestra "Sin ganancias" en P/E y no rompe ningún gráfico, orden ni comparación.
- [ ] Con un horizonte menor a 12 meses, el simulador no se habilita y se explica el motivo.
- [ ] El simulador no puede superar el excedente ni usar la reserva.
- [ ] Ninguna pantalla usa verbos de recomendación personalizada ("comprá", "vendé", "te conviene").
- [ ] Se ve bien en 360 px de ancho, con el teclado numérico del móvil y en el tema oscuro actual.
- [ ] Colores con texto asociado (no solo verde/rojo) y contraste suficiente sobre `#0e1118`.
- [ ] Inicio, Proyección, Datos y la demo de WhatsApp funcionan igual que antes.

## Glosario mínimo para la interfaz (una línea por término)
- **Precio / P/E:** cuántos años de ganancia actual estás pagando por la acción.
- **EV/EBITDA:** lo mismo, pero mirando el valor de toda la empresa (incluida la deuda) contra lo que gana operando.
- **Volatilidad:** cuánto se mueve el precio; más alta, más sube y baja.
- **Caída máxima:** la peor caída desde un pico dentro del último año.
- **Beta:** si es mayor que 1, la acción se mueve más que el índice; si es menor, menos.
- **ROE:** cuánto gana la empresa por cada peso que pusieron sus dueños.
- **Deuda neta / EBITDA:** en cuántos años de resultado operativo se podría pagar la deuda.
- **Dividend yield:** lo que paga de dividendos en un año, como porcentaje del precio.
- **Índice IF12:** promedio simple de las 12 empresas ficticias, para comparar.
