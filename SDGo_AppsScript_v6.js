// ════════════════════════════════════════════════════════════
// SDGo! — Google Apps Script Standalone v2.0
// CECyT 9 IPN · Técnico en Sistemas Digitales
//
// INSTRUCCIONES:
// 1. Ve a script.google.com → Nuevo proyecto
// 2. Nómbralo "SDGo_API"
// 3. Pega este código completo
// 4. Actualiza los dos IDs abajo con los de tus Sheets
// 5. Ejecuta la función "probar" para verificar
// 6. Implementar → Nueva implementación → Aplicación web
//    · Ejecutar como: Yo
//    · Acceso: Cualquier usuario
// 7. Copia la URL y pégala en index.html donde dice API_URL
// ════════════════════════════════════════════════════════════

// ── IDs DE TUS GOOGLE SHEETS ─────────────────────────────────
// Cópialos de la URL: docs.google.com/spreadsheets/d/ID_AQUI/edit

const ID_CONTENIDO = 'PEGA_AQUI_EL_ID_DE_SDGo_Contenido';
// Ejemplo: '1i1-KeDvAJ8XATwpgHiqXu7SPXLz5v8eX'

const ID_BACKEND   = 'PEGA_AQUI_EL_ID_DE_SDGo_Backend';
// Ejemplo: '1xYz-AbCdEfGhIjKlMnOpQrStUvWxYz12'

// ─────────────────────────────────────────────────────────────

function getContenido() { return SpreadsheetApp.openById(ID_CONTENIDO); }
function getBackend()   { return SpreadsheetApp.openById(ID_BACKEND); }

// ── Salida JSON ───────────────────────────────────────────────
// NOTA: ContentService.TextOutput NO tiene método .setHeader().
// Llamarlo lanzaba una excepción en CADA petición, lo que hacía que
// la app cayera siempre al modo local (sin nombres, sin reactivos del
// Sheet y sin guardar progreso/autoevaluaciones).
// Para una Web App publicada con acceso "Cualquier usuario", Google
// gestiona CORS automáticamente en la URL /exec, así que solo hace
// falta fijar el tipo de contenido a JSON.
function setCORS(output) {
  return output.setMimeType(ContentService.MimeType.JSON);
}

function ok(data) {
  return setCORS(ContentService.createTextOutput(
    JSON.stringify({ ok: true, data: data })
  ));
}

function err(msg) {
  return setCORS(ContentService.createTextOutput(
    JSON.stringify({ ok: false, error: msg })
  ));
}

// ════════════════════════════════════════════════════════════
// doGet — la app llama esto al abrir para cargar contenido
// ════════════════════════════════════════════════════════════
function doGet(e) {
  try {
    const accion = (e && e.parameter && e.parameter.accion) ? e.parameter.accion : 'todo';

    if (accion === 'todo') {
      return ok({
        materias:      leerMaterias(),
        temas:         leerTemas(),
        numPreguntas:  leerNumPreguntas(),
        reactivos:     leerReactivos(),
    fichas:        leerFichas(),
        asesorias:     leerAsesorias(),
        recompensas:   leerRecompensas(),
        configuracion: leerConfiguracion()
      });
    }

    if (accion === 'alumno') {
      const boleta = e.parameter.boleta || '';
      if (!boleta) return err('Boleta requerida');
      return ok(leerAlumno(boleta));
    }

    if (accion === 'progreso') {
      const boleta = e.parameter.boleta || '';
      if (!boleta) return err('Boleta requerida');
      return ok(leerProgresoAlumno(boleta));
    }

    return err('Accion no reconocida');
  } catch(e) {
    return err('Error doGet: ' + e.message);
  }
}

// ════════════════════════════════════════════════════════════
// doPost — la app envía datos para guardar
// ════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    const accion = p.accion || '';
    if (accion === 'resultado') { guardarResultado(p); return ok({ guardado: true }); }
    if (accion === 'progreso')  { guardarProgreso(p);  return ok({ guardado: true }); }
    if (accion === 'cita')      { guardarCita(p);      return ok({ guardado: true }); }
    if (accion === 'autoeval') { guardarAutoeval(p); return ok({ guardado: true }); }
    if (accion === 'inscripcion') { guardarInscripcion(p); return ok({ inscritas: leerMateriasSDGo(p.boleta) }); }
    if (accion === 'correo')      { actualizarCorreo(p); return ok({ email: leerEmailAlumno(p.boleta) }); }
    if (accion === 'canje')       { guardarCanje(p); return ok({ registrado: true }); }
    if (accion === 'puntosextra') { registrarMovimiento(p.boleta, p.materia_id, p.concepto||'extra', p.concepto||'Puntos extra', Number(p.puntos)||0); return ok({ sumado: true }); }
    if (accion === 'tiempo') { guardarTiempo(p); return ok({ guardado: true, tiempoHoy: tiempoHoyServidor(p.boleta) }); }
    if (accion === 'certificado') { enviarCertificado(p); return ok({ enviado: true }); }
    return err('Accion no reconocida');
  } catch(e) {
    return err('Error doPost: ' + e.message);
  }
}

function guardarAutoeval(p) {
  const hoja = getBackend().getSheetByName('Autoevaluaciones') || crearHojaAutoeval();
  if (!hoja) return;
  const tz  = Session.getScriptTimeZone();
  const hoy = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy');
  hoja.appendRow([
    p.boleta||'', p.grupo||'', p.materia_id||'',
    p.tema_idx||0, p.resultado||'', hoy
  ]);
}

function crearHojaAutoeval() {
  try {
    const hoja = getBackend().insertSheet('Autoevaluaciones');
    hoja.appendRow(['boleta','grupo','materia_id','tema_idx','resultado','fecha']);
    return hoja;
  } catch(e) { return null; }
}

