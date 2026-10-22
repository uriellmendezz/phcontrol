/**
 * phcontrol — API mínima sobre Google Sheets (Apps Script Web App).
 *
 * Todas las llamadas son POST con cuerpo JSON enviado como text/plain:
 *   { "token": "...", "action": "ping|pull|push|uploadPhoto|getPhoto|setup", ... }
 *
 * ¿Por qué text/plain? Apps Script no responde a las peticiones OPTIONS (preflight CORS).
 * Un POST con Content-Type text/plain es una "simple request" para el navegador: no dispara
 * preflight, y la respuesta de ContentService (después del redirect 302 a
 * script.googleusercontent.com) llega con Access-Control-Allow-Origin: *.
 *
 * Seguridad:
 *  - La hoja y la carpeta de Drive quedan privadas (el script corre como vos).
 *  - El token vive en Propiedades del script (clave TOKEN), nunca en el código.
 *
 * Conflictos: "el último en escribir gana" comparando `actualizado_en` (ISO 8601).
 * Si llega un registro más viejo que el guardado, se ignora y se devuelve el del servidor.
 * `servidor_en` lo pone siempre el servidor y sirve de cursor para el pull incremental.
 */

var SCHEMA = {
  Clientes: {
    nombre: { type: 'string', required: true, max: 120 },
    apellido: { type: 'string', max: 120 },
    telefono: { type: 'string', max: 40 },
    email: { type: 'string', max: 160 },
    direccion: { type: 'string', max: 240 },
    barrio: { type: 'string', max: 120 },
    lat: { type: 'number', min: -90, max: 90 },
    lng: { type: 'number', min: -180, max: 180 },
    notas: { type: 'string', max: 4000 },
    tarifa_tipo: { type: 'enum', values: ['visita', 'abono', ''] },
    tarifa_monto: { type: 'number', min: 0 },
    estado: { type: 'enum', values: ['activo', 'inactivo', 'borrador'], required: true }
  },
  Piletas: {
    cliente_id: { type: 'string', required: true },
    nombre: { type: 'string', max: 120 },
    m3: { type: 'number', min: 0, max: 10000 },
    largo: { type: 'number', min: 0, max: 200 },
    ancho: { type: 'number', min: 0, max: 200 },
    profundidad: { type: 'number', min: 0, max: 20 },
    forma: { type: 'string', max: 80 },
    material: { type: 'string', max: 80 },
    bomba_tiene: { type: 'enum', values: ['si', 'no', ''] },
    bomba: { type: 'string', max: 160 },
    filtro_tiene: { type: 'enum', values: ['si', 'no', ''] },
    filtro: { type: 'string', max: 160 },
    filtro_arena: { type: 'string', max: 120 },
    cloracion: { type: 'string', max: 160 },
    foto: { type: 'string', max: 200 },
    notas: { type: 'string', max: 4000 }
  },
  Visitas: {
    cliente_id: { type: 'string', required: true },
    pileta_id: { type: 'string' },
    agenda_id: { type: 'string' },
    fecha: { type: 'date', required: true },
    hora: { type: 'time' },
    ph: { type: 'number', min: 0, max: 14 },
    cloro: { type: 'number', min: 0, max: 50 },
    alcalinidad: { type: 'number', min: 0, max: 1000 },
    estabilizante: { type: 'number', min: 0, max: 1000 },
    productos: { type: 'json', max: 20000 },
    foto_antes: { type: 'string', max: 200 },
    foto_despues: { type: 'string', max: 200 },
    observaciones: { type: 'string', max: 4000 },
    monto: { type: 'number', min: 0 },
    estado_pago: { type: 'enum', values: ['pagado', 'pendiente', 'sin_cargo'] }
  },
  Agenda: {
    cliente_id: { type: 'string', required: true },
    pileta_id: { type: 'string' },
    serie_id: { type: 'string' },
    visita_id: { type: 'string' },
    fecha: { type: 'date', required: true },
    hora: { type: 'time', required: true },
    duracion: { type: 'number', min: 5, max: 600 },
    recurrencia: { type: 'enum', values: ['unica', 'semanal', 'quincenal', 'mensual'] },
    estado: { type: 'enum', values: ['pendiente', 'hecha', 'cancelada', 'reprogramada'], required: true },
    notas: { type: 'string', max: 2000 }
  },
  Stock: {
    producto: { type: 'string', required: true, max: 120 },
    tipo: { type: 'string', max: 40 },
    unidad: { type: 'string', max: 20 },
    cantidad: { type: 'number' },
    umbral: { type: 'number', min: 0 },
    costo: { type: 'number', min: 0 },
    precio: { type: 'number', min: 0 },
    modo: { type: 'string', max: 30 },
    parametro: { type: 'string', max: 30 },
    sentido: { type: 'string', max: 10 },
    conc_valor: { type: 'number', min: 0 },
    conc_unidad: { type: 'string', max: 10 },
    dosis_cant: { type: 'number', min: 0 },
    dosis_m3: { type: 'number', min: 0 },
    dosis_efecto: { type: 'number', min: 0 },
    dosis_choque: { type: 'number', min: 0 },
    notas: { type: 'string', max: 2000 }
  },
  Ventas: {
    fecha: { type: 'date', required: true },
    cliente_id: { type: 'string' },
    producto_id: { type: 'string' },
    producto: { type: 'string', required: true, max: 120 },
    cantidad: { type: 'number', min: 0 },
    monto: { type: 'number', min: 0 },
    estado_pago: { type: 'enum', values: ['pagado', 'pendiente'] }
  },
  Compras: {
    fecha: { type: 'date', required: true },
    producto_id: { type: 'string', required: true },
    producto: { type: 'string', max: 120 },
    cantidad: { type: 'number', min: 0 },
    costo_total: { type: 'number', min: 0 }
  },
  Config: {
    valor: { type: 'json', max: 45000 }
  }
};

