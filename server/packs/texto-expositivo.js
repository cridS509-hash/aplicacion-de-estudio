// Paquete curado: Lengua — texto expositivo (9–12 años).
// Cada "point" es una idea que se espera que el niño pueda expresar; "keywords" son grupos de
// alternativas (prefijos de palabra o frases). Los errores conceptuales típicos disparan actividades
// de contraste en lugar de una corrección directa.

export default {
  id: 'texto-expositivo',
  match: ['texto expositivo', 'textos expositivos', 'texto informativo', 'texto explicativo'],
  subject: 'Lengua',
  level: 'primary',
  title: 'El texto expositivo',
  concepts: [
    {
      id: 'texto-expositivo',
      name: 'Texto expositivo',
      summary: 'Un texto expositivo explica o informa sobre un tema real, con datos claros.',
      prior: [
        '¿Qué crees que significa «texto expositivo»? Escríbelo como lo imaginas, aunque no estés seguro.',
        '¿Has leído alguna vez algo que servía para explicarte cómo es o cómo funciona una cosa? ¿Qué era?',
      ],
      analogies: {
        default:
          'Imagina que quieres explicarle a un amigo cómo funciona algo que conoces muy bien. Dar datos claros para que lo entienda es justo lo que hace un texto expositivo.',
        videojuegos:
          'Piensa en el manual de un videojuego o en una guía de trucos: no te cuenta una aventura, te explica cómo funciona el juego.',
        futbol:
          'Piensa en un libro con las reglas del fútbol: explica cómo se juega, no cuenta un partido.',
        animales:
          'Piensa en la ficha de un animal en una enciclopedia: dice cómo es, qué come y dónde vive, no cuenta su aventura.',
        ciencia:
          'Piensa en el informe de un experimento: explica qué se hizo y qué se descubrió, sin inventar una historia.',
        dibujar:
          'Piensa en las instrucciones para dibujar un personaje paso a paso: explican cómo hacerlo, no cuentan una historia.',
      },
      vocabulary: [
        { term: 'objetivo', meaning: 'que habla de los hechos, sin mezclar opiniones ni sentimientos' },
        { term: 'desarrollo', meaning: 'la parte central, donde se explica el tema con detalle' },
      ],
      chunks: [
        {
          id: 'te1',
          title: '¿Para qué sirve?',
          text:
            'Un texto expositivo es un texto que explica o informa sobre un tema. Quien lo escribe quiere que el lector aprenda algo nuevo y lo entienda con claridad. Por eso usa datos, definiciones y ejemplos. Las enciclopedias, los libros de ciencias y las noticias son ejemplos de textos expositivos.',
          points: [
            {
              id: 'p-sirve',
              weight: 2,
              label: 'sirve para informar o explicar un tema',
              statement: 'Un texto expositivo sirve para explicar o informar sobre un tema.',
              keywords: [['inform', 'explic', 'ensen', 'aprend', 'dar a conocer', 'aclar', 'dato']],
              hint: 'Piensa en qué quiere conseguir la persona que lo escribe: ¿que te diviertas, o que sepas algo nuevo?',
              example:
                'Una enciclopedia que habla de los delfines quiere que, al terminar de leer, tú sepas cosas nuevas sobre los delfines.',
              probe: 'Según el texto, ¿qué quiere conseguir quien escribe un texto expositivo?',
            },
            {
              id: 'p-recursos',
              label: 'usa datos, definiciones y ejemplos',
              statement: 'Para explicar con claridad, usa datos, definiciones y ejemplos.',
              keywords: [['dato', 'definicion', 'ejemplo', 'hechos', 'informacion real']],
              hint: 'Busca en el texto qué cosas usa quien escribe para que el lector entienda.',
              probe: '¿Qué usa quien escribe para que el lector entienda con claridad?',
            },
            {
              id: 'p-ejemplos',
              label: 'enciclopedias, libros de ciencias y noticias son textos expositivos',
              statement: 'Las enciclopedias, los libros de ciencias y las noticias son textos expositivos.',
              keywords: [['enciclopedia', 'libro', 'noticia', 'ciencia', 'articulo']],
              hint: 'Al final del párrafo hay una lista de lugares donde encontramos este tipo de texto.',
              probe: '¿Dónde podemos encontrar textos expositivos? Nombra al menos uno.',
            },
          ],
        },
        {
          id: 'te2',
          title: '¿Cómo está organizado?',
          text:
            'Los textos expositivos suelen tener tres partes. La introducción presenta el tema. El desarrollo explica el tema con detalle, usando datos y ejemplos. La conclusión resume lo más importante. Además, quien escribe usa un lenguaje claro y objetivo: no cuenta lo que siente, sino lo que se sabe del tema.',
          points: [
            {
              id: 'p-partes',
              weight: 2,
              label: 'tiene introducción, desarrollo y conclusión',
              statement: 'Tiene tres partes: introducción (presenta el tema), desarrollo (lo explica) y conclusión (resume).',
              keywords: [['introduccion', 'inicio', 'principio'], ['desarrollo', 'medio'], ['conclusion', 'final', 'cierre', 'resum']],
              min: 0.66,
              hint: 'Piensa en cómo empieza, qué hay en el medio y cómo termina un texto bien organizado.',
              example: 'Una exposición en clase: primero dices de qué vas a hablar, luego lo explicas y al final resumes.',
              probe: '¿Cuáles son las tres partes de un texto expositivo y qué hace cada una?',
            },
            {
              id: 'p-lenguaje',
              label: 'usa un lenguaje claro y objetivo',
              statement: 'Usa un lenguaje claro y objetivo: habla de lo que se sabe, no de lo que siente quien escribe.',
              keywords: [['claro', 'objetiv', 'sencill', 'hechos', 'sin opini', 'no cuenta lo que siente', 'datos']],
              hint: 'Fíjate en la última frase: ¿habla de lo que siente el autor o de lo que se sabe?',
              probe: '¿Cómo es el lenguaje de un texto expositivo?',
            },
          ],
        },
        {
          id: 'te3',
          title: 'Ayudas para el lector',
          text:
            'Para ayudar al lector, los textos expositivos usan títulos, subtítulos, imágenes y esquemas. También usan palabras que ordenan las ideas, como «primero», «además», «por ejemplo» y «en conclusión». Gracias a ellas es más fácil encontrar y entender la información.',
          points: [
            {
              id: 'p-ayudas',
              weight: 2,
              label: 'usa títulos, subtítulos, imágenes o esquemas para ayudar a entender',
              statement: 'Usa títulos, subtítulos, imágenes y esquemas para ayudar al lector a encontrar y entender la información.',
              keywords: [['titulo', 'subtitulo', 'imagen', 'esquema', 'dibujo', 'foto', 'grafic']],
              hint: 'Piensa en lo que ves en las páginas de un libro de ciencias, además de las palabras.',
              probe: '¿Qué cosas aparecen en estos textos para ayudarte a entender mejor?',
            },
            {
              id: 'p-conectores',
              label: 'usa palabras que ordenan las ideas (primero, además, por ejemplo)',
              statement: 'Usa palabras que ordenan las ideas, como «primero», «además» o «por ejemplo».',
              keywords: [['primero', 'ademas', 'por ejemplo', 'en conclusion', 'palabras que ordenan', 'conector', 'ordenan']],
              hint: 'Busca en el texto las palabras entre comillas. ¿Para qué sirven?',
              probe: '¿Qué palabras usa este tipo de texto para ordenar las ideas? Da un ejemplo.',
            },
          ],
        },
      ],
      misconceptions: [
        {
          id: 'expositivo-es-narrativo',
          label: 'Confunde texto expositivo con texto narrativo (informar vs. narrar)',
          confusedWith: 'texto narrativo',
          triggers: [
            '(contar|narrar|cuenta|narra|cuentan|cuenta)\\w* (una |un |la |el |lo que |algo |cuentos |historias )?(historia|cuento|aventura|relato|le paso|pasa)',
            '\\bes (un )?cuento\\b',
          ],
          child: 'Creo que estás mezclando dos tipos de textos. Vamos a descubrir la diferencia.',
          adult:
            'Asocia el texto expositivo con contar una historia (texto narrativo). Posible confusión informar vs. narrar.',
          recommendation: 'Practicar clasificación y comparación de textos expositivos y narrativos.',
          contrast: {
            intro: 'Lee estos dos textos cortos con atención.',
            items: [
              {
                id: 'A',
                text: 'El perro salió corriendo por el parque. Saltó sobre un charco y ladró a las palomas hasta que su dueña lo llamó.',
              },
              {
                id: 'B',
                text: 'Los perros son mamíferos. Tienen cuatro patas, el cuerpo cubierto de pelo y se alimentan de carne y de otros alimentos.',
              },
            ],
            question: '¿Cuál de los dos intenta darte información y cuál intenta contarte una historia? ¿Cómo lo sabes?',
            choiceQuestion: '¿Cuál de los dos textos intenta darte información?',
            correct: 'B',
            whyKeywords: [['dato', 'inform', 'explic', 'mamifer', 'caracteristic', 'cuatro patas', 'describ', 'no cuenta', 'sin personaj', 'no pasa', 'historia', 'cuent', 'narr', 'accion', 'corre', 'ladr']],
            reveal:
              'El texto B informa: da datos sobre cómo son los perros en general. El texto A cuenta una historia: hay acciones que suceden una tras otra (salió, saltó, ladró). Un texto expositivo explica; uno narrativo cuenta.',
            features: [
              'Narrativo: cuenta acontecimientos que le pasan a un personaje, uno después de otro.',
              'Expositivo: explica cómo es o cómo funciona algo, con datos que sirven para aprender.',
            ],
          },
        },
      ],
      applyTasks: [
        {
          id: 'te-a1',
          level: 1,
          kind: 'choice',
          prompt: '¿Cuál de estos textos es un texto expositivo?',
          options: [
            { id: 'a', text: 'Había una vez un dragón que no sabía volar y soñaba con tocar las nubes.' },
            { id: 'b', text: 'El Sol es una estrella. Está a unos 150 millones de kilómetros de la Tierra y nos da luz y calor.' },
            { id: 'c', text: '¡Qué día horrible! Me caí de la bici y me dolió muchísimo.', misc: 'expositivo-es-narrativo' },
          ],
          correct: 'b',
          whyPrompt: '¿Cómo lo sabes? Escribe una razón.',
          whyKeywords: [['dato', 'inform', 'explic', 'estrella', 'kilometr', 'cierto', 'real', 'no cuenta', 'sin personaj', 'sin historia']],
          help: {
            hint: 'Pregúntate: ¿cuál de ellos quiere que aprendas algo sobre el mundo?',
            example: 'Mira esta frase: «Las ballenas son mamíferos que viven en el mar». Da un dato real. Ahora compárala con las tres opciones.',
          },
        },
        {
          id: 'te-a2',
          level: 2,
          kind: 'open',
          prompt:
            'Imagina que quieres explicarle a un amigo cómo se juega algo que conoces muy bien (un videojuego, un deporte, un juego de mesa…). Escribe 2 o 3 frases como si fueran parte de un texto expositivo.',
          interestPrompt: {
            videojuegos: 'Explícale a un amigo cómo funciona tu videojuego favorito. Escribe 2 o 3 frases como en un texto expositivo.',
            futbol: 'Explícale a un amigo cómo se juega al fútbol. Escribe 2 o 3 frases como en un texto expositivo.',
            animales: 'Explica cómo es tu animal favorito, como en la ficha de una enciclopedia. Escribe 2 o 3 frases.',
          },
          keywords: [['es', 'son', 'tiene', 'tienen', 'consiste', 'sirve', 'se juega', 'se usa', 'hay', 'puede', 'se llama']],
          minWords: 10,
          avoid: ['habia una vez', 'un dia', 'de repente', '\\bayer\\b', 'me paso', 'me gusto'],
          avoidNote: 'Se parece más a una historia que a una explicación.',
          help: {
            hint: 'Un texto expositivo responde preguntas como «¿qué es?», «¿cómo funciona?» o «¿cómo se hace?». Elige una y respóndela.',
            example: 'Por ejemplo: «El ajedrez se juega entre dos personas. Cada una tiene 16 piezas. El objetivo es capturar al rey del otro jugador.»',
          },
        },
        {
          id: 'te-a3',
          level: 2,
          kind: 'order',
          prompt: 'Ordena las partes de un texto expositivo como aparecen de principio a fin.',
          items: [
            { id: 'conclusion', text: 'Conclusión: resume lo más importante' },
            { id: 'intro', text: 'Introducción: presenta el tema' },
            { id: 'desarrollo', text: 'Desarrollo: explica el tema con datos y ejemplos' },
          ],
          correct: ['intro', 'desarrollo', 'conclusion'],
          help: {
            hint: 'Piensa en una exposición en clase: ¿qué dices primero y qué dices al final?',
            example: 'Si presentaras a un animal: primero dices «Voy a hablar de las tortugas», luego explicas cómo son, y al final resumes.',
          },
        },
        {
          id: 'te-a4',
          level: 3,
          kind: 'open',
          prompt:
            'Lee: «Los pingüinos viven en el hemisferio sur. No vuelan, pero nadan muy bien gracias a sus aletas.» ¿Es un texto expositivo o narrativo? ¿Qué palabras o ideas del texto te lo muestran?',
          keywords: [['expositiv', 'informa', 'explica'], ['viven', 'nadan', 'aletas', 'hemisferio', 'dato', 'no cuenta', 'sin personaj', 'no hay historia']],
          minWords: 8,
          help: {
            hint: 'Fíjate: ¿le pasa algo a un pingüino en particular, o habla de cómo son los pingüinos en general?',
            example: 'Un texto narrativo diría: «Pipo, el pingüino, se perdió una mañana en el hielo».',
          },
        },
      ],
    },
  ],
};
