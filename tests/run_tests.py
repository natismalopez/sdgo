# -*- coding: utf-8 -*-
"""
SDGo! — Batería de pruebas automatizadas
Uso:  python3 tests/run_tests.py            (desde la carpeta del proyecto)
      python3 tests/run_tests.py --rapido   (solo verificaciones estáticas, sin navegador)

Corre esto ANTES de publicar cada versión. Si algo sale ✗, no publiques.
"""
import re, io, os, sys, json, subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(RAIZ)
RES = {"ok": 0, "fail": 0}
FALLAS = []

def check(nombre, cond, detalle=""):
    if cond:
        RES["ok"] += 1
        print(f"  ✓ {nombre}")
    else:
        RES["fail"] += 1
        FALLAS.append(nombre + (f" — {detalle}" if detalle else ""))
        print(f"  ✗ {nombre}" + (f" — {detalle}" if detalle else ""))

def leer(p):
    return io.open(p, encoding="utf-8").read()

# ════════════════ 1. VERIFICACIONES ESTÁTICAS ════════════════
print("\n═══ 1. Verificaciones estáticas ═══")
import glob as _glob
_bk = sorted(_glob.glob("SDGo_AppsScript_v*.js"), key=lambda f: int(re.search(r"v(\d+)", f).group(1)))
BACKEND = _bk[-1] if _bk else "SDGo_AppsScript_v7.js"
html = leer("index.html")
js = max(re.findall(r"<script>(.*?)</script>", html, re.S), key=len)

# 1.1 Sintaxis JS de la app
io.open("/tmp/_sdgo_app.js", "w", encoding="utf-8").write(js)
r = subprocess.run(["node", "--check", "/tmp/_sdgo_app.js"], capture_output=True, text=True)
check("Sintaxis JS de index.html", r.returncode == 0, r.stderr.strip()[:120])

# 1.2 Sintaxis de sw.js y backend
for f in ["sw.js", BACKEND]:
    if os.path.exists(f):
        r = subprocess.run(["node", "--check", f], capture_output=True, text=True)
        check(f"Sintaxis de {f}", r.returncode == 0, r.stderr.strip()[:120])

# 1.3 manifest.json válido y con íconos existentes
try:
    man = json.load(open("manifest.json"))
    check("manifest.json válido", True)
    for ic in man.get("icons", []):
        check(f"ícono {ic['src']} existe", os.path.exists(ic["src"]))
except Exception as e:
    check("manifest.json válido", False, str(e))

# 1.4 sdgo_index.html idéntico a index.html
if os.path.exists("sdgo_index.html"):
    check("sdgo_index.html idéntico a index.html", leer("sdgo_index.html") == html)
else:
    check("sdgo_index.html existe", False)

# 1.5 Versión del Service Worker: formato + registro de versión publicada
m = re.search(r"const CACHE = 'sdgo-v(\d+)'", leer("sw.js"))
check("sw.js declara versión sdgo-vNN", bool(m))
if m:
    v = int(m.group(1))
    reg = os.path.join("tests", "VERSION_PUBLICADA.txt")
    if os.path.exists(reg):
        prev = int(open(reg).read().strip() or 0)
        check(f"Versión SW (v{v}) > última publicada (v{prev})", v > prev,
              "sube la versión del SW antes de publicar")
    else:
        print(f"  · (primera corrida: registra v{v} tras publicar con --publicada)")

# 1.6 IDs literales duplicados en el HTML
ids = re.findall(r'id="([^"$]+)"', html)
dup = sorted({i for i in ids if ids.count(i) > 1})
check("Sin IDs duplicados en el HTML", not dup, ", ".join(dup[:5]))

# 1.7 onclick → funciones definidas
defs = set(re.findall(r"function\s+([A-Za-z_$][\w$]*)", js))
defs |= set(re.findall(r"(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()", js))
IGNORAR = {"getElementById", "includes", "remove", "toggle", "alert", "confirm", "querySelector"}
faltan = set()
for h in re.findall(r'on(?:click|change|input)="([^"]+)"', html):
    for fn in re.findall(r"(?<![.\w])([A-Za-z_$][\w$]*)\s*\(", h):
        if fn not in defs and fn not in IGNORAR:
            faltan.add(fn)
