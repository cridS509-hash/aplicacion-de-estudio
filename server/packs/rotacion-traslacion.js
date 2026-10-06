// Paquete curado: Ciencias — rotación y traslación de la Tierra (9–12 años).

export default {
  id: 'rotacion-traslacion',
  match: ['rotacion', 'traslacion', 'movimientos de la tierra', 'dia y noche', 'sistema solar'],
  subject: 'Ciencias',
  level: 'primary',
  title: 'Los movimientos de la Tierra',
  concepts: [
    {
      id: 'rotacion',
      name: 'Rotación de la Tierra',
      summary: 'La Tierra gira sobre sí misma; una vuelta dura un día y produce el día y la noche.',
      prior: [
        '¿Por qué crees que existen el día y la noche? Dime tu idea, aunque no estés seguro.',
        '¿Sabes si la Tierra se mueve? ¿Cómo?',
      ],
      analogies: {
        default: 'Imagina un trompo girando sobre su punta: da vueltas sobre sí mismo sin irse a ningún lado. Así gira la Tierra.',
        futbol: 'Imagina un balón que giras con el dedo sobre una mesa: da vueltas sobre sí mismo mientras queda en el mismo lugar.',
        videojuegos: 'Imagina un personaje que gira sobre sí mismo en el menú de selección: cambia lo que vemos de él, pero no se mueve de sitio.',
        animales: 'Imagina un perro que da vueltas sobre sí mismo antes de acostarse: gira en el mismo lugar.',
        ciencia: 'Imagina un globo terráqueo con una linterna: al girarlo sobre su eje, una parte se ilumina y la otra queda en sombra.',
        dibujar: 'Imagina una bailarina girando sobre un pie: da vueltas sobre sí misma en el mismo lugar.',
      },
      vocabulary: [
        { term: 'eje', meaning: 'la línea imaginaria que atraviesa la Tierra de polo a polo, alrededor de la cual gira' },
        { term: 'rotación', meaning: 'girar sobre uno mismo' },
      ],
      chunks: [
        {
          id: 'ro1',
          title: 'La Tierra gira',
          visual: { type: 'earth-rotation' },
          text:
            'La Tierra gira sobre sí misma, como un trompo. Este movimiento se llama rotación. Una vuelta completa dura aproximadamente 24 horas, es decir, un día. Gracias a la rotación hay día y noche: la parte de la Tierra que mira al Sol recibe luz, y la parte contraria queda en la oscuridad.',
          points: [
            {
              id: 'p-rot',
              weight: 2,
              label: 'la rotación es girar sobre sí misma',
              statement: 'La rotación es el movimiento de la Tierra girando sobre sí misma, como un trompo.',
              keywords: [['gira', 'girar', 'vuelta', 'sobre si', 'eje', 'trompo', 'rota', 'rotar'], ['tierra', 'misma', 'eje', 'trompo', 'planeta']],
              min: 0.5,
              hint: 'Piensa en lo que hace un trompo. ¿Se va a otro lugar o da vueltas en el mismo sitio?',
              example: 'Si te pones de pie y giras sin caminar, estás rotando: das vueltas sobre ti mismo.',
              probe: '¿Qué hace la Tierra cuando rota?',
            },
            {
              id: 'p-24h',
              label: 'una vuelta dura 24 horas (un día)',
              statement: 'Una vuelta completa de rotación dura unas 24 horas, es decir, un día.',
              keywords: [['24', 'veinticuatro', 'un dia', 'dia completo', '24 horas']],
              hint: 'Busca el número de horas en el texto. ¿A qué período de tiempo equivale?',
              probe: '¿Cuánto tiempo tarda la Tierra en dar una vuelta sobre sí misma?',
            },
            {
              id: 'p-dianoche',
              weight: 2,
              label: 'la rotación produce el día y la noche',
              statement: 'La rotación hace que una parte de la Tierra mire al Sol (día) mientras la otra queda a oscuras (noche).',
              keywords: [['dia', 'noche', 'luz', 'oscur'], ['sol', 'rotacion', 'gira', 'mira', 'frente']],
              hint: 'Piensa en una linterna que ilumina solo una mitad de una pelota. Si giras la pelota, ¿qué pasa con las mitades?',
              example: 'Cuando en Honduras es de día, la parte opuesta de la Tierra está en la noche.',
              probe: '¿Qué produce la rotación en la Tierra?',
            },
          ],
        },
        {
          id: 'ro2',
          title: 'La Tierra viaja alrededor del Sol',
          visual: { type: 'earth-orbit' },
          text:
            'La Tierra también se mueve alrededor del Sol, siguiendo un camino llamado órbita. Este movimiento se llama traslación. Una vuelta completa tarda aproximadamente 365 días, es decir, un año. Como el eje de la Tierra está inclinado, la traslación produce las estaciones del año.',
          points: [
            {
              id: 'p-tras',
              weight: 2,
              label: 'la traslación es moverse alrededor del Sol',
              statement: 'La traslación es el movimiento de la Tierra alrededor del Sol, siguiendo una órbita.',
              keywords: [['alrededor', 'orbita', 'rodea', 'da vueltas al sol', 'viaja', 'recorre'], ['sol']],
              min: 1,
              hint: 'Fíjate en la palabra «alrededor». ¿Alrededor de qué se mueve la Tierra?',
              example: 'Una persona que corre dando vueltas a una pista de atletismo se traslada alrededor de la pista.',
              probe: '¿Alrededor de qué se mueve la Tierra en la traslación?',
            },
            {
              id: 'p-365',
              label: 'una vuelta dura 365 días (un año)',
              statement: 'Una vuelta completa de traslación dura unos 365 días, es decir, un año.',
              keywords: [['365', 'un ano', 'ano', 'trescientos']],
              hint: 'Busca el número de días en el texto. ¿A qué período de tiempo equivale?',
              probe: '¿Cuánto tarda la Tierra en dar una vuelta alrededor del Sol?',
            },
            {
              id: 'p-estaciones',
              label: 'la traslación y la inclinación del eje producen las estaciones',
              statement: 'Como el eje está inclinado, la traslación produce las estaciones del año.',
              keywords: [['estacion', 'verano', 'invierno', 'primavera', 'otono'], ['inclin', 'eje', 'traslacion', 'orbita']],
              min: 0.5,
              hint: 'Mira la última frase: ¿qué se produce y por qué?',
              probe: '¿Qué produce la traslación?',
            },
          ],
        },
      ],
      misconceptions: [
        {
          id: 'confunde-rotacion-traslacion',
          label: 'Confunde rotación con traslación (atribuye el día y la noche a la órbita alrededor del Sol, o viceversa)',
          confusedWith: 'traslación',
          triggers: [
            '(dia y (la )?noche|el dia|la noche).{0,50}(traslacion|alrededor del sol|orbita|da la vuelta al sol|vuelta al sol)',
            '(traslacion|alrededor del sol).{0,40}(dia y (la )?noche|el dia|la noche)',
            'rotacion.{0,50}(alrededor del sol|orbita|365|un ano|estacion)',
            '(da la vuelta|gira|se mueve|orbita) (al sol|alrededor del sol).{0,40}(rotacion)',
          ],
          child: 'Parece que estás mezclando dos movimientos de la Tierra. Tiene sentido: ¡los dos son vueltas! Vamos a comparar.',
          adult: 'Confunde los dos movimientos de la Tierra: asocia el día y la noche con la traslación (o la órbita con la rotación).',
          recommendation: 'Practicar la distinción rotación/traslación con modelos concretos (trompo vs. pista de atletismo) y asociar cada uno con su efecto.',
          contrast: {
            intro: 'Observa estas dos situaciones.',
            items: [
              { id: 'A', text: 'Un trompo gira sobre su punta, sin salir del mismo lugar.' },
              { id: 'B', text: 'Una persona corre dando vueltas alrededor de una pista de atletismo.' },
            ],
            question: '¿Cuál de las dos se parece a la rotación de la Tierra y cuál a la traslación? ¿Cómo lo sabes?',
            choiceQuestion: '¿Cuál situación se parece a la ROTACIÓN de la Tierra?',
            correct: 'A',
            whyKeywords: [['sobre si', 'mismo lugar', 'sobre su', 'gira', 'punta', 'eje', 'no se mueve de', 'no se va', 'trompo']],
            reveal:
              'La rotación se parece al trompo: la Tierra gira sobre sí misma (24 horas, produce día y noche). La traslación se parece a quien corre alrededor de la pista: la Tierra viaja alrededor del Sol (365 días, con las estaciones).',
            features: [
              'Rotación: gira sobre sí misma → 24 horas → día y noche.',
              'Traslación: se mueve alrededor del Sol → 365 días → estaciones.',
            ],
          },
        },
        {
          id: 'sol-gira-alrededor-tierra',
          label: 'Cree que el Sol se mueve alrededor de la Tierra (el Sol sale y se oculta)',
          confusedWith: 'rotación de la Tierra',
          triggers: [
            'el sol (gira|da vueltas|se mueve|orbita|da la vuelta).{0,25}(alrededor de la tierra|a la tierra)',
            'el sol se (va|oculta|esconde|apaga) (y|para que|y por eso) (hay|es|se hace) (la )?noche',
          ],
          child: 'Es lo que parece cuando miramos el cielo: ¡el Sol parece moverse! Vamos a ver qué se mueve de verdad.',
          adult: 'Piensa que el Sol se mueve alrededor de la Tierra (idea intuitiva frecuente basada en la apariencia).',
          recommendation: 'Usar un modelo con linterna y globo para mostrar que quien gira es la Tierra.',
          contrast: {
            intro: 'Mira lo que pasa cuando giras una pelota frente a una linterna que está quieta.',
            items: [
              { id: 'A', text: 'La linterna (el Sol) se mueve alrededor de la pelota para iluminar cada parte.' },
              { id: 'B', text: 'La linterna (el Sol) está quieta y la pelota (la Tierra) gira, así cada parte recibe luz por turnos.' },
            ],
            question: '¿Cuál de las dos explicaciones corresponde al día y la noche en la Tierra? ¿Por qué?',
            choiceQuestion: '¿Cuál de las dos explicaciones corresponde al día y la noche?',
            correct: 'B',
            whyKeywords: [['gira', 'rota', 'rotacion', 'sobre si', 'tierra gira', 'pelota gira', 'quieta', 'no se mueve']],
            reveal:
              'El Sol parece moverse porque nosotros giramos con la Tierra. Lo que gira es la Tierra sobre sí misma (rotación), y por eso cada lugar mira al Sol por turnos.',
            features: ['Parece que el Sol se mueve, pero es la Tierra la que gira sobre sí misma.'],
          },
        },
      ],
      applyTasks: [
        {
          id: 'ro-a1',
          level: 1,
          kind: 'choice',
          prompt: 'En Honduras es de noche, pero en Japón es de día. ¿Qué movimiento de la Tierra explica esto?',
          options: [
            { id: 'a', text: 'La rotación: la Tierra gira y no todos los lugares miran al Sol a la vez.' },
            { id: 'b', text: 'La traslación: la Tierra se mueve alrededor del Sol.', misc: 'confunde-rotacion-traslacion' },
            { id: 'c', text: 'El Sol se apaga en algunos lugares.', misc: 'sol-gira-alrededor-tierra' },
          ],
          correct: 'a',
          whyPrompt: 'Explica con tus palabras por qué elegiste esa respuesta.',
          whyKeywords: [['gira', 'rota', 'rotacion', 'sobre si', 'un lado', 'mitad', 'parte', 'mira al sol', 'frente al sol']],
          help: {
            hint: 'Piensa en la pelota y la linterna: una parte está iluminada y la otra no. ¿Qué movimiento cambia cuál parte se ilumina?',
            example: 'Cuando giras un globo frente a una linterna, los lugares pasan de la luz a la sombra por turnos.',
          },
        },
        {
          id: 'ro-a2',
          level: 3,
          kind: 'open',
          prompt:
            'Imagina que la Tierra dejara de rotar, pero siguiera moviéndose alrededor del Sol. ¿Qué pasaría con el día y la noche en un mismo lugar? Explica por qué lo piensas.',
          keywords: [['mismo lado', 'un lado', 'siempre', 'mitad', 'misma parte', 'mucho tiempo', 'meses'], ['dia', 'luz', 'noche', 'oscur', 'sol']],
          minWords: 10,
          help: {
            hint: 'Si ya no gira, la parte que mira al Sol ¿cambiaría de lugar en la Tierra?',
            example: 'La Luna siempre nos muestra la misma cara; por eso desde la Tierra vemos solo ese lado.',
          },
        },
        {
          id: 'ro-a3',
          level: 2,
          kind: 'open',
          prompt:
            'Explícale a un niño más pequeño la diferencia entre rotación y traslación. Puedes usar un ejemplo con objetos que conozcas.',
          keywords: [['gira', 'rota', 'sobre si', 'trompo', 'eje'], ['alrededor', 'sol', 'orbita', 'pista']],
          min: 1,
          minWords: 12,
          help: {
            hint: 'Di primero qué hace la Tierra en cada movimiento y cuánto tarda.',
            example: 'Un trompo gira sobre sí mismo (rotación). Una persona que corre alrededor de una pista se traslada (traslación).',
          },
        },
      ],
    },
  ],
};