// ── Inscripción a SDGo! (hoja Alumnos_SDGo) ──────────────────
// Solo AGREGA materias (no elimina). Para dar de baja, poner activo=NO a mano.
function guardarInscripcion(p) {
  const ss = getBackend();
  let hoja = ss.getSheetByName('Alumnos_SDGo') || crearHojaAlumnosSDGo();
  if (!hoja) return;
  const yaInscritas = leerMateriasSDGo(p.boleta);
  const tz  = Session.getScriptTimeZone();
  const hoy = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy');
  const email = String(p.email||'').trim();
  (p.materias || []).forEach(mid => {
    mid = String(mid).trim();
    if (!mid || yaInscritas.includes(mid)) return; // no duplicar
    hoja.appendRow([ String(p.boleta||''), String(p.grupo||''), mid, hoy, 'SI', email ]);
    yaInscritas.push(mid);
  });
  // Si llegó un correo, asegúralo en todas las filas de la boleta (incluye las previas)
  if (email) actualizarCorreo({ boleta: p.boleta, email: email });
}

// RF7 — actualizar/corregir el correo del alumno en TODAS sus filas de Alumnos_SDGo.
// No se puede eliminar, solo modificar (la app valida que no venga vacío).
function actualizarCorreo(p) {
  const email = String(p.email||'').trim();
  if (!email) throw new Error('El correo no puede quedar vacío');
  const ss = getBackend();
  const hoja = ss.getSheetByName('Alumnos_SDGo');
  if (!hoja) return;
  const datos = hoja.getDataRange().getValues();
  // Fila 4 (índice 3) = encabezados; localizar columnas boleta y email
  const hdr = datos[3] || [];
  let cBoleta = hdr.indexOf('boleta'), cEmail = hdr.indexOf('email');
  if (cBoleta < 0) cBoleta = 0;
  if (cEmail < 0) cEmail = 5; // columna F por convención
  for (let r = 4; r < datos.length; r++) {
    if (String(datos[r][cBoleta]).trim() === String(p.boleta).trim()) {
      hoja.getRange(r + 1, cEmail + 1).setValue(email);
    }
  }
}

// Crea Alumnos_SDGo con el mismo layout que el resto (encabezados en fila 4,
// datos desde la fila 6) para que hojaAObj la lea correctamente.
function crearHojaAlumnosSDGo() {
  try {
    const ss = getBackend();
    let hoja = ss.getSheetByName('Alumnos_SDGo');
    if (hoja) return hoja;
    hoja = ss.insertSheet('Alumnos_SDGo');
    hoja.getRange(1,1).setValue('SDGo! · Alumnos inscritos en la asesoría digital');
    hoja.getRange(2,1).setValue('Materias en las que el alumno USA SDGo! (distinto del padrón institucional)');
    hoja.getRange(4,1,1,5).setValues([['boleta','grupo','materia_id','fecha_inscripcion','activo']]);
    hoja.getRange(5,1).setValue('Una fila por materia inscrita en SDGo!. No se elimina: para baja, activo=NO.');
    return hoja;
  } catch(e) { return null; }
}

// ════════════════════════════════════════════════════════════
// LECTURAS — desde SDGo_Contenido (público)
// ════════════════════════════════════════════════════════════
function hojaAObj(ss, nombre) {
  const hoja = ss.getSheetByName(nombre);
  if (!hoja) return [];
  const lastRow = hoja.getLastRow();
  const lastCol = hoja.getLastColumn();
  // Estructura fija de los archivos SDGo!:
  // Fila 1: título  |  Fila 2: subtítulo  |  Fila 3: espacio
  // Fila 4: encabezados de columna  |  Fila 5: nota/instrucción
  // Fila 6 en adelante: datos reales
  if (lastRow < 6 || lastCol < 1) return [];

  // Leer encabezados desde la fila 4
  const encFila = hoja.getRange(4, 1, 1, lastCol).getValues()[0];
  const enc = encFila.map(h => String(h).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quitar acentos
    .replace(/ /g,'_').replace(/[^a-z0-9_]/g,''));

  // Leer datos desde la fila 6 (la fila 5 es la nota de instrucción)
  const numFilas = lastRow - 5;
  if (numFilas < 1) return [];
  const datos = hoja.getRange(6, 1, numFilas, lastCol).getValues();

  const res = [];
  for (const fila of datos) {
    if (fila.every(c => c === '' || c === null || c === undefined)) continue;
    const obj = {};
    enc.forEach((e, j) => { obj[e] = fila[j]; });
    res.push(obj);
  }
  return res;
}

function leerMaterias() {
  return hojaAObj(getContenido(), 'Materias')
    .filter(m => String(m.activa).toUpperCase() === 'SI')
    .map(m => ({
      id: String(m.id).trim(),
      nombre: String(m.nombre).trim(),
      unidad: String(m.unidad).trim(),
      icono: String(m.icono).trim(),
      color: String(m.color).trim(),
      semestre: String(m.semestre).trim()
    }));
}

function leerTemas() {
  const filas = hojaAObj(getContenido(), 'Temas');
  const ag = {};
  filas.forEach(f => {
    const mid = String(f.materia_id).trim();
    if (!ag[mid]) ag[mid] = [];
    ag[mid].push({ idx: Number(f.indice)||ag[mid].length, nombre: String(f.nombre_tema).trim() });
  });
  Object.keys(ag).forEach(mid => {
    ag[mid].sort((a,b) => a.idx - b.idx);
    ag[mid] = ag[mid].map(t => t.nombre);
  });
  return ag;
}

// RF4 — número de preguntas configurable por tema (columna opcional num_preguntas
// en la hoja Temas). Devuelve {materia: {idx: N}}. Si está vacío, la app usa 5.
function leerNumPreguntas() {
  const filas = hojaAObj(getContenido(), 'Temas');
  const ag = {}; const cnt = {};
  filas.forEach(f => {
    const mid = String(f.materia_id).trim();
    if (cnt[mid] === undefined) cnt[mid] = 0;
    const idx = (f.indice !== undefined && f.indice !== '') ? Number(f.indice) : cnt[mid];
    cnt[mid]++;
    const n = Number(f.num_preguntas) || 0;
    if (n > 0) { if (!ag[mid]) ag[mid] = {}; ag[mid][idx] = n; }
  });
  return ag;
}