check("Todos los onclick llaman funciones existentes", not faltan, ", ".join(sorted(faltan)[:5]))

# 1.8 Paridad de acciones frontend ↔ backend
if os.path.exists(BACKEND):
    back = leer(BACKEND)
    f_post = set(re.findall(r"accion:\s*'([a-z]+)'", html))
    f_get = set(re.findall(r"[?&]accion=([a-z]+)", html))
    b_acc = set(re.findall(r"accion\s*===?\s*'([a-z]+)'", back))
    sin_back = (f_post | f_get) - b_acc
    check("Toda acción del frontend existe en el backend", not sin_back, ", ".join(sin_back))

# 1.9 Guardas de regresión: cosas que NO deben volver a aparecer
PROHIBIDO = ["registrarIntentoCap", "cap-warning", "no se permiten capturas",
             "No se permiten capturas"]
presentes = [p for p in PROHIBIDO if p in html]
check("Sin código/texto retirado (detección de capturas)", not presentes, ", ".join(presentes))

# 1.10 Sin datos de prueba hardcodeados en la app
html_sin_placeholder = re.sub(r'placeholder="[^"]*"', "", html)
check("Sin boletas de prueba en el código (fuera de placeholders)",
      "2024630001" not in html_sin_placeholder and "2025090123" not in html_sin_placeholder)

# 1.11 Piezas críticas presentes (inventario funcional mínimo)
PIEZAS = {
    "Autoevaluación en rama de la hoja": "autoeval(temaActivoGuia",
    "Autoevaluación (función que guarda)": "function autoeval(",
    "Botón Enviar del cuestionario": 'id="btn-enviar"',
    "Selección previa de opción": "function seleccionarOpcion",
    "Envío de respuesta": "function enviarRespuesta",
    "Persistencia de sesión": "sdgo_sesion",
    "Restauración de sesión": "function restaurarSesion",
    "Manejo del botón atrás": "addEventListener('popstate'",
    "Modal de confirmación de salida": "function confirmarSalida",
    "Onboarding (recorrido)": "function mostrarOnboarding",
    "Aviso de boleta en onboarding": "Tu boleta en el examen",
    "Nota de marca de agua en el quiz": "honestidad académica",
    "Marca de agua": "function activarMarcaAgua",
    "Tapa al minimizar": "visibilitychange",
    "Barajado de preguntas y opciones": "function barajar",
    "Desbloqueo por fecha (planeación)": "function motivoBloqueo",
    "Fichas con video de YouTube": "function ytId",
    "Momentos pedagógicos (bloque pregunta con respuesta oculta)": "t==='pregunta'",
    "Compilador solo cuando la solución es código": "const esCodigo=",
    "Descarga de la tarjeta de repaso por tema": "Descargar tarjeta de repaso",
    "Temas agrupados por unidad didáctica": "function gruposUnidad(",
    "Subtítulo con la unidad en curso": "subtituloMateria(curMat)",
    "Constancia al completar cada unidad": "generarConstancia('unidad'",
    "Constancia al completar el curso": "generarConstancia('curso'",
    "Pie de figura en los reactivos del cuestionario": "const capHtml=preg.cap",
}
for nombre, aguja in PIEZAS.items():
    check(f"Pieza: {nombre}", aguja in html)

# 1.12 Opacidad mínima de la marca de agua (legible)
mo = re.search(r"fill='rgba\(123,17,53,([0-9.]+)\)'", html)
check("Marca de agua con opacidad ≥ 0.25", bool(mo) and float(mo.group(1)) >= 0.25,
      f"actual: {mo.group(1) if mo else 'no encontrada'}")

