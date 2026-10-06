# Tutor adaptativo — análisis, arquitectura y alcance del MVP

> Regla de diseño: cada decisión responde a «¿esto ayuda al niño a comprender y aprender, o solo hace que la app se vea más bonita?». La estética quedó en último lugar de prioridades.

## 1. Requisitos → qué significan en el sistema

| Requisito del encargo | Traducción técnica |
|---|---|
| El tutor no da la respuesta; descubre qué piensa el niño | La sesión **empieza con un diagnóstico previo** (1–3 preguntas según el tamaño del material). El contenido no se muestra hasta después. |
| Material → exploración → diagnóstico → explicación adaptada → práctica → explicación del niño → aplicación → recuperación | Máquina de estados en `engine/pedagogy.js` (`prior → read → explain → [contrast/retry/teach] → apply → reexplain → wrap`) + `engine/review.js`. |
| Respuesta ≠ correcto/incorrecto | `engine/diagnosis.js` produce un objeto con resultado (correcta, parcial, confusión, sin conocimiento, problema de comprensión/aplicación), dimensiones (conocimiento, comprensión, conexión, aplicación, recuperación), ideas cubiertas/ausentes, confusión probable, señales, **observación vs. interpretación** y confianza. |
| Ayuda progresiva | 4 niveles (pista → ejemplo → paso a paso → explicación completa) + «volver a estudiar» + «de otra manera». No se puede saltar de nivel; usar ayuda baja el valor de la evidencia. |
| Usar el error para diseñar la siguiente actividad | Cada error conceptual conocido lleva una actividad de **contraste** (A/B[/contraejemplo]) y, en universidad, un **análisis del error** (qué intentó, dónde se rompió, qué confundió, cómo razonar). |
| Perfil sin etiquetas fijas | `engine/profile.js`: observaciones con evidencia fechada; la interpretación solo aparece con ≥2 evidencias y siempre en condicional. Nunca «es visual». |
| Personalización | `adaptation(learner)`: tamaño de fragmento, ayuda sugerida, preguntas más profundas, ejercicios extra de aplicación, ritmo de repasos, autonomía. Umbrales prudentes (≥2 evidencias). |
| Intereses del niño sin inventarlos | Solo se usan si el niño los eligió (chips al terminar una sesión; puede saltarlo). |
| Atención sostenida, no entretenimiento | Fragmentos pequeños, pausa de lectura (configurable por el adulto), momentos de escribir/reflexionar, sin puntos ni rankings. |
| Recuperación espaciada | `review.js`: 6 intervalos (1, 3, 7, 14, 30, 60 días). El repaso pregunta «¿te acuerdas…?» **sin re-enseñar**; el resultado decide el próximo intervalo. |
| Mapa de conocimiento | Por concepto: qué sabe, qué comprende, qué confunde, qué puede hacer, qué no, qué ayuda funcionó, qué practicar (`conceptReport`). |
| Vista del adulto | PIN, resumen, ficha por concepto, perfil (observación/interpretación), detalle paso a paso de cada sesión, exámenes, exportar/borrar. |
| Modo examen | `engine/exam.js`: diagnóstico → práctica por niveles (recordar → … → tipo examen; en universidad + comparar, casos nuevos, sin ayuda); centrado en lo débil; no revela la respuesta al primer fallo. |
| Autonomía | Nivel 0–3: «Te puedo ayudar» → «¿qué intentarías?» → «¿qué estrategia?» → «inténtalo tú». Con autonomía ≥2 la primera petición de pista se responde con una invitación a elegir estrategia. Sube con sesiones de poca ayuda, baja si hace falta explicación completa. |
| Modo universitario (U1–U12) | Mismo motor, secuencia distinta: autoevaluación («me suena» ≠ «puedo explicarlo») → contexto/por qué importa/requisitos → idea intuitiva → lenguaje técnico + 3 niveles (intuitivo/formal/académico) + condiciones y límites → cómo funciona y por qué → ejemplo completo razonado → ejercicios con ayuda decreciente (guiado → parcial → independiente) → cierre U10 (puedo explicar / aplicar / confundo / memorizar / repasar / próxima acción) y estados 🟢 Comprendo · 🟡 Reconozco · 🔴 No lo comprendo. Una definición recitada del texto se trata como memorización, no comprensión (U2). |

## 2. Arquitectura