function leerFichas() {
  // Retorna {matId: {temaIdx: {pdf_url, bloques:[...]}}}
  const filas = hojaAObj(getContenido(), 'Fichas');
  const ag = {};
  filas.forEach(f => {
    if(String(f.activo||'').toUpperCase() !== 'SI') return;
    const mid     = String(f.materia_id||'').trim();
    const temaIdx = parseInt(f.tema_idx)||0;
    if(!mid) return;
    if(!ag[mid]) ag[mid]={};
    if(!ag[mid][temaIdx]) ag[mid][temaIdx]={pdf_url:'', bloques:[]};
    // Guardar pdf_url (solo la primera fila del tema la tiene)
    if(f.pdf_url && !ag[mid][temaIdx].pdf_url)
      ag[mid][temaIdx].pdf_url = String(f.pdf_url).trim();
    // Agregar bloque (los encabezados se normalizan a campo1..campo5)
    ag[mid][temaIdx].bloques.push({
      tipo:    String(f.tipo||'').trim(),
      campo1:  String(f.campo1||'').trim(),
      campo2:  String(f.campo2||'').trim(),
      campo3:  String(f.campo3||'').trim(),
      campo4:  String(f.campo4||'').trim(),
      campo5:  String(f.campo5||'').trim()
    });
  });
  return ag;
}

function leerReactivos() {
  const filas = hojaAObj(getContenido(), 'Reactivos');
  const ag = {};  // { matId: { temaIdx: [reactivos] } }
  const mapa = { 'A':0, 'B':1, 'C':2, 'D':3 };
  filas.forEach(f => {
    const mid     = String(f.materia_id).trim();
    const temaIdx = parseInt(f.tema_idx) || 0;
    if (!ag[mid]) ag[mid] = {};
    if (!ag[mid][temaIdx]) ag[mid][temaIdx] = [];
    ag[mid][temaIdx].push({
      p:   String(f.pregunta).trim(),
      ops: [String(f.opcion_a).trim(), String(f.opcion_b).trim(),
            String(f.opcion_c).trim(), String(f.opcion_d).trim()],
      c:   mapa[String(f.correcta).trim().toUpperCase()] ?? 0,
      exp: String(f.explicacion).trim(),
      img: String(f.imagen_url||'').trim(),
      cap: String(f.imagen_caption||'').trim()
    });
  });
  return ag;
}

function leerAsesorias() {
  return hojaAObj(getContenido(), 'Asesorias').map(a => ({
    profesor:   String(a.profesor).trim(),
    materia_id: String(a.materia_id).trim(),
    materia:    String(a.materia_nombre).trim(),
    dia:        String(a.dia).trim(),
    hora_inicio:String(a.hora_inicio).trim(),
    hora_fin:   String(a.hora_fin).trim(),
    lugar:      String(a.lugar).trim(),
    disponible: String(a.disponible).toUpperCase() === 'SI',
    notas:      String(a.notas||'').trim()
  }));
}

function leerRecompensas() {
  const filas = hojaAObj(getContenido(), 'Recompensas');
  if (!filas.length) return recompensasDefault();
  return filas.map(r => ({
    id:      String(r.id).trim(),
    nombre:  String(r.nombre).trim(),
    desc:    String(r.descripcion||'').trim(),
    icono:   String(r.icono).trim(),
    pts:     Number(r.costo)||10,
    tipo:    String(r.tipo||'logro').trim(),
    recurso: String(r.recurso_url||'').trim(),
    materia_id: String(r.materia_id||'').trim()
  }));
}

function recompensasDefault() {
  return [
    { id:'r1', nombre:'Asesoría express',      desc:'30 min con la docente',    icono:'🎓', pts:20, tipo:'asesoria', recurso:'' },
    { id:'r2', nombre:'Material PDF extra',    desc:'Guía de repaso avanzada',  icono:'📄', pts:10, tipo:'pdf',      recurso:'' },
    { id:'r3', nombre:'Insignia de dominio',   desc:'Tema completado al 100%',  icono:'🏅', pts:5,  tipo:'logro',    recurso:'' },
    { id:'r4', nombre:'Punto de participación',desc:'Registro ante el docente', icono:'⭐', pts:100,tipo:'logro',    recurso:'' }
  ];
}

function leerConfiguracion() {
  const config = {};
  hojaAObj(getBackend(), 'Configuracion').forEach(f => {
    config[String(f.parametro).trim()] = String(f.valor).trim();
  });
  return config;
}

// ── Datos de un alumno específico (desde Backend) ────────────
function leerAlumno(boleta) {
  const filas = hojaAObj(getBackend(), 'Alumnos')
    .filter(f => String(f.boleta).trim() === String(boleta).trim());
  if (!filas.length) return { encontrado: false, modo: 'libre' };
  const primer = filas[0];
  // Padrón institucional = todas las materias que el alumno cursa (su universo
  // de opciones para inscribirse a SDGo!). Incluye ETS (activo=NO).
  const materiasPadron = [...new Set(
    filas.map(r => String(r.materia_id).trim()).filter(Boolean)
  )];
  const ets = filas.every(r => String(r.activo).toUpperCase() === 'NO');
  // Materias en las que YA usa SDGo! (hoja aparte Alumnos_SDGo)
  const materiasSDGo = leerMateriasSDGo(boleta);
  return {
    encontrado: true,
    boleta:     String(primer.boleta).trim(),
    nombre:     String(primer.nombre||'').trim(),
    apellido_p: String(primer.apellido_p||'').trim(),
    apellido_m: String(primer.apellido_m||'').trim(),
    grupo:      String(primer.grupo||'').trim(),
    semestre:   String(primer.semestre||'').trim(),
    turno:      String(primer.turno||'').trim(),
    email:      leerEmailAlumno(boleta),   // correo Gmail registrado (RF7)
    materiasPadron:    materiasPadron,   // opciones para inscribirse
    materiasSDGo:      materiasSDGo,     // ya inscritas en SDGo!
    materiasInscritas: materiasSDGo,     // compatibilidad
    modo:       ets ? 'ets' : 'inscrito'
  };
}