var META = ['id', 'creado_en', 'actualizado_en', 'servidor_en', 'eliminado'];
var PHOTO_FOLDER_NAME = 'phcontrol-fotos';

/* ---------------- Entradas HTTP ---------------- */

function doGet() {
  return json_({ ok: true, app: 'phcontrol', msg: 'Usá POST con token.' });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'JSON inválido' });
  }
  try {
    // Ingreso con usuario y contraseña: única acción que no necesita token.
    if (req.action === 'login') return json_(login_(req));
    checkToken_(req.token);
    switch (req.action) {
      case 'logout': return json_(logout_(req.token));
      case 'ping': return json_({ ok: true, now: nowIso_() });
      case 'setup': return json_({ ok: true, sheets: setup_() });
      case 'pull': return json_(pull_(req.since));
      case 'push': return json_(push_(req.ops));
      case 'uploadPhoto': return json_(uploadPhoto_(req));
      case 'getPhoto': return json_(getPhoto_(req.fileId));
      default: throw new Error('Acción desconocida: ' + req.action);
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/** Trigger simple: si editás a mano la hoja, actualiza las marcas de tiempo de la fila. */
function onEdit(e) {
  try {
    var sh = e.range.getSheet();
    if (!SCHEMA[sh.getName()] || e.range.getRow() === 1) return;
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var now = nowIso_();
    var colAct = headers.indexOf('actualizado_en') + 1;
    var colSrv = headers.indexOf('servidor_en') + 1;
    for (var r = e.range.getRow(); r <= e.range.getLastRow(); r++) {
      if (colAct) sh.getRange(r, colAct).setValue(now);
      if (colSrv) sh.getRange(r, colSrv).setValue(now);
    }
  } catch (err) { /* nunca romper la edición manual */ }
}

/* ---------------- Acciones ---------------- */

/** Acepta el token maestro (secreto.gs / Propiedades) o una sesión iniciada con usuario y contraseña. */
function checkToken_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('TOKEN') ||
    (typeof TOKEN_INICIAL === 'string' && TOKEN_INICIAL.length >= 16 ? TOKEN_INICIAL : '');
  if (token && expected && token === expected) return;
  if (token && sessionValid_(token)) return;
  throw new Error('Sesión vencida o inválida. Volvé a ingresar.');
}

/* ---------------- Usuario y sesiones ---------------- */

var SESSION_DAYS = 365;
var MAX_FAILS = 5;

function hash_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function passwordHash_(password, salt) {
  var h = salt + ':' + password;
  for (var i = 0; i < 2000; i++) h = hash_(salt + h); // estiramiento: hace caro probar contraseñas
  return h;
}

function sessions_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('SESIONES') || '{}'); } catch (e) { return {}; }
}
function saveSessions_(s) {
  var now = Date.now();
  Object.keys(s).forEach(function (k) { if (s[k].exp < now) delete s[k]; });
  PropertiesService.getScriptProperties().setProperty('SESIONES', JSON.stringify(s));
}
function sessionValid_(token) {
  var s = sessions_()[hash_(token)];
  return !!(s && s.exp > Date.now());
}

