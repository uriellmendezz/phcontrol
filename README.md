# phcontrol

PWA de gestión para el mantenimiento de piletas (zona norte de Córdoba). Funciona sin conexión,
guarda todo primero en el iPhone y sincroniza con una Google Sheet privada a través de Apps Script.

- **Costo cero:** HTML + CSS + JavaScript (ES modules), sin build. Hosting en GitHub Pages.
- **Datos:** Google Sheets (privada) + Google Drive (fotos, privada) vía Apps Script Web App.
- **Clima:** Open-Meteo (sin API key).
- **Librerías:** Chart.js 4.4.1 y html-to-image 1.11.11 desde jsDelivr (versión fija; el Service Worker las deja offline).

---

## 1. Estructura

```
phcontrol/
├── index.html                 Shell de la app (meta iOS, splash, header, tabbar)
├── manifest.webmanifest       PWA (start_url y scope relativos → funciona en /phcontrol/)
├── sw.js                      Service Worker (precache + offline). Subí VERSION en cada deploy
├── .nojekyll                  Evita que GitHub Pages procese el sitio con Jekyll
├── .gitignore                 Excluye tu material privado del repo público
├── apps-script/
│   ├── Code.gs                API sobre la hoja (pegar en Apps Script)
│   └── appsscript.json        Manifiesto del script (zona horaria, permisos)
├── assets/
│   ├── logo/                  main-logo.png (original), logo-white.png, logo-navy.png (recortes)
│   ├── icons/                 180, 192, 512 y maskable (generados del logo)
│   ├── splash/                Pantallas de inicio iOS
│   ├── img/ondas.svg          Patrón de agua (inicio y tarjeta exportable)
│   └── fonts/                 Hurme / Outfit (ver assets/fonts/LEEME.md)
├── css/
│   ├── tokens.css             ← Marca: colores, tipografía, espaciados (cambiar paleta acá)
│   ├── base.css               Reset, layout, header, tabbar, safe areas
│   ├── components.css         Botones, tarjetas, formularios, hojas, skeletons…
│   └── views.css              Estilos por pantalla y tarjeta exportable
├── data/teorico.json          ← Contenido del Teórico (editable sin tocar código)
└── js/
    ├── app.js                 Arranque
    ├── router.js              Hash routing (#/inicio, #/clientes/:id…)
    ├── data/                  IndexedDB, cola de sync, API, fotos, ajustes, borradores
    ├── domain/                Química, agenda, estadísticas, clima, alertas
    ├── ui/                    Plantillas seguras, íconos, modales, toasts, gráficos, tarjeta
    ├── util/                  Formatos AR, geolocalización, CSV, markdown, carga de librerías
    └── views/                 Una pantalla por archivo
```

---

## 2. Configurar Google (hoja + Apps Script) — paso a paso

### 2.1 Crear la hoja
1. Entrá a https://sheets.new con tu cuenta de Google. Nombrala **phcontrol**.
2. No hace falta crear pestañas: el script las crea solo (Clientes, Piletas, Visitas, Agenda, Stock, Ventas, Compras, Config).
3. La hoja queda **privada**. No la compartas.

### 2.2 Pegar el script
1. En la hoja: **Extensiones → Apps Script**. (Tiene que ser desde la hoja: el script queda "vinculado").
2. Borrá el contenido de `Código.gs` y pegá **todo** `apps-script/Code.gs`.
3. Engranaje **Configuración del proyecto** → tildá *"Mostrar el archivo de manifiesto appsscript.json en el editor"*.
   Volvé al editor, abrí `appsscript.json` y reemplazalo por el de `apps-script/appsscript.json`.
4. Guardá (Ctrl/Cmd + S).

### 2.3 Crear el token secreto
1. Generá un token largo y aleatorio. Opción simple: en el editor de Apps Script creá una función temporal
   `function t(){ Logger.log(Utilities.getUuid() + Utilities.getUuid()); }`, ejecutala y copiá el resultado del registro. Después borrá la función.
2. **Configuración del proyecto → Propiedades del script → Agregar propiedad**:
   - Propiedad: `TOKEN`
   - Valor: el token que generaste
3. Guardalo también en tu gestor de contraseñas. **Nunca** lo pongas en el código ni en el repo.

### 2.4 Inicializar y autorizar
1. En el editor, elegí la función **`inicializar`** y tocá **Ejecutar**.
2. Google pide permisos (hoja actual y Drive). Como el script es tuyo, aparece "Google no verificó esta app":
   **Configuración avanzada → Ir a phcontrol (no seguro) → Permitir**.
3. En el registro vas a ver las pestañas creadas y el enlace a la carpeta **phcontrol-fotos** en tu Drive (privada).

### 2.5 Desplegar como Web App
1. **Implementar → Nueva implementación** → tipo **Aplicación web**.
2. *Ejecutar como:* **Yo**. *Quién tiene acceso:* **Cualquier persona**.
   (Es necesario para que la PWA pueda llamarlo sin login de Google. La seguridad la da el token: sin token, el script rechaza todo.)