// RF7 — correo del alumno: vive en Alumnos_SDGo (columna email). Toma el primero no vacío.
function leerEmailAlumno(boleta) {
  try {
    const filas = hojaAObj(getBackend(), 'Alumnos_SDGo')
      .filter(f => String(f.boleta).trim() === String(boleta).trim());
    for (const f of filas) {
      const e = String(f.email||'').trim();
      if (e) return e;
    }
  } catch(e) {}
  return '';
}

// ── TIEMPO DE ESTUDIO en el servidor (suma entre dispositivos) ──────────
// Hoja Tiempo: boleta | materia_id | fecha | minutos  (acumula por boleta+materia+día)
function crearHojaTiempo() {
  const ss = getBackend();
  let h = ss.getSheetByName('Tiempo');
  if (h) return h;
  h = ss.insertSheet('Tiempo');
  h.getRange(4,1,1,4).setValues([['boleta','materia_id','fecha','minutos']]);
  h.getRange(5,1).setValue('  Tiempo de estudio general por día (auto). No editar manualmente.');
  return h;
}
// Normaliza una celda de fecha (texto o tipo Fecha) a 'dd/MM/yyyy' para comparar bien.
function _aFechaStr(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, tz, 'dd/MM/yyyy');
  return String(v).trim();
}
function guardarTiempo(p) {
  const min = Number(p.minutos)||0;
  if (!p.boleta || min <= 0) return;
  const h = getBackend().getSheetByName('Tiempo') || crearHojaTiempo();
  const tz = Session.getScriptTimeZone();
  const hoy = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy');
  const b = String(p.boleta).trim();
  // Tiempo GENERAL del día: una sola fila por (boleta, día). Se ignora la unidad
  // (la app mide un único cronómetro diario); así el celular y la PC suman en la misma fila.
  const datos = h.getDataRange().getValues();
  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][0]).trim()===b && _aFechaStr(datos[i][2],tz)===hoy) {
      h.getRange(i+1,4).setValue((Number(datos[i][3])||0) + min);   // acumula en la MISMA fila
      return;
    }
  }
  h.appendRow([ b, '', hoy, min ]);   // materia_id queda vacío = tiempo general del día
}
// Minutos de estudio de HOY de un alumno (sumando todos sus dispositivos).
function tiempoHoyServidor(boleta) {
  try {
    const tz = Session.getScriptTimeZone();
    const hoy = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy');
    return hojaAObj(getBackend(), 'Tiempo')
      .filter(f => String(f.boleta).trim()===String(boleta).trim() && _aFechaStr(f.fecha,tz)===hoy)
      .reduce((s,f) => s + (Number(f.minutos)||0), 0);
  } catch(e) { return 0; }
}
// Una fila por CADA evento de puntos (ganado +, gastado −). Nunca se sobrescribe.
// boleta | materia_id | tipo | concepto | puntos | fecha | hora
function crearHojaMovimientos() {
  const ss = getBackend();
  let h = ss.getSheetByName('Movimientos');
  if (h) return h;
  h = ss.insertSheet('Movimientos');
  h.getRange(4,1,1,7).setValues([['boleta','materia_id','tipo','concepto','puntos','fecha','hora']]);
  h.getRange(5,1).setValue('  Libro de movimientos (auto). No editar manualmente.');
  return h;
}
function registrarMovimiento(boleta, materia_id, tipo, concepto, puntos) {
  const pts = Number(puntos)||0;
  if (!boleta || !pts) return;
  const h = getBackend().getSheetByName('Movimientos') || crearHojaMovimientos();
  const tz = Session.getScriptTimeZone(), now = new Date();
  h.appendRow([ String(boleta).trim(), String(materia_id||'').trim(), String(tipo||'').trim(),
                String(concepto||'').trim(), pts,
                Utilities.formatDate(now,tz,'dd/MM/yyyy'), Utilities.formatDate(now,tz,'HH:mm') ]);
}
// Saldo del alumno calculado SUMANDO todos sus movimientos.
function saldoLedger(boleta) {
  const b = String(boleta).trim();
  const porMat = {}; let total = 0, gastado = 0;
  hojaAObj(getBackend(), 'Movimientos')
    .filter(f => String(f.boleta).trim() === b)
    .forEach(f => {
      const mid = String(f.materia_id||'').trim();
      const pts = Number(f.puntos)||0;
      if (mid) porMat[mid] = (porMat[mid]||0) + pts;
      total += pts;
      if (pts < 0) gastado += -pts;
    });
  // No permitir negativos por materia (defensivo)
  Object.keys(porMat).forEach(m => { if (porMat[m] < 0) porMat[m] = 0; });
  return { porMat, total: Math.max(0,total), gastado };
}
// Siembra ÚNICA: si el alumno aún no tiene movimientos, los crea a partir de lo que ya
// existía (Resultados = ganado bruto, Canjes = gastado), para NO perder puntos previos.
function seedLedgerSiVacio(boleta) {
  const b = String(boleta).trim();
  const mov = getBackend().getSheetByName('Movimientos') || crearHojaMovimientos();
  const yaTiene = hojaAObj(getBackend(), 'Movimientos').some(f => String(f.boleta).trim() === b);
  if (yaTiene) return;
  let sembro = false;
  // Ganado bruto desde Resultados
  hojaAObj(getBackend(), 'Resultados')
    .filter(f => String(f.boleta).trim() === b)
    .forEach(f => {
      const mid = String(f.materia_id||'').trim();
      const pts = Number(f.puntos)||0;
      if (mid && pts) { registrarMovimiento(b, mid, 'saldo_inicial', 'Saldo previo', pts); sembro = true; }
    });
  // Gastado desde Canjes
  try {
    hojaAObj(getBackend(), 'Canjes')
      .filter(f => String(f.boleta).trim() === b)
      .forEach(f => {
        const mid = String(f.materia_id||'').trim();
        const pts = Number(f.puntos)||0;
        if (pts) { registrarMovimiento(b, mid, 'canje_previo', String(f.concepto||'Canje previo'), -pts); sembro = true; }
      });
  } catch(e) {}
  return sembro;
}

