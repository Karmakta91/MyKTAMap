# 📗 MyKTAMap — Guía de usuario

## 📖 El porqué

### De dónde viene

MyKTAMap nació de una necesidad sencilla: tener, **en el bolsillo**, un mapa subterráneo **fiable, sin conexión y que no se filtre**. No una tienda de aplicaciones que pide acceso a tus contactos para mostrar un mapa. No un sitio que te rastrea en cuanto pulsas. No una nube que mañana decide enviarte un boletín o revender tus rastros.

Solo un archivo `.zip` que contiene el mapa, abierto en una pestaña del navegador, que funciona **sin red** y que te deja **el control absoluto** sobre lo que haces con él.

### A quién va dirigida

A quienes bajan. Exploradores de las canteras de París, espeleólogos aficionados, urbexers prudentes, rescatadores formados en medio subterráneo, investigadores del patrimonio — en resumen, a toda persona que haga un uso **legítimo y respetuoso** de estos lugares y que quiera una herramienta que no ponga a nadie en peligro (ni a las personas ni a los lugares).

La app **no tiene ninguna pretensión de sustituir** a los viejos mapas de papel anotados, a las salidas guiadas por los veteranos, a la transmisión oral ni a la memoria colectiva. Viene **como complemento**, como una capa digital que se superpone a esos saberes — no como un sustituto.

### La filosofía

- 🌐 **100 % sin conexión por defecto** — la app funciona sin red una vez cargado el mapa. Puedes usarla en un avión, en el metro o a 30 m bajo tierra.
- 🔒 **Cero telemetría** — no se llama a ningún servicio de terceros para seguirte. Las únicas peticiones externas son la comprobación de actualizaciones y, si uno de tus mapas está calibrado GPS, el fondo de mapa OpenStreetMap de la Vista OSM (activa por defecto, desactivable en ⚙️ Configuración): ningún dato de tus mapas sale. Quien audite puede comprobarlo en `🔒 Auditoría de red`.
- 📦 **Propiedad de los datos** — tus anotaciones, tus fotos y tus mediciones se guardan **localmente**, en el navegador. Nadie más que tú tiene acceso. Puedes exportarlo todo en cualquier momento (`💾 Guardar sesión`) y borrarlo todo en 2 clics (`💥 Reiniciarlo todo`).
- 🤝 **Código abierto** — la licencia es `CC BY-NC-SA 4.0`. Puedes leer el código y auditarlo. Sin cajas negras, sin marketing.
- ⚖️ **Discreción = respeto** — un mapa compartido de cualquier manera es un lugar debilitado. La app no contiene ningún mapa por defecto; cada usuario carga los suyos y **no debe difundirlos** más allá del círculo de confianza.

### Lo que la app no es

- ❌ **No es un GPS bajo tierra** — la geolocalización nativa no funciona bajo la roca. El «rastreador» de la app es un **podómetro + dirección** que deriva rápido; hay que reajustarlo con regularidad.
- ❌ **No es una garantía de seguridad** — el mapa da el camino, no el oxígeno. Sigues siendo tú quien juzga los riesgos (derrumbes, agua, gases, fatiga).
- ❌ **No es un directorio** — la app no cataloga lugares. Muestra lo que tú le das, y punto.
- ❌ **No es una red social** — sin cuenta que crear, sin perfil público, sin compartir con un clic. Tú eliges a quién envías tu `.zip`, y cómo.

---

## 🙏 Agradecimientos

MyKTAMap no existiría sin el trabajo, el saber y la paciencia de mucha gente. Este proyecto lo lleva **una sola persona** en el desarrollo (KARMA), pero se apoya en **comunidades**, **herramientas libres** y **personas** que se han tomado el tiempo de transmitir.

### A la comunidad de exploradores

A los veteranos que levantaron las galerías a lápiz, mapa en mano, generación tras generación. A los apasionados que han recopilado, digitalizado, contrastado y verificado. A quienes transmiten — en una salida, en un curso de iniciación, susurrando a un principiante «no, por ahí, no por allá». MyKTAMap no es más que **una herramienta más** en esa larga cadena. Sin vuestros mapas, sin vuestras historias, sin vuestra vigilancia, esta app no tendría nada que mostrar.

### A los probadores y probadoras de campo

A quienes aceptaron bajar con una versión `1.x.y-beta` inestable, subir con capturas de errores, señalar las fricciones de la interfaz y proponer funciones imposibles de imaginar desde un escritorio. A los compañeros que probaron cada versión bajo tierra, a oscuras, con frío, y se tomaron la molestia de contar qué fallaba. Vuestros comentarios han moldeado cada corrección — sin vosotros, la app se habría quedado en un prototipo cómodo hecho desde un sofá.

### A las herramientas libres

MyKTAMap se apoya enteramente en **piezas de código abierto**. Sin estos proyectos, la app simplemente no existiría:

- 🍃 **[Leaflet](https://leafletjs.com/)** *(BSD 2-Clause)* — motor cartográfico interactivo. Es el núcleo de la visualización de los mapas. Gracias a **Vladimir Agafonkin** y a los numerosos colaboradores del proyecto.
- 🔄 **[Leaflet.ImageOverlay.Rotated](https://github.com/IvanSanchez/Leaflet.ImageOverlay.Rotated)** *(BSD 2-Clause, incluido en el repositorio)* — complemento que proyecta una imagen como un paralelogramo mediante 3 esquinas (matriz de transformación CSS). Se usa para el ajuste con **2 anclas** de las capas de imagen y para la proyección de los mapas de MyKTAMap **sobre la Vista OSM**. Gracias a **Iván Sánchez Ortega** por este elegante complemento.
- 📦 **[JSZip](https://stuk.github.io/jszip/)** *(MIT/GPL a elegir)* — lectura y escritura de los archivos `.zip` en el navegador (mapas, sesiones, exportaciones, extracción parcial para el minimapa de la pantalla de inicio). Gracias a **Stuart Knightley** y a sus colaboradores.
- 📤 **[jsPDF](https://github.com/parallax/jsPDF)** *(MIT)* — generación de PDF imprimibles (A0 → A4, vertical/horizontal, página en miniatura del Modo Rescate, incrustación del Modo Historia).
- 📸 **[html2canvas](https://html2canvas.hertzen.com/)** *(MIT, incluido en el repositorio)* — captura del resultado del DOM como imagen (lienzo → PNG). Se usa para integrar el **mapa OSM de Leaflet** en los PDF **«Briefing para bomberos»** del Modo Rescate: la pila gráfica webgl + teselas + superposiciones + mapa proyectado, todo ello congelado en una imagen incrustada en el PDF entregado a los servicios de rescate externos. Gracias a **Niklas von Hertzen** y a sus colaboradores.
- 🌍 **[OpenStreetMap](https://www.openstreetmap.org/) y sus colaboradores** — bajo licencia **[ODbL](https://opendatacommons.org/licenses/odbl/)** para los datos y **[CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/)** para la cartografía. Datos cartográficos mundiales mostrados en la **Vista OSM** (ventana del mapa + widget de la pantalla de inicio) **en cuanto uno de tus mapas está calibrado GPS** (activa por defecto, desactivable en ⚙️ Configuración). La app muestra la atribución `© OpenStreetMap contributors` en la esquina de cada mapa OSM, **como exige la licencia ODbL**. Alojamiento de las teselas: **[OSM Foundation](https://wiki.osmfoundation.org/wiki/Privacy_Policy)** (fundación sin ánimo de lucro, política de registros pública, sin rastreo publicitario). Sin ese bien común monumental — construido desde 2004 por **miles de voluntarios** que cartografían el mundo calle a calle — la Vista OSM no existiría.
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

**Créditos de bibliotecas y algoritmos** — 🍃 Leaflet (cartografía interactiva) · 🔄 Leaflet.ImageOverlay.Rotated (ajuste con 2 anclas + proyección de la Vista OSM) · 📦 JSZip (lectura/escritura de los archivos ZIP) · 📤 jsPDF (exportación a PDF imprimible) · 📸 html2canvas (captura del DOM para el PDF de Briefing para bomberos) · 🌍 OpenStreetMap y colaboradores (datos ODbL, Vista OSM desactivable) · 🧭 Dijkstra (cálculo del camino más corto para los itinerarios) · 🌐 GPX 1.1 (intercambio para actividades al aire libre).

---

## 🔴 Advertencias importantes

### 🔐 Confidencialidad de los datos — leer en primer lugar

MyKTAMap es una herramienta de cartografía de campo que puede contener información sensible: **localización precisa de entradas, pozos, pasajes y estructuras subterráneas.**

Estos datos, si se hicieran públicos, podrían:

- Facilitar el acceso de personas no advertidas a lugares peligrosos
- Provocar una sobrefrecuentación que degrade estos espacios frágiles
- Exponer a los usuarios a acciones legales
- Poner en peligro a personas sin equipamiento

**Reglas que hay que respetar sin excepción:**

- No compartas nunca tus mapas ni tus archivos de datos fuera de tu grupo de confianza
- No publiques nunca una captura de pantalla que muestre coordenadas o ubicaciones precisas
- No dejes nunca la app abierta y visible en un dispositivo al que otras personas tengan acceso

> Estos lugares pertenecen a su historia. Su preservación depende de la discreción de quienes los frecuentan.

### ⚠️ Advertencia sobre el rastreador de posición

El tracker estima tu posición **sin GPS**, a partir de los sensores de movimiento del teléfono (acelerómetro y giroscopio). Es **experimental**:

- el error crece a medida que caminas;
- la precisión varía mucho según el teléfono y la forma de sujetarlo;
- los cambios de nivel (escaleras, escalas, pozos) no se tienen en cuenta.

**Es una ayuda visual, no un sistema de navegación fiable.** Recolócalo (**📍 Modo recolocación**, menú 🧭 Tracker) en cuanto reconozcas una referencia en el mapa. Lo que hay que llevar pase lo que pase: «🆘 En caso de emergencia bajo tierra».

### 🚨 Alertas públicas (difusión en tiempo real)

El autor puede difundir a toda la comunidad **alertas de seguridad**: incendio, cierre de un acceso, gases tóxicos… Nunca mensajes comerciales.

- **Al iniciar**, una alerta en curso aparece con sus consignas: **rojo pulsante** = situación crítica, hay que leerla sin falta; **naranja** = información importante; **azul** = simple aviso. Si hay varias, una lista las ordena de la más grave a la menos grave.
- **Entendido** la archiva: solo vuelve si el autor la modifica o publica una nueva.
- **El botón 🚨 de la pantalla de inicio** (a la izquierda de 📖) toma el color de la alerta no leída más grave (gris si no hay ninguna), con su número cuando hay varias. Al pulsarlo vuelve a mostrar todas las alertas en curso, incluso las leídas — o **Ninguna alerta en curso**, o **Verificación imposible** sin conexión: así sabes si una alerta antigua sigue vigente.

### 🔒 Confidencialidad y auditoría de red

**Tus anotaciones, sesiones, mapas y datos personales se quedan en tu dispositivo: nada se envía a un servidor ni a un servicio de terceros.**

La app solo contacta con su propio sitio (carga, actualizaciones, alertas, prueba de conexión) y con OpenStreetMap, que proporciona el fondo de la **vista OSM** — activa por defecto, se desactiva en ⚙️ Configuración. OpenStreetMap ve por tanto las zonas que consultas, pero ningún dato de tus mapas.

Para comprobarlo tú mismo: ⚙️ Configuración (pantalla de inicio) › **🔒 Privacidad y Auditoría**:

- **📋 Ver el registro de red** — todas las peticiones de la app en directo, y si envían datos; se puede copiar, exportar o vaciar. Si una petición envía datos, o aparece una dirección externa distinta de OpenStreetMap (en rojo), **avisa al autor**: Instagram **@karma_kta** o **contact@myktamap.fr**.
- **📖 ¿Qué hace la app en la red?** — la lista de direcciones que la app puede contactar y cómo comprobarlo con tu navegador (F12, pestaña Red). La página de auditoría completa describe el estado actual; lo que cambió en cada versión está en su página «historial de versiones».
- **🔌 La pastilla «Base de datos: desactivada»**, abajo en la pantalla de inicio junto al número de versión, indica si la instalación que usas está conectada a una base de datos en línea. En myktamap.fr dice «desactivada», y así seguirá: este sitio no tiene ni base de datos ni backend. Una instalación independiente (club, equipo) puede declarar una: la pastilla cambia entonces de color y de texto. Tócala para leer su estado y abrir la lista anterior. En una instalación conectada a una base de datos dice «conectada» o «inaccesible»; si falta el módulo de conexión de esa instalación, la app muestra **«Instalación no disponible»** y permanece cerrada: inténtalo más tarde o avisa a su gestor. Con una cuenta de la instalación, tus acciones (contraseña, cerrar sesión) están arriba en **👤 Mi perfil**, y un administrador gestiona las cuentas desde **⚙️ Configuración**. **Cerrar sesión borra del dispositivo** los datos de esa cuenta (mapas de la instalación, sesiones, fotos): lo que aún no se ha enviado se avisa antes. En una instalación así: la ficha ℹ️ de un mapa local ofrece **☁️ Publicar este mapa** y después **reemplazar tu copia local** por la versión ☁️ (tus anotaciones, fotos y favoritos la acompañan); el **💾** de la fila de un mapa ☁️ lo guarda en tu dispositivo (**✅** = guardado y al día); en el tracker, **📡 Compartir mi posición en este mapa** muestra tu marcador a los demás, solo si lo marcas (es tu posición **en el mapa**, la de tu seguimiento: la app no usa el GPS). El botón **👥 Equipo**, a la izquierda del mapa, muestra quién está en el mapa, si lo consulta o lo modifica, y su posición en el mapa si la comparte (📍 Centrar, 👁 Seguir, 〰 trazo); en la pantalla de inicio, **👥 N** en un mapa ☁️ indica que otros lo tienen abierto (**✏️**: en modificación). En la ventana **Itinerario**, **🧭 Mostrar mi itinerario al equipo** lo hace visible (en amarillo, solo lectura) para quienes ven el mapa, actualizado en cada etapa, retirado cuando lo borras y a las 24 h. En un mapa que tu acceso solo te permite consultar, las herramientas de dibujo aparecen en gris: al tocarlas se recuerda que el mapa es de solo lectura. En la pantalla de conexión de una instalación así, la pastilla bajo la tarjeta indica si la base de datos responde (tócala para comprobarlo de nuevo), y los iconos 📖 y 🆘 abren la documentación y la solución de problemas.

---

## 🚀 Primeros pasos

### 📱 Instalar la aplicación en móvil (iPhone/Android)

MyKTAMap se instala como una aplicación, sin pasar por la App Store ni la Play Store:

1. Abre `myktamap.fr` en Safari (iPhone) o Chrome (Android).
2. Botón de compartir ↑ (Safari) o menú ⋮ (Chrome) → **Añadir a pantalla de inicio**, y confirma.
3. Abre siempre la app desde el icono creado: se abre a pantalla completa, sin la barra del navegador.

> ⚠️ **En iPhone, instala la app antes de memorizar tus mapas**: en Safari sin instalar, el espacio es reducido (~50 MB) y puede borrarse tras una inactividad prolongada; instalada, dispone de cerca de 1 GB duradero. Android y PC ofrecen varios GB. Si falta espacio, aparece un aviso: el mapa sigue siendo utilizable, pero tendrás que volver a seleccionar su archivo cada vez que lo abras.

### 📥 Instalar la aplicación en PC

En Chrome, abre `myktamap.fr`, haz clic en **Instalar** a la derecha de la barra de direcciones y confirma. Después abre la app desde el icono creado en tu escritorio.

### 📦 Cargar un mapa

Al abrir la app, la **pantalla de arranque** dibuja una galería (unos 4 s) y deja paso a la pantalla de inicio en cuanto está lista. Un toque, un clic o Esc la salta. Si tu dispositivo pide reducir las animaciones, aparece sin movimiento.

La pantalla de inicio ofrece:

- **▶️ Reanudar [nombre]** — vuelve a abrir el último mapa utilizado donde lo dejaste (mismo lugar, mismo zoom, mismo nivel), también después de cerrar la app; reabrir un mapa desde la lista hace lo mismo. Si el seguimiento estaba en marcha, el mapa se centra en tu última posición conocida y el seguimiento queda detenido: reinícialo con ▶️.
- **📚 Mis mapas** — todos los mapas que ya has abierto (🌐 servidor o 💾 local), del más reciente al más antiguo; los mapas disponibles en el servidor aparecen ahí solos. Una pulsación vuelve a abrir el mapa.
- **📦 Añadir un mapa** — arrastra tu archivo ZIP a la zona (o púlsala para elegirlo) y luego **▶️ Cargar este mapa**. El mapa se suma a tu lista. Una **imagen** (`.jpg`, `.png`, `.webp`) soltada ahí abre el **Generador** con la imagen como fondo: solo falta darle un nombre al mapa.
- **🏗️ Generar un mapa** — crea un mapa desde cero.

> 🔄 **Volver a importar un mapa regenerado** — si tu ZIP tiene el **mismo nombre** que un mapa de tu lista (sean cuales sean el autor y la versión), la app te pregunta qué hacer en lugar de sobrescribirlo o apilar un duplicado:
> - **🔄 Actualizar** — sustituye la entrada existente. Tu sesión, tus notas y tus enlaces entre mapas se conservan; las fotos solo se sustituyen si el nuevo ZIP las contiene.
> - **➕ Conservar ambos** — las dos versiones conviven en la lista.
> - **Cancelar** (o ✕, Esc, pulsar fuera) — no se toca nada. Es la opción por defecto.

### 📡 Uso sin conexión

Una vez abierto con conexión, MyKTAMap funciona **totalmente sin conexión**: la app guarda en tu dispositivo todo lo que necesita.

**Para preparar una salida:**

1. Abre la app **antes de salir**, con conexión.
2. Carga tu mapa. Se memoriza en la app en la primera carga (ajuste **💾 Memorizar el mapa en la app en la primera carga** de ⚙️ Configuración, activo por defecto): lo volverás a abrir desde **📚 Mis mapas** sin seleccionar de nuevo el archivo.
3. Recorre el mapa unos segundos y después ya puedes cortar la red: la app sigue funcionando.

La **pastilla** junto al número de versión, abajo en la pantalla de inicio, te dice si la app está lista: **verde**, todo está guardado para usar sin conexión; **rojo**, faltan archivos — tócala con conexión para guardarlo todo (un **📥** rojo arriba en la pantalla de inicio también te lo recuerda). **Naranja**: guardado en curso, o sin red para terminarlo; **gris**: el estado no se puede comprobar (navegación privada, modo incógnito, primerísima carga).

Cuando existe una versión nueva y tienes conexión, la app te propone actualizarla.

---

## 🆘 En caso de emergencia bajo tierra

🧭 **Por dónde empezar, según tu situación:**

| Tu situación | La herramienta | Dónde encontrarla |
|---|---|---|
| Quiero **salir lo antes posible** | 🚨 Salida de emergencia | botón 🚨 de la barra superior |
| Sé dónde estoy, pero me entra el pánico: necesito **mi posición y mi rumbo en muy grande** | 🔆 Vista XL | menú 🧭 Tracker, botón rojo |
| **Ya no sé dónde estoy** | ⛑️ Estoy perdido | menú 🧭 Tracker, botón naranja |
| **Otra persona está perdida**, coordino equipos | 🚑 Modo Rescate | 🔭 Para ir más lejos › 🚑 Modo Rescate |

### 🎒 Los reflejos, antes que cualquier herramienta

- **Avisa siempre a alguien en superficie antes de bajar**, con tu hora estimada de regreso. Es la regla de oro.
- Lleva un **mapa en papel** (o el mapa impreso), una **brújula física** — la del teléfono la falsean el suelo y las armaduras metálicas —, un hilo de Ariadna si hace falta y una **linterna frontal con pilas de repuesto**, además de una linterna de reserva.
- Bajo tierra, no confíes nunca solo en tu teléfono: puede averiarse, quedarse sin batería, y su tracker puede desviarse.
- Si tienes cobertura (a menudo cerca de los pozos y las bocas de registro), avisa a alguien en superficie **antes** de que se agote tu batería.

### 🚨 Salida de emergencia — encontrar la salida más cercana

Para salir **ya**, sin pensar: herida, batería baja, fallo de luz. Pulsa **🚨** en la barra superior (a la derecha, junto a 📖 Modo Historia), o di «**sortie**» al comando de voz 🎤 (disponible solo en francés; el botón solo aparece si la app está en francés).

**Lo que busca la app**: los puntos marcados como salida abierta — **Acceso a cantera abierto** (`cao`), **Pozo de peldaños abierto** (`peo`), **Escalera de servicio abierta** (`eso`) — además de los etiquetados `entrée` y la etiqueta integrada «🚪 Punto de entrada del mapa». Las variantes **cerradas** (`caf`, `pef`, `esf`) se ignoran: un punto marcado como cerrado nunca se te propondrá. Si el mapa no tiene ninguna salida reconocida, un mensaje te recuerda estas etiquetas.

**Lo que se muestra**: la app calcula el **camino real** por las galerías, incluso de un nivel a otro por las uniones del mapa. La ventana **🚨 Salida de emergencia** muestra la más cercana, su distancia y su nivel (N0, N1…), un botón **🧭 Trazar la ruta** y un desplegable **▾ Ver las N otras salidas**, ordenadas por distancia.

- Una vez trazada la ruta, el **banner de guiado** te dice qué hacer en cada cruce; en la salida de emergencia no se puede cerrar, aunque el guiado esté desactivado. Si te desvías, su botón pasa a **Salida más cercana desde aquí** (ver «🪧 Guiado» en el itinerario).
- Una salida marcada **Distancia en línea recta — camino no verificado** (tarjeta con línea discontinua) no tiene camino calculado: se coloca bajo **No confirmadas**, y si ninguna salida tiene camino verificado, un banner rojo lo dice primero. Cuidado: puede ser inaccesible (muros, planta aislada).

**Desde dónde parte el cálculo**: desde tu posición actual, en cuanto el seguimiento está activo o te has situado una vez desde que abriste el mapa («📍 Estoy aquí», recolocación, portal, sesión restaurada); la ventana indica cuál. Si **nunca** te has situado, la app pregunta **¿Dónde estás?**: toca tu posición en el mapa. Ese toque también recoloca el seguimiento, para que la ruta y la visualización XL partan del mismo lugar.

Una vibración confirma la salida encontrada o te avisa si no hay ninguna, aunque **📳 Vibración háptica** esté desactivada. Todo se calcula en tu dispositivo, sin red.

### 🔆 Vista XL

Sabes dónde estás, pero te entra el pánico y necesitas lo esencial **en muy grande**: reorientarte, localizar un pozo cercano, comprobar tu rumbo, dictarle tu posición a alguien. En el menú **🧭 Tracker**, el botón rojo **🔆 Vista XL (posición + rumbo)** abre una pantalla completa que cabe sin desplazarse:

- 🗺️ **Un minimapa** que ocupa casi toda la pantalla, muy ampliado y centrado en ti, con los **colores de tu leyenda**, tu ruta, **los puntos del mapa y los tuyos** (del nivel mostrado) y la misma orientación que el mapa en modo «mapa orientado».
- 🖐️ **Puedes desplazarlo y hacer zoom con los dedos** para mirar más lejos. En cuanto lo mueves, deja de seguirte y vuelve a ponerse con el **Norte arriba**; el botón **🎯 Recentrar** lo devuelve a ti y reanuda el seguimiento y la orientación.
- 📍 **¿Reconoces un punto?** Tócalo: una burbuja muestra su nombre, su tipo y su nota. **📍 Estoy aquí** reajusta tu seguimiento sobre él, exactamente como la burbuja de un punto en el mapa — la forma de corregir una deriva sin salir de la pantalla. El mapa se recentra entonces en ti.
- 🧭 **Una brújula gigante** colocada sobre tu posición, que indica tu rumbo en tiempo real. La primera vez, el navegador pide acceso a los sensores de orientación: acepta, si no, se queda congelada.
- 🪧 **La próxima indicación del guiado en grande** («En 40 m, girar a la izquierda»), si hay una ruta trazada y el seguimiento está activo. Ante un desvío, **Ver las opciones en el mapa** te devuelve al banner.
- 🔋 **Una línea de estado** arriba a la derecha: tu batería (si **🔋 Nivel de batería** está activado en ⚙️ Configuración), el estado del tracker y de la brújula. El nombre del mapa está bajo el título.
- 📋 **Tus coordenadas GPS, si tu mapa está georreferenciado**: el icono 📋 al final de la línea de estado abre una burbuja que las muestra **en muy grande**, legibles a un metro — las que se dictan a los equipos de rescate —, con una línea que indica si es tu posición seguida, tu última posición conocida o la **posición de salida del mapa, nunca confirmada**. Su botón **📋 Copiar mi posición** copia solo las coordenadas (`48.856600, 2.352200`), listas para pegar en un SMS o una app de mapas. ⚠️ Si tu posición nunca se confirmó, la burbuja lo dice pero el mensaje no: díselo también a quien escribas. Mapa sin georreferenciar: sin icono, no se muestra ninguna coordenada.

La pantalla sigue el tema de la app, no se apaga mientras está abierta y también cabe en horizontal. Para salir: el botón grande **↩️ SALIR DE LA VISTA XL**, siempre abajo, o **Esc** en ordenador (si hay una burbuja abierta, Esc cierra primero la burbuja).

### ⛑️ Estoy perdido

Ya no sabes dónde estás. En el menú **🧭 Tracker**, el botón naranja **⛑️ Estoy perdido — Modo urgencia** estima la **zona donde puedes encontrarte**, a partir de tu última posición segura, el tiempo transcurrido y lo que ves a tu alrededor. Es una ayuda geométrica: no sustituye a los reflejos de arriba.

#### 📚 Primero, las buenas prácticas

El bloque desplegable **📚 Buenas prácticas**, arriba de la ventana, las recuerda:

- **🧘 Mantén la calma (primero)** — detente, respira. El pánico hace perder las referencias y malgasta luz y energía. Come o bebe un poco si tienes algo.
- **🗺️ Orientación** — **vuelve sobre tus pasos** en lugar de intentar llegar a tu destino. Busca los **ejes principales** (galerías de rodadura, galerías rectas, vías férreas) que llevan a referencias conocidas. Oriéntate con la brújula en cada cruce. **Escucha**: tráfico, metro, agua que corre indican una dirección.
- **🔦 Luz y recursos** — pon tu linterna en modo ahorro enseguida, guarda tu linterna de reserva, bebe un poco pero raciona.
- **📡 Comunicación** — en cuanto tengas cobertura, avisa a la superficie: **📋 Copiar el informe** prepara el mensaje.
- **📍 Si decides esperar** — instálate en un lugar **identificable** (pozo numerado, sala con nombre) y marca tu ubicación para que te encuentren. Quédate donde estás si **nadie sabe que estás ahí**.
- **⚠️ Lo que no hay que hacer** — no sigas el agua (las diaclasas llevan a pasos peligrosos), no intentes un paso desconocido porque «sube», no te fíes del tracker (se desvía, sobre todo bajo estrés).

Estos principios generales no sustituyen ni la formación ni el equipo.

#### 🎯 Estimar la zona

1. **📍 Última posición conocida** — donde estabas seguro de estar: busca un punto del mapa por su nombre, o **📍 Clic en el mapa**, o **🧭 Posición del tracker** si el seguimiento está activo.
2. **⏱️ Tiempo transcurrido** — de 1 a 90 minutos. Más allá, la zona se vuelve demasiado amplia: mejor dar la alerta.
3. **🏃 Velocidad de marcha supuesta** — el radio de la zona es velocidad × tiempo. Son las mismas velocidades que las del itinerario, y tu elección se guarda en este dispositivo.

| Opción | Velocidad | Radio para 10 min |
|---|---|---|
| 🤕 **Herido** — progresión dificultada | 2 km/h | ~333 m |
| 🐌 **Lenta** — estrechamientos, exploración | 3 km/h | ~500 m |
| 🚶 **Normal** *(por defecto)* | 5 km/h | ~833 m |
| 🏃 **Rápida** — recorrido conocido | 7 km/h | ~1167 m |

4. **🔮 Indicios visuales** (opcional pero muy útil) — lo que ves, separado por comas: *bidón de agua, boceto de ariete, pozo roto*. La app los busca en el nombre, la descripción y las etiquetas de todos los puntos del mapa.
5. Pulsa **🎯 Calcular la zona**.

**En el mapa**:

| Elemento | Significado |
|---|---|
| **Círculo naranja pulsante** | La zona de búsqueda |
| **📍 verde pulsante** | Tu última posición conocida |
| **🔮 violeta pulsante** | Un indicio encontrado **dentro de la zona** — lo más importante |
| **· gris** | Un indicio encontrado **fuera de la zona**, descartado |
| **Círculo violeta interior** | Tu posición más probable, en el centro de los indicios de la zona (si hay al menos uno) |

Si la zona supera el mapa, un banner naranja lo indica («podrías estar en cualquier sitio»): reduce el tiempo o añade indicios. Cambiar la velocidad recalcula la zona al instante.

**Ejemplo** — saliste del último pozo conocido hace 20 min y ves un boceto «Ariete» y un bidón: elige el pozo, 20 min, `ariete, bidón`. Si un punto «boceto Ariete» cae dentro de la zona, un círculo violeta lo señala.

**Después**:

- **📋 Copiar el informe** — un mensaje listo (mapa, posición, tiempo, indicios, posición probable, hora) para enviar por SMS o radio.
- **✅ Eliminar la zona y guardar mi posición supuesta** — retira la zona y coloca un punto ⚠️ en la posición probable, que puedes exportar como cualquier otro punto.
- **🗑️ Borrar la zona y cerrar** — lo retira todo, sin crear ningún punto.
- **👁️ Cerrar** (o ✕, o pulsar fuera) — cierra la ventana pero deja la zona en el mapa para explorar; al reabrir ⛑️ recuperas tus ajustes.

---

## 🗺️ Usar el mapa

### 🧭 Presentación de la interfaz

**Arriba**, una barra fija:

- la **rosa de los vientos** a la izquierda vuelve a la pantalla de inicio;
- el **nombre del mapa** abre **🗂 Cambiar de mapa** (ver más abajo);
- los **contadores** 📍 puntos · 🛣️ trazados · ⬛ zonas · 🏛️ estructuras · 📸 fotos abren **📊 Detalles de la sesión**;
- a la derecha: **📖** Modo Historia, **🌍** Vista OSM (mapa georreferenciado), **🚨** Salida de emergencia, **🔋** batería.

**Abajo**, una barra de estado reúne lo que está en curso: 📐 medición, 📏 distancia total de los trazados, 🗺️ itinerario (distancia, tiempo, ritmo — tócalo para abrir el itinerario) y el indicador **🧭 tracker** (ON · pasos · distancia durante el seguimiento; tócalo para abrir el menú del Tracker). Pasa a una segunda línea si no cabe todo; el botón ▾▴ la reduce.

**A los lados**, las dos barras laterales contienen las herramientas. La interfaz está organizada en **13 grupos** repartidos en las **dos barras laterales** — izquierda: ⭐ Favoritos, 📚 Ayuda, ⚙️ Ajustes, ⬇️ Cargar, ⬆️ Guardar, ⏪ Historial; derecha: 🔍 Búsqueda, 🧭 Rastreador, 📐 Medición, ✏️ Edición, 🛣️ Trazados, ⬛ Zonas, 🏛️ Estructuras:

| Grupo | Icono | Para qué sirve |
|---|---|---|
| **Favoritos** | ⭐ | Tus puntos marcados como favoritos, a un clic |
| **Ayuda / Documentación / Leyenda** | 📚 | Ayuda, documentación, leyenda de iconos |
| **Ajustes** | ⚙️ | Ajustes del mapa: escala, Norte, georreferenciación, tracker, visualización… *(clic directo)* |
| **Búsqueda** | 🔍 | Encontrar un punto, un trazado, una zona o una estructura *(clic directo)* |
| **Cargar / Importar** | ⬇️ | Importar una sesión o un GPX (abre directamente el selector de archivos) |
| **Exportar** | ⬆️ | Un lanzador: imagen (PNG / JPEG, PDF, GeoTIFF), sesión, actualización del mapa, exportación externa (KMZ / GPX / GeoJSON) |
| **Historial** | ⏪ | Deshacer (`Ctrl+Z`) / Rehacer (`Ctrl+Y`) |
| **Rastreador** | 🧭 | **Menú a pantalla completa** de fichas: seguimiento, recolocación, Mi posición, brújula, itinerario, guiado, emergencias |
| **Medición** | 📐 | Medir una distancia o una superficie, borrar |
| **Edición de puntos** | ✏️ | Añadir tus propios puntos *(clic directo: interruptor ON/OFF)* |
| **Trazados** | 🛣️ | Trazar galerías principales, secundarias, caminos, uniones, **calcular la distancia total** |
| **Zonas** | ⬛ | Trazar zonas de escombros, derrumbe, agua o inaccesibles |
| **Estructuras** | 🏛️ | Pilares, muros y frentes de explotación |

**Cómo funciona:**

- **Un solo grupo abierto a la vez**; tocar fuera lo cierra.
- **Mientras un modo está activo** (medición, añadir puntos, trazado, zona, recolocación), el grupo sigue abierto y su icono muestra el modo en curso. Solo puede haber un modo activo a la vez.
- **Abrir una ventana por encima** (Ajustes, Filtros, Documentación…) desactiva el modo en curso. El tracker, en cambio, sigue funcionando, y la ficha de un punto que acabas de colocar no interrumpe la edición.
- Los paneles Trazados, Zonas y Estructuras se abren en el centro de la pantalla.
- El botón **≡** en lo alto de cada barra la pliega sin detener los modos activos; en horizontal en el móvil, la barra se desplaza si sobresale.

#### 📊 Detalles de la sesión

Un clic en los contadores de arriba abre el **panel de control** del mapa:

- en cabecera, **✅ Guardado hace N s** (en rojo si el guardado falla);
- los totales (y el reparto por nivel en un mapa multinivel), y luego todos tus puntos, trazados, zonas, estructuras y fotos;
- las otras medidas: 📐 medición, 🗺️ itinerario y sus etapas, 🧭 seguimiento;
- **📔 Salida en curso**: 🏁 Cerrar, 🧭 Afinar la traza, abrir el cuaderno. Si no hay ninguna salida en curso, el botón **📔 Iniciar una salida** abre una en este mapa — incluso cuando «Llevar un cuaderno de mis salidas» está desmarcado en ⚙️ Configuración (entonces es la única forma de registrar una). Una sola salida a la vez;
- **⭐ Favoritos**: exportar los de este mapa o todos, importar;
- **📦 Backups recientes** de este mapa: ↻ Restaurar, 📆 Snapshot ahora, 🗑️ Vaciar todo — cada eliminación pide confirmación. Las copias de **otra versión de este mapa** (reimportada o renombrada) también aparecen, marcadas con 📂, y se restauran en el mapa abierto;
- **💾 Memoria de sesiones**: tus sesiones viven en el espacio que el navegador concede a la app en tu dispositivo — una parte de su espacio libre, compartida con tus mapas, tus fotos y tus copias de seguridad (ya sin el límite de 5 MB desde el 10/10/2026; tus sesiones existentes se trasladaron ahí automáticamente). El indicador muestra su llenado y los mapas cuya sesión más pesa; al 80 %, la app te avisa al abrir un mapa. Para liberar espacio: exporta tu sesión (💾 Guardar sesión) y luego borra la sesión o las fotos de un mapa antiguo, o quita un mapa que ya no uses. Si el navegador rechaza este almacenamiento (algunas navegaciones privadas), tus sesiones se quedan en el almacenamiento antiguo limitado a ~5 MB, y el indicador lo muestra;
- **🗑️ Borrar la sesión**: el mismo borrado que la ventana «Sesión anterior restaurada» (ver 🧹 Borrar y corregir), en cualquier momento. En un mapa ☁️ de solo lectura, el botón dice «Nada que borrar: este mapa viene del servidor»;
- el botón **📊 Estadísticas globales** (informe copiable, CSV, PDF).

### 🗺️ Leer el mapa

- **Pellizca** para hacer zoom, **arrastra** para moverte (o usa los botones **+** / **−** arriba a la izquierda).
- **Tocar un icono** abre la ficha del punto; **tocarlo dos veces** hace zoom sobre él (como el botón «Ir» de la ficha).
- Los iconos se reducen al alejar el zoom para mantenerse a la escala del mapa, en el plano y también en los mapas OSM (Vista OSM y mapa de la pantalla de inicio). Para conservar un tamaño fijo: ⚙️ Configuración de la pantalla de inicio → 🎨 Visualización → «📐 Adaptar el tamaño de los iconos al zoom».

#### 🌐 Coordenadas GPS en las fichas

Si tu mapa está **georreferenciado**, la ficha de cada punto (los tuyos y los del mapa) muestra sus coordenadas, por ejemplo `🌐 48.85660° N, 2.35220° E`, con una precisión de 1 m aproximadamente. El botón **📋** las copia en formato `lat, lng`, listas para pegar en una aplicación de mapas o en un SMS — práctico para transmitir la ubicación de un pozo que acabas de añadir. Los trazados, zonas y estructuras no tienen una coordenada única, así que no tienen línea GPS. Mapa no georreferenciado: sin línea.

#### 🔄 Cambiar de mapa

El **nombre del mapa**, arriba, abre **🗂 Cambiar de mapa**: el mapa en curso, los mapas recientes y **📚 Ver todos mis mapas** para volver a la pantalla de inicio. Al cambiar, tu sesión se **guarda automáticamente**. Para cerrar sin hacer nada: ✕, clic fuera o **Esc**.

### ≡ Filtros

El botón **≡** arriba a la derecha del mapa abre **≡ Filtros de visualización**. Cada casilla actúa en el mapa al instante:

| Sección | Qué filtra |
|---|---|
| 🖼️ **Capas de imagen** | La imagen del mapa y sus capas adicionales |
| 📊 **Capas de datos** | Las capas incluidas con el mapa, y **Mis anotaciones** (todo lo que has añadido: desmarcarla oculta tus añadidos sin borrar nada) |
| 🏗️ **Niveles M-LVL** | Mapas multinivel: nivel activo (para dibujar) y niveles visibles — sincronizado con la ventana Niveles |
| 🏷️ **Tags de los puntos** | Los tags realmente presentes en el mapa, con su recuento |
| 🛣️ ⬛ 🏛️ **Tipos** | Tipos de trazados, de zonas y de estructuras, incluidos los tuyos |

- Cada sección se pliega y tiene sus botones **👁️ Todo** / **🚫 Ninguno**.
- **🔄 Mostrar todo** devuelve tags y tipos a «todo visible», sin tocar los niveles ni las capas.
- Abajo, **Filtros activos: …** recuerda lo que está filtrado; el botón ≡ también indica cuándo hay elementos ocultos.
- Los filtros se **recuerdan por mapa**: los recuperas al volver a ese mapa, y un mensaje te lo indica.
- Lo que estás dibujando sigue visible, aunque desmarques su tipo.

*Ejemplo: para ver solo dos clases de pozos, 🏷️ Tags de los puntos → 🚫 Ninguno, y vuelve a marcar los dos tags que quieras.*

> 🔄 **Corregir una capa de datos** — una capa incluida con el mapa se puede ocultar pero no editar. El botón **🔄 Modificar** de su fila la copia en tu sesión, donde se aplican todas tus herramientas (por ejemplo 🔄 Convertir este objeto); la original se oculta («en modificación — mostrar de todos modos» permite comparar). Antes de actuar, la app te indica cuánto espacio ocupará la copia y cuánto ocupan ya tus sesiones. **↩️ Restaurar** descarta tus cambios; **💾 Exportar** genera el archivo corregido de **esa capa sola**, para devolverlo al mapa mediante 🏗️ Generador → «Modificar un mapa», botón «Elegir» en la fila de la capa: sustituye el contenido anterior. Lo que has dibujado tú no forma parte de él (la app te dice cuántos objetos quedan fuera del archivo), salvo si lo vinculas: **➕ Integrar añadidos**, en la fila de la capa, lista tus dibujos del mapa por familia (nada marcado de antemano, «Marcar todo», filtro «Creado por» en una instalación conectada); los objetos elegidos salen entonces en el archivo de la capa, y ⏪ lo deshace. Un objeto integrado pertenece a la capa: restaurarla también lo retira, y la ventana de restauración dice cuántos. Borrar la sesión restaura las capas abiertas para modificar; reimportar tu sesión en este mapa las vuelve a poner en modificación. En una instalación conectada, «Borrar la sesión» te deja elegir: **borrar solo en este dispositivo** (las capas abiertas para modificar por el equipo vuelven desde el servidor, todavía en modificación) o **devolver también las capas al equipo** (vuelven a su original para todos, y los retoques que los demás no hayan exportado en esas copias se pierden). En una instalación conectada, una capa abierta para modificar por otra cuenta aparece también así en tu lado, y restaurarla la restaura en todos los dispositivos (una copia modificada después se queda, marcada como duplicado).
>
> 🔄 **Actualizar el mapa** — para pasar tu trabajo al mapa mismo: **⬆️ Exportar → 🔄 Actualizar el mapa**, o el botón al principio de las capas en **≡ Filtros**. **1.** Las capas en modificación están marcadas: cada una reemplaza su archivo. **2.** Tus objetos dibujados a mano se agrupan por etiqueta (los puntos, según su primera etiqueta) o por tipo (trazados, zonas, estructuras); para cada grupo, elige una capa del mapa, una **capa nueva** (le das un nombre) o «Dejar en la sesión». **3.** El Generador se abre en modo Modificar, ya rellenado con el ZIP actual del mapa, esas capas y tus fotos: revisa y genera (si el ZIP del mapa no está en el dispositivo, te pide que lo sueltes). Con el **teselado V2**, la app te avisa y **cierra el mapa durante la generación** para liberar memoria (tu sesión queda guardada): **🔄 Reemplazar** o **☁️ Publicar** lo vuelven a abrir en su nueva versión; si no, lo recuperas en la pantalla de inicio (**Reanudar**). **4.** Mapa importado: **⬇️ Descargar** o **🔄 Reemplazar el mapa en la app** (mismo mapa: tu sesión, tu calibración y tus fotos siguen vinculadas). Mapa de una instalación conectada: **☁️ Publicar la nueva versión** si tu derecho lo permite; si no, descargas el ZIP para quien gestiona el mapa. Mapa del sitio: descarga, para transmitir a su administrador. Tras un reemplazo o una publicación, la app propone **devolver las capas** (a todo el equipo en una instalación conectada) y **quitar de tu sesión los objetos pasados al mapa**; si no, aparecen duplicados. Un objeto modificado después de generar se queda en tu sesión, y la app lo indica. La misma regla vale si reabres a mano en el Generador (modo Modificar) el ZIP de un mapa de una instalación conectada, por ejemplo el de su ficha ℹ️: la app lo reconoce y propone **☁️ Publicar la nueva versión** de ese mapa (o te explica quién publica); **Publicar como mapa nuevo** crea una copia aparte, solo si lo eliges. ZIP retocado o nombre compartido por varios mapas: la app pregunta **¿Qué mapa actualizar?** entre los mapas que gestionas (o «Ninguno: publicar como mapa nuevo»); si varios mapas llevan ese nombre, ninguno queda preseleccionado: elige el correcto (carpeta, versión y fecha de apertura los distinguen).

### 🗺️ Leyenda

**📚 Ayuda / Documentación / Leyenda → Leyenda** muestra todos los iconos que la app reconoce (incluso los que tu mapa no usa), así como los trazados y las zonas, ordenados por categoría.

#### 🎨 Personalizar la leyenda

En la Leyenda, **✏️ Modificar**. Para cada tipo de trazado, zona o estructura:

- **Renombrar**: tu nombre («Principal» → «Gran galería») se muestra en todas partes — leyenda, fichas, estadísticas, filtros.
- **🎨 Color**: un cuadrado por línea; dos para las zonas, pilares y muros (relleno y borde). El color se aplica al instante en todas partes: mapa, exportaciones de imagen, PDF y KMZ, estadísticas, Vista OSM. **↺** restablece los colores originales. Si no eliges borde, una zona toma una versión más oscura de su relleno; una zona *Inaccesible* recoloreada pierde su trama.
- **👁️ Ocultar** retira la entrada solo del recuadro de la leyenda. Para ocultar objetos en el mapa, usa **≡ Filtros**.
- **➕ Añadir una entrada** crea tu propio tipo (trazado, zona, estructura, icono) con su color, dibujable al momento. Atajo: la línea **Nuevo tipo…** de los menús Trazados, Zonas y Estructuras, que selecciona el tipo creado.
- **🗑️ Eliminar** uno de tus tipos: si aún hay objetos que lo usan, la app te dice cuántos antes de confirmar.

Todo se guarda **por mapa** y viaja con tus exportaciones (sesión, capa de datos, ZIP Avanzado). Si hay objetos que usan un tipo ausente de la leyenda, un aviso en cabecera de la Leyenda los cuenta: se muestran con un color de reserva hasta que vuelvas a crear o reimportar la entrada.

---

## 🔍 Búsqueda unificada

El botón **🔍** de la barra lateral, o **Ctrl+K** (`Cmd+K` en Mac), abre **🔍 Búsqueda unificada**. Ctrl+K de nuevo la cierra.

### ⚙️ Cómo funciona

1. Escribe tu búsqueda: los resultados aparecen a medida que escribes, **agrupados por categoría** — 📍 Puntos · 🛣️ Trazados · ⬛ Zonas · 🏛️ Estructuras.
2. Elige con **↑** / **↓** y luego **Intro**, o toca un resultado.
3. El mapa se centra en él: un círculo alrededor de un punto, un resaltado de unos segundos para un trazado, una zona o una estructura, y se abre su ficha.

**Qué se busca**: en un punto, su nombre, su identificador, sus tags, su descripción y su estado; en un trazado, una zona o una estructura, su nombre, su tipo y su nivel. La búsqueda cubre tus añadidos **y** las capas incluidas con el mapa. Ignora los acentos y las mayúsculas («aeration» encuentra «Aération»).

**Filtros bajo el campo** (se reinician cada vez que la abres):

- **Categoría** — Puntos, Trazados, Zonas, Estructuras, con su recuento;
- **Capas** y **Tags** — solo para los puntos.

Varias opciones en una misma línea se suman (una **u** otra); de una línea a otra, se combinan (una **y** otra). **✕ Borrar los filtros** los retira.

### 🌐 Pegar coordenadas GPS

En un mapa **georreferenciado**, pega coordenadas en el formato `48.856600, 2.352200` (copiadas de una aplicación de mapas):

- hay un punto muy cerca → **🎯 Ir al punto**;
- si no → **➕ Crear un punto aquí**, que abre la ficha de un nuevo punto en ese lugar.

Si la posición cae fuera del mapa, o si el mapa no está georreferenciado, un mensaje lo indica (con un atajo a ⚙️ Ajustes → 🌐 Georreferenciación).

### 🔎 Búsqueda multiplano

Para buscar un punto en **todos tus mapas** sin abrirlos:

- **desde la pantalla de inicio**: la barra de búsqueda 🔎 en lo alto de la pantalla. Los resultados (mapas y puntos) aparecen a partir de 2 caracteres; **Intro** o 🔎 abre la búsqueda completa;
- **desde el mapa**: en la búsqueda, el botón **Buscar en todos los mapas**, que conserva lo que has escrito.

La app lee los puntos de cada mapa in situ, mostrando su progreso. Cada resultado lleva el **nombre de su mapa**. Un clic abre el mapa correcto, en el nivel correcto, centrado en el punto (tras confirmar si ya hay un mapa abierto); el botón **↩️ Volver** te lleva de vuelta a donde estabas.

---

## 📍 Rastreador de posición

El tracker estima tu posición **sin GPS**, con los sensores de movimiento del teléfono (pasos y dirección). Todos sus botones están en el grupo **🧭 Tracker**.

### 🧭 Menú del Tracker

El botón **🧭 Tracker** (o el indicador 🧭 de la barra de abajo) abre una **ventana a pantalla completa de fichas grandes**, en tres secciones. Cada ficha cierra la ventana al actuar.

| Sección | Fichas |
|---|---|
| **Seguimiento** | ▶️ / ⏹️ Iniciar / detener · 📍 Modo recolocación · 🎯 Mi posición (vuelve a centrar el mapa en ti) · 🔓 Suspender el bloqueo en trazado |
| **Herramientas** | 🧭 Brújula · 🗺️ Calcular una ruta · 🪧 Guiado del itinerario · 🗺️ Mapa orientado |
| **Emergencia** (fondo rojo) | ⛑️ Estoy perdido · 🔆 Vista XL · 🚑 Modo Rescate — ver 🆘 En caso de emergencia bajo tierra |

Navegación inteligente (bloqueo en trazado), mapa orientado, itinerario a través de varios mapas, replay y mapa de calor son opciones desactivadas por defecto → 🔭 Para ir más lejos.

### ▶️ Iniciar el seguimiento

1. Toca **▶️**. La primera vez tras cada recarga de la app, una ventana recuerda que el tracker es **experimental** (deriva) y propone **🔆 Mantener la pantalla encendida**, marcada de entrada: una pantalla que se apaga son pasos perdidos. Confirma con **Entendido — Iniciar**.
2. En el teléfono, acepta el acceso a los sensores de movimiento.
3. Tu icono (un cono azul) aparece en el punto de partida y apunta en tu dirección de marcha (hacia el Norte cuando el seguimiento está detenido); un trazado registra tu camino.
4. **⏹️** detiene el seguimiento.

> ⚠️ La deriva se acumula: **recolócate aproximadamente cada 50 m** sobre una referencia del mapa. Las armaduras metálicas falsean la brújula del teléfono — lleva una brújula de verdad.

### 📍 Recolocar tu posición

En cuanto reconozcas una referencia:

1. Toca **📍** (el botón se ilumina);
2. toca el lugar del mapa donde te encuentras.

El icono se coloca allí, el trazado vuelve a empezar desde ese punto y el modo se cierra solo. Otra forma: el botón **📍 Estoy aquí** en la ficha de un punto.

### 🧭 Brújula

La ficha **🧭** muestra una rosa de los vientos arriba a la izquierda del mapa, incluso con el tracker parado. Su **N** apunta siempre al Norte, sea cual sea la orientación del teléfono. Tócala para agrandarla (rumbo en grande y ángulo exacto); ✕ la cierra.

**Para comprobar los sensores**, sujeta el teléfono en plano, con la parte superior en tu dirección de marcha:

| Caminas hacia… | La N de la rosa está… |
|---|---|
| el Norte | arriba |
| el Este | a la izquierda |
| el Sur | abajo |
| el Oeste | a la derecha |

Si no coincide, el campo magnético está perturbado (chatarra, armaduras): recolócate en cuanto puedas y desconfía del trazado.

### ⚙️ Ajustes del tracker

En **⚙️ Ajustes → 📍 Navegación y tracker**:

- **🧭 Posición inicial del tracker** (propia de este mapa): introduce X / Y, o usa **🔍 Elegir mediante un punto** (búsqueda por nombre, identificador o tag) o **📍 Hacer clic en el mapa**. No olvides guardar.
- **👣 Detección de pasos** — **Tamaño de un paso (m)** (unos 0,7 m), **Umbral de detección** (sensibilidad), **Cooldown (ms)** (intervalo mínimo entre dos pasos). Estos ajustes valen para **todos tus mapas** en este dispositivo y viajan con tu perfil.

Todo depende de la **escala** del mapa (⚙️ Ajustes → 📐 Mapa: escala y geolocalización, botón 🎯 para calcularla a partir de una medición real): compruébala primero.

---

## 🗺️ Calcular un itinerario

La ficha **🗺️ Calcular una ruta** del menú del Tracker calcula el **camino más corto** entre varios puntos, siguiendo los trazados del mapa (los tuyos y los incluidos con el mapa).

1. Añade tus **📍 Puntos de paso**, en orden:
   - **📍 Modo clic mapa**: la ventana se reduce, toca el mapa para colocar cada punto y luego **✓ Terminar**;
   - **🔍 búsqueda** de un punto existente (nombre, identificador, tag);
   - **🧭 Mi posición**: tu posición actual del tracker.
   La ✕ de una línea retira el punto.
2. **🎯 Calcular la ruta**: el trayecto aparece en cian, con su distancia y su tiempo estimado.
3. **💾 Guardar como ruta** lo conserva en tu sesión; **❌ Borrar** lo retira.

Mientras haya un itinerario activo, la barra de abajo muestra **🗺️ distancia · tiempo · ritmo**; tócala para volver a abrir la ventana.

**🏃 Velocidad de marcha estimada** (recordada en este dispositivo):

| Ritmo | Velocidad | Cuándo |
|---|---|---|
| 🤕 **Herido** | 2 km/h | Avance dificultado, terreno accidentado |
| 🐌 **Lenta** | 3 km/h | Prudencia, gateras, exploración |
| 🚶 **Normal** | 5 km/h | Ritmo estándar (por defecto) |
| 🏃 **Rápida** | 7 km/h | Ritmo sostenido, recorrido conocido |

**🛑 Pausa entre las paradas** (casilla) añade un tiempo de pausa en cada etapa intermedia al tiempo estimado.

**¿Itinerario ya trazado?** La ventana se abre en navegación: **⏮️ Inicio**, **⏭️ Fin**, **🔁 Recorrido completo**, 🎯 en cada etapa para verla, **🔄 Recalcular la ruta** para retocar las etapas, **❌ Borrar la ruta**.

**Salida o etapa fuera de las galerías**: el tramo hasta la galería más cercana se dibuja **en punteado** y se cuenta en la distancia (ida y vuelta para una etapa). Más allá de **50 m**, la app te avisa: no es una galería conocida, comprueba la posición. En un mapa **sin ningún trazado** no se puede calcular un itinerario.

### 🔄 Itinerario vivo

El itinerario sigue tus recolocaciones:

- **Te recolocas sobre el trayecto** (botón **📍 Estoy aquí** de un punto a menos de 8 m del trayecto, o llegada por un portal): la parte ya recorrida se retira, las etapas superadas se validan y la distancia restante se actualiza. No se recalcula nada: es instantáneo.
- **Te recolocas en otro sitio**: la app te propone **Recalcular** desde tu nueva posición (las etapas restantes conservan tu orden y tus evitaciones), **Conservar el itinerario** tal cual, o **🗑️ Borrar el itinerario**.
- **📍 Estoy aquí sobre una etapa** la **valida** (✓ verde en el mapa, línea tachada en la ventana), en el orden que quieras. Una recolocación con clic en el mapa nunca valida una etapa.
- **Todas las etapas validadas**: «🎉 Itinerario terminado», el trayecto desaparece (tu trazado de seguimiento se queda).

Las etapas validadas se conservan con tu sesión, aunque el teléfono se bloquee o la app se recargue.

*En la práctica: planifica yo → curiosidad X → curiosidad Y → salida, camina y toca 📍 Estoy aquí en cada punto alcanzado.*

### 🪧 Guiado

En cuanto hay un **itinerario trazado** y tu posición es conocida — tracker en marcha, o simplemente un **📍 Estoy aquí** sobre un punto — un **aviso** en lo alto del mapa te dice qué hacer:

- **«En 40 m, girar a la izquierda»**, **«Seguir durante 120 m»** y luego **«Ahora: girar a la izquierda»**; debajo, la siguiente indicación («Luego girar a la derecha»).
- Solo habla **en los cruces**, siempre con una distancia (nunca «la 3.ª a la izquierda»). Dos galerías cercanas: «tomar el ramal de la izquierda / de la derecha». Unión de nivel: «subir / bajar al nivel N».
- Varios cruces muy próximos cuentan como **una sola encrucijada**, con una sola indicación. A partir de 4 galerías, un **pequeño esquema** muestra la que hay que tomar (en dorado); si hay un punto con nombre allí, su nombre abre la indicación.
- **Fuera del trazado al salir**: «Llegar al trazado: ~12 m», con una flecha hacia la galería más cercana.
- Las distancias son **aproximadas** («~40 m», redondeadas a 10 m): la posición procede del podómetro y deriva.

**¿Te desvías o das media vuelta?** El aviso se vuelve naranja («¿Fuera del itinerario?» / «¿Media vuelta?») y propone **Estoy aquí** (toca el lugar donde estás), **Recalcular desde aquí** o **Ignorar**. No se recalcula nada sin ti.

**Tocar el aviso** abre la **🪧 Hoja de ruta**: todas las indicaciones y sus distancias (toca una línea para ver el lugar). También se abre desde la ventana del itinerario, sin tracker, para preparar una salida.

**La ✕ del aviso desactiva el guiado**; la ficha **🪧 Guiado del itinerario** del menú del Tracker lo vuelve a activar, sin recalcular.

> 🚨 En **salida de emergencia**, el aviso no tiene ✕ y se muestra aunque el guiado esté desactivado; si te desvías, propone **Salida más cercana desde aquí**. La visualización XL repite la indicación en grande.

### 🚫 Preferencias de evitación

La sección plegable **🚫 Preferencias de evitación (opcional)** de la ventana del itinerario fija lo que el itinerario debe **rodear si es posible**:

- **📍 Puntos a evitar**: por búsqueda, por identificador exacto, o **📍 Hacer clic en el mapa**;
- **🏷️ Tags a evitar**: toca un tag para evitar todos los puntos que lo llevan;
- **⬛ Zonas a evitar**: marca un tipo de zona (Agua, Derrumbe, tus tipos…);
- **📏 Margen**: la distancia que se mantiene alrededor de los puntos evitados.

Si no existe ningún otro camino, el itinerario pasa igualmente y lo indica: **⚠️ Imposible evitar: …**. Tus preferencias se recuerdan por mapa; **🗑️ Restablecer todas las evitaciones** las borra.

Las **zonas inaccesibles ⛔**, en cambio, **nunca se atraviesan**, salvo si desmarcas **Respetar las zonas inaccesibles** (útil en un levantamiento incompleto). Estoy perdido y el Modo Rescate las respetan siempre.

---

## 🌀 Enlaces entre mapas

Un enlace une **un punto de un mapa con un punto de otro mapa** — un «portal» entre dos redes que se tocan, o entre un mapa general y un mapa de detalle.

**Crear un enlace**: en la ficha de un punto, **🌀 Enlazar con otro mapa** → elige el mapa de destino → busca el punto de llegada (nombre, identificador o tag; no hace falta abrir el otro mapa). El enlace aparece en la ficha de **los dos** puntos. Un punto puede tener varios.

**En el mapa**, un punto enlazado conserva su icono. Para distinguirlo, ponle el tag **Portal** (icono de vórtice).

**Usar un enlace**: en la ficha, línea 🌀 → **➜** → confirmación. La app guarda tu sesión, abre el otro mapa, pasa al nivel correcto y te deja sobre el punto de llegada. Tu **tracker se recoloca allí** (has cruzado físicamente), y un itinerario activo en ese mapa vuelve a partir del portal. Un botón **↩️ Volver: <mapa>** te lleva de vuelta a la vista de la que venías, durante 15 segundos; los regresos se apilan. En ese botón, **–** lo reduce a una pastilla (elección recordada) y **✕** lo cierra olvidando los regresos.

**🌀 Mis enlaces** (en la pantalla de inicio) enumera todos tus enlaces: ➜ para ir a un extremo, 🗑️ para eliminar, ⛔ si falta un mapa en el dispositivo. Dos vistas:

- **Lista** — con, cuando los dos mapas están georreferenciados, el **Desfase de calibración**: la distancia entre los dos extremos, que señalan el mismo lugar real. No es una distancia que recorrer: cuanto menor sea, mejor es tu georreferenciación. Un desfase absurdo casi siempre viene de la georreferenciación de uno de los dos mapas. La Vista OSM clasifica estos desfases del peor al mejor.
- **Grafo** — tu biblioteca en forma de red: una burbuja por mapa, un trazo por frontera (más grueso cuantos más enlaces). Toca una burbuja para abrir el mapa, un trazo para ver sus enlaces; mueve las burbujas con el dedo.

### 🧭 Itinerario hacia otro mapa

Desde la ventana del itinerario (**Destino en otro mapa**) o un resultado de la búsqueda multiplano (botón 🧭): la app elige el portal más corto, muestra el trayecto por etapas y lo traza en tu mapa. Tus puntos de paso se recorren primero, en orden; se respetan las evitaciones de cada mapa. Si es imposible, un mensaje explica por qué.

Por defecto, el trayecto solo cruza una frontera (tu mapa y el mapa de llegada). Para pasar por mapas intermedios (A → B → C), marca **🌀 Itinerario a través de varios mapas (mapas conectados)** en la búsqueda multiplano, con un mapa abierto; esta elección se recuerda.

**¡En marcha!** no te teletransporta: caminas (validación de etapas y recálculo como de costumbre) y luego cruzas en el portal con el botón flotante **🌀 Portal siguiente** o con el ➜ del punto-portal. La continuación se traza al otro lado. Si abres el mapa siguiente de otra forma, o si sustituyes el itinerario, la continuación se abandona. La 🪧 Hoja de ruta resume los mapas siguientes («Luego 🌀 portal → mapa: 350 m, 4 cruces»).

**Bueno saberlo**: renombrar o mover un punto enlazado actualiza sus enlaces; eliminar un punto elimina sus enlaces; los enlaces viajan con la exportación de sesión; los incluidos con un mapa se pueden usar pero no modificar.

---

## 🌍 Vista OSM

La Vista OSM coloca tus mapas **georreferenciados** sobre el mapa de OpenStreetMap, con sus puntos, trazados, zonas y estructuras, en tus colores de leyenda. Está **activa por defecto**: el fondo de mapa procede de OpenStreetMap, que por tanto ve las zonas que miras; ningún dato de tus mapas sale del dispositivo. Para desactivarla: ⚙️ Configuración.

- **En la pantalla de inicio**, el widget **🌍 Vista OSM**; su botón **⛶** abre el modo OSM a pantalla completa.
- **En un mapa**, el botón **🌍** de la barra de arriba (mapas georreferenciados). Desde un mapa, la Vista OSM solo se abre si el mapa se ha **convertido a V2 en teselas** (ver «🧱 Convertir a teselas V2»); si no, un mensaje explica cómo convertirlo.
- Un mapa solo aparece una vez que se ha **abierto al menos una vez**: es al abrirlo cuando la app lee su georreferenciación.
- **Sin conexión**: **💾 Guardar sin conexión** descarga con antelación las teselas de la zona visible.
- Al acercar el zoom sobre un mapa se muestran imágenes más detalladas, leídas del archivo del mapa que ya está en tu dispositivo. Las capas incluidas ocultas se muestran y se filtran como las demás.

**Búsqueda**: la barra de la línea de título busca un mapa o un punto entre tus mapas georreferenciados; el mapa vuela hasta él. Lee tus mapas, sin consultar nada en Internet.

**📏 Medir**: en modo OSM, la herramienta de medición da una distancia y una superficie; no dependen de ninguna calibración del mapa.

**🎯 Coordenadas de superficie**: un clic en el mapa da la latitud y la longitud del punto situado justo encima, con un botón Copiar — es lo que se transmite a un equipo que llega por la superficie. Su exactitud depende de la calibración del mapa.

**🗺️ Leyenda**: en un mapa, el botón **🗺️ Leyenda** de la Vista OSM; en la pantalla de inicio, el botón **🗺️** del encabezado. Es la leyenda del mapa, con tus nombres, tus colores y tus tipos propios, en **solo lectura**: se modifica desde el mapa (🗺️ Leyenda → ✏️ Modificar). En la pantalla de inicio, es la leyenda del mapa que acabas de dejar; si no, la del mapa mostrado que abriste más recientemente. Si se muestran varios mapas, un mensaje te recuerda que los demás tienen la suya.

**🗂️ Varios mapas a la vez**: el botón **≡** del encabezado abre una ventana con los ajustes de visualización, el filtro por tag y la pila de mapas mostrados:

- ➕ añadir un mapa — el menú los agrupa por **carpeta** de «Mis mapas», y «📁 Añadir toda la carpeta» los muestra de una vez —, ▲▼ ponerlo encima o debajo, un control de **opacidad** por mapa, ✕ retirarlo; ◉ marca el mapa principal;
- en cada línea, 5 minibotones ocultan la imagen, los puntos, los trazados, las zonas o las estructuras de ese mapa;
- **por etiqueta**: las etiquetas compartidas por al menos dos de tus mapas georreferenciados aparecen como fichas; un clic muestra todos sus mapas, un segundo clic los retira. Más allá de 3 mapas, la app pide confirmación y los carga uno a uno (más lento en el móvil).

---

## 📖 Modo Historia

El botón **📖** de la barra de arriba (a la derecha, junto a 🚨) abre tu **cuaderno de exploración**, propio de cada mapa, en dos pestañas.

### 📝 Nota libre

Una nota por mapa, **guardada mientras escribes**. Se muestra con formato; **✏️ Editar** abre el texto, con una barra de herramientas (negrita, cursiva, títulos, lista, enlace, código, cita), y **👁 Vista previa** vuelve a la presentación. La nota admite Markdown (`**negrita**`, `# Título`, `- elemento`).

### 📚 Documentos PDF

Hasta **10 documentos PDF por mapa**: informe, mapa en papel escaneado, artículo, levantamiento topográfico…

- **📥 Importar un PDF** añade uno; **🗑️ Quitar** elimina el que se muestra. La lista aparece en cuanto hay varios.
- Los documentos incluidos con el mapa (📕) van al principio de la lista. Se copian en tu dispositivo la primera vez que lo abres; si los quitas, vuelven la próxima vez que se abra el mapa.
- Aviso a partir de **25 MB** acumulados, rechazo a partir de **100 MB**.
- En iPhone, **↗️ Abrir en una pestaña** muestra el documento a pantalla completa.
- Tus documentos también se consultan desde **📔 Mi cuaderno → 📖 Relatos**, sin cargar el mapa.

**Exportación**: la nota y los documentos se van con la exportación de sesión y se **añaden** al mapa al reimportarla (no se sobrescribe nada). La exportación **anonimizada** los deja fuera. Todo se queda en tu dispositivo.

---

## ✏️ Añadir puntos

El botón **✏️** de la barra lateral activa o desactiva el modo añadir. Activado, cada toque en el mapa coloca un punto:

1. Pulsa **✏️** (se resalta) y toca el lugar en el mapa
2. Rellena el **Nombre** (obligatorio), el **Tipo** y, si quieres, una **Descripción**
3. Confirma con **✅ Añadir**

**El tipo** da el icono del punto. Los tipos se agrupan por familias — 🕳️ Pozos, 🪜 Acceso (**verde = abierto, rojo = cerrado**), ⚠️ Señalización, 🚨 Rescate — y la 🗺️ Leyenda los muestra todos. **— Sin tag (por defecto) —** conserva el icono por defecto. **➕ Crear un nuevo tag…** añade un tipo a tu sesión: un nombre corto en minúsculas, cifras, `_` o `-` (p. ej. `fuente`); usa el icono por defecto.

### ✏️ Modificar o reposicionar un punto

En **tus** puntos, la ventana del punto ofrece:

- **✏️ Editar** — vuelve a abrir la ventana ya rellenada (nombre, tipo, descripción, fotos), y luego **💾 Guardar**. Si cambias el nombre de un punto, sus fotos lo siguen.
- **📌 Reposicionar** — aparece un aviso «Haz clic en la nueva posición de …»: tu siguiente toque mueve el punto allí. El punto conserva todo lo demás (nombre, tipo, fotos, nivel). **Cancelar** en el aviso lo abandona.

Ambos se deshacen con ⏪ (`Ctrl+Z`). Para quitar un punto: **🗑️ Eliminar este punto**, en su ventana (ver 🧹 Borrar y corregir).

### 📸 Fotos adjuntas a los puntos

Hasta **5 fotos por punto**, guardadas solo en tu dispositivo. En la ventana de añadir o de editar, sección **📸 Fotos**:

- **📷 Tomar foto** abre la cámara (móvil); **🖼️ Desde la galería** permite elegir varias de una vez.
- Cada foto se **comprime** (una foto de varios MB pasa a pesar unos cientos de KB) y se **limpia**: la posición GPS de la toma, la fecha y el modelo del aparato se borran antes de entrar en la app.
- **Quitar una foto**: la cruz ✕ roja de la miniatura la marca para borrar, la flecha verde ↺ lo anula. No se borra nada antes de **💾 Guardar**.
- **Cerrar sin guardar** borra las fotos que acababas de añadir y anula las marcas.

**Verlas**: la ventana del punto muestra las miniaturas — un toque abre la pantalla completa (pellizca o usa la rueda para hacer zoom, desliza para pasar a la siguiente, `← →` y `Esc` en PC). El contador **📸** de la barra superior abre el detalle de la sesión.

**Llevártelas**: marca la casilla 📸 de las fotos en ⬆️ → **🚀 Completo**, **🎨 Avanzado** o **🔄 Conversión**; cada foto lleva la ficha de su punto (nombre, posición, nivel, tipo: lo necesario para ♻️ recrear un punto desaparecido). Un archivo reimportado **añade** sus fotos a las del dispositivo — una foto ya presente no se duplica y no se borra ninguna. Con **🛡️ Anonimizar para compartir públicamente**, cada foto se renombra y se vincula al código anónimo de su punto, sin su ficha; una foto que no puede limpiarse queda excluida.

**📌 Foto «por asignar»**: antes de la v2.3.0, una foto se guardaba con el **nombre** de su punto. Si varios puntos llevan el mismo nombre, la app no adivina a cuál pertenece: en la burbuja de cada uno de esos puntos, la foto aparece con un **marco naranja punteado** y un botón **📌 Foto N: es este punto**. Tócalo en la burbuja del punto correcto. Nunca se borra nada. Las fotos cuyo nombre lleva un solo punto se asignan solas, y las que tomes ahora siguen a su punto aunque lo renombres.

**📸 Mis fotos — y las fotos de un punto eliminado**: en **🧰 Herramientas** de la pantalla de inicio, **📸 Mis fotos** muestra todas las fotos del dispositivo, mapa por mapa, agrupadas por punto (un toque = pantalla completa). **Eliminar un punto no elimina sus fotos**: pasan al grupo **⚠️ Sin punto** y se conservan hasta que decidas — **🔗 Vincular** (a un punto de la lista, o **🗺️ Elegir en el mapa** si el mapa está abierto; se rechaza, indicando los huecos libres, si el punto pasaría de 5 fotos — entonces no se cambia nada), **♻️ Recrear el punto** (en su posición, nivel, tipo y nombre; el mapa se abre si hace falta), **💾 Guardar** (un ZIP en el dispositivo) o **🗑️ Eliminar** (tras confirmar). **⏪ Deshacer** la eliminación de un punto le devuelve sus fotos. Si los puntos de un mapa no se pueden leer desde el inicio (mapa ausente o inaccesible), sus fotos quedan **🔎 a comprobar al abrir el mapa** — nunca se declaran sin punto por error. Al abrir un mapa con fotos sin punto, un mensaje discreto **📸 N foto(s) sin punto** propone **Ver**las.

> ⚠️ Las fotos ocupan el almacenamiento del navegador (de unas decenas a unos cientos de MB según el dispositivo); aparece un aviso cerca del límite. En iPhone, el sistema puede vaciar ese almacenamiento si le falta espacio: exporta con regularidad. **💥 Reiniciar todo** también borra las fotos, y borrar una foto no se puede deshacer.

---

## 🛣️ Trazar vías

En el grupo **🛣️ Trazados**:

- **🟩 Ruta principal**, **🟪 Ruta secundaria**, **🟨 Camino**
- **🪜 Unión entre niveles** — solo en un mapa multinivel (ver 🏗️ Modo multinivel)

Pulsa un tipo, toca el mapa punto a punto y vuelve a pulsar el tipo (o **✅ Validar el trazado en curso**) para terminar.

### 📏 Distancia total de los trazados

**📏 Distancia total** suma la longitud de todos los trazados del mapa — los tuyos y los de las capas de datos, incluso ocultas — con una casilla por tipo y, para cada uno, el número de trazados y su longitud. El total se actualiza con cada casilla, y los tramos contados se resaltan en magenta. **✓ Cerrar (mantener el resaltado)** deja el resaltado en el mapa (vuelve a pulsar 📏 para reabrir, tus casillas se conservan); **❌ Borrar el resaltado** lo quita. Este total se queda en pantalla: no entra en la exportación de imagen.

---

## ⬛ Trazar zonas

En el grupo **⬛ Zonas**, superficies cerradas para anotar el mapa:

| Tipo | Aspecto | Efecto en el itinerario |
|---|---|---|
| ⬛ **Escombros** | gris oscuro | ninguno |
| 🟥 **Derrumbe** | rojo | ninguno |
| 🟦 **Agua** | azul | ninguno |
| ⛔ **Inaccesible** | rayado rojo oscuro / negro | **bloquea** el paso |

Pulsa un tipo, coloca al menos 3 puntos (en punteado) y cierra la zona: **vuelve a tocar el primer punto** (un círculo lo rodea desde el 3.er punto) o pulsa **✅ Cerrar la zona en curso**. Sea cual sea el orden del trazado, el agua se muestra debajo, luego los escombros, los derrumbes, y lo inaccesible encima de todo.

### ⛔ Zona «Inaccesible» — bloquea el itinerario

Una zona ⛔ prohíbe al itinerario atravesarla (derrumbe reciente, agua profunda…): el cálculo busca otro camino, o falla y lo dice. Solo bloquea **su nivel**, y sigue contando aunque ocultes la capa de zonas.

La casilla **Respetar las zonas inaccesibles** de la ventana Itinerario (marcada de origen) permite relajarla. El **Modo Rescate** y «Estoy perdido» la respetan siempre. Para «evitar si es posible», usa mejor las **🚫 Preferencias de evitación** del itinerario.

---

## 🏛️ Estructuras (pilares, muros, frentes de cantera)

Para las canteras: los elementos portantes y el avance de la explotación, en el grupo **🏛️ Estructuras**. No tienen ningún efecto en el itinerario.

| Tipo | Forma | Color |
|---|---|---|
| 🟡 **Pilar 1ª masa** | superficie cerrada | amarillo |
| 🟠 **Pilar 2ª masa** | superficie cerrada | naranja |
| 🔵 **Muro** (piedra seca, mampostería) | superficie cerrada | azul |
| 🟨 **Frente de cantera 1ª masa** | línea | trazo amarillo |
| 🟧 **Frente de cantera 2ª masa** | línea | trazo naranja |

Pulsa un tipo, toca los puntos y vuelve a pulsar el tipo encendido (o **✅ Cerrar la estructura en curso**): un pilar o un muro (3 puntos mínimo) se cierra sobre su primer punto, un frente de cantera (2 puntos mínimo) queda como línea abierta.

En un mapa multinivel, los elementos de **2ª masa** se colocan automáticamente **un nivel por debajo del nivel activo**; los demás toman el nivel activo.

---

## 🧹 Borrar y corregir

Los grupos **🛣️ Trazados**, **⬛ Zonas** y **🏛️ Estructuras** tienen cada uno un botón **🧹 Borrar** con las mismas opciones:

| Opción | Efecto |
|---|---|
| **↩️ Último punto** | Quita el último punto colocado — para corregir un toque fallido sin empezar de nuevo |
| **✂️ Último trazado / zona / estructura** | Elimina el objeto que estás dibujando, si no el último terminado |
| **🎯 Seleccionar … a eliminar** | Toca el objeto en el mapa (o cerca de su borde) para eliminarlo |
| **🗑️ Todos los trazados / Todas las zonas / estructuras** | Vacía toda la familia |

Las uniones 🪜 se borran como los demás trazados.

**Un objeto concreto**: su ventana tiene un botón **🗑️ Eliminar**; para un punto, es **🗑️ Eliminar este punto**. Sin ventana de confirmación: todo se deshace con ⏪ (`Ctrl+Z`).

**Todo el mapa**: cuando vuelves a abrir un mapa, la ventana «Sesión anterior restaurada» ofrece **🗑️ Borrar la sesión** (también en cualquier momento en **📊 Detalles de la sesión**) (puntos, trazados, zonas, estructuras, mediciones y trazo del seguimiento; queda una copia en 📦 Backups). Los puntos que llevan un **enlace a otro mapa** (portales) se conservan: para quitar uno, elimina el propio punto. En un **mapa compartido con tu organización**, la ventana te hace elegir (nada viene marcado de antemano): **↻ Anular lo que este dispositivo aún no ha enviado (N modificaciones)**, solo si hay modificaciones esperando el envío (sin red, por ejemplo: en línea, todo sale en unos segundos y vuelve del servidor), o, según tus derechos, **Eliminar mis añadidos para toda la organización** o **Eliminarlo todo para la organización** (número de objetos anunciado antes; estas dos no se deshacen para los demás). Un objeto de autor desconocido nunca se cuenta en «mis añadidos»: la ventana dice cuántos hay, solo «Eliminarlo todo» los cubre.

> ℹ️ Solo se borran **tus** objetos. Los del mapa o de una capa de datos son de solo lectura: abre primero su capa para modificarla desde ≡ **Filtros** y exporta después la capa corregida.

---

## 🫧 La ventana de un objeto: nota, conversión, eliminación

Un toque en **un trazado, una zona o una estructura que hayas dibujado** abre su ventana:

| Elemento | Para qué sirve |
|---|---|
| **Área de texto** | Una nota libre — estado del paso, observación, recordatorio |
| **💾 Guardar la nota** | Guarda la nota y cierra la ventana |
| **🔄 Convertir** | Cambia el **tipo** del objeto y, si hace falta, su **familia** |
| **Nivel** | En un mapa multinivel: mueve el objeto a otro nivel (ver 🏗️ Modo multinivel) |
| **🗑️ Eliminar** | Quita el objeto (en rojo, en su propia línea) |

Un objeto que viene de una capa de datos abre una ventana de solo lectura.

### 📍 La ventana de un punto

Un toque en un **marcador** muestra su nombre, su tipo, su nota y estos botones:

| Botón | Para qué sirve |
|---|---|
| **📍 Estoy aquí** | Recalibra el seguimiento en este punto y **confirma tu posición**: 🚨 Salida de emergencia y 🧭 Ir allí parten luego de aquí |
| **🧭 Ir allí** | Calcula una ruta desde tu posición hasta este punto |
| **➕ Ruta** | Añade el punto como etapa de una ruta |
| **☆ Favorito** | Añade o quita el punto de ⭐ Favoritos |
| **🔊** | Lee la nota en voz alta |
| **📋** | Coordenadas GPS para copiar, si el mapa está georreferenciado |
| **📸 Miniaturas** | Las fotos adjuntas |
| **🌀 Enlaces** | Los enlaces entre mapas que salen de este punto |

En **tus** puntos se añaden **✏️ Editar**, **📌 Reposicionar** y, en una línea roja, **🗑️ Eliminar este punto**.

### 🔄 Convertir: cambiar un objeto de tipo o de familia

Caso típico: en un levantamiento importado, un **frente de cantera** es en realidad una **galería**. El itinerario solo se calcula sobre los trazados: convertirlo en trazado lo hace entrar en el cálculo.

Solo se proponen destinos de la **misma forma**: una **línea** (trazado, frente de cantera) se convierte en otra línea, una **superficie cerrada** (zona, pilar, muro) en otra superficie. El objeto conserva su geometría, su nivel y su nota.

### 🎯 Convertir varios objetos de golpe

En la ventana de conversión, **🎯 Seleccionar varios objetos para convertir** muestra un aviso:

- **toca un objeto** para añadirlo (azul punteado), vuelve a tocarlo para quitarlo;
- **➕ Todos los «tipo» del nivel mostrado** añade todos los objetos del mismo tipo que el último añadido;
- **✅ Convertir (N)** abre la elección del tipo para todo el lote; **Cancelar** lo abandona.

El lote no mezcla líneas y superficies cerradas (el aviso lo rechaza y explica por qué), pero puede mezclar familias: frentes de cantera y caminos, todos líneas, se convierten juntos en galerías. Los objetos que ya son del tipo correcto se quedan como están, y el mensaje final los cuenta. Un solo `Ctrl+Z` deshace todo el lote.

---

## ⏪ Deshacer / Rehacer

Tus **50 últimas acciones** en el mapa se pueden deshacer y rehacer:

- **`Ctrl+Z`** (`Cmd+Z` en Mac) deshace; **`Ctrl+Y`** o **`Ctrl+Shift+Z`** rehace;
- o el grupo **⏪ Historial**, abajo en la barra lateral: **⏪ Deshacer** y **⏩ Rehacer** (en gris cuando no hay nada que hacer).

Un mensaje en la parte inferior de la pantalla dice lo que se ha deshecho o rehecho («↩ Deshecho: Colocación del punto …»).

**Lo que se deshace**: añadir, modificar, mover y eliminar puntos; cada punto colocado en un trazado, una zona o una estructura, su cierre, su eliminación (incluido «Todos»); las conversiones.

**Lo que no se deshace**: eliminar una foto, importar una sesión, el seguimiento de posición, la medición.

El historial se **olvida** al recargar la página o cambiar de mapa, y una nueva acción después de deshacer borra lo que quedaba por rehacer.

> ⌨️ En PC, **`?`** muestra todos los atajos: `E` Edición, `M` Medición, `Z` Zonas, `S` Estructuras, `T` Tracker, `P` Trazados, `L` Leyenda, `B` Brújula, `R` o `Ctrl+K` Búsqueda, `F` modo presentación, `Esc` para cerrar; en un menú de herramientas abierto, `Tab` recorre las opciones y `Intro` valida. No reaccionan mientras escribes en un campo.

---

## 📐 Medición de distancia y ♦️ de superficie

En el grupo **📐 Medición**:

- **📐 Distancia** — toca puntos; el total aparece abajo a la izquierda, con la longitud de cada segmento y los ángulos.
- **♦️ Superficie** — toca al menos 3 puntos; el área aparece en m², y en hectáreas a partir de 10 000 m².

Las dos mediciones conviven: pasar de una a otra no las borra, y tu siguiente toque va a la que está encendida. Su precisión depende de la escala del mapa (calibrada en ⚙️ Ajustes). Se conservan con tu sesión.

**❌ Borrar** ofrece **↩️ Último punto** (en la medición encendida), **🗑️ Toda la distancia 📐**, **🗑️ Toda la superficie ♦️** o **Borrar todo (📐 + ♦️)**.

---

## 🏗️ Modo multinivel (canteras de varias plantas)

En un mapa multinivel, cada punto, trazado, zona y estructura pertenece a un **nivel**, y el itinerario solo pasa de un nivel a otro por una **unión** — nunca porque dos galerías se crucen en la pantalla. Las galerías se apilan en el orden de los niveles (el nivel 0 encima del −1).

Numeración: **0** = nivel de referencia, **1, 2…** por encima, **−1, −2…** por debajo.

### 🎯 El nivel activo y la ventana de Niveles

Una **pastilla amarilla** bajo los botones de zoom muestra el **nivel activo**. Un toque abre la ventana **🏗️ Niveles**:

- **🎯 Nivel activo (para dibujar)** — todo lo que dibujas toma este nivel. **[ − ]** y **[ + ]** añaden un nivel por debajo o por encima. Cambiar de nivel activo **anula el trazado en curso** y solo muestra ese nivel.
- **👁️ Niveles visibles (filtro)** — marca los niveles que quieres mostrar (**Todos** / **Solo activo**). Desmarcar el **0** oculta también la imagen principal del mapa, para mirar una planta sola. Una unión sigue visible si uno de sus dos niveles lo está.

Si el mapa contiene elementos en otros niveles, la lista se amplía sola. Los mismos ajustes están en ≡ **Filtros**. En la exportación de imagen, **🎨 Avanzado → 🏗️ Niveles a exportar** elige los niveles con independencia de lo que se muestra.

### 🔀 Cambiar el nivel de un objeto

¿Un objeto quedó en el nivel equivocado? En la ventana de un trazado, una zona o una estructura que hayas dibujado, la lista **Nivel** (bajo 🔄 Convertir) lo mueve al instante; para un punto, es la lista **Nivel** de **✏️ Editar**, guardada con el resto de la ficha. El nivel actual del objeto siempre se propone, aunque esté fuera de la lista del mapa. Si el nivel elegido está oculto por el filtro, el objeto desaparece del mapa y un mensaje lo indica: la vista se queda en tu nivel. **⏪** lo deshace.

Una unión tiene su propia ficha, con sus dos niveles (ver más abajo). No hay lista en un objeto de capa (🔄 Modificar la capa antes) ni durante un trazado en curso.

### 🪜 Trazar una unión entre niveles

Una unión enlaza dos niveles en el lugar real del paso (escalera, pendiente, pozo, escala):

1. **🛣️ Trazados → 🪜 Unión entre niveles**
2. Elige el **Nivel de salida** (tu nivel activo, por defecto) y el **Nivel de llegada** (el itinerario la recorre en los dos sentidos, pero el primer punto que pones está en el nivel de salida) y luego **OK — Trazar la unión**
3. Toca tantos puntos como quieras y vuelve a pulsar **🪜** para validar

Aparece en magenta punteado, con un círculo en cada extremo. **Sin unión, ningún itinerario cambia de nivel.** Dos escaleras entre los mismos niveles = dos uniones: el itinerario toma la más corta. Se borra como un trazado (🧹 Borrar y corregir).

**Su ficha**: toca una unión que hayas trazado (fuera de un trazado en curso) para abrir **🪜 Unión N0 ↔ N+1**: su **nota** (💾 Guardar la nota), las listas **Salida (1.er punto)** y **Llegada (último punto)** con **🪜 Cambiar los niveles** (dos niveles distintos obligatorios; el itinerario lo sigue al instante) y **🗑️ Eliminar**. **⏪** deshace cada gesto. Sin 🔄 Convertir: una unión sigue siendo una unión.

### ↕️ Escalera o pozo entre niveles (punto)

Un paso vertical **en un lugar preciso** (escalera, pozo con peldaños, pozo sin peldaños) se coloca como un punto, con
uno de los tres tipos **Escalera entre niveles**, **Pozo con peldaños entre niveles**, **Pozo sin peldaños entre
niveles** (grupo «↕️ Pasos entre niveles» de la leyenda). La unión trazada sigue sirviendo para las pendientes suaves.

1. Coloca (o modifica) el punto y elige su tipo: aparece el bloque **↕️ Niveles servidos**
2. Marca los niveles que une el paso (el nivel del punto siempre está marcado)
3. Para cada nivel, la app propone las galerías a menos de **5 m** (50 px en un mapa sin escala, y lo indica):
   **marca aquella a la que sale el paso**. No se valida nada por ti; se avisa de un nivel sin galería cercana
4. Guarda

El punto se muestra en cada uno de sus niveles. Su ficha indica sus niveles y conexiones, y las dibuja en magenta
punteado mientras está abierta. **El itinerario solo usa las conexiones validadas.** Cuenta el paso como **10 m por
nivel para una escalera, 20 m para peldaños**; si la profundidad de los niveles está introducida, usa la diferencia
real. El guiado dice «bajar al nivel −1 **por la escala**». Un **pozo sin peldaños** solo se usa si marcas **🧗 Equipo
equipado (cuerda)** en las Evitaciones de la ventana de itinerario.

🔒 Estos pasos **nunca** se proponen como salida de emergencia ni cuentan como accesos de superficie en el modo
Rescate. Un pozo con peldaños o una escalera de servicio **que sale a la superficie** conserva su tipo y también puede
marcar varios niveles: sigue siendo una salida.

### 🛠️ Del lado del creador del mapa

El modo multinivel, el nivel de cada capa de imagen y el de los elementos de las capas de datos los ajusta el creador del mapa en el Generador (ver 🔭 Para ir más lejos › 🏗️ Crear o modificar un mapa). En un mapa que no lo ha activado, nada de esto aparece; si se activa más tarde, los elementos existentes quedan en el nivel 0.

---

## 📔 Mis salidas y mis datos

### 💾 Guardado automático

Tus anotaciones (puntos, trazados, zonas, estructuras, mediciones) se guardan solas en el navegador, en cada cambio, **por separado para cada mapa**: volver a un mapa que dejaste recupera lo que habías dejado en él.

Al reabrirlo (**▶️ Reanudar** en la pantalla de inicio), una ventana resume lo que se ha restaurado («3 puntos · 1 trazado · 2 zonas») y propone **🗑️ Borrar la sesión** (empezar de cero en este mapa) o **✓ Continuar**. Esc o un clic fuera = Continuar.

- El camino del tracker no se restaura: vuelve a lanzar el seguimiento y recolócate.
- Para guardar una sesión aparte, o pasarla a otro dispositivo: **⬆️ Exportar → 💾 Exportación completa** (ver «⬆️ Guardar y compartir»).

### 📔 Mi cuaderno — el historial de tus salidas

El guardado automático conserva **el estado** de un mapa; el **cuaderno** conserva **la historia**: cada paso por un mapa se convierte en una **salida**, con su fecha, su duración, la distancia recorrida, lo que añadiste, el trazado de tu desplazamiento (minimapa), las fotos tomadas durante la salida y una nota libre que puedes escribir cuando quieras. Borrar una sesión no afecta a las salidas ya archivadas.

**Cómo acceder:** icono **📔 Mi cuaderno** en la tarjeta «🧰 Herramientas» de la pantalla de inicio, sin cargar ningún mapa. Desde un mapa: **📊 Detalles de la sesión** → sección **📔 Salida en curso**, con los botones **📔 Iniciar una salida**, **🏁 Cerrar mi salida** y **Afinar el trazado**.

**🚶 ¿Salida de campo o 🖥️ trabajo sobre el mapa?** La app las distingue sola:
- te has **desplazado** (tracker, o un solo **📍 Estoy aquí**) → **salida de campo**;
- solo has **anotado sin moverte** → **trabajo sobre el mapa**, archivado aparte al final del cuaderno.

Los totales del cuaderno (salidas, tiempo, distancia) solo cuentan el campo. ¿La app se ha equivocado? Abre la ficha → **Clasificar como salida de campo** (o **Clasificar como trabajo sobre el mapa**); los mismos botones 🚶 / 🖥️ están en 📊 Detalles de la sesión. Tu corrección nunca se recalcula.

**¿Cuándo se archiva una salida?**
- **Automáticamente**, cuando sales del mapa: primero queda **en pausa 2 horas** (ver «Reanudación» más abajo) y luego se archiva si has recorrido **al menos 50 m**, **o** has trabajado **10 minutos** con al menos un añadido. Por debajo, no se guarda nada: abrir un mapa 20 segundos no ensucia el cuaderno.
- **A mano**, con **🏁 Cerrar mi salida**: se archiva sin condiciones y empieza otra. Práctico para dividir una jornada en etapas.

El interruptor **📔 Llevar un cuaderno de mis salidas** está en **⚙️ Configuración** (inicio), activado por defecto. Desmarcado, ya no se abre nada solo; siempre puedes empezar una salida con **📔 Iniciar una salida**.

#### 🏁 La distancia cuando el podómetro no vio nada

Con el teléfono en el bolsillo, el podómetro cuenta poco. Cada **📍 Estoy aquí** deja un **hito con fecha y hora**, y la app une esos hitos **siguiendo las galerías** (no en línea recta): de A a C y luego de C a B, cuenta A→C y después C→B.

- Durante la salida, la cifra es **prudente** (en línea recta), para que «Estoy aquí» siga siendo instantáneo. El cálculo por las galerías se hace cuando la salida se archiva: en ese momento la distancia **aumenta**. En un mapa muy grande, la app puede quedarse con la línea recta antes que bloquearse.
- **Afinar el trazado** hace ese cálculo cuando quieras y vuelve a dibujar el recorrido en la ficha. En un mapa muy voluminoso, la app avisa de que se bloqueará unos segundos y te deja decidir.
- Al cerrar, la app te pregunta **por dónde saliste**: un clic en el mapa y el último tramo (tras tu último hito) entra en el total. **Omitir** si cierras desde casa.
- Si el podómetro midió entre dos hitos, cuenta él, nunca los dos. Un clic en el mapa para corregir tu posición, o el paso por un enlace hacia otro mapa, no cuentan como trayecto.

La ficha dice de dónde sale la cifra:

| Lo que pone | Lo que significa |
|---|---|
| *de ellos 900 m calculados por las galerías entre 6 hitos* | Recorrido reconstruido sobre tus trazados: fiable |
| *de ellos 900 m en línea recta entre 6 hitos (sin afinar)* | Línea recta: **subestimado**, a veces mucho |

> ⚠️ Es una **reconstrucción**, no un levantamiento: la app supone el camino más corto entre dos hitos. Rodeos, callejones sin salida y medias vueltas quedan subestimados. El recorrido redibujado solo aparece en la ficha: tus exportaciones y el mapa de calor conservan el trazado realmente registrado. Sin ningún «Estoy aquí», solo queda el podómetro.

#### ⏱️ La duración de una salida

Una salida **de campo** se cuenta **del inicio al final**: teléfono en el bolsillo o app en reposo, el tiempo cuenta. Justo debajo, la ficha da el **tiempo con la app abierta**: *3 h de salida para 12 min de app* es un podómetro que no ha visto casi nada. Una sesión de **trabajo sobre el mapa** conserva, en cambio, el tiempo de uso.

¿Olvidaste **🏁 Cerrar mi salida** al salir? La app tomó el último momento en que estaba activa, a menudo cuando el teléfono la puso en reposo. Abre la ficha → **✏️ Corregir el final** e introduce la hora real: la duración se recalcula. El tiempo con la app abierta no cambia, y un final anterior al inicio se rechaza.

#### 🔁 Salida interrumpida: reanudación y fusión

- **El teléfono cerró la app** (una llamada, otra aplicación): si vuelves al mismo mapa en menos de **45 minutos**, la salida **continúa** en lugar de abrir otra. Un mensaje te lo indica.
- **Abres otro mapa por el camino**: tu salida queda **en pausa**. Vuelve a su mapa en menos de **2 horas** y se reanuda, con contadores y trazado; el tiempo pasado en otro sitio cuenta en su duración. El seguimiento, en cambio, se detiene al cambiar de mapa: al reanudar, la app propone **▶️ Reanudar el seguimiento**.
- Una salida que **cerraste tú** nunca se reanuda.

Para unir salidas ya partidas: **📔 Mi cuaderno → 🔗 Fusionar salidas**, márcalas (al menos 2) → **Fusionar**. Duraciones, distancias, pasos y añadidos se suman; la duración va del inicio de la primera al final de la última; las notas se apilan; fotos y trazados se reúnen; si un solo fragmento era de campo, el conjunto lo es.

> ⚠️ **Irreversible**: las salidas de origen desaparecen. La app pide confirmación.

#### 📖 La pestaña Relatos

La segunda pestaña del cuaderno, **📖 Relatos**, reúne las notas y los PDF del **Modo Historia** de **todos tus mapas, sin cargar ninguno**: la nota se muestra con formato y se **edita ahí mismo** (es la misma nota que en el mapa), los PDF se abren, se eliminan (🗑️) o se añaden (**➕ Añadir un PDF**). Un PDF incluido en el ZIP de un mapa aparece aquí en cuanto has abierto ese mapa una vez.

**Conviene saber:** todo se queda en tu dispositivo; cada salida se elimina desde su ficha; por encima de **500 salidas**, las más antiguas se borran; el cuaderno viaja con la exportación del perfil.

### 📊 Estadísticas de sesión

En la parte superior de **📊 Detalles de la sesión** (cabecera de la pantalla, o la etiqueta 📊 en móvil):

| Estadística | Contenido |
|---|---|
| **Total** | Puntos + trazados + zonas + estructuras, con el detalle por tipo |
| **Distancia** | Longitud acumulada de los trazados (en km a partir de 1000 m) |
| **Superficie** | Área acumulada de las zonas (en ha a partir de 10 000 m²) |
| **Fotos** | Fotos adjuntas a los puntos |
| **Duración** | Tiempo transcurrido desde que se abrió el mapa |

En un mapa multinivel se añade un reparto por nivel. **Copiar** pone un resumen de texto en el portapapeles (para un mensaje a tu compañero); **Exportar en TXT** lo descarga.

### 👤 Perfil

El **panel de perfil**, arriba en la pantalla de inicio, muestra tu **avatar** (tu foto, o tu inicial sobre un color que no cambia mientras no cambie tu apodo), tu **apodo** (editable) y de una a tres estadísticas. Un toque abre la ventana **👤 Perfil**: apodo, foto, **🖼️ Fondo de pantalla del inicio**, tu **rango** y tus **🏆 Logros**.

#### 📊 Tus estadísticas

- **Contadores**: mapas, sesiones, favoritos, copias de sesión (10 como máximo por mapa, las más antiguas se van), fotos, y espacio que ocupan tus datos de MyKTAMap.
- **📊 Mis mapas**: una tabla, mapa por mapa, de puntos, trazados y distancia (en m o km si el mapa está calibrado), con un total. Se rellena un mapa tras otro para no saturar la memoria. Un mapa marcado con ⚠️ aún no se ha abierto: solo se cuentan sus anotaciones; ábrelo una vez para completar su fila.
- **📊 Reparto por categoría**: gráficos circulares de todos los mapas (puntos por icono, trazados, zonas, estructuras por tipo). Muestran los nombres de origen de los tipos: un cambio de nombre hecho en la leyenda de un mapa sigue visible en las estadísticas de ese mapa. Misma regla que arriba: un mapa nunca abierto solo cuenta sus anotaciones.
- **🏷️ Filtro por etiqueta**, encima de los gráficos: un clic conserva los mapas que llevan la etiqueta, un segundo los excluye, un tercero vuelve a cero; todos los gráficos siguen, y la exclusión gana. El gráfico «Mapas por etiqueta» muestra lo que te queda por etiquetar. El filtro vuelve a cero cada vez que abres la ventana.
- ¿Un tipo personalizado aparece con un identificador (`cust-…`)? Abre su mapa una vez, o toca **🔎 Recuperar los nombres**: la app lee tus mapas sin abrirlos uno a uno, con tu permiso; los nombres encontrados se conservan.
- **🎨 Estadísticas del panel de inicio**: elige de 1 a 3 entre ⏱️ Tiempo total, 💾 Almacenamiento y 🗺️ Mapas visitados, entre otras (por defecto: tiempo y almacenamiento). El panel se actualiza al instante.

#### 📤 Exportar e importar tu perfil

En la ventana Perfil, **📤 Exportar mi perfil** genera un archivo que lleva todo a otro dispositivo: lista de mapas y carpetas, preferencias, favoritos, sesiones, copias, cuaderno, identidad. Marcas las secciones; se muestra el tamaño estimado. El código de acceso y el PIN nunca se exportan.

- **PDF del Modo Historia**: desmarcados por defecto, porque un mapa puede llevar hasta 100 MB. Marcados, se colocan de nuevo en su sitio al importar, sin duplicados si vuelves a importar.
- **Archivos de mapas**: marca los mapas memorizados que quieras llevarte (nada viene marcado); la exportación se convierte en un `.zip` «perfil completo» y la importación vincula cada archivo a su mapa. Por encima de unos 50 MB en iPhone/iPad (500 MB en otros), la app pide confirmación. Si el navegador borró un archivo, la exportación te dice cuáles faltan. Los mapas en «volver a seleccionar» no aparecen: su ZIP está en tu disco, no en la app.
- **Mapas de una organización (☁️)**: ni ellos ni sus sesiones, fotos, favoritos o copias van en el archivo, y un perfil importado no restaura ninguno (el resumen de importación dice cuántos se ignoraron): se recuperan al conectarse a la organización.

**📥 Importar un perfil** te deja elegir las secciones y el modo: **🔄 Merge** añade sin sobrescribir (recomendado), **♻️ Replace** vacía antes las secciones marcadas. En Merge, un mapa que ya tiene su archivo en el dispositivo conserva el suyo. Solo se recuperan las preferencias que produce una exportación: un archivo modificado a mano no puede fijar ningún otro ajuste. Al final se propone recargar la app. En una instalación que solo ofrece los mapas de su servidor, la importación de perfil se rechaza (podría ocultar esos mapas); la exportación sigue siendo posible.

---

## ⬆️ Guardar y compartir

Todas las exportaciones parten del grupo **⬆️ Exportar** de la barra lateral: abre un lanzador de mosaicos en cuatro partes — **🖼️ Imagen**, **💾 Sesión**, **🗺️ Mapa** (🔄 Actualizar el mapa, más arriba), **🌍 Exportación externa**. Antes de compartir una imagen, un PDF o un KMZ, comprueba que no revela nada sensible (accesos, lugar privado).

### 📤 Exportar tu sesión

**⬆️ Exportar → 💾 Sesión** ofrece dos mosaicos:

- **💾 Exportación completa** — toda la sesión en un archivo, para volver a importarla más tarde: puntos, trazados, zonas, estructuras, mediciones y seguimiento del tracker (posición, camino, cronología: el replay funciona tras reimportar). `.json`, o `.zip` si marcas las fotos. La opción **🛡️ Anonimizar para compartir públicamente** sustituye los nombres por códigos y quita el seguimiento.
- **🎨 Exportación avanzada** — tú eliges: puntos (por icono, incluido «sin etiqueta»), trazados, zonas y estructuras (por tipo), mediciones, tracker (un contador muestra lo que contiene). Salida en **📄 Un solo archivo de sesión** reimportable, o en **📦 ZIP multiarchivo** (uno por categoría).
- **🔎 Conservar solo** (en cabecera de ambos) — limita los puntos, trazados, zonas y estructuras a un **periodo** (fecha de su última modificación) y, en una instalación conectada, a su autor (**Creado por**); un contador indica cuántos salen. En el mapa ☁️ de otra cuenta, la exportación sigue siendo posible pero limitada a **tus** añadidos: «Creado por» queda fijado en ti. Seguimiento, mediciones y notas se exportan tal cual.

### 🖼️ Exportar como imagen

**⬆️ Exportar → 🖼️ Imagen (PNG / JPEG)**, dos modos:

- **⚡ Exportación rápida** — todo lo visible (mapa, capas, anotaciones, tracker), en PNG a la resolución original. Un clic en **Descargar**.
- **🎨 Exportación avanzada** — marcas las capas de imagen, las capas de datos y tus anotaciones, y ajustas:
  - una **leyenda** colocada sobre el mapa: posición (una de las 4 esquinas, o 🎯 donde quieras), estilo (Opaco / Semitransparente / Filigrana), tamaño (Compacto / Estándar / Grande), contenido (iconos, trazados, zonas, etiqueta del tracker, nombre, versión, autor y fecha del mapa); sus textos se pueden personalizar;
  - el **formato**: PNG, o JPEG (más ligero);
  - la **resolución**: Original, ½ o ¼. La app preselecciona la mayor que sigue siendo razonable e indica el tamaño y la memoria necesarios; en iPhone/iPad, las resoluciones imposibles aparecen en gris y, cuando incluso ¼ es demasiado grande para el iPhone, se marca por defecto la opción **📱 Máx. iPhone** (la imagen más grande posible); el tamaño indicado es el de la imagen producida.
  - Una vista previa se actualiza en directo.

### 🖨️ Exportar a PDF imprimible

**⬆️ Exportar → 🖨️ PDF imprimible**: un PDF para imprimir y llevar al terreno, enviar a alguien que no tiene la app, o archivar.

- **Formato**: de A0 a A4, vertical u horizontal (A4 horizontal por defecto).
- **Contenido**: tus anotaciones, la imagen del mapa y sus capas, las capas de datos, una cabecera (título e información del mapa).
- **Calidad**: Estándar ×1 (A3/A4), Alta definición ×2 (A0/A1, archivo más pesado), Borrador ×0,5. A0/A1 en ×2 puede tardar de 30 a 60 segundos en móvil. Si la imagen supera lo que el dispositivo puede producir, la resolución se reduce y la app te dice cuál obtienes.
- **🗺️ Leyenda** colocada en una esquina (abajo a la izquierda por defecto), en tres tamaños y cuatro estilos: **Pro (fondo blanco)** para imprimir (por defecto), Oscuro opaco, Oscuro semitransparente, Filigrana discreta. Solo enumera lo que figura realmente en el mapa exportado.

El PDF lleva la mención «Généré par MyKTAMap · CC BY-NC-SA 4.0 · myktamap.fr» y se llama `<mapa>_<fecha>.pdf`.

### 🛰️ Exportar a GeoTIFF georreferenciado (SIG)

**⬆️ Exportar → 🖼️ Imagen → 🛰️ GeoTIFF georreferenciado (SIG)**: el mapa como imagen georreferenciada. Abierto en **QGIS** (o cualquier SIG), se coloca solo en su sitio, sin volver a escribir nada.

- **Contenido**: **Solo el escaneo** (el fondo limpio, para dibujar encima en un SIG) o **Escaneo + dibujos** (como la exportación de imagen: capas visibles, puntos, trazados, zonas, estructuras).
- **Proyección**: **WGS84** (latitud / longitud, por defecto) o **Lambert 93** (la referencia SIG en Francia).
- **Resolución**: Original, ½ o ¼; la ventana indica el tamaño de la imagen producida. En el teléfono se limita a 64 Mpx (para la resolución completa de un mapa grande, exporta desde un ordenador); las opciones imposibles aparecen en gris y, si hace falta, aparece una opción **Máx.**.
- **El mapa debe estar calibrado** (georreferenciación GPS, ver «⚙️ Ajustes» o la exportación KMZ): si no, el botón **Descargar** queda en gris y la ventana explica qué hacer.

El archivo se llama `MyKTAMap_<mapa>_<fecha>_L93.tif` (o `_WGS84.tif`). Un mapa grande tarda: el botón muestra el progreso.

### 🌍 Exportar a otra app (KMZ, GPX, GeoJSON)

**⬆️ Exportar → 🌍 Exportación externa** (mosaico **KMZ**, **GPX** o **GeoJSON**) genera:
- un **KMZ**: tu mapa y tus anotaciones situados sobre el globo, para **Google Earth**, **OsmAnd**, **Locus** o **Avenza**;
- un **GPX**: puntos y trazados, para TopoDroid, OsmAnd, Strava… y reimportable en MyKTAMap con sus niveles;
- un **GeoJSON**: tus objetos para **QGIS** o cualquier SIG, con su tipo, etiqueta, nombre, nivel, nota y color.

**El mapa debe estar georreferenciado**: dos puntos cuyas coordenadas GPS conoces. Los campos vienen rellenados con la georreferenciación del mapa (ver «⚙️ Ajustes») y se guardan para este mapa. Mientras escribes, una **🌐 Vista previa esquinas** da la posición de las 4 esquinas, la escala, la rotación, y un enlace **🔗 Ver el centro en Google Maps** para comprobarlo.

Contenido del KMZ:
- **🖼️ Imagen del mapa**, con una **opacidad** ajustable (60 % por defecto) para ver el fondo de satélite a través. Una imagen muy grande se reduce automáticamente; si no es posible, la app te pregunta antes de exportar. Para un mapa **teselado**, **Imágenes grandes (Google Earth móvil)** (marcada por defecto) guarda el mapa en unas pocas imágenes grandes — lo que Google Earth sabe mostrar en un teléfono — con una **nitidez** a elegir: 1 imagen, 4 (por defecto) o 16 (más nítido, más pesado). Sin marcar, la exportación conserva las teselas, nítidas al hacer zoom, para Google Earth en ordenador.
- **📍 Puntos** (por icono), **🛣️ Trazados**, **⬛ Zonas** y **🏛️ Estructuras** (por tipo), **🪜 Uniones entre niveles**, **🗺️ Ruta activa**, y en un mapa multinivel, los **🏗️ niveles** a incluir (todos por defecto, una carpeta por nivel).

Así puedes exportar solo los pozos, o solo las zonas inaccesibles. **Descargar** genera `MyKTAMap_<mapa>_<fecha>.kmz`.

> 💡 La proyección es fiel en un mapa regular; un mapa estirado o ensamblado puede desviarse en los extremos. Un **punto C**, en la georreferenciación del mapa, corrige este tipo de deformación.

El **GeoJSON** retoma las mismas casillas que el KMZ (puntos por icono, trazados, zonas y estructuras por tipo, uniones, itinerario, niveles), sin la imagen. Elige la **proyección**: **WGS84** (por defecto; la norma GeoJSON, para un sitio web o una herramienta estricta) o **Lambert 93** (el archivo termina en `_L93.geojson` y QGIS lo coloca solo).

---

## ⬇️ Cargar / Importar

### 📥 Importar un archivo (sesión o GPX)

**⬇️ Cargar / Importar** abre directamente el selector de archivos; la app reconoce su tipo.

- **Sesión de MyKTAMap** (`.json`, o `.zip` con fotos): **sustituye** tu sesión en curso (puntos, trazados, zonas, medición); sus fotos, en cambio, **se añaden** a las tuyas, sin borrar ninguna. Una vista previa muestra lo que contiene; justo antes se toma una copia de tu sesión actual. **Importar** para validar, **Cancelar** para no cambiar nada.
- **Archivo GPX** (TopoDroid, OsmAnd, Avenza, Strava, Garmin…): sus puntos y trazados **se añaden** a tu sesión. El mapa debe estar georreferenciado. Una vista previa precede a la adición, y **Ctrl+Z** la deshace.

Para cambiar de mapa, toca la **rosa de los vientos 🧭** (vuelta al inicio) o el **título del mapa** en la barra superior; tu sesión se guarda antes del cambio. Volver al inicio **cierra el mapa** para devolver su memoria al dispositivo (el seguimiento se detiene): **▶️ Reanudar** lo vuelve a abrir donde lo dejaste.

---

## ⚙️ Mis mapas y ajustes

### 📚 Tu lista de mapas

La pantalla de inicio guarda todos los mapas que has cargado, desde un servidor o desde tu dispositivo. Un toque en la fila carga el mapa.

| Símbolo | Significado |
|---|---|
| 🌐 | Mapa ofrecido por el servidor |
| 💾 | Mapa ZIP cargado desde tu dispositivo |
| ✅ | Mapa **memorizado en la app**: recarga inmediata, incluso sin conexión |
| 📁 | Mapa no memorizado: hay que volver a seleccionar su ZIP en cada carga — el **💾** de su fila lo memoriza después |
| 🔐 | Entrada antigua de «acceso permanente»: en la próxima selección pasa a ✅ |

La memorización se ajusta en **⚙️ Configuración** («💾 Memorizar el mapa en la app en la primera carga», activado por defecto).

**En cada fila:**
- **💾** (mapa 📁 no memorizado): vuelve a pedir su ZIP, comprueba que es el mismo mapa y lo memoriza, sin abrirlo.
- **⭐** fija el mapa al principio de la lista (otro clic para soltarlo).
- **ℹ️** abre la ficha del mapa: su información (versión, autor, tamaño, modo, fechas…), un **✏️ nombre visible** local (40 caracteres, vacío = nombre original), sus **🏷️ Etiquetas del mapa** (separadas por comas, 12 como máximo), el **Teselado de este mapa** para imágenes muy grandes no divididas, la **💾 Disponibilidad sin conexión** de un mapa de servidor, y **🗑️ Quitar de la lista**. Quitar un mapa no toca el ZIP de tu disco, pero borra su archivo memorizado, su sesión, su georreferenciación, sus fotos y sus copias; sus PDF de historia se quedan en 📔 Mi cuaderno → 📖 Relatos, salvo que marques su eliminación.

**Encima de la lista:**
- **🔎 Filtrar por nombre…** filtra mientras escribes.
- **🌐 Mostrar los mapas del sitio** oculta o vuelve a mostrar los mapas colocados en el sitio (no se borra nada, la elección se conserva).
- En cuanto un mapa lleva una etiqueta, aparecen **etiquetas-filtro**: toca una o varias para ver solo esos mapas.

> 🌐 Los mapas de un servidor pueden llegar ya etiquetados. En cuanto modificas las etiquetas de un mapa, cuentan las tuyas, aunque estén vacías. Para recuperar las del servidor, quita el mapa de la lista: se volverá a descubrir con ellas.

#### 📁 Ordenar tus mapas en carpetas

A la derecha de «📚 Mis mapas», el selector **Todo | Carpetas**. En modo **Carpetas**, crea tus carpetas (➕), cada una con un color que aparece como punto delante del nombre del mapa. Un mapa está en una sola carpeta; los demás van a «Sin clasificar».

- **Ordenar**: **☑ Seleccionar** uno o varios mapas y luego «Mover a…», o **arrastrar** la fila sobre una carpeta (con el ratón, o con el dedo tras una pulsación larga).
- **⋮** en una carpeta: renombrar, color, orden, eliminar (sus mapas vuelven a Sin clasificar, nunca se elimina ningún mapa).
- **🏷️ Regla por etiqueta** (en ⋮): la carpeta acoge sola los mapas que llevan esas etiquetas. En modo Todo, las etiquetas marcadas proponen **📁 Crear una carpeta desde estas etiquetas**. Una colocación a mano gana sobre una regla; el punto es **lleno** para una colocación explícita, **hueco** para una regla.
- Las carpetas viajan con tu perfil. Un servidor puede proponer algunas: no puedes renombrarlas ni eliminarlas, pero metes en ellas lo que quieras. La importación de varios mapas propone «Guardar en:».

#### 💾 Hacer que un mapa de servidor esté disponible sin conexión

Un mapa **memorizado** ya funciona sin conexión. Un mapa **de servidor**, no: solo se guarda lo que hayas visto, sin garantía, y un mapa grande puede volver **con agujeros**. En su ficha **ℹ️**, sección **💾 Disponibilidad sin conexión**, **⬇️ Hacer disponible sin conexión** lo descarga todo (imagen, datos, todas las teselas de todos los zooms) en un espacio que sobrevive a las actualizaciones de la app.

| Lo que ves | Lo que significa |
|---|---|
| **No descargado** + ⬇️ | Solo se guarda lo que hayas visto, sin garantía |
| **✅ Disponible sin conexión** + ↻ / 🗑️ | Está todo; **↻ Actualizar** sustituye al botón de descarga |
| **⚠️ Descarga incompleta** + ⬇️ | Interrumpida, o archivos borrados por el navegador: complétala |
| **✅ Disponible, pero faltan archivos** + ↻ | El servidor no ha entregado algunos archivos; la app los enumera, el mapa sigue siendo utilizable |

Al abrir la ficha, la app comprueba si el servidor ha cambiado: **⚠️ Actualización disponible**, **✓ Actualizado**, o **No se puede comprobar** (sin conexión). Nunca dice «actualizado» sin haberlo comprobado, y si el navegador ha hecho limpieza, vuelve a proponerte la descarga.

### ⚙️ Configuración (inicio) — toda la app

El botón **⚙️** arriba en la pantalla de inicio abre **⚙️ Configuración**: los ajustes que valen para **todos tus mapas**. Cada sección se pliega tocando su título (en el teléfono, solo la primera empieza abierta); tu elección se conserva.

- **🌍 Aplicación** — el **idioma**: Français, English, Español. Se aplica al momento, guía y tutorial incluidos; la bandera de la ventana 📖 Documentación cambia solo el idioma de la guía. También se elige en la pantalla de desbloqueo, y se conserva en modo incógnito.
- **🎨 Visualización**:
  - **📐 Adaptar el tamaño de los iconos al zoom** (activado por defecto): en el plano, y también en la Vista OSM y el mapa OSM de la pantalla de inicio;
  - **❓ Botón de ayuda en las ventanas** (activado): un ❓ en el título de las ventanas que tienen página de ayuda, que abre directamente la página correcta;
  - **🔔 Notificaciones**: **Todas**, **Esenciales** (por defecto: ya no hay mensajes que confirman un gesto que acabas de hacer) o **Silencio** (solo lo importante: batería baja, sensor denegado, errores). Las alertas del servidor y las ventanas que esperan una decisión nunca se silencian;
  - **➕ Botones de zoom +/− en los mapas**: muestra los botones + y − en el plano, el widget OSM de la pantalla de inicio y la vista OSM. Desactivado por defecto: se hace zoom con los dedos (pellizcar) o con la rueda del ratón;
  - **🪟 Anclar los paneles de herramientas a su botón**: los paneles Trazados, Zonas y Estructuras se abren junto a su botón en lugar de centrados (cómodo en pantalla grande, desaconsejado en el teléfono);
  - **🧲 Imantación al dibujar** y su distancia: un clic cerca de un punto existente se engancha a él, para que tus galerías se unan de verdad;
  - **☀️ Tema claro**;
  - **🔆 Mantener la pantalla encendida** mientras la app está abierta. El tracker también propone activarlo al arrancar.
- **🧩 Funciones opcionales** — Replay, mapa de calor, batería y vibración, todas desactivadas por defecto: ver «🔭 Para ir más lejos». Aquí está también el **🕵️ Modo incógnito**: abre una ventana nueva donde no se guarda nada (no disponible en una instalación conectada a una base de datos, cuyo servidor registra lo que haces).
- **🔒 Privacidad y seguridad**:
  - **📔 Llevar un cuaderno de mis salidas** (activado, ver «📔 Mi cuaderno»);
  - **💾 Memorizar el mapa en la app en la primera carga** (activado);
  - **🔐 Código de acceso local** (PIN, Face ID): ver «🔭 Para ir más lejos»;
  - **🔒 Privacidad y Auditoría**: **📋 Ver el registro de red**, **📖 ¿Qué hace la app en la red?** y la casilla **🗺️ Vista OSM** (ver «🔴 Advertencias importantes») — la app no envía ninguno de tus datos; el único sitio externo que contacta es OpenStreetMap (fondo de mapa de la Vista OSM), que esta casilla desactiva, y el registro de red te lo muestra;
  - **📚 Mapas del sitio**: **🚫 No cargar los mapas del sitio al arrancar**, si solo usas tus propios mapas (tras recargar, desaparecen de la lista y de las estadísticas).
- **🛠️ Sistema y mantenimiento**:
  - **🛠️ Modo Desarrollador** (protegido con contraseña): ver «🔭 Para ir más lejos»;
  - **📊 Ver el estado de memoria**: lo que ocupa la app en tu dispositivo, con **📋 Copiar el informe** para señalar un problema;
  - **🆘 Resolución de problemas**: una ventana que ordena, de lo más suave a lo más radical, **🔄 Forzar la actualización**, **🆘 Abrir la herramienta Kill SW** (SW = *Service Worker*, la parte de la app que la guarda para usarla sin conexión) y **💥 Reiniciar todo** — ver «🆘 En caso de problema».

### ⚙️ Ajustes (en modo mapa) — este mapa

El botón **⚙️ Ajustes** de la barra lateral abre los ajustes del **mapa abierto**. Cada grupo indica su alcance — **📍 este mapa** o **🌍 todos los mapas** — y se pliega con un toque en su título.

#### ✓ Todo se guarda en cuanto lo cambias

Sin botón Aplicar: cada campo se guarda al momento (un destello verde lo confirma). Un valor fuera de límites se pone en rojo, el mensaje da los límites y el valor anterior se mantiene. **Esc**, **✕** o **Cerrar**: no se pierde nada.

- **🌍 Aplicación** — **Activar el modo presentación** (pantalla completa sin interfaz; tecla **F** en PC; salida con **F**, **Esc** o la ✕ flotante). **🏠 Ajustados desde el inicio** muestra en modo lectura los ajustes de ⚙️ Configuración, con un botón para ir allí (tu sesión se conserva).
- **📐 Mapa: escala y geolocalización** *(este mapa)*:
  - **Escala**, con **🎯** para calibrarla (ver más abajo);
  - **🧭 Calibración del Norte**, si la parte superior del mapa no es el Norte: un ángulo, o **📐 Calibrar (2 clics)** (Sur y luego Norte en el mapa), **↺ Restablecer** para volver a 0. La brújula siempre muestra el Norte verdadero;
  - **🌐 Georreferenciación GPS**: se muestra su estado (no georreferenciado, puntos A y B, A, B y C, B estimado) y **🌐 Abrir la georreferenciación…** abre su ventana. Para los puntos A y B: **🔍 Buscar un punto** o **📍 Haz clic en el mapa** rellena la posición en el mapa, y luego pegas las coordenadas GPS en formato Google Maps (`48.856600, 2.352200`). Elígelos **alejados** entre sí. **Estimar B** deduce B a partir de A, la escala y el Norte: una estimación, que hay que comprobar en la Vista OSM. El **📐 Punto C (opcional)**, lejos de la línea A-B, corrige un mapa deformado (ensamblaje estirado) para la Vista OSM, las exportaciones y el Modo Rescate. **💾 Guardar la calibración** / **🗑️ Borrar**. Esta georreferenciación sirve para la Vista OSM, las exportaciones KMZ, GPX, GeoJSON y GeoTIFF y la importación GPX.
- **📍 Navegación y tracker** *(📍/🌍 según la línea)*:
  - **🧭 Posición inicial del tracker** *(este mapa)*: X/Y, **🔍 Elegir mediante un punto** o **📍 Hacer clic en el mapa**. Cambiar el inicio hace que el seguimiento vuelva a empezar desde ahí (el recorrido en curso se borra);
  - **👣 Detección de pasos** *(todos los mapas)*: longitud del paso (de 0 a 1,5 m), umbral (de 10 a 30), retardo (de 300 a 3000 ms);
  - **🧭 Navegación inteligente** *(este mapa)*: ver «🔭 Para ir más lejos».
- **🎨 Visualización** — **🎨 Fondo bajo el mapa** *(este mapa)*: negro, blanco o gris neutro bajo las partes transparentes del mapa (por defecto: el que recomienda el mapa, si no según el tema); la exportación de imagen lo usa; **⚪ Mostrar círculos en las intersecciones** *(este mapa)*; **🎤 Comandos de voz (BETA)** *(todos los mapas)*: un botón 🎤 para manejar la app con la voz, di «ayuda» para la lista de comandos; disponible solo en francés: el botón solo aparece si la app está en francés. Una opción que tu navegador no admite sigue visible, en gris, con el motivo.
- **🚀 Rendimiento** *(este mapa)* — el **🚀 Modo ULTRA** para los mapas grandes que hacen fallar el teléfono (ver «🔭 Para ir más lejos»); en un mapa multinivel, **🏗️ Mostrar todos los niveles al iniciar**.
- **🧩 Funciones opcionales** — las mismas casillas que en ⚙️ Configuración (opciones, modo incógnito). La privacidad se ajusta en ⚙️ Configuración de la pantalla de inicio.
- **🛠️ Sistema y mantenimiento** — el **modo rendimiento** del mapa, en modo lectura.

Abajo, **↺ Valores por defecto** (tras confirmación) devuelve este mapa a sus valores de origen (escala, inicio, navegación inteligente, círculos, Norte), la detección de pasos a los valores de la app, y vuelve a colocar el seguimiento en el inicio. Los ajustes de la pantalla de inicio no cambian.

#### 🎯 Calibrar la escala

¿La app muestra 100 m donde sabes que hay 150?

1. Mide la distancia con **📐**.
2. **⚙️ Ajustes → 🎯** junto a la escala.
3. Introduce la distancia mostrada (100) y la distancia real (150): aparece la nueva escala.
4. **Aplicar**: se guarda al momento.

Cuanto más larga sea la distancia medida, más preciso será el resultado.

---

## 📚 Ayuda y documentación

### 🎓 Volver a ver el tutorial

El tutorial de bienvenida se puede repetir en cualquier momento: **📖 Documentación** → botón **🎓** en la línea de título, junto al selector de idioma.

### 🔎 Buscar en la documentación

Arriba de la ventana 📖, el campo **🔎 Buscar** busca en todo el texto: los resultados se resaltan, **Intro** o ↓ pasa al siguiente, el contador indica «i / n» y el índice atenúa las partes sin resultado. Los acentos no cuentan: «reglages» encuentra «Réglages». La búsqueda de la ventana **❓ Ayuda** (grupo 📚) busca en los títulos y el contenido de las páginas de ayuda.

### 🤖 Ayuda con IA

En **📖 Documentación**, el botón **🤖** (línea de título) descarga un archivo `.md` que describe todo lo que hace la app: esta guía, unas preguntas frecuentes e instrucciones para la IA.

1. **📥 Descargar el contexto (.md)**.
2. Abre la IA conversacional que prefieras (ChatGPT, Claude, Gemini, Le Chat…) y adjúntale el archivo al principio de la conversación.
3. Haz tus preguntas: *«¿Cómo añado un punto?»*, *«Mi mapa se cuelga, ¿por qué?»*.

El archivo solo contiene la documentación, ninguno de tus datos: puedes compartirlo. La IA, en cambio, puede ser de pago según el servicio.

---

## 🆘 En caso de problema

### 💥 La aplicación se cierra bruscamente

En el teléfono, el sistema cierra las aplicaciones que consumen demasiada memoria. En el siguiente arranque, una ventana roja **«ATENCIÓN — CIERRE BRUSCO DETECTADO»** te lo explica. Para que no vuelva a pasar:
- cierra las demás aplicaciones y las pestañas que no uses;
- activa el **🚀 Modo ULTRA** en este mapa (**⚙️ Ajustes → 🚀 Rendimiento**);
- exporta tu sesión con regularidad;
- si sigue pasando con el mismo mapa, hay que **dividirlo al generarlo**: pídeselo a su creador.

### ⚠️ Un mapa no carga

Una ventana **«⚠️ Mapa no encontrado»** significa que sus datos ya no están accesibles: navegador vaciado o almacenamiento lleno, lista importada de otro dispositivo sin los ZIP, cambio de navegador, mapa retirado del servidor. Tres opciones:
- **🔄 Reintentar** (mapa de servidor momentáneamente inaccesible);
- **📁 Volver a seleccionar el ZIP** (mapa local): si estaba memorizado, vuelve a estarlo;
- **🗑️ Quitar de la lista**, si ya no tienes el mapa.

Un ZIP rechazado al cargar está probablemente incompleto o dañado: vuelve a pedírselo a su creador. Un mapa también puede haber sido **revocado** por su autor: ver «🔭 Para ir más lejos → 🛡️ Mapas revocados».

### 🔍 La imagen del mapa está borrosa

En un mapa muy grande no dividido, la app reduce la imagen para que quepa en memoria. Para una imagen nítida, el mapa debe dividirse al generarlo: pídeselo a su creador.

### 🧭 El tracker deriva demasiado rápido

Recoloca tu posición a menudo (**📍 Estoy aquí**), comprueba la escala (🎯 más arriba) y la longitud del paso (**⚙️ Ajustes → 📍 Navegación y tracker**).

### 🔘 Un modo sigue activo

Vuelve a tocar el botón activo (en verde) para desactivarlo.

### 🔑 La contraseña se rechaza

En el primer arranque, MyKTAMap simplemente propone **Continuar**: no se pide ningún código. Solo una instalación con su propia contraseña (asociación, club, myktamap.fr) pide una: es **esa contraseña** la que necesitas, y una licencia pro no la sustituye. Si la instalación la cambia, la app la vuelve a pedir en el siguiente arranque; sin conexión, tu acceso sigue siendo válido.

### 🔄 La app no se actualiza, o se queda bloqueada

Por este orden, conservando tus datos:
1. **⚙️ Configuración → 🆘 Resolución de problemas → 🔄 Forzar la actualización**: vuelve a descargar la app sin tocar tus mapas, sesiones, preferencias ni códigos. Hace falta conexión.
2. Si la app sigue bloqueada (página en blanco, inicio sin formato): comprueba tu conexión (desactiva tu VPN, cambia de red), y luego **⚙️ Configuración → 🆘 Resolución de problemas → 🆘 Abrir la herramienta Kill SW**.
3. Si la app ni siquiera se abre: abre la **página de rescate** en una pestaña privada del navegador (no en la app instalada): **https://myktamap.fr/killsw.html** (su dirección también aparece al pie de la ventana 🆘 Resolución de problemas). Vacía la caché de la app **sin tocar tus datos** (mapas, sesiones, fotos) y propone **🚀 Recargar la app**.

Estas herramientas no borran **ningún** dato (mapas memorizados, sesiones, fotos, cuaderno, preferencias). Por precaución, **📤 Exportar mi perfil** antes.

### 💥 Reiniciar todo

**⚙️ Configuración → 🆘 Resolución de problemas → 💥 Reiniciar todo** devuelve la app al estado de un primer arranque. **Irreversible**: borra tu lista de mapas y sus archivos, tus sesiones y sus copias, las fotos, el cuaderno y los PDF de historia, tu perfil (rango, logros, avatar, fondo de pantalla), los escenarios del Modo Rescate, tus preferencias, tu PIN, y la propia app (que habrá que volver a descargar).

- La primera ventana propone **📤 Exportar mi perfil primero**.
- Si tu instalación tiene su propia contraseña, te avisa de que se **volverá a pedir al reiniciar**: asegúrate de conocerla antes de confirmar. Si no, la app propondrá simplemente **Continuar**.
- Se piden dos confirmaciones. Hazlo **con conexión**: si estás sin conexión, una ventana roja te avisa de que la app quedará inutilizable hasta que vuelva la red.

No hay que confundirlo con **↺ Valores por defecto** de ⚙️ Ajustes, que solo afecta a los ajustes del mapa abierto.

### ✉️ Problema no resuelto

Escribe a **contact@myktamap.fr**: qué estabas haciendo, tu teléfono y tu navegador, y una captura si es posible (el informe de **📊 Ver el estado de memoria** también ayuda).

---

## 🔭 Para ir más lejos

Este capítulo reúne lo que no necesitas a diario: las **funciones desactivadas por defecto** (actívalas si te sirven), el **Modo Rescate**, las herramientas **para los creadores de mapas** y, por último, el **alojamiento y la administración** (servidor, licencia pro, mapas revocados, registros de diagnóstico).

### 🧩 Funciones opcionales

Cuatro funciones secundarias están **desactivadas por defecto**, para mantener la aplicación ligera. Se marcan en **⚙️ Configuración** de la pantalla de inicio, grupo **🧩 Funciones opcionales**, o en **⚙️ Ajustes** con un mapa abierto: es el mismo ajuste, válido para **todos los mapas**.

| Opción | Lo que añade |
|---|---|
| **🎬 Replay del tracker** | El mosaico 🎬 del menú 🧭 Tracker: volver a reproducir tu sesión de seguimiento |
| **🔥 Mapa de calor** | El mosaico 🔥 del menú 🧭 Tracker: mapa de densidad de paso |
| **🔋 Nivel de batería** | La carga restante en la parte superior de la pantalla, y un aviso al 20 %, 10 % y 5 % |
| **📳 Vibración háptica** | Una breve vibración que confirma algunas acciones |

> ⚡ Replay y Mapa de calor aparecen o desaparecen la próxima vez que abres el menú 🧭 Tracker. La batería surte efecto en el **próximo inicio** de la app.

#### ⛔ «Sensor rechazado»

Si la batería o la vibración aparece **en gris** con «Sensor rechazado por iOS» o «por este dispositivo», es que **tu sistema no da ese sensor a las páginas web**. Apple no proporciona ni la vibración ni el nivel de batería a un sitio web, aunque esté instalado como aplicación.

#### 🎬 Replay del tracker

El mosaico **🎬** del menú **🧭 Tracker** abre una ventana a pantalla completa que **vuelve a reproducir tu sesión de seguimiento**: el marcador amarillo rehace tu recorrido y el rastro se alarga a medida que avanza.

- **Controles**: barra de tiempo, ⏮ ▶️ ⏸ ⏭, velocidad de 0.5× a 10×. Al pulsar ▶️, la ventana se reduce a la parte inferior de la pantalla para dejar ver el mapa (el botón **⛶** alterna entre ambos).
- **Teclado**: Espacio = reproducir / pausar · ← → = retroceder / avanzar un segundo · Esc = cerrar.
- **📤 Exportar CSV**: una tabla con fecha y hora de las posiciones (inicio, cada paso, cada recalibración, y el nivel en un mapa multinivel), legible en una hoja de cálculo.
- Una recalibración es un salto: no se dibuja ninguna línea entre la posición antigua y la nueva.
- La sesión reproducida **no se conserva**: vuelve a cero al recargar la app o al cambiar de mapa.

#### 🔥 Mapa de calor

El mosaico **🔥 Mapa de calor** del menú **🧭 Tracker** colorea el mapa según la frecuencia de paso: **rojo = muy transitado, azul = poco explorado**. La escala se adapta sola al mapa.

- **Fuentes** (combinables): el recorrido del tracker, tus puntos, trazados, zonas y estructuras de sesión, y los datos del mapa. Las recalibraciones, los inicios y las pausas de más de 5 min no generan calor.
- **Radio** e **Intensidad** se ajustan en directo: si todo está pálido, sube la intensidad; si todo está rojo, bájala.
- En un **mapa multinivel**, una línea **🏗️ Niveles a incluir** permite quedarse solo con algunos (los niveles visibles vienen marcados): práctico para comparar dos plantas.
- Usos: detectar los ejes realmente recorridos, o los sectores poco cartografiados que conviene revisar sobre el terreno.

El mapa de calor es **puramente visual**: no modifica ni el mapa, ni tus anotaciones, ni las exportaciones. Cierra la ventana para ocultarlo.

> 🚑 El **Modo Rescate** conserva su propio mapa de calor de actividad, esté marcada o no esta opción.

#### 🔋 Nivel de batería

El indicador aparece en la parte superior de la pantalla (`⚡ 78%` cargando, `🪫 23%` descargando, color según el nivel) y en la **visualización XL de emergencia**.

| Nivel | Aviso |
|---|---|
| 20 % | Mensaje: considera el modo Rendimiento ULTRA para ahorrar |
| 10 % | Mensaje: activa ULTRA y considera detener el tracker, cuyos sensores consumen mucho |
| 5 % | Ventana roja **🪫 Batería crítica**: guarda tu sesión, anota tu posición, plantéate volver a subir |

Cada aviso se muestra **solo una vez** por descarga; se reinician cuando vuelves a poner el teléfono a cargar.

Solo **Chrome, Edge y Samsung Internet** dan el nivel de batería a las páginas web. En **Safari (iPhone, iPad, Mac)** y **Firefox**, el indicador permanece oculto, también en la visualización XL de emergencia.

#### 📳 Vibración háptica

Una breve vibración confirma las acciones: etapa del itinerario alcanzada, recalibración, validación de una etapa, alertas del Modo Rescate (equipo con retraso, miembros que faltan).

> 🚨 **Las alertas de supervivencia vibran siempre**, aunque la opción esté desmarcada: salida de emergencia encontrada o no encontrada, alerta crítica difundida.

En iPhone, la opción aparece en gris (ver «Sensor rechazado» más arriba).

### 🧭 Navegación inteligente

El tracker estima tu posición con **tus pasos y la brújula**, lo que **deriva** con el tiempo. Si tu mapa contiene **trazados de galerías**, la navegación inteligente reajusta continuamente tu posición **sobre la galería más cercana**.

**Activación**: **⚙️ Ajustes** → **📍 Navegación y tracker** → **🧭 Ajustar la posición a los trazados**. **Desactivada por defecto**, y se ajusta **para cada mapa**: depende de la calidad de los trazados de ese mapa.

- Al avanzar, tu posición sigue la galería; en un **cruce**, la app elige el ramal que corresponde a tu dirección de marcha.
- Si sales de las galerías trazadas, el tracker vuelve al modo clásico y se reajusta en cuanto vuelves cerca de un trazado.
- En un mapa sin trazados, la opción no tiene ningún efecto.
- La acompañan dos ajustes expertos: la **tolerancia lateral** (distancia al trazado antes de soltarse) y el **peso del rumbo** en los cruces. Si algo falla, vuelve a sus valores por defecto.

> 💡 La **recalibración manual (📍)** sigue siendo tu mejor aliada: en cuanto reconozcas una referencia, recalibra, y la navegación inteligente vuelve a partir de una base sana.

### 🗺️ «Mapa orientado»: el mapa gira contigo

En el menú 🧭 Tracker, el mosaico **🗺️ Mapa orientado** hace **girar el mapa** durante el seguimiento, para que tu dirección de marcha apunte siempre hacia la parte superior de la pantalla, como un GPS de coche.

- **Desactivado por defecto**; tu elección se recuerda en este dispositivo.
- El mapa solo gira **durante el seguimiento** y vuelve a enderezarse al detener el tracker.
- **Te sigue**: si lo desplazas a mano, un botón **🎯 Recentrar** te devuelve a tu posición.
- Los textos siguen siendo legibles: las medidas y las fichas de los puntos no giran con el mapa.
- El mapa se endereza en cuanto tomas una herramienta que requiere hacer clic (medida, dibujo, recalibración) o abres un modo a pantalla completa.

⚠️ La rotación sigue tu brújula: **cerca de grandes masas metálicas** (raíles, armaduras), puede volverse aproximada, como el resto del tracker.

### 🔐 Código de acceso local (PIN / Face ID)

Bloquea la app en cada inicio con un código de 4 a 6 cifras, o con **Face ID / Touch ID / huella / Windows Hello** si tu dispositivo lo permite. Todo se queda en el dispositivo: no se envía nada por Internet, y **no hay recuperación posible si lo olvidas**.

> ⚠️ **Es una barrera de uso, no un cifrado.** Impide abrir la app con normalidad, pero tus fotos y sesiones siguen siendo legibles en el navegador para alguien que sepa hacerlo.

**Activar**: desde la pantalla de inicio, **⚙️ Configuración** → **🔐 Código de acceso local** → **🔐 Activar código de acceso**. Elige tu código, confírmalo y acepta la biometría si se te propone. **Apunta tu código** en un lugar seguro.

**Al iniciar**, la pantalla de bloqueo sigue a la pantalla de arranque: la biometría se lanza sola (puedes cancelarla y escribir tu código), si no, escribes tu código. Para volver a bloquearla, cierra la app por completo (o recarga la página): el código se vuelve a pedir en la siguiente apertura.

**Cambiar o desactivar**: misma sección, **✏️ Cambiar código** o **🔓 Desactivar**, tras validar con la biometría o con el código actual.

**5 códigos erróneos seguidos** bloquean la app **temporalmente**: 10 min, luego 1 h, 6 h y 24 h con cada nueva serie. Se muestra una cuenta atrás y el teclado vuelve solo al final del plazo; un código correcto lo pone todo a cero. Los fallos de biometría no cuentan. Un código olvidado no se recupera: solo borrar los datos del sitio en los ajustes del navegador levanta el bloqueo, y lo borra todo (mapas, sesiones, cuaderno).

### 🚑 Modo Rescate — coordinar una búsqueda

> **Para quién**: quien organiza la búsqueda de una persona desaparecida bajo tierra, y los equipos que bajan a buscarla.
>
> **Cuándo**: otra persona está perdida. Si eres *tú* quien está perdido, usa ⛑️ Estoy perdido.
>
> **Requisitos**: el **mismo mapa** en cada teléfono, disponible **sin conexión** — bajo tierra no hay red.
>
> **Instalación conectada**: los equipos se vinculan a **cuentas** (jefe ★), la intervención se **activa** (alerta en cada teléfono, «Unirme a mi puesto») y el tablero se comparte etapa por etapa: lo marcado bajo tierra se envía al volver la red. El teléfono y la radio siguen siendo el canal oficial.
>
> **Prepáralo en frío**: monta uno o dos escenarios en tus mapas habituales antes de cualquier incidente. El día D, la app tiene que estar lista en 30 segundos.

Para abrirlo: menú **🧭 Tracker** → abajo, sobre fondo rojo, **🚑 Modo Rescate — Mapas de búsqueda (equipos + zonas)**.

#### 🧭 Cómo se organiza

Tres roles, cada uno en su teléfono:

| Rol | Quién | Qué hace |
|---|---|---|
| 👤 **Operador de superficie** | el puesto de mando, en superficie | prepara el escenario, sigue a todos los equipos, lo anota todo, reúne los informes |
| 🚨 **Equipo sobre el terreno** | cada equipo que baja | sigue su recorrido etapa por etapa, anota lo que ve |
| 🚑 **Socorrista libre** | un refuerzo sin equipo asignado | toma notas con hora, sin recorrido |

El ciclo: **preparar** el escenario → **transmitirlo** a los equipos antes de bajar → **seguir** la intervención → **cerrar** y hacer el informe.

#### 🧰 1. Preparar un escenario

##### 📝 Crear un escenario

- **➕ Nuevo escenario**: un nombre, la hora del incidente y notas de contexto (opcionales).
- **Desde ⛑️ Estoy perdido**: el botón **🚑 Lanzar un plan de rescate (equipos + zonas)** crea el escenario ya listo — última posición conocida, zona de incertidumbre (círculo en el mapa), hora del incidente y notas deducidas. Antes hay que haber definido allí una última posición conocida.
- **🗐 Duplicar** clona un escenario para probar otra hipótesis («se fue por el este» / «se fue por el sur») sin tocar el original.
- **10 escenarios por mapa** como máximo: por encima, se borra el más antiguo. Nunca un escenario en curso, el que tienes abierto, el más reciente, ni una intervención terminada cuyo informe aún no ha salido del teléfono.

El escenario se edita en tres bloques: **📝 Contexto del incidente**, **🚨 Equipos**, **📤 Exportar este escenario**. En el contexto, **🔍 Herramientas de análisis → 🔥 Mostrar el mapa de calor de actividad** muestra dónde se ha registrado actividad (seguimiento, puntos, trazados): si la persona desaparecida usaba MyKTAMap y te pasó su sesión, ves por dónde pasó.

##### 👥 Los equipos

**➕ Añadir un equipo**, y luego en su ficha:

- **Nombre** (déjalo vacío: Alpha, Bravo, Charlie…) y **🎨 Color**, entre 10 colores fijos;
- **👥 Miembros** (separados por comas), **👤 Jefe**, **Efectivo** — el efectivo es lo que permite contar a los presentes al regresar. Si se deja vacío, vale el número de miembros nombrados (o, en una instalación conectada, de cuentas vinculadas si son más); la línea de abajo indica de dónde sale la cifra y avisa si tu valor es menor. Introdúcelo cuando bajen personas sin cuenta ni nombre;
- **Regreso obligatorio**: hora fijada por el jefe (autonomía de las luces, relevo); prevalece sobre la duración estimada para las alertas de retraso;
- **Nivel** de referencia en un mapa multinivel (o «Sin nivel» si el equipo cambia de planta);
- **📍 GPS superficie** (opcional, ver § 4).

**🧹 Dividir en sectores** reparte todas las galerías del plano en sectores de longitud parecida, cada uno de una sola pieza (un sector puede pasar de un nivel a otro por un pozo), y crea un equipo «Sector N» por sector: su zona, el **acceso abierto** más cercano como entrada y salida, y un recorrido de **barrido completo** ya calculado. Elige el número de sectores (6 por defecto); los equipos existentes no se tocan. El balance da la longitud de los sectores, las galerías no conectadas a ningún acceso, y avisa si el plano solo tiene un acceso abierto etiquetado (todos los equipos salen por él) o ninguno (coloca las entradas a mano).

En un mapa multinivel, **🏗️ Auto: 1 equipo por nivel** crea un equipo por cada nivel que contiene algo. Los equipos se pliegan (▾/▸, «▸ Plegar todo») para que la lista siga siendo legible.

##### 🗺️ Recorrido, zona e itinerario

- **🗺️ Recorrido**: toca **Entrada**, **➕ Añadir una etapa intermedia** y luego **Salida**. Para cada punto: tus **⭐ favoritos** del mapa en un toque, la búsqueda, o **📍 Hacer clic en el mapa** (el punto se ajusta al POI — punto de interés del mapa — más cercano). Tocar un POI lo toma como punto, sin abrir su ficha. Misma entrada y misma salida = bucle. Desde la búsqueda de la app, el botón 📌 asigna un punto a un equipo en dos toques.
- **⬛ Definir zona**: o bien un **polígono** (un toque por vértice, doble toque para cerrar), o bien una **selección de trazados** (toca cada galería, vuelve a tocarla para quitarla). Las zonas de los demás equipos se muestran en punteado para ajustar los límites. Una galería del mapa se encuentra idéntica en todos los teléfonos que tienen ese mapa; un trazado añadido a mano en un solo dispositivo solo existe en él. En un mapa multinivel, la zona vale **en el nivel donde la dibujaste** — marca «Zona en todos los niveles» para extenderla.
- **✨ POI de la zona** añade todos los puntos de la zona como etapas, de cerca a lejos desde la entrada. Si la zona contiene varios tipos de puntos, una ventana los lista con su número: desmarca los que no se toman como etapas (por ejemplo placas por centenares). Tu elección vale para todos los equipos del escenario.
- **🧹 Recorrido**: **Camino más corto por las etapas** (el cálculo clásico de abajo), **Barrido completo de la zona** — un circuito que pasa por **cada** galería de la zona, callejones sin salida incluidos (ida y vuelta) —, o **Esqueleto** — todas las galerías salvo los callejones sin salida, para un reconocimiento rápido antes de la búsqueda. El camino más corto se salta los bucles: con él, un tercio de las galerías de un sector puede quedar sin recorrer. En un barrido, tus etapas se mantienen, reordenadas según el paso del circuito; durante **🧭 Seguir mi recorrido**, un desvío te hace **volver al circuito** donde ibas, sin acortarlo.
- **🗺️ Calc. ruta** calcula el camino por las galerías, de la entrada a la salida pasando por las etapas, con distancia y duración. **Rodea las etapas y las zonas de los demás equipos**; si no puede, lo avisa. También enumera **las etapas a más de 25 m de una galería**: corrígelas antes de bajar. Por último, avisa cuando galerías de otro nivel pasan bajo la zona sin que ningún recorrido baje hasta ellas.
- **⏱️ Duraciones estimadas** (ajustes propios del escenario, que viajan con él): **velocidad de aproximación** fuera de la zona (3 km/h por defecto), **velocidad de búsqueda** dentro de la zona (1,5 km/h), **pausa por etapa** (0) y **alerta roja tras** (30 min de retraso).
- **🗺️ Ver en el mapa** muestra zonas, entradas, salidas e itinerarios de todos los equipos, cada uno con su color.

##### 📊 Comprobar la cobertura

El bloque **📊 Cobertura** da, por nivel: la longitud de galerías, la parte **en una zona**, la parte **en un recorrido** y la longitud asignada a dos equipos. Solo la parte «en un recorrido» se buscará de verdad: un 86 % de galerías en una zona puede quedarse en un 24 % en un recorrido. También enumera los POI situados en la zona de un equipo pero fuera de su recorrido, y los visitados por varios equipos. **🗺️ Resaltar las galerías fuera de recorrido** las muestra en rojo en el nivel mostrado, para preparar la fase siguiente. Es una ayuda a la lectura: nada se asigna automáticamente.

##### 📋 Varias fases

Una intervención puede encadenarse en fases, con un debrief entre cada una — por ejemplo, fase 1: un equipo barre los ejes principales; fase 2: varios equipos registran las salas señaladas. Si no las necesitas, ignóralas: un escenario siempre tiene una fase, y los botones de fase solo aparecen a partir de dos.

En **📋 Fases**, **➕ Añadir una fase**: un nombre, y luego marca los **equipos participantes**. Los equipos se definen una sola vez para todo el escenario; un mismo equipo puede participar en varias fases. ✏️ renombra o cambia los equipos; 🗑️ elimina, salvo la última fase, la fase activa o una fase ya iniciada. Durante la intervención, una pastilla ámbar en la cabecera de las vistas recuerda la fase activa y su posición.

#### 📤 2. Transmitir antes de bajar

- **📤 Exportar .mkmsec.json**: envía este archivo a cada equipo (mensajería, correo, cable). En su teléfono, el equipo abre 🚑 Modo Rescate → **📥 Importar un plan**, revisa la vista previa y luego **✓ Importar este escenario** — o, más rápido, suelta el archivo en **📦 Añadir un mapa** en la pantalla de inicio: la app abre el mapa correcto, muestra la vista previa y propone lanzar como «Equipo». La importación conserva el vínculo con el puesto de mando: es lo que permitirá al operador aceptar su informe. Si el escenario ya está en el teléfono, elige **Reemplazar** (recomendado: conserva el vínculo, pero borra lo ya introducido durante la intervención en ese teléfono) en vez de **Importar como copia** (el informe de esa copia será rechazado). La vista previa avisa si el archivo viene de otro mapa o de otra versión del mapa.
- ⚠️ **Tras una actualización de la aplicación, vuelve a importar el escenario en cada teléfono antes de la intervención**: si no, el puesto de mando puede no lograr fusionar los informes.
- **Sin conexión**: al lanzar, la app avisa si el mapa no está totalmente disponible sin conexión en el dispositivo; descárgalo desde **ℹ️ Información del mapa** antes de bajar. Para el mapa de superficie, abre la **🌍 Vista OSM** mientras tengas red y toca **💾 Guardar sin conexión** (detalles en la sección Vista OSM).
- **📄 Exportar PDF (1 página/equipo)**: una ficha por equipo, para imprimir o llevar en el teléfono — contexto, miembros, jefe y efectivo, regreso obligatorio, misión, mapa de la zona (a la resolución completa del mapa: los nombres de galerías se leen incluso en un mapa grande), etapas, **hoja de ruta** cruce por cruce (cambios de nivel incluidos, si el itinerario está calculado) y un recuadro «Observaciones» para rellenar a bolígrafo.
- **🌍 Exportar KMZ geolocalizado**: el escenario para Google Earth, OsmAnd o Avenza — una carpeta por equipo (puntos, zona, itinerario) sobre el mapa de fondo. Los itinerarios que faltan se calculan antes de exportar, y MyKTAMap vuelve a leer ese KMZ con el escenario. Hace falta un mapa calibrado con dos puntos GPS (pestaña 📡 Exportación externa de la exportación de sesión).

#### 🔦 3. Sobre el terreno

##### 🚀 Lanzar y elegir tu rol

**🚀 Lanzar el plan de rescate** (banda en la cabecera del escenario), y luego elige tu rol: 👤 Operador de superficie, 🚨 Equipo sobre el terreno (y cuál), o 🚑 Socorrista libre. Puedes cambiar de rol más tarde sin perder lo introducido.

En el rol de equipo, quedas **colocado en la entrada de tu equipo** — de oficio si tu posición aún no estaba confirmada; si no, la app te lo propone («Colocarme en la entrada» / «Mantener mi posición»). Un único mensaje resume el lanzamiento.

Cerrar la ventana no quita nada: tu zona y tu recorrido siguen en el mapa (el equipo ve el suyo, el operador todos), incluso tras recargar. Abajo de la pantalla, la pastilla **🚑 Rescate · Alpha · 3/8 ›** recuerda que la intervención está en marcha; al tocarla vuelves a las etapas por validar. **⏸️ Pausa** congela el cronómetro, **▶️ Retomar** lo reanuda: el tiempo de pausa no se cuenta.

##### 🚨 Lado del equipo

La vista muestra tu recorrido etapa por etapa (Entrada, 1…N, Salida — el mismo número en todas partes). En cada etapa, **📝 observaciones** (se guardan solas) y un **estado**:

| Estado | Cuándo |
|---|---|
| • En espera | aún no tratada |
| 🟢 Sin novedad | nada que señalar |
| 🟡 Sospechoso | huellas, ruido u olor inusuales |
| ⬛ Bloqueado | paso impracticable (derrumbe, agua) |
| 🔵 Indicio | objeto o huella encontrado |
| 🟠 Ayuda solicitada | refuerzo humano o material |
| 🟣 Media vuelta forzada | recorrido abandonado, regreso anticipado |
| 🚨 **Víctima encontrada** | urgencia absoluta: tarjeta roja parpadeante en el lado del operador |
| ⚪ Pasada, sin informar | la pone la app cuando pasas a la etapa siguiente sin elegir estado — una etapa saltada no es una etapa registrada |

- **📸 Foto**: hasta 5 por etapa, cámara o galería; toca una miniatura para ampliarla.
- **Validar una etapa te recalibra en ella** (con Sin novedad, Sospechoso, Indicio, Ayuda solicitada o Víctima encontrada): sin preguntar a menos de 30 m, con una pregunta más allá. Nunca con Bloqueado o Media vuelta forzada: no llegaste allí.
- **🧭 Seguir mi recorrido (guiado paso a paso)** convierte el recorrido en un itinerario guiado: la banda «En 40 m, gira a la izquierda», la hoja de ruta y la 🔆 Vista XL te llevan de etapa en etapa, y el seguimiento 🧭 arranca. Las etapas validadas se marcan; si te desvías, **Recalcular** vuelve a salir hacia la siguiente etapa sin hacer, rodeando siempre las zonas de los demás equipos. Al llegar a una etapa, un mensaje y una vibración te avisan, y la pastilla 🚑 abre esa etapa. Hace falta que el itinerario del equipo esté calculado.
- Tres atajos si algo va mal: **🚪 Salida de emergencia**, **🔆 Vista XL**, **⛑️ Estoy perdido**.
- **▶️ Salida** anota tu hora de salida (si no, la del lanzamiento); **✅ De vuelta** detiene el cronómetro al subir.

##### 👤 Lado del operador

- En cabecera: **«X desplegado(s) · Y bajo tierra · Z desaparecido(s) al regresar»**. Al lanzar, la app señala los equipos sin efectivo: a su regreso, no se contaría a nadie.
- Una tarjeta por equipo: progreso, último estado, última observación. **🚨 Víctima encontrada** → tarjeta roja parpadeante; **🟠 Ayuda solicitada** → naranja; equipo terminado → en gris. **👁️ Detalles** muestra todas sus etapas.
- **Retrasos**: cada equipo tiene una hora de regreso prevista (salida + duración estimada, o su regreso obligatorio). Pasada esa hora, su tarjeta pasa a **naranja**; tras el margen, a **rojo**. Los equipos con retraso suben arriba, la pastilla de abajo cambia de color, y un mensaje y una vibración avisan.
- **✅ De vuelta**: la app pregunta **cuántos han subido** (nada viene prerrellenado: cuenta). Por debajo del efectivo, la alerta roja **«N PERSONA(S) DESAPARECIDA(S)»** sigue en pantalla, pastilla incluida, hasta que se corrija el recuento (**Corregir el recuento**).
- **📢 Llamada general** (o **📢 Llamar** para un equipo) marca los equipos que siguen bajo tierra como llamados, con la hora. ⚠️ **La app no avisa a nadie** — bajo tierra no hay red: transmite la orden tú mismo, por radio o de viva voz.
- **🚨 Tomar el control**: ¿un equipo llama por radio? Pasas a su vista, en su primera etapa sin terminar, para introducir datos en su lugar; **👤 Volver a Operador** te devuelve. En ese caso, Seguir mi recorrido, Salida de emergencia, Vista XL y Estoy perdido no aparecen: actuarían sobre tu propio teléfono.
- **📜 Diario de operaciones**: todo queda anotado con la hora — lanzamiento, estados, víctima, salidas, regresos, llamadas, importaciones, fases — más tus propias notas (llamada por radio, decisión). Se imprime como anexo del informe.
- **Modificar durante la intervención**: un equipo añadido como refuerzo, o cuya entrada, salida o etapas cambias, recibe enseguida sus etapas. Lo introducido se queda en la misma etapa. Quitar una etapa ya rellenada pide confirmación, y se rechaza si señala Ayuda solicitada o Víctima encontrada: cambia antes su estado. Si la vuelves a poner en la misma fase, la etapa recupera lo introducido.

El 🚑 **socorrista libre** no tiene recorrido ni etapas: añade notas, cada una con un estado y la hora. Su informe se importa como el de un equipo, y sus notas se suman al diario de operaciones.

##### 🚑 Víctima encontrada

Una etapa marcada como **Víctima encontrada** da una posición: la de la etapa, nivel incluido. **📍 Precisar en el mapa** la ajusta. Un **✚ rojo** la marca en el mapa, para todos; el operador la ve en una banda en la cabecera de su vista, y el informe la imprime en primer lugar.

**🚑 Evacuar** abre la Salida de emergencia desde la víctima: salidas del mapa y accesos de los equipos, ordenados por distancia real («Acceso n.º 3 (Charlie, Delta) — a abrir desde la superficie» si está cerrado). Antes del cálculo, las **opciones de camilla**: zonas que evitar (agua y escombros marcados por defecto) y, como último recurso, paso por las zonas inaccesibles. Si ningún camino evita esas zonas, la ventana lo indica.

#### 🚒 4. Rescate exterior

- **🚒 Briefing bomberos** (en todas las bandas del Modo Rescate) genera un PDF para los bomberos, para imprimir o enviárselo antes de que lleguen — no necesitan instalar nada:
  - **ACCESOS EN SUPERFICIE**: el mapa encuadrado en los accesos de los equipos, un marcador numerado por acceso, y una tabla N.º · acceso (entrada, salida o ambas) · equipos · GPS y enlace de mapa clicable. Indica qué acceso hay que abrir desde la superficie. **Pon nombre a tus entradas** («Tapa calle X»); si no, la tabla dice «Acceso sin nombre»;
  - **LOCALIZACIÓN EN EL MAPA**: coordenadas del centro del mapa, enlaces OpenStreetMap y Google Maps;
  - **EQUIPOS EN EL LUGAR**: miembros, jefe, efectivo, regreso obligatorio, GPS superficie;
  - **POI CRÍTICOS**: los accesos del mapa con su nivel, primero los abiertos y luego los cerrados (que los bomberos y los servicios competentes pueden abrir).
  
  Eliges las capas del mapa OSM del PDF; las secciones de texto siempre se incluyen.
- **📍 GPS superficie** (ficha del equipo): la posición del puesto de mando, del punto de encuentro o de cualquier lugar de superficie ligado al equipo, en formato «latitud, longitud» (p. ej. 48.856600, 2.352200). Figura en el briefing con un enlace de mapa.
- **🚪 Punto de entrada del mapa**: esta etiqueta (categoría 🚨 Rescate del editor de POI) marca las entradas principales; aparecen en los POI críticos y en la Vista OSM.
- **🌍 Vista OSM**, presente en la banda del escenario y en las tres vistas, muestra el mapa sobre OpenStreetMap a los equipos de rescate que llegan. Hace falta un mapa georreferenciado.

#### 📦 5. Cerrar y hacer el informe

##### 🏁 Cerrar una fase

En la vista del operador, **✓ Fase finalizada** (visible en cuanto hay 2 fases). Cuando todos los equipos de la fase han validado su salida, el botón se pone verde y un mensaje te avisa; la decisión sigue siendo tuya. Escribe el **debrief** (equipos de vuelta, puntos encontrados, zonas a explorar con prioridad) y luego **✓ Finalizar la fase**: la fase queda archivada, no se borra nada y se conserva su recorrido previsto. Si existe una fase siguiente, la app propone iniciarla: las etapas de sus equipos se rehacen a partir de su recorrido **actual** — así que puedes ajustarlo durante el debrief. Si no, propone detener el plan. **➕ Añadir una fase** también está disponible durante la intervención.

##### 📥 Importar los informes de los equipos

1. Al volver, cada equipo toca **📤 Informe** → archivo **.mkmsec.report.json**, y lo envía al operador.
2. El operador, con el plan lanzado, toca **📥 Importar informe de equipo**: la vista previa muestra el equipo, el número de etapas y de fotos, y los conflictos con lo que ya ha introducido.
3. **✓ Importar y fusionar**: las observaciones se juntan con la fecha (no se pierde nada), se conserva el estado más grave (a igualdad, el más reciente; una víctima nunca se rebaja), las fotos se añaden sin duplicados. La tarjeta del equipo muestra «📥 importado».

La importación se rechaza si el equipo no existía en el escenario del operador al lanzar, si el archivo viene de otro escenario, o si es un informe global de operador. Un informe sobre una fase ya cerrada se guarda en el historial de esa fase, y la app lo indica. Un aviso de Ayuda solicitada o Víctima encontrada en una etapa que habías quitado vuelve a poner el punto en el recorrido del equipo y se muestra en rojo; si no, figura en «Avisos fuera del recorrido» del informe.

**Deshacer una importación**: se hace una copia justo antes; restáurala desde **📊 Detalles de la sesión → 📦 Backups recientes** («Antes de importar informe de equipo …»).

##### 📄 Informe final

**📤 Informe** (cada vista, y la banda del escenario) genera en cualquier momento el estado actual, en tres formatos: **PDF imprimible** (fotos en anexo), archivo **.mkmsec.report.json** (fotos si «📸 Incluir las fotos» está marcado), o **Copiar texto** para un mensaje rápido. El operador obtiene todos los equipos, un equipo su recorrido, el socorrista sus notas.

El PDF del operador empieza por las víctimas, luego recorre cada fase (recorrido previsto, etapas, debrief), los avisos fuera del recorrido, una página «BRIEFING SUPERFICIE» con el mapa de accesos, y el diario de operaciones en anexo.

**⏹️ Finalizar el plan** detiene la intervención; la banda pasa a **📦 PLAN FINALIZADO** con **📤 Ver el informe histórico** y **🚀 Relanzar**. ⚠️ Relanzar borra la intervención anterior, fotos e informes recibidos incluidos: exporta antes su informe.


### 🏗️ Crear o modificar un mapa

El botón **🏗️ Generar un mapa** de la pantalla de inicio abre el **Generador** (**📦 Crear / Modificar un mapa**), que produce el archivo ZIP de un mapa.

#### 🧙 El Generador

- **🧙 Asistente**: el Generador avanza **paso a paso** (nombre, imagen, capas…). Los pasos opcionales se saltan con un clic (**⏭ Omitir**), y un **✅ Resumen antes de generar** muestra lo que está completo, omitido o falta, con avisos útiles (por ejemplo: sin georreferenciación GPS, ni Vista OSM ni exportación KMZ / GPX). **🗒️ Mostrar todo** muestra en cambio el formulario entero de una vez; tu elección se recuerda.
- **🚀 Simple / ⚙️ Avanzado**: el modo Simple se limita a lo esencial (imagen, nombre, versión, V2 — la imagen cortada en teselas, ver «🧱 Convertir a teselas V2» —, multinivel) y carga los iconos por defecto; el modo Avanzado da acceso a todas las opciones.
- **📂 Cargar un archivo** acepta un **ZIP de MyKTAMap** (para modificarlo), un **KMZ** o un **GPX** exportado por MyKTAMap (el GPX da un fondo en blanco calado automáticamente), una **exportación SIG** (`.geojson`, `.kml`) o un **GeoTIFF**. Si no, rellena el formulario para crear un mapa desde cero.

Cuando esté listo, **📦 Generar el ZIP** descarga el archivo.

#### 📄 Nuevo mapa

- **Información**: nombre, versión, autor, **🏷️ etiquetas** (separadas por comas, 12 como máximo). Viajan en el ZIP y se **proponen** a quien lo importa, sin sustituir las etiquetas que esa persona ya haya puesto.
- **Imagen principal** (obligatoria): sus dimensiones se leen automáticamente, con un aviso rojo por encima de 10 000 px de lado o de 30 MB.
- **Mapa de colisión** (opcional).
- **Posición de inicio del tracker**: centrada automáticamente en el mapa; **🎯 Recentrar la posición de inicio** la devuelve al centro.
- **Capas de imagen** (leyendas, anotaciones) y **capas de datos**: hasta 10 de cada. La capa **Añadidos** se incluye siempre.
- **Parámetros de tracking**: escala y orientación del **Norte** (0 si la parte superior del mapa es el Norte; cada uno puede corregirla en sus Ajustes).
- **Iconos y tags**: **↺ Cargar predeterminados** rellena los iconos estándar, **+ Añadir un tag** crea un tipo propio. Los tags `default` y `track` son obligatorios.
- **🏷️ Leyenda del mapa**: los renombrados, ocultamientos y entradas añadidas valen para todos los que abren el mapa; cada uno puede luego cambiarla para sí.
- **🌐 Georreferenciación GPS** (opcional): dos puntos A y B, más un punto C para un mapa deformado. Sin ella, ni Vista OSM ni exportación KMZ / GPX.
- **📖 PDF Historia** (opcional): uno o varios PDF, al principio de la lista en el Modo Historia. Al modificar, se conservan los del mapa.

#### 📂 Modificar un mapa existente

Carga el ZIP del mapa en **📂 Cargar un archivo**: el formulario se rellena con su configuración. Cambia lo que quieras (tags, iconos, capas, posición de inicio…) y luego **📦 Generar el ZIP**. Desde un mapa abierto, **⬆️ Exportar → 🔄 Actualizar el mapa** abre este modo ya rellenado con tus capas corregidas y tus dibujos.

Si el mapa tiene **fotos adjuntas a sus puntos** en tu dispositivo, la casilla **📸 Incluir las fotos adjuntas** (marcada por defecto) las incluye en el ZIP. Quien abra ese mapa encontrará las fotos en las ventanas de los puntos. Desmarcada, el ZIP es más ligero, sin fotos.

#### 🎨 Imagen en blanco

Para dibujar un mapa **sin imagen de origen**, elige **Imagen en blanco** en lugar de **Desde una imagen** en **🖼️ Imágenes principales**:

- **ancho** y **alto** de 500 a 12 000 px — en iPhone / iPad, 16 Mpx como máximo (unos 4096 × 4096), un fondo mayor se genera en un ordenador (tomados del mapa al recargar un ZIP: para hacer transparente el fondo de un mapa ya hecho, elige **🫥 transparente** y vuelve a generar);
- **color de fondo**: blanco, gris, negro, sepia o **🫥 transparente** (en la vista OSM se ve debajo el mapa de fondo; en modo mapa, el fondo elegido en los Ajustes);
- **🎨 Fondo recomendado** (opcional): el fondo mostrado bajo las partes transparentes en modo mapa — cada uno puede cambiarlo en ⚙️ Ajustes › Visualización;
- **🎨 Generar la imagen vacía** la instala como imagen principal.

Termina el formulario y genera el ZIP como de costumbre; después dibuja pilares, frentes, trazados y puntos con las herramientas del mapa.

> 💡 Ejemplo: en una cantera sin mapa en papel, un fondo negro de 4000 × 4000 px, completado a medida que exploras, con el tracker como referencia.

#### 📦 Recuperar las capas y fotos de otro mapa

En **📊 Capas de datos**, **📦 Elegir un ZIP datalayer…** importa de una vez las anotaciones de otra persona: puntos, trazados, zonas, estructuras y fotos. Ese ZIP se obtiene en **📤 Exportar → 🔄 Conversión → Sesión a data layer**, con la casilla 📸 de fotos marcada para incluirlas.

- Las capas se crean automáticamente; un mensaje verde da el detalle.
- En un mapa **existente**, tus capas se **conservan**: las del ZIP se añaden al lado sin sobrescribirlas nunca, y las fotos se fusionan.
- Genera el ZIP: al abrir el mapa, cada cual encontrará las fotos en las ventanas de los puntos.

#### 🗺️ Partir de un GeoTIFF

Si has georreferenciado tu mapa en **QGIS**, expórtalo en **GeoTIFF** (`.tif`): la imagen y su georreferenciación viajan en el mismo archivo. Elígelo como imagen del mapa, en el Generador o desde la pantalla de inicio: la app rellena la **georreferenciación GPS**, deduce la **escala** y la **extensión**, y convierte la imagen para lo que sigue. No hay nada que volver a introducir.

> ✅ **Aceptado**: compresión LZW, Deflate o ninguna · 8 bits por canal · gris, RGB o RGBA · imagen en bandas · norte arriba, sin rotación · Lambert 93, Web Mercator o WGS84.
>
> ❌ **Rechazado**, con un mensaje que dice qué cambiar en la exportación: BigTIFF, canales separados, paleta / CMYK / YCbCr, georreferenciación que deforma la imagen (estirada o cizallada; una imagen solo girada se acepta), otro sistema de coordenadas.

#### 🗺️ Convertir un archivo SIG (QGIS…)

Suelta tu exportación **en la zona «📦 Añadir un mapa» de la pantalla de inicio** o en el Generador: la app abre **🗺️ Convertir desde SIG**. Formatos: `.geojson`, `.json`, `.kml`, `.kmz`. Se recuperan puntos, trazados y zonas.

- **No hace falta imagen**: la app crea un fondo en blanco ajustado a las coordenadas del archivo. Podrás sustituirlo por una imagen real más adelante.
- **Se respetan tus denominaciones**: una pantalla de correspondencia te hace elegir la columna que lleva el tipo y luego a qué corresponde cada valor (`CANALISATION`, `galerie_tech`…). Los valores evidentes vienen rellenados, y cada uno puede apuntar a cualquier familia: un polígono puede ser una zona, un pilar, un muro o un frente de cantera.
- **Un nivel por planta**: si el archivo tiene una columna de nivel, elígela en «Columna del nivel». Una vista previa muestra el reparto, «Un color por nivel» da a cada planta su tono, y el botón 🏷️ renombra y recolorea los niveles. Todo lo que ajustes ahí se conserva en el mapa generado. Si la pantalla muestra «Leyenda restablecida», vuelve a abrir 🏷️ antes de generar.
- **Solo indicas el ancho**: el alto se calcula para que nada se desborde. A partir de cierto tamaño aparece un aviso, sin bloquear.

> 📐 **Coordenadas**: WGS84 (EPSG:4326) o **Lambert 93** (EPSG:2154, convertido automáticamente; un aviso te pide comprobar la posición obtenida). Cualquier otra proyección se rechaza, con los pasos a seguir: en QGIS, *Exportar → Guardar objetos como…*, SRC **EPSG:4326**.

A tener en cuenta: los huecos de los polígonos se ignoran; por encima de 20 000 objetos se muestra un aviso, y por encima de 60 000 la importación se rechaza (filtra tu capa en QGIS). Shapefile y GeoPackage no se leen: vuelve a exportar en GeoJSON.

> ⚠️ Un mapa creado desde un GPX o un SIG con una versión anterior de la app tiene una **escala errónea** y, por tanto, distancias erróneas: regenéralo desde el archivo original. Los mapas hechos a partir de una imagen no están afectados.

#### 🧱 Convertir a teselas V2

Para un mapa pesado (imagen de más de 50 MB o de más de 8000 px), la casilla **🧱 Convertir a teselas V2 (rendimiento)** corta la imagen en **teselas**: la app ya solo carga los trozos visibles, lo que reduce mucho la memoria utilizada.

1. Elige una imagen principal, o carga el ZIP del mapa que vas a convertir.
2. Márcala y lee el aviso: la conversión es pesada.
3. **📦 Generar el ZIP**: una barra de progreso sigue el corte (de 1 a 5 min). El ZIP descargado lleva el sufijo `_v2`.
4. Importa ese ZIP: el mapa se abre en V2 (distintivo violeta `V2`).

- Los **márgenes blancos** de un mapa escaneado se recortan automáticamente.
- Una imagen **PNG / WebP transparente** conserva su transparencia: en la Vista OSM, el mapa se ve a través de tu mapa. Para un mapa V2 generado antes de este tratamiento, regenéralo una vez para aprovecharlo.
- En un mapa **ya V2**, la casilla viene marcada y las teselas se rehacen; desmarcarla vuelve a convertir el mapa en una sola imagen.
- Inconvenientes: un ligero parpadeo al cambiar de nivel de zoom, y un borde negro al alejar mucho el zoom.

> 💻 **Haz la conversión en un ordenador.** En el teléfono, el navegador se queda sin memoria y falla casi con seguridad con una imagen grande. El ZIP V2 generado en el PC se abre luego sin esfuerzo en el móvil.

#### 📦 Importar varios mapas a la vez

En la sección **🧰 Herramientas** de la pantalla de inicio, **📦 Importar varios mapas** añade a tu lista tantos archivos ZIP como quieras, **sin abrir ninguno**.

1. **Elige** tus archivos.
2. **Revisa** lo que va a pasar, línea por línea: añadido, ya presente, rechazado (y por qué), con el peso total y el espacio restante.
3. **Lanza**: los mapas entran uno a uno y después se muestra un balance.

- **Mapa ya en tu lista**: una sola elección para todo el lote, dejarlo como está (por defecto), sustituirlo o conservar los dos.
- **📁 Guardar en:** elige la carpeta de «Mis mapas» que recibe el lote («Sin clasificar» por defecto).
- **💾 Memorizar los mapas en la app** (marcada por defecto, como el ajuste «Memorizar el mapa en la app en la primera carga»): la app guarda los archivos, y cada mapa se abre luego **sin volver a seleccionar su ZIP**. Desmarcada, no se copia nada y el ZIP se te pedirá la primera vez que abras cada mapa.
- **El espacio se comprueba antes**: si el lote no cabe, la importación no empieza y la app te dice cuánto falta. Si el espacio se agota por el camino, la importación se detiene en seco y conserva los mapas ya añadidos.

### 🚀 Optimizar tu mapa

Un mapa ligero carga más rápido, se recorre con más fluidez y **falla mucho menos en el móvil**. Los consejos siguientes van del más eficaz al menos eficaz.

#### 🖼️ La imagen principal

Es lo que más memoria consume.

| Lado más largo | Comportamiento |
|---|---|
| hasta 4000 px | ✅ Bien en todas partes |
| 4000 a 8000 px | ⚠️ Bien en ordenador, alejamiento limitado en el móvil |
| 8000 a 16 000 px | ⚠️ Posibles fallos en el móvil: convierte a teselas V2 |
| más allá | ❌ Fallo casi seguro en el móvil |

- **Redimensiona** una imagen gigante a 6000 - 8000 px de lado (GIMP, Photoshop, [Squoosh](https://squoosh.app/)): algo menos de detalle en el zoom máximo, mucha más estabilidad.
- **Formato**: JPEG con calidad 80 - 90 % para un escaneo o un mapa con degradados (a menudo de 5 a 10 veces más ligero que un PNG, sin diferencia visible); WebP, aún más ligero; PNG solo para la transparencia o colores mapas nítidos.

#### 🗂️ Capas, trazados y puntos

- **Capas de imagen**: cada una añade memoria, aunque esté oculta. Una sola es lo ideal; dos o tres de 2 MB como máximo siguen siendo aceptables. Mejor integra leyenda y referencias en la imagen principal.
- **Trazados**: a partir de unos cincuenta, desplazar el mapa puede ir más lento. Para una red muy grande, dibuja las galerías **directamente en la imagen** y deja la capa de trazados **oculta**: el itinerario la sigue usando.
- **Puntos**: a partir de unos cientos visibles a la vez, el dibujo se ralentiza en el móvil. Repártelos en varias capas de datos (pozos, pasos…) que cada cual pueda ocultar.

#### ✂️ Corte de la imagen

Una imagen muy grande se **corta en teselas** al cargarse para no saturar la memoria. El ajuste está en **ℹ️ Información** del mapa, línea **🖼️ Teselado de este mapa**, y solo aparece para un mapa **que no se ha convertido a V2** (un mapa V2 ya está cortado). Se memoriza para ese mapa.

| Opción | Efecto |
|---|---|
| **Auto** (por defecto) | Corta en cuanto la imagen supera 4096 × 4096 px o 60 MB. ✅ La opción correcta en casi todos los casos. |
| **Desactivado** | La imagen entera de una vez, calidad nativa en ordenador. ⚠️ Puede hacer fallar un teléfono con un mapa muy grande; un mensaje te avisa. |

#### 🚀 Modo Rendimiento ULTRA

Si un mapa grande sigue fallando o va lento, abre **⚙️ Ajustes** → **🚀 Rendimiento**. **🚀 Modo ULTRA (activa todo)** aligera todo lo que no es la imagen: trazados, puntos, cálculos. Este ajuste vale **solo para el mapa abierto**, en este dispositivo.

| Opción | Efecto | Contrapartida |
|---|---|---|
| 🪜 **Diezmar los trazados al alejar el zoom** | Simplifica los trazados vistos de lejos | Trazados menos suaves al alejar |
| ⚡ **Desactivar animaciones zoom/paneo** | Transiciones instantáneas | Hay que recargar |
| 🎯 **Desactivar círculos de intersecciones** | Sin círculos en los cruces a partir de 50 trazados (en lugar de 500) | Cruces menos visibles |
| 🚫 **Desactivar popups en capas de datos** | Sin ventana al hacer clic en los puntos de las capas de datos | Usa 🔍 Búsqueda |
| 🐢 **Autoguardado lento (30s)** | Guarda cada 30 s | Hasta 30 s perdidos si la app falla |
| 🛡️ **Limitar el alejamiento del zoom en móvil** | Limita el alejamiento en el teléfono. **Marcada por defecto** | Sin vista de conjunto completa en el móvil; hay que recargar |

- ULTRA lo marca todo; desmarcarlo lo desmarca todo. Además de las opciones anteriores, solo dibuja los trazados y puntos cercanos a la pantalla (ligero retardo de aparición al desplazar el mapa). También puedes activar solo algunas opciones, por ejemplo **🐢** para una buena ganancia sin pérdida visible.
- **Tus puntos de sesión se muestran siempre**, sean cuales sean las opciones.
- Cuando hay optimizaciones activas, un mensaje te lo recuerda al abrir el mapa: una visualización aligerada no es un error.
- En un mapa multinivel, **🏗️ Mostrar todos los niveles al iniciar** (mismo grupo, fuera de ULTRA, marcada por defecto) puede desmarcarse para abrir solo los niveles -1, 0 y +1.

#### 📱 En el móvil

- En iPhone, la app **instalada en la pantalla de inicio** aguanta mejor los mapas grandes que Safari; Android Chrome suele ser más tolerante que iOS.
- iOS puede cerrar la app sin avisar para recuperar memoria; la app te lo indica al reiniciarse. Durante un trabajo intenso de anotación, **exporta tu sesión** (📤 Exportar) cada cuarto de hora.
- Para diagnosticar un fallo, ver **🐛 Registros detallados** más abajo.

#### ✅ En resumen

- Imagen en **JPEG con calidad 85**, 8000 px de lado como máximo.
- Una o dos capas de imagen como máximo.
- Red grande: galerías **dibujadas en la imagen**, capa de trazados oculta para el itinerario.
- Puntos repartidos en unas pocas capas de datos.
- Mapa grande: **convertido a teselas V2**; dispositivo modesto: **🚀 ULTRA**.

### 📊 Editor de datos del mapa

**⬆️ Exportar → 📊 Editor de datos del mapa** (sección 💾 Sesión) en el mapa, o **📊 Editor de datos** en la pantalla de inicio, abre una tabla para **ver, modificar y exportar** los puntos, trazados, zonas y estructuras de un mapa.

#### 📂 Abrir

- **🗺️ Mapa actual**: las capas de datos del mapa abierto (no aparece desde la pantalla de inicio, donde no hay ningún mapa cargado).
- **📦 Importar un ZIP**: las capas de un mapa completo.
- **📄 Importar un archivo JSON**: un archivo de datos o de sesión.
- **🔄 Convertir sesión ↔ capas**: transforma tu sesión en **capa de datos** para integrarla en un mapa (ver «🏗️ Crear o modificar un mapa»). Misma elección por categoría y por icono; granularidad **Básico** (un archivo por categoría) o **Fino** (un archivo por tipo). El tracker nunca se convierte: una deriva fijada en un mapa engañaría a sus futuros usuarios. Una vez convertidos, esos datos ya no se modifican desde la app.
- **🔗 Fusionar capas**: reúne varias capas de datos (`.json` o `.zip`, de varias sesiones) en un solo juego por categoría. Una vista previa da los totales y señala los identificadores de puntos duplicados (se conservan tal cual).
- **🔁 Recalar datos sobre otro escaneo**: pasa tus archivos de datos de un escaneo a otro escaneo del mismo mapa (recortado, más grande, más pequeño). **Abre primero el mapa de destino** y elige tus archivos `.json`:
  - **Por nombres e identificadores** (lo más seguro, elegido por defecto): si las dos versiones salen del mismo Generador, los objetos que conservan el mismo identificador interno sirven primero de referencias (puntos, y vértices de trazados, zonas y estructuras que conservan su número de vértices); luego los puntos con el mismo nombre en tus archivos y en el mapa abierto sirven de referencias (se ignoran mayúsculas, acentos y puntuación; nombres únicos de al menos 4 caracteres). La app calcula la escala, la rotación y el desplazamiento, descarta los homónimos que no encajan e indica la calidad («73 referencias, desviación mediana 0 px, 90 % por debajo de 1 px»). Las referencias salen primero de las **capas del plano** (los datos del ZIP); tu sesión solo se usa si las capas dan menos de tres, y sus objetos que siguen en la misma posición que en tu archivo (una copia sin convertir, importada antes) se ignoran. El aviso dice de dónde vienen las referencias, con la escala y la rotación encontradas. Si la mayoría de las referencias están en la misma posición que en tu archivo, la app te avisa (archivo ya en este marco, o copia sin convertir) y propone descartarlas. Si el escaneo está estirado, propone una transformación afín.
  - **Referencias pulsadas** (cuando los nombres no bastan): elige un punto de tu archivo en la lista y pulsa su posición en el mapa; al menos tres referencias, alejadas entre sí. Se muestra la desviación de cada una: un mal clic aparece en rojo y queda fuera del cálculo.
  - **Resoluciones** (último recurso): solo si los dos escaneos tienen exactamente el mismo encuadre. Si sus proporciones difieren en más de un 2 %, la app se niega: hacen falta nombres o referencias.
  - **👁️ Vista previa en el mapa**: tus datos recalados se dibujan en discontinuo sobre el mapa antes de descargar; la vista previa desaparece al cerrar la herramienta. Luego obtienes archivos `_conv.json`.
  - Desde la pantalla de inicio (ningún mapa abierto), solo están disponibles las resoluciones y las referencias escritas a mano. Los enlaces entre mapas, la georreferenciación y la escala hay que rehacerlos en el mapa nuevo.
- **🧹 Desduplicar los datos**: elimina los vértices idénticos consecutivos de trazados, zonas, estructuras y medidas, invisibles pero que hacen más pesados los archivos. Obtienes un archivo `_dedup.json` y el recuento de lo eliminado; los puntos nunca se tocan.

Si la fuente contiene varios conjuntos de datos, un selector te deja elegir.

#### ✏️ Modificar

- **Haz clic en una celda** para modificarla (salvo el identificador). **Tab**: celda siguiente · **Intro**: fila siguiente · **Esc**: cancelar.
- Una coordenada fuera del mapa se pone en **rojo**.
- La celda **Tags** abre un selector con vista previa de los iconos; puedes crear un tag desde ahí.
- En trazados, zonas y estructuras se pueden modificar la **nota**, el **tipo** y el **nivel**, pero no la **geometría**: vuelve a dibujarla en el mapa. Un tipo ausente de la leyenda se pone en **rojo**.
- En un mapa **multinivel**, la columna **level** siempre está (0 si el objeto aún no tiene nivel) y se elige en una lista de los niveles del mapa.
- En los puntos: búsqueda en todas las columnas, orden con clic en el encabezado, selección múltiple (casilla + Mayús+clic), **+ Añadir fila**, **📋 Duplicar**, **🗑️ Eliminar**, **📍 Ver en el mapa**.

#### 💾 Guardar

| Lo que editas | **💾 Guardar** |
|---|---|
| **Datos del mapa** | Descarga el archivo `.json` modificado. Para aplicarlo, vuelve a importarlo en el **Generador**: el editor nunca cambia el mapa mostrado. |
| **Tu sesión** | Descarga el archivo, o lo aplica al momento con **✏️ Aplicar a la sesión actual** (puntos, trazados, zonas y estructuras): solo se aplican las celdas que has modificado, una fila no tocada no cambia nada aunque el archivo sea antiguo; un cambio de tipo o de nivel funciona como desde la ficha del objeto; una fila quitada de la tabla se elimina de la sesión; un objeto eliminado desde la exportación no se vuelve a crear, salvo si has modificado su fila. Un tipo ausente de la leyenda se rechaza, con el número de la fila. **⏪** deshace toda la operación de una vez. En un mapa compartido por una instalación, quitar objetos exige el permiso de eliminarlos para todos, y una confirmación. |

Si cierras con cambios sin guardar, la app te propone guardar, salir sin guardar o seguir editando.

### 🖥️ Alojar la app en tu servidor

Para instalar MyKTAMap en tu propia máquina (PC, Raspberry Pi, NAS, servidor de un club) y servirla en tu red local.

#### 🐳 Con Docker

```bash
docker run -d --name myktamap -p 8443:8443 ghcr.io/karmakta91/myktamap:latest
```

Abre después **`https://localhost:8443/`**. El navegador avisa de un **certificado no reconocido** (la imagen genera uno al arrancar): acéptalo mediante **«Configuración avanzada» → «Continuar»**, y luego recarga la página para que la app funcione sin conexión.

Si el puerto `8443` ya está ocupado en tu máquina, cambia la parte izquierda: `-p 9443:8443`. Las actualizaciones no son automáticas: tú decides cuándo descargar la nueva imagen.

La imagen sirve exactamente la misma app que el sitio oficial, desde tu propio equipo; no se envía nada a ningún otro sitio.

> 📖 Instalar Docker, conservar tus mapas entre reinicios, usar tu propio certificado o un nombre de dominio local, actualizar, resolver los errores habituales: todo está en la guía **[`docs/applications/DOCKER_INSTALL.md`](DOCKER_INSTALL.md)**.

#### 🗂️ Ofrecer los mapas del servidor

Si tu servidor aloja mapas en `data/` (por ejemplo `data/test1/`, `data/test2/`), un archivo `data/index.json` hace que aparezcan automáticamente en **Mis mapas**, marcados como «descubierto», listos para cargarse con un clic:

```json
{
  "plans": [
    { "id": "test1", "path": "data/test1", "name": "Plan Test 1", "version": "V1" },
    { "id": "test2", "path": "data/test2", "name": "Plan Test 2", "version": "V1" }
  ]
}
```

La forma corta `{ "plans": ["test1", "test2"] }` también funciona; la forma detallada muestra los nombres de inmediato.

Más sencillo aún: deja el ZIP del mapa tal cual (sin descomprimirlo) y decláralo con `"zip"` en lugar de `"path"`, por ejemplo `{ "id": "test3", "zip": "data/test3.zip", "name": "Mapa de prueba 3" }`. La app lo descarga al abrirlo, lo guarda en el dispositivo para usarlo sin conexión (según **Memorizar el mapa en la app**) y solo vuelve a descargarlo si ha cambiado. En la fila del mapa, 💾 lo guarda sin abrirlo y ✅ indica que está guardado y al día.

> 📖 Subtítulo de tu instancia, etiquetas de mapas, contraseña de acceso propia, modo «consulta» (importación y Generador ocultos), enlaces entre mapas: la página `confadmin.html` de tu instancia fabrica este archivo por ti — instrucciones en la guía **[Alojar una instancia con sus mapas](SELFHOST.md)** (en francés).

### 💼 Edición pro

La edición pro la instala **la persona que gestiona tu instalación**: coloca la licencia en el servidor, no tienes nada que hacer. Tu perfil muestra entonces ✓ Edición pro activa, y la pantalla de arranque «Edición profesional». La aplicación ya no propone importar una licencia por tu cuenta: una licencia importada en un dispositivo no activaba ninguna función pro.

Una licencia está **firmada por el autor** y se emite para una dirección y un periodo. Si caduca, o si el servidor la rechaza, la aplicación **permanece cerrada** en la pantalla «Licencia de la instalación no válida», nunca reabierta en modo comunitario: avisa a la persona que gestiona la instalación (el enlace **💼 Descubrir o renovar la licencia pro** de esta pantalla presenta la licencia). Lo que se guarda en el dispositivo no se borra.

> ⚖️ La licencia es **nominativa**: compartirla con un tercero no autorizado infringe el contrato firmado con el autor.
### 🛡️ Mapas revocados

Cuando un mapa se ha difundido fuera de su grupo de confianza (foro, red social pública…), su autor puede **revocarlo**: la app se niega entonces a abrirlo, para todo el mundo.

- **Al importar un mapa revocado**, aparece una ventana roja **⛔ Mapa revocado** con el motivo y la fecha. El mapa no se abre: pulsa **Entendido, eliminar este mapa** para quitarlo de tu lista.
- **Si un mapa que ya está en tu lista se revoca más tarde**, la app lo retira en el siguiente inicio y una ventana naranja te lo indica (nombre, motivo, fecha); pulsa **Entendido**.

No hay nada más que hacer.

> 🔒 La app descarga la lista pública de mapas revocados y la compara **en tu dispositivo**: nadie sabe qué mapas tienes. Sin conexión, se aplica la última lista conocida.

### 🐛 Registros detallados

En **⚙️ Configuración** de la pantalla de inicio → **🛠️ Modo Desarrollador** (protegido por contraseña), **🐛 Registros detallados** añade información en la consola del navegador (sensores del tracker, corte de la imagen). Útil para informar de un problema. Desactivado por defecto. El modo desarrollador contiene también **🔧 Ver el estado de la caché (Service Worker)**: el detalle, archivo por archivo, de lo que resume la pastilla sin conexión.

### 📖 Toda la documentación en línea

Esta guía, y todo lo que la rodea, también se puede leer en **[doc.myktamap.fr](https://doc.myktamap.fr/)** (sobre todo en francés): instalar tu propia copia (con o sin Docker), entender lo que la aplicación envía por la red, la seguridad y las claves de la edición pro, y cómo se comprueba cada versión antes de llegar a ti.

---

*MyKTAMap — Guía de usuario*
*Estos lugares son frágiles. La discreción es una forma de respeto.*