/** Usuario inicial (secreto.gs): se crea solo si todavía no hay uno creado desde el menú de la hoja. */
function usuarioInicial_(props) {
  if (props.getProperty('USUARIO') || typeof USUARIO_INICIAL !== 'string' || typeof PASSWORD_INICIAL !== 'string') return false;
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(USUARIO_INICIAL) || PASSWORD_INICIAL.length < 8) return false;
  var salt = Utilities.getUuid();
  props.setProperties({ USUARIO: USUARIO_INICIAL, PASS_SALT: salt, PASS_HASH: passwordHash_(PASSWORD_INICIAL, salt), SESIONES: '{}' });
  return true;
}

function login_(req) {
  var props = PropertiesService.getScriptProperties();
  usuarioInicial_(props);
  var user = props.getProperty('USUARIO');
  if (!user) throw new Error('Todavía no creaste tu usuario. Abrí la hoja phcontrol → menú phcontrol → Crear o cambiar usuario.');
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('login_fails') || 0);
  if (fails >= MAX_FAILS) throw new Error('Demasiados intentos fallidos. Esperá 15 minutos.');
  var ok = String(req.usuario || '').trim().toLowerCase() === user.toLowerCase() &&
    passwordHash_(String(req.password || ''), props.getProperty('PASS_SALT')) === props.getProperty('PASS_HASH');
  if (!ok) {
    cache.put('login_fails', String(fails + 1), 15 * 60);
    Utilities.sleep(800);
    throw new Error('Usuario o contraseña incorrectos.');
  }
  cache.remove('login_fails');
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var s = sessions_();
    s[hash_(token)] = { exp: Date.now() + SESSION_DAYS * 864e5, disp: String(req.dispositivo || '').slice(0, 80), creado: nowIso_() };
    saveSessions_(s);
  } finally { lock.releaseLock(); }
  return { ok: true, token: token, usuario: user };
}

function logout_(token) {
  var s = sessions_();
  delete s[hash_(token)];
  saveSessions_(s);
  return { ok: true };
}

/** Menú en la hoja: el usuario y la contraseña se cargan acá (nunca en el código). */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('phcontrol')
    .addItem('Crear o cambiar usuario', 'menuUsuario')
    .addItem('Cerrar sesión en todos los dispositivos', 'menuCerrarSesiones')
    .addToUi();
}

function menuUsuario() {
  var ui = SpreadsheetApp.getUi();
  var r1 = ui.prompt('phcontrol · Usuario', 'Elegí tu nombre de usuario (por ejemplo: uriel)', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var user = r1.getResponseText().trim();
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(user)) { ui.alert('Usuario inválido: usá de 3 a 40 letras, números, punto o guion.'); return; }
  var r2 = ui.prompt('phcontrol · Contraseña', 'Elegí una contraseña de al menos 8 caracteres.', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var pass = r2.getResponseText();
  if (pass.length < 8) { ui.alert('La contraseña tiene que tener al menos 8 caracteres.'); return; }
  var salt = Utilities.getUuid();
  var props = PropertiesService.getScriptProperties();
  props.setProperties({ USUARIO: user, PASS_SALT: salt, PASS_HASH: passwordHash_(pass, salt), SESIONES: '{}' });
  ui.alert('Listo. Ya podés ingresar a la app con el usuario "' + user + '". Las sesiones anteriores se cerraron.');
}

function menuCerrarSesiones() {
  PropertiesService.getScriptProperties().setProperty('SESIONES', '{}');
  SpreadsheetApp.getUi().alert('Se cerró la sesión en todos los dispositivos.');
}

/** Crea las pestañas que falten y agrega columnas nuevas sin tocar las existentes. */
function setup_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSpreadsheetTimeZone() !== 'America/Argentina/Buenos_Aires') ss.setSpreadsheetTimeZone('America/Argentina/Buenos_Aires');
  var made = [];
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    var wanted = META.concat(Object.keys(SCHEMA[name]));
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, wanted.length).setValues([wanted]).setFontWeight('bold');
      sh.setFrozenRows(1);
      // Texto plano: evita que Sheets convierta fechas, horas o teléfonos.
      sh.getRange(1, 1, sh.getMaxRows(), wanted.length).setNumberFormat('@');
      made.push(name);
      return;
    }
    var headers = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    var missing = wanted.filter(function (h) { return headers.indexOf(h) === -1; });
    if (missing.length) {
      var start = headers.length + 1;
      sh.getRange(1, start, 1, missing.length).setValues([missing]).setFontWeight('bold');
      sh.getRange(1, start, sh.getMaxRows(), missing.length).setNumberFormat('@');
      made.push(name + ' (+' + missing.join(', ') + ')');
    }
  });
  return made;
}