// ── Opción A — Canjes (gasto de puntos) ───────────────────────────────
// El saldo real del alumno = puntos ganados (Resultados) − suma de Canjes.
function crearHojaCanjes() {
  const ss = getBackend();
  let h = ss.getSheetByName('Canjes');
  if (h) return h;
  h = ss.insertSheet('Canjes');
  h.getRange(4,1,1,6).setValues([['boleta','materia_id','concepto','puntos','fecha','hora']]);
  return h;
}
function guardarCanje(p) {
  const h = getBackend().getSheetByName('Canjes') || crearHojaCanjes();
  if (!h) return;
  const tz  = Session.getScriptTimeZone();
  const fecha = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy');
  const hora  = Utilities.formatDate(new Date(), tz, 'HH:mm');
  h.appendRow([ String(p.boleta||''), String(p.materia_id||''), String(p.concepto||''), Number(p.puntos)||0, fecha, hora ]);
  // LEDGER: el canje es un gasto (movimiento negativo)
  registrarMovimiento(p.boleta, p.materia_id, 'canje', String(p.concepto||'Canje'), -(Number(p.puntos)||0));
}
function leerCanjesTotal(boleta) {
  try {
    return hojaAObj(getBackend(), 'Canjes')
      .filter(f => String(f.boleta).trim() === String(boleta).trim())
      .reduce((s,f) => s + (Number(f.puntos)||0), 0);
  } catch(e) { return 0; }
}

// Punto de participación — certificado por materia. Correo a coordinación + alumno
// (NO al docente: el asesor puede no ser el profesor titular de esa materia).
function enviarCertificado(p) {
  const temas = Array.isArray(p.temas) ? p.temas : [];
  const listaTemas = temas.length
    ? temas.map((t,i) => `   ${i+1}. ${t}`).join('\n')
    : '   (sin temas aprobados registrados)';
  const asunto = `SDGo! — Certificado de participación: ${p.nombre||p.boleta} · ${p.materia_nombre||''}`;
  const cuerpo = `Certificado de participación — SDGo!

Alumno:   ${p.nombre || p.boleta}
Boleta:   ${p.boleta}
Grupo:    ${p.grupo || ''}
Unidad:   ${p.materia_nombre || ''}
Fecha:    ${p.fecha || ''}

Temas cubiertos (${temas.length}):
${listaTemas}

Este certificado fue generado por el alumno al canjear su punto de participación en SDGo!
Queda registrado en la hoja Canjes del SDGo_Backend.

— SDGo! · CECyT 9 "Juan de Dios Bátiz" · IPN`;

  const cc = [];
  if (p.email_alumno && /@/.test(p.email_alumno)) cc.push(String(p.email_alumno).trim());
  MailApp.sendEmail({
    to:      EMAIL_COORDINACION,
    cc:      cc.join(','),
    subject: asunto,
    body:    cuerpo
  });
}

// Materias en las que el alumno está inscrito EN SDGo!.
// Se considera inscrito si: (a) aparece en Alumnos_SDGo con activo=SI, o
// (b) ya tiene actividad registrada (Resultados o Progreso) en esa materia
//     —porque si ya tiene calificación en ella, evidentemente ya la usa.
function leerMateriasSDGo(boleta) {
  const b = String(boleta).trim();
  const set = {};
  // (a) inscripción explícita
  hojaAObj(getBackend(), 'Alumnos_SDGo')
    .filter(f => String(f.boleta).trim() === b && String(f.activo).toUpperCase() === 'SI')
    .forEach(f => { const m = String(f.materia_id).trim(); if (m) set[m] = true; });
  // (b) actividad previa en Resultados
  hojaAObj(getBackend(), 'Resultados')
    .filter(f => String(f.boleta).trim() === b)
    .forEach(f => { const m = String(f.materia_id).trim(); if (m) set[m] = true; });
  // (b) actividad previa en Progreso
  hojaAObj(getBackend(), 'Progreso')
    .filter(f => String(f.boleta).trim() === b)
    .forEach(f => { const m = String(f.materia_id).trim(); if (m) set[m] = true; });
  return Object.keys(set);
}