```
public/                       Interfaz (HTML + JS sin build, sin dependencias, sin CDN)
  js/views/*.js               Inicio · Estudiar · Sesión (chat de tutor) · Mapa · Examen · Zona adulta
server/
  index.js                    HTTP + estáticos (solo 127.0.0.1 por defecto, CSP estricta)
  service.js                  Orquestación, PIN adulto, exportar/borrar, reloj simulado
  store.js                    Persistencia: un archivo JSON (escritura atómica)
  engine/
    pedagogy.js               MOTOR PEDAGÓGICO  (qué preguntar, cuándo explicar/dar pista/contrastar)
    diagnosis.js              MOTOR DE DIAGNÓSTICO (clasifica respuestas)
    profile.js                PERFIL DE APRENDIZAJE (evidencia, estado del concepto, adaptación)
    review.js                 MOTOR DE REVISIÓN (repetición espaciada)
    exam.js                   MODO EXAMEN
    material.js               Material → lección (tema, fragmentos, ideas clave)
    llm.js                    Proveedor de IA opcional (SDK oficial de Anthropic)
    text.js                   Utilidades de texto en español
  packs/                      Conocimiento pedagógico curado (errores típicos, ayudas, tareas)
tests/                        48 pruebas (node:test) + demo narrada
```

Separación pedida: *interfaz* (`public/`), *motor pedagógico*, *motor de diagnóstico*, *perfil*, *motor de revisión* y *modo examen* son módulos independientes; los motores son funciones puras sobre JSON (sin E/S), por eso son deterministas y testeables. Stack: **Node 22 sin dependencias obligatorias** + JS de navegador sin build. Se descartó React/ORM/base de datos externa: añadirían superficie sin ayudar al aprendizaje; el archivo JSON se sustituye por una base de datos detrás de `Store` cuando haga falta.

## 3. Qué es real y qué es simulado en el MVP

**Real (funciona y está probado)**
- Flujo completo: material → diagnóstico previo → lectura por partes → explicación del niño → análisis → contraste/pista/enseñanza dirigida → nuevo intento → aplicación → reexplicación → resumen → repaso al día siguiente.
- Ayuda progresiva con gating, credit de «qué ayuda funcionó», autonomía, intereses opt-in.
- Perfil con observaciones/interpretaciones y adaptación del tamaño de fragmento y de la ayuda sugerida.
- Estados de concepto, mapa de conocimiento, vista adulta, modo examen, PIN, exportar/borrar datos, reloj simulado para demostrar repasos.
- Modo universitario completo con un paquete de ejemplo (valor p).

**Simulado / limitado (y dicho con honestidad en la interfaz)**
- **Análisis de respuestas**: sin IA es *heurístico* (palabras clave por idea, patrones de errores conocidos, solapamiento con el texto). Funciona bien con los **4 temas curados** (texto expositivo, fracciones, rotación/traslación, valor p) y de forma básica con material nuevo (ideas clave extraídas de las frases más relevantes; no detecta errores conceptuales que no estén en un paquete). Con IA externa activada (`ANTHROPIC_API_KEY` + interruptor del adulto) el modelo refina el diagnóstico y analiza el material. **Esa ruta se probó solo con un cliente simulado**, no contra la API real (no había clave).
- **Contexto, intuición y ejemplos para material arbitrario en universidad**: el tutor solo puede *generarlos* con IA; sin ella, para material propio pide al estudiante que los formule.
- **Imágenes y mapas**: ilustraciones SVG esquemáticas para los temas curados (pizza, rotación, órbita). No hay recuperación de imágenes reales ni mapas.
- **Foto del material (OCR)**: requiere IA externa; sin ella se informa y se pide escribir el texto.
- **Dibujo**: el niño dibuja y escribe una frase; se analiza solo la frase.
- **Preguntas tipo verdadero/falso y similares en examen** se reducen a las tareas de cada tema; el generador de ítems depende de las tareas del paquete.
- **Persistencia**: archivo JSON local; sin cuentas ni sincronización.

## 4. Privacidad y seguridad (decisiones)

- Datos mínimos: apodo, nivel, intereses elegidos; sin apellidos, correo, ubicación ni fotos. Sin analíticas ni publicidad; los datos educativos no se usan para publicidad.
- Todo local; el servidor escucha solo en `127.0.0.1` salvo `HOST` explícito.
- Zona adulta con PIN (scrypt, bloqueo tras 5 intentos); exportar JSON, reiniciar progreso, borrar sesión o perfil completo (elimina sesiones, materiales y exámenes).
- IA externa **apagada por defecto**; requiere clave en el servidor *y* activación por un adulto; solo envía texto del material y respuesta (nunca nombre ni edad); cualquier fallo vuelve al motor local.
- Interfaz sin `innerHTML` (texto del niño/material no puede inyectar HTML), CSP `default-src 'self'`, recorrido de rutas bloqueado, aislamiento entre perfiles.

## 5. Siguientes pasos recomendados

1. Probar con niños reales las preguntas y la calibración de umbrales (cobertura 0,7 = «correcta»; 0,35 = «parcial»).
2. Conectar y evaluar la IA real (diagnóstico y análisis de material) con un conjunto de respuestas etiquetadas por docentes.
3. Más paquetes curados / un editor para que docentes añadan errores típicos.
4. Cuentas de adulto con sincronización y base de datos real.