modo_rapido = "--rapido" in sys.argv
if "--publicada" in sys.argv and m:
    open(os.path.join("tests", "VERSION_PUBLICADA.txt"), "w").write(str(v))
    print(f"\n· Registrada v{v} como versión publicada.")

# ════════════════ 2. PRUEBAS FUNCIONALES (navegador) ════════════════
if not modo_rapido:
    print("\n═══ 2. Pruebas funcionales (navegador con API simulada) ═══")
    sys.path.insert(0, os.path.join(RAIZ, "tests"))
    import mock_api
    mock_api.build("index.html", "/tmp/_sdgo_test.html")
    from playwright.sync_api import sync_playwright

    CHROME = os.environ.get("SDGO_CHROME",
        "/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome")
    ARGS = ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
    URL = "file:///tmp/_sdgo_test.html"
    B_OK, G_OK, B_MAL = mock_api.BOLETA_OK, mock_api.GRUPO_OK, mock_api.BOLETA_MAL

    def nueva(pg):
        pg.goto(URL, wait_until="domcontentloaded"); pg.wait_for_timeout(1500)

    def login(pg, boleta=None, grupo=None, saltar_onb=True):
        if saltar_onb: pg.evaluate("localStorage.setItem('sdgo_onb','1')")
        pg.evaluate(f"document.getElementById('li-boleta').value='{boleta or B_OK}';"
                    f"document.getElementById('li-grupo').value='{grupo or G_OK}';")
        pg.evaluate("doLogin()"); pg.wait_for_timeout(1400)

    def vista(pg):
        return pg.evaluate("document.querySelector('.view.active')?.id")

    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=ARGS)
        pg = b.new_page(viewport={"width": 430, "height": 900})

        # T1 — Login válido entra al Inicio
        nueva(pg); login(pg)
        check("T1 Login válido → Inicio (v-dash)", vista(pg) == "v-dash", f"quedó en {vista(pg)}")

        # T2 — Boleta no registrada NO entra al Inicio
        nueva(pg); pg.evaluate("localStorage.clear()"); nueva(pg); login(pg, boleta=B_MAL)
        check("T2 Boleta no registrada no llega al Inicio", vista(pg) != "v-dash", f"vista {vista(pg)}")

        # T3 — Sesión persistida: recargar entra directo
        nueva(pg); login(pg)
        nueva(pg); pg.wait_for_timeout(900)
        check("T3 Sesión restaurada tras recargar", vista(pg) == "v-dash", f"quedó en {vista(pg)}")

        # T4 — Atrás interno: de materia regresa a Inicio
        pg.evaluate("abrirMateria('lp')"); pg.wait_for_timeout(300)
        pg.evaluate("window.dispatchEvent(new PopStateEvent('popstate'))"); pg.wait_for_timeout(300)
        check("T4 Atrás desde materia regresa a Inicio", vista(pg) == "v-dash", f"quedó en {vista(pg)}")

        # T5 — Atrás en Inicio abre modal; 'Quedarme' conserva la app
        pg.evaluate("window.dispatchEvent(new PopStateEvent('popstate'))"); pg.wait_for_timeout(300)
        modal = pg.evaluate("!!document.getElementById('sdgo-overlay') && /Salir de SDGo/.test(document.body.innerText)")
        check("T5a Atrás en Inicio muestra confirmación de salida", modal)
        pg.evaluate("cerrarOverlay()"); pg.wait_for_timeout(200)
        check("T5b 'Quedarme' conserva la sesión en Inicio", vista(pg) == "v-dash")

        # T6 — Cuestionario: seleccionar no califica; Enviar califica
        pg.evaluate("abrirMateria('lp'); temaActivoGuia=0; iniciarCuestionario();"); pg.wait_for_timeout(400)
        pg.evaluate("seleccionarOpcion(0)"); pg.wait_for_timeout(150)
        sin_calificar = pg.evaluate("document.getElementById('fb-area').innerHTML.trim()===''")
        marcada = pg.evaluate("document.getElementById('opt-0').classList.contains('sel')")
        pg.evaluate("seleccionarOpcion(1)"); pg.wait_for_timeout(150)
        cambio = pg.evaluate("document.getElementById('opt-1').classList.contains('sel') && !document.getElementById('opt-0').classList.contains('sel')")
        check("T6a Seleccionar marca la opción y NO califica", sin_calificar and marcada)
        check("T6b Se puede cambiar la selección antes de enviar", cambio)
        pg.evaluate("enviarRespuesta()"); pg.wait_for_timeout(250)
        califico = pg.evaluate("document.getElementById('fb-area').innerHTML.trim()!==''")
        avanza = pg.evaluate("getComputedStyle(document.getElementById('btn-sig')).display!=='none' || getComputedStyle(document.getElementById('btn-fin')).display!=='none'")
        check("T6c Enviar califica y muestra retroalimentación", califico)
        check("T6d Aparece Siguiente/Finalizar tras enviar", avanza)

        # T7 — Marca de agua activa y nota visible en el quiz
        wm = pg.evaluate("document.getElementById('wm-overlay').classList.contains('activo')")
        nota = pg.evaluate("/honestidad académica/.test(document.getElementById('v-quiz').innerText)")
        check("T7a Marca de agua activa durante el cuestionario", wm)
        check("T7b Nota de la marca de agua visible", nota)

        # T8 — Terminar cuestionario llega a resultado y envía POST
        pg.evaluate("sigPregunta()"); pg.wait_for_timeout(250)
        pg.evaluate("seleccionarOpcion(2); enviarRespuesta();"); pg.wait_for_timeout(250)
        pg.evaluate("var f=document.getElementById('btn-fin'); if(getComputedStyle(f).display!=='none') f.click(); else document.getElementById('btn-sig').click();")
        pg.wait_for_timeout(700)
        check("T8a Al finalizar llega a Resultado (v-res)", vista(pg) == "v-res", f"quedó en {vista(pg)}")
        posts = pg.evaluate("window.__POSTS.map(p=>p.accion)")
        check("T8b Se envió el resultado al servidor", "resultado" in posts, f"POSTs: {posts}")

        # T9 — Autoevaluación visible en LOS 6 temas (fichas de la hoja)
        pg.evaluate("navRoot('v-dash')"); pg.wait_for_timeout(200)
        pg.evaluate("abrirMateria('lp')"); pg.wait_for_timeout(200)
        ok6 = True
        for t in range(6):
            pg.evaluate(f"abrirGuia({t})"); pg.wait_for_timeout(200)
            if not pg.evaluate("!!document.querySelector('#v-guia .autoeval')"):
                ok6 = False; break
        check("T9 Autoevaluación visible en los 6 temas", ok6, f"falla en tema {t+1}" if not ok6 else "")

        # T10 — Autoevaluación guarda y envía POST autoeval
        pg.evaluate("var b=document.querySelector('#v-guia .ae-btn'); if(b) b.click();"); pg.wait_for_timeout(300)
        posts = pg.evaluate("window.__POSTS.map(p=>p.accion)")
        check("T10 La autoevaluación envía registro al servidor", "autoeval" in posts, f"POSTs: {posts}")

        # T11 — Onboarding: primera vez, 5 pasos, cierra, no reaparece, reabrible
        pg2 = b.new_page(viewport={"width": 430, "height": 900})
        pg2.goto(URL, wait_until="domcontentloaded"); pg2.wait_for_timeout(1500)
        pg2.evaluate("localStorage.removeItem('sdgo_onb')")
        pg2.evaluate(f"document.getElementById('li-boleta').value='{B_OK}';document.getElementById('li-grupo').value='{G_OK}';doLogin()")
        pg2.wait_for_timeout(1600)
        check("T11a Onboarding aparece en el primer ingreso",
              pg2.evaluate("!!document.getElementById('sdgo-overlay') && /Bienvenido a SDGo/.test(document.body.innerText)"))
        check("T11b Onboarding tiene 5 pasos", pg2.evaluate("ONBOARDING.length") == 5)
        check("T11c Onboarding menciona la boleta/marca de agua",
              pg2.evaluate("ONBOARDING.some(s=>/boleta/i.test(s.t+s.d))"))
        for _ in range(6):
            if not pg2.evaluate("!!document.getElementById('sdgo-overlay')"): break
            pg2.evaluate("var n=[...document.querySelectorAll('#sdgo-overlay button')].find(x=>/Siguiente|Entendido/.test(x.textContent)); if(n)n.click();")
            pg2.wait_for_timeout(180)
        check("T11d Onboarding se cierra al terminar", pg2.evaluate("!document.getElementById('sdgo-overlay')"))
        pg2.evaluate("renderDash()"); pg2.wait_for_timeout(850)
        check("T11e Onboarding NO reaparece después", pg2.evaluate("!document.getElementById('sdgo-overlay')"))
        pg2.evaluate("abrirAyuda()"); pg2.wait_for_timeout(250)
        check("T11f '¿Cómo funciona?' reabre el recorrido",
              pg2.evaluate("/Bienvenido a SDGo/.test(document.body.innerText)"))

        # T12 — Barajado: el orden varía entre intentos y calificar sigue siendo correcto
        pg.evaluate("navRoot('v-dash'); abrirMateria('lp'); temaActivoGuia=0;")
        pg.wait_for_timeout(200)
        firmas = set()
        for _ in range(8):
            pg.evaluate("iniciarCuestionario()"); pg.wait_for_timeout(150)
            firmas.add(pg.evaluate("quiz.preguntas.map(q=>q.p+'|'+q.ops.join(',')).join('§')"))
            pg.evaluate("desactivarMarcaAgua(); showView('v-mat');")
        check("T12a El barajado produce órdenes distintos entre intentos", len(firmas) > 1,
              f"8 intentos produjeron {len(firmas)} orden(es)")
        pg.evaluate("iniciarCuestionario()"); pg.wait_for_timeout(200)
        pg.evaluate("seleccionarOpcion(quiz.preguntas[0].c); enviarRespuesta();"); pg.wait_for_timeout(250)
        bien = pg.evaluate("quiz.correctas===1")
        check("T12b Tras barajar, la opción correcta califica como correcta", bien)

        # T13 — Desbloqueo por fecha (planeación docente)
        pg.evaluate("""
          DATA.modosDesbloqueo={lp:'ambos'};
          DATA.fechaServidor='2026-08-15';
          DATA.fechasApertura={lp:{0:'2026-08-03',1:'2026-08-10',2:'2026-09-01'}};
          ST.progreso.lp={temas:2,intentos:{},temasAprobados:{0:true,1:true}};
        """)
        check("T13a Modo 'ambos': fecha pasada + tema anterior aprobado → abierto",
              pg.evaluate("temaDesbloqueado('lp',1)===true"))
        check("T13b Modo 'ambos': fecha FUTURA bloquea aunque el avance alcance",
              pg.evaluate("temaDesbloqueado('lp',2)===false && motivoBloqueo('lp',2)==='fecha'"))
        pg.evaluate("ST.progreso.lp.temasAprobados={0:true}; ST.progreso.lp.temas=1;")
        check("T13c Modo 'ambos': fecha pasada pero SIN aprobar el anterior → bloqueado por progreso",
              pg.evaluate("temaDesbloqueado('lp',2)===false && (DATA.fechasApertura.lp[2]='2026-08-01', motivoBloqueo('lp',2)==='progreso')"))
        pg.evaluate("DATA.modosDesbloqueo={lp:'progreso'}; DATA.fechasApertura={lp:{2:'2030-01-01'}}; ST.progreso.lp.temasAprobados={0:true,1:true};")
        check("T13d Modo 'progreso': ignora fechas (compatibilidad con lo actual)",
              pg.evaluate("temaDesbloqueado('lp',2)===true"))
        pg.evaluate("DATA.modosDesbloqueo={lp:'fecha'}; ST.progreso.lp.temasAprobados={};")
        check("T13e Modo 'fecha': abre por calendario sin exigir avance",
              pg.evaluate("temaDesbloqueado('lp',2)===false && (DATA.fechasApertura.lp[2]='2026-08-01', temaDesbloqueado('lp',2)===true)"))
        pg.evaluate("desactivarMarcaAgua(); navRoot('v-dash'); abrirMateria('lp');")
        pg.wait_for_timeout(200)
        pg.evaluate("""
          DATA.modosDesbloqueo={lp:'ambos'}; DATA.fechasApertura={lp:{1:'2030-01-01'}};
          ST.progreso.lp={temas:1,intentos:{},temasAprobados:{0:true}};
          curMat=DATA.materias.find(m=>m.id==='lp'); temaActivoGuia=null;
          window.__ULTIMO_TOAST=''; var _t=window.toast; window.toast=function(m){window.__ULTIMO_TOAST=m; _t(m);};
          iniciarCuestionario();
        """)
        pg.wait_for_timeout(250)
        check("T13f El cuestionario respeta la fecha (no abre y avisa cuándo se abre)",
              pg.evaluate("document.querySelector('.view.active')?.id!=='v-quiz' && /Se abre|se abre/.test(window.__ULTIMO_TOAST||'')"))

        # T14 — Ficha de video (YouTube embebido con modo privacidad)
        pg.evaluate("navRoot('v-dash'); abrirMateria('lp'); DATA.modosDesbloqueo={}; DATA.fechasApertura={}; abrirGuia(0);")
        pg.wait_for_timeout(350)
        check("T14a La ficha de video se muestra en la guía",
              pg.evaluate("!!document.querySelector('#v-guia iframe[src*=\"youtube-nocookie.com/embed/\"]')"))
        check("T14b El video usa el enlace correcto (ID extraído de youtu.be)",
              pg.evaluate("(document.querySelector('#v-guia iframe')||{}).src?.includes('dQw4w9WgXcQ')===true"))
        check("T14c ytId entiende todos los formatos de enlace",
              pg.evaluate("ytId('https://www.youtube.com/watch?v=abc123DEF45')==='abc123DEF45' && ytId('https://youtu.be/abc123DEF45')==='abc123DEF45' && ytId('https://www.youtube.com/shorts/abc123DEF45')==='abc123DEF45' && ytId('https://ejemplo.com/x')===''"))

        # T15 — Tutorial mejorado (contador de pasos y botón Atrás)
        pg.evaluate("localStorage.removeItem('sdgo_onb'); cerrarOverlay(); mostrarOnboarding(1);")
        pg.wait_for_timeout(250)
        check("T15a El tutorial muestra 'Paso X de N'",
              pg.evaluate("/Paso 2 de \\d/.test(document.getElementById('sdgo-overlay')?.innerText||'')"))
        pg.evaluate("var a=[...document.querySelectorAll('#sdgo-overlay button')].find(x=>/Atrás/.test(x.textContent)); if(a)a.click();")
        pg.wait_for_timeout(250)
        check("T15b El botón Atrás regresa al paso anterior",
              pg.evaluate("/Paso 1 de \\d/.test(document.getElementById('sdgo-overlay')?.innerText||'') && /Bienvenido/.test(document.body.innerText)"))
        pg.evaluate("cerrarOverlay(); localStorage.setItem('sdgo_onb','1');")

        b.close()

# ════════════════ RESUMEN ════════════════
print("\n" + "═" * 46)
total = RES["ok"] + RES["fail"]
print(f"RESULTADO: {RES['ok']}/{total} pruebas pasaron.")
if FALLAS:
    print("\nFALLAS a corregir antes de publicar:")
    for f in FALLAS:
        print(f"  ✗ {f}")
    sys.exit(1)
print("Todo en orden: la versión es publicable. ✅")