3. **Implementar** → copiá la **URL de la aplicación web** (termina en `/exec`).
4. Si después cambiás `Code.gs`: **Implementar → Administrar implementaciones → Editar (lápiz) → Versión: Nueva versión → Implementar**. Así la URL no cambia.

### 2.6 Conectar la PWA
1. Abrí la app → **Más → Ajustes → Conexión con Google Sheets**.
2. Pegá la URL `/exec` y el token → **Probar** → **Guardar conexión**.
3. El indicador del header pasa a **Sincronizado**. La URL y el token quedan solo en el teléfono.

### ¿Por qué `Content-Type: text/plain`? (CORS)
Apps Script no responde a las peticiones `OPTIONS` (preflight de CORS). Un `POST` con `Content-Type: application/json`
dispararía ese preflight y fallaría. Con `text/plain` el navegador lo considera una *simple request*: no hay preflight,
el cuerpo igual es JSON, Apps Script responde con un redirect 302 a `script.googleusercontent.com` y esa respuesta trae
`Access-Control-Allow-Origin: *`. Por eso también se envía con `credentials: 'omit'`. Todo está en `js/data/api.js`.

### Fotos
Se comprimen en el iPhone (máx. 1280 px, JPEG 0,7), se guardan en IndexedDB y al sincronizar se suben a la carpeta
privada **phcontrol-fotos** de tu Drive. En la hoja solo queda el ID del archivo. Para verlas desde otro dispositivo,
la app las pide al script (con token) y las cachea; la carpeta nunca se hace pública.

---

## 3. Sincronización, offline y conflictos

- **Toda escritura** va primero a IndexedDB y a una **cola** (en la misma transacción). La cola se procesa al guardar,
  al volver la conexión, al volver a la app y cada 60 s si hay pendientes; con errores reintenta con espera creciente (30 s → 5 min).
- **Indicador** en el header: *Sincronizado / Pendiente (N) / Sin conexión / Error / Sin conectar*. Tocalo para sincronizar o ver el detalle.
- **Conflictos: gana el último en escribir**, comparando `actualizado_en`. El servidor descarta un registro más viejo que el
  suyo y devuelve el suyo; al bajar cambios, un registro remoto nunca pisa uno local que todavía está en la cola.
- **Borrados**: son lógicos (`eliminado = TRUE`) para que viajen a la hoja y a otros dispositivos.
- **Edición manual de la hoja**: el trigger `onEdit` actualiza `actualizado_en` y `servidor_en`, así la app baja el cambio.
- **Borradores**: los formularios (visita, cliente, pileta, agenda) se guardan mientras escribís y se recuperan si se cierra la app.
- **iOS** puede borrar el almacenamiento de una PWA poco usada: la app pide almacenamiento persistente, avisa antes de cerrar
  con cambios pendientes y en Ajustes muestra la cola. Lo sincronizado vive en Sheets.

---

## 4. Probar localmente

Necesitás un servidor estático (los ES modules no funcionan con `file://`). Desde la carpeta del proyecto:

```bash
python -m http.server 8080
```

Abrí http://localhost:8080. En `localhost` el Service Worker **no se registra** (para no cachear código mientras editás).
Para probar el modo offline agregá `?sw=1`: http://localhost:8080/?sw=1 — después apagá el servidor y recargá.

Para probar en el iPhone dentro de tu Wi-Fi: `python -m http.server 8080 --bind 0.0.0.0` y abrí `http://IP-de-tu-PC:8080`
(sin HTTPS no hay cámara/geolocalización completas ni instalación: para eso usá GitHub Pages).

---

## 5. Publicar en GitHub Pages

1. Creá un repositorio llamado **phcontrol** en GitHub (puede ser público; el `.gitignore` deja afuera tu material de trabajo).
2. Desde la carpeta del proyecto:

```bash
git init -b main
```

```bash
git add .
```

```bash
git commit -m "phcontrol v1"
```

```bash
git remote add origin https://github.com/TU-USUARIO/phcontrol.git
```

```bash
git push -u origin main
```

3. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main / (root) → Save**.
4. En 1–2 minutos queda en `https://TU-USUARIO.github.io/phcontrol/`.
5. **Cada vez que publiques cambios**, subí `VERSION` en `sw.js` (por ejemplo `v1.0.1`). La app muestra "Hay una versión nueva → Actualizar".

Antes del primer push, revisá con `git status` que **no** aparezcan `Entregas/`, `fuentes_contexto/`, `imagenes pileteas/`, `.af`, etc.

---

## 6. Checklist de pruebas en iPhone

**Instalación**
- [ ] Safari → `https://TU-USUARIO.github.io/phcontrol/` → Compartir → **Añadir a pantalla de inicio**.
- [ ] El ícono es el logo sobre azul `#0084B9` y el nombre "phcontrol".
- [ ] Al abrir se ve la pantalla de inicio azul con el logo y luego la app a pantalla completa (sin barra de Safari).