// ════════════════════════════════════════════════════════════
// ESCRITURAS — hacia SDGo_Backend (privado)
// ════════════════════════════════════════════════════════════
function guardarProgreso(p) {
  // ── PROGRESO = historial detallado: 1 fila por (boleta, materia, tema) ──
  // Columnas: boleta|grupo|materia_id|tema_idx|tema_nombre|completado|
  //           calificacion_mejor|intentos|correctas|total|fecha_ultimo
  const hoja = getBackend().getSheetByName('Progreso');
  let oldBest = 0;  // mejor calificación previa de este tema (para calcular la MEJORA)
  if (hoja) {
    const datos = hoja.getDataRange().getValues();
    const tz    = Session.getScriptTimeZone();
    const hoy   = Utilities.formatDate(new Date(),tz,'dd/MM/yyyy');
    const cal   = Number(p.calificacion)||0;
    let encontrado = false;
    for (let i = 1; i < datos.length; i++) {
      if (String(datos[i][0])===String(p.boleta) &&
          String(datos[i][2])===String(p.materia_id) &&
          String(datos[i][3])===String(p.tema_idx)) {
        const r = i+1;
        oldBest = Number(datos[i][6])||0;
        // completado: una vez SI, se queda SI
        if (p.completado || String(datos[i][5]).toUpperCase()==='SI') hoja.getRange(r,6).setValue('SI');
        const calActual = Number(datos[i][6])||0;
        if (cal > calActual) {               // guardar la MEJOR calificación y su detalle
          hoja.getRange(r,7).setValue(cal);
          hoja.getRange(r,9).setValue(Number(p.correctas)||0);
          hoja.getRange(r,10).setValue(Number(p.total)||0);
        }
        hoja.getRange(r,8).setValue((Number(datos[i][7])||0)+1);  // intentos++
        hoja.getRange(r,11).setValue(hoy);
        encontrado = true;
        break;
      }
    }
    if (!encontrado) {
      oldBest = 0;
      hoja.appendRow([
        p.boleta||'', p.grupo||'', p.materia_id||'', p.tema_idx||0, p.tema_nombre||'',
        p.completado?'SI':'NO', cal, 1, Number(p.correctas)||0, Number(p.total)||0, hoy
      ]);
    }
  }
  // ── RESULTADOS = resumen: 1 fila por (boleta, materia) (promedio y temas) ──
  actualizarResumen(p);
  // ── LEDGER: registrar SOLO la mejora del tema (mejor calificación), no acumular ──
  // delta = valor(nuevo mejor) − valor(mejor previo). Si no mejora, delta = 0.
  const cal2 = Number(p.calificacion)||0;
  const newBest = Math.max(oldBest, cal2);
  const delta = valorTemaPts(newBest) - valorTemaPts(oldBest);
  if (delta > 0) {
    registrarMovimiento(p.boleta, p.materia_id, 'cuestionario',
      'Cuestionario ' + (p.materia_nombre || p.materia_id || '') + ' (tema ' + ((Number(p.tema_idx)||0)+1) + ')', delta);
  }
}

// Recalcula el resumen del alumno en la materia y lo upserta en Resultados.
// promedio = promedio de las MEJORES calificaciones por tema (desde Progreso).
function actualizarResumen(p) {
  const hoja = getBackend().getSheetByName('Resultados');
  if (!hoja) return;
  const b = String(p.boleta).trim(), mid = String(p.materia_id).trim();
  // Mejores por tema desde Progreso
  const det = hojaAObj(getBackend(), 'Progreso')
    .filter(f => String(f.boleta).trim()===b && String(f.materia_id).trim()===mid);
  const mejores = det.map(f => Number(f.calificacion_mejor)||0);
  const promedio = mejores.length ? Math.round(mejores.reduce((a,c)=>a+c,0)/mejores.length) : 0;
  const temasCompletados = det.filter(f => String(f.completado).toUpperCase()==='SI').length;
  const tz  = Session.getScriptTimeZone(); const now = new Date();
  const fecha = Utilities.formatDate(now,tz,'dd/MM/yyyy');
  const hora  = Utilities.formatDate(now,tz,'HH:mm');
  // Buscar fila existente (por boleta+materia) para sobrescribir
  const datos = hoja.getDataRange().getValues();
  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][0])===b && String(datos[i][3])===mid) {
      const r = i+1;
      hoja.getRange(r,6).setValue(promedio);
      hoja.getRange(r,7).setValue((Number(datos[i][6])||0) + (Number(p.puntos)||0)); // puntos acumulados
      hoja.getRange(r,8).setValue(temasCompletados);
      hoja.getRange(r,9).setValue(fecha);
      hoja.getRange(r,10).setValue(hora);
      return;
    }
  }
  // No existe → crear fila resumen
  hoja.appendRow([
    b, p.nombre||'', p.grupo||'', mid, p.materia_nombre||'',
    promedio, Number(p.puntos)||0, temasCompletados, fecha, hora
  ]);
}

// guardarResultado se conserva por compatibilidad; ahora delega en el resumen.
function guardarResultado(p) { actualizarResumen(p); }

// ════════════════════════════════════════════════════════════
// EMAILS Y CORREOS
// ════════════════════════════════════════════════════════════
const EMAIL_DOCENTE     = 'natisma.tareas@gmail.com';
const EMAIL_COORDINACION = 'gestion_escolar@cecyt9.net';

function getEmailDocente(materia_id) {
  try {
    const filas = hojaAObj(getContenido(), 'Asesorias')
      .filter(f => String(f.materia_id).trim() === String(materia_id).trim());
    if (filas.length && filas[0].email_profesor) return String(filas[0].email_profesor).trim();
  } catch(e) {}
  return EMAIL_DOCENTE;
}

function guardarCita(p) {
  const hoja = getBackend().getSheetByName('Asesorias_Citas');
  if (!hoja) return;
  const tz  = Session.getScriptTimeZone();
  const hoy = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy');

  // Validar 72 horas de anticipación
  if (p.fecha_iso) {
    const fechaCita = new Date(p.fecha_iso);
    const ahora     = new Date();
    const diffHrs   = (fechaCita - ahora) / (1000 * 60 * 60);
    if (diffHrs < 72) {
      throw new Error('La cita debe solicitarse con al menos 72 horas de anticipación');
    }
  }

  // Calcular fecha legible (prioriza la fecha concreta que manda la app)
  let fechaLabel = p.dia ? `${p.dia} ${p.hora}` : '';
  if (p.fecha) fechaLabel = `${p.dia||''} ${p.fecha}${p.hora ? ' · '+p.hora : ''}`.trim();
  if (p.fecha_iso) {
    try {
      fechaLabel = Utilities.formatDate(new Date(p.fecha_iso), tz, 'EEEE dd/MM/yyyy HH:mm');
    } catch(e) {}
  }

  // Guardar en Sheets
  hoja.appendRow([
    p.boleta         || '',
    p.nombre_alumno  || '',
    p.grupo          || '',
    p.materia_id     || '',
    hoy,                           // fecha_solicitud
    fechaLabel,                    // fecha_cita
    p.hora           || '',
    p.lugar          || '',
    'Confirmada',                  // Auto-aprobada
    `Modalidad: ${p.modalidad||''}. Puntos alumno: ${p.puntos_alumno||0}`
  ]);

  // Obtener email del docente
  const emailDoc = getEmailDocente(p.materia_id);

  // Enviar correo de notificación
  try { enviarCorreoCita(p, emailDoc, fechaLabel); } catch(e) { Logger.log('Email error: ' + e.message); }

  // Crear evento en Google Calendar
  try { crearEventoCalendario(p, emailDoc); } catch(e) { Logger.log('Calendar error: ' + e.message); }
}

