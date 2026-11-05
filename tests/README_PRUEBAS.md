# SDGo! — Pruebas automatizadas

Batería de verificación para correr **antes de publicar cada versión**. Detecta regresiones
(como la de la autoevaluación que solo salía en el tema 1) sin depender de probar a mano.

## Qué cubre

**Verificaciones estáticas (28):** sintaxis de JS (app, sw.js, backend), manifest e íconos,
copia `sdgo_index.html` idéntica, versión del Service Worker subida respecto a la última
publicada, IDs duplicados, onclick→funciones existentes, paridad de acciones frontend↔backend,
guardas de regresión (código retirado que no debe volver), sin datos de prueba en el código,
inventario de piezas críticas (autoevaluación en ambas rutas, botón Enviar, sesión persistente,
botón atrás, modal de salida, onboarding con aviso de boleta, marca de agua ≥0.25, etc.).

**Pruebas funcionales en navegador (22):** con la API simulada (sin internet), prueba el flujo
real: login válido, bloqueo de boleta no registrada, restauración de sesión al recargar,
botón atrás interno, modal de salida, flujo seleccionar→Enviar→calificar→Siguiente, marca de
agua activa + nota, terminar cuestionario → resultado + envío al servidor, autoevaluación en
los 6 temas + envío, y onboarding completo (aparece 1.ª vez, 5 pasos, cierra, no reaparece,
reabrible).

## Cómo correr

```bash
# Desde la carpeta del proyecto (donde está index.html):
python3 tests/run_tests.py            # todo (estáticas + navegador)
python3 tests/run_tests.py --rapido   # solo estáticas (sin navegador, ~5 s)
```

- Si todo pasa: imprime `50/50 · la versión es publicable ✅` y termina con código 0.
- Si algo falla: lista las FALLAS y termina con código 1. **No publiques con fallas.**

Requisitos: Python 3 + `playwright` (pip install playwright) + Chrome/Chromium y Node.js
(para `node --check`). Si tu Chrome está en otra ruta: `SDGO_CHROME=/ruta/chrome python3 ...`.

## Flujo recomendado por versión (para no perder cambios)

1. Edita `index.html` (u otro archivo) partiendo SIEMPRE de la última versión publicada.
2. Corre `python3 tests/run_tests.py`.
3. La batería te obligará a: sincronizar `sdgo_index.html` (copia idéntica) y **subir la
   versión del Service Worker** (compara contra `tests/VERSION_PUBLICADA.txt`).
4. Cuando esté 100% en verde, sube a GitHub: `index.html`, `sdgo_index.html`, `sw.js`.
5. Registra la versión publicada: `python3 tests/run_tests.py --rapido --publicada`.

## Cómo agregar pruebas

- **¿Agregaste una función/pantalla?** Añade su "huella" al diccionario `PIEZAS` de
  `run_tests.py` (nombre → texto que debe existir en index.html). Con eso, si una versión
  futura la pierde, la batería lo grita.
- **¿Retiraste algo a propósito?** Agrégalo a la lista `PROHIBIDO` para que no regrese.
- **¿Nuevo flujo de usuario?** Copia el patrón de los tests T1–T11 (Playwright + mock).

## Archivos

- `run_tests.py` — la batería (estáticas + funcionales).
- `mock_api.py` — simulador de la API de Apps Script (datos de un alumno y 6 temas con
  ejercicio, para probar sin backend ni internet).
- `VERSION_PUBLICADA.txt` — última versión del SW que publicaste (la batería exige superarla).