function pull_(since) {
  setup_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = {};
  var now = nowIso_();
  Object.keys(SCHEMA).forEach(function (name) {
    var rows = readSheet_(ss.getSheetByName(name)).rows;
    out[name] = rows.filter(function (r) {
      return !since || String(r.servidor_en || '') > String(since);
    });
  });
  return { ok: true, now: now, data: out };
}

function push_(ops) {
  if (!Array.isArray(ops)) throw new Error('ops debe ser una lista');
  if (ops.length > 500) throw new Error('Demasiadas operaciones en un lote (máx. 500)');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    setup_();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var cache = {};
    var results = [];
    ops.forEach(function (op, i) {
      try {
        var name = op.entity;
        if (!SCHEMA[name]) throw new Error('Entidad desconocida: ' + name);
        if (!cache[name]) cache[name] = readSheet_(ss.getSheetByName(name));
        var rec = validate_(name, op.record || {});
        results.push(upsert_(ss.getSheetByName(name), cache[name], rec));
      } catch (err) {
        results.push({ ok: false, index: i, id: op && op.record && op.record.id, error: String(err.message || err) });
      }
    });
    return { ok: true, now: nowIso_(), results: results };
  } finally {
    lock.releaseLock();
  }
}

function upsert_(sh, table, rec) {
  var headers = table.headers;
  var existingRow = table.index[rec.id];
  rec.servidor_en = nowIso_();
  if (existingRow) {
    var current = table.rows[existingRow - 2];
    if (String(current.actualizado_en || '') > String(rec.actualizado_en || '')) {
      return { ok: true, id: rec.id, skipped: true, record: current };
    }
  }
  var values = headers.map(function (h) { return toCell_(rec[h]); });
  // Siempre setValues sobre celdas en formato texto ('@'): appendRow convertía "18:00" en una hora de Sheets.
  var row = existingRow || (table.rows.length + 2);
  sh.getRange(row, 1, 1, headers.length).setNumberFormat('@').setValues([values]);
  if (existingRow) {
    table.rows[existingRow - 2] = rec;
  } else {
    table.rows.push(rec);
    table.index[rec.id] = row;
  }
  return { ok: true, id: rec.id, record: rec };
}

function validate_(name, input) {
  var schema = SCHEMA[name];
  var rec = {};
  if (!input.id || !/^[A-Za-z0-9_\-:.]{3,80}$/.test(String(input.id))) throw new Error('id inválido');
  rec.id = String(input.id);
  rec.creado_en = isoOrNow_(input.creado_en);
  rec.actualizado_en = isoOrNow_(input.actualizado_en);
  rec.eliminado = input.eliminado === true || input.eliminado === 'TRUE' || input.eliminado === 'true';
  Object.keys(schema).forEach(function (field) {
    var rule = schema[field];
    var v = input[field];
    var empty = v === undefined || v === null || v === '';
    if (empty) {
      if (rule.required && !rec.eliminado) throw new Error('Falta el campo obligatorio "' + field + '"');
      rec[field] = '';
      return;
    }
    switch (rule.type) {
      case 'number':
        var n = Number(v);
        if (!isFinite(n)) throw new Error('"' + field + '" debe ser un número');
        if (rule.min !== undefined && n < rule.min) throw new Error('"' + field + '" es menor que ' + rule.min);
        if (rule.max !== undefined && n > rule.max) throw new Error('"' + field + '" es mayor que ' + rule.max);
        rec[field] = n;
        break;
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new Error('"' + field + '" debe ser AAAA-MM-DD');
        rec[field] = String(v);
        break;
      case 'time':
        if (!/^\d{2}:\d{2}$/.test(String(v))) throw new Error('"' + field + '" debe ser HH:MM');
        rec[field] = String(v);
        break;
      case 'enum':
        if (rule.values.indexOf(String(v)) === -1) throw new Error('"' + field + '" tiene un valor no permitido');
        rec[field] = String(v);
        break;
      case 'json':
        var s = typeof v === 'string' ? v : JSON.stringify(v);
        JSON.parse(s);
        if (s.length > (rule.max || 45000)) throw new Error('"' + field + '" es demasiado largo');
        rec[field] = s;
        break;
      default:
        var str = String(v);
        if (rule.max && str.length > rule.max) throw new Error('"' + field + '" supera ' + rule.max + ' caracteres');
        rec[field] = str;
    }
  });
  return rec;
}