function enviarCorreoCita(p, emailDoc, fechaLabel) {
  const asunto = `SDGo! — Nueva cita de asesoría: ${p.nombre_alumno||p.boleta} · ${p.materia_nombre||p.materia_id}`;

  const cuerpo = `Hola, Profra. Natisma López Salas,

Se ha registrado una nueva solicitud de cita de asesoría a través de SDGo!

─── DATOS DEL ALUMNO ───────────────────────────
Nombre:    ${p.nombre_alumno || p.boleta}
Boleta:    ${p.boleta}
Grupo:     ${p.grupo}
Correo:    ${p.email_alumno || 'No proporcionado'}

─── DATOS DE LA CITA ───────────────────────────
Materia:   ${p.materia_nombre || p.materia_id}
Fecha:     ${fechaLabel}
Modalidad: ${p.modalidad || 'Por confirmar'}
Lugar:     ${p.lugar || '—'}
Puntos restantes del alumno: ${p.puntos_alumno || 0} pts

─── ESTADO ─────────────────────────────────────
✅ Cita registrada a través de SDGo! (puntos canjeados por la asesoría). Saldo restante del alumno: ${p.puntos_alumno||0} pts.

La solicitud ha sido registrada en la hoja Asesorías_Citas del SDGo_Backend.
Se ha creado un evento en tu Google Calendar (si los permisos lo permiten).

─── MATERIAL DE APOYO (para el alumno) ─────────
Lleva tus dudas concretas. Apóyate en:
• Lista de cotejo: https://natismalopez.github.io/sdgo/fichas/lista-cotejo-asesoria.pdf
• Problemario de práctica: https://natismalopez.github.io/sdgo/fichas/problemario-lp.pdf

— SDGo! · CECyT 9 "Juan de Dios Bátiz" · IPN`;

  // CC: coordinación + el propio alumno (si dejó correo)
  const cc = [EMAIL_COORDINACION];
  if (p.email_alumno && /@/.test(p.email_alumno)) cc.push(String(p.email_alumno).trim());

  MailApp.sendEmail({
    to:      emailDoc,
    cc:      cc.join(','),
    subject: asunto,
    body:    cuerpo
  });
}

function crearEventoCalendario(p, emailDoc) {
  if (!p.fecha_iso) return;

  const inicio  = new Date(p.fecha_iso);
  const fin     = new Date(inicio.getTime() + 30 * 60 * 1000); // 30 minutos

  const titulo  = `Asesoría SDGo! — ${p.nombre_alumno||p.boleta} — ${p.materia_nombre||p.materia_id}`;
  const descr   = `Alumno: ${p.nombre_alumno||p.boleta}
Boleta: ${p.boleta}
Grupo: ${p.grupo}
Materia: ${p.materia_nombre||p.materia_id}
Modalidad: ${p.modalidad||'Por confirmar'}
Correo alumno: ${p.email_alumno||'No proporcionado'}
Puntos restantes: ${p.puntos_alumno||0}

Generado automáticamente por SDGo! · CECyT 9 IPN`;

  // Crear en el calendario del docente (quien ejecuta el script).
  // NOTA: NO se invita al alumno como invitado de Calendar para evitarle la fricción
  // de "evento de remitente desconocido / denunciar spam". Al alumno se le informa por
  // correo (va en CC del MailApp). El evento queda en el calendario de la docente/coordinación.
  const invitados = [EMAIL_COORDINACION];
  if (emailDoc && /@/.test(emailDoc)) invitados.push(String(emailDoc).trim());
  const loc = p.lugar || (p.modalidad==='Google Meet' ? 'Google Meet (enlace por confirmar)' : 'CECyT 9');

  // Cita PRESENCIAL: se omite el enlace de Google Meet. Para evitar el Meet que Google
  // agrega solo, se usa la API avanzada de Calendar (Servicios → Calendar API). Si el
  // servicio avanzado no está activado, se cae al método normal (puede aparecer Meet).
  let eventoId = '';
  try {
    if (typeof Calendar !== 'undefined' && Calendar.Events) {
      const tz = Session.getScriptTimeZone();
      const recurso = {
        summary: titulo,
        description: descr,
        location: loc,
        start: { dateTime: Utilities.formatDate(inicio, tz, "yyyy-MM-dd'T'HH:mm:ss"), timeZone: tz },
        end:   { dateTime: Utilities.formatDate(fin,    tz, "yyyy-MM-dd'T'HH:mm:ss"), timeZone: tz },
        attendees: invitados.map(e => ({ email: e })),
        // sin conferenceData = sin Meet en presenciales
      };
      const creado = Calendar.Events.insert(recurso, 'primary', { sendUpdates: 'all', conferenceDataVersion: 1 });
      eventoId = creado.id;
    } else {
      const evento = CalendarApp.getDefaultCalendar().createEvent(titulo, inicio, fin, {
        description: descr, guests: invitados.join(','), sendInvites: true, location: loc
      });
      eventoId = evento.getId();
    }
  } catch (e) {
    // Respaldo seguro si la API avanzada falla
    const evento = CalendarApp.getDefaultCalendar().createEvent(titulo, inicio, fin, {
      description: descr, guests: invitados.join(','), sendInvites: true, location: loc
    });
    eventoId = evento.getId();
  }

  Logger.log('Evento creado: ' + eventoId);
}