**Safe areas y layout**
- [ ] El header no queda debajo de la Dynamic Island / notch; la barra inferior no tapa el indicador de inicio.
- [ ] Girar no rompe nada (la app está pensada en vertical). No hay scroll horizontal en ninguna pantalla.
- [ ] Modo oscuro del iPhone → la app cambia a fondo Navy.

**Teclado**
- [ ] En "Registrar visita", tocar pH/cloro/monto abre teclado numérico, **sin zoom** automático.
- [ ] El campo enfocado queda visible; la barra inferior se esconde con el teclado abierto.

**Cámara y fotos**
- [ ] "Foto antes / después" abre la cámara trasera; la vista previa aparece al instante.
- [ ] Guardar con señal: el indicador pasa por "Sincronizando…" y la foto aparece en Drive → phcontrol-fotos.

**Offline**
- [ ] Modo avión → abrir la app desde el ícono: abre y navega todas las secciones (incluido Teórico).
- [ ] Registrar una visita con fotos en modo avión: el indicador dice "Sin conexión · 1".
- [ ] Quitar modo avión: en segundos pasa a "Sincronizado" y la fila aparece en la hoja.

**Compartir por WhatsApp**
- [ ] En una visita → **Enviar reporte** → aparece la tarjeta → **Compartir** → WhatsApp → elegir contacto. Llega como imagen.
- [ ] "Texto" abre WhatsApp con el resumen escrito para el número del cliente.

**Ubicación y mapas**
- [ ] En un cliente: "Usar mi ubicación actual" pide permiso y guarda coordenadas.
- [ ] "Ir" abre Google Maps con la ruta; "Llamar" abre el teléfono; "WhatsApp" abre el chat.

**Calendario**
- [ ] Deslizar a izquierda/derecha cambia de semana/día/mes de forma fluida. Tocar un horario vacío agenda.

---

## 7. Supuestos que tomé

- **Teléfonos**: se guardan como "351 1234567"; para WhatsApp se convierten a `549` + área + número (se quita 0 y 15).
- **"Cliente sin visitar"**: por defecto, más de **8 días** sin visita y sin turno futuro (editable en Ajustes).
- **Lluvia**: aviso desde **60 %** de probabilidad (editable). Pronóstico de 7 días, cacheado 1 h.
- **Temporada**: 1/10 al 31/3. El selector "Temporada" del Inicio compara con la temporada anterior.
- **Ingresos**: se cuenta lo **cobrado** (visitas "pagado" y ventas no pendientes). Las deudas se muestran aparte.
- **Abono mensual**: un cliente con abono registra visitas como "Sin cargo / abono"; el cobro del abono se puede cargar como una visita con monto. (No hay facturación automática mensual.)
- **Recurrencia**: las visitas recurrentes se guardan como filas concretas (una por fecha) con `serie_id`, hasta la fecha que elijas (por defecto 12 semanas o fin de temporada).
- **Pestaña extra `Compras`**: registra las reposiciones de stock (fecha, producto, cantidad, costo).
- **Calculadora**: el único dato fijo es la equivalencia de unidades **1 ppm = 1 g/m³**. Con productos líquidos y concentración en "%", se interpreta % p/v (g cada 100 mL). El objetivo por defecto es el punto medio del rango. El cloro objetivo del shock y las esperas quedan vacíos hasta que los cargues.
- **Productos sugeridos**: se crean en Stock solo si tocás "Cargar productos sugeridos", con cantidad 0 y sin concentraciones.
- **Lista de compras**: sugiere reponer hasta el doble del umbral mínimo.
- **Teórico**: contenido cualitativo (síntomas, causas, pasos, precauciones). No incluye dosis: remite a la calculadora con tus etiquetas. Los únicos números son los rangos de la sección 6.7.

## 8. Limitaciones conocidas

- **No probé el Apps Script contra tu cuenta** (necesita tu Google). Sí probé la app completa en local: alta de cliente con pileta y coordenadas, agenda semanal con detección de solapamiento, calculadora, registro desde la calculadora con descuento de stock, borrado con devolución de stock, tarjeta exportable (1080 px) y apertura offline con el servidor apagado.
- **Compartir archivos** (`navigator.share` con imagen) funciona en Safari iOS 15+; en navegadores de escritorio que no lo soportan aparece solo "Descargar".
- **Enlaces cortos de Maps** (`maps.app.goo.gl`) no se pueden resolver desde el navegador: abrilos y pegá el enlace largo.
- Apps Script tiene cuotas diarias gratuitas (sobradas para un solo usuario) y cada llamada tarda 1–3 s.
- El borrado de una visita devuelve los productos al stock; editar un producto de Stock no recalcula visitas pasadas.
- Si editás la hoja a mano, respetá los formatos: fechas `AAAA-MM-DD`, horas `HH:MM`, decimales con punto.

## 9. Próximos pasos opcionales

- Generar el reporte también en PDF.
- Cobro de abonos mensuales automático (una fila por mes y cliente).
- Ruta optimizada del día (orden de visitas por cercanía).
- Recordatorio por WhatsApp al cliente el día anterior (enlace prellenado desde la agenda).
- Exportar el backup como un único archivo `.zip`.
