# 📗 MyKTAMap — Guía de usuario

> Esta guía está destinada a los usuarios de la aplicación. Explica cómo utilizar cada función, cómo preparar tu teléfono para una salida sobre el terreno, y recuerda las reglas esenciales sobre la discreción de los datos.

---

## 🔴 Advertencias importantes

### ⚖️ Condiciones de uso y advertencia legal

En el **primer arranque**, una página de **condiciones de uso** recuerda que MyKTAMap es una **herramienta de reconocimiento y cartografía**, no una incitación a entrar en lugares prohibidos. Debe ser **leída y aceptada una vez** (casilla de verificación + «Acepto»).

- El acceso a numerosos sitios subterráneos — en particular la **red de las antiguas canteras de París** — está **prohibido** (decreto prefectoral del 2 de noviembre de 1955) y **sancionable con multa** (de 135 € a 375 €).
- Toda intrusión en un lugar privado o prohibido es de tu **exclusiva responsabilidad**.
- El **texto íntegro** (decreto del 2 de noviembre de 1955 + respuesta ministerial del Senado n.º 03710 del 05/06/2025) puede consultarse desde la página, y en cualquier momento mediante el enlace **⚖️ Condiciones de uso** en el pie de página de la pantalla de inicio.

> Las exploraciones clandestinas son peligrosas (extravío, derrumbe, caída en pozos) e ilegales. Respeta la ley, a los propietarios y tu propia seguridad.

---

### 🔐 Confidencialidad de los datos — leer en primer lugar

MyKTAMap es una herramienta de cartografía de campo que puede contener información sensible: **localización precisa de entradas, pozos, pasajes y estructuras subterráneas.**

Estos datos, si se hicieran públicos, podrían:

- Facilitar el acceso de personas no advertidas a lugares peligrosos
- Provocar una sobrefrecuentación que degrade estos espacios frágiles
- Exponer a los usuarios a acciones legales
- Poner en peligro a personas sin equipamiento

**Reglas de obligado cumplimiento:**

- No compartir nunca los archivos de datos (`data/*.json`) fuera de tu grupo de confianza
- No publicar nunca capturas de pantalla que muestren coordenadas o localizaciones precisas
- No dejar nunca la aplicación abierta y visible en un dispositivo accesible a terceros

> Estos lugares pertenecen a su historia. Su preservación depende de la discreción de quienes los frecuentan.

---

### ⚠️ Advertencia sobre el rastreador de posición

El módulo de desplazamiento simulado es **experimental**. Se basa en los sensores inerciales del teléfono (acelerómetro + giroscopio) para estimar tu posición sin GPS — técnica llamada **PDR (Pedestrian Dead Reckoning)**.

**Límites que debes conocer antes de usarlo:**

- La deriva se acumula con el tiempo: cuanto más caminas, más crece el error
- La precisión varía mucho según el teléfono y la forma de sostener el aparato
- Los cambios de altitud (escaleras, escalas, pozos) no se tienen en cuenta
- El rastreador **no sustituye** a una brújula física, a un hilo de Ariadna ni a un mapa de papel
- Bajo tierra, no confíes nunca únicamente en tu teléfono para localizarte

**El rastreador es una ayuda visual, no un sistema de navegación fiable.**

Utiliza siempre el **reajuste manual** (botón 📍) en cuanto identifiques un punto de referencia conocido en el plano.

**Para cualquier salida subterránea, lleva siempre:**
- Un mapa de papel o una versión impresa del plano
- Una brújula física
- Un frontal con pilas de repuesto

---

### 🚨 Alertas públicas (difusión en tiempo real)

La aplicación admite un sistema de **alertas públicas** difundidas por el autor a la comunidad en caso de situación de riesgo (incendio en cataphilia, cierre de acceso, gases tóxicos, etc.).

**Cómo se manifiesta**:

- Al arrancar la app (después del splash), si hay una alerta activa del lado del servidor, se muestra una **ventana roja pulsante** con título, mensaje principal y lista de consignas.
- **Niveles**:
  - 🚨 **emergency** (rojo pulsante + `!` parpadeante) — situación crítica, de lectura imprescindible
  - ⚠️ **warning** (naranja) — información importante, requiere atención
  - ℹ️ **info** (azul) — anuncio neutro, simple notificación
- **Confirmación**: al pulsar **«Entendido»** se guarda la confirmación en tu navegador. La ventana no volverá a aparecer mientras la alerta siga siendo la misma.
- **Si se publica una nueva alerta** (o el autor reedita la misma), volverá a aparecer automáticamente en la siguiente recarga.

**Multialerta**: pueden coexistir varias alertas (p. ej. alerta de migración de dominio + alerta de incendio puntual). Se muestran en cascada al arrancar (prioridad: emergency → warning → info, la más reciente primero). Cada una se confirma individualmente con su propio botón «Entendido».

**Botón 🚨 en el cargador** (a la izquierda de 📖 Documentación) — **color dinámico según el nivel máximo activo**:

| Estado | Aspecto del distintivo 🚨 |
|---|---|
| Al menos 1 alerta `emergency` sin confirmar | 🚨 **rojo pulsante** |
| Si no, al menos 1 `warning` | 🚨 **naranja** |
| Si no, solo `info` | 🚨 **azul discreto** |
| Ninguna alerta activa | 🚨 **gris neutro** |

**Contador**: si coexisten varias alertas sin confirmar, aparece un pequeño círculo rojo con la cifra en la esquina superior derecha del distintivo.

Al pulsarlo, el botón 🚨 fuerza la reaparición de TODAS las alertas activas en cascada (incluidas las ya confirmadas):

| Estado del servidor | Ventana mostrada |
|---|---|
| Alertas activas | Cascada de alertas ordenadas por prioridad |
| Ninguna alerta activa | **Ventana verde sobria** «✅ Ninguna alerta en curso» |
| Sin conexión | Ventana neutra «📡 Verificación imposible — inténtalo de nuevo con red» |

> 💡 Si sigues viendo la alerta en memoria después de varios días pero quieres comprobar el estado oficial, pulsa 🚨 — sabrás de inmediato si la situación sigue vigente o si está resuelta.

> ⚠️ Este sistema está destinado a alertas **importantes para la seguridad de la comunidad**. No sirve para mensajes comerciales ni promocionales.

### 🛡️ Planos revocados (kill-switch antifiltraciones)

Si un plano ZIP **se filtra masivamente** (= ha sido difundido fuera de su grupo de confianza — Telegram público, foro, sitio warez…), el autor puede **revocarlo**: su huella se añade a una lista pública del lado del servidor (`denylist.json`). La aplicación se negará entonces automáticamente a abrirlo en **todos los usuarios**.

**Qué ocurre si descargas por error un plano revocado**:

1. Importas el ZIP en la app (cargador principal O generador «Modificar un plano existente»)
2. **Antes** de abrir el ZIP, la app calcula su **huella SHA-256** (localmente, en tu dispositivo)
3. Si la huella coincide con un plano revocado, se muestra una **ventana roja bloqueante**:
   - Título: «⛔ Plano revocado»
   - **Motivo**: razón textual dada por el autor (p. ej. «Filtración pública constatada el 05/06/2026 en Telegram»)
   - **Fecha de incorporación** a la lista de bloqueo
   - **Huella SHA-256** (12 primeros + 8 últimos caracteres, anti-doxing)
   - Botón «Entendido, eliminar este plano» → el plano se retira automáticamente de tu lista y la página se recarga
4. El plano **nunca llega a abrirse** en tu dispositivo

**Privacidad estricta**:
- ✅ **Ninguna huella se envía al servidor.** Solo se descarga la lista pública de planos revocados, y la comparación se hace al 100 % en tu dispositivo.
- ✅ El autor no sabe qué planos posees (= cero rastreo).
- ✅ La lista `denylist.json` es pública: puedes auditarla tú mismo en `https://myktamap.fr/denylist.json` (ídem instancia pro).

**Caché y propagación**:
- La lista de revocaciones se actualiza al arrancar la app y luego se guarda en caché 24 h.
- En caso de incorporación urgente por parte del autor, la propagación es **inmediata** para todos los usuarios que reabran la app, y de un máximo de 24 h para los demás.
- En caso de **ausencia de red**, la app usa la última lista conocida (= el mecanismo sigue activo sin conexión).

**Limitación asumida**: solo se bloquean las filtraciones **byte-perfect** (= el ZIP exacto). Si un atacante reempaqueta el ZIP con otra herramienta o modifica 1 byte, la huella cambia. Es suficiente para bloquear la **difusión accidental** de un ZIP que circula, pero no una derivación activa intencionada (= fricción máxima aceptable).

> 💡 **Para los autores de planos que quieran revocar un ZIP**: contacta con KARMA (autor de la app) con la huella SHA-256 de tu ZIP (comando: `sha256sum tu-plano.zip`) + un motivo breve. La revocación se aplica del lado del servidor en unos días.

#### 🔄 Auditoría automática al arrancar

Si un plano que **ya habías importado** es revocado por el autor DESPUÉS de tu importación (entre 2 sesiones), la app lo detecta automáticamente en el siguiente arranque:

- ~2 segundos después del arranque, en segundo plano, la app calcula la huella SHA-256 de cada uno de tus planos locales y la compara con la lista pública
- Si hay coincidencia → el plano se **elimina automáticamente** de tu lista
- Se muestra una **ventana naranja** que enumera los planos revocados (nombre + motivo + fecha + huella truncada) + botón «Entendido»
- La huella se guarda en caché en tu lista de planos → los arranques siguientes son casi instantáneos (sin recálculo)

> ✅ **Privacidad**: todo permanece local, igual que en la importación. Ninguna huella se envía al servidor.


---
## 🚀 Primeros pasos

### 🗝️ Acceso restringido — Código comunitario

La aplicación está protegida por una **contraseña única común** a todos los usuarios autorizados. El autor te comunicará el código (foro, mensaje directo, etc.).

> 🌍 En la parte superior de esta pantalla, un selector **FR · EN · ES** te permite elegir tu idioma **desde el primer arranque** (preseleccionado según el de tu navegador) — la pantalla se traduce de inmediato y toda la app lo sigue, tutorial incluido.

**En la primera instalación** (o después de un reinicio completo):
1. El splash se muestra normalmente (3,5 segundos)
2. Aparece una pantalla **🗝️ Acceso restringido** con un campo de entrada
3. Escribe el código → pulsa **🔓 Desbloquear**
4. Si es correcto → la app se carga normalmente y ya no tendrás que volver a escribirlo
5. Si es incorrecto → mensaje rojo, te quedan 4 intentos

**Antes de hacer un reinicio completo**: la ventana de confirmación muestra el código en claro para que puedas volver a escribirlo en el siguiente arranque. **Apúntalo o cópialo antes de pulsar «Reiniciar»**, de lo contrario ya no podrás entrar.

> 🛡️ **Nivel de seguridad**: es una **barrera comunitaria**, no una autenticación real. El código fuente de la app es público en GitHub. Esta puerta sirve para disuadir a los curiosos y delimitar un círculo de usuarios advertidos, no para proteger datos sensibles.

### 📱 Instalar la aplicación en móvil (iPhone/Android)

MyKTAMap puede instalarse como aplicación nativa en el móvil — sin pasar por la App Store / Play Store:

1. Abre `myktamap.fr` en **Chrome/Safari**
2. Pulsa el botón de compartir ↑ en la parte inferior de la pantalla
3. Selecciona **«Añadir a pantalla de inicio»**
4. Confirma — aparecerá un icono en tu pantalla de inicio
5. Inicia siempre la aplicación desde ese icono

> Así la aplicación funciona a pantalla completa, sin la barra del navegador.

### 📥 Instalar la aplicación en PC

MyKTAMap también puede instalarse como aplicación nativa en PC — sin instalar ningún ejecutable.

1. Abre `myktamap.fr` en **Chrome**
2. Pulsa el botón «Instalar» junto a la URL
3. Confirma — aparecerá un icono en tu escritorio
4. Inicia siempre la aplicación desde ese icono


### 🎬 Animación de arranque

Al iniciar la aplicación (apertura de la app PWA, recarga de la página, primer acceso), se muestra una **animación de bienvenida** durante unos 3,5 segundos:

- **Logotipo** MyKTAMap (rosa de los vientos amarilla)
- **Título** y subtítulo
- **Barra de carga** dorada
- **Firma del autor** y mención de licencia

Esta animación **solo aparece una vez por sesión**. Si cambias de plano mediante 🗂️ o ▶️ Reanudar, no vuelve a mostrarse — permaneces en tu sesión activa.

> Para volver a verla, cierra la aplicación y reiníciala desde tu icono de inicio (PWA) o recarga la página (F5 en PC).

### 📦 Cargar un plano

Al arrancar, la aplicación muestra una **pantalla de inicio** que reúne:

- **▶️ Reanudar [nombre]** — relanza el último plano utilizado con 1 clic.
- **📚 Mis planos** — la lista de todos los planos que ya has cargado (servidor o ZIP local), ordenada del más recientemente abierto al más antiguo. Los planos de servidor disponibles se **descubren automáticamente** al arrancar y aparecen aquí.
- **📦 Cargar un plano nuevo** — para añadir un ZIP a tu lista.
- **🏗️ Generar un plano** — abre el generador de planos desde cero.

**Tres maneras de añadir un plano:**

1. **Importar un ZIP local** — arrastra y suelta tu archivo en la zona prevista, o haz clic para seleccionarlo. Después pulsa **Cargar el plano**. El plano se añade automáticamente a tu lista para las próximas veces.
2. **Pulsar un plano ya conocido** — en **📚 Mis planos**, un clic relanza directamente un plano ya abierto (servidor 🌐 o local 💾).
3. **🏗️ Generar un plano** — botón dedicado en la pantalla de inicio para crear un plano desde cero.

> 🔄 **Reimportar un plano que has regenerado* — si el ZIP que importas lleva el **mismo nombre y el mismo autor** que un plano ya presente en tu lista pero una **versión diferente**, la app te pregunta en lugar de acumular un duplicado:
> - **🔄 Actualizar** — la entrada existente se reemplaza (nombre, versión, tamaño, archivo memorizado). Tu **sesión, tus notas y tus enlaces entre planos se conservan**. Las fotos solo se reemplazan si el nuevo ZIP contiene alguna.
> - **➕ Conservar ambos** — las dos versiones conviven en la lista.
> - **Cancelar** (o ✕ / Esc / clic fuera) — no se toca nada. Es siempre la opción por defecto: nunca hay sobrescritura accidental.
>
> A tener en cuenta: si el ZIP tiene **exactamente el mismo nombre Y la misma versión**, actualiza la entrada existente sin preguntar nada. Tampoco hay pregunta para los planos de servidor ni cuando vuelves a seleccionar el archivo de un plano concreto desde tu lista.

### 🗺️ Convertir un archivo SIG (QGIS…) en plano
¿Tienes datos en un programa SIG y quieres explotarlos en MyKTAMap? Suelta tu exportación **directamente sobre la zona «📦 Cargar un plano nuevo» de la pantalla de inicio** — la misma donde ya sueltas tus ZIP: la app reconoce el formato y abre **«Convertir desde un SIG»**. También funciona desde la zona de importación del **🏗️ Generador**.

**Formatos aceptados**: `.geojson`, `.json`, `.kml`, `.kmz` (vectorial). Se recuperan puntos, trazados y zonas.

**No hace falta imagen de plano**: si solo tienes datos vectoriales, la app **genera un fondo en blanco automáticamente ajustado** a las coordenadas de tu archivo — tus anotaciones caen en el lugar correcto. Podrás reemplazar ese fondo por una imagen real más adelante mediante 🏗️ **Modificar un plano**.

**Tus denominaciones se respetan.** Un archivo SIG tiene su propia nomenclatura (`CANALIZACION`, `galeria_tec`, `ZH`…). Una **pantalla de correspondencia** te deja elegir la columna que lleva el tipo, y luego indicar a qué corresponde cada valor en MyKTAMap. Los valores evidentes vienen precargados — compruébalos, no se impone nada. Los valores listados están **separados por familia**: los encontrados en polígonos te proponen tipos de zona, nunca tipos de trazado.

> ⚠️ **Tu archivo debe estar en coordenadas GPS clásicas (WGS84 / EPSG:4326).** En QGIS: *Exportar → Guardar entidades como…* y elige **EPSG:4326** en el campo SRC.

> 📐 **Lambert 93 convertido automáticamente* — si tu exportación de QGIS usa **Lambert 93** (EPSG:2154, el sistema oficial francés: coordenadas en **metros** como 650000 / 6860000, no en grados), la aplicación lo **reconoce y lo convierte** por sí sola. Un aviso te indica cuántas coordenadas se han reproyectado: comprueba que la posición obtenida corresponde a tu sitio antes de continuar. Las **demás** proyecciones (UTM, Web Mercator…) siguen rechazándose — en ese caso vuelve a exportar desde QGIS en **EPSG:4326 (WGS84)**.

> 🗺️ **Levantamientos de canteras: lo que el importador sabe hacer**
> 
> - **Un nivel por planta.** Si tu archivo tiene una columna de nivel (`niveau`, `level`, `etage`…), elígela en «Columna del nivel»: cada objeto conserva su planta, y una vista previa te muestra el reparto **antes** de generar. Marca «Un color por nivel» para que cada planta tenga su tono; sin eso, seis plantas superpuestas se confunden. Puedes **renombrar y recolorear** cada nivel con el botón 🏷️ sin salir de la pantalla. Todo lo que cambies ahí se **conserva en el plano generado**: también los tipos que renombras, ocultas, recoloreas o añades tú mismo. ⚠️ Si la pantalla indica que la leyenda se ha restablecido, un cambio en la correspondencia ha invalidado tus nombres: vuelve a abrir 🏷️ antes de generar.
> - **Cada tipo va donde tú quieras.** La forma de un objeto en el archivo no dice lo que es: un polígono puede ser una zona, un pilar, un muro — o un **frente de explotación**, si quien lo dibujó cerró el contorno. Cada valor puede apuntar a cualquier familia en el desplegable.
> - **La altura del plano se calcula**, solo indicas el ancho. Es lo que garantiza que el plano no se salga del marco: con proporciones libres, el contenido desbordaba. A partir de cierto tamaño aparece un aviso (posible fondo vacío en iPhone, o generación pesada): es un **consejo**, no un bloqueo.
> 
> ⚠️ **Si creaste un plano desde un GPX o un SIG con una versión antigua de la app**: su **escala era incorrecta** (un valor fijo sin relación con el terreno), y por tanto también las distancias medidas en él. Vuelve a generarlo desde el archivo de origen para obtener medidas correctas. Los planos creados a partir de una imagen escaneada no están afectados.


>
> Un archivo en **otra** proyección (UTM, Web Mercator…) será **rechazado**, indicando el número de coordenadas erróneas y la operación a realizar. Es intencionado: aceptar en silencio coordenadas que no sabemos interpretar situaría tu sitio a miles de kilómetros, sin el menor aviso. *(El Lambert 93, en cambio, se reconoce y se convierte — ver justo arriba.)*

**A tener en cuenta**: los huecos (anillos interiores) de los polígonos se ignoran — MyKTAMap no tiene zonas con huecos. Por encima de 20 000 objetos, la importación se rechaza: filtra tu capa en QGIS antes de exportar.

*No admitidos*: Shapefile y GeoPackage. Exigirían bibliotecas pesadas, incompatibles con la promesa «100 % sin conexión, sin instalación». Reexporta a GeoJSON desde QGIS, son dos clics.

### 👤 Perfil de usuario

Un **panel de perfil** se muestra en la parte superior de la pantalla de inicio, justo debajo de la cabecera. Reúne tu identidad visual y estadísticas configurables sobre tu uso de la app.

**Lo que ves en el panel**:

- **Avatar**: foto personal (cuadrada, ~64 px) O inicial coloreada autogenerada si no hay foto. El color de la inicial se elige de forma determinista dentro de una paleta de 10 colores de la línea gráfica — tu avatar se mantiene, por tanto, visualmente estable de una sesión a otra mientras no cambies de apodo.
- **Apodo**: tu alias (modificable). Por defecto, «Cataphile» en el primer arranque.
- **🏅 Rango**: una **insignia** (de *Turista* a *Gran Maestro*) calculada según tu **tiempo de uso** de la app, el **número de planos** explorados y los **km de galería** cartografiados. Se materializa en un **anillo de color** alrededor de la foto + una **medalla** en la esquina + el **nombre del rango bajo tu alias**. El detalle (las 3 métricas + el progreso «Faltan X para el siguiente rango» + una puntuación) está en la ficha de perfil. *(100 % local y lúdico — no desbloquea nada, es solo por gusto.)*
- **🏆 Logros**: **38 logros** por desbloquear. **8 familias × 4 niveles** (🥉🥈🥇👑) — *Cartógrafo* (planos), *Topógrafo* (planos georreferenciados), *Caminante de las profundidades* (km), *Rata de sótano* (tiempo), *Puntilloso* (POI), *Trazador* (trazados), *Zonificador* (zonas), *Constructor* (estructuras) — **+ 6 «🎉 Especiales» de una sola vez**: *Todoterreno* (un poco de todo), *Centurión* (puntuación ≥ 100), *Topo* (has usado el rastreador), *Espeleólogo multinivel*, *Maratón subterráneo* (sesión de rastreador > 4 h), *Completista* (todo lo demás). Un **aviso emergente** te informa al desbloquear, y la cuadrícula **N/38** está en la ficha de perfil. También puedes mostrar tu **puntuación** y tu **número de logros** en las estadísticas del panel de inicio (sección 🎨 *Estadísticas del panel*).
- **Estadísticas compactas** *(visibles a partir de 380 px de ancho de pantalla)* — ahora **configurables** desde la ventana de Perfil (ver más abajo). Por defecto:
  - ⏱️ **Tiempo de sesión**: tiempo transcurrido desde el arranque de la app en esta sesión
  - 💾 **Almacenamiento**: tamaño real de los datos de MyKTAMap guardados localmente (ver más abajo)

> 💡 **Línea gráfica del tema claro**: en modo claro, el fondo del panel de perfil se alinea con las tarjetas «Mis planos» para una integración visual limpia.

#### 🖼️ Fondo de pantalla de la pantalla de inicio

En la ventana **Perfil** (pulsa el panel), abajo del todo antes de los botones de exportación, puedes poner **tu propia imagen como fondo de la pantalla de inicio** en lugar del color del tema.

Tres ajustes, y los tres cuentan:

- **🖼️ Elegir una imagen** — cualquier foto. Se reduce y se recodifica al añadirla, lo que **elimina de paso sus metadatos**, incluido el lugar donde fue tomada.
- **Velo** — oscurece (o aclara, en tema claro) la imagen para que los textos sigan siendo legibles por encima. Al 0 % la imagen queda desnuda, al 100 % recuperas el fondo liso de antes. Por defecto, 55 %.
- **Encuadre ↔ / ↕** — la pantalla **nunca muestra la foto entera**: se amplía para cubrir, y el resto se recorta. En vertical y en un teléfono, una foto apaisada solo deja ver aproximadamente un cuarto de su anchura. Estos deslizadores eligen **qué parte queda visible**. Solo el del eje que sobresale tiene efecto — el otro no hace nada, es normal.

**🗑️ Quitar** devuelve al color del tema.

> 💡 La imagen permanece **en tu dispositivo**, en el mismo almacenamiento que tu avatar. Desaparece si reinicias tu perfil.
>
> ⚠️ **Todavía no viaja** con la exportación de perfil: en un dispositivo nuevo habrá que volver a ponerla.

**Modificar tu perfil**:

Clic en el panel de perfil → ventana **👤 Mi perfil**:

- **✏️ Apodo**: escribe lo que quieras (letras / cifras / espacio). Sirve únicamente para personalizar la visualización local.
- **📷 Foto**: elige una imagen de tu galería. La app la **comprime automáticamente** (512 px como máximo en el lado largo, JPEG calidad 88 %) antes de guardarla en tu dispositivo, para no saturar tu cuota del navegador.
- **🗑️ Reiniciar perfil**: botón de puesta a cero (con confirmación). Vacía el apodo + la foto + los contadores.

#### 📊 Cuadrícula de estadísticas

La ventana de Perfil muestra **6 celdas de estadísticas globales**:

| Celda | Descripción |
|---|---|
| 🗂️ **N planos** | Número de planos en tu registro (servidor + locales) |
| 💾 **N sesiones** | Número total de sesiones guardadas (espacios por plano) |
| ⭐ **N favoritos** | Número acumulado de puntos marcados como favoritos, en todos los planos |
| 📦 **N copias** | Número de copias de seguridad de sesión guardadas en este dispositivo (máx. 10 **por plano** — por encima, los más antiguos se eliminan) |
| 📸 **N fotos POI** | Número de fotos adjuntas a puntos + tamaño total |
| 💾 **N MB de almacenamiento** | **Tamaño real de los datos de MyKTAMap** (todo lo que MyKTAMap ha guardado en tu navegador). Excluye la caché PWA volátil (que no es un dato de usuario). |

#### 📊 Mis planos

Sección **«📊 Mis planos»** bajo la cuadrícula: **tabla progresiva** que enumera cada plano de tu registro con:

- 📍 **POI**: número de puntos (recuento de sesión + recuento incrustado en las capas de datos)
- 🛣️ **Trazados**: número de trazados (ídem sesión + incrustados)
- ↔ **Distancia total**: suma acumulada en m o km si el plano está calibrado (si no, mostrada en píxeles)
- Pie con el **acumulado global** de todos los planos

> ⚠️ **Marcador «parcial»**: un plano que **nunca has abierto en esta versión** aparece con una insignia ⚠️ naranja. Sus capas de datos aún no están en caché → solo están disponibles los recuentos de sesión (locales de la app). **Solución**: abre el plano una vez, la caché se llena automáticamente, y la próxima vez que abras la ventana de Perfil la fila estará completa.

La tabla se construye **secuencialmente** (un plano cada vez) para no saturar la memoria — comportamiento anticaída en móvil para los usuarios con más de 20 planos en el registro.

#### 📊 Reparto por categoría

Sección **«📊 Reparto por categoría»**: **4 gráficos circulares SVG** agregados de todos los planos, que dan una visión global de tu cartografía:

| Gráfico | Desglose |
|---|---|
| 📍 **Puntos por etiqueta** | Todos los puntos (sesión + incrustados) agrupados por etiqueta (pozo de ventilación, acceso abierto, sala, etc.) |
| 🛣️ **Trazados por tipo** | Principal / Secundario / Camino / Unión entre niveles |
| ⬛ **Zonas por tipo** | Agua / Escombros / Derrumbe / Inaccesible |
| 🏛️ **Estructuras por tipo** | Pilares (1.ª / 2.ª masa) / Muros / Frentes de cantera |

El resultado visual es **idéntico** al del gráfico de la página de **Estadísticas globales** de un plano abierto — misma paleta de colores, **pero con una diferencia importante**:

> 💡 **Etiquetas por defecto SIEMPRE**: en esta sección global de la pantalla de inicio se muestran los nombres **genéricos predefinidos** (`Principal`, `Secundario`, `Camino`, `Unión` para los trazados; `Agua`, `Escombros`, `Derrumbe`, `Inaccesible` para las zonas). Si has renombrado un tipo en la leyenda de un plano concreto (por ejemplo «principal» → «carretera de superficie» en tu plano A), ese cambio de nombre **NO aparece aquí** — es intencionado, para mantener una visión coherente entre planos. El nombre local sigue viéndose con normalidad en la ventana de Estadísticas globales **dentro del plano** A.

> 📌 **Limitación de caché**: para los planos **nunca reabiertos recientemente**, solo las anotaciones de **sesión** (guardadas localmente) contribuyen a los gráficos — no las capas de datos incrustadas en el ZIP (los `data/*.json`). Si echas en falta «secundario» / «nivel -1», **reabre el plano una vez**: la caché completa (incluidas las capas de datos incrustadas) se regenerará automáticamente al cabo de unos 800 ms. En tu siguiente regreso a la pantalla de inicio, los gráficos estarán al día.

A medida que abres tus planos y sus capas de datos se cargan, los gráficos se enriquecen automáticamente con los desgloses reales.

#### 🎨 Estadísticas del panel de inicio

Sección **«🎨 Estadísticas del panel de inicio»**: **elige qué estadísticas aparecen** en el panel de perfil de la pantalla de inicio (de 1 a 3 como máximo).

**Conjunto disponible actualmente**:
- ⏱️ **Tiempo de sesión**: tiempo transcurrido desde el arranque de la app
- 💾 **Almacenamiento**: tamaño de los datos de MyKTAMap guardados localmente
- 🗺️ **Planos visitados**: número de planos presentes en tu registro

**Reglas**:
- **Tope estricto de 3 estadísticas**: no puedes activar más de 3, aunque marques más
- **Al menos 1 estadística obligatoria**: no puedes desmarcarlas todas (el panel quedaría con un vacío molesto)
- **Valores por defecto**: `["time", "storage"]` (Tiempo + Almacenamiento) — elección de campo de KARMA

**Actualización instantánea**: el panel de la pantalla de inicio se vuelve a dibujar **en directo** en cuanto marcas o desmarcas, sin necesidad de recargar la página.

#### 💾 Estadística de almacenamiento

La estadística «Almacenamiento» (visible en el panel de inicio + en la cuadrícula de la ventana de Perfil) refleja el **tamaño real de tus datos de MyKTAMap**:

- **Cálculo acotado a MyKTAMap**: se suma únicamente lo que MyKTAMap ha escrito en tu navegador — las claves `myktamap_*` y las 6 bases locales de la app (handles, blobs, copias de seguridad, fotos, etc.). La caché PWA volátil (que contiene el código JS/CSS de la app y NO es un dato de usuario) queda **excluida** del cálculo.
- **Caché de 30 s**: el cálculo se acumula y luego se guarda en caché 30 segundos para no interrogar el almacenamiento en bucle cuando abres y cierras ventanas rápidamente.
- **Descripción emergente**: «Tamaño de los datos de MyKTAMap (LS + IDB)» + la precisión «excluida la caché PWA».

Resultado: el valor es **estable, previsible y refleja de verdad lo que has cartografiado**.

**Importación / exportación del perfil**:

Tu perfil está incluido en la **Exportación avanzada** de las sesiones (pestaña 🎨 Avanzado → sección «Identidad de usuario»). Práctico para transferir tu identidad visual a otro dispositivo. Al importar un perfil:

- Un aviso modal te sugiere **recargar** la página para que el avatar y el apodo se actualicen correctamente en toda la interfaz (cabecera, barra lateral, etc.)

**📄 Los PDF del Modo Historia también viajan**:

La ventana de exportación gana una casilla **📄 PDF del Modo Historia**, **desmarcada por defecto**. Al marcarla, tus documentos salen con el perfil y se **vuelven a colocar al importarlo**, con su nombre y su fecha de origen. Sin ella, un perfil reimportado llegaba con tus notas libres pero **sin los documentos** — la pestaña 📖 Relatos quedaba medio vacía sin que nada lo explicara.

> ⚠️ **Desmarcada por defecto, y por un buen motivo**: un solo plano puede llevar hasta **100 MB** de PDF. El peso estimado aparece junto a la casilla y cuenta en el total de la ventana — por encima del umbral, la app pide confirmación antes de exportar.
>
> 💡 Reimportar dos veces el mismo perfil **no** crea duplicados: cada documento recupera su sitio.

**📦 Perfil completo con los archivos de planos**:

La exportación de perfil puede ahora **llevarse los archivos ZIP de los planos memorizados en la app**. En la ventana de exportación, una sección «📦 Archivos de planos» enumera tus planos memorizados con su tamaño: marca los que quieras llevarte (no hay nada marcado por defecto) — la exportación se convierte entonces en un archivo **`.zip` «perfil completo»** en lugar del JSON habitual. Al importarlo en otro dispositivo, los archivos se **reinyectan y se vinculan a sus planos**: ya no hace falta volver a soltar los ZIP uno por uno.

- **Salvaguarda de tamaño**: por encima de ~50 MB en iPhone/iPad (Safari es frágil con las descargas grandes) o ~500 MB en el resto, un aviso rojo pide una **confirmación explícita** — no se bloquea nada, tú decides.
- **Honestidad sobre el desalojo**: si el navegador ha eliminado un archivo para liberar espacio (la marca «memorizado» puede sobrevivir al desalojo), la exportación te **enumera los planos afectados** en lugar de producir un zip incompleto en silencio.
- En modo **Fusionar** al importar, un plano que ya tiene su archivo en el dispositivo **conserva el suyo**; en modo **Reemplazar**, gana el del perfil. Un fallo de almacenamiento (cuota llena) se señala **por plano**, y el resto continúa.
- Los planos en «reselección» (y las entradas antiguas en «acceso permanente al archivo») no aparecen en la lista: su ZIP vive en tu disco, no en la app — no hay nada que llevarse.

> 🔒 **100 % local**: tu apodo y tu foto permanecen en tu navegador. No se envía nada a ningún servidor. La exportación de perfil es explícita y la controlas tú.

#### 💼 Edición pro — importar una licencia

Si el autor te ha entregado un archivo **`Licence-pro.json`** (por correo, canal privado, etc.) tras una solicitud de licencia profesional, puedes **importarlo directamente** en tu navegador desde la ventana de perfil para activar la edición pro **únicamente en este dispositivo**.

**Sección dedicada en la ventana Mi perfil**:

- **Si estás en modo comunitario** (estado por defecto): aparece un botón **📂 Importar una licencia pro**. Al pulsarlo, se abre el selector de archivos `.json` → seleccionas tu archivo → validación inmediata → aviso de confirmación. El modo pro queda activado: el pie del cargador cambia (✓ Licencia pro activa), el splash muestra «Edición profesional» y las pantallas de acceso retiran el enlace «Licencia pro» (ya redundante).
- **Si hay una licencia local activa**: un botón **🗑️ Retirar la licencia local** permite volver al modo comunitario. La licencia sigue disponible en el archivo original por si quieres reimportarla más tarde.
- **Si hay una licencia de servidor activa** (instancia desplegada por un administrador con `Licence-pro.json` en la raíz del servidor): solo insignia ✓, sin botón — es el administrador del servidor quien decide.

**Formato del archivo**: JSON mínimo `{"instance":"pro","license_hash":"MKTM-LIC-..."}`. Si el hash falta o está mal formado (formato estricto `MKTM-LIC-` + 32 caracteres hexadecimales), el archivo se rechaza con un mensaje de error.

**🆕 Vía de acceso en la primera carga**: si instalas MyKTAMap por primera vez en un dispositivo nuevo (= pantalla de introducción del **código comunitario** al arrancar), bajo el formulario del código encontrarás ahora un segundo bloque separado por «o» con un botón **📂 Importar mi licencia pro**. Al pulsarlo, selector de archivos `.json` → seleccionas tu archivo → si todo es correcto, la app entra **directamente en modo pro** (sin necesidad de introducir el código comunitario). Práctico para los usuarios pro que descubren la app: no hace falta pedir el código comunitario a un tercero, la licencia pro es de por sí un canal de acceso legítimo.

> 🔒 **100 % local**: el archivo de licencia lo lee el navegador y después se guarda en tu almacenamiento local. **Nunca se envía a un servidor**, nunca se transmite. No se añade ninguna conexión de red.

> ⚖️ **Valor jurídico**: el hash `MKTM-LIC-...` que figura en el archivo es **nominativo** — vinculado a un contrato concreto entre el autor y el titular de la licencia. **Su reproducción o su difusión a un tercero no autorizado constituye una infracción contractual** (el autor puede hacer valer sus derechos). El mecanismo del lado del navegador es cosmético: no verifica criptográficamente el hash, es la firma del contrato la que da fe.

### 📚 Gestión de tu lista de planos

La aplicación memoriza todos los planos que cargas, vengan del servidor o de tu disco local.

**En la pantalla de inicio:**

| Símbolo | Significado |
|---|---|
| 🌐 | Plano de servidor (subcarpeta de `data/`) |
| 💾 | Plano ZIP local |
| ✅ | Plano local **memorizado en la app** (recarga instantánea, funciona sin conexión) |
| 🔐 | Entrada antigua con **acceso permanente** (mecanismo retirado el 15/09/2026 — en su próxima reselección el plano pasa a ✅ memorizado) |
| 📁 | Plano local sin persistencia — se requiere reseleccionarlo al cargar |

#### 💾 Hacer que un plano de servidor esté disponible sin conexión

Un plano **local** ya vive en tu navegador: funciona sin conexión sin hacer nada. Un plano de **servidor**, no — y hasta ahora solo sobrevivía gracias a la caché automática de la app, lo que **no bastaba**:

- la app solo guarda un número limitado de archivos recientes, y **un plano grande supera ese número por sí solo**: al cargarse expulsaba sus propias piezas. Sin conexión no tenías un error, sino un mapa **con agujeros**;
- solo se guardaban las teselas que habías **mostrado** — abrir un plano sin ampliar solo guardaba un nivel;
- y **cada actualización de la app lo borraba todo**.

Abre la ficha **ℹ️ Información** de un plano de servidor: una sección **💾 Disponibilidad sin conexión** te propone **descargarlo todo** — imagen, datos y **todas las teselas de todos los niveles de zoom** — en un espacio reservado que **sobrevive a las actualizaciones**.

| Lo que ves | Lo que significa |
|---|---|
| **No descargado** + botón ⬇️ | Solo se guarda lo que has mostrado, sin garantía |
| **✅ Disponible sin conexión** + ↻ / 🗑️ | Está todo. El botón de descarga **ha desaparecido** — se ha convertido en «Actualizar» |
| **⚠️ Incompleto — n de N** + ⬇️ | Descarga interrumpida, o archivos borrados por el navegador: el botón **vuelve** para completar |
| **✅ Disponible, pero n no encontrado(s)** + ↻ | El servidor no ha proporcionado algunos archivos declarados por el plano. La app **te dice cuáles**: el plano se puede usar, y puedes corregir tu despliegue y luego «Reintentar» |

**🔎 Y la app te dice si el servidor ha cambiado**. Un plano descargado se sirve desde tu teléfono, sin volver a pedirlo nunca al servidor — práctico, pero podía quedarse desfasado **sin que nada lo indicara**. Al abrir la ficha, la app comprueba ahora, archivo por archivo, si algo ha cambiado en el servidor y muestra uno de tres veredictos: **⚠️ Actualización disponible**, **✓ Al día** o **Imposible comprobarlo** (sin conexión, o plano descargado antes de esta versión). *Nunca dice «al día» sin haberlo comprobado de verdad.*

> 💡 **El estado se lee de la caché real, no de una casilla memorizada.** Si el navegador hace limpieza en su almacenamiento, la app lo ve y te vuelve a proponer la descarga — en lugar de mostrar «disponible» sobre el vacío y que lo descubras en la cavidad.

**Acciones disponibles** en cada fila:

- **⭐/☆** — fija o desfija el plano al principio de la lista
- **ℹ️** — abre una ventana de **Información detallada** sobre este archivo (id interno, nombre, versión, autor, tipo, archivo de origen, tamaño, persistencia, modo V1/V2/multinivel, preajuste de rendimiento, fechas de incorporación y de apertura), el **✏️ cambio de nombre de visualización** *(nombre local, 40 caracteres como máximo, práctico para diferenciar dos planos homónimos; campo vacío = vuelta al nombre original; el nombre real del plano se sigue usando para las comprobaciones de archivo)*, la edición de las **🏷️ etiquetas**, y — al final de la ventana — el botón **🗑️ Retirar de la lista** *(el ✕ de las filas ha desaparecido: la eliminación pide confirmación aquí, se acabaron los borrados accidentales)*. Retirar un plano no elimina el archivo ZIP de tu disco, pero sí borra el archivo eventualmente memorizado en la app. Si el plano tiene **documentos de historia** (PDF del Modo Historia), la confirmación ofrece una casilla **« Suprimir también sus documentos (X MB) »**, desmarcada: si la dejas así, siguen legibles en 📔 Mi cuaderno → 📖 Relatos.
- **Clic en la fila** — carga el plano

**Botones en la parte superior de la lista:**

- **💾 Exportar mi lista** — descarga un archivo `myktamap_plans_AAAAMMDD.config` que puedes guardar o compartir.
- **📂 Cargar una lista** — importa un archivo de lista exportado previamente. Tres opciones: Reemplazar, Fusionar o Cancelar.

**Filtros de visualización y organización**:

- **🌐 Mostrar los planos de servidor** — marca o desmarca este interruptor encima de la lista para ocultar los planos de servidor descubiertos automáticamente (test1, test2, demos…) y ver solo tus planos personales. **Se conserva** entre sesiones (en este dispositivo). Desmarcarlo no elimina nada — al volver a marcarlo, los planos reaparecen intactos.
- **📁 Carpetas** — a la derecha del título «📚 Mis planos», un selector **Todo | Carpetas** (siempre visible). En modo **Carpetas** la lista se ordena en secciones que creas tú (➕ en la línea del título): «Gironda», «Caliza», lo que quieras, con un **color** por carpeta, mostrado como punto delante del nombre del plano en ambos modos. Un plano está en **una sola** carpeta; los demás quedan en «Sin clasificar», al final. Para guardar: **☑ Seleccionar** uno o varios planos y luego «Mover a…» (la barra queda al principio de la lista), o **arrastrar** la fila sobre la cabecera de una carpeta: con el ratón en PC, o con el dedo mediante una **pulsación larga** (la fila se levanta tras medio segundo; un dedo que se mueve enseguida desplaza la lista, como siempre). Las cabeceras se pliegan; ⋮ en una cabecera = renombrar, color, subir/bajar, eliminar (sus planos vuelven a Sin clasificar, **nunca se elimina un plano**). **🏷️ Regla por etiqueta**: en ⋮, «incluye también los planos etiquetados…» guarda solo los planos con esa etiqueta, los próximos también — y en modo Todo, las fichas marcadas ofrecen «📁 Crear una carpeta desde estas etiquetas». Mover un plano a mano siempre gana a una regla. El **punto** delante del nombre dice cuál de los dos se aplica: **lleno** = guardado explícitamente (a mano, por la importación múltiple o por el servidor), **hueco** = traído por una regla — sigue sus etiquetas, quita la etiqueta y sale de la carpeta. Las carpetas **viajan con tu perfil**; un servidor (ConfAdmin) puede proponer algunas: esas no se renombran ni se eliminan mientras el servidor las declare, pero sigues libre de mover un plano dentro o fuera. La importación múltiple 📦 ofrece «Guardar en:» para todo un lote. El modo Todo es la pantalla habitual, sin cambios.
- **🔎 Filtrar por nombre** — un campo encima de la lista filtra en directo mientras escribes. Es un filtro de visualización puro, que se reinicia la próxima vez que pases por la pantalla de inicio.
- **⭐ Fijar** — la estrella de cada fila sube el plano **al principio de la lista** (entre los fijados se mantiene el orden «último abierto»). Vuelve a pulsarla para desfijarlo.
- **🖼️ Teselado de este plano** — el selector que estaba encima del botón «Cargar este plano» **ha desaparecido**: la app decide sola («Automático»), lo que ya hacía con casi todos los planos. En realidad solo actuaba sobre los planos **no troceados al generarse (V1)** de gran tamaño; en un plano ya troceado, «Desactivado» no cambiaba nada. El ajuste vive ahora en **ℹ️ Información**, y **solo para los planos a los que afecta** — y, a diferencia del antiguo, se **memoriza** para ese plano en lugar de volver a cero en cada arranque.
- **🔒 En una instalación protegida, ninguna licencia pro abre en lugar de la contraseña** — si la instalación ha definido su contraseña, ni **tu propio** archivo de licencia importado ni la licencia proporcionada **por la propia instalación** desbloquean la app: la contraseña se sigue pidiendo. Tu licencia puede activar el **modo pro**, pero el acceso pasa por la contraseña. (Una instalación que **no** tiene contraseña se abre siempre directamente con la licencia.)
- **🔑 La contraseña de la instancia en la pantalla de código** — si la app te la sirve una instancia que ha definido **su** contraseña (asociación, club), es **esa** la que necesitas: en una instancia protegida, el código comunitario no abre. Si quien la despliega cambia o retira su contraseña, la app te la vuelve a pedir **en el siguiente arranque** — pero **sin conexión, tu acceso sigue siendo válido**: un corte de red nunca te deja fuera. ⚠️ *Como el código comunitario, es una barrera **social**, no una autenticación: la huella de la contraseña está en un archivo público.*
- **🔎 «Recuperar los nombres»** — si un gráfico circular todavía muestra un tipo personalizado con su identificador (`cust-…`), aparece un botón debajo del gráfico. Busca el nombre **en tus propios planos**, sin que tengas que abrirlos uno por uno: para un plano de tu servidor, pide su descripción a ese servidor; para un plano local, lee el archivo ya memorizado. **Anuncia cuántos planos va a leer, y solo arranca al pulsar.** Los nombres encontrados se guardan **definitivamente** — la operación no se repite, ni siquiera tras una actualización.
- **🏷️ Filtrar tus estadísticas por etiqueta** — encima de los gráficos circulares del perfil, una fila de etiquetas. **Un clic** conserva solo los planos que la llevan, **un segundo** los excluye, **un tercero** vuelve a cero. **Todos los gráficos siguen el filtro** — ahí está todo el interés: dejar fuera tu atlas departamental para ver lo que has levantado realmente en otros sitios. Si un plano lleva una etiqueta incluida *y* una excluida, **se descarta**: la exclusión siempre gana. Un nuevo gráfico **«Planos por etiqueta»** muestra el reparto, con una parte «Sin etiqueta» que te dice lo que te queda por etiquetar. Este filtro **no se memoriza**: vuelve a cero cada vez que abres de nuevo la ventana.
- **🏷️ Tipos personalizados en las estadísticas** — los gráficos circulares del perfil mostraban tus tipos personales con su identificador interno (`cust-…`) en lugar de su nombre. Su nombre vive **en el plano**: la app lo memoriza en la **primera apertura** de este desde esta versión. Un plano que no se haya vuelto a abrir conserva, pues, su identificador, y una nota bajo el gráfico te lo indica — ábrelo una vez y su nombre aparecerá.
- **🏷️ Etiquetas** — pon etiquetas a tus planos («París 13», «GTech», «por terminar»…) mediante **ℹ️ Información → Etiquetas del plano** (escritura libre, separadas por comas — máximo 12 de 24 caracteres). Se muestran bajo el nombre del plano y, en cuanto un plano tiene etiqueta, aparece una fila de **fichas de filtro** encima de la lista: pulsa una o varias fichas para ver solo esos planos (un plano coincide si lleva **al menos una** de las etiquetas elegidas). Las etiquetas viven **en la app** (un ZIP generado con el campo **🏷️ Etiquetas** del Generador las **propone** al importar, sin sobrescribir nunca las que hayas puesto) pero sí acompañan a la **exportación de perfil** y a la exportación 💾 de la lista.
  - **🌐 Los planos de un servidor pueden llegar ya etiquetados** — si quien los despliega ha rellenado las etiquetas en su lista de planos, se muestran y se filtran como las tuyas, sin hacer nada. **Las tuyas tienen prioridad**: en cuanto editas las etiquetas de un plano, el servidor ya no las toca nunca, ni en el siguiente arranque ni en los posteriores. Y **borrar es una elección**: si vacías el campo, no volverán a aparecer. Para volver a las etiquetas del servidor no hay que hacer nada especial — quita el plano de la lista y se volverá a descubrir con ellas.

> 💡 **Truco** — Si cambias de PC o de teléfono, exporta tu lista en el dispositivo antiguo y luego impórtala en el nuevo para recuperar todos tus planos con un clic. Nota: los permisos de acceso a los archivos no son portables (tendrás que volver a seleccionar los ZIP locales la primera vez en el dispositivo nuevo). Al reseleccionarlos, si proporcionas un ZIP en otro modo (p. ej. tenías este plano en V2 pero el ZIP es un V1), un mensaje de advertencia te lo indica claramente antes de continuar.

### 🔐 Evitar reseleccionar el ZIP en cada apertura

Por defecto, la app **memoriza cada plano en la primera carga**: el ZIP se copia en el espacio local del navegador, sin nada que marcar en la pantalla de inicio. El ajuste vive en **⚙️ Configuración de la pantalla de inicio → «💾 Memorizar el plano en la app en la primera carga»** (activado por defecto; desactivado, el ZIP se pide en cada apertura). En las siguientes aperturas:

- **0 clics**, el plano se carga directamente
- Funciona **sin conexión** (el ZIP está en el navegador, no hace falta localizar el archivo)
- Recomendado en **móvil**

> ℹ️ **El botón «🔐 Autorizar el acceso permanente al archivo» (Chrome/Edge) se retiró el 15/09/2026.** Era redundante: el ZIP se copiaba en la app de todos modos, y la referencia al archivo nunca se usaba. Los planos que la tenían siguen abriéndose; en su próxima reselección pasan a «memorizado».

> ⚠️ **Límites de almacenamiento**:
> - **iPhone (Safari clásico)**: ~50 MB, puede borrarse tras una inactividad prolongada
> - **iPhone (PWA instalada)**: hasta 1 GB, persistente
> - **Android Chrome**: varios GB disponibles
> - **PC**: muy amplio
>
> Para una persistencia máxima en iPhone, **instala la aplicación como PWA** (ver sección 📱) antes de memorizar tus planos.

> ⚠️ Si se supera la cuota, se muestra una advertencia y el plano sigue siendo utilizable, pero pedirá una reselección en cada apertura.

### 🗂️ Descubrimiento automático de los planos de servidor

Si la aplicación está alojada en un servidor con varios planos en `data/` (por ejemplo `data/test1/`, `data/test2/`…), puede detectarlos automáticamente mediante un archivo `data/index.json`:

**Formato mínimo**:
```json
{ "plans": ["test1", "test2"] }
```

**Formato detallado** (recomendado para mostrar los nombres de inmediato):
```json
{
  "plans": [
    { "id": "test1", "path": "data/test1", "name": "Plan Test 1", "version": "V1" },
    { "id": "test2", "path": "data/test2", "name": "Plan Test 2", "version": "V1" }
  ]
}
```

Al arrancar, estos planos aparecen en **Mis planos** marcados como «descubierto» y pueden cargarse con un clic.

### ⚙️ Ventana «Configuración» (cargador)

En la pantalla de inicio, un **botón ⚙️ Configuración** en la cabecera del cargador (junto a 📖 Documentación y 🚨 Alertas) abre una única ventana que reúne todos los ajustes del cargador (teselado, rendimiento, depuración, actualización, reinicio):

> **Orden de las secciones en la ventana (de arriba abajo, idéntico a la interfaz)**:

1. **🖼️ Teselado de la imagen (por plano)** — control segmentado con 5 preajustes (ver detalle más abajo), que elige cómo se trocea en memoria la imagen principal al cargar. Se memoriza **por plano** (un plano en Rendimiento, otro en Calidad, etc.).

2. **🚀 Modo Rendimiento ULTRA (trazados / marcadores)** — 7 interruptores de optimización que **NO** afectan a la imagen (ya cubierta por el teselado anterior) sino a todo lo demás (polilíneas, ventanas emergentes, intersecciones, guardado automático, recorte por ventana visible, límite de alejamiento en móvil). **Ajuste POR PLANO**: marcar ULTRA en un plano ya no afecta a los demás — cada plano parte desactivado mientras no lo marques para él. Ver la sección «🚀 Optimizar tu plano» más abajo para el detalle.

3. **🛠️ Modo Desarrollador** — sustituye a la antigua sección de depuración. Protegido con **contraseña** en la primera activación (con advertencia de responsabilidad). Una vez activo: interruptor **🐛 Registros detallados**, botón **📋 Mostrar los registros** (el búfer, consultable incluso sin plano cargado) y **📚 Documentación técnica** — toda la documentación del proyecto (arquitectura, backlog, matemáticas…) legible dentro de la app (solo en línea). El ajuste de registros de ⚙️ Ajustes en modo mapa se ha retirado: todo se controla aquí.

4. **🔒 Confidencialidad y auditoría** — sección dedicada a la transparencia: registro de red en vivo, documento «¿Qué hace la app en la red?» e interruptor «Modo sin conexión estricto». Ver la sección dedicada más abajo.

5. **🎨 Visualización** — interruptores de interfaz:
   - **🔆 Mantener la pantalla encendida** — impide que tu pantalla se apague automáticamente mientras MyKTAMap esté abierta (Wake Lock API). Útil en salida para no tener que tocar el teléfono cada 30 segundos. Readquisición automática al volver de segundo plano (visibilitychange). El interruptor se oculta automáticamente en los navegadores que no admiten la API (Firefox en particular). El mismo interruptor está también accesible en **⚙️ Ajustes** en modo mapa (ver sección dedicada).

> 📊 **Ver el estado de la memoria** — en esa misma ventana, un botón **«📊 Ver el estado de la memoria»** abre el **inspector**: lo que la app ocupa en tu dispositivo (claves de almacenamiento ordenadas por tamaño, bases de datos, caché de la aplicación, cuota del navegador) y lo que está cargado en ese momento. Un botón **📋 Copiar el informe** genera un texto listo para pegar al informar de un problema.

> ❓ **Botón de ayuda en las ventanas** — pone un pequeño **❓** en la línea de título de las ventanas que tienen una página de ayuda: ⚙️ Ajustes, 📊 Detalles de la sesión, 🧭 menú Rastreador, ⬆️ Guardar, ⬇️ Cargar, ≡ Leyenda, 🔍 Búsqueda, 🚨 Rescate, 📖 Modo Historia, 🏗️ Generador, 📔 Cuaderno, 🌍 Vista OSM, 👤 Perfil, ℹ️ Información del plano. Un toque abre **directamente la página correcta**, sin pasar por el grupo ❓ Ayuda. Desmárcalo si prefieres una interfaz sin ese icono: desaparece al instante, incluso de las ventanas ya abiertas.
>
> 🔔 **Notificaciones** — los pequeños mensajes que aparecen en la parte baja de la pantalla. Tres posiciones: **Todas** (cada acción se confirma), **Esenciales** (**ajuste inicial**; sin los mensajes que confirman algo que acabas de hacer, como «2 planos movidos» o «copiado»; los mensajes de estado se mantienen, sin vibración), **Silencio** (solo lo importante: batería baja, sensores rechazados, errores). Las **alertas del servidor** y las ventanas que te piden una decisión **nunca** se silencian. Al cargar un plano, los mensajes «sesión restaurada, filtros, fotos» salen ahora en uno solo.

> 📔 **Llevar un cuaderno de mis salidas** — cada plano que abres se convierte en una **salida** archivada en 📔 Mi cuaderno (duración, distancia, añadidos, fotos). Desmarcado, la app ya no abre nada por su cuenta y la salida en curso se detiene; lo que ya está en el cuaderno se conserva, y siempre puedes iniciar una cuando quieras desde **📊 Detalles de la sesión**. *(Ajuste trasladado aquí desde ⚙️ Ajustes del modo mapa: vale para todos tus planos, y el cuaderno se abre desde el inicio.)*

> 🌍 **Idioma de la aplicación**: MyKTAMap está traducida a **3 idiomas — Français, English, Español**. El selector de idioma (bandera + nombre completo) se encuentra en **⚙️ Configuración**, en su propia sección **justo después del bloque Incógnito**. El cambio se aplica de inmediato, sin recargar la app. *A tener en cuenta*: la **Documentación** (esta guía) y el **tutorial de bienvenida** existen en los **3 idiomas** — siguen automáticamente el idioma de tu app, y el botón de bandera de la parte superior de la ventana de Documentación te deja cambiar a 🇫🇷 / 🇬🇧 / 🇪🇸 cuando quieras. Solo la **Ayuda integrada** (el 📚 de la barra lateral en modo mapa) sigue estando en francés e inglés: en español se muestra en **inglés por defecto**. En cada cambio de idioma, un mensaje te propone **reiniciar la app** para un cambio 100 % limpio (opcional). 💡 En **modo incógnito**, tu idioma de interfaz **se conserva** (los demás datos, en cambio, se olvidan por completo).

> 💡 La opción «Mostrar los círculos en los cruces de trazados» **no está en la Configuración de la pantalla de inicio** sino en **⚙️ Ajustes en modo mapa** (por plano). Cada plano tiene ahora su propio ajuste — práctico para desactivar los círculos únicamente en tus planos muy densos sin tocar los demás.

6. **📚 Planos de servidor** — casilla **«🚫 No cargar los planos de servidor al arrancar»**:
   - **Desactiva el descubrimiento automático** del archivo `data/index.json` al arrancar la app — la app deja de interrogar al servidor para listar los planos de demostración o los planos públicos alojados.
   - **Oculta el interruptor «🌐 Mostrar planos de servidor»** de la pantalla de inicio (deja de ser útil, puesto que ya no hay nada que mostrar).
   - **Excluye los planos de servidor de las estadísticas agregadas** de la ventana de Perfil → deja de falsear el recuento «Planos visitados» con planos que nunca usas.
   - **Requiere recargar** para surtir pleno efecto (el descubrimiento automático se hace en el splash, no durante la sesión).
   - **Desactivado por defecto** (retrocompatibilidad absoluta — la app sigue descubriendo automáticamente los planos de servidor mientras no marques explícitamente esta casilla).

   > 💡 **Caso de uso**: usas MyKTAMap únicamente con tus propios planos locales y no quieres ver los planos de demostración / prueba del servidor que ensucian tu lista. Marca esta casilla → recarga → tu lista 📚 Mis planos ya solo contiene TUS planos.

7. **🔐 Código de acceso local (PIN / Face ID)** — bloquea la app en cada arranque con un código de 4 a 6 cifras + Face ID / Touch ID si el dispositivo lo admite. 100 % local (nunca se envía por Internet). 5 intentos fallidos = bloqueo definitivo. Ninguna recuperación en caso de olvido. Ver la sección dedicada **🔐 Código de acceso local (PIN / Face ID)** más abajo para el detalle completo (activación, modificación, desactivación, bloqueo).

8. **🔄 Actualización — Forzar la actualización suave** — vuelve a descargar la última versión del código (purga de la caché PWA, conserva tus datos y tus planos). Útil si sospechas que tu app se ha quedado en una versión antigua tras una publicación. **Nunca** toca tus planos, tu sesión activa, tu código comunitario ni tu PIN local. **Confirmación obligatoria antes de lanzarla** (ventana azul que detalla lo que se preserva + necesidad de una conexión a Internet activa).

9. **💥 Reiniciarlo todo (reinicio completo)** — purga total: la caché, todo lo guardado en tu navegador y tus planos. Reinicia el código de acceso comunitario **Y** el PIN local si está configurado. **Se requiere doble confirmación.** Acción irreversible.

**Organización**: **todo está reunido en una única ventana ⚙️ Configuración**, accesible desde la cabecera del cargador. El botón 🏗️ Generar un plano permanece visible directamente en la pantalla de inicio (no en la ventana de Configuración) porque es una acción de creación, no un ajuste.

### 🎚️ Troceado de la imagen — la app decide

**Ya no hay nada que ajustar aquí.** El banner *«🖼️ Teselado para esta carga»*, que estaba justo encima
del botón **▶️ Cargar este plano**, **se ha retirado**: la app trocea automáticamente los planos demasiado grandes para
mostrarse de una sola vez, y eso ya era lo que hacía con casi todos.

> 🩸 **Por qué se ha ido.** Solo servía para los planos **no troceados al generarse** («V1») y de muy
> gran tamaño. En un plano **ya troceado** — el caso habitual, y el método recomendado — «Desactivado»
> **no cambiaba nada**: el plano usa siempre sus piezas. Ocupaba, pues, el lugar más visible de la
> pantalla de carga para un efecto casi nulo. Y **no se memorizaba**: volvía a «Automático» en
> cada arranque de la app — un ajuste que se olvida solo no es un ajuste.

**Dónde ha ido a parar**: a **ℹ️ Información** del plano, y **solo para los planos a los que afecta** — si no
aparece, es que tu plano ya está troceado y el ajuste no tendría ningún efecto. Ahí se
**memoriza para ese plano** y se aplica a todas sus cargas siguientes.

| Opción | Lo que hace |
|---|---|
| 🔄 **Automático** *(por defecto)* | Trocea automáticamente los planos demasiado grandes para mostrarse de una sola vez. **Es la opción correcta en todos los casos.** |
| 💤 **Desactivado** | Sin troceado: la imagen entera de golpe. Calidad nativa en PC, pero ⚠️ **puede bloquear el teléfono** con un plano muy grande — un mensaje te avisa si es el caso. |

> 🩸 **Antes había 5 botones** (🌟 Calidad, 🎯 Equilibrado, ⚡ Rendimiento). Solo ajustaban
> el troceado que hace **el navegador al cargar**, que solo afecta a los planos **antiguos**. En un plano
> **ya troceado al generarse**, no cambiaban **absolutamente nada**, mientras la app mostraba «Más
> nítido. Recomendado en PC de escritorio.». Se han retirado.

> 🩸 **Y «Automático» protegía peor que los demás, siendo el valor por defecto.** Decidía según el
> **peso del archivo** (60 MB), cuando los demás decidían según el **tamaño en píxeles**. Un plano de 100
> millones de píxeles bien comprimido pesa ~15 MB: «Automático» no lo troceaba, y la app podía bloquearse en
> iPhone. Corregido: ahora decide el tamaño en píxeles.

### 🎨 La interfaz en modo mapa

> MyKTAMap utiliza una interfaz en modo mapa **clara, táctil y pensada primero para móvil**. La pantalla de inicio en PC ocupa toda la pantalla, las ventanas se agrandan en pantallas grandes, y el splash muestra la firma KARMA animada + los créditos de las bibliotecas (🍃 Leaflet · 📦 JSZip · 📤 jsPDF · 🧭 Dijkstra).

**Presentación visual**:

- **🌟 Barra de cabecera permanente arriba** (44 px fija):
  - Rosa de los vientos pulsable a la izquierda — vuelta a la pantalla de inicio (con salvaguarda si la sesión se ha modificado)
  - Nombre del plano + versión en el centro, **pulsable** para abrir la ventana **«🗂 Cambiar de plano»** (con tarjeta destacada del plano en curso + lista de recientes + botón «Ver todos mis planos»)
  - **Contadores pulsables** a la derecha: 📍 puntos · 🛣 trazados · ⬛ zonas — al pulsarlos se abre la ventana **«📊 Detalles de la sesión»**, que enumera todos tus elementos con su información
- **📊 Barra de estado abajo** (52 px, se agranda dinámicamente) — reúne permanentemente las medidas en vivo:
  - 📐 Medición simple (si hay ≥ 2 puntos colocados)
  - 📏 Distancia total de los trazados (si el resaltado magenta está activo) — **pulsable para abrir la ventana**
  - 🗺️ Itinerario (distancia + tiempo + modo) — **pulsable para abrir la ventana de Itinerario**
  - 🧭 Rastreador — **brújula LED ENCENDIDA (verde) / APAGADA (rojo)**, siempre visible
  - Si todo está activo y no cabe, el pie **se agranda automáticamente y pasa a la línea siguiente** — ninguna información queda cortada
  - Botón grande ▾▴ a la derecha para reducir o agrandar el pie manualmente
- **Barras laterales unificadas izquierda/derecha** — cada lado es una **única barra vertical continua**:
  - **Izquierda**: ⊞ Capas · − + Zoom · 🏗 Nivel · ≡ plegar · 📚 Doc · ⚙ Ajustes · ⬇ Cargar · ⬆ Guardar
  - **Derecha**: ≡ plegar · 🔍 Búsqueda · ✏️ Edición · 📐 Medición · 🛣 Trazados · ⬛ Zonas · 🧭 Rastreador
  - **Paneles de herramientas**: se abren **centrados en pantalla** (Trazados, Zonas, Estructuras, como el Tracker y los Filtros); la opción « 🪟 Anclar los paneles de herramientas al botón » (⚙️ Configuración) restaura el anclaje.
- **🧭 Brújula de orientación**:
  - En vertical: **abajo a la izquierda**, sobre el pie
  - En horizontal: **abajo centrada** (para no tapar los iconos laterales)
- **Botones ≡ de plegado** en la parte superior de cada barra lateral (▾ desplegado, ▸/◂ plegado) — gana espacio sin detener los modos activos
- **Ventana «📊 Detalles de la sesión»**: un clic en los contadores de la cabecera abre el **panel de control** del plano:
  - Arriba, **✅ Guardado hace N s** (en rojo si el guardado falla)
  - Estadísticas agregadas, y reparto por nivel en multinivel
  - Todos tus puntos (etiqueta, coordenadas, nivel), los trazados por tipo con distancia, las zonas, las estructuras, las fotos
  - Las otras medidas (📐 medición, 🗺️ ruta y sus etapas, 🧭 seguimiento)
  - **📔 Salida en curso**: 🏁 Cerrar, 🧭 Afinar la traza, abrir el cuaderno. **Si no hay ninguna salida en curso**, un botón **📔 Iniciar una salida** abre una en este plano — funciona aunque «Llevar un cuaderno de mis salidas» esté desmarcado en ⚙️ Ajustes, y entonces es la única forma de registrar una. Una sola salida a la vez: mientras haya una en curso, el botón deja paso a 🏁 Cerrar.
  - **⭐ Favoritos**: exportar los de este plano o de todos, importar
  - **📦 Backups recientes** de este plano: ↻ Restaurar, 📆 Snapshot ahora, 🗑️ Vaciar todo — cada eliminación pide confirmación
  - El botón **📊 Estadísticas globales** (informe copiable, CSV, PDF)
- **Ventana «Cambiar de plano» renovada**: tarjeta destacada del plano en curso con distintivo `● ACTIVO`, lista de planos recientes con animación al pasar por encima, y un gran botón azul «📚 Ver todos mis planos» abajo
- **Generador de planos retirado del modo mapa**: sigue accesible **únicamente desde la pantalla de inicio** mediante 🏗️ Generar un plano (la creación ocurre fuera del modo mapa)

### 💾 Guardado automático de tu sesión

Tus **anotaciones en curso** (puntos añadidos, trazados, zonas, mediciones) se guardan automáticamente en segundo plano cada ~1,5 segundos. Así, si cierras la aplicación y la reabres mediante **▶️ Reanudar**, tu trabajo se restaura.

**Cómo funciona:**
- En cada modificación, tu sesión se guarda en el navegador, **en un espacio propio de cada plano**: trabajar en otro plano ya no sobrescribe la sesión del primero
- En el siguiente arranque, si pulsas **▶️ Reanudar [nombre del plano]**, tu sesión se restaura — una **ventana centrada** te lo confirma con el detalle (*«3 puntos · 1 trazado · 2 zonas»*)
- La ventana te ofrece dos acciones: **🗑️ Borrar la sesión** (empezar este plano con una sesión en blanco) o **✓ Continuar** (conservar la sesión restaurada). Pulsar fuera o presionar Esc = Continuar.

**Importante:**
- Cada plano guarda su propia sesión: volver a un plano que dejaste restaura lo que habías dejado en él
- El **recorrido del rastreador** no se restaura (dado que el rastreador es experimental, resucitar un rastro congelado sería engañoso)
- El **💥 Reiniciarlo todo** borra también tu sesión guardada
- Para conservar una sesión importante más allá del guardado automático, utiliza **⬆️ Exportar la sesión JSON** (copia explícita que puedes reimportar más tarde)

### 📔 Mi cuaderno — el historial de tus salidas

El guardado automático anterior conserva **el estado actual** de un plano. El **cuaderno**, en cambio, conserva **la historia**: cada vez que exploras un plano, se archiva una **salida** con su fecha, su duración, la distancia recorrida y lo que has añadido. Borrar una sesión no elimina las salidas ya guardadas en el cuaderno.

**Cómo acceder:** icono **📔 Mi cuaderno** en la pantalla de inicio, dentro de la tarjeta «🧰 Herramientas» (cuadrícula bajo «📦 Añadir un plano», visible también en móvil). No hace falta cargar ningún plano. Desde un plano: ventana **Sesión** → sección **📔 Salida en curso**.

**Qué contiene una salida:**
- la fecha, la **duración** (tiempo realmente pasado en la app, no el tiempo transcurrido) y la **distancia recorrida** con el rastreador,
- el número de **puntos, trazados, zonas y estructuras añadidos**,
- el **recorrido de tu desplazamiento** (minimapa en la ficha),
- las **fotos tomadas durante la salida** (el cuaderno no las copia: apunta a tus fotos existentes — si eliminas alguna, su miniatura pasa a «🚫»),
- una **nota libre** que escribes cuando quieras, incluso semanas después.

**🚶 ¿Salida de campo o 🖥️ trabajo sobre plano?**

El cuaderno distingue por sí solo, y es importante: preparar un plano en casa no es una salida.

- Si te has **desplazado** durante la sesión → **salida de campo**. Basta con un solo **«📍 Estoy aquí»**: afirmas haber pasado físicamente por un punto, así que es una salida, incluso con el rastreador apagado.
- Si solo has **anotado sin moverte** → **trabajo sobre plano**, guardado en una sección plegada aparte, al final del cuaderno.
- Los **totales** de la parte superior del cuaderno (número de salidas, tiempo, distancia) cuentan **solo el campo** — el tiempo dedicado a dibujar en casa no pinta nada ahí.
- ¿La app se ha equivocado? Abre la ficha y pulsa **🚶 Clasificar como salida de campo** (o al revés). Desde un plano, los mismos botones **🚶 / 🖥️** están en la ventana **Sesión**, sección 📔, junto a «Cerrar mi salida». Tu corrección es definitiva, nunca se recalculará.

**📏 La distancia cuando no usas el podómetro**

A menudo navegas sin el rastreador: caminas y, de vez en cuando, pulsas **«📍 Estoy aquí»** sobre un punto. La app **enlaza esos puntos de referencia entre sí** para estimar lo que has recorrido — y lo hace siguiendo las **galerías**, no la línea recta (en una red laberíntica, la línea recta contaría cualquier cosa).

En concreto: sales de **A**, pasas por **C** y luego llegas a **B** → la app cuenta A→C y después C→B.

- Esta distancia se **anuncia siempre como estimada** («820 m, de los cuales 600 estimados»): nunca se hace pasar por una medición.
- ⏱️ **Durante la salida, la cifra es deliberadamente prudente**: la app cuenta en línea recta para que «📍 Estoy aquí» siga siendo **instantáneo** bajo tierra. El cálculo que sigue las galerías se hace **una sola vez, cuando la salida se guarda en el cuaderno** — por eso la distancia **aumenta** en ese momento. En un plano muy grande, la app puede renunciar a ese cálculo final: conserva entonces la distancia en línea recta en lugar de bloquearse.
- 🧭 **El botón «Afinar el recorrido»** (ventana **Sesión**, sección 📔) hace el cálculo **cuando tú quieras**, sin esperar al final: recalcula la distancia **y redibuja el trayecto** siguiendo las galerías entre tus puntos de referencia. El contador de al lado indica cuántos tramos están pendientes. En un plano muy voluminoso, la app avisa de que va a bloquearse unos segundos y te deja decidir.
- ⚠️ **Ese trayecto redibujado es una reconstrucción, no un levantamiento.** La app supone que fuiste de un punto de referencia al siguiente por el camino más corto: un rodeo, una galería explorada y luego abandonada o una media vuelta no aparecerán. Por eso se muestra **únicamente en la ficha de la salida**, con la mención correspondiente — tus **exportaciones GPX/KMZ y el mapa de calor conservan el recorrido realmente registrado**, nunca la reconstrucción.
- Si el podómetro **sí** ha medido entre dos puntos de referencia, es él quien cuenta — nunca los dos a la vez.
- Un **clic en el mapa** para corregir tu posición no cuenta como trayecto, y un **paso de portal** hacia otro plano tampoco.

**¿Cuándo se archiva una sesión?**
- **Automáticamente** al salir del plano (cambio de plano o vuelta a la pantalla de inicio), si se cumple **una** de estas condiciones:
  - **50 m recorridos** (medidos con el podómetro o estimados entre tus «📍 Estoy aquí»),
  - **o** 10 minutos de trabajo real **y** al menos una anotación.
  - Por debajo de eso no se conserva nada — abrir un plano 20 segundos para comprobar un detalle no ensucia el cuaderno.
- **A mano** con **🏁 Cerrar mi salida**: se guarda sin condiciones y empieza otra de inmediato. Práctico para dividir una jornada larga en etapas — y es el gesto seguro si quieres conservar una sesión corta.

**📖 La pestaña Relatos — tus notas y PDF de plano, por fin reunidos**

El **Modo Historia** (nota libre + PDF) vive en la pantalla de un plano: para releer tus notas sobre una cantera, hay que cargar la cantera. La segunda pestaña del cuaderno, **📖 Relatos**, las reúne **todas, de todos los planos, sin cargar nada**:

- la lista muestra cada plano que tenga una nota o un PDF, con un extracto de la nota;
- abrir una ficha muestra la nota **con formato** (Markdown) y permite **modificarla in situ** — es exactamente la misma nota que la del Modo Historia del plano, no una copia;
- los **documentos PDF** del plano aparecen enumerados: clic para abrir, 🗑️ para eliminar, **➕ Añadir un PDF** para adjuntar uno nuevo — todo ello sin cargar el plano.
- 📕 Un PDF **incluido en el ZIP del plano** aparece aquí también, en cuanto hayas abierto ese plano **una vez**: la app guarda una copia en tu dispositivo. Puedes borrarla como un documento tuyo; al reabrir el plano vuelve.

**Conviene saber:**
- El cuaderno **empieza vacío**: no puede reconstruir las salidas anteriores a su llegada, nunca se registraron como tales.
- Todo es **estrictamente local** en tu dispositivo (ningún envío, ninguna cuenta). Cada salida puede eliminarse individualmente desde su ficha.
- Por encima de **500 salidas**, las más antiguas se borran automáticamente.
- El cuaderno **está incluido en la exportación de perfil**: cambiar de dispositivo mediante la exportación de perfil transporta tu historial de salidas.

### 🧙 Generador: asistente paso a paso

El **Generador** (🏗️) te guía ahora **paso a paso**, como un instalador: cada página muestra una sola cosa (nombre, imagen, capas…), los pasos opcionales se **omiten** con un clic, y un **resumen final** te muestra lo que está relleno, omitido o ausente — con advertencias útiles (p. ej. sin georreferenciación GPS, no hay Vista OSM ni exportación KMZ) **antes** de generar. Un ZIP importado rellena previamente todos los pasos: solo tienes que revisarlos. Los usuarios habituales recuperan la antigua vista completa mediante **🗒️ Mostrar todo** (elección memorizada).

### 🔽 Pie de página plegable

La pequeña **flecha** bajo la pantalla de inicio pliega el pie de página (copyright, enlaces, créditos) para ganar espacio — solo queda una línea mínima «© MyKTAMap · versión». Vuelve a pulsar para desplegarlo. Tu elección se memoriza y viaja con la exportación de perfil.

### 🐛 Registros detallados (modo depuración)

El botón **🐛 Registros detallados** de la ventana **⚙️ Configuración** del cargador activa un modo detallado:
- Registros adicionales en la consola (sensores del rastreador, etapas del teselado)
- Visualización de las **cifras técnicas** bajo el selector de Modo de rendimiento (tamaños de tesela, calidad JPEG, umbral de activación)

Útil para informar de un problema o para entender lo que ocurre bajo el capó. Desactivado por defecto. El ajuste también es accesible desde ⚙️ Ajustes > Registros detallados.

### ⚠️ Si la aplicación se cierra bruscamente

En el teléfono, el sistema operativo (iOS / Android) puede **cerrar de golpe las aplicaciones que consumen demasiada memoria**. Cuando eso ocurre, la próxima vez que inicies MyKTAMap aparece una **ventana roja «ATENCIÓN — CIERRE BRUSCO DETECTADO»** justo después del splash para avisarte.

La ventana detalla:
- **Por qué** ha ocurrido (memoria saturada la mayoría de las veces)
- **Cómo evitar que se repita**: cerrar las demás aplicaciones en segundo plano, bajar el modo de rendimiento en el cargador, evitar abrir demasiadas pestañas del navegador en paralelo, mantener el teléfono actualizado y exportar regularmente tu sesión para no perder nada

Si ves esta ventana **con frecuencia**, es señal de que hay que **reducir el modo de rendimiento** (Rendimiento < Equilibrado < Calidad, en orden decreciente de RAM).

### 📡 Uso sin conexión

MyKTAMap funciona **completamente sin conexión** una vez que el plano se ha cargado una primera vez.

La aplicación instala un **componente sin conexión** (un «Service Worker») que guarda automáticamente en caché todos los archivos necesarios (interfaz, imágenes, datos). En la primera carga con conexión a Internet, todo queda guardado localmente.

**Para preparar una salida sin conexión:**

1. Abre la aplicación **antes de salir**, con conexión disponible
2. Carga tu plano completo — en móvil, **marca «💾 Memorizar en la app»** para poder reabrirlo sin volver a seleccionar el archivo
3. Navega unos segundos para que todos los archivos se guarden en caché
4. Ya puedes cerrar la aplicación y pasar a una zona sin cobertura — seguirá funcionando

> Si hay una nueva versión disponible con conexión, la aplicación se actualizará automáticamente en la siguiente carga.

### ⚠️ Si un plano ya no carga

Si pulsas un plano de tu lista y aparece una ventana **«⚠️ Plano no encontrado»**, es que los datos de ese plano ya no están accesibles. Causas típicas:

- **Vaciado de la caché** del navegador (los ZIP memorizados se han eliminado)
- **Importación de una lista desde otro dispositivo** (se ha restaurado la lista pero no los ZIP en sí)
- **Reinstalación de la aplicación** o cambio de navegador
- **Plano de servidor movido o eliminado** (404)
- **Cuota de almacenamiento alcanzada** (el navegador ha purgado los datos automáticamente)

La ventana te ofrece 3 acciones:

- **🔄 Reintentar** (solo planos de servidor) — útil si el servidor estaba temporalmente no disponible
- **📁 Volver a seleccionar el ZIP** (planos locales) — abre tu explorador de archivos para localizar el ZIP. Si el plano estaba memorizado (o en el antiguo «Acceso permanente»), la persistencia se **restaurará automáticamente** tras la nueva selección
- **🗑️ Retirar de la lista** — si ya no tienes el plano, elimina su entrada de tu lista

> 💡 **Consejo**: exporta regularmente tu lista mediante 💾 (icono arriba a la derecha de **📚 Mis planos**) para poder restaurarla en caso de problema.

### 💥 Reiniciarlo todo

Si quieres devolver la aplicación **a su estado inicial** (como en un primer arranque), hay un botón **💥 Reiniciarlo todo** disponible en dos lugares:

- En **⚙️ Ajustes**, desde la aplicación
- En **⚙️ Configuración**, en la pantalla de inicio (cargador)

⚠️ **Esta acción es irreversible** y borra:
- La caché de la aplicación (modo sin conexión desactivado hasta la próxima conexión)
- Tu **lista de planos** (entradas eliminadas)
- Los **ZIP memorizados en el navegador** (perdidos)
- Tus **preferencias** (modo de rendimiento por plano, opciones del rastreador, registros detallados, etc.)

La aplicación pide **dos confirmaciones** antes de ejecutar el reinicio, y te recuerda que **exportes tu lista** previamente si deseas conservarla.

> 📡 **Comprobación de conexión**: antes de la primera confirmación, la aplicación comprueba rápidamente tu conexión a Internet (máx. 5 segundos). Si estás **sin conexión**, una **ventana roja adicional** te advierte de que la aplicación quedará **inutilizable** tras el reinicio (la caché vacía no podrá volver a llenarse sin red). Vuelve a conectarte al wifi o a los datos móviles antes de relanzar el reinicio, o pulsa «Continuar de todos modos» si sabes lo que haces.

> Útil en caso de problema persistente, o para probar la aplicación «como un usuario nuevo» cuando publiques o compartas tu trabajo.

### 🔒 Confidencialidad y auditoría de red

**MyKTAMap es una aplicación 100 % del lado del cliente. Ninguna de tus anotaciones, sesiones, planos o datos personales se envía jamás a un servidor ni a un servicio de terceros.** Y puedes comprobarlo tú mismo.

La sección **🔒 Confidencialidad y auditoría** de la ventana ⚙️ Configuración del cargador te ofrece tres herramientas:

#### 📋 Ver el registro de red

Abre una tabla en tiempo real que registra **todas** las peticiones de red emitidas por la aplicación (método, URL, categoría, estado y, sobre todo, si hay *cuerpo* — es decir, datos enviados).

Puedes:
- **📋 Copiar** el registro en JSON al portapapeles
- **📥 Exportar** el registro a un archivo `.json` (para compartir / archivar / someter a auditoría)
- **🗑️ Vaciar** el búfer

**A vigilar**: si ves aparecer una petición `POST`, `PUT`, `PATCH`, `DELETE`, `sendBeacon`, `WebSocket` o `EventSource`, o una URL externa (categoría en rojo) distinta del ping de conectividad de Google → **contacta con el autor inmediatamente** (Instagram **@karma_kta** o **contact@myktamap.fr**): contradiría la promesa de esta página.

#### 📖 ¿Qué hace la app en la red?

Una ventana que detalla:
- El modelo técnico (PWA pura, sin backend)
- La **lista blanca** completa y nominativa de las URL que la app puede contactar
- Cómo comprobarlo tú mismo con las herramientas de desarrollo de tu navegador (F12 → Red)
- Cómo la Content Security Policy (CSP) del servidor protege adicionalmente

Un botón 📄 te permite abrir la **documentación completa** (`docs/NETWORK_AUDIT.md`) en una pestaña nueva.

#### 🔒 Modo sin conexión estricto (opcional)

Marca esta casilla si quieres una **garantía activa** del lado del navegador: toda petición saliente no incluida en la lista blanca será **bloqueada ANTES de alcanzar la red** (el navegador recibe una excepción, no un tiempo de espera agotado).

Una vez activado:
- Aparece un distintivo naranja `🔒 MODO SIN CONEXIÓN ESTRICTO ACTIVO` en el pie de la pantalla de inicio
- La app sigue funcionando con normalidad (anotaciones, cálculos, exportaciones PNG/KMZ, navegación, multinivel, itinerario, rastreador…)
- Solo se cortan los pings de actualización hacia Internet (pero la app sigue siendo utilizable con su versión actual)

El interruptor es **persistente** (sobrevive a las recargas y al cierre de pestañas) hasta que lo desmarques o hagas un reinicio completo.

> 🛡️ **Nivel de garantía**: es una **triple protección**:
> 1. La arquitectura PWA hace que la recopilación sea técnicamente imposible (no hay backend)
> 2. El módulo de auditoría JS registra + puede bloquear del lado del cliente
> 3. La Content Security Policy del servidor pide al propio navegador que rechace toda conexión no autorizada
>
> Nunca estás obligado a creer al autor bajo palabra: todo es verificable.

---

## 🌍 Vista OSM a pantalla completa — búsqueda integrada

El botón **⛶** del widget Vista OSM se llama ahora **«Abrir el modo OSM»**: el mapa pasa a pantalla completa. Allí aparece una **barra de búsqueda**:

- está colocada **en la línea del título «🌍 Vista OSM»**, así que también está disponible en el widget reducido de la pantalla de inicio;
- busca **un plano** (entre tus planos georreferenciados) o **un punto** (los POI de esos planos) — escribe, pulsa un resultado y el mapa vuela hasta él con un marcador;
- **100 % local**: la búsqueda lee tus propios planos, no se consulta ninguna dirección de Internet;
- solo aparecen los planos **georreferenciados** — un plano sin calibrado GPS es invisible en modo OSM (calíbralo mediante el Generador o los Ajustes).

**📏 Medir en el mapa OSM** — en modo OSM, la herramienta de medición da una **distancia** y una **superficie** haciendo clic en el mapa. Una medición hecha aquí no depende de **ningún calibrado**: las coordenadas ya son geográficas, así que es más fiable que una medición hecha sobre el plano.

**🎯 Coordenadas de superficie** — un clic en el mapa OSM da la **latitud y la longitud del punto situado justo encima**, copiables con un botón. Es lo que se transmite a un equipo que llega por la superficie.

**🗂️ Varios planos a la vez* — el panel «Planos mostrados» del modo OSM permite **superponer tus planos georreferenciados**: ➕ para añadir uno, ▲▼ para elegir cuál va encima o debajo, un deslizador de **opacidad por plano** y ✕ para retirarlo. El plano marcado con ◉ es el «principal» (el del selector superior). Toda esta gestión vive en una **ventana dedicada** que se abre con el botón **≡** de la barra (nada tapa el mapa): ajustes de **visualización globales**, **filtro por etiqueta** (agregado sobre todos los planos mostrados) y la pila de planos. Las antiguas filas bajo el selector (opacidad, casillas, etiquetas) han desaparecido del widget — el mapa gana su altura. Cada línea lleva además **5 minibotones de filtrado propios del plano** (🖼️ imagen, 📍 POI, 🛣️ vías, 🌐 zonas, 🏛️ estructuras) — los ajustes globales de visualización viven en la misma ventana (sección Visualización), y ambos niveles se combinan. Ideal para mostrar dos sectores vecinos sobre un plano de conjunto, conservando por ejemplo solo los POI de uno y la imagen del otro. **🏷️ Y añadir por ETIQUETA**: bajo «Planos», una fila de chips enumera las etiquetas que llevan **al menos dos** de tus planos georreferenciados (las que escribes en tu biblioteca), con un contador «3/12». Un clic **muestra todos** los planos de la etiqueta, un segundo clic **los retira**: imprescindible en cuanto un atlas troceado produce veinte. No distingue mayúsculas («Gironde» y «GIRONDE» son la misma etiqueta) y, por encima de 3 planos mostrados, la app pide confirmación indicando el número: los planos se cargan luego **uno a uno**, y el mapa se llena progresivamente.

En el primer arranque del modo, un mensaje recuerda que mostrar planos completos puede ser más lento en móvil — y aparece un segundo si muestras **más de 3 planos** a la vez.

> 👁️ **Capas ocultas por defecto* — una capa de datos entregada «desmarcada» en el ZIP de un plano (por tanto, oculta al abrirlo en modo mapa) era hasta ahora **totalmente invisible en la Vista OSM**, sin ninguna forma de mostrarla. Ahora se dibuja como las demás: la ocultas o la muestras con los filtros existentes (fichas de categoría globales y por plano, filtro por etiqueta). La Vista OSM de la pantalla del plano no se ve afectada — siempre ha seguido las capas realmente mostradas en tu mapa.

> 🔍 **Nítido al ampliar* — en la vista previa OSM de la pantalla de inicio, ampliar un plano carga automáticamente **teselas más detalladas** (solo la zona que estás mirando, planos teselados V2). Antes, el plano se quedaba borroso al ampliar aunque se viera nítido en modo OSM a pantalla completa. No hay nada que ajustar, y ninguna petición de red adicional: las teselas vienen del archivo del plano, ya presente en tu dispositivo.

> 🎨 **Tus colores en todas partes* — los colores de leyenda que personalizas (≡ Leyenda → ✏️ Modificar) se muestran ahora **también sobre el fondo OSM**: modo a pantalla completa Y vista previa de la pantalla de inicio, y en multiplano cada plano conserva **sus propios** colores. Antes, estas vistas se quedaban con los colores originales (una galería principal repintada de rojo se seguía viendo verde).

## 📖 Modo Historia — Nota libre + PDF del plano

El botón **📖** de la barra superior (a la izquierda de la batería 🔋) abre una ventana de dos pestañas propia de cada plano. Es tu **cuaderno de exploración personal** para cada sitio subterráneo.

### 📝 Nota libre (Markdown)

Un cuaderno de notas de texto que se guarda solo mientras escribes. Ideal para escribir la historia del sitio, anécdotas, tu lista de tareas de exploración o puntos por comprobar. **Una nota por plano**, conservada incluso tras recargar o cerrar la app.

La nota admite **Markdown**:
- Por defecto ves el **resultado formateado** (títulos en color, negrita, listas, enlaces pulsables, citas).
- Pulsa **✏️ Editar** para modificar el código fuente; una pequeña barra de herramientas te ayuda a insertar el formato: **B**old · *I*talic · H1 · H2 · • Lista · 🔗 Enlace · `</>` código · ❝ cita.
- Pulsa **👁 Vista previa** para volver a ver el resultado.
- Todo el MD que escribas (`**negrita**`, `# Título`, `- elemento`…) se interpreta al mostrarlo.

> 🎨 **Iconos de tus planos (v1.97.9)** — si generaste planos entre junio y septiembre de 2026, el icono « Punto de entrada del plano » podía no mostrarse: ahora la app usa el que lleva integrado, y **regenerar el plano** arregla el archivo definitivamente. Además, abrir un plano **regenerado** ya no lanza la veintena de peticiones inútiles que hacían falta para localizar sus iconos.

### 📚 Historia (PDF) — **varios documentos por plano**

Ahora puedes guardar **hasta 10 documentos PDF por plano** (antes: uno solo, y una nueva importación sobrescribía el anterior). Informe de 2019, plano en papel escaneado, artículo de prensa, levantamiento topográfico: todo cabe en el mismo sitio.

- Aparece una **lista de documentos** sobre el visor en cuanto hay varios; pulsa un documento para abrirlo.
- **📥 Importar** añade un documento (ya no reemplaza nada). **🗑️ Retirar** elimina el que se está mostrando.
- El autor del plano puede incluir PDF en el ZIP — **varios** (el Generador acepta ahora una lista de archivos): aparecen al principio de la lista (📕). **Novedad**: su presencia ya no te impide añadir tus propios documentos — antes, la importación quedaba oculta en esos planos.
- 📕 **Esos documentos del plano se copian en tu dispositivo** la primera vez que lo abres: es lo que hace que aparezcan en **📔 Mi cuaderno → 📖 Relatos** sin cargar nada. Puedes **retirarlos** como los tuyos — y si reabres el plano, vuelven (es el plano quien los aporta).
- Salvaguardas: **10 documentos como máximo** por plano, advertencia por encima de **25 MB** acumulados, rechazo por encima de **100 MB**. El espacio ocupado aparece en **Almacenamiento**.
- En iPhone, un botón **↗️ Abrir en una pestaña** saca el documento a pantalla completa nativa si la visualización integrada no está disponible.
- Tus documentos también se enumeran, se añaden y se eliminan desde **📔 Mi cuaderno → 📖 Relatos**, sin cargar el plano.

### 📦 Incluido en la exportación de sesión

Cuando pulsas 💾 Guardar sesión, tu nota libre en Markdown Y **todos tus documentos PDF** del Modo Historia se incluyen en el archivo `.mkmsession.zip`. Al reimportarlo (en otro dispositivo, o para compartir con un compañero), se **añaden** al plano actual — una importación ya no sobrescribe el documento existente. Compatible hacia atrás (un archivo antiguo con un solo PDF sigue siendo legible).

En modo **anonimizado**, la nota y los PDF se omiten deliberadamente del ZIP (pueden contener información personal).

> 🔒 **100 % sin conexión** — la nota y el PDF permanecen en tu dispositivo. No se envía nada a Internet.

---

## 🚨 Modo Salida de emergencia — Encontrar la salida más cercana

> 🧭 Esta herramienta te saca fuera. Si lo que buscas es **situarte** (⛑️ Estoy perdido), una **pantalla muy legible** (modo pánico) o **coordinar equipos** (Modo Rescate), todo eso está más abajo, en el capítulo de Rescate.

El botón **🚨** de la barra superior (entre 📖 Modo Historia y la batería 🔋) lanza un cálculo de itinerario hacia la **salida más cercana** desde tu posición actual.

**Caso de uso**: estás bajo tierra y quieres salir **ahora**, sin pensar (herido, batería que se agota, fallo de iluminación, o simplemente perdido). Pulsas el botón (o lo activas por voz) y la app hace el resto.

### Cómo funciona

1. Pulsa **🚨** en la barra superior **O** di «**salida**» / «**cómo salir**» mediante el comando de voz 🎤.
2. La app examina todos los POI del plano que tengan una etiqueta de salida abierta:
   - `cao` → **C**avidad **A**bierta *(cavage ouvert)*
   - `peo` → **P**ozo con **E**scalones **A**bierto *(puits à échelon ouvert)*
   - `eso` → **E**scalera de **S**ervicio **A**bierta *(escalier de service ouvert)*
   - `entrée` → todo POI marcado como entrada conocida
3. Para cada candidata, la app calcula el **camino navegable real** mediante el buscador de rutas (gestiona los muros Y las uniones entre niveles).
4. Se muestra una ventana compacta con:
   - La salida más cercana + su distancia + su nivel si hay varias plantas
   - Un botón **🧭 Trazar el itinerario** (reutiliza el motor del Modo Itinerario clásico)
   - 🪧 Una vez trazado, el **banner de guiado** te dice qué hacer en cada cruce — **sin ✕** en la salida de emergencia, aunque el guiado esté desactivado. Si te alejas, su botón pasa a **«Salida más cercana desde aquí»** (ver «🪧 Guiado» en el itinerario)
   - Un desplegable **Ver las N demás salidas** ordenado por distancia

### Las versiones cerradas se ignoran deliberadamente

Los códigos `caf` / `pef` / `esf` (cavidades, pozos y escaleras **cerrados**) quedan **excluidos** por no ser transitables en la práctica. Si marcas un POI como cerrado, la app nunca te sugerirá ir hasta él.

Si una salida muestra la mención **« Distancia en línea recta — camino no verificado »** (tarjeta punteada), el pathfinder **no pudo calcular un camino**: la distancia se mide en línea recta. Esas salidas quedan bajo un separador **« No confirmadas »** en la lista, y si **ninguna** salida tiene camino verificado, un banner rojo lo dice antes de nada. Cuidado: esa salida puede ser inaccesible en la práctica (muros, nivel aislado).

### Origen del cálculo

La app parte de tu **posición en ese instante**, sin preguntar, en cuanto el seguimiento está activo **o** te has situado al menos una vez desde que abriste el plano (« 📍 Estoy aquí » en un punto, recalibración en el mapa, llegada por un portal, o una sesión restaurada que contenía una recalibración). La ventana te dice desde dónde parte el cálculo: *« desde tu posición (seguimiento activo) »*, *« desde tu última posición confirmada, hace N min »* o *« desde el punto que has tocado »*.

**El único caso en que la app pregunta « ¿Dónde estás? »**: **nunca** has confirmado tu posición desde que abriste el plano (sigue siendo el punto de partida del plano). Aparece un banner, **tocas tu posición en el mapa** (funciona incluso apuntando a un marcador existente) y el cálculo parte de ahí — ese toque **también recalibra el seguimiento**, así que « Trazar la ruta », « Ir allí » y la pantalla de emergencia XL parten de la misma posición. Antes, en ese caso, la app calculaba en silencio desde la entrada del plano presentándola como tu posición.

### Multinivel nativo

Si estás en el nivel 2 y la salida más cercana está en el nivel 0, el itinerario **atraviesa automáticamente las uniones entre niveles** definidas por el autor del plano. El resultado muestra el nivel de la salida de destino (distintivo «N0», «N1», «N2»…).

### Respuesta háptica

- Salida encontrada → vibración discreta de confirmación (si está activada en Configuración)
- Ninguna salida identificada → vibración de alerta + mensaje explicativo que recuerda las etiquetas esperadas

> 🔒 **100 % sin conexión** — el cálculo se hace en tu dispositivo (filtrado de POI + buscador de rutas del lado del cliente). Ninguna petición de red.

---

## 🗺️ Leer el plano

Una vez cargado el plano:

- **Pellizcar / hacer zoom** para ampliar o reducir la vista
- **Arrastrar** para desplazarse por el plano
- **Pulsar** un icono para mostrar la información del punto
- **Pulsar dos veces** un icono para ampliar rápidamente sobre él con una animación suave (= atajo equivalente al botón «Ir allí» de la ventana emergente)

Los botones **+** y **−** de arriba a la izquierda permiten ampliar y reducir. El control de capas de arriba a la derecha permite mostrar u ocultar capas de información.

> 📐 **Tamaño de iconos adaptativo**: el tamaño de los iconos se adapta automáticamente al nivel de zoom. Al alejar, se encogen para mantener su tamaño proporcional al plano. Puedes desactivar este comportamiento en ⚙️ Ajustes → 🔍 Visualización → «📐 Adaptar el tamaño de los iconos al zoom» si prefieres el comportamiento por defecto de Leaflet (iconos de tamaño fijo en pantalla).

### 🌐 Coordenadas GPS en las ventanas emergentes

Si tu plano está **calibrado por GPS** (ver la sección «Exportar a KMZ geolocalizado» para el calibrado de 2 puntos), aparece un nuevo elemento en las ventanas emergentes de los puntos:

```
📌 Nombre del punto
[Descripción, si la hay]
🌐 48.85661° N, 2.35222° E 📋
```

- Se muestra justo después de la descripción (línea nueva).
- Formato **decimal de 5 cifras** (~1 m de precisión).
- Botón **📋**: copia las coordenadas al portapapeles (formato `lat, lng`, listo para pegar en Google Maps, OsmAnd, un SMS de localización, etc.).
- Visible para los **puntos de sesión Y los puntos de las capas de datos** (pozos, vehículos, etc.).
- **No se muestra** para trazados / zonas / estructuras (son geometrías de varios puntos, no una coordenada única).
- Si el plano **no está calibrado**, la línea no aparece (retrocompatibilidad absoluta).

> 💡 **Caso de uso típico**: en una salida encuentras un pozo no catalogado, lo añades mediante ✏️, pulsas sobre él → puedes copiar al instante sus coordenadas GPS para enviárselas a un compañero por SMS o para situarlas más tarde en Google Earth.

### 🌀 Enlaces entre planos

Puedes **enlazar un punto de un plano con un punto de otro plano** — como un «portal» entre dos redes que se tocan (dos canteras vecinas, o un plano general y un plano de detalle).

**Crear un enlace**:
1. Pulsa un punto (de sesión **o** de capa de datos) → en la ficha, botón **«🌀 Enlazar con otro plano»**.
2. Elige el **plano de destino** en tu biblioteca y después **busca el punto** de llegada (por nombre, id o etiqueta) — no hace falta abrir el otro plano, sus puntos se leen sobre la marcha.
3. El enlace se crea **en ambos sentidos**: aparece en la ficha de los dos puntos.

**En el mapa**: tú decides si un punto enlazado se distingue o no. Por defecto, **nada lo diferencia** (conserva su etiqueta y su icono habituales). Si quieres marcarlo visualmente, dale la nueva etiqueta **«Portal»**: adoptará entonces un **icono de vórtice dedicado** (anillo dorado, espiral azul). *(El antiguo distintivo dorado automático se ha retirado.)*

**🌀 Mis enlaces**: en la **pantalla de inicio**, el botón **«🌀 Mis enlaces»** enumera todos tus enlaces (de todos los planos): estado de cada lado (⛔ si el plano no está en el dispositivo), botón **➜** para ir directamente a uno de los dos puntos, **🗑️** para eliminar. Si los datos de un plano son inalcanzables (servidor fuera de línea…), la app te lo dice claramente en lugar de mostrar «0 puntos».

> 📐 **«Desfase de calibración»* — cada enlace puede mostrar una distancia en metros. **No es una distancia que haya que recorrer.** Los dos extremos de un portal señalan el **mismo punto físico**, visto desde dos planos distintos: si ambos planos están bien georreferenciados, esos dos extremos deberían caer exactamente en el mismo lugar del mapa del mundo. El desfase mostrado mide cuánto se desvían — es decir, **la calidad de tu calibración**. Cuanto menor sea la cifra, mejor. Es el único lugar de la aplicación que puede decírtelo, porque hacen falta **dos** georreferenciaciones para revelarlo.
> 
> - La cifra solo aparece si **ambos** planos están georreferenciados. Si no, **no se muestra nada**: la medición es imposible, y escribir «0» te haría creer en una calibración perfecta.
> - **Sin colores ni umbrales** — deliberadamente. Un desfase de 20 m es enorme en una cantera pequeña y despreciable en una red de 5 km. Se te da la cifra; eres tú quien juzga, con tu escala en mente.
> - En la **Vista OSM** (pantalla completa → 🎚️ Filtros → 🌀), encuentras la misma medición en forma de lista **ordenada de peor a mejor**: lo que merece una recalibración está arriba. Un clic encuadra ambos extremos del enlace en el mapa.
> - Un desfase que te parezca absurdo casi siempre proviene de **la georreferenciación de uno de los dos planos**, no del enlace en sí.


**🕸️ Vista de grafo**: en la misma ventana, cambia entre **📋 Lista ⇄ 🕸️ Grafo** — tu biblioteca dibujada como una **red**: cada plano es una burbuja (distintivos V2/M-LVL, contador de enlaces, anillo dorado en el plano actual, ⛔ atenuado si no está en el dispositivo), y cada frontera es un trazo cuyo **grosor refleja el número de enlaces**. Los planos sin enlaces se agrupan en una franja inferior. **Pulsa una burbuja** para abrir el plano (llegando a su primer portal), **pulsa un trazo** para ver el detalle de los enlaces de esa frontera (la lista se filtra), y **mueve las burbujas** con el dedo para organizar la vista a tu gusto.

**Usar un enlace**: en la ficha del punto, línea 🌀 con el plano y el punto de destino → botón **➜** → confirmación → la app **cambia de plano** (tu sesión actual se guarda automáticamente), **salta al nivel del punto de llegada** (planos multinivel) y te deja **directamente sobre él** (destello azul). Si un filtro de etiquetas oculta el punto de llegada, se muestra una advertencia — tus filtros nunca se modifican.

**📍 Reajuste automático a la llegada**: cuando **atraviesas físicamente** un portal (botón ➜ de un enlace, o «Tomar el portal» de un itinerario entre planos), tu **posición del rastreador se reajusta al punto de llegada** del plano de destino — estás ALLÍ, y la app lo sabe. La búsqueda multiplano y el gestor **no** reajustan (consultar un punto ≠ desplazarse hasta él). Y si hay un itinerario activo en el plano de llegada, se replanifica desde el portal.

**🧭 Itinerario entre planos**: pide un itinerario hacia un punto **de otro plano** conectado por un portal — desde la ventana **Itinerario** (botón «🌐 Destino en otro plano») o desde la **búsqueda multiplano** (botón 🧭 en un resultado remoto). La app compara los portales disponibles por su **coste real**, muestra el trayecto por etapas («① Llegar a 🌀 Pozo norte — 450 m · ② Atravesar · ③ Llegar a la sala — 300 m · Total ≈ 750 m») y **traza el trayecto en tu plano**. Se respetan las evitaciones (zonas, puntos, etiquetas) de **cada plano**. Si resulta imposible (ningún portal, plano sin conexión, destino aislado de la red…), un mensaje te explica **exactamente por qué**.

**🚶 El trayecto sigue tu ritmo**: el botón del resumen se llama «**🗺️ En marcha**» — ya no te teletransporta. **Caminas** tu trayecto (con la validación de etapas «📍 Estoy aquí» y la replanificación al reajustar — **la app pide confirmación** antes de recalcular, ya que el cálculo puede ser largo en planos grandes), y la travesía se propone cuando estás **en el portal**: botón flotante «**🌀 Portal siguiente (X m)**» (se puede cerrar — un «📍 Estoy aquí» sobre el punto-portal lo hace reaparecer), o botón ➜ de la ventana emergente del punto-portal. En cada travesía, la continuación se traza automáticamente al otro lado, hasta el destino.

**🧭 Tus etapas primero**: coloca tus **puntos de paso** en la ventana de Itinerario (curiosidad X, Y…) y luego elige el destino remoto — el trayecto pasa por **todas tus etapas en orden, antes del portal**.

**🌀 A través de varios planos**: marca «**🌀 Itinerario a través de varios planos**» en la búsqueda multiplano (elección memorizada, desmarcada por defecto) → la app puede calcular un trayecto que **atraviese planos intermedios** (A → B → C, hasta 3 travesías), comparando todas las combinaciones de portales por su coste real. Un plano intermedio inalcanzable se descarta (y se nombra si ya no queda ningún camino). Cada llegada traza el tramo del plano y te propone el portal siguiente.

**🔄 Fichas siempre al día**: si renombras o mueves un punto enlazado, las fichas de enlaces (de ambos lados) se **actualizan automáticamente** en la siguiente apertura del plano afectado.

**↩️ Volver atrás**: tras pasar un portal (o un salto de búsqueda multiplano), aparece un botón flotante **«↩️ Volver: <plano>»** en la parte inferior de la pantalla durante 15 segundos — un clic te devuelve al plano **y a la vista exacta** de la que venías (nivel y zoom incluidos). Los saltos se acumulan: encadena 3 portales y podrás hacer 3 vueltas.

**↩️ Botón Volver discreto**: si el botón te molesta, tiene dos comandos nuevos — **[–]** lo reduce a una discreta **minipastilla ↩️** abajo a la derecha (permanece hasta que caduca; un clic vuelve a agrandarla), **[✕]** lo cierra **y olvida las vueltas acumuladas** (cerrar es renunciar a la cadena de vueltas; antes, el botón reaparecía en el siguiente salto). Tu elección [–] se recuerda: una vez reducido, las próximas vueltas llegan directamente como minipastilla.

**Conviene saber**:
- Un punto puede llevar **varios enlaces** (punto «nodo»).
- Si el plano de destino **no está en tu dispositivo**, el enlace se muestra igualmente (⛔) — añade el plano para poder «ir allí».
- **Eliminar un punto** elimina también sus enlaces (de ambos lados).
- Los enlaces **viajan con la exportación de sesión** (se restauran al importarla en otro dispositivo).
- Un plano distribuido («capa de datos») puede incluir enlaces listos para usar: puedes **utilizarlos**, no modificarlos.

### 🔎 Búsqueda multiplano

Busca un punto en **todos los planos de tu biblioteca** de una vez, sin abrirlos uno por uno:

- **Desde la pantalla de inicio**: la **barra de búsqueda 🔎 de la parte superior de la pantalla**, en el centro de la cabecera. **Los resultados aparecen en directo bajo la barra** a partir de 2 caracteres (planos + puntos, con el distintivo del plano) — pulsar un resultado carga el plano y centra el mapa. **Intro** o 🔎 abre la búsqueda completa. En móvil, la barra ocupa la 2.ª línea de la cabecera.
- **Desde el mapa**: abre la búsqueda (Ctrl+K o 🔍) → botón **«🌐 Buscar en todos los planos»** abajo — se conserva lo que estabas escribiendo.

La app lee los puntos (sesión + capas de datos) de cada plano **sobre la marcha**, mostrando el progreso («Lectura 2/5: Oise…»). Cada resultado lleva el **distintivo del plano** en el que se encuentra. Un clic: confirmación (si hay un plano abierto), carga del plano correcto, salto al nivel correcto y centrado en el punto — con el botón ↩️ Volver para regresar.

---

## 🧭 Presentación de la interfaz

La interfaz está organizada en **13 grupos** repartidos en las **dos barras laterales** — izquierda: ⭐ Favoritos, 📚 Ayuda, ⚙️ Ajustes, ⬇️ Cargar, ⬆️ Guardar, ⏪ Historial; derecha: 🔍 Búsqueda, 🧭 Rastreador, 📐 Medición, ✏️ Edición, 🛣️ Trazados, ⬛ Zonas, 🏛️ Estructuras:

| Grupo | Icono | Para qué sirve |
|---|---|---|
| **Favoritos** | ⭐ | Tus puntos marcados como favoritos, a un clic |
| **Ayuda / Documentación / Leyenda** | 📚 | Ayuda, documentación, Ayuda IA, leyenda de iconos |
| **Ajustes** | ⚙️ | Ajustes, calibración de la escala, depuración *(clic directo)* |
| **Búsqueda** | 🔍 | Encontrar rápidamente un punto en el plano *(clic directo)* |
| **Cargar / Importar** | ⬇️ | Importar una sesión o un GPX, editor de datos del plano |
| **Guardar** | ⬆️ | Exportar tu sesión, el plano como imagen o un PDF imprimible |
| **Historial** | ⏪ | Deshacer (`Ctrl+Z`) / Rehacer (`Ctrl+Y`) |
| **Rastreador** | 🧭 | **Menú a pantalla completa**: iniciar / detener el rastreo, recalibrar, Mi posición, bloqueo en trazado, itinerario, repetición, mapa de calor, Modo perdido, Modo Rescate |
| **Medición** | 📐 | Medir una distancia o una superficie, borrar |
| **Edición de puntos** | ✏️ | Añadir tus propios puntos *(clic directo: interruptor ON/OFF)* |
| **Trazados** | 🛣️ | Trazar vías principales, secundarias, caminos, uniones, **calcular la distancia total** |
| **Zonas** | ⬛ | Trazar zonas de escombros, hundimiento, agua o inaccesibles |
| **Estructuras** | 🏛️ | Pilares, muros y frentes de explotación |

> ⚠️ **El Generador de planos NO está en esta barra.** Crear o modificar un plano se hace **desde la pantalla de inicio**, con el botón **🏗️ Generar un plano**: las acciones de creación viven fuera del modo mapa.

> 💡 **Capa «Mis anotaciones»** en la ventana ≡ Filtros (arriba a la derecha del mapa, botón de tres barras): agrupa **todo lo que añades** (puntos, trazados, zonas, estructuras). Desmarcarla oculta todos tus añadidos de golpe sin borrar nada.

**Cómo funciona:**

- **Un solo grupo abierto a la vez** — pulsar otro grupo cierra el anterior
- **Cuando un modo está activo** (medición, adición, vía, zona, reajuste), el grupo **permanece abierto** para que puedas acceder rápidamente a las acciones asociadas (borrar un punto, etc.). El icono principal cambia para reflejar el modo en curso
- **Tocar fuera** del grupo abierto lo cierra automáticamente
- **En móvil en horizontal**, la barra se puede desplazar verticalmente si sobresale de la pantalla

> 🛡️ **Abrir una ventana desactiva la herramienta en curso* — si estás en **medición, edición de puntos, trazado, zona, estructura o reajuste** y abres una ventana por encima (Ajustes, Filtros, Documentación, Modo Rescate…), el modo se desarma solo. Antes se quedaba activo detrás: al cerrarla, tus clics en el mapa iban a parar a la herramienta sin que nada lo recordara, y el botón seguía encendido sin efecto. **El rastreador nunca se corta** (funciona de fondo, no es un modo de clic), y la ficha de un punto que acabas de colocar no interrumpe la edición — puedes encadenar tus puntos con normalidad.

### 🎨 Personalizar la leyenda (renombrar, ocultar, colores, tipos personalizados)

Abre **≡ Leyenda** (grupo 📚 Ayuda / Documentación / Leyenda) y luego **✏️ Modificar**. Para cada tipo de trazado, zona o estructura:

- **Renombrar**: escribe tu propio nombre (p. ej. «Principal» → «Gran galería»). Se muestra en todas partes: leyenda, ventanas emergentes, estadísticas, filtros.
- **🎨 Cambiar el color**: un cuadrado de color por línea — y para las **zonas y pilares/muros, dos cuadrados**: relleno y **borde independiente**. El color se aplica **en todas partes** — mapa, exportaciones de imagen/PDF, KMZ, estadísticas, informe de sesión — de inmediato, sin recargar. Un botón **↺** devuelve el relleno Y el borde originales. Detalles: si no eliges borde, una zona lo deriva automáticamente (versión más oscura) y un pilar/muro conserva su contorno negro (el valor histórico por defecto); la zona *Inaccesible* recoloreada pierde su trama (motivo fijo) a favor de un color liso. Las **entradas personalizadas** se modifican igual, en caliente.
- **👁️ Ocultar**: la casilla retira la entrada **únicamente del recuadro de la leyenda** — no desaparece nada del mapa. Para ocultar objetos del mapa está el panel **🔍 Filtros**.
- **➕ Añadir una entrada personalizada**: crea tus propios tipos (trazado, zona, estructura, icono) con su color. Pasan a ser dibujables desde la barra lateral, y un icono personalizado se propone en el editor de puntos.
- **🗑️ Eliminar un tipo personalizado**: si todavía hay objetos dibujados que lo usan, la app te avisa con el recuento antes de confirmar.

> 🧳 **Tu leyenda viaja con tus exportaciones**: una capa de datos exportada se lleva la definición de los tipos que utiliza, y el generador la recupera al importarla (lo que ya existe en el plano tiene prioridad). El JSON de sesión y el ZIP Avanzado también se la llevan.
>
> ⚠️ **Aviso de «tipos huérfanos»**: si hay objetos que usan un tipo que ya no existe en la leyenda (entrada eliminada, capa antigua), la ventana ≡ Leyenda lo muestra en cabecera con el recuento — esos objetos salen con un color de reserva mientras no vuelvas a crear o reimportar la entrada.

Todo se guarda automáticamente en tu sesión, **por plano**.

### 🔄 Cambiar rápidamente de plano mediante el título

El **título del plano en curso** en la parte superior de la pantalla es **pulsable**: abre la ventana **«🗂 Cambiar de plano»** — tarjeta del plano en curso (distintivo `● ACTIVO`), los **3 últimos planos** abiertos y un botón **📚 Ver todos mis planos** que vuelve al inicio. La **rosa de los vientos 🧭** a la izquierda del título vuelve directamente al inicio.

Al elegir un plano, tu sesión en curso se **guarda automáticamente** (autoguardado + snapshot) antes del cambio: ya no hay aviso de «cambios perdidos». Para cerrar sin hacer nada: ✕, pulsar fuera o **Esc**.

---

## 🔍 Búsqueda unificada

El botón **🔍** de la barra lateral **O** el atajo de teclado **Ctrl+K** (`Cmd+K` en Mac) abre la ventana de búsqueda.

> 🔍 La búsqueda cubre **4 categorías**: 📍 Puntos · 🛣️ Trazados · ⬛ Zonas · 🏛️ Estructuras (pilares / muros / frentes).

### 🔎 Qué se puede buscar

**Para los puntos**:
- El **nombre** (p. ej. «Pozo de ventilación»)
- El **identificador** (p. ej. «PA1»)
- Una **etiqueta** (p. ej. «pa», «peligro», «elec»)
- La **descripción**
- El **estado**

**Para los trazados / zonas / estructuras**:
- La **denominación** (autogenerada, del tipo «Trazado Principal n.º 3» o «Pilar 1.ª masa n.º 1» si no es explícita)
- El **tipo** (`Principal`, `Agua`, `Pilar 1.ª masa`…)
- El **nivel** (en modo multinivel)

**🌐 Coordenadas GPS** *(solo si el plano está georreferenciado)*:
- Pega directamente un par de coordenadas en **formato Google Maps**: `48.680831, 2.158843`
- La app las convierte en una posición sobre el plano mediante el calibrado GPS del plano
- Si **existe un POI en un radio de 50 px** → tarjeta verde «🎯 Ir al punto» con la distancia indicada
- Si no → tarjeta azul «➕ Crear un punto aquí» → abre el formulario ya rellenado en esa posición (= 3 clics en total desde Maps: Ctrl+K · Pegar · Crear)
- Fuera del plano o plano sin calibrar → mensaje de error explícito (naranja / rojo)

La búsqueda **no distingue acentos ni mayúsculas** — escribir «ventilacion» encontrará también «Ventilación».

### ⚙️ Cómo funciona

1. **Abre**: pulsa **🔍** O escribe **Ctrl+K** (Cmd+K)
2. (Opcional) Marca **fichas de filtro** bajo el campo
3. Escribe tu búsqueda en el campo — los resultados aparecen en tiempo real
4. Navega con las flechas **↑** / **↓** o con el cursor
5. Valida con **Intro** o con un clic
6. El mapa se centra en el elemento:
   - **Punto** → círculo naranja alrededor + ventana emergente de información
   - **Trazado** o **frente** → polilínea amarilla discontinua durante 4 s + ventana de información
   - **Zona** o **pilar / muro** → polígono amarillo transparente durante 4 s + ventana de información

> 🔁 **Vuelve a pulsar Ctrl+K** cuando la ventana ya está abierta → se cierra. Práctico para ir y volver rápidamente.

### 🎚️ Filtros (Categoría + Capas + Etiquetas)

Bajo el campo de búsqueda, hasta tres líneas de fichas:

- **Categoría**: 4 fichas `📍 Puntos (N)` · `🛣️ Trazados (M)` · `⬛ Zonas (K)` · `🏛️ Estructuras (L)` con contador por categoría. Púlsalas para activarlas (amarillo) o desactivarlas. Ninguna ficha activa = todas las categorías visibles. Esta línea solo aparece si **al menos 2 categorías tienen contenido** en el plano.
- **Capas**: una ficha por capa (Pozos, Cantera, Mis añadidos, etc.) — **solo para los puntos** (las demás categorías no tienen noción de «capa»).
- **Etiquetas**: una ficha por etiqueta encontrada en los puntos (pa, abierto, cerrado, ventilación, etc.) — **solo para los puntos**.

**Lógica de combinación**:
- **Varias fichas en la misma línea** = O (cualquiera de ellas)
- **Entre líneas** = Y
- El campo de texto sigue siendo un filtro adicional (en Y)

El botón **✕ Borrar los filtros** aparece a la derecha del contador cuando hay al menos una ficha activa. Los filtros se **reinician en cada apertura** de la ventana.

### 📊 Presentación agrupada

Los resultados se **agrupan por categoría** con encabezados:

```
📍 PUNTOS (12)
  ┌─────┐
  │ icn │ PA1 Pozo de ventilación
  │ │ Pozo · ventilación · abierto · x:4843 y:2002
  └─────┘
  ...

🛣️ TRAZADOS (3)
  ┌─────┐
  │ 🛣️ │ Trazado Principal sesión n.º 1
  │ │ Sesión · Principal · Niv. 0 · 8 pts
  └─────┘
  ...

⬛ ZONAS (1)
  ...

🏛️ ESTRUCTURAS (2)
  ...
```

### 🧭 Alcance

La búsqueda cubre:
- **Puntos**: todas las capas de datos del plano (pozos, vehículos, etc.) + los puntos que has añadido (sesión)
- **Trazados**: tu sesión + las vías incrustadas en las capas de datos
- **Zonas**: ídem
- **Estructuras**: ídem

---

## 📍 Rastreador de posición

> Todos los botones del rastreador se encuentran en el grupo **🧭 Rastreador** de la barra lateral.

### 🧭 Menú Tracker (modal a pantalla completa)

El botón **🧭 Rastreador** abre un **modal a pantalla completa de fichas grandes**, ordenadas en tres secciones: **Seguimiento**, **Herramientas**, **Emergencia**. Cada ficha cierra el modal al actuar.

**Fichas disponibles**:

| Icono | Acción |
|---|---|
| **▶️** / **⏹️** | Iniciar / Detener el seguimiento (el icono cambia dinámicamente según el estado) |
| **🧭** | Brújula (widget de rosa de los vientos) |
| **📍** | Reajuste de posición |
| **🎯** | **Mi posición** — vuelve a centrar el mapa en ti |
| **🔓** | **Suspender el bloqueo sobre trazado** — temporalmente (30 s → 10 min) |
| **🗺️** | Calcular un itinerario |
| **🗺️** | **Mapa orientado** — el mapa gira contigo durante el seguimiento |
| **🪧** | **Guiado del itinerario** — Auto / Nunca (banner «En 40 m, girar a la izquierda») |
| **🎬** | Repetición de la sesión del rastreador |
| **🔥** | Mapa de calor — ver la sección dedicada |
| **⛑️** | Estoy perdido — **botón de fondo ROJO** (señal de peligro) |
| **🚨** | Modo emergencia XL — **botón de fondo ROJO** (señal de peligro) |
| **🚨** | Modo Rescate — planes de búsqueda (equipos + zonas), **fondo ROJO** |

> 🚨 **Las 3 fichas de emergencia (⛑️ Estoy perdido, 🚨 Modo emergencia XL, 🚨 Modo Rescate) forman la sección Emergencia, abajo, sobre fondo rojo vivo.** El botón **🚨 Salida de emergencia** (salida más cercana) está en la **barra superior**, a un toque.

> 🧭 **Barra inferior**: el indicador 🧭 muestra **ON · 👣 pasos · distancia** en directo durante el seguimiento, y **un toque abre el menú Tracker**. Al iniciar el seguimiento, la ventana de aviso propone **🔆 Mantener la pantalla encendida** (premarcado): una pantalla que se apaga son pasos perdidos. El botón **≡ Filtros** lleva una insignia con el número de filtros activos (niveles incluidos); al recargar un plano, un mensaje te dice si se han restaurado filtros. En **📊 Detalles de la sesión**, la primera línea dice **«✅ Guardado hace N s»** (en rojo si el guardado falla).

> 🆕 **Sobre el terreno**:
> - **🎯 Mi posición**: vuelve a centrar el mapa en tu posición actual (útil después de haber navegado por otra parte del plano).
> - **🔓 Suspender el bloqueo sobre trazado**: si el «bloqueo sobre trazado» (navegación inteligente) está activado y **sales de la red de galerías** (p. ej. al entrar en un sótano), puedes desactivarlo temporalmente (**30 s / 1 min / 10 min / hasta reactivación**) sin pasar por los ajustes. Una **cuenta atrás 🔓 aparece en la barra inferior**, junto al indicador del rastreador ENCENDIDO/APAGADO; púlsala para reactivarlo (se pide confirmación).
> - **⚙️ Ajustes avanzados**: en ⚙️ Ajustes → *Navegación y rastreador*, la **tolerancia lateral** y el **peso del rumbo** del bloqueo son ajustables (para adaptar el comportamiento a las uniones). El tamaño de un paso, el umbral y el tiempo de espera están ahora **acotados** para evitar valores aberrantes. ⚠️ Ajustes para expertos — configura primero la escala m/px del plano.

### ▶️ Iniciar el seguimiento

Pulsa **▶️** para empezar.

**En el primer arranque de la sesión**, aparece una ventana de advertencia para recordar que el rastreador es un **módulo experimental**: sirve para validar el calibrado / la detección de pasos / la fórmula del rumbo, **no para localizarse de verdad**. Pulsa **«Entendido — Iniciar»** para continuar (la ventana no volverá a aparecer hasta la siguiente recarga de la página). En móvil se muestra a continuación la solicitud de permiso de iOS / Android para los sensores — acéptala.

Aparece un icono en el plano en tu posición de partida. Se desplaza a medida que caminas, y un trazado registra el camino recorrido.


> #### 🧭 «Mapa orientado» — el mapa gira contigo
>
> En el menú 🧭 Rastreador, el mosaico **🗺️ Mapa orientado** cambia el comportamiento del mapa durante el seguimiento: en lugar de que el icono gire sobre un mapa fijo, **es el mapa el que gira**, para que tu dirección de marcha apunte siempre hacia la parte superior de la pantalla (como un GPS de coche).
>
> - **Desactivado por defecto**, y tu elección se recuerda en este dispositivo.
> - Solo gira **durante el seguimiento**: al detener el rastreador, el mapa vuelve a su posición normal.
> - El mapa **te sigue**: si lo desplazas a mano para mirar otra zona, aparece un botón **🎯 Recentrar** para volver sobre ti (también aparece sin este modo, en cuanto tu posición sale de la pantalla).
> - Los textos siguen siendo legibles: las medidas y las fichas de puntos no se ponen del revés con el mapa.
> - El mapa se endereza solo en cuanto eliges una herramienta que necesita tocar el mapa (medir, dibujar, recolocar) o abres un modo a pantalla completa.
>
> ⚠️ La rotación sigue tu brújula: **cerca de grandes masas metálicas** (raíles, armaduras, estructuras) puede volverse aproximada, como el resto del rastreador.

> 🧭 **Icono direccional**: durante el seguimiento activo, el icono (cono azul + punto blanco, estilo GPS) **gira en tiempo real para apuntar en la dirección de la marcha** — calculada a partir del rumbo del teléfono (la misma fuente que la brújula 🧭). En reposo (rastreador detenido o solo reajuste), el icono apunta al Norte (posición neutra). Lleva suavizado integrado para evitar el temblor.

Pulsa **⏹️** para detenerlo.

> ⚠️ **Importante**: la deriva acumulativa es inevitable. Reajusta tu posición manualmente (📍 más abajo) cada ~50 m sobre un punto reconocido del plano. Las armaduras metálicas de las canteras y galerías falsean mucho el magnetómetro del teléfono — una brújula física de verdad sigue siendo indispensable.

### 🧭 Brújula — comprobar la coherencia del rumbo

El botón **🧭** del grupo **🧭 Rastreador** muestra una **rosa de los vientos flotante** arriba a la izquierda del mapa (bajo los botones de zoom). La rosa contragira en tiempo real para que la **N apunte siempre al Norte real**.

> 🧭 La rosa dedicada a la brújula muestra **N/S/E/O marcados claramente** + una flecha roja sobre el Norte, para una lectura fácil. El logotipo de MyKTAMap se sigue usando en el splash y el cargador (identidad visual).

**¿Cómo comprobar que todo es coherente?**

Sujeta el teléfono en horizontal en la mano, con la pantalla frente a ti y el **borde superior del teléfono en tu dirección de marcha** (postura «brújula»). Al girar sobre ti mismo:

| Dirección de marcha | La N de la rosa debe estar… |
|---|---|
| Norte 🧭 | Arriba (12 h) |
| Este ➡️ | A la izquierda (9 h) |
| Sur 🧭 | Abajo (6 h) |
| Oeste ⬅️ | A la derecha (3 h) |

Si la orientación es coherente, el rastreador registra correctamente tus desplazamientos. Si no, sospecha de una perturbación magnética (armaduras, chatarra, suelo) — reajusta mediante 📍 en cuanto puedas y limita la confianza en el trazado.

> 🧭 La brújula y la rotación del icono del rastreador funcionan correctamente en **modo horizontal** (teléfono en apaisado) y en **vertical invertido**: reajuste instantáneo en cuanto giras el teléfono, y la N permanece arriba visualmente sea cual sea la orientación. Las 4 orientaciones están cubiertas.

**Pulsa el widget** para abrir una **vista ampliada** a pantalla completa (rosa de 240 px + punto cardinal en grande + ángulo exacto). Práctico para validar de lejos o hacer una demostración. Se cierra con ✕, Esc o pulsando fuera.

El widget sigue visible incluso con el rastreador detenido — puedes usarlo para validar la brújula sin iniciar el seguimiento. Pulsa ✕ en el widget para cerrarlo del todo.

### 📍 Reajustar tu posición

La posición calculada deriva inevitablemente. En cuanto reconozcas un punto de referencia en el plano:

1. Pulsa **📍** — el botón se enciende en verde
2. Pulsa el punto del plano correspondiente a tu posición real
3. El icono se desplaza al lugar elegido y el trazado vuelve a empezar de cero
4. El modo de reajuste se cierra automáticamente tras el clic y el icono direccional (cono azul) recupera el mando — ya no hace falta volver a pulsar 📍 para desactivar el modo

> Solo puede haber un modo activo a la vez: medición, adición de punto, trazado de vía o reajuste.

### 🎬 Repetición de la sesión del rastreador

El botón **🎬** del grupo **🧭 Rastreador** abre la ventana **Repetición**. Te permite **reproducir tu sesión de seguimiento** desde el principio, con una línea de tiempo interactiva y exportación a CSV.

**Cómo funciona**:

- Mientras haces seguimiento, la app registra internamente una **línea de tiempo**: para cada paso PDR aplicado, cada reajuste manual y el instante de inicio, guarda `(marca_de_tiempo_epoch_ms, x_plano, y_plano, tipo)`.
- Al pulsar 🎬 se abre una ventana a pantalla completa con:
  - **Deslizador de línea de tiempo** (izquierda → derecha = inicio → fin)
  - Botones **⏮ Reiniciar · ▶️ Reproducir · ⏸ Pausa · ⏭ Fin**
  - Selector de **velocidad**: 0,5× · 1× · 2× · 5× · 10×
  - Botón **💾 Exportar CSV**
  - Botón **⛶** para cambiar a modo compacto (panel inferior) que libera el mapa
- Al pulsar **▶️ Reproducir**, la ventana **pasa automáticamente a modo compacto** — ves el mapa en grande mientras el marcador amarillo repite tus pasos. El rastro (línea) se alarga a medida que avanza.

**Atajos de teclado**:

| Tecla | Acción |
|---|---|
| Espacio | Reproducir / Pausa |
| ← | Retroceder 1 s |
| → | Avanzar 1 s |
| Esc | Cerrar la ventana |

El botón **💾 Exportar CSV** produce un archivo `.csv` de 5 columnas (o 6 en multinivel):

```
timestamp_ms_epoch,delta_ms_since_start,x_plan,y_plan,type[,level]
```

- `type` = `start` (inicio del seguimiento), `pdr` (paso PDR aplicado), `recalage` (reajuste manual)
- Se puede abrir con Excel / LibreOffice / Numbers / Python pandas / R / etc.

**Caso de los reajustes**: un reajuste = teletransporte. Visualmente, el rastro salta (no hay línea entre el punto N y el N+1 si el tipo es «recalage») para no mostrar una línea recta que no tiene realidad geográfica.

**Reinicio**: la línea de tiempo se pone a cero al cambiar de plano o al recargar (solo en memoria).

### 🔥 Mapa de calor — densidad de paso

El botón **🔥 Mapa de calor** del panel **🧭 Rastreador** abre una ventana que dibuja un **mapa de densidad** sobre tu plano. Práctico para visualizar de un vistazo las **zonas más frecuentadas** (pasos clave) frente a las poco utilizadas.

> 📌 **Pertinencia**: el mapa de calor se apoya en una interpolación a lo largo de los segmentos + una normalización por histograma + filtros sobre la línea de tiempo del rastreador, para reflejar fielmente la frecuentación real.

#### 🗂️ 6 fuentes seleccionables (combinables)

Tú eliges qué contribuye al calor mostrado:

| Fuente | Contenido |
|---|---|
| 🧭 **Línea de tiempo del rastreador** | Todos los puntos de tu sesión de seguimiento (filtrado: se omiten los reajustes = teletransportes, los inicios y los huecos > 5 min) |
| 📍 **Puntos de sesión** | Tus puntos añadidos mediante el editor |
| 🛣️ **Trazados de sesión** | Tus vías (Principal / Secundaria / Camino) trazadas en la sesión |
| ⬛ **Zonas de sesión** | Tus zonas (agua / escombros / derrumbe / inaccesible) |
| 🏛️ **Estructuras de sesión** | Tus pilares / muros / frentes |
| 📊 **Capas de datos** | Todos los elementos incrustados en las capas de datos del plano (puntos + vías + zonas + estructuras + frentes) |

#### 🎚️ Ajustes en vivo

Dos deslizadores en la parte inferior de la ventana, con actualización en tiempo real:

| Deslizador | Rango | Efecto |
|---|---|---|
| **Radio** | 10 - 120 px | Extensión de la «mancha» alrededor de cada punto. Pequeño = preciso a escala local, grande = visión general |
| **Intensidad** | 0,2× - 3,0× | Multiplicador global. Si todo se ve demasiado pálido → súbelo. Si todo se satura de rojo → bájalo |

#### 🏗️ Filtro por nivel (multinivel)

Si tu plano es **multinivel** (cantera con varias plantas — planta baja, sótano, entreplanta, etc.), aparece una nueva sección **«🏗️ Niveles a incluir»** en la ventana del Mapa de calor.

- **Fichas por nivel**: una pastilla pulsable por cada nivel disponible en el plano (`Niv. -2`, `Niv. -1`, `Niv. 0`, `Niv. 1`…)
- **Preselección**: los niveles **actualmente visibles** en el mapa vienen premarcados automáticamente
- **Botón ⇅ Todo**: marca o desmarca todo con un clic
- **Efecto**: el mapa de calor limita la recogida a los elementos que pertenecen a los niveles seleccionados. Práctico para generar un mapa de calor dedicado únicamente a la planta baja (por ejemplo), o para comparar la densidad entre 2 plantas sin contaminación cruzada.

> 💡 **Caso de uso**: quieres comparar la frecuentación de la planta baja con la del sótano → 2 mapas de calor sucesivos con el filtro correspondiente → captura de pantalla de cada uno → ves de inmediato la asimetría.

> 📌 Si tu plano **no** es multinivel, esta sección no aparece en absoluto.

#### 🎯 Algoritmos (por qué ahora resulta pertinente)

- **Interpolación a lo largo de los segmentos**: para los trazados / zonas / estructuras polilínea / línea de tiempo del rastreador, la app distribuye puntos de calor **a lo largo del camino** en lugar de uno solo por vértice. Resultado: ves auténticas **estelas continuas**, no «perlas» espaciadas.
- **Normalización por histograma**: el píxel más denso de la imagen = rojo puro, el menos denso = azul puro, con un degradado suavizado entre ambos. **Autoadaptativo**: no hace falta ajustar los umbrales a mano, funciona igual de bien en un plano de 20 puntos que en uno de 5000.
- **Filtro de la línea de tiempo del rastreador**: se omiten los teletransportes (reajustes), los inicios y los huecos > 5 min (una pausa sin moverse no debe generar calor fantasma).

#### 💡 Casos de uso

- **Identificar los ejes principales** de una cantera: lo que sale en rojo = por dónde pasas de verdad, frente a lo que sale en azul = explorado una sola vez
- **Auditoría de exhaustividad**: zonas azules = poco cartografiadas → próximo objetivo sobre el terreno
- **Presentación visual** de una sesión: captura del mapa de calor + comentario para compartir una visión general del plano explorado

> ⚠️ El mapa de calor es **puramente visual** (superposición en lienzo). No altera ni el plano, ni las anotaciones, ni las exportaciones. Cierra la ventana para ocultarlo.

### ≡ Ventana de Filtros unificada

El botón **≡ de tres barras horizontales** de arriba a la derecha del mapa abre la **ventana de Filtros unificada**, que reúne **7 secciones** de filtrado:

| Sección | Qué filtra |
|---|---|
| 🖼️ **Capas de imagen** | Imagen base + capas adicionales (leyenda, señalización, etc.) |
| 📊 **Capas de datos** | Las capas `puits`, `vehicule`, `cataphile`, `editor` (= Mis anotaciones), etc. |
| 🏗️ **Niveles multinivel** *(si el plano es multinivel)* | Nivel activo (dibujo) + niveles visibles (selección múltiple) — **sincronizado** con la ventana de Niveles clásica |
| 🏷️ **Etiquetas de los puntos** | Filtro por etiqueta (pozo de ventilación, sala, gatera…). La lista es automática = etiquetas **realmente presentes** en el plano, con contador. |
| 🛣️ **Tipos de trazado** | Principal / Secundario / Camino / Unión + personalizados |
| ⬛ **Tipos de zona** | Agua / Escombros / Derrumbe / Inaccesible + personalizados |
| 🏛️ **Tipos de estructura** | Pilar 1.ª masa / Pilar 2.ª masa / Muro / Frente 1 / Frente 2 + personalizados |

> 🔄 **Corregir una capa de datos** — una capa incluida en el ZIP del plano es de **solo lectura**: puedes ocultarla, no editarla. Cada línea de la sección **📊 Capas de datos** tiene, pues, un botón **«🔄 Modificar»**: su contenido pasa a tu sesión, donde se aplican todas tus herramientas — en particular **🔄 Convertir este objeto**, para cambiar un frente de cantera en galería en un levantamiento importado. La capa original **se oculta sola** (su casilla muestra «en modificación — mostrar de todos modos», que puedes volver a marcar para comparar ambas). **«↩️ Restaurar»** lo anula todo; **«💾 Exportar»** te devuelve un archivo corregido que puedes volver a dar al plano mediante 🏗️ Generador → «Modificar un plano», pulsando **«Elegir» en la línea de esa capa** — SUSTITUYE el contenido antiguo, no puede haber duplicados.
>
> ⚠️ **Lo que la app te anuncia antes de actuar**: el peso que ocupará la copia en tu sesión (un levantamiento grande supera el megabyte, y el límite del navegador ronda los 5 MB para todos los planos) y el espacio ya ocupado. Al exportar, también te dice cuántos objetos **que has dibujado tú mismo** no se incluyen — no pertenecen a esa capa. Y «Borrar la sesión» **restaura** las capas abiertas para modificación: la copia y la ocultación desaparecen juntas.

**Cómo funciona:**

- **Actualización en vivo**: cada interruptor (casilla marcada o desmarcada) aplica el filtro **inmediatamente** sobre el mapa.
- **Secciones plegables**: pulsa el encabezado de una sección para plegarla o desplegarla. Todas abiertas por defecto.
- **Botones rápidos por sección**: `👁️ Todo` y `🚫 Ninguno` para cambiar todos los elementos de una vez.
- **Botón 🔄 Mostrar todo** (pie): reinicia todos los filtros de ejecución (etiquetas + tipos) a su estado neutro (= todo visible). NO toca los interruptores multinivel ni las capas de imagen/datos — cada uno se mantiene independiente.
- **Pie de estado**: cuenta los filtros activos en la parte inferior (`Filtros activos: etiquetas, trazados`) en amarillo si hay al menos uno activo, en gris si todo está neutro.

**Persistencia por plano**:

Los filtros de etiquetas + tipos se **guardan en la sesión del plano**. Si activas «ocultar los pozos» en el plano A, luego cambias al plano B y después vuelves al A → tus filtros se **restauran automáticamente**. Cada plano tiene sus propios filtros.

**Sincronización multinivel bidireccional**:

La sección 🏗️ multinivel de la ventana de Filtros **convive** con la pastilla multinivel y la ventana de Niveles clásica. Toda acción en un lado se repercute en el otro:

- Marcas `Niv. 1` en la ventana de Filtros → la ventana de Niveles y el mapa se actualizan.
- Usas la pastilla multinivel para cambiar de nivel activo → si la ventana de Filtros está abierta, su sección 🏗️ se refresca en vivo.

> 💡 **Caso de uso típico**: trabajas en una cantera grande con muchas etiquetas. Solo te interesan los pozos abiertos (etiquetas `peo` y `cao`) para planificar un recorrido de ventilación. Abre ≡ Filtros → sección 🏷️ Etiquetas → pulsa 🚫 Ninguno y vuelve a marcar `peo` + `cao`. El mapa muestra únicamente esas 2 categorías. Se guarda automáticamente para ese plano.

> 📌 **Compatibilidad**: las sesiones guardadas antes de la llegada de esta función se restauran sin ningún filtro activo (= todo visible). La primera interacción con la ventana crea el estado y lo guarda en el siguiente guardado automático (≤ 1,5 s).

> ⚠️ **El trazado en curso siempre está visible**: si estás trazando una vía y desmarcas su tipo en el filtro, **el trazado actual sigue visible** para que no te pierdas. Los demás trazados del mismo tipo se ocultan como estaba previsto. Ídem para las zonas y estructuras en curso.

### ⚙️ Ajustes del rastreador

Accede a los ajustes mediante el botón **⚙️ Ajustes** de la barra lateral:

- **Escala (px/m)**: relación entre píxeles y metros reales — botón **🎯** al lado para calibrar
- 👣 **El tamaño de paso, el umbral de detección y el cooldown son tuyos, no del plano**: ajustados una vez, valen para **todos tus planos** en este dispositivo y viajan con tu perfil. El Generador ya no los propone (un plano no tiene zancada), y un plano antiguo que los llevaba simplemente se ignora. «Restablecer» los devuelve a los valores de fábrica de la app.
- **Tamaño de un paso (m)**: longitud estimada de tu zancada (≈ 0,7 m)
- **Umbral de detección**: sensibilidad del detector de pasos
- **Tiempo de espera (ms)**: intervalo mínimo entre dos pasos
- **Posición inicial X / Y**: punto de partida del icono al cargar

> 🧭 **Introducción asistida de la posición de partida** — ya no hace falta escribir las coordenadas a mano. Bajo los campos X / Y, dos botones:
> - **🔍 Elegir mediante un punto**: busca un punto existente (por nombre, identificador o etiqueta) y lo selecciona como posición de partida.
> - **📍 Pulsar en el mapa**: la ventana de ajustes se oculta, pulsas el lugar deseado en el plano y las coordenadas se rellenan automáticamente (botón **Cancelar** para salir sin elegir).
>
> La misma lógica de introducción que la georreferenciación. Acuérdate de **💾 Guardar** para conservar el ajuste.

### 🧭 Navegación inteligente (ajustar la posición a los trazados)

Bajo tierra, el GPS por satélite no funciona: el rastreador estima tu posición con **tus pasos + la brújula**, lo que **deriva** con el tiempo. Si tu plano contiene una **red de trazados**, la **navegación inteligente** reajusta continuamente tu posición estimada **a la galería más cercana** para compensar esa imprecisión.

**Activación**: ⚙️ Configuración → **«🧭 Navegación inteligente»** → marca «Ajustar la posición a los trazados». **Desactivada por defecto**, reversible en cualquier momento.

- Cuando **avanzas**, la posición sigue la galería; en los **cruces**, se elige la rama que corresponde a tu **rumbo** (dirección de marcha).
- Si **sales de las galerías trazadas** (zona aún no cartografiada), se vuelve **automáticamente** al modo clásico, con reajuste en cuanto regresas cerca de un trazado.
- **Sin red de trazados** en el plano, la opción **no tiene efecto**.
- Es posible un ajuste fino (tolerancia de ajuste) — pídelo si quieres regularlo.

> 💡 El **reajuste manual (📍)** sigue siendo tu mejor aliado: en cuanto reconozcas un punto de referencia, reajusta — la navegación inteligente parte entonces de una base sana.

> 🧭 **Tu trazado se conserva**: se **vuelve a dibujar al recargar** la aplicación (reconstruido a partir del historial de la sesión), y el resumen **📊 Estadísticas** muestra tu **distancia recorrida + número de pasos**.

### 🗺️ Calcular un itinerario

El botón **🗺️** del grupo **🧭 Rastreador** abre la ventana de itinerario. Calcula el **camino más corto** entre 2 o más puntos utilizando las **vías existentes** del plano (tanto las que has trazado tú como las presentes en las capas de datos).

**Para trazar un itinerario:**

> 💡 **Botón 🧭 Mi posición** — añade tu posición actual del rastreador como punto de paso (instantánea fija). Práctico si estás caminando bajo tierra con el rastreador activo y quieres calcular un itinerario que empiece donde estás. Si reajustaste tu posición al principio, se usa esa posición reajustada.

> 🚀 **Truco de rendimiento**: si tus vías ya están dibujadas fijas en el PNG del plano, puedes **ocultar la capa de vías** en el control de capas de Leaflet (arriba a la derecha). Conservas la legibilidad visual (el PNG muestra las vías) Y ganas rendimiento de dibujado (Leaflet no traza las polilíneas de los datos por encima). El módulo **🗺️ Itinerario sigue funcionando**: utiliza todas las vías de la capa, se muestren o no.

1. Abre la ventana **🗺️ Calcular un itinerario**
2. Elige tus **puntos de paso** de 2 maneras (combinables):
   - **📍 Modo clic en el mapa**: la ventana se reduce a una minibarra «Modo clic activo», pulsa en el mapa para colocar cada punto de paso (marcadores cian numerados). Botón **✓ Terminar** para volver a la ventana.
   - **🔍 Búsqueda**: escribe el nombre, el id o una etiqueta de un punto existente; pulsa en la lista de sugerencias para añadirlo.
3. Puedes **retirar** un punto de paso con el botón ✕ a la derecha de cada línea.
4. Pulsa **🎯 Calcular el itinerario**: aparece un trazado **cian neón**, y la app te indica la **distancia total en metros** y el número de tramos atravesados.
5. **💾 Guardar** conserva el itinerario en la sesión, **❌ Borrar** lo retira.

**Etiqueta de distancia**: mientras haya un itinerario activo, aparece una pequeña etiqueta **🗺️ Itinerario: XX m · ⏱️ tiempo · 🚶 modo de velocidad** abajo a la izquierda del mapa, justo encima de la etiqueta de medición de distancia clásica.

**🏃 Velocidad de marcha estimada** (control segmentado en la ventana) — 4 preajustes para ajustar la estimación del tiempo de recorrido:

| Modo | Velocidad | Cuándo usarlo |
|---|---|---|
| 🤕 **Herido** | 2 km/h | Progresión dificultada, muy lenta, terreno accidentado |
| 🐌 **Lenta** | 3 km/h | Prudente, estrechamientos, exploración, transporte de material |
| 🚶 **Normal** | 5 km/h | Por defecto, ritmo estándar de marcha bajo tierra |
| 🏃 **Rápida** | 7 km/h | Ritmo sostenido, recorrido conocido, regreso rápido |

El modo activo se muestra junto al tiempo estimado en la etiqueta inferior izquierda. La elección se conserva entre sesiones (en este dispositivo). Puedes cambiar de modo en cualquier momento desde la ventana, y el tiempo se actualiza al instante.

**Modo navegación** — cuando ya hay un itinerario activo y vuelves a abrir **🗺️ Calcular un itinerario**, la ventana pasa a **modo navegación**:

- Botones rápidos **⏮️ Inicio** (centra el mapa en el 1.er punto de paso con un destello circular cian), **⏭️ Fin** (ídem para el último), **🔁 Vuelta completa** (amplía para ver todo el trazado).
- Botón **🎯** en cada punto de paso para ir a verlo directamente.
- **🔄 Recalcular** vuelve al modo edición (los puntos de paso se conservan, puedes retocarlos).
- **❌ Borrar el itinerario** retira el trazado por completo.

**Tolerancia**: el algoritmo acepta que tus puntos de partida o de llegada estén un poco **al lado** de las vías — los ajusta automáticamente a la red más cercana. Si varias vías se cruzan visualmente pero sin compartir exactamente un mismo punto (caso típico de un trazado hecho a mano), la app también gestiona las **uniones con un margen de 15 px** para trazar el camino sin cortes.

> 💡 **Truco**: si quieres ver únicamente el trazado sin la etiqueta de distancia, cierra la ventana y vuelve a abrirla en modo navegación para usar los botones de control.

#### 🔄 Itinerario vivo — replanificación al reajustar + validación de etapas

Durante una salida real, el rastreador puede derivar y el teléfono pasa tiempo bloqueado en el bolsillo. El itinerario se adapta solo en cada **reajuste de posición**:

- **Reajusta tu posición** (clic en el mapa en modo reajuste, botón **📍 Estoy aquí** de un punto, o llegada por un portal) → el itinerario activo se **recalcula automáticamente desde tu nueva posición**. Tu posición pasa a ser el nuevo punto 0, las etapas restantes se conservan **en el orden que habías planificado** y se respetan tus preferencias de evitación.
- **Valida tu paso por una etapa**: pulsa **📍 Estoy aquí** en un punto que forme parte de tu itinerario → la etapa queda **validada** (marcador **✓ verde** en el mapa, línea tachada en la ventana), se excluye de los próximos cálculos y el itinerario parte desde ahí. **El orden es libre**: puedes visitar la etapa 3 antes que la 1, la app valida lo que TÚ haces, no lo que ella propone.
- **Todas las etapas validadas** (incluida tu salida) → pequeño mensaje «🎉 Itinerario terminado» y el trazado se borra. Tu recorrido del rastreador, en cambio, sigue visible.
- El reajuste por **clic en el mapa** nunca valida una etapa (es aproximado por naturaleza): solo replanifica.
- Las etapas validadas **sobreviven a la recarga y al bloqueo del teléfono** (se guardan con la sesión).

> 💡 En la práctica: planifica tu salida (yo → curiosidad X → curiosidad Y → salida), camina, y en cada punto alcanzado pulsa **📍 Estoy aquí** en su ventana emergente. La app marca, recalcula y te indica siempre el camino desde donde estás realmente.

#### 🪧 Guiado — «En 40 m, girar a la izquierda» (desde v1.98.0)

Cuando el **tracker está activo** y hay un **itinerario trazado** (desde el modal, un «🧭 Ir allí» en un punto o la salida de emergencia), aparece solo un **banner** en la parte superior del mapa que te dice qué hacer:

- **«En 40 m, girar a la izquierda»**, **«Seguir durante 120 m»** y luego **«Ahora: girar a la izquierda»** al acercarte. Debajo, en pequeño, la indicación siguiente («Luego girar a la derecha»).
- **Solo en los cruces**: mientras haya una sola galería que seguir, el guiado calla, aunque gire. Nunca dice «la 3.ª a la izquierda» (los trazados no muestran todas las aberturas reales): siempre una **distancia**.
- **Dos galerías cercanas** → «tomar el ramal de la izquierda / de la derecha». Al pasar por una unión de nivel → «subir / bajar al nivel N».
- **Grandes cruces**: varios cruces cercanos (a 5 m o menos uno de otro) cuentan como **un solo cruce**, con **una sola indicación** dada a su entrada. A partir de **4 galerías**, un **pequeño esquema** sustituye a la flecha: cada galería es un trazo, la de donde vienes discontinua abajo, **la que debes tomar en dorado**. Si hay un punto con nombre dentro del cruce, su nombre abre la indicación.
- **Fuera del trazado al salir** → «Llegar al trazado: ~12 m», con una **flecha** que apunta a la galería más cercana, respecto a tu teléfono.
- **Distancias**: precisas con la **🧭 Navegación inteligente** (⚙️ Ajustes → Navegación y tracker); sin ella son **aproximadas** («~40 m», redondeadas a 10 m), porque la posición viene del podómetro y deriva.

**¿Te alejas o das media vuelta?** El banner se pone naranja («¿Fuera del itinerario?» / «¿Media vuelta?») y propone **[Estoy aquí]** (toca donde estás, el itinerario se recalcula desde ahí), **[Recalcular desde aquí]** e **[Ignorar]** (no más alertas hasta que vuelvas al camino). Nada se recalcula sin ti: una deriva del podómetro se parece a un desvío.

**Tocar el banner** abre la **🪧 Hoja de ruta**: todas las indicaciones con sus distancias (toca una línea para ver el lugar). También está disponible **sin tracker**, desde el modal Itinerario (botón «🪧 Hoja de ruta»), para preparar una salida.

**La ✕** oculta el banner **para este itinerario**; vuelve con el siguiente. Para desactivarlo **del todo**: menú 🧭 Tracker → **🪧 Guiado del itinerario**.

**En línea recta**: si tu salida, una etapa o tu llegada está al lado de las galerías, el tramo hasta la más cercana se dibuja **discontinuo** y se **cuenta** en la distancia (una etapa fuera del trazado cuenta ida y vuelta). Más allá de **50 m**, la app te avisa: ese tramo no es una galería conocida, comprueba tu posición. En un plano **sin ningún trazado**, no se puede calcular el itinerario: la app lo dice desde el principio.

> 🚨 **En la salida de emergencia**, el banner **no tiene ✕** y se muestra aunque el guiado esté desactivado; ante un desvío, el botón pasa a **«Salida más cercana desde aquí»**. La **pantalla de emergencia XL** repite la indicación en grande.

#### 🚫 Preferencias de evitación

En la ventana de itinerario, una sección plegable **🚫 Preferencias de evitación (opcional)** permite definir restricciones **flexibles** que el buscador de rutas intentará respetar:

| Tipo | Descripción |
|---|---|
| **📍 Puntos a evitar** | **3 métodos** a elegir: (a) búsqueda con autocompletado en el campo de texto, (b) introducción por ID exacto, (c) **📍 Pulsar en el mapa**: cambia a modo clic y cada clic en el mapa añade un punto. Fichas naranjas con ✕ para retirarlos. |
| **🏷️ Etiquetas a evitar** | Pulsa una ficha para activarla o desactivarla. Todos los puntos que lleven esa etiqueta se evitarán (p. ej. activas `pa` → se evitan todos los pozos de ventilación). |
| **⬛ Zonas a evitar** | Marca un **tipo de zona** en la lista (Agua, Derrumbe, tus tipos personalizados…) para que el itinerario **rodee** todas las zonas de ese tipo. Las zonas **⛔ inaccesibles** no aparecen aquí: son infranqueables por defecto (restricción estricta, que la casilla «Respetar las zonas inaccesibles» de esta misma ventana puede relajar). |
| **📏 Margen** | Distancia alrededor de los puntos evitados (px, por defecto 100). Todo segmento de vía que quede a menos de ese margen se excluye del grafo. |

**Comportamiento**:
- ✅ Si es posible, el itinerario lo evita todo (= cálculo normal)
- ⚠️ Si no existe ningún camino alternativo → la app calcula igualmente pasando por esos puntos y muestra un mensaje naranja `⚠️ Imposible evitar: X, Y` encima del resultado
- ❌ Si incluso ese recurso falla (= ausencia real de camino) → mensaje de error clásico

**Diferencia con la ⛔ Zona Inaccesible**:
- ⛔ Zona = restricción **estricta por defecto** — se puede relajar con la casilla «Respetar las zonas inaccesibles» de la ventana Itinerario. El Modo Rescate y el modo «Perdido» las respetan siempre.
- 🚫 Evitación = restricción **flexible** (puede relajarse con un mensaje)

**Persistencia**: tus preferencias se guardan por plano (en este dispositivo). En el siguiente cálculo sobre el mismo plano, se restauran. Botón **🗑️ Reiniciar** para borrarlo todo.

> 🧭 **Por dónde empezar, según tu situación.** Las páginas siguientes cubren cuatro herramientas distintas. La que necesitas depende de lo que te esté pasando:
>
> | Tu situación | La herramienta | Dónde |
> |---|---|---|
> | Quiero **la salida más cercana**, ahora mismo | 🚨 Salida de emergencia | sección «Modo Salida de emergencia», más arriba |
> | **Ya no sé dónde estoy**, pero sé por dónde he pasado | ⛑️ Estoy perdido | justo debajo |
> | Estoy en pánico, necesito una **pantalla legible de un vistazo** | 🚨 Modo emergencia «pánico» | justo después |
> | **Coordino equipos** que buscan a alguien | 🚨 Modo Rescate | el resto de este capítulo |
>
> Las cuatro son independientes. El Modo Rescate es el único que requiere preparación: equipos declarados, zonas asignadas.

### ⛑️ Modo emergencia — «Estoy perdido»

El botón **⛑️** naranja del grupo **🧭 Rastreador** abre el modo emergencia. Estima la **zona probable en la que puedes encontrarte ahora** a partir de tu última posición conocida, del tiempo transcurrido y de los **indicios visuales** que observas a tu alrededor.

> ⚠️ **El modo emergencia es una ayuda geométrica. NO sustituye** a: un hilo de Ariadna, una brújula, una linterna con pilas de repuesto, un mapa de papel y la regla de oro de avisar a alguien antes de la salida. Si estás realmente perdido: mantén la calma, no entres en pánico, ahorra luz y comunica tu posición si tienes cobertura.

**Cómo funciona:**

1. **📍 Última posición conocida** — indica dónde estabas seguro de encontrarte hace X minutos:
   - 🔎 **Búsqueda** de un punto existente por nombre/id (p. ej. «PA1», «sala», «grabado XYZ»)
   - 📍 **Clic en el mapa** — clic directo sobre el mapa para colocar una referencia
   - 🧭 **Posición del rastreador** — usa la posición actual del rastreador si está activo

2. **⏱️ Tiempo transcurrido** — deslizador de 1 a 90 minutos (1 h 30 máx.). Más allá, la zona se vuelve tan amplia que el modo deja de ser pertinente — es preferible entonces avisar a los servicios de rescate.

3. **🏃 Velocidad de marcha supuesta** — un control segmentado con 4 preajustes. El radio final = `velocidad × tiempo`. Los valores en km/h son **los mismos que en el modo itinerario** por coherencia (un preajuste «Normal» representa la misma velocidad en toda la app).

   | Preajuste | Velocidad | Radio para 10 min | Cuándo usarlo |
   |---|---|---|---|
   | 🤕 **Herido** | 2 km/h | ~333 m | Progresión dificultada, muy lenta, marcha vacilante |
   | 🐌 **Lenta** | 3 km/h | ~500 m | Marcha prudente, estrechamientos, exploración |
   | 🚶 **Normal** *(por defecto)* | 5 km/h | ~833 m | Ritmo estándar de marcha |
   | 🏃 **Rápida** | 7 km/h | ~1167 m | Recorrido conocido, marcha sostenida |

   La elección se conserva entre sesiones (en este dispositivo). Si la zona ya está dibujada en el mapa, cambiar de preajuste la recalcula al instante.

4. **🔮 Indicios visuales (opcional pero muy útil)** — texto libre, separado por comas o saltos de línea. Ejemplos: *«bidón de agua, grabado del ariete, sala azul, pozo roto, escalera que baja»*. La app busca esas palabras en el **nombre**, la **descripción** y las **etiquetas** de todos los puntos del plano (capas y puntos de sesión combinados).

5. Pulsa **🎯 Calcular la zona**.

**Lo que aparece en el mapa:**

| Elemento | Significado |
|---|---|
| **Círculo naranja pulsante** | Zona de búsqueda (radio = velocidad × tiempo) |
| **📍 verde pulsante** | Tu última posición conocida |
| **🔮 violeta pulsante** | Indicio de texto que coincide Y está **dentro de la zona** (el más importante) |
| **· gris** | Indicio de texto que coincide pero está **fuera de la zona** (excluido) |
| **Círculo violeta interior** | Localización probable afinada (baricentro de los indicios dentro de la zona) — solo aparece si hay al menos 1 coincidencia dentro de la zona |

**⚠️ Si la zona sobrepasa los límites del plano** (radio demasiado grande respecto al tamaño del plano), una franja de alerta naranja te lo indica en los resultados: *«El radio supera el tamaño del plano — podrías estar en cualquier sitio»*. Reduce el tiempo transcurrido o afina con indicios.

**Acciones disponibles en los resultados:**

- **📋 Copiar el informe** — copia un texto estructurado al portapapeles (plano, posición, tiempo, indicios, localización afinada, marca de tiempo) para compartirlo por SMS, radio o cualquier otro medio de comunicación.
- **✅ Eliminar la zona y guardar mi posición supuesta** — retira la zona de búsqueda del mapa Y añade un punto de editor permanente (icono ⚠️ de peligro) en la localización probable. Después puedes exportarlo o convertirlo como cualquier otro punto.
- **🗑️ Borrar la zona y cerrar** — retira la zona y los marcadores del mapa sin guardar ningún punto.

**👁️ Cerrar la ventana sin borrar la zona**: el botón **👁️ Cerrar** (y la cruz ✕ de arriba, y el clic fuera de la ventana) solo cierran la ventana. La zona permanece visible en el mapa para que puedas explorar; volver a abrir **⛑️** restaura todos tus parámetros anteriores.

> 💡 **Caso de uso típico** — saliste del último pozo identificado hace 20 minutos, llevas caminando desde entonces sin rastreador, y ahora ves *«un grabado "Ariete" en la pared y un bidón de agua en el suelo»*. Abre ⛑️, selecciona el pozo como última posición, pon 20 min y escribe `ariete, bidón` en los indicios. La app te muestra la zona probable y — si hay un punto llamado «grabado Ariete» en el plano que cae dentro de la zona — un círculo violeta en ese lugar.

#### 📚 Buenas prácticas cuando estás perdido

El modo ⛑️ incluye un **bloque desplegable «📚 Buenas prácticas»** en la parte superior de la ventana (púlsalo para abrirlo). Reúne los consejos esenciales en 6 secciones, para leer con calma si la situación lo exige:

**🧘 Mantén la calma (lo primero)** — Alto. Respira. El pánico hace perder las referencias y desperdicia luz y energía. Come o bebe un poco si tienes algo.

**🗺️ Orientación** — **Vuelve sobre tus pasos** en lugar de intentar alcanzar tu destino (estadísticamente más fiable). Busca los **ejes principales** (galerías de rodadura, galerías rectas, vías férreas) que llevan a puntos conocidos. **Usa una brújula física** — no la del teléfono (falseada por el suelo y las armaduras). **Escucha los ruidos**: tráfico, metro, agua corriendo = indicio de dirección.

**🔦 Luz y recursos** — Modo ahorro de inmediato. Guarda una linterna de reserva. Hidrátate un poco, pero raciona.

**📡 Comunicación** — Si **tienes cobertura** (a menudo cerca de los pozos o registros) → avisa a alguien en superficie ANTES de que se agote tu batería. Usa el botón **📋 Copiar el informe** para preparar un mensaje ya redactado con tu última posición + el tiempo transcurrido.

**📍 Si decides esperar** — Colócate en un lugar **identificable** (pozo numerado, sala con nombre). Quédate donde estás si **nadie sabe que estás ahí**. Marca tu ubicación para que te encuentren.

**⚠️ Lo que no hay que hacer** — No sigas el agua (diaclasas peligrosas). No intentes un paso desconocido solo porque «sube». No te fíes del rastreador del teléfono (deriva bajo estrés).

> ⚠️ Estos consejos son **principios generales** procedentes de la práctica de la exploración subterránea. No sustituyen a la formación, el equipamiento y el sentido común. La regla de oro sigue siendo: avisar a alguien en superficie ANTES de la salida, con una hora estimada de regreso.

### 🚨 Modo emergencia «pánico»

> 💡 **No confundir con ⛑️ «Estoy perdido»**: el ⛑️ calcula una zona teórica (dónde puedes estar a partir de una última posición conocida + el tiempo transcurrido). El 🚨, en cambio, supone que **SABES dónde estás** (el rastreador lo muestra), pero que **estás en pánico y necesitas información vital en grande para reaccionar rápido**.

El botón **🚨** rojo del grupo **🧭 Rastreador** abre un modo «pánico» a pantalla completa que reúne de un vistazo:

- 📍 **Una sola posición, enorme** (legible a un metro del teléfono): las coordenadas **GPS** si tu plano está georreferenciado — son las que se dictan a los equipos de rescate — y si no, la posición **X / Y del plano**. Nunca las dos: el título del bloque te dice cuál estás leyendo. Bajo las cifras, una línea indica si es tu posición seguida, tu última posición conocida o la **posición de partida del plano, nunca confirmada**.
- 🧭 **Brújula gigante**: rumbo (sentido de la marcha) con aguja que gira en tiempo real, actualizada en vivo mediante los sensores de orientación del teléfono
- 🪧 **La indicación del guiado en grande** (desde v1.98.0): si hay un itinerario trazado y el seguimiento está activo, la próxima indicación («En 40 m, girar a la izquierda», esquema de los grandes cruces) aparece arriba de la pantalla. Ante un desvío, un botón **«Ver las opciones en el mapa»** te devuelve al banner y sus botones
- 🗺️ **Minimapa con enfoque automático**: zoom cerrado (~20-50 m de horizonte) centrado permanentemente en tu posición. Muestra de fondo las **vías / zonas / estructuras del plano** — útil para localizar caminos, salidas y peligros en las inmediaciones
  Usa los **colores de tu leyenda**: si has recoloreado un tipo o creado tus propios tipos, los reconoces aquí igual que en el mapa.
  Tu **itinerario activo** siempre aparece dibujado (cian intenso + halo blanco, para seguir viéndose sobre ese fondo tan ampliado), y el mapa **gira** como el principal si has activado el modo «plano orientado».
- 📋 **« Copiar mi posición »**: un botón cuadrado **a la derecha de las cifras** (también sirve pulsar las cifras — ahí va el dedo primero). Se convierte en ✅ mientras confirma la copia. Si tu plano está georreferenciado copia **solo las coordenadas** — `48.823328, 2.322915` — el formato que se pega directamente en un SMS, en Google Maps o en Mapas, sin tener que limpiar nada. Si no, copia el **nombre del plano y tu posición X/Y**, que solo significa algo para quien tenga el mismo plano. Conviéne tenerlo a mano en cuanto tengas algo de cobertura. ⚠️ *La duda se queda en la pantalla, no en el mensaje: si tu posición nunca se ha confirmado, la línea bajo las cifras lo dice — díselo también a quien escribas.*
- 🔋 **Una línea de estado arriba a la derecha**: tu **nivel de batería** (solo si tu navegador lo expone y no has desmarcado el ajuste — si no, nada en absoluto, ningún « ? »; crítico aquí: sabes cuánto te queda antes de que el teléfono se apague), el estado del **rastreador** y el de la **brújula**. El **nombre del plano** va justo bajo el título 🚨. *La escala del plano ya no aparece (v1.97.11): es una cifra de calibrado, se consulta en ⚙️ Configuración, no cuando buscas dónde estás.*
- 🌗 **Tema**: la pantalla sigue el de la app (oscuro o claro). Ya no hay botón propio — un solo ajuste, en ⚙️ Configuración.
- 🔋 **Wake Lock**: la pantalla no se apaga automáticamente mientras el modo esté activo (no hace falta tocar el teléfono cada 30 segundos para despertarlo)
- 📱 **Horizontal**: el minimapa se reencuadra correctamente cuando giras el teléfono, y la disposición cambia — la posición a la izquierda y el mapa a la derecha a toda altura.
- 🗺️ **Todo cabe en una pantalla**: ya no hay nada que desplazar, y **el mapa ocupa todo el espacio ganado** (medido: su altura se ha duplicado en un teléfono en vertical).

**¿Cuándo usarlo?**
- Estás en pánico en un cruce y necesitas reorientarte rápido
- Buscas un detalle visual del plano (un pilar, un pozo) que debería estar muy cerca
- Quieres comprobar que vas en la dirección correcta (rumbo de la brújula)
- Necesitas leer tu posición en grande para transmitírsela a alguien (radio, SMS) sin forzar la vista

**Permisos**: la primera vez, el navegador pide acceso a los **sensores de orientación** del teléfono (para la brújula). Acéptalo — sin eso, la brújula se queda congelada.

**Salida**: el botón grande **↩️ SALIR DEL MODO EMERGENCIA** al pie de la pantalla — queda fijado abajo, nunca tienes que buscarlo. En ordenador, la tecla **Esc** hace lo mismo.

### 🚨 Modo Rescate

Herramienta operativa para **asignar metódicamente equipos de rescate** a zonas de búsqueda de un plano. Caso de uso: una persona está desaparecida en una red densa, varios equipos llegan a la superficie y el puesto de mando debe coordinar «quién peina qué» con un briefing claro e imprimible.

> 💡 **Distinto del ⛑️ Estoy perdido**: en ⛑️ eres *tú* quien está perdido y buscas orientarte. El **🚨 Modo Rescate** es para cuando es *otra persona* la que está perdida y tú organizas los equipos que van a buscarla.

#### Acceso

Botón 🚨 del grupo **🧭 Rastreador** (panel de emergencias), junto a ⛑️ Estoy perdido y 🚨 Pánico. Fondo rojo de emergencia coherente.

#### Flujo de trabajo

1. **Lista de escenarios** — Ves todos los escenarios guardados para este plano (máx. 10, los más antiguos se eliminan — nunca un escenario en curso ni el que tienes abierto).
2. **➕ Nuevo escenario** — Asistente ligero: Nombre + Notas de contexto + Hora del incidente.
3. **Edición libre** — 3 secciones plegables:
   - **📝 Contexto**: nombre, hora del incidente, notas (p. ej. «Marc salió sobre las 14 h para comprobar la galería Este…»)
   - **🚨 Equipos**: añade tantos equipos como haga falta. Para cada equipo: nombre (automático Alfa/Bravo/Charlie…), color (paleta OTAN de 10 colores fija), miembros (CSV), entrada/salida (clic en el mapa), zona (polígono O selección de trazados), itinerario sugerido (cálculo automático mediante el buscador de rutas)
   - **📤 Exportación**: PDF imprimible (1 página por equipo) + KMZ geolocalizado (entre aplicaciones)

#### Modos interactivos del mapa

| Botón | Acción |
|---|---|
| 📍 Entrada | 1 clic en el mapa = captura la posición de entrada del equipo |
| 🚪 Salida | 1 clic en el mapa = captura la posición de salida |
| ⬛ Definir zona | A elegir: (a) polígono con varios clics + doble clic para cerrarlo, O (b) selección de trazados con un clic: se toma la galería más cercana, entre los niveles visibles (volver a pulsar = quitar, resaltada en rojo). Las galerías del plano se recuperan idénticas en cualquier teléfono que tenga el mismo plano; un trazado dibujado a mano en un solo dispositivo solo existe en ese. Las capas ocultas siguen siendo seleccionables |
| 🗺️ Calc. itinerario | Calcula automáticamente el camino más corto entre la entrada y la salida siguiendo las galerías existentes (mediante el buscador de rutas), y muestra la distancia + la duración estimada según los ajustes **⏱️ Duraciones estimadas** del plan de rescate (velocidad de búsqueda 1,5 km/h y pausa 0 por defecto, modificables) |
> 🔁 **Durante la intervención**: un equipo añadido como refuerzo, o cuya entrada, salida o etapas modificas, recibe sus etapas de inmediato. Lo ya introducido (estado, observaciones, fotos) se queda en la misma etapa, aunque dos etapas tengan el mismo nombre. Quitar una etapa que ya tiene datos pide confirmación, y se **rechaza** si indica «Ayuda solicitada» o «Víctima encontrada»: cambia primero su estado. Si se vuelve a poner **en la misma fase**, la etapa recupera lo que se había introducido (tras un cambio de fase empieza vacía; sus datos quedan en el historial de la fase cerrada). Si un equipo señala «Ayuda solicitada» o «Víctima encontrada» en una etapa que habías quitado mientras tanto, importar su informe **vuelve a poner el punto en su recorrido**, en su sitio, y te lo avisa en rojo; si el punto no puede volver a ponerse (equipo que ya no está en la fase actual), la alerta roja se muestra igualmente. ⚠️ **Tras una actualización de la aplicación, vuelve a importar el plan en cada teléfono antes de la intervención**: un teléfono que importó el plan con una versión anterior (antes de la v1.98.5) envía informes que el PC no puede fusionar. **Relanzar** un plan terminado borra la intervención anterior, fotos incluidas: una confirmación lo recuerda, exporta su informe antes. «Todos los POI de la zona» añade las etapas de la más cercana a la más cercana, para evitar idas y vueltas.

#### Visualización en el mapa

Botón **🗺️ Ver en el mapa** en la cabecera de la edición. Muestra, para cada equipo (con su color dedicado):
- Zona de polígono (opacidad de relleno del 30 %) O halo de color sobre los trazados seleccionados
- Marcador 📍 Entrada (círculo con borde verde + relleno del color del equipo)
- Marcador 🚪 Salida (círculo con borde rojo + relleno del color del equipo)
- Itinerario sugerido (polilínea discontinua del color del equipo)

Actualización automática en cada modificación. Vuelve a pulsar el botón para ocultarlo.

#### Varios escenarios por plano

Puedes preparar **varias hipótesis** simultáneas («si Marc salió por el Este» frente a «si salió por el Sur»). Botón 🗐 Duplicar para clonar un escenario y probar una variante sin perder el original. Tope de 10 escenarios por plano (por encima, el más antiguo se purga automáticamente).

#### Exportaciones

**📄 PDF imprimible**: 1 página A4 vertical por equipo, con banda de color + secciones Contexto/Miembros/Misión/Itinerario + un recuadro de Observaciones vacío de 60 mm (para rellenar a bolígrafo al volver del terreno). Nombre de archivo `Secours_<nombre_escenario>_<fecha>.pdf`.

**🌍 KMZ geolocalizado**: incluye el escenario completo en un archivo anexo del KMZ (`myktamap-extras.json > secoursPlan`). Requisito previo: plano ya calibrado para KMZ (ver la ventana de Exportación de sesiones, pestaña 🌍 KMZ). MyKTAMap puede reimportar el KMZ y recargar el escenario tal cual. Nombre de archivo `Secours_<nombre_escenario>_<fecha>.kmz`.

Las secciones siguientes detallan las funciones avanzadas: integraciones entre aplicaciones (KML, Modo perdido, mapa de calor, etc.), explotación sobre el terreno en tiempo real (vistas en directo por rol, estados, informes) y consolidación entre dispositivos (importación de informes de los miembros del equipo).

> 💡 **El intercambio entre operador y equipos** se hace mediante el clásico informe `.mkmsec.report.json` (intercambio de archivos de dispositivo a dispositivo).

> 💡 **Recomendación de campo**: prepara uno o dos escenarios **ANTES** de que haya un incidente en tus planos favoritos, para identificar las fricciones del flujo de trabajo (dónde están los accesos, cómo dividir la red, qué niveles por equipo). Durante un incidente real estarás en modo urgencia y la app debe estar lista para usarse en 30 segundos.

### 🚨 Modo Rescate — Multifase

Un escenario puede **secuenciar varias fases** con un debriefing intercalado entre cada una. Caso de uso típico sobre el terreno: *Fase 1 = un equipo barre TODAS las galerías de rodadura principales sin entrar en las cámaras de explotación → regreso del equipo → debriefing en el puesto de mando → Fase 2 = X equipos se centran en las cámaras de explotación con la información obtenida en la Fase 1.*

> 💡 **Si no usas el modo multifase**, no cambies nada: tu escenario se queda con **una sola fase implícita** y el comportamiento es estrictamente idéntico al anterior. Ninguna contaminación visual (los distintivos y botones de multifase aparecen SOLO si creas efectivamente 2 fases o más).

**🔧 Crear y gestionar las fases (vista de edición del escenario)**:

- Sección **📋 Fases (N)** bajo la sección de Equipos
- Botón **➕ Añadir una fase** → ventana de creación:
  - Escribe un nombre (p. ej. *«Fase 2 — Cámaras Este»*)
  - Marca los **equipos participantes** en esa fase (modelo híbrido: tus equipos se definen una sola vez en el escenario y luego marcas casilla por casilla «participa en esta fase»)
- Botón ✏️ para renombrar una fase o modificar la selección de equipos
- Botón 🗑️ para eliminar (se rechaza si es la última fase, si está activa en la ejecución o si ya ha sido iniciada → el historial se preserva)

**🏷️ Distintivo fijo en las 3 vistas en directo**: un distintivo ámbar «**📋 Fase 1 1/N**» aparece en la cabecera de las vistas Equipo / Operador / Rescatador libre en cuanto hay 2 fases o más. Muestra el nombre de la fase activa + su posición.

**✓ Terminar una fase + debriefing (solo Operador)**:

1. Durante la fase activa, el pie de la vista en directo del operador muestra un nuevo botón **«✓ Fase terminada»** en ámbar (visible solo si hay varias fases)
2. **Detección automática**: en cuanto **todos los equipos participantes han marcado su etapa de Salida como terminada**, el botón pasa a **verde pulsante** + un aviso asistente te informa («✅ Todos los equipos han salido — la fase está lista para cerrarse»). El operador conserva la decisión final.
3. **Clic en «✓ Fase terminada»** → ventana de debriefing: área de texto libre (5000 caracteres máx.) para anotar las conclusiones de la fase (equipos que han vuelto, puntos encontrados, zonas a explorar con prioridad, restricciones que han aparecido). Este debriefing se intercalará en el informe final entre las secciones de cada fase.
4. **Valida «✓ Terminar la fase»** → la fase actual se **archiva** (nunca se sobrescribe, historial preservado)
5. **Si existe una fase siguiente** → encadenamiento automático con la ventana **«🚀 ¿Iniciar la fase X+1?»** con un resumen de los equipos participantes
6. **Confirmas** → la nueva fase empieza y las etapas de los equipos participantes se **reconstruyen a partir de su recorrido ACTUAL** (así que si has modificado la `entrada/salida/intermedios` de un equipo entre F1 y F2, las nuevas etapas lo tienen en cuenta)
7. **Si no hay fase siguiente** → una confirmación «¿Detener el plan por completo?» (equivalente a ⏹️ Terminar el plan)

**🔍 Salvaguardas del historial**:

- Cerrar una fase **NUNCA** elimina etapas — se archivan tal cual
- Una fase ya iniciada no puede eliminarse desde la interfaz (red de seguridad)
- Una fase activa en la ejecución no puede eliminarse (pasa antes por «✓ Fase terminada»)
- El aviso de detección automática no se repite (una sola vez por fase)

> 💡 **Modelo híbrido equipos ↔ fases**: tus equipos se definen **una sola vez** en el escenario (con miembros, color OTAN y recorrido). La participación en cada fase se gestiona con casillas en la ventana de la fase. Un mismo equipo puede participar en varias fases sucesivas — al pasar de fase, sus etapas se reinician según su recorrido actual (así que puedes modificar el recorrido entre F1 y F2 para adaptarlo a lo descubierto).

> 💡 **El botón «➕ Añadir una fase» también está disponible en caliente** desde el pie de la vista en directo del operador (durante la ejecución), no solo desde la vista de edición. Práctico cuando el debriefing de F1 revela la necesidad de una F3 imprevista.

### 🚨 Modo Rescate — Integraciones entre aplicaciones

Estas integraciones convierten el Modo Rescate en una herramienta completa de coordinación operativa:

#### 🌍 KML entre aplicaciones (Google Earth, OsmAnd, Avenza…)

El KMZ exportado contiene una carpeta raíz `🚨 Secours` perfectamente estructurada para las aplicaciones de terceros:

```
📁 Rescate — Búsqueda de Marc 26/05
   ├── 📁 🚨 Equipo Alfa
   │ ├── 📁 📍 Puntos (5) ← activable en Google Earth
   │ ├── 📁 ⬛ Zona de búsqueda
   │ └── 📁 🗺️ Itinerario
   └── 📁 🚨 Equipo Bravo (ídem)
```

- Plano de fondo como GroundOverlay al 60 % de opacidad (lectura simultánea del plano y las zonas)
- Cálculo automático de los itinerarios que falten ANTES de la exportación (1 clic = KMZ completo)
- 43 estilos de color OTAN (10 equipos × 4 categorías + 3 estilos fijos de entrada/salida/circuito)

#### ⛑️→🚨 Flujo Modo perdido → Rescate

En la ventana ⛑️ Modo emergencia «Estoy perdido», nuevo botón:

```
🚨 Lanzar un plan de rescate (equipos + zonas)
```

Al pulsarlo, la app **crea automáticamente un escenario de Modo Rescate** con:
- Nombre automático `Búsqueda - 26/05/2026 14:32`
- Hora del incidente calculada a partir del tiempo transcurrido del Modo perdido
- Última posición conocida + zona de incertidumbre (radio + círculo discontinuo en el mapa)
- Notas automáticas con la velocidad de marcha, el radio y los indicios introducidos

→ Flujo natural: buscas a alguien → lanzas el Modo perdido → pulsas 🚨 → coordinas los equipos.

#### 🚫 Anticruce entre equipos

Cuando calculas el itinerario de un equipo, los **puntos de paso + zonas de los demás equipos** se convierten automáticamente en «preferencias de evitación» para el buscador de rutas. Resultado: los itinerarios se rodean en lugar de cruzarse, sin relevos involuntarios.

Si realmente no hay alternativa (paso único compartido), aparece el aviso `⚠️ El itinerario atraviesa N punto(s) de otros equipos — comprueba los solapamientos`.

#### 🔥 Mapa de calor de actividad en el Modo Rescate

Nuevo bloque naranja «🔍 Herramientas de análisis» en la sección Contexto, con el botón **🔥 Mostrar el mapa de calor de actividad**. Visualiza las zonas donde el rastreador ha registrado paso → útil para identificar las zonas probables que hay que registrar con prioridad.

Si la persona desaparecida usaba MyKTAMap y exportó su sesión con la línea de tiempo del rastreador, el mapa de calor muestra directamente dónde pasó tiempo.

#### 🏗️ Creación automática de 1 equipo por nivel (multinivel)

En los planos multinivel, botón condicional **🏗️ Automático: 1 equipo por nivel (N)** en la sección de Equipos. Crea automáticamente N equipos llamados `Nivel planta baja / +1 / -1…` con colores asignados cíclicamente. Después colocas las zonas y los puntos de paso en cada nivel por separado, cambiando el nivel activo mediante la pastilla multinivel de arriba a la izquierda.

#### ⭐ Favoritos de acceso rápido

En la miniventana «📍 Elegir un punto», tus favoritos del plano aparecen ahora como fichas pulsables (máx. 8) POR ENCIMA de la búsqueda con autocompletado. 1 clic = punto de paso aplicado (sin pasar por la búsqueda ni el clic en el mapa).

Especialmente útil en los escenarios de emergencia en los que quieres crear rápidamente varios equipos con los mismos 3 o 4 pozos de acceso conocidos.

#### 🛑 Pausa configurable entre funciones

Nueva sección en la ventana 🗺️ Itinerario:

```
🛑 Pausa entre las paradas
☑️ Incluir una pausa entre cada parada intermedia
   Duración por pausa: [15] min
```

Marcada por defecto + 15 min (= comportamiento preservado). ⚠️ Desde la v1.98.11 esta pausa **ya no** se aplica al Modo Rescate: cada plan de rescate tiene sus propios ajustes (bloque **⏱️ Duraciones estimadas**: velocidad de búsqueda y pausa por etapa), enviados a los equipos con el plan.

> ⚠️ Como con todas las herramientas digitales bajo tierra: **lleva una brújula física** y un mapa de papel en el bolsillo. El teléfono puede averiarse, el magnetómetro puede falsearse por el metal cercano, el rastreador puede derivar. El 🚨 es una ayuda para leer información rápidamente, no un sustituto de la preparación.

### 🚨 Modo Rescate × 🌍 Vista OSM — Coordinación con servicios de rescate externos

El Modo Rescate está integrado con la Vista OSM para proporcionar a los **servicios de rescate externos** (bomberos, equipos de rescate especializados) todo lo que necesitan para intervenir en el lugar sin conocerlo.

#### 🚪 Etiqueta «Punto de entrada del plano»

Nueva etiqueta predefinida disponible en la categoría **🚨 Rescate** de la leyenda y del editor de POI. Marca la(s) entrada(s) principal(es) del sitio para los servicios de rescate:

- Icono SVG vectorial (puerta amarilla sobre fondo negro)
- Aparece automáticamente en el PDF de Briefing para bomberos (sección «POI críticos»)
- Visible también en la Vista OSM (con su georreferencia GPS)

> Para etiquetar un POI: edítalo → menú Etiqueta → categoría «🚨 Rescate» → «🚪 Punto de entrada del plano». Puedes tener varias entradas (entrada norte/sur/etc.).

#### 📍 GPS de superficie de los equipos

En la ficha de un equipo (Modo Rescate → edición de equipo), nuevo campo **📍 GPS de superficie**:

```
📍 GPS de superficie: [48.8566, 2.3522 ]
                       ↑ formato: lat, lng (decimal WGS84)
```

Indica la posición GPS del puesto de mando, del lugar de encuentro con los bomberos, o de cualquier punto de interés en superficie vinculado a ese equipo. Opcional.

→ Este dato alimenta el **PDF de Briefing para bomberos** (enlace OSM pulsable por equipo) y se conserva en la exportación `.mkmsec.json`.

#### 🌍 Vista OSM accesible en todo el Modo Rescate

El botón **🌍 Vista OSM** está presente en:
- La vista de Edición (barra del escenario)
- Las 3 vistas en directo: 👤 Operador de superficie, 🚨 Miembro de equipo, 🚑 Rescatador libre

Ya no hace falta volver a la edición para mostrar la posición del plano en OpenStreetMap a los bomberos que llegan a mitad de la misión.

#### 🚒 PDF de Briefing para bomberos

Nuevo botón **🚒 Briefing para bomberos** en todas las barras del Modo Rescate. Genera un PDF diseñado específicamente para los servicios de rescate externos, que contiene:

| Sección | Contenido |
|---------|---------|
| **INFORMACIÓN** | Nombre del escenario · nombre del plano · fecha de generación |
| **LOCALIZACIÓN** | Coordenadas GPS del centro + rectángulo delimitador + **enlace pulsable a OpenStreetMap** + **enlace pulsable a Google Maps** |
| **EQUIPOS SOBRE EL TERRENO** | Para cada equipo: nombre + miembros + GPS de superficie (si se ha indicado) + enlace OSM individual por equipo |
| **POI CRÍTICOS** | Los accesos del plano, con su nivel: primero los **abiertos** (🚪 puntos de entrada, cavidades, pozos de peldaños, escaleras de servicio — los mismos que la Salida de emergencia), luego los **cerrados** (que bomberos e IGC pueden abrir). Lista sacada de los puntos etiquetados del plano (hasta la v1.98.6 este bloque quedaba vacío) |

> 💡 **Cómo usarlo**: el PDF se imprime o se envía por correo/Signal al jefe del grupo de bomberos ANTES de su llegada. Sobre el terreno, pulsa los enlaces desde su teléfono o PC para abrir OSM o Google Maps centrados en tu sitio. No necesita instalar MyKTAMap.

#### 📤 Página «Briefing de superficie» en el informe posmisión

El informe PDF posmisión (generado con el botón 📤 Informe) incluye ahora una nueva página «BRIEFING DE SUPERFICIE» con la misma información. Útil para el debriefing geográfico con los bomberos o para archivar el expediente de intervención.

#### 🏷️ Filtro de etiquetas de la Vista OSM

Las fichas de filtro por etiqueta de la ventana de Vista OSM enumeran **todas las etiquetas presentes** en el plano, en línea con el widget de Vista OSM de la pantalla de inicio.

#### 💾 Guardar sin conexión — Vista OSM sin Internet

¿Te vas de salida subterránea, o te preparas para un Modo Rescate en una zona con pésima cobertura? Ahora puedes **descargar el mapa de OpenStreetMap alrededor de tu plano por adelantado** y consultarlo **sin Internet** una vez allí.

**Para qué sirve**:

- Abres la Vista OSM sobre el terreno incluso sin red (salida subterránea prolongada, Modo Rescate en zona sin cobertura, batería que obliga al modo avión…)
- El mapa de fondo (calles, contornos, referencias de superficie) sigue mostrándose con normalidad → sabes dónde estás respecto al plano sin depender del 4G
- Especialmente útil **para los bomberos** a quienes presentas la Vista OSM a su llegada: el mapa aparece de inmediato, sin esperas de carga

**Cómo activarlo**:

Hay un botón **💾 Guardar sin conexión** en la barra de la Vista OSM. **Basta un clic**:

1. La app descarga las teselas de OpenStreetMap visibles alrededor de tu plano + algunos niveles de zoom próximos
2. Tras la descarga, la barra muestra: **📦 N teselas · X MB** (= lo que está ya disponible en tu dispositivo)
3. Puedes volver a pulsar más tarde si amplías sobre otra zona que también quieras guardar

> 💡 **Máximo ~200 teselas por clic** (~5-10 MB): es un límite estricto para respetar la política de uso de OpenStreetMap (= servicio gratuito financiado con donaciones, así que nada de abusos). Si quieres guardar una zona muy amplia, haz varios clics desplazando la vista.

**Dónde está disponible**:

El botón 💾 Guardar sin conexión está presente en **3 contextos** — y la caché es **compartida** entre los tres:

| Contexto | Cuándo usarlo |
|---|---|
| **🌍 Ventana de Vista OSM** (modo mapa) | Preparas una salida: abres la Vista OSM, encuadras la zona y pulsas 💾 |
| **🌍 Widget OSM de la pantalla de inicio** | Preparas tus planos desde la pantalla de inicio sin tener que cargar un plano en modo mapa |
| **🚨 Modo Rescate** (barras de Creación y de Directo) | Lanzas una misión: un toque de 💾 y todo el equipo tiene la zona en su dispositivo antes de bajar |

> ✅ **Caché compartida**: descargas UNA vez → está disponible en todas partes, sin duplicados. No hace falta repetir la descarga en cada modo.

**Comportamiento inteligente sin conexión**:

Cuando la app detecta que no tienes Internet, adapta el comportamiento del icono 🌍 según lo que haya disponible en tu dispositivo:

| Internet | Plano guardado | Icono 🌍 | Acción |
|---|---|---|---|
| ✅ | – | visible | apertura normal |
| ❌ | ✅ | visible | apertura directa desde tu dispositivo (sin prueba de ping) |
| ❌ | ❌ | oculto | se necesita reconexión — mensaje claro «Plano no disponible sin conexión, pulsa 💾 cuando tengas red» |

En concreto: si guardaste tu plano la víspera con wifi, el icono 🌍 sigue visible al día siguiente con mala cobertura y la ventana se abre **directamente**, sin intentar una prueba de red que lo ralentizaría todo. Si olvidaste guardarlo, la app te lo dice claramente en lugar de dejarte dando vueltas.

**🔒 Todo permanece local y privado**:

- Las teselas descargadas se **almacenan 100 % en tu dispositivo** (tu navegador / la PWA instalada)
- **Nunca se transmite nada** a un servidor de terceros, ni al autor, ni a OpenStreetMap después de la descarga inicial
- No se registra ningún rastro de lo que guardas
- En el siguiente reinicio completo (💥 Reiniciarlo todo), las teselas guardadas se borran junto con el resto

> 💡 **Truco para una salida**: la víspera, abre la Vista OSM en tu teléfono en casa (wifi), amplía sobre la zona de la entrada y las calles de alrededor, y pulsa **💾 Guardar sin conexión**. Al día siguiente en superficie, en el punto de encuentro, incluso con cobertura débil, el mapa aparecerá al instante.

### 🚨 Modo Rescate — Explotación sobre el terreno en tiempo real

El escenario tiene **2 estados distintos**:

1. 📝 **CREACIÓN** — Vista de Edición. Preparas tus equipos, sus recorridos, sus zonas y los itinerarios sugeridos.
2. 🚀 **EJECUCIÓN** — Vista en directo en tiempo real. El equipo YA HA SALIDO, sigues sus observaciones etapa por etapa y comentas en vivo.

Cambias de un estado a otro mediante el **botón «🚀 Lanzar el plan de rescate»** de la vista de Edición.
#### 🚀 Lanzamiento del plan + selección del rol

Aparece una nueva barra dinámica en la parte superior de la vista de Edición:

| Estado de la barra | Cuándo | Botones |
|---|---|---|
| Gris «Añade al menos un equipo…» | 0 equipos definidos | Ninguno |
| **Amarillo «🚀 Lanzar»** | Al menos 1 equipo | 🚀 Lanzar el plan de rescate |
| **Verde «🟢 PLAN ACTIVO — <Rol>»** | Plan lanzado y en curso | ▶️ Reanudar la vista en directo · 📤 Informe · ⏹️ Detener |
| **Azul «📦 PLAN TERMINADO»** | Plan detenido (histórico) | 📤 Ver informe histórico · 🚀 Relanzar |

Al pulsar «🚀 Lanzar», se abre una **ventana de selección de rol** con 3 opciones:

```
◉ 👤 Operador de superficie
   Coordinas desde el puesto de mando. Ves todos los equipos en
   paralelo y puedes editar sus observaciones en supervisión.

○ 🚨 Equipo sobre el terreno: [Alfa ▾]
   Formas parte de un equipo asignado. Sigues tu recorrido etapa
   por etapa y comentas en directo.

○ 🚑 Rescatador libre
   Intervienes sin equipo preasignado (refuerzo puntual, reconocimiento).
   Tomas notas libres con marcas de tiempo.
```

> 💡 Podrás cambiar de rol más adelante sin perder las observaciones.

#### 🚨 Vista en directo — Modo MIEMBRO DE EQUIPO (paso a paso)

Para el rescatador sobre el terreno que sigue su recorrido:

```
┌─────────────────────────────────────────────────────┐
│ 🚨 Equipo Alfa · Etapa 3/5 ⏱️ 14 h 23 min │
├─────────────────────────────────────────────────────┤
│ ✓ ━ ✓ ━ ↻ ━ ○ ━ ○ │ ← indicador
│ pulsable, color de estado por etapa │
├─────────────────────────────────────────────────────┤
│ 📍 ETAPA 3 — Pozo de ventilación Norte │
│ Estado: 🟢 Sin novedad │
│ │
│ 📝 Observaciones en esta etapa: │
│ [galería central sin novedad] │
│ │
│ ⚡ Entrada rápida: │
│ [🟢 Sin nov.] [🟡 Sospechoso] [⬛ Bloqueado] │
│ [🔵 Indicio] [🟠 Ayuda] [🟣 Media vuelta] │
│ [🚨 ¡Víctima!] │
│ │
│ [📸 Foto (0/5)] [🎯 Recentrar mapa] │
├─────────────────────────────────────────────────────┤
│ [← Etapa anterior] [Etapa siguiente →] │
│ [⏸️ Pausa] [📤 Informe] [Ver edición] [⏹️ Terminar] │
└─────────────────────────────────────────────────────┘
```

**8 estados pulsables** (colores fijados en la línea gráfica):

| Emoji | Etiqueta | Cuándo usarlo |
|---|---|---|
| • | Pendiente | (estado por defecto antes de interactuar) |
| 🟢 | Sin novedad | Nada que señalar |
| 🟡 | Sospechoso | Rastros / ruidos / olores inhabituales |
| ⬛ | Bloqueado | Paso impracticable (derrumbe, agua) |
| 🔵 | Indicio | Objeto / vestigio encontrado |
| 🟠 | Ayuda solicitada | Se pide refuerzo material o humano |
| 🟣 | Media vuelta forzada | Recorrido abandonado, regreso anticipado |
| 🚨 | **Víctima encontrada** | **Urgencia absoluta** — dispara una señal roja intermitente en el puesto de mando |

**Fotos**: pulsa «📸 Foto (X/5)» → cámara trasera automática en móvil O galería. Máximo 5 fotos por etapa, compresión automática JPEG q85 con un máximo de 1920 px. Pulsa una miniatura → visor a pantalla completa con deslizamiento y zoom.

**Guardado automático**: las observaciones se guardan al salir del área de texto Y al cambiar de etapa. No hace falta ningún botón de «Guardar».

**Estado automático «Sin novedad»**: pasar a la etapa siguiente sin haber puesto un estado explícito → se marca automáticamente como «🟢 Sin novedad» (se supone que has hecho la etapa sin nada que señalar). Puedes volver a pulsar el estado si hace falta.

#### 👤 Vista en directo — Modo OPERADOR DE SUPERFICIE (visión de conjunto)

Para el puesto de mando que coordina varios equipos en paralelo:

```
┌─────────────────────────────────────────────────────┐
│ 👤 Operador de superficie · 3 equipos ⏱️ 02 h 14 min │
├─────────────────────────────────────────────────────┤
│ ┌──────────────────┐ ┌──────────────────┐ │
│ │ 🔴 Alfa 3/5 │ │ 🔵 Bravo 1/4 │ │
│ │ ████████░░ 60% │ │ ███░░░░░░░ 25% │ │
│ │ 🟢 Sin novedad │ │ 🟠 Ayuda │ │
│ │ «Sin novedad │ │ «Agua en el │ │
│ │ galería central» │ │ suelo, sube» │ │
│ │ ⏱️ 14:23 │ │ ⏱️ 14:18 │ │
│ │ [👁️ Detalles] │ │ [👁️ Detalles] │ │
│ │ [🚨 Tomar mando] │ │ [🚨 Tomar mando] │ │
│ └──────────────────┘ └──────────────────┘ │
│ ┌──────────────────┐ │
│ │ 🟢 Charlie ✓T │ ← equipo Terminado (atenuado) │
│ └──────────────────┘ │
├─────────────────────────────────────────────────────┤
│ [⏸️ Pausa] [🗺️ Mapa global] [📤 Informe global] │
│ [Ver edición] [⏹️ Terminar el plan] │
└─────────────────────────────────────────────────────┘
```

**Tarjetas especiales** con señales visuales potentes:

- 🚨 **Víctima encontrada** → tarjeta **ROJA INTERMITENTE** (animación de 1,2 s, urgencia absoluta, NO puedes pasarla por alto)
- 🟠 **Ayuda solicitada** → naranja + resplandor (hay que enviar refuerzo)
- ✓ **Terminado** → atenuado con opacidad 0,75 (todas las etapas completadas)

**Botón «👁️ Detalles»** → miniventana de solo lectura con la lista cronológica de las etapas del equipo (marca de tiempo + emoji de estado + observaciones).

**Botón «🚨 Tomar el mando»** → cambia a la vista de Miembro de equipo centrada en ese equipo concreto. Te conviertes TEMPORALMENTE en el miembro de Alfa para introducir una observación detallada en su lugar (caso típico: estás en el puesto de mando pero recibes una llamada por radio de Alfa que te dicta sus observaciones). La vista se abre en el **primer paso sin terminar de ese equipo**, aunque estuvieras más adelante con otro equipo.

**Vuelta fácil**: una vez en modo Miembro de equipo tras «Tomar el mando», aparece un botón **«👤 Volver a Operador»** en el pie. Al pulsarlo → vuelta a la visión de conjunto del Operador intacta (la vuelta sigue siendo posible tras una recarga o un cambio de plano).

**Botón «🗺️ Ver mapa global»**: oculta la ventana y dibuja la superposición del mapa con todas las zonas + puntos de paso + itinerarios de los equipos en colores OTAN.

#### 🚑 Vista en directo — Modo RESCATADOR LIBRE (notas sueltas)

Para el refuerzo puntual o el reconocimiento sin equipo preasignado:

```
┌─────────────────────────────────────────────────────┐
│ 🚑 Rescatador libre · 12 notas ⏱️ 01 h 47 min │
├─────────────────────────────────────────────────────┤
│ 📝 Añadir una nota │
│ [galería norte sin novedad] │
│ ⚡ Estado asociado: │
│ [🟢 Sin nov.] [🟡 Sospechoso] [⬛ Bloqueado] │
│ [🔵 Indicio] [🟠 Ayuda] [🟣 Media vuelta] │
│ [🚨 ¡Víctima!] │
├─────────────────────────────────────────────────────┤
│ 12. 🟢 Sin novedad · ⏱️ 16:42:18 [✕] │
│ «Cruce Este, sin novedad, continuamos» │
│ │
│ 11. 🟡 Sospechoso · ⏱️ 16:38:05 [✕] │
│ «Ruido de agua corriendo, ¿origen?» │
│ │
│ ... (cronológico DESC) │
└─────────────────────────────────────────────────────┘
```

Sin indicador de pasos ni etapas estructuradas. Solo un hilo de notas con hora y estado. Práctico para las misiones en las que el recorrido no está planificado de antemano (refuerzo que llega a mitad, equipo de reconocimiento, etc.).

#### 📤 Informe sobre la marcha

En cualquier momento durante la ejecución Y tras la detención del plan, puedes generar un informe mediante el botón **«📤 Informe»**, presente en:

- El pie de cada vista en directo (con el alcance adaptado al rol actual)
- La barra de la vista de Edición (si la ejecución está activa O terminada)

3 formatos a elegir en la ventana unificada:

| Formato | Caso de uso |
|---|---|
| 📄 **PDF imprimible A4** | Briefing global en la página 1 + página de texto con las etapas por equipo + página de fotos en cuadrícula de 2 columnas. Ideal para informe en papel / impresión / archivo / entrega en papel a los bomberos. |
| 📦 **`.mkmsec.report.json`** | Datos estructurados autónomos (fotos en base64 si se marca). Reimportable en el dispositivo del operador de superficie (consolidación entre dispositivos, ver la sección dedicada). |
| 📋 **Texto plano** | Estilo Markdown copiado al portapapeles. Para compartir por Discord / SMS / correo rápido. |

**3 alcances según tu rol**:

- 👤 **Modo Operador** → «📤 Informe global»: TODOS los equipos + sus etapas + fotos
- 🚨 **Modo Miembro de equipo** → «📤 Informe»: SU equipo únicamente (recorrido individual)
- 🚑 **Modo Rescatador libre** → «📤 Informe»: SUS notas libres cronológicas

**Vista previa compacta** en la parte superior de la ventana: título del rol + número de etapas + % de progreso + duración. **Casilla «📸 Incluir las fotos»** MARCADA por defecto (con indicación dinámica del contador). Aviso de confirmación en cada acción.

**Informe generado al instante**: refleja el estado ACTUAL del escenario. Reutilizable tantas veces como haga falta. Ideal para:
- Briefing en plena misión (instantánea intermedia para imprimir para el relevo)
- Traspaso entre dispositivos (exportación JSON → correo / memoria USB → importación en el PC del operador)
- Informe final posmisión (PDF imprimible + archivo)

#### ⏱️ Cronómetro global con pausa justa

El cronómetro ⏱️ que aparece en la parte superior de cada vista en directo se calcula desde el inicio MENOS el tiempo de pausa acumulado. Puedes pausar con el botón **«⏸️ Pausa»** (el cronómetro se congela) y luego reanudar con **«▶️ Reanudar»** — la duración de la pausa NO se contabiliza.

**Redibujado 1×/segundo** sin parpadeo visual y sin pérdida de foco en el área de texto de observaciones que estés escribiendo. Permite mantener el informe en tiempo real preciso durante misiones largas (de horas).

#### 🎬 Ciclo completo típico

```
1. 📝 Creación del escenario (vista de Edición)
   ├─ Añadir equipos Alfa/Bravo/Charlie (colores OTAN)
   ├─ Para cada equipo: recorrido entrada → etapas → salida
   ├─ Zonas de búsqueda (polígono O trazados seleccionados)
   ├─ Itinerarios calculados automáticamente (evitaciones entre equipos)
   └─ Exportación PDF / KMZ / .mkmsec.json para el briefing inicial

2. 🚀 Lanzamiento (ventana de selección de rol)
   └─ Cambio a la vista en directo según el rol elegido

3. 🚨 Ejecución (vista en directo)
   ├─ Modo Miembro: sigue el recorrido paso a paso + observaciones + fotos
   ├─ Modo Operador: visión de conjunto en tarjetas + supervisión + tomar el mando
   └─ Modo Rescatador libre: notas sueltas cronológicas

4. 📤 Informe sobre la marcha (n veces)
   ├─ PDF imprimible para el relevo / entrega en papel
   ├─ JSON para la consolidación entre dispositivos
   └─ Texto al portapapeles para Discord / correo rápido

5. ⏹️ Detención del plan (barra «📦 PLAN TERMINADO»)
   ├─ Observaciones conservadas como histórico
   ├─ Botón «📤 Ver el informe histórico» reutilizable
   └─ Botón «🚀 Relanzar» si hay nueva misión
```

#### 📥 Consolidación entre dispositivos

Al volver del terreno, cada miembro de equipo puede **compartir su informe** con el operador de superficie, que lo **importa y fusiona** con sus observaciones en el cuadro de supervisión.

**Flujo tipo — operación con 3 equipos**:

1. **Lado Operador (superficie, ANTES del incidente)**:
   - Prepara el escenario (equipos Alfa / Bravo / Charlie + recorridos + zonas)
   - Lanza el plan (🚀) → vista en directo de Operador de superficie
   - Transmite el escenario a los miembros mediante la exportación `.mkmsec.json` clásica (correo / memoria USB / AirDrop)

2. **Lado de cada Miembro (terreno)**:
   - Importa el `.mkmsec.json` del operador: la importación conserva los identificadores del puesto de mando, que es lo que permitirá al operador aceptar su informe. Si el plan **ya** está en el teléfono (plan actualizado por el operador), la vista previa ofrece **«Reemplazar»** (marcado: conserva el vínculo con el operador, pero borra los estados, observaciones y fotos ya introducidos en este teléfono) o **«Importar como copia»** (un escenario nuevo, cuyo informe el operador rechazará)
   - Lanza el plan → vista en directo de Equipo → introduce observaciones + estados + fotos por etapa
   - **Al volver a superficie**: genera su informe mediante «📤 Informe» en el pie de la vista en directo de Equipo → formato **`.mkmsec.report.json`** → exporta el archivo (descarga local)

3. **Lado Operador (regreso del terreno)**:
   - Recupera los 3 informes `.mkmsec.report.json` (uno por equipo) por el canal que prefiera (AirDrop, correo, memoria USB, Discord)
   - En la vista en directo de Operador → botón **«📥 Importar informe de miembro»** en el pie
   - Selector de archivos → selecciona el archivo → ventana de vista previa que muestra: nombre del equipo afectado, número de etapas a fusionar, fotos y **conflictos detectados** (etapas ya rellenadas del lado del operador que van a fusionarse)
   - Confirma la importación → la app hace una **instantánea PREVIA** (copia de seguridad de emergencia) y después fusiona:
     - Observaciones **concatenadas con un separador fechado** (sin ninguna pérdida)
     - Se conserva el estado **más grave**; a igual gravedad, **el más reciente** — un «Sin novedad» informado por el equipo sustituye a «En espera», una víctima nunca se rebaja
     - Fotos **importadas con deduplicación**
   - Ventana de resultado con estadísticas detalladas (X etapas fusionadas, Y fotos importadas, Z advertencias eventuales)
   - Repite con los otros 2 equipos

4. **Visualización tras la fusión**:
   - En la tarjeta de cada equipo del Operador: aparece una ficha azul «📥 importado» si al menos una etapa ha recibido consolidación
   - En la ventana «Detalles del equipo» (solo lectura): ficha «📥 importado» en cada etapa afectada + descripción emergente con la fecha de importación y la versión de la app de origen

**Seguridad de la importación**: se rechaza si el alcance no es el de miembro de equipo (los informes de operador global o de rescatador libre no son fusionables), si el escenario de origen es distinto, si el equipo no está en el escenario activo, o si no hay ninguna ejecución en curso del lado del operador. **Plano distinto del lado del miembro** → advertencia (no error: se conservan las observaciones de texto).

**Deshacer**: se crea automáticamente una instantánea de SessionBackups **ANTES** de cada importación. En caso de error, restaura desde **📊 Detalles de sesión → Copias recientes** (título: «Antes de importar el informe del miembro <nombre>»).

> ⚠️ Importante: **los equipos deben estar registrados del lado del Operador ANTES del lanzamiento** del plan (no hay creación silenciosa en la importación). Si preparas tu escenario con Alfa / Bravo / Charlie pero un miembro exporta con el nombre «Delta» creado localmente, la importación será rechazada — Delta tenía que estar en el escenario inicial.

---

## ⏪ Deshacer / Rehacer

Puedes **deshacer** y **rehacer** tus acciones sobre el plano, hasta **50 acciones atrás**.

### Atajos de teclado (recomendado)

> ⌨️ **Pulsa `?` en cualquier momento** para mostrar la lista completa de atajos (chuleta).

| Atajo | Acción |
|---|---|
| **?** | Mostrar todos los atajos (chuleta) |
| **E / M / Z / S / T / P** | Abrir Edición / Medición / Zonas / Estructuras / Rastreador / Trazados |
| **L / B / R** | Leyenda / Brújula / Búsqueda |
| **Ctrl+K** (`Cmd+K` en Mac) | Búsqueda (alternativa a R) |
| **TAB / Intro** | En un menú de herramientas abierto: recorrer las opciones / validar la selección |
| **F** | Modo presentación (Esc para salir) |
| **Ctrl+Z** (`Cmd+Z` en Mac) | Deshacer la última acción |
| **Ctrl+Y** (`Cmd+Y` en Mac) | Rehacer la acción deshecha |
| **Ctrl+Mayús+Z** (`Cmd+Mayús+Z` en Mac) | Rehacer (alternativa) |
| **Esc** | Cerrar el menú / la ventana |

> 💡 Los atajos no se activan si estás escribiendo en un campo de texto — para no romper el deshacer nativo del navegador en los campos de entrada.

### Botones en la barra lateral

Un nuevo grupo **⏪ Historial** aparece en la **barra lateral izquierda, en último lugar** (justo debajo de **⬆️ Guardar**, después de Doc / Parámetros / Cargar / Guardar). Contiene 2 subacciones:
- ⏪ **Deshacer** (= Ctrl+Z)
- ⏩ **Rehacer** (= Ctrl+Y)

Los botones aparecen **atenuados** (opacidad reducida + cursor tachado) cuando no hay nada que deshacer o rehacer. Pulsar un botón atenuado muestra igualmente un aviso breve («Nada que deshacer.» / «Nada que rehacer.») para confirmar la acción vacía.

### Lo que está cubierto

- ✏️ **Puntos**: adición, modificación (nombre/etiqueta/descripción/nivel), eliminación del último, eliminación al pulsar
- 🛣️ **Trazados**: cada clic que coloca un vértice (= 1 entrada) + eliminación del último + eliminación al pulsar + «Todos los trazados»
- ⬛ **Zonas**: ídem + cierre volviendo al 1.er punto
- 🏛️ **Estructuras**: ídem (pilares, muros, frentes)

Cada acción dispara un **aviso discreto** en la parte inferior: `↩ Deshecho: Colocación del punto PA1` o `↪ Rehecho: Eliminación de Zona Agua`.

### Lo que NO está cubierto

- ❌ **Fotos** adjuntas a los puntos: su eliminación sigue siendo **irreversible** (los archivos se borran del almacenamiento local de tu navegador y no se pueden restaurar)
- ❌ **Importaciones de sesión**: una importación que sobrescribe tu sesión no se puede deshacer con Ctrl+Z (usa el guardado automático de sesión para recuperarla)
- ❌ **Rastreador** (modo de sensores en tiempo real)
- ❌ **Medición de distancia** (= herramienta efímera, no una modificación persistente)

### Ciclo de vida del historial

- **Solo en memoria**: el historial se guarda únicamente en memoria RAM y **se pierde al recargar** la página (es intencionado, para no hinchar el almacenamiento local).
- **Reinicio al cambiar de plano**: si cargas otro plano, el historial se vacía (lógico: no querrás deshacer una acción hecha en otro plano).
- **Límite de 50 acciones**: por encima, las más antiguas se olvidan.
- **Una acción nueva borra el rehacer**: si haces 5 deshacer y luego colocas un punto nuevo, rehacer deja de ser posible (lógica de rama de historial).

---

## 🪫 Indicador de batería

La app vigila en tiempo real el nivel de batería del teléfono (cuando el navegador expone esa información) y muestra un indicador compacto en 3 lugares:

| Lugar | Aspecto |
|---|---|
| **Cabecera** de la interfaz (junto a los contadores de sesión) | Ficha compacta `⚡ 78 %` (cargando, verde) o `🪫 23 %` (descargando, color según el nivel) |
| **Pie** de la ventana 📋 Sesión activa | Línea `🔋 Estado · 🪫 23 % · Descargando` |
| **Bloque 🔋 ESTADO** del modo emergencia 🚨 | Etiqueta larga `🪫 23 % · descarga` |

### Niveles y colores

| % | Color | Comportamiento |
|---|---|---|
| ≥ 50 % | Verde / neutro | Correcto |
| 20-49 % | Amarillo-naranja | Vigila |
| 10-19 % | Naranja oscuro + aviso `🪫 Batería baja — piensa en recargar` (1 vez) |
| 5-9 % | Rojo + aviso `🪫 Batería crítica — se recomienda salir` (1 vez) |
| < 5 % | Rojo pulsante + aviso `🚨 Batería crítica — menos del 5 %` (1 vez) |

Cada umbral envía su aviso **una sola vez** por ciclo de descarga (nada de spam si oscilas entre el 10 %, el 12 %, el 9 %, etc.). El contador de umbrales se reinicia en cuanto vuelves a cargar o subes por encima del 50 %.

### Compatibilidad con navegadores

La app usa la **API Battery Status** estándar del navegador. Esta API **ya no está disponible en todas partes**:

| Navegador | Compatibilidad |
|---|---|
| Chrome Android / PC | ✅ Sí |
| Edge Android / PC | ✅ Sí |
| Samsung Internet | ✅ Sí |
| Safari iOS / macOS | ❌ No (la API se retiró por motivos de privacidad / huella digital) |
| Firefox reciente | ❌ No (la API está desactivada por defecto) |

> 🪫 **Si la API no está disponible** en tu teléfono, la ficha de batería **simplemente se oculta** — no se muestra ningún mensaje de error. Es normal en iOS. **El modo emergencia 🚨 tampoco lo muestra** (v1.97.11): sin sensor no hay nada que mostrar, y un « ? » en lugar de un nivel de batería, en la pantalla que abres justo cuando se agota, no tranquiliza a nadie. El resto del estado (rastreador, brújula) queda intacto. Lo mismo si desmarcas ⚙️ **🔋 Nivel de batería**.

---

## 📊 Estadísticas de sesión

La ventana **📋 Sesión activa** (accesible desde la cabecera, ficha 📊 en móvil) muestra un bloque de estadísticas en su parte superior.

### Lo que ves

| Estadística | Valor |
|---|---|
| **Total de anotaciones** | Suma de todos los elementos (puntos + trazados + zonas + estructuras) |
| **Desglose por tipo** | 📍 N puntos · 🛣️ M trazados · ⬛ K zonas · 🏛️ L estructuras |
| **Distancia total** | Suma de las longitudes de los trazados (paso automático de m a km por encima de 1000 m) |
| **Superficie total** | Suma de las áreas de las zonas (paso automático de m² a ha por encima de 10 000 m²) |
| **Fotos de POI** | Número de fotos adjuntas a los puntos |
| **Duración de la sesión** | Tiempo transcurrido desde el arranque de la app en este plano (`HH:MM:SS`) |

En **multinivel**, se muestra un desglose adicional por nivel (p. ej. `Nivel -1: 12 pts · 3 trazados` / `Nivel 0: 45 pts · 8 trazados`).

### Compartir el resumen

2 botones en la parte inferior del bloque de estadísticas:

- **📋 Copiar**: copia un resumen de texto al portapapeles (con formato para Discord, SMS o correo)
- **💾 Exportar TXT**: descarga un archivo `.txt` con el mismo contenido

Práctico para hacer balance de la sesión con tu compañero a la salida, o para archivar el estado de avance de la cartografía.

---

## 📐 Medición de distancia y ⬛ Medición de superficie

> Todos los botones de medición se encuentran en el grupo **📐 Medición** de la barra lateral.

### 📐 Modo Distancia (por defecto)

1. Pulsa **📐** — el modo de medición se activa (botón verde)
2. Pulsa en el plano para colocar puntos
3. La distancia total se muestra abajo a la izquierda, en metros (`📐 Distancia: X m`)

### ⬛ Modo Superficie

1. En el grupo **📐 Medición**, pulsa el interruptor **📏/⬛** para cambiar al modo superficie
2. Pulsa en el plano para dibujar un **polígono** (al menos 3 puntos)
3. El área se muestra abajo a la izquierda, en m² (`⬛ Superficie: X m²`)
4. Por encima de 10 000 m², la app pasa automáticamente a hectáreas (ha)

> **Cómo funciona**: la app convierte la superficie a m² mediante la escala calibrada del plano. La precisión depende, por tanto, del calibrado inicial del plano (`📏 ESCALA` en ⚙️ Ajustes).

### ❌ Borrar la medición

Pulsa **❌**. Se abre una ventana con dos opciones:

| Opción | Efecto |
|---|---|
| **↩️ Último punto** | Deshace únicamente el último punto pulsado (ideal si te has equivocado al pulsar) |
| **🗑️ Toda la medición** | Borra todos los puntos y pone la distancia/superficie a cero |
| Cancelar | Cierra la ventana sin borrar nada |

> Puedes retirar varios puntos uno a uno pulsando sucesivamente **❌ → ↩️ Último punto**.

> 💾 El modo (distancia/superficie) y los puntos se conservan en el guardado de la sesión — al recargar o importar una sesión, tu medición en curso se restaura tal cual.

---

## ✏️ Añadir puntos

> El botón **✏️ Edición** de la barra lateral es de **clic directo**: 1 clic = activa o desactiva el modo de adición. Cuando está activo (icono resaltado), cada clic en el mapa coloca un punto nuevo.
>
> Para **eliminar un punto**: clic en el marcador → ventana emergente → botón **🗑️ Eliminar este punto**. Para deshacer: <code>Ctrl+Z</code>.

1. Pulsa **✏️** — el modo de adición se activa (botón verde)
2. Pulsa en el plano en el lugar deseado
3. Se abre una ventana. Rellena:
   - **Nombre** (obligatorio)
   - **Tipo**: elige entre las etiquetas existentes, **— Sin etiqueta —** (icono por defecto), o **➕ Crear una etiqueta nueva…**
   - **Descripción** (opcional)
4. Valida con **✅ Añadir**

### 🎨 Tipos de iconos disponibles

La aplicación ofrece un conjunto de iconos por defecto, agrupados por categoría:

| Categoría | Tipos disponibles |
|---|---|
| 🕳️ **Pozos** | Ventilación, Taponado, Colmatado, A ras de suelo / Balsa, Extracción |
| 🪜 **Accesos** | Pozo con escalones (abierto / cerrado), Escalera de servicio (abierta / cerrada), Cavidad (abierta / cerrada) |
| ⚠️ **Señalización** | Sala, Gatera, Paso, Peligro, Información, Electricidad, Grabado, Vehículo |

> 💡 Los iconos de **Accesos** siguen un código de color intuitivo: **verde = abierto**, **rojo = cerrado**. Práctico para identificar de un vistazo los pasos utilizables.

### 🏷️ Crear una etiqueta nueva

Si el tipo que quieres no existe todavía, selecciona **➕ Crear una etiqueta nueva…**. Escribe un nombre corto (solo letras, cifras, guion bajo o guion) — por ejemplo `fuente`, `arco` o `ruina_2`.

La nueva etiqueta se añade a tu sesión y usará el icono por defecto. Para personalizar su icono de forma definitiva, modifica el plano mediante **🏗️ Crear / Modificar plano**.

### 🗑️ Borrar los puntos

El borrado se hace **directamente sobre el punto**, no desde la barra de herramientas: clic en el marcador → ventana → **🗑️ Eliminar este punto**.

| Lo que quieres | Cómo |
|---|---|
| Quitar **un** punto | Clic en el marcador → **🗑️ Eliminar este punto** |
| Deshacer el borrado | `Ctrl+Z` (o ↩️ en la barra) |
| Borrarlo **todo** | ⚙️ **Borrar la sesión**: deja el plano a cero (puntos, trazados, zonas, estructuras) |

> ℹ️ El botón 🗑️ solo aparece en **tus** puntos. Los que vienen del propio plano o de una capa de datos son de solo lectura: para quitar uno, abre antes su capa para modificarla desde 🔍 **Filtros** y luego exporta la capa corregida.

> 💡 **No** hay botón 🗑️ al lado de ✏️: el grupo Edición es un simple interruptor (modo añadir ON/OFF).

### ✏️ Modificar un punto existente

Pulsa un marcador que hayas añadido → la ventana emergente muestra el botón **✏️ Modificar** (azul). Abre la misma ventana que la de adición, **ya rellenada** con el nombre, el tipo, la descripción y las fotos ya adjuntas (si las hay).

Puedes cambiar lo que quieras y luego **💾 Guardar**. Si renombras el punto Y este tiene fotos, las fotos lo siguen automáticamente (migración interna transparente).

### 📌 Reposicionar un punto mal colocado

¿Colocaste un punto más o menos en el sitio correcto y quieres ajustarlo? Clic en el marcador → ventana → **📌 Reposicionar**.

La ventana se cierra y aparece un aviso arriba: **«Haz clic en la nueva posición de …»**. El siguiente clic en el mapa mueve el punto ahí. Hay un botón **Cancelar** por si cambias de opinión, y nada se mueve hasta que hagas clic.

Lo que el punto **conserva**: su nombre, su tipo, su descripción, sus fotos, su nivel (no cambia de planta) y su pertenencia a una capa si la abriste para modificarla. Solo cambia su posición.

El desplazamiento se puede **deshacer** con ↩️ como cualquier otra acción.

> ℹ️ El botón solo aparece en **tus** puntos (los de tu sesión). Un punto que viene de una capa de datos es de solo lectura: para reposicionarlo, abre antes su capa para modificarla desde 🔍 Filtros.

### 📸 Fotos adjuntas a los puntos

Puedes adjuntar hasta **5 fotos por punto** (límite para evitar saturar el almacenamiento del navegador). 100 % local — ninguna foto se envía a Internet.

**Al añadir o modificar** un punto, la sección **📸 Fotos (N/5)** ofrece 2 botones:

| Botón | Efecto |
|---|---|
| **📷 Hacer foto** | Abre directamente la cámara (en móvil) para hacer una foto nueva |
| **🖼️ Desde la galería** | Abre el selector de archivos (móvil y PC), puedes elegir varias fotos de una vez |

**Compresión automática**: las fotos se comprimen antes de guardarse (1920 px como máximo en el lado largo, calidad JPEG del 85 %). Una foto original de 5-10 MB pasa a ~200-500 KB. Con 5 fotos = ~2 MB por punto.

**🔒 Metadatos limpiados**: **toda** foto se recodifica al añadirla, aunque ya sea pequeña — los metadatos ocultos del archivo (**EXIF: posición GPS de la toma, fecha, modelo de dispositivo**) se eliminan sistemáticamente. Nada de eso entra en la app ni sale en una exportación. Las fotos pequeñas se recodifican sin redimensionar con calidad alta (degradación invisible).

**🛡️ Exportación anonimizada + fotos**: en 💾 Guardar sesión → 📦 Completa, la casilla «🛡️ Anonimizar para compartir públicamente» acepta ahora las fotos: cada una se **recodifica sin metadatos** (incluidas las añadidas antes de la llegada de esta protección) y se **renombra** (`photo-anon-1`, `photo-anon-2`…), vinculada a los códigos anonimizados de los puntos (`📍 POI salle #1`…). Una foto que no pueda recodificarse queda **excluida** de la exportación — nunca se incluye tal cual. La nota libre y el PDF de Historia siguen excluidos de la exportación anonimizada.

**Retirar una foto**: pulsa la cruz ✕ roja de la esquina superior derecha de la miniatura → aparece atenuada con rayas rojas (marcada para eliminar). Si cambias de opinión, pulsa la flecha verde ↺ para anularlo. La eliminación real solo ocurre cuando **💾 Guardas**.

**Si cancelas** la ventana de edición en lugar de guardar, **las fotos que acabas de añadir se borran** (limpieza automática). En cambio, las marcas de eliminación se **anulan** — la foto permanece.

**Visualización**:

1. En la **ventana emergente** del marcador (clic en el mapa): aparece una fila de miniaturas de 44×44, con el contador «📸 N fotos». Pulsa una miniatura → abre el **visor a pantalla completa**.
2. En el **visor a pantalla completa**:
   - **Móvil**: pellizca con 2 dedos para ampliar (1× a 4×), arrastra para desplazarte, desliza en horizontal para pasar a la foto anterior o siguiente
   - **PC**: rueda del ratón para ampliar, arrastre del ratón para desplazarte, flechas `← →` o botones superpuestos `◂ ▸` para navegar, `Esc` para cerrar
3. En la app: un contador **📸 N** aparece en la barra superior (junto a los demás contadores 📍 / 🛣 / ⬛ / 🏛️). Púlsalo → ventana «📊 Detalles de la sesión» con el desglose por punto.

**Compartir / guardar**: las fotos se **incluyen** en:
- 💾 Guardar sesión → pestaña 📦 Completa / 🎨 Avanzado / 🔄 Conversión → marcar «📸 Incluir las fotos»
- Reimportación de sesión ZIP → fotos restauradas automáticamente
- 📦 Generador de ZIP del plano (modo Modificar) → opción «📸 Incluir las fotos adjuntas»
- Al crear un plano nuevo mediante el generador, botón «📦 Importar una capa de datos ZIP con un clic» → puedes recuperar los puntos + fotos exportados desde otro plano

**Límites técnicos**:
- Almacenamiento local del navegador — cuota de ~50-200 MB según el dispositivo. Un aviso te advierte si te acercas a la cuota
- En **PWA independiente de iOS Safari**, el navegador puede vaciar ese almacenamiento local si falta espacio o si se desinstala — exporta regularmente tus planos + fotos para ponerlos a salvo
- En caso de reinicio completo de la app (💥 Reiniciarlo todo), **todas las fotos se borran** (coherente con el borrado total)

---

## 🛣️ Trazar vías

> Todos los botones de trazado se encuentran en el grupo **🛣️ Trazados** de la barra lateral.

- **🟩 Vía principal** — verde intenso
- **🟪 Vía secundaria** — violeta
- **🟨 Camino** — amarillo
- **🪜 Unión entre niveles** — magenta discontinuo (con círculos blancos en los extremos). **Solo aparece si el plano está en modo multinivel** — sirve para conectar dos plantas (escalera, pendiente pronunciada, pozo interno). Ver la sección **🏗️ Modo multinivel** más abajo para los detalles.
Para trazar: pulsa el botón correspondiente → pulsa en el plano para colocar puntos → vuelve a pulsarlo para detenerte.

### 📏 Distancia total de los trazados

El botón **📏 Distancia total** del grupo **🛣️ Trazados** abre una ventana que calcula la **suma de las longitudes** de todos tus trazados visibles, con un filtro por tipo.

**Cómo funciona:**

1. Pulsa **📏** — la ventana se abre con 3 casillas marcadas (Principal, Secundaria, Camino)
2. Desmarca los tipos que quieras excluir del cálculo
3. El **total en metros** se actualiza al instante, y los trazados incluidos se **resaltan en magenta** en el mapa (halo luminoso para verlos bien)
4. Para cada tipo, la ventana muestra el **número de trazados** y su **longitud acumulada**
5. Dos formas de salir:
   - **✓ Cerrar (conservar el resaltado)** — la ventana se cierra pero el **resaltado magenta sigue visible** en el mapa. Puedes explorar el mapa con los tramos siempre visibles, y volver a pulsar **📏** para reabrir la ventana (los filtros anteriores se conservan).
   - **❌ Borrar el resaltado** — retira el halo magenta del mapa Y cierra la ventana.

> 💡 El cálculo incluye **todas** las vías visibles: las que has trazado en la sesión Y las presentes en las **capas de datos** activadas. Si ocultas una capa en el control de capas, sus vías salen automáticamente del cálculo.
>
> ℹ️ Esta medición es **solo en pantalla** — no aparece en la leyenda de la exportación de imagen PNG.

### 🧹 Borrar un trazado

Pulsa **🧹**. Se abre una ventana con tres opciones:

| Opción | Efecto |
|---|---|
| **↩️ Último punto del trazado** | Deshace únicamente el último punto pulsado en el trazado en curso (ideal para corregir un punto mal colocado) |
| **✂️ Último trazado entero** | Elimina el último trazado completo (útil si quieres rehacer un trazado sin tocar los anteriores) |
| **🗑️ Todos los trazados** | Borra absolutamente todos los trazados (irreversible) |
| Cancelar | Cierra la ventana sin borrar nada |

> Ejemplo de uso: estás trazando una vía principal y te equivocas en la última curva. Pulsa **🧹 → ↩️ Último punto del trazado** para retroceder un punto y luego continúa tu trazado con normalidad.

> 💡 **Uniones entre niveles (modo multinivel)**: las uniones 🪜 se tratan como trazados normales en 🧹. **Último trazado entero** elimina la última unión si es la más reciente; **Todos los trazados** borra vías Y uniones; **Selección al pulsar** también funciona sobre una unión.

---

## ⬛ Trazar zonas

> Todos los botones de zonas se encuentran en el grupo **⬛ Zonas** de la barra lateral.

Permite dibujar **superficies cerradas** para anotar espacios particulares del plano: escombros, zonas derrumbadas, láminas de agua o zonas inaccesibles que bloquean el cálculo de itinerario.

| Tipo | Icono | Color | Efecto en el buscador de rutas |
|---|---|---|---|
| **Escombros** | ⬛ | Gris oscuro | Ninguno |
| **Derrumbe** | 🟥 | Rojo | Ninguno |
| **Agua** | 🟦 | Azul | Ninguno |
| **Inaccesible** | ⛔ | Rayado rojo oscuro / negro | 🚫 **BLOQUEA** — el itinerario nunca pasará por esta zona |

### ✏️ Cómo trazar una zona

1. Pulsa el icono del tipo deseado (⬛, 🟥, 🟦 o ⛔) — el modo se activa
2. Pulsa en el plano para colocar los puntos (al menos 3)
3. Para cerrar la zona, **dos opciones**:
   - **Volver a pulsar el primer punto** (aparece un círculo sobre él en cuanto hay 3 puntos colocados)
   - **Pulsar ✅** — cierra la zona en el lugar del último punto
4. La zona se rellena automáticamente con su color

> Durante el trazado, los segmentos aparecen discontinuos. Una vez cerrada, la zona se rellena.

### ⛔ Zona «Inaccesible» — bloquea el itinerario

Traza una zona de tipo **⛔ Inaccesible** sobre una parte del plano que quieras **prohibir al buscador de rutas** (derrumbe reciente que hace peligroso el paso, agua profunda, paso sin balizar, etc.).

**Efecto**: todo itinerario calculado que hubiera atravesado esta zona pasará ahora por otro camino. Si no existe otro camino, el cálculo falla con un mensaje claro.

Es una **restricción estricta por defecto**, pero puedes relajarla: la casilla «Respetar las zonas inaccesibles» de la ventana Itinerario viene marcada; desmarcarla deja que el trayecto las atraviese. ⚠️ El **Modo Rescate** y el modo «Perdido» las respetan en cualquier circunstancia — una preferencia de comodidad no amplía un perímetro de socorro. Si quieres una restricción **flexible** (evitar si es posible, y si no pasar igualmente con un mensaje), usa mejor las **🚫 Preferencias de evitación** de la ventana de itinerario (ver la sección dedicada más abajo).

**Multinivel**: la zona ⛔ bloquea únicamente los segmentos del **mismo nivel** (coherente con el filtro de nivel). Una zona inaccesible en el Niv. 0 no afecta al itinerario del Niv. -1.

**Independiente del interruptor de capa**: aunque desmarques la capa de zonas en el control de capas, la zona sigue siendo tenida en cuenta por el buscador de rutas.

### 🧱 Orden de visualización

Las zonas se superponen en este orden, independientemente del orden de trazado:

1. **Agua** (al fondo)
2. **Escombros** (por encima del agua)
3. **Derrumbe** (por encima)
4. **Inaccesible** (por encima de todo — para ver bien las zonas bloqueantes)

Esto permite, por ejemplo, trazar un derrumbe sobre unos escombros sin que quede oculto.

### 🧹 Borrar una zona

Pulsa **🧹**. Se abre una ventana con estas opciones:

| Opción | Efecto |
|---|---|
| **↩️ Deshacer el último punto** | En la zona en curso, o en la última zona cerrada |
| **✂️ Última zona (en curso O cerrada)** | Elimina la zona que estás dibujando si existe, si no la última cerrada |
| **🎯 Seleccionar una zona para eliminar** | Activa un modo en el que pulsas una zona del mapa para eliminarla |
| **🗑️ Todas las zonas** | Borra absolutamente todo (irreversible) |

---

## 🏛️ Estructuras (pilares, muros, frentes de cantera)

Específico de las **canteras subterráneas**: las estructuras permiten cartografiar los elementos físicos portantes (pilares de sostenimiento, muros) y el avance del frente de explotación (frentes de cantera). Independiente de los trazados y las zonas — es una 4.ª capa de anotación.

> Todos los botones están en el grupo **🏛️ Estructuras** de la barra lateral.

### 5 subtipos disponibles

| Tipo | Icono | Forma | Color | Uso típico |
|---|---|---|---|---|
| 🟡 **Pilar 1.ª masa** | polígono | amarillo | Pilar portante del nivel superior (caliza de 1.ª masa) |
| 🟠 **Pilar 2.ª masa** | polígono | naranja | Pilar del nivel inferior (caliza de 2.ª masa). En modo multinivel, se etiqueta automáticamente en el nivel -1 |
| 🔵 **Muro** | polígono | azul | Muro de piedra seca, bloque de hormigón, sostenimiento de mampostería |
| 🟨 **Frente de cantera 1.ª masa** | polilínea | amarillo (trazo) | Frente de explotación del nivel superior — es una LÍNEA, no un polígono cerrado |
| 🟧 **Frente de cantera 2.ª masa** | polilínea | naranja (trazo) | Frente de explotación del nivel inferior. En modo multinivel, se etiqueta automáticamente en el nivel -1 |

### Dibujar una estructura

1. Pulsa el subtipo deseado (🟡 / 🟠 / 🔵 / 🟧 / 🟨) — se activa (encendido)
2. Pulsa sucesivamente en el mapa para añadir los puntos
3. **Pilares + Muros (polígonos)**: mínimo 3 puntos. Para terminar, vuelve a pulsar el icono encendido → cierra automáticamente el polígono (une el último punto con el primero)
4. **Frentes de cantera (polilíneas)**: mínimo 2 puntos. Para terminar, vuelve a pulsar el icono encendido → valida la línea sin cerrarla

Durante el dibujo, la vista previa se actualiza en tiempo real. El color y la transparencia son fijos por tipo.

### 🧹 Borrar las estructuras

Pulsa **🧹** en el grupo Estructuras:

| Opción | Efecto |
|---|---|
| **↩️ Deshacer el último punto** | En la estructura en curso, o en la última estructura |
| **✂️ Última estructura (en curso O cerrada)** | Elimina la que se está dibujando si la hay, si no la última validada |
| **🎯 Seleccionar una estructura para eliminar** | Modo de clic en el mapa — selecciona la que quieras borrar pulsando sobre ella o cerca de su borde |
| **🗑️ Todas las estructuras** | Borra absolutamente todo (irreversible) |

> 💡 El modo «🎯 Seleccionar» es práctico para borrar una estructura concreta en medio de un plano cargado, sin tener que contar cuál fue «la última añadida».

### Diferencia con las zonas

| | Zonas (⬛) | Estructuras (🏛️) |
|---|---|---|
| Forma | Solo polígono cerrado | Polígono O polilínea según el tipo |
| Colores | Agua / Escombros / Derrumbe / Inaccesible | Pilar 1/2 / Muro / Frente 1/2 |
| Efecto en el buscador de rutas | ⛔ Inaccesible **bloquea** el itinerario | Ninguno (solo lectura) |
| Uso típico | Delimitar zonas de terreno (agua estancada, etc.) | Cartografiar la arquitectura subterránea (pilares, muros, avance) |

> 🏗️ **Modo multinivel**: los Pilares de 2.ª masa y los Frentes de cantera de 2.ª masa se **etiquetan automáticamente en el nivel -1** al crearlos (la app considera que la 2.ª masa está debajo). Los demás tipos toman el nivel activo actual. Puedes modificar los niveles a posteriori mediante el editor JSON.

---

## 🫧 La ventana de un objeto: nota, conversión, eliminación

Al hacer clic en **un trazado, una zona o una estructura que hayas dibujado** se abre una pequeña ventana. Es la misma para las tres familias.

| Elemento | Para qué sirve |
|---|---|
| **Área de texto** | Una nota libre, con varias líneas si quieres: el estado del paso, una observación, un recordatorio |
| **💾 Guardar la nota** | Guarda la nota. La ventana se cierra sola |
| **🔄 Convertir** | Cambia el **tipo** del objeto y, si hace falta, su **familia** |
| **🗑️ Eliminar** | Retira el objeto. En rojo, en su propia línea |

### 📍 La ventana de un punto

Un toque en un **marcador** (un punto del plano o uno que has añadido) abre su ventana: nombre, tipo, nota y una fila de botones.

| Botón | Para qué sirve |
|---|---|
| **📍 Estoy aquí** | Recalibra el seguimiento en este punto. Es también lo que **confirma tu posición**: a partir de ahí, 🚨 Salida de emergencia y 🧭 Ir allí parten de aquí sin preguntar |
| **🧭 Ir allí** | Calcula una ruta desde tu posición hasta este punto |
| **➕ Ruta** | Añade el punto como etapa de una ruta (en curso o nueva) |
| **☆ Favorito** | Añade o quita el punto de ⭐ Favoritos |
| **🔊 Leer la nota** | Lee la nota en voz alta (síntesis de voz local) |
| **📋 GPS** | Coordenadas GPS copiables, si el plano está georreferenciado |
| **📸 Miniaturas** | Las fotos adjuntas, toque = pantalla completa |
| **🌀 Enlaces** | Los enlaces entre planos que parten de este punto |

En **tus propios puntos** (los de tu sesión) se añaden **✏️ Editar**, **📌 Reposicionar** (luego toca la nueva posición en el mapa) y, en su propia línea roja, **🗑️ Eliminar**, deshacible con ⏪.

### 🔄 Convertir: cambiar un objeto de tipo o de familia

El caso típico: en un levantamiento importado del SIG, un **frente de explotación** es en realidad una **galería**. Mientras siga siendo una estructura, no entra en el cálculo de itinerarios: el calculador solo lee los trazados. Convertirlo en trazado lo mete en el grafo.

La ventana solo propone destinos **compatibles con la forma** del objeto: una **línea** (trazado, frente) solo puede convertirse en otra línea, y una **superficie cerrada** (zona, pilar, muro) en otra superficie cerrada. No se puede transformar una línea en un polígono: no hay con qué cerrarla.

El objeto conserva todo lo demás: su geometría, su nivel y su nota.

### 🛰️ Las opciones que usan un sensor

⚙️ **Ajustes** → **🛰️ Opciones por sensor**. Estos ajustes dependen de un sensor del teléfono y **cada uno se puede apagar por completo**: una opción desactivada no muestra nada y no escucha nada.

| Opción | Por defecto | Qué hace |
|---|---|---|
| **🔋 Nivel de batería** | activado | Muestra la carga restante arriba y avisa por debajo del 20 %, 10 % y 5 %. Desmarcada: sin icono **y** sin escucha del sensor |
| **📳 Vibración háptica** | **desactivada** | Respuesta táctil en algunas acciones |

> ℹ️ **Apagar la batería surte efecto en el próximo arranque.** La escucha se establece al iniciar la app y no hay forma limpia de retirarla sobre la marcha: la app te lo dice en vez de disimular.

#### ⛔ «Sensor rechazado»

Si una opción aparece **atenuada** con «Sensor rechazado por iOS» o «por este dispositivo», no es un fallo ni un olvido: **tu sistema no cede ese sensor a las páginas web**. Apple no ofrece ni la vibración ni el nivel de batería a un sitio, aunque esté instalado como aplicación.

> 💡 Antes estas opciones simplemente se **ocultaban**: era imposible saber si no existían o si el teléfono las rechazaba. Ahora se muestran, con el motivo.

### 🏁 Tu distancia cuando el podómetro no vio nada

Con el teléfono en el bolsillo, el podómetro cuenta casi nada. Pero cada **📍 Estoy aquí** que colocas sobre un punto del plano deja una **referencia con hora**. La app une esas referencias **siguiendo tus galerías** —el mismo cálculo que un itinerario— y deduce la distancia realmente recorrida entre ellas.

En la práctica: una referencia a las 12:00, otra a las 12:30, otra a las 13:00 → la app calcula A→B→C por las galerías, no en línea recta.

#### 🏁 El último tramo, el que se perdía

Un tramo solo se calcula cuando llega la referencia **siguiente**. Así que todo lo que andas **después de tu última referencia** no lo contaba nadie.

Al pulsar **🏁 Cerrar mi salida**, la app te pregunta **por dónde saliste**. Un toque en el mapa y el último tramo entra en el total. Puedes **Omitir** si cierras desde casa.

#### Lo que la ficha te dice del número

| Lo que pone | Qué significa |
|---|---|
| *de los cuales 900 m calculados por las galerías entre 6 referencias* | El recorrido se reconstruyó sobre tus trazados: es fiable |
| *de los cuales 900 m en línea recta entre 6 referencias (sin afinar)* | Líneas rectas entre referencias: **infravalorado**, a veces mucho |

> ⚠️ **Lo que este cálculo no sabe hacer**: toma el camino **más corto** entre dos referencias, no necesariamente el tuyo. Idas y vueltas, callejones explorados, dudas: todo queda infravalorado. Y sin ningún «Estoy aquí» no hay nada que unir: la distancia seguirá siendo la del podómetro.

### ⏱️ Cómo se cuenta la duración de una salida

Una salida de **campo** se cuenta **de la salida al final**, no por el tiempo que la app estuvo abierta. Es lo que quieres decir con «estuvimos 3 horas»: el teléfono en el bolsillo cuenta, y la app en reposo también.

La ficha también muestra el **tiempo con la app abierta**, justo debajo. No es un duplicado: indica cuánto vale la medición. *3 h de salida con 12 min de app* es un podómetro que apenas vio nada, así que la distancia hay que cogerla con pinzas.

> ℹ️ Una sesión de **trabajo sobre plano** conserva el tiempo de uso: dejas un plano abierto toda la tarde sin mirarlo, así que la duración real no significaría nada.

#### ✏️ Corregir un final olvidado

Si no pulsaste **🏁 Cerrar mi salida** al salir, la app no sabe cuándo te fuiste: toma el último momento en que estuvo viva, a menudo cuando el teléfono la durmió. La duración queda entonces infravalorada.

Abre la ficha de la salida → **✏️ Corregir el final** e introduce la hora real. La duración se recalcula al instante.

> ℹ️ El **tiempo con la app abierta** nunca se modifica: es una medición, no una declaración. Y un final anterior al inicio se rechaza.

### 🔁 Una salida partida en varias: reanudación y fusión

Si sales de MyKTAMap durante una salida —para cambiar de música, para atender una llamada— el teléfono puede **descargar la app** para liberar memoria. Antes, al volver se iniciaba una salida **nueva**: una sola salida real aparecía como dos o tres en el cuaderno, cada una con parte de los contadores.

**Ahora se reanuda sola.** Al volver, si la salida anterior del mismo plano se interrumpió así hace menos de **45 minutos**, la app la **continúa** en vez de abrir otra. Un mensaje te lo indica.

**Y si abres otro plano por el camino** —para enseñárselo a alguien, para comprobar un paso— tu salida queda **en pausa**, no terminada. Vuelve al plano de tu salida en menos de **2 horas**: se **reanuda** donde estaba, contadores y trazado incluidos. Pasado ese tiempo, se guarda en el cuaderno como siempre. El tiempo pasado en el otro plano no se suma a tu salida. ⚠️ El **seguimiento**, en cambio, se detiene al cambiar de plano: al reanudarse una salida de campo, la app te propone **«▶️ Reanudar el seguimiento»** — basta con un toque.

> ℹ️ Una salida que hayas cerrado **tú mismo** (🏁) nunca se vuelve a unir. La app solo reanuda lo que se cortó *sin que lo quisieras*.

#### 🔗 Volver a unir salidas ya partidas

Para las anteriores, o si se superó el plazo: 📔 **Mi cuaderno** → **🔗 Fusionar salidas** → marca las que quieras unir (al menos 2) → **Fusionar**.

| Lo que se une | Cómo |
|---|---|
| Duración, distancia, pasos, añadidos | Se suman |
| Duración total | Del **inicio de la primera al final de la última**, huecos incluidos |
| Notas | Se apilan, separadas por una línea |
| Fotos, trazados, niveles | Se reúnen |
| Campo / escritorio | Si **una sola** parte era de campo, el conjunto lo es |

> ⚠️ **Irreversible**: las salidas originales desaparecen del cuaderno. La app pide confirmación: es la única acción del cuaderno que borra algo.

### 🪟 Dónde se abren los paneles de herramientas

Los paneles **Trazados**, **Zonas** y **Estructuras** se abren **centrados en pantalla**, como el Rastreador y los Filtros.

> 🐛 **Por qué cambió**: antes quedaban pegados a la parte superior de su botón. Cuanto más larga era su lista —un plano importado añade un tipo por nivel—, más bajaban, hasta pasar por debajo del borde inferior en el móvil: los últimos botones quedaban fuera de alcance.

Si prefieres el comportamiento anterior, marca **🪟 Anclar los paneles de herramientas a su botón** en ⚙️ **Ajustes**. Es cómodo en pantalla grande, donde no falta sitio; poco recomendable en móvil.

### 🎯 Convertir varios objetos de golpe

En un levantamiento importado es habitual tener **decenas** de objetos mal tipados: por ejemplo, todos los frentes de explotación de un nivel que en realidad son galerías. Rehacerlos uno a uno sería interminable.

En la ventana de conversión, pulsa **🎯 Seleccionar varios objetos para convertir**. La ventana se aparta y aparece un aviso:

| Gesto | Efecto |
|---|---|
| **Clic en un objeto** | Lo añade a la selección (se muestra en azul discontinuo) |
| **Volver a hacer clic en un objeto ya seleccionado** | Lo quita, para corregir un fallo de puntería sin empezar de cero |
| **➕ Todos los «tipo» del nivel mostrado** | Extiende la selección a **todos** los objetos del mismo tipo que el último añadido |
| **✅ Convertir (N)** | Vuelve a abrir la ventana de elección, con el lote |
| **Cancelar** | Abandona la selección |

**⛔ No se mezclan líneas y superficies cerradas.** Si tu selección está hecha de **líneas** (trazados, frentes), hacer clic en una **zona** o un **pilar** se rechaza, y el aviso te dice por qué. Es la misma regla que en una conversión simple: no hay ningún destino común, no se puede cerrar una línea.

En cambio **sí puedes mezclar familias** mientras la forma coincida: los frentes (estructuras) y los caminos (trazados) son ambos líneas, así que puedes convertirlos juntos en galerías.

Los objetos que **ya** son del tipo elegido simplemente se dejan como están: el mensaje final te dice cuántos se convirtieron y cuántos ya estaban bien.

> 💡 Todo el lote se deshace con un **solo** `Ctrl+Z`. No son N conversiones, es una.

### 🗑️ Eliminar

**Sin ventana de confirmación**: la red de seguridad es `Ctrl+Z`, igual que para un punto, y el mensaje que aparece te lo recuerda. El botón es **rojo y está en su propia línea**, apartado de «Guardar», para que no se pulse sin querer.

> ℹ️ Estas tres acciones solo aparecen en **tus** objetos. Un objeto que viene de una capa de datos abre una ventana de **solo lectura**: para corregirlo o eliminarlo, abre antes su capa para modificarla desde 🔍 **Filtros** y luego exporta la capa corregida.

## 🏗️ Modo multinivel (canteras de varias plantas)
Algunas canteras y galerías tienen **varios niveles físicamente apilados** (Glacière, Capucins, yacimientos con plantas). El modo multinivel permite gestionar correctamente esos planos: cada trazado/zona/punto pertenece a un nivel, y el buscador de rutas no atraviesa mágicamente de un nivel a otro por los cruces visuales en 2D.

> 📚 **Coherencia visual de los niveles**: cuando el modo multinivel está activado, los trazados se apilan automáticamente según su nivel — una galería del Nivel 0 aparece siempre **POR ENCIMA** de una galería del Nivel -1, y la del Nivel +1 por encima del Nivel 0. Dentro de un mismo nivel: Camino (detrás) < Secundaria < Principal (encima). El itinerario calculado y las zonas inaccesibles ⛔ pasan siempre por encima de todo para seguir siendo visibles.

> ⚠️ **Modo opcional** — desactivado por defecto. La mayoría de las canteras son de un solo nivel y el modo clásico basta. Actívalo **únicamente** para las canteras de varias plantas de verdad.

### Activar el modo para un plano

**2 maneras**:

1. **Al crear o modificar un plano** (mediante 📦 Crear un plano o ✏️ Modificar un plano existente): marca la casilla **🏗️ Plano multinivel (avanzado)** en la sección «Información del plano». El ZIP generado contiene la marca → al importarlo, el modo se activa automáticamente.

2. **Manualmente en plan-config.json**: añade `"multiLevel": true` en la sección `plan`, guarda y recarga el plano.

> 🔧 **Activación mediante el generador**: para activar el modo multinivel en un plano existente, **pasa por el generador**: 🏗️ Modificar un plano existente → marca **🏗️ Plano multinivel** → 📦 Genera el ZIP actualizado → recárgalo. Eso obliga a una declaración explícita y evita incoherencias entre el estado en ejecución y `plan-config.json`.

> 💡 Si quieres desactivar el modo multinivel de un plano, pasa también por el generador (desmarca la casilla y vuelve a generar). Los trazados existentes conservan su información de nivel en el JSON (oculta si la función está desactivada) — puedes reactivarlo más tarde sin perder nada.

### La pastilla «Nivel activo»

Cuando el modo está activado, aparece una **pastilla amarilla** con la cifra del nivel activo (`0` al arrancar, por ejemplo `[0]`) **bajo los botones de zoom de Leaflet** (arriba a la izquierda del mapa, justo debajo de los `+` `-`). Púlsala para abrir la **ventana de Niveles**.

> 💡 Si activas más tarde el widget 🧭 Brújula mientras el modo multinivel está activo, la brújula se coloca automáticamente **debajo de la pastilla** para no solaparse.

### La ventana de Niveles

Dos secciones:

#### 🎯 Nivel activo (para dibujar)

Botones de opción `[ − ] [-2] [-1] [0] [1] [2] [ + ]` (5 niveles por defecto, simétricos en torno al 0). El nivel pulsado pasa a ser el **nivel activo**: todos los nuevos trazados, zonas y puntos de editor que dibujes se etiquetarán con ese nivel.

**Convención numérica**:
- **`0`** = nivel de referencia (= los elementos sin nivel etiquetado — típicamente los planos creados antes de la llegada del multinivel). Es tu planta baja / la galería principal.
- **`1, 2, 3…`** = plantas superiores / niveles por encima de la planta baja
- **`-1, -2, -3…`** = sótanos / niveles por debajo de la planta baja

⚠️ **Cambiar de nivel activo cancela cualquier trazado en curso** (si habías empezado una vía principal en el Niv. 0 y cambias al Niv. -1, el trazado en curso desaparece). Es intencionado, para evitar que un trazado quede a caballo entre 2 niveles.

⚠️ **Reinicio de los visibles**: cambiar de nivel activo marca **únicamente ese nivel** en la sección «Niveles visibles» de debajo (modo enfocado por defecto).

**2 botones de extensión**:
- **[ + ]** (a la derecha): añade un nivel superior (máx. + 1). Útil para plantas por encima.
- **[ − ]** (a la izquierda): añade un nivel inferior (mín. − 1). Útil para sótanos adicionales.

💡 **Autoextensión**: si cargas un plano cuyas capas de datos ya contienen elementos en niveles fuera del rango por defecto (p. ej. un pozo etiquetado con `level: 4`), la app amplía automáticamente la lista de niveles disponibles para que puedas seleccionarlos o filtrarlos.

#### 👁️ Niveles visibles (filtro)

Casillas por nivel. Los trazados/zonas/puntos de los niveles **no marcados** quedan ocultos en el mapa (opacidad 0). Las uniones entre niveles siguen visibles si **al menos uno** de sus extremos toca un nivel marcado.

**🏗️ El plano principal ES el nivel 0**: desmarcar el nivel **0** oculta también **la imagen principal del plano** (teselas incluidas) — por fin puedes mirar una planta sola (p. ej. únicamente la capa transparente del nivel -1), sin el fondo del nivel 0 ensuciando la superposición. Vuelve a marcar el 0 y reaparece. Sin modo multinivel, el plano principal nunca se oculta.

**🫥 Transparencia de las capas de nivel**: para que la superposición tenga sentido, cada capa de nivel (≠ 0) debe ser un **PNG con fondo transparente**. El generador te avisa ahora al generar si una capa de nivel es opaca (JPEG, o PNG con el fondo aplanado) — ocultaría todo lo que hay debajo.

Botones rápidos:
- **Todos**: marca todos los niveles disponibles
- **Solo el activo**: marca únicamente el nivel activo

### 🪜 Trazar una unión entre niveles

Para conectar dos niveles físicamente (escalera, pendiente pronunciada, pozo interno, escala entre plantas), utiliza la subacción **🪜 Unión entre niveles** del grupo **🛣️ Trazados**.

> ⚠️ **Visibilidad condicional**: el botón 🪜 **solo aparece si el modo multinivel está activado** en el plano actual. Si no lo ves, comprueba primero que la pastilla amarilla `[N]` sea visible arriba a la izquierda.

**Procedimiento paso a paso**:

1. Abre el grupo plegable **🛣️ Trazados** de la barra lateral.
2. Pulsa la subacción **🪜 Unión entre niveles**.
3. Se **abre una ventana** con 2 selectores: `Nivel de partida` y `Nivel de llegada`. Por defecto, «partida» = tu nivel activo. Elige el segundo nivel y pulsa **Aceptar**.
4. El modo de trazado arranca. **Pulsa en el mapa** para colocar tantos puntos como quieras (como en una polilínea normal). Puedes seguir la forma exacta de la escalera o trazar una simple diagonal.
5. **Vuelve a pulsar 🪜** para validar y salir del modo de trazado.
6. La unión aparece en **magenta discontinuo** con un **círculo blanco y magenta** en cada uno de sus 2 extremos.

**Semántica de los 2 niveles**: *partida* y *llegada* son **simétricos** para el buscador de rutas — da igual cuál pongas primero, el itinerario atraviesa la unión en ambos sentidos. Elige el orden que te resulte natural (p. ej. una escalera que baja del Niv. 1 al Niv. 0 → `partida: 1, llegada: 0`; un pozo que baja del Niv. 0 al Niv. -1 → `partida: 0, llegada: -1`).

**Visibilidad de una unión**: sigue visible si **al menos uno** de sus 2 niveles está en la lista de niveles visibles. Ejemplo: unión `0 ↔ 1`, filtro `[0]` activo → unión visible (porque el 0 está en el filtro). Filtro `[2]` → unión oculta.

**Caso particular: una sola unión = un solo paso lógico**. Si en la realidad hay 2 escaleras entre los mismos niveles, traza **2 uniones distintas** en los 2 lugares físicos. El buscador de rutas elegirá automáticamente la más corta según el trayecto solicitado.

> 💡 **Importante para el buscador de rutas**: las uniones son los **únicos puentes** entre niveles. Si quieres que un itinerario pase del Niv. 0 al Niv. 1, **DEBES** trazar una unión entre esos 2 niveles en el lugar físico del paso (la escalera real). Sin unión, el buscador de rutas se niega a atravesar aunque visualmente 2 trazados se crucen en la pantalla.

### 🧹 Borrar una unión

Las uniones se borran **exactamente igual que los demás trazados** mediante la subacción 🧹:
- **🎯 Selección al pulsar** → pulsa la unión → confirma la eliminación
- **✂️ Último trazado entero** → si la unión es el último trazado hecho, se elimina
- **🗑️ Todos los trazados** → borra absolutamente todo (vías + uniones)

### Añadir nivel a las capas de imagen

En el **🏗️ Generador de planos**, cada capa de imagen (leyenda, tramas, etc.) tiene un campo **🏗️ Nivel** (visible únicamente cuando **🏗️ Plano multinivel** está marcado). Indica ahí el nivel al que pertenece la capa (número entero, por defecto `0`).

**En ejecución**: la capa se muestra u oculta automáticamente según tu filtro «Niveles visibles» de la ventana de Niveles. La ventana tiene **autoridad** sobre la casilla de Leaflet del control de capas → si desmarcas una capa manualmente, el cambio de nivel vuelve a aplicar el estado correcto.

**Retrocompatibilidad**: si modificas un ZIP existente que no tenía `level` en sus capas de imagen, se muestran como `0` en el generador — modifícalas para repartirlas por nivel si hace falta.

### Añadir nivel a las capas de datos

Las capas de datos existentes (`puits.json`, `cataphile.json`, etc.) también pueden tener elementos etiquetados por nivel. Añade manualmente `"level": N` en el JSON:

```json
{
  "data": [
    { "id": "PA1", "nom": "Pozo de ventilación Niv 1", "x": 100, "y": 200, "tags": ["pa"], "level": 1 }
  ],
  "roads": [
    { "type": "principal", "level": 0, "points": [{"x":1,"y":2}, ...] }
  ],
  "zones": [
    { "type": "eau", "level": 0, "points": [...] }
  ]
}
```

Los elementos sin `level` → se tratan como `level: 0` (retrocompatibilidad con tus JSON existentes).

### Exportar eligiendo los niveles

**Modo rápido** (🖼️ → ⚡ Modo rápido): exporta lo que está visible en ese momento (WYSIWYG, sigue tu filtro).

**Modo avanzado** (🖼️ → 🎨 Modo avanzado): nueva sección **🏗️ Niveles a exportar** con casillas por nivel. **Independiente** del filtro del mapa → puedes filtrar el mapa en [Niv. 0] pero exportar [Niv. 0+1+2] marcando las 3 casillas. Viene premarcado con lo que está visible en ese momento para evitar sorpresas.

### Planos existentes (retrocompatibilidad)

Si cargas un plano que **no** tiene activado el modo multinivel:
- Ningún botón de nivel, ninguna subacción 🪜, comportamiento estrictamente idéntico
- Tus sesiones y exportaciones antiguas siguen funcionando sin modificación

Si activas el modo en un plano existente:
- Todos los trazados/zonas/puntos sin nivel se consideran **Niv. 0**
- Puedes empezar a añadir trazados en el Niv. 1, 2… que coexistirán con los antiguos (en el Niv. 0)

---

## ⬆️ Guardar y compartir

> Todos los botones de exportación se encuentran en el grupo **⬆️ Guardar** de la barra lateral.

### 📤 Exportar

Pulsa **⬆️ → 💾**. Se abre una ventana con **5 pestañas**: 🚀 Completo · 🎨 Avanzado · 🔄 Conversión · 🔗 Fusión · 📡 Exportación externa:

#### 🚀 Completa
Exporta todo en un único archivo `.json` (o `.zip` si marcas las fotos): puntos añadidos, trazados, zonas, estructuras, medidas, traza del seguimiento.
Práctico para guardar tu sesión y retomarla más adelante.

> 📌 La medición de distancia no se incluye en el modo Completa.

> 🧭 **Rastreador incluido en modo Completa**: si el rastreador está activo (o se ha usado durante esta sesión), su **posición actual + camino recorrido + línea de tiempo completa + marca de tiempo de inicio** se incluyen en los datos bajo `session.tracker`. Al reimportarla, tu sesión de seguimiento se **restaura fielmente** (línea de tiempo + repetición posible). Si el rastreador nunca se ha activado, el campo simplemente no existe (retrocompatibilidad).

#### 🎨 Avanzado
Selección precisa de lo que quieres exportar:

- ✏️ **Puntos añadidos** + casillas por etiqueta (con icono en miniatura) + una categoría especial `(sin etiqueta)` para los puntos sin etiquetas. Así puedes exportar, por ejemplo, únicamente los puntos con la etiqueta `pa` o `peligro`.
- 🛣️ **Trazados** + casillas por tipo (principales, secundarios, caminos)
- ⬛ **Zonas** + casillas por tipo (agua, escombros, derrumbe, inaccesible)
- 🏛️ **Estructuras** + casillas por tipo (pilares / muros / frentes)
- 🧭 **Rastreador** *(opcional)* — si se marca, la casilla muestra en tiempo real un contador: *«línea de tiempo N eventos · recorrido M pts»*. Al exportar incluye: posición actual + camino recorrido + línea de tiempo completa + marca de tiempo de inicio. La reimportación lo restaura todo → tu repetición 🎬 funciona después de reimportar.
- 👤 **Identidad de usuario** — casilla dedicada para incluir tu **perfil** (apodo + foto + contadores). Útil para migrar tu identidad visual a otro dispositivo. Al importarlo, un aviso modal sugiere recargar para que el panel de perfil se actualice en toda la interfaz.

**Formato de salida** a elegir:
- 📄 **Un solo archivo de sesión** (.json — reimportable como una copia clásica)
- 📦 **ZIP de varios archivos** (un archivo por categoría: `session_points.json`, `session_roads.json`, etc.)

#### 🔄 Conversión
Convierte tu sesión en una **capa de datos** lista para integrarse en un plano definitivo mediante el archivo `plan-config.json`.

Casillas a marcar: Puntos / Trazados / Zonas / Estructuras (con **filtrado por etiqueta** para los puntos, igual que en Avanzado).

> 📌 **El rastreador se IGNORA deliberadamente en modo Conversión**. El rastreador es por naturaleza **efímero y experimental** (el PDR sufre deriva) — congelarlo en una capa de datos permanente resultaría engañoso para los futuros usuarios del plano. Si quieres archivar una sesión de seguimiento, usa el modo **Completa** o **Avanzado** (= reimportable como sesión, no congelado en el plano).

**Granularidad** a elegir:
- 📄 **Básica**: 1 archivo por categoría (`points.json`, `roads.json`, `zones.json`)
- 🔬 **Fina**: 1 archivo por tipo (`zones_eau.json`, `zones_remblais.json`, `roads_principal.json`, etc.)

Descarga directa si es un solo archivo, ZIP en caso contrario.

> 💡 La conversión es útil para fijar una parte de tu trabajo en un plano permanente. Una vez convertidos en capa de datos, esos datos ya no se pueden modificar desde la aplicación.

#### 🔗 Fusión (fusionar varias capas de datos)
¿Construyes un plano grande en **varias sesiones** y acabas con un montón de archivos (`Point1.json`, `Point2.json`, `Road1.json`…)? La pestaña **🔗 Fusión** los **agrupa en un solo conjunto por tipo**.

- Arrastra o selecciona **N archivos** de capa de datos (`.json` y/o `.zip`, acumulables).
- La app los **concatena por categoría**: todos los puntos → `points.json`, todos los trazados → `roads.json`, todas las zonas → `zones.json`, todas las estructuras → `structure.json`.
- Una **vista previa** muestra los totales y te **avisa** si hay identificadores de puntos duplicados (los duplicados se conservan tal cual).
- **Descarga** el resultado (un ZIP, o un `.json` directo si solo hay una categoría), listo para colocarlo en la carpeta de tu plano.

Accesible **sin ningún plano abierto** desde la pantalla de inicio: **📊 Editor de datos → 🔗 Fusionar capas de datos**. **100 % local**, no se envía ningún dato.

### 🖼️ Exportar a PNG/JPG

Pulsa **⬆️ → 🖼️ Exportar el mapa como imagen**. Se abre una ventana con dos modos:

#### ⚡ Exportación rápida
Todo se incluye automáticamente: plano completo, todas las capas visibles, puntos, trazados, zonas, posición y camino del rastreador. Formato PNG a resolución original. Un solo clic en **Descargar**.

#### 🎨 Exportación avanzada
Para un control preciso sobre todo lo que exportas:

- **Capas de imagen** — marca o desmarca cada capa (leyenda del plano, anotaciones, etc.)
- **Capas de datos** — marca las capas a incluir (pozos, vehículos, etc.). Las zonas y trazados incrustados en esas capas también se exportan.
- **Anotaciones** — elige qué incluir entre tus puntos, trazados, zonas, medición, posición y camino del rastreador
- **Leyenda integrada** — añade una leyenda con estilo directamente sobre el plano exportado:
  - **Posición**: 4 esquinas (superior izquierda, superior derecha, inferior izquierda, inferior derecha) o **personalizada** (pulsa 🎯 y luego en el plano para colocar la esquina superior izquierda de la leyenda)
  - **Estilo**: Opaco / Semitransparente / Marca de agua
  - **Tamaño**: Compacto / Estándar / Grande
  - **Contenido**: Iconos / Trazados / Zonas / Etiqueta del rastreador / Metadatos del plano (nombre, versión, autor, fecha)
- **Formato**: PNG o JPEG (calidad 90 %, archivo más ligero)
- **Resolución**: Original, ½ o ¼. La app preselecciona la mayor que sigue siendo razonable (½ o ¼ en un plano muy grande) y muestra, bajo la opción, el tamaño de la imagen y la memoria que necesitará; más allá, aparece un aviso. En iPhone/iPad, las resoluciones que Safari no puede crear aparecen en gris
- **Vista previa**: un minilienzo se actualiza en tiempo real para visualizar el resultado

> ⚠️ Antes de compartir esta imagen, comprueba que no revele información sensible.

### 📤 Exportar a PDF imprimible

Pulsa **⬆️ → 📤 PDF imprimible**. Genera un PDF listo para imprimir con cabecera (título + metadatos) y leyenda posicionable.

**Casos de uso típicos**:
- 🖨️ Impresión en papel para llevar sobre el terreno (A4, A3, incluso formatos grandes)
- 📧 Envío por correo a un compañero que no tiene la app
- 📁 Archivo duradero de una sesión importante

#### 📐 Formatos admitidos

| Formato | Dimensiones | Uso típico |
|---|---|---|
| **A0** | 841×1189 mm | Plóter profesional, cartel mural |
| **A1** | 594×841 mm | Formato grande, taller |
| **A2** | 420×594 mm | Cartel, presentación |
| **A3** | 297×420 mm | Papel A3 |
| **A4** | 210×297 mm | Papel estándar *(apaisado por defecto)* |

× **Vertical** u **Horizontal** (10 combinaciones en total).

#### 🗂️ Elección del contenido

Igual que en la exportación PNG avanzada, marcas exactamente lo que quieres incluir:

- **📦 Anotaciones de sesión** — Puntos / Trazados / Zonas / Estructuras (contadores en tiempo real basados en tu sesión)
- **🖼️ Imagen base y capas** — casilla «Imagen del plano base» + 1 casilla por cada capa de imagen del plano (capas de imagen tipo leyenda, anotaciones fotográficas, etc.). El premarcado corresponde a la visibilidad actual en el mapa.
- **📊 Capas de datos** — 1 casilla por cada capa de datos del plano (pozos, vehículos, caminos, estructuras incrustadas, etc.). La capa de tus anotaciones aparece con la etiqueta especial «Mis anotaciones (= capa de sesión)».
- **🎨 Maquetación** — casilla de Cabecera (título + metadatos arriba)
- **📏 Calidad** — Estándar ×1 (por defecto, recomendada para A3/A4) · HD ×2 (archivo más pesado, recomendada para A0/A1) · Borrador ×0,5

> ⚠️ A0/A1 + calidad ×2 puede tardar de 30 a 60 s en móvil (lienzo muy grande).

#### 🗗️ Leyenda — superposición en las 4 esquinas

En lugar de un pie dedicado, la leyenda se coloca como una superposición sobre el plano, en la esquina que elijas. Configúrala en la sección **🗺️ Leyenda**:

- **Activar**: casilla «Incluir la leyenda colocada sobre el plano»
- **📍 Posición**: 4 opciones — ↖ Superior izquierda · ↗ Superior derecha · ↙ Inferior izquierda *(por defecto)* · ↘ Inferior derecha
- **📏 Tamaño**: Compacto (iconos de 16 px) · Estándar (22 px) · Grande (30 px)
- **🎨 Estilo**:
  - **Profesional con fondo blanco** *(por defecto)* — adaptado a la impresión en papel (texto oscuro, acento azul marino)
  - **Oscuro opaco** — fondo oscuro de la línea gráfica, acento amarillo
  - **Oscuro semitransparente** — deja ver el plano por transparencia bajo la leyenda
  - **Marca de agua discreta** — la versión más discreta

La leyenda contiene automáticamente:
- 🕳️ Pozos + 🪜 Accesos + ⚠️ Señalización (iconos de los puntos realmente presentes en el plano)
- 🛣️ Trazados (por tipo)
- ⬛ Zonas (por tipo)
- 🏛️ Estructuras (pilares / muros / frentes)

> 🎯 **Filtro por uso real**: un icono o tipo aparece en la leyenda SOLO si está presente al menos una vez en el plano exportado. No verás un tipo «Pilar 2.ª masa» si no has dibujado ninguno.

#### 📛 Créditos

El PDF generado lleva la firma `Généré par MyKTAMap · CC BY-NC-SA 4.0 · myktamap.fr` abajo a la derecha. Nombre del archivo: `<plano>_<fecha>.pdf`.

> ⚠️ **Ningún emoji en el texto nativo del PDF** (la biblioteca jsPDF usa Helvetica latin1, que no admite Unicode). Los emojis de la leyenda sí funcionan, porque esta se dibuja como imagen en un lienzo antes de pegarse en el PDF.

---

### 🌍 Exportar a KMZ geolocalizado (Google Earth, OsmAnd, Locus, Avenza)

Pulsa **⬆️ → 💾** y luego la pestaña **📡 Exportación externa** (KMZ). Genera un archivo `.kmz` que puede abrirse en cualquier aplicación de cartografía de campo compatible con KML.
Casos de uso típicos:
- Visualizar tu plano en **Google Earth** sobre la imagen de satélite
- Cargarlo en **OsmAnd / Locus / Avenza** para navegación de campo sin conexión
- Compartirlo con un compañero que no tiene MyKTAMap pero sí un visor KML

#### Calibrado mediante 2 puntos GPS

El KMZ necesita saber **dónde se encuentra tu plano en el globo**. Le das 2 parejas (punto de tu plano ↔ coordenadas GPS reales), la app calcula la transformación de rotación + escala + traslación y lo posiciona todo correctamente.

Para cada punto (A y B), 3 métodos a elegir:
- **🔍 Buscar un punto**: escribe un nombre en la barra, pulsa el resultado → las coordenadas x/y del plano se rellenan solas. Solo tienes que indicar las coordenadas GPS correspondientes.
- **📍 Pulsar en el mapa**: la ventana se reduce, pulsas en el mapa donde conoces las coordenadas GPS → x/y del plano rellenadas automáticamente. Indica las coordenadas GPS.
- **Introducción manual** de los 3 campos (Plano x, Plano y, **GPS (lat, lng)**).

> 🌐 **Formato GPS**: el campo `GPS (lat, lng)` acepta directamente el **formato nativo de Google Maps** (`48.680831, 2.158843`). Puedes copiar las coordenadas desde Google Maps (clic derecho → copiar las coordenadas) y pegarlo todo en el campo — no hace falta separarlo en 2 campos de lat / lng. El mismo formato se acepta **en toda** la app (búsqueda Ctrl+K · ajustes KMZ · creación de plano georreferenciado).

> 💡 **Consejo**: elige 2 puntos **alejados** en el plano (idealmente en los extremos opuestos) — cuanto mayor sea la distancia AB, mejor será la precisión de la transformación. La app lo rechaza si AB mide menos de 50 px en el plano o menos de 1 metro en la realidad.

> 📐 **Punto C (opcional) — para los planos deformados**: si tu plano es un **ensamblaje** que se proyecta mal (estirado en un sentido, escalas distintas en X e Y), añade un **3.er punto** en ⚙️ Ajustes → Georreferenciación (o en el generador): la app pasa entonces a una transformación que **corrige la deformación global** — la vista OSM, las exportaciones KMZ/GPX y el Modo Rescate se benefician de ello. Elige C **lejos de la línea A-B** (una C alineada no aporta nada y se rechaza). A tener en cuenta: corrige una deformación *de conjunto* — si cada pieza del ensamblaje tiene su propio error, el resultado mejora pero no puede ser perfecto en todas partes. Deja C vacío si tu plano ya se proyecta bien: no cambia nada.

#### Vista previa en vivo

A medida que rellenas los campos, aparece un bloque **🌐 Vista previa de las esquinas** con:
- Las 4 esquinas de tu plano calculadas en (lat, lng) — ↖️ ↗️ ↙️ ↘️
- La **escala** calculada (metros por píxel) y la **rotación** (°)
- Un enlace **🔗 Ver el centro en Google Maps** para comprobar visualmente que el centro del plano cae donde esperabas (comprobación automática de conexión a Internet antes de abrirlo)

#### Contenido a incluir (granularidad fina)

Igual que en el modo de Imagen Avanzada: casillas principales + subcasillas para un control preciso.

- 🖼️ **Imagen del plano** (GroundOverlay) + deslizador de **Opacidad 0-100 %** (60 % por defecto) — permite ver la cartografía de satélite/OSM bajo tu plano en Google Earth. Las imágenes de más de ~8000 px se **reducen automáticamente** (Google Earth las truncaba en silencio) — un plano teselado V2 se recompone a partir de sus teselas; si la reducción es imposible, la app te pregunta antes de exportar.
- 📍 **Puntos** + subcasillas por etiqueta con iconos y contadores (sesión + capas de datos)
- 🛣️ **Trazados** + subcasillas Principales / Secundarios / Caminos
- ⬛ **Zonas** + subcasillas Agua / Escombros / Derrumbe / Inaccesible
- 🪜 **Uniones entre niveles** (si el plano es multinivel)
- 🗺️ **Itinerario activo** (si está calculado)

Puedes, por ejemplo, exportar únicamente los **pozos de ventilación** sin los caminos, o solo las **zonas inaccesibles** para proporcionar una capa de peligro a un visor externo.

#### Niveles a incluir (si es multinivel)

Sección dedicada con fichas para filtrar por nivel. Por defecto, todos los niveles disponibles están marcados (1 carpeta KML por nivel en el archivo).

#### Descarga

Pulsa **Descargar** → se descarga el archivo `MyKTAMap_<NombreDelPlano>_<fecha>.kmz`.

#### Persistencia del calibrado

Tu calibrado de 2 puntos se guarda **por plano** (en este dispositivo). En la siguiente exportación del mismo plano, los 8 campos ya vienen rellenados — los ajustas si hace falta y vuelves a descargar. Si cambias de plano o empiezas de cero, solo tienes que volver a introducirlos.

> ⚠️ **Límites de la precisión**: la transformación es una **similitud 2D** (rotación + escala uniforme + traslación). En planos globalmente planos y rígidos, es suficiente. En planos muy extensos o no rígidos (deformaciones locales), cuenta con una ligera deriva en los extremos opuestos al calibrado. Una versión futura podrá admitir 3 o más puntos (mínimos cuadrados) para más precisión si hace falta.

> ⚠️ **Igual que con la exportación PNG**, comprueba que tu KMZ no revele información sensible antes de compartirlo públicamente (cantera privada, acceso restringido…).

---

## ⬇️ Cargar / Importar

> El grupo **⬇️ Cargar / Importar** de la barra lateral contiene las acciones de importación.

### 📥 Importar una sesión

Pulsa **⬇️ → 📥 Importar**, tarjeta **Sesión MyKTAMap** para abrir la ventana de importación. Se muestra una ventana:

1. **Arrastra y suelta** tu archivo `.json` (o `.zip` con fotos) en la zona, o púlsala para seleccionarlo
2. Aparece una **vista previa**: número de puntos añadidos, de trazados, de zonas y de puntos de medición
3. Una **advertencia** te avisa de que la importación reemplazará tu sesión en curso — acuérdate de exportarla antes si hace falta
4. Pulsa **Importar** para validar, o **Cancelar** para cerrar sin cambiar nada

### 📊 Editor de datos del plano

Pulsa **⬇️ → 📊 Editor de datos del plano** (en modo mapa) **o** el botón **📊 Editor de datos** de la pantalla de inicio para abrir el editor en forma de tabla. Puedes **ver, modificar y exportar** los datos del plano (puntos, trazados, zonas, estructuras).

> ℹ️ Desde la **pantalla de inicio** no hay todavía ningún plano cargado: solo se ofrecen las fuentes **📦 ZIP** y **📄 JSON** (no hay «plano en curso»).

#### Apertura — 3 fuentes

1. **🗺️ Plano en curso** — enumera las capas de datos del plano abierto (pozos, accesos, trazados, zonas…). Elige una para editarla.
2. **📦 Importar un ZIP** — recupera la lista de capas de datos de un plano completo (`.zip`).
3. **📄 Importar un archivo JSON** — un único archivo de datos o de sesión (arrastrar y soltar).
4. **🔁 Convertir la resolución** — herramienta autónoma para **migrar tus datos de un escaneo antiguo a un escaneo nuevo del mismo plano**. Indica las dos resoluciones (a mano o con 📷 detección automática desde las imágenes — incluso gigantes), uno o varios archivos `.json`, y recupéralos convertidos. Si el nuevo escaneo no tiene los mismos márgenes: añade una **referencia común** a ambos planos (el mismo pilar identificado en cada uno) — la conversión se ajusta exactamente a ella, con rotación opcional; con **dos referencias**, la escala y la rotación se deducen solas. Lo que no está en el archivo (enlaces entre planos, georreferenciación, escala del plano) hay que rehacerlo en el nuevo plano.
5. **🧹 Eliminar duplicados de los datos** — retira los **vértices idénticos consecutivos** acumulados en los trazados, zonas, estructuras y mediciones de un archivo `.json` (capa de datos o sesión exportada): un antiguo error del modo «clic en el mapa» podía apilar varios por clic — invisibles en pantalla, pero hinchan los archivos y las exportaciones. Elige uno o varios archivos y recupéralos limpios como `_dedup.json`, con el recuento de lo eliminado. Los puntos (POI) **nunca se tocan** — dos puntos superpuestos a propósito siguen siendo distintos.

Si una fuente contiene varios conjuntos de datos, aparece un **selector** (cada uno con su número de elementos). La tabla se abre después con una columna por cada campo detectado.

#### Edición

- **Pulsa una celda** para modificarla (excepto el ID, de solo lectura)
- **Tab**: pasa a la celda siguiente · **Intro**: fila siguiente (misma columna) · **Esc**: cancela
- **Coordenadas**: si X o Y queda fuera del plano, la celda se pone roja con una advertencia ⚠
- **Etiquetas**: pulsa la celda para abrir un selector de varias etiquetas con vista previa de los iconos (se puede crear una etiqueta sobre la marcha)
- **🔒 Trazados / zonas / estructuras**: puedes editar la **nota** (descripción), el **tipo** y el **nivel**, pero la **geometría** (la columna `points`) permanece en **solo lectura** — para redibujarla, usa las herramientas de trazado sobre el mapa.

#### Acciones *(solo puntos)*

- **🔍 Búsqueda** filtra todas las columnas · **Ordenar**: clic en la cabecera (asc → desc → sin orden) · **Selección múltiple**: casilla + Mayús+clic
- **+ Añadir fila** · **📋 Duplicar** · **🗑️ Eliminar** (con confirmación) · **📍 Ver en el mapa** (puntos seleccionados en naranja parpadeante)

#### Guardado *(nunca hay carga en directo para los datos del plano)*

Botón **💾 Guardar**:

| Caso | Efecto |
|---|---|
| **Datos del plano** (puntos / trazados / zonas / estructuras) | **📥 Descargar** el archivo `.json` modificado. ⚠️ Para **aplicarlos**, reimporta ese archivo en el **Generador** (🏗️) — el editor nunca modifica el plano en directo sobre el mapa. |
| **Sesión** (tus anotaciones en curso) | **📥 Descargar** **o** **✏️ Reemplazar la sesión en curso** (actualización en vivo de tus puntos de sesión). |

> ⚠️ Si cierras la ventana con modificaciones sin guardar, una confirmación te propone guardar, salir sin guardar o seguir editando.

### 🗂️ Cambiar de plano

Este botón **ya no está en el menú ⬇️**. Para cambiar de plano: toca la **rosa de los vientos 🧭** (inicio) o el **título del plano** (ventana «Cambiar de plano», ver arriba) en la barra superior. Tu sesión se **guarda automáticamente** antes del cambio.

Desde esta pantalla puedes:

- Pulsar **▶️ Reanudar** para relanzar el plano que acabas de dejar
- Elegir otro plano en **Mis planos** (clic directo o botón ▶️ de la fila)
- Cargar un ZIP nuevo mediante la zona de importación
- Importar o exportar tu lista de planos

---

## 🏗️ Crear o modificar un plano

> Accesible directamente mediante el botón **🏗️** de la barra lateral (clic directo, sin submenú).

Pulsa **🏗️** para abrir el generador. Dos pestañas disponibles:

### 📦 Importar varios planos de una vez

El botón **📦 Importar varios planos**, en la sección **🧰 Herramientas** de la pantalla de inicio, añade tantos archivos ZIP como quieras a tu lista — **sin abrir ninguno**. Luego abres el que quieras desde la lista.

La pantalla se lee en tres tiempos:

1. **Eliges** tus archivos.
2. **Ves lo que va a pasar**, línea por línea: lo que se añadirá, lo que ya está en tu lista, lo que se rechaza y por qué. El resumen da el tamaño total, lo que se copiará en la app y el espacio restante.
3. **Lanzas.** Los planos entran uno a uno, con el nombre en curso a la vista, y después un balance: añadidos, omitidos, rechazados.

**Si un plano ya está en tu lista**, eliges una sola vez para todo el lote: dejarlo como está, reemplazarlo o conservar los dos. Por defecto se deja como está — una importación nunca sobrescribe nada sin que lo pidas.

> 💾 **El espacio se anuncia antes.** El almacenamiento de un navegador ronda entre 50 y 200 MB según el dispositivo. Si tu lote no cabe, la app se niega a empezar y te dice cuánto falta. Si el espacio se agota por el camino, **se detiene ahí mismo**: los planos ya añadidos se conservan y el balance dice dónde se paró.
>
> 📁 **«Guardar en:»** — elige la carpeta de «Mis planos» que recibirá todo el lote (o «➕ Nueva carpeta…», con su nombre al momento). Por defecto, los planos llegan «Sin clasificar».
>
> 💾 **«Precargar el ZIP» (casilla marcada por defecto; sigue el ajuste «Memorizar el plano en la app en la primera carga» de ⚙️ Configuración de la pantalla de inicio)**: la app conserva el archivo y cada plano importado **se abre desde la lista sin que tengas que volver a seleccionar su ZIP**. Desmárcala si solo quieres llenar tu lista sin guardar nada: no se copia nada, el espacio deja de ser un problema y se te pedirá el ZIP la primera vez que abras cada plano (como con un plano restaurado desde un perfil).

> 🔒 **100 % local**: todo se lee y se guarda **en tu navegador**. Ni un byte se envía a ninguna parte, y funciona sin conexión.

### 🗺️ Soltar un GeoTIFF

Si has georreferenciado tu plano en **QGIS**, expórtalo como **GeoTIFF** (`.tif` / `.tiff`): la imagen **y** su georreferenciación viajan en el mismo archivo. Elígelo como imagen del plano — en el generador o directamente desde la pantalla de inicio — y la app hace el resto:

- **lee la georreferenciación escrita en el archivo** y rellena la **calibración GPS** por sí sola;
- deduce la **escala** (px/m) y la **extensión** del plano, que se muestran en el mensaje de confirmación;
- convierte la imagen a PNG para el resto del proceso (ningún navegador de escritorio muestra un TIFF), y luego el teselado y el ZIP siguen como siempre.

**Ya no tienes que volver a escribir los dos puntos GPS** que acababas de poner en QGIS.

> ✅ **Lo que se lee**: compresión **LZW, Deflate o ninguna** · **8 bits por canal** · **gris, RGB o RGBA** · imagen **organizada en bandas** · georreferenciación **con el norte arriba, sin rotación** · coordenadas en **Lambert 93, Web Mercator o WGS84**.
>
> ❌ **Lo que se rechaza se nombra siempre**, con lo que hay que cambiar al exportar: BigTIFF, imagen teselada, canales separados, paleta / CMYK / YCbCr, predictor inusual, georreferenciación rotada, sistema de coordenadas no admitido. Un mensaje te dice exactamente qué reexportar — la app nunca adivina por ti.

> 🔒 **100 % local**: el archivo se lee y se convierte **en tu navegador**. Ni un byte se envía a ninguna parte.

### 📄 Plano nuevo

Formulario en blanco. Rellena:

- **Información**: nombre, versión, autor, **🏷️ etiquetas** (separadas por comas, máximo 12 de 24 caracteres — la misma escritura que en ℹ️ Información). Viajan en el ZIP y se **proponen** a quien lo importa: si ya pusiste tus propias etiquetas en ese plano, se conservan las tuyas, incluso al reimportar una nueva versión. El campo existe también en las conversiones KMZ, GPX y SIG.
- **Imagen principal** (obligatoria) — las **dimensiones del plano se detectan automáticamente** en cuanto eliges tu archivo. Un recuadro muestra las dimensiones y el tamaño en MB, con **advertencias en rojo** si la imagen supera los 10 000 px de lado o los 30 MB (riesgo de fallo de memoria en móvil / ZIP muy pesado).
- **Mapa de colisión** (opcional)

- **Posición inicial del rastreador** (grupo 🧭 Seguimiento) — **centrada automáticamente** en mitad del plano (An/2 × Al/2) en cuanto se carga la imagen principal. Puedes modificar estos valores manualmente si quieres que el rastreador arranque en un lugar concreto. Hay un botón **🎯 Recentrar la posición de partida** para volver a aplicar el centro en cualquier momento.
- **Capas de imagen** adicionales (leyendas, anotaciones) — hasta 10
- **Capas de datos** JSON — hasta 10 (creadas vacías si no se proporcionan)
- **Parámetros de seguimiento**: posición de partida, escala, sensibilidad
- **Iconos y etiquetas**: gestor dinámico
  - Pulsa **↺ Cargar valores por defecto** para prerrellenar con los iconos estándar
  - Pulsa **+ Añadir una etiqueta** para crear un tipo personalizado
  - Para cada etiqueta, elige un icono personalizado o deja la ruta por defecto
  - Las etiquetas `default` y `track` son obligatorias (del sistema)

La capa **Añadidos** (`editor.json`) se incluye siempre automáticamente.

Pulsa **📦 Generar el ZIP** — el archivo está listo.

### 📂 Modificar uno existente

Importa un ZIP existente — el formulario se prerrellena automáticamente con su configuración. Modifica lo que quieras (añadir etiquetas, cambiar iconos, añadir capas, etc.) y pulsa **📦 Generar el ZIP** para descargar la versión modificada.

> Práctico para añadir iconos nuevos a un plano que ya está en circulación, o para ajustar la posición inicial del rastreador.

### 🎨 Imagen en blanco

Si quieres crear un plano **desde cero** sin imagen de origen (por ejemplo, para dibujar únicamente pilares / frentes de cantera / trazados sobre un lienzo vacío), puedes generar una **imagen en blanco**.

En la sección **🖼️ Imágenes principales** del generador, 2 modos:

| Modo | Efecto |
|---|---|
| **📷 Desde una imagen** (por defecto) | Carga clásica de un PNG / JPG / WebP |
| **🎨 Imagen en blanco** | La app genera un lienzo vacío con las dimensiones y el color que elijas |

Cuando seleccionas **Imagen en blanco**:

- **Anchura** y **Altura** en píxeles (mínimo 500, máximo 12 000 — límites para evitar fallos de memoria en móvil)
- **Color de fondo**:
  - ⬜ **Blanco**: estilo papel — útil para dibujar planos arquitectónicos
  - ▫️ **Gris claro**: neutro, menos agresivo a la vista
  - ⬛ **Negro**: estilo fondo oscuro (terreno en la oscuridad, dibujo con trazo blanco encima)
  - 🌫️ **Gris oscuro**: entre neutro y oscuro
- Botón **🎨 Generar la imagen**: la app crea el lienzo y lo inyecta automáticamente como imagen principal. Las dimensiones del plano se ajustan en consecuencia.

Después puedes añadir tus capas de datos (vacías), el seguimiento, los iconos y **📦 Generar el ZIP** como en un plano normal. Una vez cargado el plano en la app, dibuja lo que quieras (pilares, frentes de cantera, trazados, puntos) con las herramientas habituales.

> 💡 **Caso típico**: un cartógrafo que visita una cantera por explorar, sin plano en papel existente, puede generar un plano en blanco de 4000×4000 en negro al llegar y luego dibujar sobre la marcha (usando el rastreador como referencia). Al final, el ZIP se puede compartir.

### 📦 Importar una capa de datos ZIP con un clic

En la sección **📊 Capas de datos** del generador, un recuadro amarillo dorado ofrece **📦 Elegir un ZIP de capa de datos…**. Sirve para **recuperar de una vez** las capas + fotos de otro plano, exportadas mediante **📤 Exportar → 🔄 Conversión → ✏️→🗂️ Sesión a capa de datos** (con la casilla 📸 Fotos marcada para incluirlas).

**Caso de uso típico**:
1. Ves que un amigo ha anotado un plano (puntos + trazados + zonas + estructuras + fotos) y exporta un `data_<plano>.zip` mediante la Conversión
2. Copias ese ZIP a tu dispositivo (Drive, AirDrop, USB…)
3. En el generador, en modo **Modificar uno existente** O **Plano nuevo**, pulsas el botón 📦 Elegir un ZIP de capa de datos
4. El ZIP se analiza → se **crean automáticamente capas de datos**: `points` (los puntos de tu amigo), `roads` (trazados), `zones` (zonas), `structure` (pilares/frentes). Si el ZIP contenía fotos, se **guardan en memoria** para incluirlas en el momento de la generación.
5. Mensaje verde «✅ N capa(s) creada(s): points (X), roads (Y), zones (Z), structure (W) · 📸 M fotos»
6. **📦 Generas el ZIP** como de costumbre → el plano final contiene tus capas originales (si es Modificar) + las capas importadas + la carpeta `data/photos/` con los blobs
7. Al cargar ese plano cualquier usuario, las fotos se restauran automáticamente en su dispositivo y aparecen en las ventanas emergentes de los marcadores

**Comportamiento**:
- **Modo Nuevo**: las capas importadas pasan a ser las capas de datos del plano (la lista de la interfaz se vacía y se rellena con las capas del ZIP)
- **Modo Modificar**: las capas existentes del plano de origen se **preservan**; las capas del ZIP importado se añaden con el **sufijo `_imported_<N>`** si hay conflicto de id (= nunca sobrescriben las capas originales). Las fotos del plano actual guardadas en tu dispositivo se **fusionan** con las del ZIP (deduplicación por photoId).

> 📸 **Formato del ZIP de capa de datos** esperado: es exactamente lo que produce la **Conversión sesión → capa de datos** cuando marcas «📸 Incluir las fotos adjuntas» (da igual la granularidad, Básica o Fina). Contiene `points.json` + `roads.json` + `zones.json` + `structure.json` (según lo que hubiera en la sesión de origen) + `photos/_index.json` + `photos/<photoId>.jpg`.

### 📸 Incluir las fotos adjuntas al plano

En modo **Modificar uno existente**, si el plano que cargas ya tiene **fotos adjuntas a sus puntos** (guardadas en tu dispositivo por el editor), aparece una casilla **📸 Incluir las fotos adjuntas (N · X MB)** en la sección «🖼️ Imágenes principales» del formulario.

- **Marcada por defecto**: las fotos del plano guardadas en tu dispositivo se incluyen en el ZIP generado bajo `data/photos/<photoId>.jpg`. Así puedes compartir el plano completo (anotaciones + fotos) con otro dispositivo.
- **Desmarcada**: el ZIP generado no contiene las fotos. Más ligero, pero quien importe el ZIP no recuperará las fotos.

Al cargar ese ZIP cualquier otro usuario: las fotos se **restauran automáticamente** en el dispositivo, con el identificador local del plano, y un aviso discreto «📸 N fotos restauradas desde el plano» lo confirma.

> ⚠️ Si la desmarcas **Y** además has importado un ZIP de capa de datos con fotos (ver la sección anterior), solo se incluirán las fotos de la capa importada. La casilla 📸 controla ÚNICAMENTE las fotos del plano actual guardadas en tu dispositivo.

### 🧱 Convertir a teselas V2 (rendimiento)

Si tu plano es pesado (imagen > 50 MB, dimensiones > 8000 px), puedes convertirlo en **plano teselado V2** para reducir enormemente el consumo de memoria en ejecución. El sistema trocea la imagen en teselas de 512×512 en 4 niveles de zoom (al estilo de Google Maps) — en todo momento, solo se cargan en RAM las teselas del nivel de zoom actual.

**Flujo de trabajo**:

La casilla 🧱 Convertir a V2 aparece en el formulario en cuanto has **cargado una imagen principal**, tanto en modo **Plano nuevo** COMO en **Modificar uno existente** (no hace falta partir de un ZIP V1 de origen).

1. **Plano nuevo**: elige una imagen principal → aparece la casilla 🧱<br>
   O **Modificar uno existente**: carga tu ZIP V1 (la casilla 🧱 está disponible)
2. Marca la casilla **☑️ 🧱 Convertir a teselas V2 (rendimiento)** (recuadro violeta)
3. **Ventana de advertencia**: la conversión es pesada (CPU + RAM). Lee el mensaje y pulsa **Entendido — Continuar** (o **Cancelar (desmarcar)** si quieres pensarlo). Ver la sección «PC frente a móvil» más abajo.
4. Rellena el resto del formulario (nombre, versión, capas, seguimiento, etc.)
5. Pulsa **📦 Generar el ZIP** → superposición de progreso «Nivel z=−N · X / Y teselas (Z %)»
6. ZIP descargado con el sufijo `_v2` (p. ej. `plan_xxx_v2.zip`)
7. **Reimporta ese ZIP mediante el cargador** → el modo V2 se activa automáticamente (distintivo violeta `V2` en el mapa del plano)

**Recorte automático integrado**: si tu imagen de origen tiene muchos márgenes blancos (típico de los planos escaneados en papel), el generador detecta automáticamente el rectángulo del contenido útil y solo tesela esa zona. Ganas en tamaño de ZIP y en nitidez al máximo zoom. Si la imagen ya está bien encuadrada, no hay recorte.

**🫥 Transparencia conservada**: si tu imagen de origen es un **PNG/WebP con transparencia real** (fondo alfa), el generador **ya no añade un fondo oscuro**: las teselas conservan la transparencia (formato WebP, o PNG según el navegador). Resultado: tras las zonas transparentes ves el fondo oscuro del mapa — y en la **Vista OSM**, el mapa de OpenStreetMap aparece **a través de tu plano**. La detección es automática (mira los píxeles, no la extensión del archivo — un PNG cuyo fondo ya se ha aplanado se sigue tratando como opaco). En una imagen de origen transparente, el recorte automático anterior queda **desactivado** para no desplazar nunca tus puntos/trazados/georreferenciación. **Planos V2 existentes**: el fondo quedó cocido en sus teselas en su día — regenéralos una vez (Modificar → volver a marcar V2) para aprovecharlo; sin regenerarlos siguen funcionando como antes.

**Compensaciones**:

| ✅ Ventajas | ⚠️ Costes |
|---|---|
| Consumo de memoria enormemente reducido (~16 MB máx. en lugar de la imagen entera en RAM) | Conversión lenta (1-5 min según el tamaño de la imagen) |
| Ideal para móvil (Safari iOS, planos grandes que fallan en V1) | El ZIP final contiene más archivos (las teselas) pero pesa aproximadamente lo mismo que un PNG/JPEG único |
| Navegación más fluida al desplazar y ampliar | Ligero parpadeo visual al cambiar de nivel de zoom (intercambio de teselas) |
| Recorte automático de los márgenes blancos | Borde negro visible al alejarse muchísimo (más allá de los bordes) |

**Modificar un plano que ya es V2**: la casilla viene **premarcada** → las teselas se regenerarán con las nuevas modificaciones. Si la desmarcas, es una degradación explícita de V2 a V1 (las teselas no se trasladan al nuevo ZIP).

#### 💻 PC frente a 📱 móvil para la conversión

> ⚠️ **Importante** — es el tema de la ventana de advertencia que aparece al marcar la casilla.

| Plataforma | Descodificación de la imagen de origen | Recomendación |
|---|---|---|
| 💻 **Ordenador** (Windows / macOS / Linux) | Sin límite de memoria en la práctica. Conversión de 1 a 5 min según el tamaño. | ✅ **Recomendado** para la generación |
| 📱 **Móvil** (iOS / Android) | Limitado a **~500 MB de RAM** para la PWA. Fallo casi garantizado con imágenes de más de 50 MB o de más de 8K px. | ❌ Evitar — **pero** el ZIP V2 generado en PC se importa sin coste en móvil (es justamente la ventaja de V2) |

> 💡 **Flujo recomendado**: genera el ZIP V2 una vez por todas en tu PC y luego pásalo a tu teléfono (Drive, AirDrop, etc.). El teléfono lo importa en unos segundos y disfrutas del teselado en ejecución sin coste de memoria al arrancar.

#### 🎛️ Desactivar el teselado en la lectura (V2 → V1 en bruto)

Al cargar un plano V2, puedes elegir **Modo de rendimiento: Desactivado** en la ventana **⚙️ Configuración** del cargador. En ese caso, la ejecución ignora las teselas y carga directamente la **imagen de origen** del ZIP, conservada intacta, como un plano V1 clásico.

Casos de uso:
- Comparar el resultado V2 frente al V1 en el mismo plano
- Puentear temporalmente si observas un comportamiento extraño del sistema de teselas (depuración)

⚠️ Este modo carga toda la imagen en RAM → puede fallar en móvil con planos grandes (que es justo lo que V2 evita).

> 💡 **A probar con prioridad** en tu plano más grande que falla en móvil, o antes de compartir un plano pesado con alguien que tenga un teléfono modesto.

---

## 🚀 Optimizar tu plano para el rendimiento

Un plano ligero se carga más rápido, navega con más fluidez y **reduce mucho el riesgo de fallo de memoria en móvil**. Estas son las buenas prácticas por orden de impacto.

### 1. 🖼️ Imagen principal — limitar las dimensiones

La imagen base es la que **más memoria consume**. En móvil, el navegador reserva un lienzo del tamaño de la imagen entera.

| Dimensiones | Comportamiento | Recomendación |
|---|---|---|
| ≤ 4000 × 4000 px | Correcto en todas partes | ✅ Ideal |
| 4000 - 8000 px | Correcto en escritorio, alejamiento limitado en móvil | ⚠️ Aceptable |
| 8000 - 16 000 px | Riesgo de fallo en móviles de gama baja/media | ⚠️ Fuerza el teselado (modo Rendimiento) |
| > 16 000 px | Fallo casi garantizado en móvil | ❌ A evitar |

**Truco**: si tu plano de origen es gigantesco, redimensiónalo a un máximo de 6000-8000 px de lado con un editor de imagen (GIMP, Photoshop, [Squoosh](https://squoosh.app/) en línea). Pierdes algo de detalle al máximo zoom pero ganas enormemente en estabilidad.

### 2. 📦 Formato de la imagen — JPEG frente a PNG

| Formato | Cuándo usarlo | Peso típico (8000×6000 px) |
|---|---|---|
| **JPEG** (calidad 80-90 %) | Fotos, escaneos, planos con degradados | ~3-8 MB ✅ |
| **PNG** | Planos con transparencia o colores planos nítidos | ~15-50 MB ⚠️ |
| **WebP** | Compromiso calidad/peso (Chrome/Firefox/Safari modernos) | ~2-5 MB ✅✅ |

> 💡 Para un plano de cantera clásico con vías dibujadas sobre un color liso, el **JPEG de calidad 85** divide el peso entre 5 y 10 sin pérdida visual perceptible.

### 3. 🗂️ Capas de imagen — limitar el número

Cada capa de imagen adicional (leyenda, anotaciones, etc.) **multiplica la memoria utilizada**. Quien abre el plano carga todas las capas aunque oculte una parte.

| Número de capas de imagen | Recomendación |
|---|---|
| 1 (solo la imagen base) | ✅ Óptimo |
| 2-3 | ⚠️ Aceptable si cada una pesa ≤ 2 MB |
| 4 o más | ❌ A evitar — fusiónalas en el PNG base |

**Alternativa**: si tienes elementos decorativos (leyenda, referencias), **intégralos directamente en la imagen base** en lugar de hacer capas separadas. Pierdes la posibilidad de ocultarlos pero ganas en rendimiento.

### 4. 🛣️ Vías — integrarlas en el PNG si son muchas

Las vías en JSON (Principal/Secundaria/Camino) las dibuja Leaflet como una capa vectorial. Por encima de **~50 vías**, el navegador puede ir lento al desplazar y ampliar.

**Estrategia para los planos grandes**:
1. Traza las vías en tu editor de imagen (GIMP/Photoshop) **directamente sobre el PNG**
2. Conserva una capa JSON minimalista con las vías invisibles visualmente pero utilizables por el módulo **🗺️ Itinerario** (el buscador de rutas usa todas las vías de la capa, **incluso ocultas**)
3. En el control de capas de Leaflet, **desmarca la capa JSON de las vías** → ves las vías gracias al PNG, la app no dibuja las polilíneas vectoriales → gran ganancia de rendimiento
4. El itinerario sigue funcionando

> 🎯 Esta técnica permite tener **cientos de tramos** en el plano sin ningún impacto de rendimiento al desplazar o ampliar.

### 5. 📍 Puntos — limitar las capas de datos densas

Cada capa JSON de puntos (`puits.json`, `chatieres.json`, etc.) crea marcadores de Leaflet. Por encima de **~500 marcadores visibles a la vez**, el dibujado puede ralentizarse en móvil.

| Número de marcadores | Recomendación |
|---|---|
| ≤ 200 | ✅ Correcto |
| 200-500 | ⚠️ Correcto en escritorio, prudencia en móvil |
| 500-2000 | ⚠️ Sepáralos en varias capas de datos conmutables |
| > 2000 | ❌ Considera un modo de «agrupamiento» (clustering, función futura) |

**Truco**: separa tus puntos en varias capas de datos (p. ej. `puits.json`, `passages.json`, `electricite.json`) para que el usuario pueda ocultar las que menos le interesen.

### 6. ⚡ Troceado de la imagen — Automático, salvo razón en contra

⚠️ **Este ajuste ya no está en la pantalla de carga.** Vive en **ℹ️ Información** del plano,
y **solo para un plano no troceado al generarse** — en un plano V2 no tendría ningún efecto, así que no
aparece. Buena noticia: ahí **se memoriza para ese plano**, mientras que el antiguo selector volvía a
Automático en cada arranque.

Dos opciones:

| Opción | Para qué caso |
|---|---|
| **🔄 Automático** (por defecto) | Trocea en cuanto la imagen supera 4 096 × 4 096 px, o el archivo supera 60 MB. ✅ **La opción correcta, salvo razón concreta.** |
| **💤 Desactivado** | Plano pequeño en un escritorio potente, cuando quieres la calidad nativa sin ninguna recodificación. **⚠️ Riesgo de bloqueo en Safari iOS por encima de 8 000 px** — un mensaje te avisa. **Sin efecto en un plano ya troceado** (V2), que usa siempre sus piezas. |

> 🩸 **Qué ha cambiado, y por qué.** Los preajustes 🌟 Calidad / 🎯 Equilibrado / ⚡ Rendimiento se han **retirado**: solo ajustaban el troceado que hace el navegador al cargar, que solo afecta a los planos **V1**. En un plano **V2** — el caso habitual — no cambiaban **nada en absoluto**.
> Y «Automático» decidía según el **peso del archivo**, no según el tamaño en píxeles: un plano de 100 Mpx bien comprimido (~15 MB) **no se troceaba** y podía bloquear el iPhone, cuando «Calidad» sí lo habría troceado. El valor por defecto era, pues, el modo **menos** protector. Corregido.

> 💡 La opción se memoriza **por plano**: vale para todas sus cargas siguientes, hasta que la cambies. *(Antes, el selector del cargador no se memorizaba y volvía a Automático en cada arranque.)*

### 6 bis. 🚀 Modo Rendimiento ULTRA — para los planos realmente grandes que fallan

Si a pesar del modo Rendimiento tu plano sigue fallando (típicamente planos de más de 4000 × 2000 píxeles con muchos trazados), abre **⚙️ Ajustes → sección «🚀 Modo Rendimiento ULTRA»** y activa el **interruptor maestro 🚀 ULTRA**. Activa 6 optimizaciones agresivas de forma simultánea.

> 🆕 **Tres cosas que debes saber**:
> - **Ajuste POR PLANO**: marcar ULTRA aquí afecta ÚNICAMENTE al plano abierto. Tus demás planos no se ven afectados. Tras la actualización, los planos que tenían ULTRA arrancan desactivados — vuelve a marcarlo en los que lo necesiten.
> - **Tus puntos de sesión son sagrados**: los POI que añades a mano (✏️) siguen **siempre visibles**, incluso con el recorte por ventana visible activo — solo se aligera la visualización de los miles de puntos de las capas de datos.
> - **Mensaje al abrir**: cuando hay optimizaciones activas en un plano, un mensaje te lo recuerda al cargarlo — una visualización «aligerada» (trazados simplificados, ventanas emergentes de datos desactivadas…) no es un error.

> ⚠️ Estas optimizaciones **NO afectan a la imagen** (ya la gestiona el modo de rendimiento anterior). Se centran en los elementos vectoriales (trazados, puntos, cálculos).

**Los 6 interruptores individuales** (activables por separado si quieres afinar):

| Interruptor | Efecto | Contrapartida |
|---|---|---|
| 🪜 **Simplificar los trazados al alejar** | Simplifica las polilíneas al reducir el zoom | Trazados menos suaves al alejar |
| ⚡ **Desactivar las animaciones de zoom/desplazamiento** | Transiciones instantáneas en lugar de animadas | Resultado visual más brusco — **requiere recargar** |
| 🎯 **Desactivar los círculos de los cruces** | Sin círculos en los cruces por encima de 50 vías (frente a 500) | Cruces menos visibles |
| 🚫 **Desactivar las ventanas emergentes de las capas de datos** | Sin ventana emergente al pulsar los marcadores de las capas (pozos, etc.) | Usa 🔍 Búsqueda para interactuar |
| 🐢 **Guardado automático lento (30 s)** | Guarda cada 30 s en lugar de cada 1,5 s | Riesgo de perder 30 s de cambios si falla |
| 👁️ **Dibujar solo los trazados visibles** | Omite las vías fuera de pantalla | Ligera aparición progresiva al desplazar |

**Cómo usarlo**:

- **Si la app sigue fallando** → marca **🚀 ULTRA** (lo activa todo). Efecto inmediato (salvo «animaciones», que exige recargar).
- **Si quieres afinar** → deja ULTRA desmarcado y activa manualmente los interruptores según lo que estés dispuesto a sacrificar. Por ejemplo: puedes activar solo **🐢 Guardado automático lento** y **👁️ Recorte por ventana visible** para ganar bastante sin perder nada visualmente.
- **Para volver al comportamiento normal** → desmarca **🚀 ULTRA** (los desmarca todos) o desmárcalos uno a uno.

**Persistencia**: los interruptores se memorizan en tu navegador (preferencia global, no por plano). Siguen activos entre sesiones.

> 💡 Combinación recomendada para los planos muy grandes: 🚀 ULTRA + modo de rendimiento ⚡ Rendimiento al cargar + imagen de origen ≤ 8000 px / JPEG q85.

### 7. 📱 Específico de móvil

- El **iPhone en PWA** (instalada en la pantalla de inicio) gestiona mejor los planos grandes que el iPhone con Safari directamente
- **Android Chrome** suele ser más tolerante que iOS con la memoria
- En caso de fallo: ⚙️ Configuración (inicio) → **🛠️ Modo Desarrollador** → registros detallados para diagnosticar

### 8. 💾 Guardado regular

Los planos muy grandes pueden provocar **cierres silenciosos por memoria** en iOS — el sistema mata la pestaña sin avisar para recuperar RAM. La app detecta ese cierre al reiniciar y te muestra un aviso.

> 📌 **Reflejo**: exporta tu sesión (📤 Exportar) cada 10-15 minutos de trabajo intensivo. El guardado automático en este dispositivo ya protege en la mayoría de los casos, pero una exportación externa sigue siendo lo más seguro.

### Resumen rápido

✅ **Para un plano óptimo**:
- Imagen base en **JPEG calidad 85** de ≤ 8000 px de lado
- 1 o 2 capas de imagen como máximo
- Vías **dibujadas en el PNG** + capa JSON oculta para el buscador de rutas
- Puntos repartidos en 2 o 3 capas de datos conmutables
- Preajuste **🎯 Equilibrado** por defecto, **⚡ Rendimiento** para los móviles antiguos

---

### 🎓 Volver a ver el tutorial

El tutorial de bienvenida (27 fichas) **se puede repetir en cualquier momento**: abre **📖 Documentación** y toca el botón **🎓** de la línea de título, junto a las banderas de idioma. No hay que reinstalar ni reiniciar nada.

### 🔎 Buscar en la documentación

Esta documentación es larga. Arriba de la ventana 📖, un campo **🔎 Buscar** busca en **todo el texto**: las apariciones se resaltan, **Intro** o ↓ pasa a la siguiente, el contador indica «i / n» y las entradas del índice sin resultado se atenúan. Los acentos no cuentan: «reglages» encuentra «Réglages». La búsqueda del hub ❓ Ayuda, por su parte, busca en los títulos **y** el contenido de las secciones.

## 🤖 Ayuda con IA

> Accesible mediante el grupo **📚 Ayuda / Documentación / Leyenda → 🤖 Ayuda con IA**.

Descarga un archivo `.md` que resume todo lo que permite hacer la app (esta documentación + unas preguntas frecuentes + instrucciones para la IA). Dáselo a **cualquier IA conversacional** (ChatGPT, Claude, Gemini, Perplexity, Le Chat, Copilot, etc.) — podrá responder a todas tus preguntas sobre MyKTAMap con un contexto preciso.

**Cómo usarlo**:

1. Pulsa 🤖 Ayuda con IA → botón **📥 Descargar el contexto (.md)**
2. El archivo `MyKTAMap-AI-Context-AAAA-MM-DD.md` llega a tus descargas
3. Abre la IA que prefieras → pega el archivo al principio de la conversación
4. Haz tus preguntas con normalidad: *«¿Cómo añado un punto?»*, *«Mi plano se cuelga, ¿por qué?»*, etc.

> 🔒 **Confidencialidad**: el archivo contiene ÚNICAMENTE la documentación — ningún dato personal (ni tus planos, ni puntos, ni sesiones, etc.). Puedes compartirlo sin riesgo.

> 💰 **Nota**: la IA que uses puede ser de pago o tener cuotas según el servicio. MyKTAMap sigue siendo gratuita — la ayuda con IA es solo una forma de aprovechar una IA externa.

---

## 🗺️ Leyenda

> Accesible mediante el grupo **📚 Ayuda / Documentación / Leyenda → 🗺️ Leyenda**.

Muestra la leyenda completa de los iconos y trazados, agrupados por categoría: **🕳️ Pozos**, **🪜 Accesos** (pozos con escalones, escaleras, cavidades), **⚠️ Señalización**, **🛣️ Trazados** y **⬛ Zonas**.

> 💡 La leyenda muestra **todos los iconos que la aplicación sabe reconocer**, aunque tu plano actual no los utilice. Es práctico para descubrir los tipos disponibles antes de añadir tus puntos.

---

## ⚙️ Ajustes (en modo mapa, por plano)

> Accesible directamente mediante el botón **⚙️ Ajustes** de la barra lateral (clic directo, sin submenú).
>
> Esta ventana se centra **en el plano**. Para los **ajustes globales** (idioma, tema, PIN, reinicio, iconos según el zoom, imantación…), pasa por **⚙️ Configuración** en la pantalla de inicio — ver la sección dedicada más arriba. La separación es intencionada: Ajustes = lo que concierne a ESTE plano, Configuración = lo que concierne a la app.

### ✓ Todo se guarda en cuanto lo cambias

**Ya no hay botón Aplicar**: cada campo se guarda en cuanto lo modificas (un destello verde lo confirma). Un valor **fuera de rango** se pone en rojo, un mensaje indica los límites y **no se escribe nada** — se conserva el valor anterior. Cierras con **Esc**, **✕** o **Cerrar**: no se pierde nada.

Cada grupo lleva su **alcance** en el título — **📍 este plano** o **🌍 todos los planos** — y se **pliega** con un toque en el título (elección recordada). En el teléfono, al abrir solo se muestran los títulos, salvo el primer grupo.

### 🌍 Aplicación *(🌍 todos los planos)*
- **🎬 Activar el modo presentación**: pantalla completa sin interfaz (demostraciones / proyección). Tecla **F** en PC; salida con **F** / **Esc** o el botón flotante ✕.
- **🏠 Ajustados desde el inicio** *(solo lectura)*: idioma, tema, iconos adaptativos al zoom, anclaje de paneles, imantación al dibujar, **cuaderno de salidas**. Su valor se lee aquí; el botón **🏠 Ir al inicio para cambiarlos** sale del plano (tu sesión se conserva) y te lleva a ⚙️ Configuración.

### 📐 Plano: escala y geolocalización *(📍 este plano)*
- **Escala (px/m)** con el botón **🎯 Calibrar** (ver más abajo). Una escala nula o negativa se rechaza.
- **🧭 Calibración del Norte**: útil cuando la PARTE SUPERIOR del plano no es el Norte verdadero. Campo de ángulo [0,360[ o botón **📐 Calibrar (2 clics)** (Sur y luego Norte en el mapa). Efecto inmediato en el rastreador; la brújula física sigue apuntando al Norte real. **↺ Reiniciar** para volver a 0.
- **🌐 Georreferenciación GPS**: el estado se muestra en el grupo («no georreferenciado», «✅ puntos A y B», «A, B y C», «B estimado») y el botón **🌐 Abrir la georreferenciación…** abre su **propia ventana**: puntos A / B (+ C opcional) con **🔍 Buscar un punto**, **📍 Pulsar en el mapa** y **🧭 Estimar B**, y después **💾 Guardar** / **🗑️ Borrar** (confirmación). El calibrado introducido aquí se comparte con las exportaciones KMZ / GPX del plano y rellena 📡 Exportación externa.

> 💡 **Autores de planos**: para incluir de forma duradera el Norte o un **PDF de Historia** en el ZIP del plano (para todos los usuarios), pasa por el **generador avanzado**. Para un PDF de Historia cargado solo en tu sesión, usa el botón de importación de la ventana **📖 Modo Historia** (barra de estado).

### 📍 Navegación y rastreador *(📍 este plano)*
- **Posición inicial del rastreador**: X/Y, o **🔍 Elegir mediante un punto**, o **📍 Pulsar en el mapa**. En cuanto cambia el punto de partida, el seguimiento **vuelve a empezar ahí** (el recorrido en curso se borra) — un mensaje lo indica.
- **Detección de pasos**: longitud del paso [0; 1,5 m], umbral [10; 30], espera [300; 3 000 ms]. Fuera de rango, no se guarda nada.
- **🧭 Navegación inteligente** (ajuste a los trazados): interruptor (un mensaje lo confirma), tolerancia lateral [1; 50 m], peso del rumbo [0; 5].

### 🎨 Visualización *(📍/🌍 según la línea)*
- **⚪ Mostrar los círculos en los cruces de trazados** *(este plano)* — efecto inmediato, guardado por plano.
- **🔆 Mantener la pantalla encendida** *(todos los planos)* — Wake Lock, readquirido al volver de segundo plano. También en ⚙️ Configuración.
- **🎤 Comandos de voz (BETA)** *(todos los planos)*.
- Si tu navegador no admite el wake lock o la voz (Firefox), la línea sigue **visible, atenuada, con el motivo** — como los sensores de abajo.

### 🚀 Rendimiento *(📍 este plano)*
- **🚀 Modo ULTRA** aplica 7 optimizaciones de golpe, o una a una (simplificación de trazados, animaciones, círculos, ventanas emergentes, guardado lento, dibujo solo de lo visible, límite de alejamiento en móvil). Detalle en la sección Rendimiento más arriba.
- En un plano **multinivel**: **🏗️ Mostrar todos los niveles al iniciar** (se aplica en la próxima carga del plano).

### 🛰️ Opciones por sensor *(🌍 todos los planos)*
- **🔋 Nivel de batería** y **📳 Vibración háptica**. Un sensor rechazado por el dispositivo (o por iOS) se muestra atenuado, con el motivo.

### 🔒 Privacidad y seguridad *(🌍 todos los planos)*
- **🕵️ Modo incógnito**: abre una nueva ventana que no escribe nada en el dispositivo.

### 🛠️ Sistema y mantenimiento *(📍 este plano)*
- Muestra el **modo de rendimiento** del plano actual — solo lectura aquí (se elige en ℹ️ Info, para un plano sin teselado V2). Los registros detallados viven en ⚙️ Configuración (inicio) → 🛠️ Modo Desarrollador.

### Acciones
- **↺ Valores por defecto**: restablece **los ajustes de ESTE plano** (escala, podómetro, punto de partida, navegación inteligente, Norte) a los valores del plano y devuelve el seguimiento a la partida — **se pide confirmación**. Los ajustes del inicio no se mueven. Distinto de **💥 Reiniciarlo todo** en ⚙️ Configuración, que lo purga todo.
- **Cerrar** (o Esc, o ✕) — nada que validar.

> ⚠️ **Para activar o modificar el código de acceso local (PIN / Face ID)** hay que pasar por la **⚙️ Configuración de la pantalla de inicio** — la sección 🔐 Código de acceso local NO está en ⚙️ Ajustes (por diseño: es un ajuste crítico global, no por plano).

### 🎯 Calibrar la escala

Si la aplicación te da una distancia distinta de la real (por ejemplo 100 m mostrados cuando sabes que hay 150 m sobre el terreno):

1. Mide la distancia en la aplicación con **📐**
2. Abre **⚙️ → 🎯 Calibrar**
3. Introduce la **distancia mostrada** (100) y la **distancia real** (150)
4. La nueva escala aparece en tiempo real
5. Pulsa **Aplicar** → el valor se inyecta en el campo Escala **y se guarda al instante** (nada más que validar)

> Cuanto mayor sea la distancia sobre la que calibres, más preciso será el resultado.

---

## 🏷️ Distintivo de versión en el pie (cargador)

En la parte inferior del cargador, junto a la mención de la licencia, un pequeño **distintivo de versión** muestra la versión actual de la aplicación instalada.

**Dos estados visuales**:

| Estado | Aspecto | Acción al pulsar |
|---|---|---|
| **Estás al día** | número de versión en gris discreto | Ventana «✅ Ya está al día» — muestra la versión instalada + la fecha de publicación + **las notas de esa versión** (registro de cambios) |
| **Actualización disponible** | `versión instalada → versión nueva` en **azul parpadeante** | Ventana «🔔 Actualización disponible» — propone una actualización suave (conserva planos y sesiones) o un reinicio completo |

Cuando hay una versión nueva disponible, el distintivo **parpadea en azul** para llamar la atención sin agredir visualmente. Al pulsarlo, puedes elegir actuar de inmediato (actualización suave o reinicio completo) o dejarlo para más tarde (posponer 24 h).

> 💡 El distintivo salta la posposición de 24 h: si pulsaste «Más tarde» hace unos minutos pero cambias de opinión, pulsa el distintivo para volver a lanzar la ventana de actualización.

> 💡 Si ya estás al día, pulsar el distintivo muestra igualmente las notas de la última versión — práctico para releer qué cambió en la actualización que has instalado.

---

## 🔐 Código de acceso local (PIN / Face ID)

Bloquea la app en cada arranque con un PIN de 4 a 6 cifras, **Face ID** o **Touch ID** si tu dispositivo lo admite. 100 % local — ninguna contraseña se envía por Internet, y no hay recuperación posible en caso de olvido.

> ⚠️ **Es una barrera de uso, no un cifrado de los datos.** El bloqueo impide la apertura normal de la app, pero un atacante motivado puede sortearlo mediante las herramientas de desarrollo. Las fotos y las sesiones siguen guardadas sin cifrar en el navegador. Es exactamente el mismo nivel de seguridad que el código de acceso comunitario existente — asumido con honestidad.

### Activar el PIN

1. Desde la pantalla de inicio (cargador) → botón **⚙️ Configuración** arriba a la derecha
2. Baja hasta la sección **🔐 Código de acceso local**
3. Pulsa **🔐 Activar el código de acceso**
4. Elige tu código (de 4 a 6 cifras) y confírmalo una segunda vez
5. Si tu dispositivo admite biometría (Face ID de iPhone, Touch ID de iPad, huella de Android, Windows Hello…), aparece una pregunta: «¿Activar también la biometría?». Aceptar = en el siguiente arranque desbloqueas con una mirada o un dedo (sin escribir el código)

> 📝 **Apunta bien tu código** en un lugar seguro. No hay ninguna recuperación posible en caso de olvido — te verías obligado a reiniciarlo todo (pérdida de la sesión y de los planos no memorizados).

### En el siguiente arranque de la app

La pantalla de bloqueo aparece automáticamente después del splash:

- **Con biometría**: la solicitud de Face ID / Touch ID aparece de inmediato. También puedes cancelar e introducir tu PIN en su lugar.
- **Sin biometría**: introduces directamente tu PIN mediante el teclado numérico. La última cifra escrita es visible 0,5 s y luego se sustituye por ● (patrón de iOS).

### Modificar el PIN

⚙️ Configuración → 🔐 Código de acceso local → **✏️ Modificar el código**. Validación por biometría O por el código actual, y después introducción del nuevo PIN 2 veces.

### Desactivar el PIN

⚙️ Configuración → 🔐 Código de acceso local → **🔓 Desactivar**. Confirmación por biometría O por el código actual. La app deja de pedir el código en el siguiente arranque.

### Bloqueo temporal: 5 códigos erróneos

Tras **5 códigos incorrectos seguidos**, la app se bloquea **temporalmente**: 10 min la primera vez, luego 1 h, 6 h y 24 h con cada nueva serie de 5 errores. Se muestra una cuenta atrás y el teclado vuelve solo al terminar el plazo; un código correcto lo reinicia todo. No hay **ningún botón de reinicio** en esa pantalla ni recuperación del código en caso de olvido — si de verdad lo has perdido, queda **💥 Reiniciarlo todo** desde la pantalla de inicio (pérdida de la sesión en curso y de los planos no memorizados). El plazo sigue el reloj del teléfono.

> Los intentos biométricos fallidos **no** cuentan dentro de los 5 — la especificación WebAuthn gestiona su propio bloqueo nativo en el dispositivo. Puedes cancelar un Face ID por error sin temer agotar tus intentos.

---

## 🔧 Reiniciar

En caso de problema o para forzar una actualización, usa **⚙️ Configuración (pantalla de inicio) → 💥 Reiniciar todo**. Esta acción retira el componente sin conexión (Service Worker) y da de baja el Service Worker, vacía la caché y recarga la aplicación.

> ⚠️ Realiza esta acción únicamente con una conexión a Internet disponible. Sin red, la aplicación quedará inutilizable hasta la siguiente recarga completa.
---

## 🐳 Autoalojamiento con Docker

Si quieres hacer funcionar MyKTAMap **en tu propio equipo** (PC, Raspberry Pi, NAS, servidor dedicado) — para tenerla disponible en tu red local, garantizar el 100 % sin conexión, o simplemente por curiosidad — existe una **imagen Docker lista para usar**.

### En un solo comando

```bash
docker run -d --name myktamap -p 8443:8443 ghcr.io/karmakta91/myktamap:latest
```

Después abre **`https://localhost:8443/`** en tu navegador. En el primer acceso, tu navegador te avisará de un **certificado no reconocido** (es normal, la imagen genera un certificado autofirmado al arrancar). Pulsa **«Configuración avanzada» → «Continuar a localhost»** para aceptarlo, y la app aparecerá.

### Multiplataforma

La imagen está compilada para 2 arquitecturas:
- **amd64** (PC Intel/AMD de escritorio o servidor)
- **arm64** (Raspberry Pi 4/5 de 64 bits, Synology ARM, Apple Silicon)

Docker detecta automáticamente la versión correcta al hacer `pull`.

### Extra: tus propios planos

Para conservar tus planos entre reinicios del contenedor:

```bash
docker run -d --name myktamap \
  -p 8443:8443 \
  -v /ruta/a/tus/planos:/usr/share/nginx/html/data/plans \
  ghcr.io/karmakta91/myktamap:latest
```

### Extra: tu propio certificado TLS

Si tienes un certificado válido (Let's Encrypt con un dominio local, autoridad interna, etc.), puedes montarlo como volumen en lugar de usar el autofirmado:

```bash
docker run -d --name myktamap \
  -p 8443:8443 \
  -v /ruta/a/tus/certs:/etc/nginx/certs \
  ghcr.io/karmakta91/myktamap:latest
```

El volumen debe contener `server.crt` + `server.key`.

### Extra: acceso mediante un nombre de dominio local

```bash
docker run -d --name myktamap \
  -p 8443:8443 \
  -e MKM_HOSTNAME=myktamap.local \
  ghcr.io/karmakta91/myktamap:latest
```

El certificado autofirmado incluirá `myktamap.local` entre los nombres autorizados. Práctico si tienes un DNS local (Pi-hole, AdGuard Home) que resuelve ese nombre hacia tu host.

### Actualizaciones

Para pasar a una versión nueva:

```bash
docker pull ghcr.io/karmakta91/myktamap:latest
docker stop myktamap && docker rm myktamap
docker run -d --name myktamap -p 8443:8443 ghcr.io/karmakta91/myktamap:latest
```

También puedes **fijar** una versión exacta en lugar de `latest`:
- `ghcr.io/karmakta91/myktamap:v1.36.0` — esa versión exacta, inmutable
- `ghcr.io/karmakta91/myktamap:1.36` — último parche de la 1.36.x
- `ghcr.io/karmakta91/myktamap:1` — última versión menor de la 1.x

### Límites

- **Service Worker + certificado autofirmado**: algunos navegadores (Chromium, Safari) se niegan a instalar el Service Worker si el certificado no está reconocido. Si la app funciona pero parece «no guardarse en caché» para el modo sin conexión, acepta primero la advertencia de seguridad y después recarga.
- **Conflicto de puertos**: si ya tienes otro servicio en el `8443` del host, cambia el mapeo: `-p 9443:8443`, por ejemplo.
- **Sin actualizaciones automáticas**: tú decides cuándo hacer `docker pull`. Para actualizaciones automáticas, mira [Watchtower](https://github.com/containrrr/watchtower).

> 🔒 **Ningún dato se envía a ninguna parte**. La imagen incluye la app vanilla, exactamente igual que la versión oficial, pero servida desde tu propio equipo. Es incluso un poco más apta para el uso sin conexión que la versión de producción (sin la petición ocasional a `gstatic.com` para el ping de conectividad — la auditoría de red sigue activa si quieres comprobarlo).

> 📖 **¿Nunca has usado Docker?** Existe una guía paso a paso dedicada: **[`docs/applications/DOCKER_INSTALL.md`](DOCKER_INSTALL.md)** — instalación de Docker Desktop (Windows/Mac/Linux), arranque del demonio, resolución de los errores más comunes (certificado autofirmado, conflictos de puertos, WSL 2), alternativas sin Docker.

> 📚 **Detalles técnicos**: ver `docs/architecture/docker-selfhost.md` en el repositorio de GitHub.

---

## 🆘 En caso de problema

**El plano no se carga**
Comprueba que `plan-config.json` está en la raíz de tu archivo ZIP y que todos los archivos referenciados están presentes.

**La imagen del plano se ve borrosa**
Según el preajuste elegido, la resolución de trabajo se reduce (`Rendimiento` más que `Equilibrado`, que a su vez más que `Calidad`). Si tu dispositivo tiene memoria suficiente, cambia a **🌟 Calidad** en la próxima carga para obtener una imagen más nítida.

**El rastreador deriva demasiado rápido**
Reajusta tu posición con frecuencia. Ajusta la escala y el tamaño del paso en los ajustes.

**La aplicación falla en móvil con un JPEG muy grande**
Elige **⚡ Rendimiento** en el selector de Modo de rendimiento antes de cargar el plano.

**Un modo se queda activo sin querer**
Vuelve a pulsar el botón activo (en verde) para desactivarlo.

**La aplicación no se actualiza tras una nueva versión**
Usa **⚙️ Configuración (pantalla de inicio) → 🔄 Forzar la actualización** (actualización suave, conserva todos tus datos). Si no basta: **⚙️ Configuración → 💥 Reiniciar todo** (purga total, última opción). La actualización suave es rápida gracias a una descarga previa en segundo plano.

**📡 App bloqueada tras una actualización suave**
Si después de una actualización la app se queda atascada (cargador sin CSS, página en blanco, recursos mal cargados), la causa más frecuente es un **nodo CDN de GitHub Pages que sirve contenido corrupto** (MIME incorrecto, recurso truncado) para la zona geográfica actual. Primer reflejo antes de cualquier reinicio: **desactiva tu VPN si está activo y cambia de red** (4G ↔ wifi ↔ otro wifi). El simple hecho de cambiar de IP o de nodo CDN suele bastar para desbloquearla.

**🆘 Reinicio de urgencia sin tocar los datos**
Si la app está totalmente atascada incluso tras cambiar de red, hay dos opciones que preservan tus planos / sesiones / fotos / preferencias:

1. **URL de interruptor de emergencia**: abre en una **pestaña privada** de Chrome/Safari (NO en la PWA):
   ```
   https://myktamap.fr/?killsw=1
   ```
   → da de baja el Service Worker + vacía todas las cachés HTTP/PWA → mensaje de éxito → recarga normal.

2. **Página de reinicio autónoma**: si la URL no basta (caché de HTML atascada):
   ```
   https://myktamap.fr/killsw.html
   ```
   → página independiente 100 % en línea (CSS/JS incrustados), sin ninguna dependencia, funciona aunque todo lo demás de la app esté roto. Muestra 3 pasos (SW dado de baja, cachés purgadas, listo para recargar) + botón «🚀 Recargar la app».

> ⚠️ Estas dos herramientas **no eliminan NINGÚN dato de usuario** (planos memorizados, sesiones por plano, fotos de POI, fotos del Modo Rescate, copias de seguridad, preferencias). Solo purgan la caché de los archivos de la app (HTML / CSS / JS / iconos). En caso de duda, **📤 Exporta el perfil** ANTES para tener una copia.

**Problema sin resolver**
Abre **⚙️ → 🐛 Registros**, copia los registros y transmíteselos al equipo técnico.

---

## 📖 El porqué

> *Un mapa nunca ha sustituido a la salida. Solo ayuda a no perderse.*

### De dónde viene

MyKTAMap nació de una necesidad sencilla: tener, **en el bolsillo**, un mapa subterráneo **fiable, sin conexión y que no se filtre**. No una tienda de aplicaciones que pide acceso a tus contactos para mostrar un plano. No un sitio que te rastrea en cuanto pulsas. No una nube que mañana decide enviarte un boletín o revender tus rastros.

Solo un archivo `.zip` que contiene el plano, abierto en una pestaña del navegador, que funciona **sin red** y que te deja **el control absoluto** sobre lo que haces con él.

### A quién va dirigida

A quienes bajan. Exploradores de las canteras de París, espeleólogos aficionados, urbexers prudentes, rescatadores formados en medio subterráneo, investigadores del patrimonio — en resumen, a toda persona que haga un uso **legítimo y respetuoso** de estos lugares y que quiera una herramienta que no ponga a nadie en peligro (ni a las personas ni a los lugares).

La app **no tiene ninguna pretensión de sustituir** a los viejos planos de papel anotados, a las salidas guiadas por los veteranos, a la transmisión oral ni a la memoria colectiva. Viene **como complemento**, como una capa digital que se superpone a esos saberes — no como un sustituto.

### La filosofía

- 🌐 **100 % sin conexión por defecto** — la app funciona sin red una vez cargado el plano. Puedes usarla en un avión, en el metro o a 30 m bajo tierra.
- 🔒 **Cero telemetría** — no se llama a ningún servicio de terceros para seguirte. La única petición externa posible es la actualización del código de la app (y puedes cortarla). Quien audite puede comprobarlo en `🔒 Auditoría de red`.
- 📦 **Propiedad de los datos** — tus anotaciones, tus fotos y tus mediciones se guardan **localmente**, en el navegador. Nadie más que tú tiene acceso. Puedes exportarlo todo en cualquier momento (`💾 Guardar sesión`) y borrarlo todo en 2 clics (`💥 Reiniciarlo todo`).
- 🤝 **Código abierto** — la licencia es `CC BY-NC-SA 4.0`. Puedes leer el código y auditarlo. Sin cajas negras, sin marketing.
- ⚖️ **Discreción = respeto** — un plano compartido de cualquier manera es un lugar debilitado. La app no contiene ningún plano por defecto; cada usuario carga los suyos y **no debe difundirlos** más allá del círculo de confianza.

### Lo que la app no es

- ❌ **No es un GPS bajo tierra** — la geolocalización nativa no funciona bajo la roca. El «rastreador» de la app es un **podómetro + dirección** que deriva rápido; hay que reajustarlo con regularidad.
- ❌ **No es una garantía de seguridad** — el mapa da el camino, no el oxígeno. Sigues siendo tú quien juzga los riesgos (derrumbes, agua, gases, fatiga).
- ❌ **No es un directorio** — la app no cataloga lugares. Muestra lo que tú le das, y punto.
- ❌ **No es una red social** — sin cuenta, sin perfil, sin compartir con un clic. Tú eliges a quién envías tu `.zip`, y cómo.

> Si buscas una aplicación para el gran público, llave en mano, con reseñas y estrellas, no es esta. Si buscas una herramienta que te deje dueño de tus datos y de tu anonimato bajo tierra, **bienvenido**.

---

## 🙏 Agradecimientos

MyKTAMap no existiría sin el trabajo, el saber y la paciencia de mucha gente. Este proyecto lo lleva **una sola persona** en el desarrollo (KARMA), pero se apoya en **comunidades**, **herramientas libres** y **personas** que se han tomado el tiempo de transmitir.

### A la comunidad de exploradores

A los veteranos que levantaron las galerías a lápiz, plano en mano, generación tras generación. A los apasionados que han recopilado, digitalizado, contrastado y verificado. A quienes transmiten — en una salida, en un curso de iniciación, susurrando a un principiante «no, por ahí, no por allá». MyKTAMap no es más que **una herramienta más** en esa larga cadena. Sin vuestros planos, sin vuestras historias, sin vuestra vigilancia, esta app no tendría nada que mostrar.

### A los probadores y probadoras de campo

A quienes aceptaron bajar con una versión `1.x.y-beta` inestable, subir con capturas de errores, señalar las fricciones de la interfaz y proponer funciones imposibles de imaginar desde un escritorio. A los compañeros que probaron cada versión bajo tierra, a oscuras, con frío, y se tomaron la molestia de contar qué fallaba. Vuestros comentarios han moldeado cada corrección — sin vosotros, la app se habría quedado en un prototipo cómodo hecho desde un sofá.

### A las herramientas libres

MyKTAMap se apoya enteramente en **piezas de código abierto**. Sin estos proyectos, la app simplemente no existiría:

- 🍃 **[Leaflet](https://leafletjs.com/)** *(BSD 2-Clause)* — motor cartográfico interactivo. Es el núcleo de la visualización de los planos. Gracias a **Vladimir Agafonkin** y a los numerosos colaboradores del proyecto.
- 🔄 **[Leaflet.ImageOverlay.Rotated](https://github.com/IvanSanchez/Leaflet.ImageOverlay.Rotated)** *(BSD 2-Clause, incluido en el repositorio)* — complemento que proyecta una imagen como un paralelogramo mediante 3 esquinas (matriz de transformación CSS). Se usa para el ajuste con **2 anclas** de las capas de imagen y para la proyección de los planos de MyKTAMap **sobre la Vista OSM**. Gracias a **Iván Sánchez Ortega** por este elegante complemento.
- 📦 **[JSZip](https://stuk.github.io/jszip/)** *(MIT/GPL a elegir)* — lectura y escritura de los archivos `.zip` en el navegador (planos, sesiones, exportaciones, extracción parcial para el minimapa de la pantalla de inicio). Gracias a **Stuart Knightley** y a sus colaboradores.
- 📤 **[jsPDF](https://github.com/parallax/jsPDF)** *(MIT)* — generación de PDF imprimibles (A0 → A4, vertical/horizontal, página en miniatura del Modo Rescate, incrustación del Modo Historia).
- 📸 **[html2canvas](https://html2canvas.hertzen.com/)** *(MIT, incluido en el repositorio)* — captura del resultado del DOM como imagen (lienzo → PNG). Se usa para integrar el **mapa OSM de Leaflet** en los PDF **«Briefing para bomberos»** del Modo Rescate: la pila gráfica webgl + teselas + superposiciones + plano proyectado, todo ello congelado en una imagen incrustada en el PDF entregado a los servicios de rescate externos. Gracias a **Niklas von Hertzen** y a sus colaboradores.
- 🌍 **[OpenStreetMap](https://www.openstreetmap.org/) y sus colaboradores** — bajo licencia **[ODbL](https://opendatacommons.org/licenses/odbl/)** para los datos y **[CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/)** para la cartografía. Datos cartográficos mundiales mostrados en la **Vista OSM** (ventana del plano + widget de la pantalla de inicio) **únicamente cuando tú la activas mediante la opción dedicada**. La app muestra la atribución `© OpenStreetMap contributors` en la esquina de cada mapa OSM, **como exige la licencia ODbL**. Alojamiento de las teselas: **[OSM Foundation](https://wiki.osmfoundation.org/wiki/Privacy_Policy)** (fundación sin ánimo de lucro, política de registros pública, sin rastreo publicitario). Sin ese bien común monumental — construido desde 2004 por **miles de voluntarios** que cartografían el mundo calle a calle — la Vista OSM no existiría.
- 🧭 **Algoritmo de Dijkstra** (1959) — cálculo del camino más corto para los itinerarios asistidos. Edsger W. Dijkstra (1930-2002): gracias por esta idea de hace más de 60 años que sigue sosteniendo Google Maps, el enrutamiento de OpenStreetMap y todos los GPS del mundo.
- 🌐 **[Estándar GPX 1.1](https://www.topografix.com/gpx.asp)** — formato de intercambio con TopoDroid, OsmAnd, Strava, Garmin y el ecosistema de actividades al aire libre.
- 🛡️ **[Estándares web](https://developer.mozilla.org/)** — Service Worker, IndexedDB, WebAuthn, FileSystemAccess API, Geolocation API. Mantenidos por miles de personas con las que nunca nos cruzaremos y a las que debemos muchísimo.

> 📜 **Cumplimiento de licencias**: los archivos incluidos en el repositorio (`lib/leaflet/`, `lib/leaflet-imageoverlay-rotated.js`, `lib/jszip.min.js`, `lib/jspdf.umd.min.js`, `lib/html2canvas.min.js`) conservan su cabecera de licencia original. Para el detalle de red (cuándo se contacta cada recurso), consulta la **[Auditoría de red](./NETWORK_AUDIT.md)** (accesible también desde la ventana de Auditoría dentro de la app).

### Al ecosistema PWA

A los navegadores (Chromium, Firefox, Safari y sus versiones móviles) que implementan los estándares modernos de la web y permiten que una simple página funcione como una app nativa sin depender de ninguna tienda.

### Al asistente de desarrollo

Buena parte del código de esta versión se ha coescrito con **Claude (Anthropic)**, un asistente de IA que ha acompañado el desarrollo durante decenas de sesiones. Es una herramienta al mismo título que Leaflet o JSZip — útil, documentada con honestidad, y que no sustituye ni la visión ni las decisiones finales (siempre del lado humano).

### A ti, que lees esta guía

Por haberte tomado 10 minutos para leer en lugar de pulsar a ciegas. Es exactamente la actitud que estos lugares exigen — **tomarse el tiempo, entender antes de actuar, respetar lo que aún no se domina**.

> Si quieres contribuir — informar de un error, hacer una sugerencia, echar una mano con la documentación — pasa por el gestor de incidencias del repositorio o por los canales habituales de la comunidad.

---

**Créditos de bibliotecas y algoritmos** — 🍃 Leaflet (cartografía interactiva) · 🔄 Leaflet.ImageOverlay.Rotated (ajuste con 2 anclas + proyección de la Vista OSM) · 📦 JSZip (lectura/escritura de los archivos ZIP) · 📤 jsPDF (exportación a PDF imprimible) · 📸 html2canvas (captura del DOM para el PDF de Briefing para bomberos) · 🌍 OpenStreetMap y colaboradores (datos ODbL, Vista OSM opcional) · 🧭 Dijkstra (cálculo del camino más corto para los itinerarios) · 🌐 GPX 1.1 (intercambio para actividades al aire libre).

*MyKTAMap — Guía de usuario*
*Estos lugares son frágiles. La discreción es una forma de respeto.*
