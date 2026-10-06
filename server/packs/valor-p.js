// Paquete curado nivel universitario: Estadística — valor p y contraste de hipótesis.
// Sigue la secuencia U1: contexto → intuición → lenguaje técnico → funcionamiento → ejemplo completo →
// reconstrucción (ayuda decreciente) → corrección del error como información.

export default {
  id: 'valor-p',
  match: ['valor p', 'p valor', 'p-valor', 'contraste de hipotesis', 'hipotesis nula', 'significancia estadistica', 'prueba de hipotesis'],
  subject: 'Estadística',
  level: 'university',
  title: 'Valor p y contraste de hipótesis',
  concepts: [
    {
      id: 'valor-p',
      name: 'Valor p',
      summary:
        'Probabilidad, calculada suponiendo que la hipótesis nula es cierta, de obtener un resultado al menos tan extremo como el observado.',
      prior: [
        '¿Qué problema crees que intenta resolver el valor p? Dilo aunque no tengas la definición formal.',
        'Si tuvieras que explicarlo hoy, ¿qué es un valor p? Escribe lo que recuerdes o intuyas, sin buscar nada.',
      ],
      selfRatingPrompt: '¿Qué tan familiar te resulta el valor p hoy?',
      analogies: {
        default:
          'Es como sospechar que una moneda está cargada: si fuera justa, ¿qué tan raro sería ver 9 caras en 10 lanzamientos?',
      },
      vocabulary: [
        { term: 'hipótesis nula (H0)', meaning: 'afirmación de «no hay efecto / no hay diferencia» que se pone a prueba' },
        { term: 'estadístico de prueba', meaning: 'número calculado con los datos (p. ej., z) que resume cuánto se alejan de H0' },
        { term: 'nivel de significancia (α)', meaning: 'umbral fijado de antemano para decidir si se rechaza H0' },
      ],
      uni: {
        prerequisites: ['Distribución normal y puntuaciones z', 'Distribución muestral de la media', 'Hipótesis nula y alternativa'],
        leadsTo: ['Intervalos de confianza', 'Tamaño del efecto', 'Potencia estadística', 'Comparaciones múltiples'],
        whyItMatters:
          'Sin esta idea, cualquier diferencia observada parecería prueba de un efecto. El valor p permite decidir cuánta evidencia hay contra «no pasó nada» y, con ello, si seguir investigando, repetir el estudio o adoptar una intervención. Si no existiera, la única forma de distinguir señal de ruido sería la intuición.',
        levels: {
          intuitive: 'Qué tan sorprendente sería mi dato si realmente no hubiera ningún efecto.',
          formal: 'p = P(T ≥ t_obs | H0) para una prueba de cola derecha, donde T es el estadístico de prueba.',
          academic:
            'Medida de incompatibilidad entre los datos y el modelo definido por H0. Evidencia contra H0; no es la probabilidad de H0 ni de que el resultado «se deba al azar».',
        },
        conditions: [
          'Depende del tamaño de la muestra: con n muy grande, efectos minúsculos dan p pequeños.',
          'Supone que se cumplen los supuestos de la prueba (independencia, distribución del estadístico bajo H0).',
          'No mide el tamaño ni la importancia práctica del efecto.',
          'El umbral 0,05 es una convención, no una ley; p = 0,049 y p = 0,051 aportan evidencia casi idéntica.',
        ],
        memorize: [
          'Definición formal: probabilidad, bajo H0, de un resultado al menos tan extremo como el observado.',
          'Regla de decisión: si p ≤ α se rechaza H0; si p > α no se rechaza (no se «acepta»).',
          'Estadístico z para la media con σ conocida: z = (x̄ − μ0) / (σ/√n).',
        ],
      },
      chunks: [
        {
          id: 'vp1',
          stage: 'context',
          title: '1 · Contexto: ¿qué problema resuelve?',
          text:
            'Cuando un estudio compara dos grupos (por ejemplo, un medicamento frente a un placebo) casi siempre observamos alguna diferencia. El problema es que parte de esa diferencia puede deberse solo a la variabilidad del muestreo: otra muestra habría dado otro número.\n\nEl contraste de hipótesis y el valor p existen para responder esta pregunta: **¿esta diferencia sería rara si en realidad no hubiera ningún efecto?**\n\n- **Conocimientos previos:** distribución normal, distribución muestral de la media, hipótesis nula y alternativa.\n- **Concepto nuevo:** cuantificar qué tan incompatibles son los datos con «no hay efecto».\n- **Depende de él después:** intervalos de confianza, tamaño del efecto, potencia, comparaciones múltiples.',
          ask: { prompt: 'Con tus palabras: ¿qué problema intenta resolver el valor p y por qué hace falta?', purpose: 'explain' },
          points: [
            {
              id: 'p-problema',
              weight: 2,
              label: 'distinguir un efecto real de la variabilidad del azar',
              statement: 'El valor p ayuda a distinguir si una diferencia observada es compatible con la simple variabilidad del muestreo o sugiere un efecto real.',
              keywords: [['azar', 'casualidad', 'aleatori', 'variabilidad', 'ruido', 'muestreo'], ['efecto', 'diferencia', 'real', 'evidencia', 'significativ', 'senal']],
              hint: 'Piensa en dos muestras distintas del mismo grupo: ¿darían exactamente el mismo número? ¿Qué quedaría por decidir?',
              example: 'Si lanzas 10 veces una moneda justa y salen 6 caras, no sospechas nada; con 10 caras sí. ¿Dónde pones el límite y por qué?',
              probe: 'El texto dice que parte de la diferencia puede ser variabilidad del muestreo. ¿Qué decisión nos ayuda a tomar el valor p?',
            },
          ],
        },
        {
          id: 'vp2',
          stage: 'intuition',
          title: '2 · Idea intuitiva',
          text:
            'Imagina que sospechas que una moneda está cargada. La lanzas 10 veces y salen 9 caras. Pregunta clave: **si la moneda fuera justa, ¿qué tan raro sería ver 9 caras o algo todavía más extremo?**\n\nEsa «rareza», expresada como una probabilidad pequeña, es la idea del valor p. Observa lo que **no** dice: no afirma que la moneda esté cargada; dice qué tan sorprendente es el resultado *si suponemos* que es justa.',
          ask: {
            prompt: 'Inventa otro ejemplo cotidiano (distinto de la moneda) donde un resultado sería muy raro bajo una suposición «normal».',
            purpose: 'explain-example',
          },
          points: [
            {
              id: 'p-intuicion',
              weight: 2,
              label: 'el resultado se evalúa suponiendo algo (que no hay efecto) y viendo qué tan raro sería',
              statement: 'Se evalúa qué tan raro sería el resultado suponiendo que no hay efecto (moneda justa).',
              keywords: [['raro', 'sorprend', 'improbable', 'poco probable', 'extrem', 'inusual'], ['si ', 'suponiendo', 'supone', 'asumiendo', 'fuera', 'normal', 'esperab']],
              hint: 'Tu ejemplo necesita dos piezas: una suposición «normal» y un resultado que, bajo esa suposición, sería muy poco probable.',
              example: 'Suposición: «mi amigo no tiene ventaja en este juego de cartas». Resultado: gana 12 de 12 partidas. Bajo esa suposición, sería rarísimo.',
              probe: '¿Cuál es tu suposición «normal» y cuál el resultado que la pondría en duda?',
            },
          ],
        },
        {
          id: 'vp3',
          stage: 'technical',
          title: '3 · Lenguaje técnico',
          text:
            '- **Hipótesis nula (H0):** afirmación de «no hay efecto / no hay diferencia». Es lo que ponemos a prueba.\n- **Hipótesis alternativa (H1):** lo que sospechamos (hay efecto).\n- **Estadístico de prueba:** número calculado con los datos que resume cuánto se alejan de H0.\n- **Valor p:** probabilidad, **calculada suponiendo que H0 es cierta**, de obtener un resultado **al menos tan extremo** como el observado.\n- **Nivel de significancia (α):** umbral fijado *antes* de ver los datos (p. ej., 0,05). Si p ≤ α se rechaza H0.\n\n**Las tres versiones del mismo concepto**\n- *Intuitiva:* qué tan sorprendente sería mi dato si no hubiera efecto.\n- *Formal:* p = P(T ≥ t_obs | H0).\n- *Académica:* medida de incompatibilidad entre datos y H0; evidencia contra H0, no probabilidad de H0.\n\n**Condiciones y límites:** depende de n; supone los supuestos de la prueba; no mide el tamaño del efecto; 0,05 es solo una convención.',
          ask: {
            prompt: 'Define el valor p con tus palabras en una o dos frases (sin copiar la definición del texto).',
            purpose: 'explain',
          },
          points: [
            {
              id: 'p-def',
              weight: 3,
              label: 'probabilidad de un resultado al menos tan extremo, suponiendo que H0 es cierta',
              statement: 'El valor p es la probabilidad, calculada suponiendo que H0 es cierta, de obtener un resultado al menos tan extremo como el observado.',
              keywords: [['probabilidad', 'prob'], ['h0', 'nula', 'sin efecto', 'no hay efecto', 'suponiendo', 'si fuera', 'asumiendo', 'es cierta'], ['extrem', 'igual o mas', 'al menos', 'tan raro', 'mas raro', 'mas alejado']],
              min: 0.66,
              hint: 'Una definición completa responde tres preguntas: ¿probabilidad de qué?, ¿bajo qué suposición?, ¿de un resultado cómo?',
              example: 'Para la moneda: «si la moneda fuera justa (suposición), la probabilidad (de qué) de obtener 9 o más caras (resultado extremo) es ≈ 0,011».',
              probe: '¿Bajo qué suposición se calcula el valor p, y de qué tipo de resultado es la probabilidad?',
            },
            {
              id: 'p-alfa',
              label: 'se compara con α (fijado antes): si p ≤ α se rechaza H0',
              statement: 'Se compara p con el nivel de significancia α fijado de antemano: si p ≤ α se rechaza H0.',
              keywords: [['alfa', 'significancia', 'umbral', '0 05', 'nivel'], ['rechaz', 'compar', 'menor', 'decision', 'concluy']],
              min: 0.5,
              hint: '¿Con qué número se compara el valor p para decidir?',
              probe: '¿Qué hacemos con el valor p una vez calculado?',
            },
          ],
        },
        {
          id: 'vp4',
          stage: 'how',
          title: '4 · Cómo funciona y por qué',
          text:
            '**Procedimiento**\n1. Formular H0 y H1.\n2. Fijar α antes de ver los datos.\n3. Calcular el estadístico de prueba con los datos.\n4. Hallar la probabilidad, bajo H0, de un valor igual o más extremo: ese es el valor p.\n5. Comparar con α y concluir en términos de **evidencia**.\n\n**Por qué funciona.** Es un argumento de «reducción al absurdo probabilística»: si H0 fuera cierta y el dato observado resulta muy raro, empezamos a dudar de H0. Calculamos bajo H0 (y no bajo H1) porque H0 fija **una única distribución concreta** para el estadístico; H1 («hay algún efecto») admite infinitos tamaños de efecto y no permite calcular una sola probabilidad.',
          ask: { prompt: '¿Por qué el valor p se calcula suponiendo que H0 es cierta y no suponiendo que H1 es cierta?', purpose: 'why' },
          points: [
            {
              id: 'p-porque-h0',
              weight: 2,
              label: 'H0 especifica una distribución concreta que permite calcular; H1 no',
              statement: 'H0 define una única distribución concreta del estadístico, así que se puede calcular una probabilidad; H1 admite muchos tamaños de efecto.',
              keywords: [['nula', 'h0', 'sin efecto', 'no hay efecto'], ['calcular', 'distribucion', 'especifica', 'unico', 'unica', 'concret', 'conocida', 'definida', 'determin', 'precis', 'valor exacto', 'muchos', 'infinit', 'compuesta', 'vaga']],
              min: 1,
              hint: 'Compara qué tan precisa es la afirmación «no hay efecto» frente a «hay algún efecto». ¿Cuál permite calcular una probabilidad concreta?',
              example: '«La moneda es justa» fija P(cara)=0,5. «La moneda está cargada» ¿cargada cuánto? 0,6, 0,9, 0,99… no hay un solo cálculo posible.',
              probe: '¿Cuál de las dos hipótesis fija un valor concreto que permite calcular la probabilidad?',
            },
          ],
        },
        {
          id: 'vp5',
          stage: 'example',
          title: '5 · Ejemplo completo con razonamiento',
          text:
            '**Problema.** Sin la app, los estudiantes tienen una nota media de 70 (σ = 10, conocida). 36 estudiantes usan una app de estudio y obtienen una media de 73. ¿Hay evidencia de mejora?\n\n1. **Hipótesis:** H0: μ = 70; H1: μ > 70 (nos interesa solo si mejora).\n2. **Umbral:** α = 0,05, fijado antes.\n3. **Estadístico:** error estándar = σ/√n = 10/6 ≈ 1,667. z = (73 − 70)/1,667 = 1,8. *Por qué esta fórmula:* mide cuántos errores estándar se aleja la media observada de la que supone H0.\n4. **Valor p:** P(Z ≥ 1,8) ≈ 0,036. *Por qué cola derecha:* H1 solo dice «mejora».\n5. **Decisión:** 0,036 ≤ 0,05 → se rechaza H0.\n6. **Interpretación:** si la app no tuviera efecto, observar una media muestral ≥ 73 ocurriría ≈ 3,6 % de las veces. Hay evidencia moderada contra H0. **No** dice cuánto mejora ni que la mejora importe.',
          ask: {
            prompt:
              'Antes de seguir, reconstruye el razonamiento: ¿por qué se rechazó H0 en este ejemplo y qué significa 0,036 en palabras?',
            purpose: 'explain',
          },
          points: [
            {
              id: 'p-interp-ej',
              weight: 2,
              label: 'p ≈ 0,036 ≤ α: si no hubiera efecto, un resultado así sería raro (≈3,6 %)',
              statement: 'Como 0,036 ≤ 0,05 se rechaza H0; significa que, si la app no tuviera efecto, una media ≥ 73 aparecería solo ≈3,6 % de las veces.',
              keywords: [['0 036', '3 6', 'menor', 'alfa', '0 05', 'rechaz'], ['si no', 'suponiendo', 'sin efecto', 'nula', 'h0', 'raro', 'poco probable', 'ocurriria', 'veces', 'probabilidad']],
              min: 1,
              hint: 'Tu respuesta necesita una comparación (p con α) y una interpretación en frase: «si no hubiera efecto…».',
              probe: '¿Con qué compararías 0,036 y cómo lo dirías como «si H0 fuera cierta, entonces…»?',
            },
          ],
        },
      ],
      misconceptions: [
        {
          id: 'p-es-prob-h0',
          label: 'Interpreta el valor p como la probabilidad de que la hipótesis nula sea cierta',
          confusedWith: 'P(H0 | datos)',
          triggers: [
            '(probabilidad|prob) de que (la )?(hipotesis )?(nula|h0) (sea|es) (verdadera|cierta|falsa|correcta)',
            '(probabilidad|prob) (de )?(que )?(la )?(hipotesis nula|h0)\\b',
            '(nula|h0) (es|sea) (cierta|verdadera) con (una )?(probabilidad|prob)',
          ],
          child: '',
          adult: 'Confunde P(datos | H0) con P(H0 | datos).',
          recommendation: 'Contrastar P(datos | H0) con P(H0 | datos) mediante un ejemplo con tasa base (teorema de Bayes).',
          errorAnalysis: {
            attempted: 'Quisiste decir qué significa un valor p pequeño.',
            conceptUsed: 'Probabilidad condicional.',
            brokeAt: 'Invertiste la condición: el valor p es la probabilidad de los datos suponiendo H0, no la probabilidad de H0 dados los datos.',
            confusedWith: 'P(datos | H0) con P(H0 | datos).',
            missing: 'La distinción entre una probabilidad condicional y su inversa; para P(H0 | datos) harían falta probabilidades previas.',
            shouldReason: 'Preguntarte «¿qué se está suponiendo cierto al calcular esta probabilidad?». En el valor p, se supone H0 y se mira el dato.',
          },
          contrast: {
            intro: 'Caso: se lanza una moneda 10 veces y salen 9 caras; el valor p (cola derecha) es ≈ 0,011.',
            items: [
              { id: 'A', text: 'Interpretación correcta: «Si la moneda fuera justa, la probabilidad de obtener 9 o más caras sería ≈ 1,1 %».' },
              { id: 'B', text: 'Interpretación incorrecta: «Hay un 1,1 % de probabilidad de que la moneda sea justa».' },
              {
                id: 'C',
                text: 'Contraejemplo: si el 99 % de las monedas de una caja son justas, tras ver 9 caras la probabilidad de que ESTA moneda sea justa puede seguir siendo alta; no coincide con 1,1 %.',
              },
            ],
            question: '¿Cuál interpretación es correcta y qué característica la distingue de la otra?',
            choiceQuestion: '¿Cuál interpretación es la correcta?',
            correct: 'A',
            whyKeywords: [['si la moneda fuera', 'suponiendo', 'supone', 'asumiendo', 'dado que', 'condicion', 'bajo h0', 'si h0', 'si fuera'], ['dato', 'resultado', 'caras', 'inversa', 'invert', 'al reves', 'condicional']],
            reveal:
              'La A es correcta: el valor p es una probabilidad *condicionada a H0* (P(datos | H0)). La B invierte la condición y habla de P(H0 | datos), algo que el valor p no entrega; el contraejemplo C muestra que ambas cantidades pueden ser muy distintas.',
            features: [
              'Pertenece al concepto: la frase empieza suponiendo H0 («si la moneda fuera justa…») y habla del dato.',
              'No pertenece: afirma algo sobre la probabilidad de la hipótesis misma.',
            ],
          },
        },
        {
          id: 'p-es-prob-azar',
          label: 'Interpreta el valor p como «la probabilidad de que el resultado se deba al azar»',
          confusedWith: 'P(H0 | datos)',
          triggers: [
            '(probabilidad|prob|posibilidad).{0,30}(se deba|debido|sea|producto|por|es).{0,6}(al |el |solo |solamente |puro )?(azar|casualidad)',
            'resultado (se debe|es producto|es debido) (al )?(azar|casualidad)',
          ],
          child: '',
          adult: 'Interpreta p como probabilidad de que el resultado sea fruto del azar (versión coloquial del error P(H0 | datos)).',
          recommendation: 'Reformular siempre p como «si H0 fuera cierta, la probabilidad de un dato así sería…».',
          errorAnalysis: {
            attempted: 'Resumir en lenguaje cotidiano qué mide p.',
            conceptUsed: 'Idea de azar como explicación alternativa.',
            brokeAt: 'La frase «se debe al azar» trata el azar como un evento cuya probabilidad se mide con los datos; en realidad el azar es parte de lo que SE SUPONE al calcular p (bajo H0).',
            confusedWith: 'Probabilidad de los datos bajo H0 con probabilidad de que H0 explique los datos.',
            missing: 'Que el cálculo parte de H0 como supuesto, no como resultado.',
            shouldReason: 'Reescribe tu frase con «si no hubiera efecto (solo azar), entonces la probabilidad de ver un resultado así sería…».',
          },
          contrast: null,
        },
        {
          id: 'p-pequeno-efecto-grande',
          label: 'Cree que un p pequeño significa que el efecto es grande o importante',
          confusedWith: 'tamaño del efecto',
          triggers: [
            '(p|valor p) (muy )?(pequeno|bajo|chico).{0,50}(efecto|diferencia) (es )?(muy )?(grande|importante|fuerte|relevante)',
            '(mas|mientras mas) (pequeno|bajo) (es )?(el )?(valor )?p.{0,40}(mayor|mas grande|mas importante|mas fuerte)',
          ],
          child: '',
          adult: 'Confunde significancia estadística con importancia práctica (tamaño del efecto).',
          recommendation: 'Practicar con casos de muestras muy grandes y efectos mínimos; reportar siempre tamaño del efecto e intervalo de confianza.',
          errorAnalysis: {
            attempted: 'Interpretar qué implica un valor p pequeño.',
            conceptUsed: 'Significancia estadística.',
            brokeAt: 'Asumiste que «más evidencia contra H0» equivale a «efecto más grande». El valor p también depende del tamaño de la muestra.',
            confusedWith: 'Evidencia contra H0 con magnitud del efecto.',
            missing: 'El papel de n: con muestras enormes, diferencias minúsculas producen p diminutos.',
            shouldReason: 'Pregúntate dos cosas por separado: ¿hay evidencia de que existe un efecto? (p) y ¿qué tan grande es? (tamaño del efecto / IC).',
          },
          contrast: null,
        },
        {
          id: 'p-grande-prueba-h0',
          label: 'Cree que p > α demuestra que H0 es cierta (que no hay efecto)',
          confusedWith: 'ausencia de evidencia vs. evidencia de ausencia',
          triggers: [
            '(p|valor p).{0,25}(mayor|superior|>).{0,40}(demuestra|prueba|confirma|significa que no hay|nula (es )?(cierta|verdadera)|no hay (efecto|diferencia))',
            '(acept\\w+|confirm\\w+|demuestr\\w+|prueb\\w+) (que )?(la )?(hipotesis )?(nula|h0)',
          ],
          child: '',
          adult: 'Interpreta no rechazar H0 como aceptar/demostrar H0.',
          recommendation: 'Trabajar con la potencia estadística y con intervalos de confianza para interpretar resultados no significativos.',
          errorAnalysis: {
            attempted: 'Concluir qué ocurre cuando p es grande.',
            conceptUsed: 'Regla de decisión (p vs. α).',
            brokeAt: 'No rechazar H0 significa que los datos no son suficientemente incompatibles con H0, no que H0 esté demostrada.',
            confusedWith: 'Ausencia de evidencia con evidencia de ausencia.',
            missing: 'La noción de potencia: con poca muestra, un efecto real puede dar p grande.',
            shouldReason: 'Concluye con «no hay evidencia suficiente contra H0», no con «H0 es cierta».',
          },
          contrast: null,
        },
      ],
      applyTasks: [
        {
          id: 'vp-a1',
          level: 1,
          scaffold: 'guided',
          kind: 'open',
          prompt:
            'Ejercicio guiado. Misma situación (μ0 = 70, σ = 10, n = 36), pero ahora la media muestral es 72. Completa: z = (72 − 70) / (10/6) = ___. ¿El valor p será mayor o menor que el de 0,036? ¿Por qué?',
          numeric: { expect: 1.2, tol: 0.06 },
          keywords: [['mayor', 'mas grande', 'aumenta', 'sube'], ['menos', 'menor', 'cerca', 'cercan', 'poca', 'poco', 'distancia', 'alej', 'raro']],
          minWords: 8,
          help: {
            hint: 'Calcula primero el error estándar 10/6 y luego divide la diferencia (72 − 70) entre él. Después piensa: ¿72 está más cerca o más lejos de 70 que 73?',
            example: 'En el ejemplo: z = (73 − 70)/(10/6) = 3/1,667 = 1,8. Aquí el numerador es 2 en lugar de 3.',
            steps: ['1. Error estándar = 10/6 ≈ 1,667', '2. z = 2 / 1,667 ≈ ?', '3. ¿Un z más pequeño deja el dato más cerca o más lejos de lo «raro»?', '4. Entonces el valor p es ___ que antes.'],
          },
        },
        {
          id: 'vp-a2',
          level: 2,
          scaffold: 'partial',
          kind: 'open',
          prompt:
            'Ejercicio parcialmente guiado. Ahora n = 64, media muestral 73, μ0 = 70 y σ = 10, con α = 0,05 y H1: μ > 70. Calcula z y concluye (decisión + interpretación).',
          numeric: { expect: 2.4, tol: 0.08 },
          keywords: [['rechaz'], ['h0', 'nula', 'sin efecto', 'no hubiera efecto', 'no hay efecto', 'si no']],
          min: 1,
          minWords: 10,
          help: {
            hint: 'Recuerda: error estándar = σ/√n. ¿Cuánto es √64?',
            example: 'Con n = 36 el error estándar era 10/6; con n = 64 es 10/8 = 1,25.',
          },
        },
        {
          id: 'vp-a3',
          level: 3,
          scaffold: 'independent',
          kind: 'open',
          prompt:
            'Ejercicio independiente. Un estudio con 50 000 participantes encuentra p = 0,001, pero la mejora media es de 0,1 puntos sobre 100. ¿Qué concluyes y qué otra información pedirías?',
          keywords: [['estadisticamente', 'significativ', 'evidencia', 'p'], ['pequen', 'irrelevante', 'practic', 'tamano del efecto', 'importan', 'trivial', 'minim', 'intervalo']],
          min: 1,
          minWords: 12,
          help: {
            hint: 'Separa dos preguntas: ¿hay evidencia de que existe un efecto? y ¿es grande el efecto? Piensa en el papel de n = 50 000.',
            example: 'Con muestras gigantescas, hasta diferencias diminutas producen valores p diminutos.',
          },
        },
        {
          id: 'vp-a4',
          level: 3,
          kind: 'choice',
          prompt: 'Un estudio obtiene p = 0,20 con α = 0,05. ¿Qué conclusión es la más adecuada?',
          options: [
            { id: 'a', text: 'Se demuestra que H0 es cierta: no hay efecto.', misc: 'p-grande-prueba-h0' },
            { id: 'b', text: 'No se rechaza H0: los datos no aportan evidencia suficiente contra ella (no prueba que sea cierta).' },
            { id: 'c', text: 'Hay un 20 % de probabilidad de que H0 sea cierta.', misc: 'p-es-prob-h0' },
          ],
          correct: 'b',
          whyPrompt: 'Justifica tu elección: ¿qué diferencia hay entre «no rechazar» y «aceptar» H0?',
          whyKeywords: [['suficiente', 'evidencia', 'no prueba', 'no demuestra', 'potencia', 'muestra pequena', 'ausencia', 'no significa']],
          help: {
            hint: 'Piensa si un estudio con pocos datos podría dejar de detectar un efecto que sí existe.',
            example: 'Un detective que no encuentra pruebas de culpabilidad no ha demostrado inocencia.',
          },
        },
      ],
    },
  ],
};