function uploadPhoto_(req) {
  if (!req.data || typeof req.data !== 'string') throw new Error('Falta la imagen');
  if (req.data.length > 8 * 1024 * 1024) throw new Error('Imagen demasiado grande');
  var mime = req.mime === 'image/png' ? 'image/png' : 'image/jpeg';
  var name = String(req.name || ('foto-' + Date.now() + '.jpg')).replace(/[^\w.\-]/g, '_');
  var blob = Utilities.newBlob(Utilities.base64Decode(req.data), mime, name);
  var file = photoFolder_().createFile(blob);
  return { ok: true, fileId: file.getId() };
}

function getPhoto_(fileId) {
  if (!fileId || !/^[\w\-]{10,}$/.test(fileId)) throw new Error('fileId inválido');
  var file = DriveApp.getFileById(fileId);
  var parents = file.getParents();
  var folderId = photoFolder_().getId();
  var inFolder = false;
  while (parents.hasNext()) if (parents.next().getId() === folderId) inFolder = true;
  if (!inFolder) throw new Error('La foto no pertenece a la carpeta de phcontrol');
  var blob = file.getBlob();
  return { ok: true, mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

/* ---------------- Utilidades ---------------- */

function photoFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* se recrea abajo */ }
  }
  var folder = DriveApp.createFolder(PHOTO_FOLDER_NAME);
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
}

function readSheet_(sh) {
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  var rows = [];
  var index = {};
  if (lastRow > 1) {
    var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    values.forEach(function (vals, i) {
      var o = {};
      headers.forEach(function (h, j) { o[h] = fromCell_(vals[j], fieldType_(sh.getName(), h)); });
      o.eliminado = o.eliminado === true || o.eliminado === 'TRUE' || o.eliminado === 'true';
      rows.push(o);
      if (o.id) index[o.id] = i + 2;
    });
  }
  return { headers: headers, rows: rows, index: index };
}

function toCell_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

function fieldType_(sheetName, field) {
  var rule = SCHEMA[sheetName] && SCHEMA[sheetName][field];
  return rule ? rule.type : '';
}

/**
 * Sheets puede convertir textos a fecha/hora (por ejemplo, si editás a mano). Se vuelven a texto
 * según el tipo del campo. Una hora sola llega como fecha del 30/12/1899: eso se lee como HH:MM.
 */
function fromCell_(v, type) {
  if (v instanceof Date) {
    var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    if (type === 'time' || v.getFullYear() < 1900) return Utilities.formatDate(v, tz, 'HH:mm');
    if (type === 'date') return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    return v.toISOString();
  }
  if (type === 'time' && v !== '' && v !== null) {
    var m = String(v).match(/^(\d{1,2}):(\d{2})/);
    return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : '';
  }
  return v;
}

function isoOrNow_(v) {
  return v && /^\d{4}-\d{2}-\d{2}T/.test(String(v)) ? String(v) : nowIso_();
}

function nowIso_() { return new Date().toISOString(); }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Ejecutalo una vez a mano desde el editor para crear las pestañas y autorizar Drive. */
function inicializar() {
  var props = PropertiesService.getScriptProperties();
  // Si se subió secreto.gs (instalación con clasp), el token pasa a las Propiedades del script.
  if (!props.getProperty('TOKEN') && typeof TOKEN_INICIAL === 'string' && TOKEN_INICIAL.length >= 16) {
    props.setProperty('TOKEN', TOKEN_INICIAL);
    Logger.log('Token guardado en las Propiedades del script.');
  }
  if (usuarioInicial_(props)) Logger.log('Usuario "' + USUARIO_INICIAL + '" creado.');
  Logger.log(setup_());
  Logger.log('Carpeta de fotos: ' + photoFolder_().getUrl());
  if (!props.getProperty('TOKEN')) {
    Logger.log('ATENCIÓN: falta la propiedad TOKEN (Configuración del proyecto > Propiedades del script).');
  }
}