// ── Autorización de permisos (Gmail + Calendar) ───────────────────────
// Ejecuta esta función UNA VEZ desde el editor de Apps Script. Google mostrará
// la pantalla para autorizar el envío de correos y el acceso al calendario.
// Manda un correo de prueba y crea (y borra) un evento, para comprobar que todo sirve.
function autorizarPermisos() {
  // 1) Gmail
  MailApp.sendEmail({
    to: EMAIL_DOCENTE,
    subject: 'SDGo! — Prueba de permisos (correo)',
    body: 'Este es un correo de prueba de SDGo!. Si lo recibiste, el envío de correos ya funciona.'
  });
  Logger.log('✅ Correo de prueba enviado a ' + EMAIL_DOCENTE);

  // 2) Calendar (crea un evento de prueba dentro de 1 hora y lo elimina enseguida)
  const ini = new Date(Date.now() + 60*60*1000);
  const fin = new Date(ini.getTime() + 30*60*1000);
  const ev = CalendarApp.getDefaultCalendar().createEvent('SDGo! — Prueba de permisos (calendar)', ini, fin);
  Logger.log('✅ Evento de prueba creado: ' + ev.getId());
  ev.deleteEvent();
  Logger.log('✅ Evento de prueba eliminado. Permisos de Gmail y Calendar autorizados.');
}


// ════════════════════════════════════════════════════════════
// PROGRESO Y PUNTOS POR ALUMNO
// ════════════════════════════════════════════════════════════
// Valor en puntos de un tema según su MEJOR calificación (no acumula por repetir):
// 100% = 75, ≥80% = 50, menos = 0.
function valorTemaPts(pct) {
  const p = Number(pct)||0;
  return p>=100 ? 75 : p>=80 ? 50 : 0;
}
function leerProgresoAlumno(boleta) {
  // Leer progreso de temas
  const filasP = hojaAObj(getBackend(), 'Progreso')
    .filter(f => String(f.boleta).trim() === String(boleta).trim());

  const progreso = {};
  filasP.forEach(f => {
    const mid = String(f.materia_id).trim();
    if (!progreso[mid]) progreso[mid] = { temas: 0, temasAprobados: {}, puntosTema: {} };
    const ti = Number(f.tema_idx);
    // Mejor por tema → puntos del tema (para que la app calcule la MEJORA y no reacumule)
    progreso[mid].puntosTema[ti] = valorTemaPts(Number(f.calificacion_mejor)||0);
    if (String(f.completado).toUpperCase() === 'SI') {
      progreso[mid].temasAprobados[ti] = true;
      progreso[mid].temas = Math.max(progreso[mid].temas, ti + 1);
    }
  });

  // Resumen por materia desde Resultados (1 fila por materia): puntos + promedio
  const filasR = hojaAObj(getBackend(), 'Resultados')
    .filter(f => String(f.boleta).trim() === String(boleta).trim());

  // ── SALDO desde el LIBRO DE MOVIMIENTOS (fuente de verdad) ──
  // Siembra única para no perder puntos previos (Resultados ganado + Canjes gastado).
  seedLedgerSiVacio(boleta);
  const ledger = saldoLedger(boleta);
  const puntosPorMateria = ledger.porMat;
  const puntosCoherente = Object.values(puntosPorMateria).reduce((a,b)=>a+b, 0);
  const puntosGastados = ledger.gastado;
  const promedios = {};
  filasR.forEach(f => {
    const m = String(f.materia_id).trim();
    if (m) promedios[m] = Number(f.promedio) || 0;
  });
  const prom = filasR.map(f => Number(f.promedio)||0).filter(v=>v>0);
  const promedioGlobal = prom.length ? Math.round(prom.reduce((a,c)=>a+c,0)/prom.length) : 0;

  const logros = filasR
    .slice(-20)
    .reverse()
    .map(f => ({
      t: `${f.materia_nombre || f.materia_id} — promedio ${f.promedio || 0}`,
      pts: `${f.puntos || 0} pts`,
      f: f.fecha || ''
    }));

  const tz_=Session.getScriptTimeZone();
  return { progreso, puntos: puntosCoherente, puntosPorMateria, puntosCanjeados: puntosGastados, promedios, promedioGlobal, logros,
           tiempoHoy: tiempoHoyServidor(boleta), fechaHoy: Utilities.formatDate(new Date(),tz_,'yyyy-MM-dd') };
}

// ════════════════════════════════════════════════════════════
// FUNCIÓN DE PRUEBA — Ejecutar manualmente para verificar
// ════════════════════════════════════════════════════════════
function probar() {
  Logger.log('=== Probando conexión a SDGo_Contenido ===');
  const materias    = leerMaterias();
  const temas       = leerTemas();
  const reactivos   = leerReactivos();
  const asesorias   = leerAsesorias();
  const recompensas = leerRecompensas();
  Logger.log('Materias activas: '   + materias.length + ' → ' + materias.map(m=>m.id).join(', '));
  Logger.log('Temas por materia: '  + JSON.stringify(Object.keys(temas).map(k=>k+':'+temas[k].length)));
  const reacResumen = Object.keys(reactivos).map(k => {
    const temas = Object.keys(reactivos[k]);
    return k + ':' + temas.map(t => 't'+t+'='+reactivos[k][t].length).join(',');
  }).join(' | ');
  Logger.log('Reactivos por tema: ' + reacResumen);
  Logger.log('Asesorías: '          + asesorias.length);
  Logger.log('Recompensas: '        + recompensas.length);
  Logger.log('');
  Logger.log('=== Probando conexión a SDGo_Backend ===');
  const config = leerConfiguracion();
  const alumnos = hojaAObj(getBackend(), 'Alumnos');
  Logger.log('Semestre activo: '    + config.semestre_activo);
  Logger.log('Alumnos (filas): '   + alumnos.length);
  Logger.log('');
  Logger.log('✅ Conexión exitosa. El Apps Script está listo para publicar.');
  Logger.log('Email docente default: ' + EMAIL_DOCENTE);
  Logger.log('Email coordinación: ' + EMAIL_COORDINACION);
}
