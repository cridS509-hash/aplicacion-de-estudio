// Paquete curado: Matemáticas — fracciones (9–12 años).

export default {
  id: 'fracciones',
  match: ['fraccion', 'fracciones', 'numerador', 'denominador'],
  subject: 'Matemáticas',
  level: 'primary',
  title: 'Las fracciones',
  concepts: [
    {
      id: 'fracciones',
      name: 'Fracciones',
      summary: 'Una fracción representa una o varias partes iguales de un entero.',
      prior: [
        '¿Qué crees que es una fracción? Puedes explicarlo con un ejemplo.',
        'Si cortas una pizza en 4 partes iguales y te comes 1, ¿cómo le dirías a alguien cuánta pizza comiste?',
      ],
      analogies: {
        default: 'Imagina una pizza cortada en partes iguales: la fracción dice en cuántas partes se cortó y cuántas tomaste.',
        futbol: 'Imagina una cancha de fútbol dividida en cuatro zonas iguales: tu equipo domina 1 de las 4 zonas, es decir, 1/4 de la cancha.',
        videojuegos: 'Imagina una barra de vida dividida en 4 partes iguales: si te queda 1 parte, tienes 1/4 de vida.',
        animales: 'Imagina que un grupo de 4 perros comparte la comida en partes iguales: cada uno recibe 1/4.',
        ciencia: 'Imagina una probeta con 4 marcas iguales: si el líquido llega a la primera marca, hay 1/4 de la probeta llena.',
        dibujar: 'Imagina una hoja doblada en 4 partes iguales: si coloreas una, coloreaste 1/4 de la hoja.',
      },
      vocabulary: [
        { term: 'entero', meaning: 'la cosa completa, antes de dividirla (una pizza entera, una barra entera)' },
        { term: 'numerador', meaning: 'el número de arriba de la fracción' },
        { term: 'denominador', meaning: 'el número de abajo de la fracción' },
      ],
      chunks: [
        {
          id: 'fr1',
          title: '¿Qué es una fracción?',
          visual: { type: 'pizza', n: 4, take: 1 },
          text:
            'Una fracción representa una parte de un entero que se dividió en partes iguales. Por ejemplo, si una pizza se corta en 4 partes iguales y comes 1, comiste 1/4 de la pizza. Es importante que todas las partes sean del mismo tamaño.',
          points: [
            {
              id: 'p-parte',
              weight: 2,
              label: 'una fracción es una parte de un entero',
              statement: 'Una fracción representa una parte de un entero que se dividió en partes iguales.',
              keywords: [['parte', 'pedazo', 'porcion', 'trozo', 'rebanada'], ['entero', 'todo', 'pizza', 'dividid', 'cort', 'completo']],
              min: 0.5,
              hint: 'Piensa en la pizza: cuando comes un pedazo, ¿qué parte de la pizza completa comiste?',
              example: 'Si una barra de chocolate se parte en 2 partes iguales y te comes una, comiste 1/2 de la barra.',
              probe: '¿Qué representa una fracción? Piensa en el ejemplo de la pizza.',
            },
            {
              id: 'p-iguales',
              label: 'las partes tienen que ser iguales',
              statement: 'Las partes en que se divide el entero tienen que ser del mismo tamaño.',
              keywords: [['igual', 'mismo tamano', 'mismo largo', 'parejas', 'equitativ']],
              hint: 'Mira la última frase del texto. ¿Qué dice sobre el tamaño de las partes?',
              probe: '¿Cómo tienen que ser las partes en que se corta el entero?',
            },
          ],
        },
        {
          id: 'fr2',
          title: 'Numerador y denominador',
          visual: { type: 'pizza', n: 4, take: 3 },
          text:
            'El número de abajo se llama denominador: dice en cuántas partes iguales se dividió el entero. El número de arriba se llama numerador: dice cuántas de esas partes tomamos. En 3/4, el entero se dividió en 4 partes iguales y tomamos 3.',
          points: [
            {
              id: 'p-denom',
              label: 'el denominador (abajo) dice en cuántas partes se dividió el entero',
              statement: 'El denominador, el número de abajo, dice en cuántas partes iguales se dividió el entero.',
              keywords: [['denomin', 'abajo', 'inferior'], ['partes', 'dividi', 'total', 'cuantas', 'pedazos', 'cort']],
              min: 1,
              hint: 'Mira 3/4 en el texto. El 4 de abajo, ¿qué cuenta en la pizza?',
              example: 'En 1/8 de pizza, el 8 de abajo nos dice que la pizza se cortó en 8 pedazos iguales.',
              probe: '¿Qué nos dice el número de abajo de una fracción?',
            },
            {
              id: 'p-numer',
              label: 'el numerador (arriba) dice cuántas partes tomamos',
              statement: 'El numerador, el número de arriba, dice cuántas de esas partes tomamos.',
              keywords: [['numerador', 'arriba', 'superior'], ['tomamos', 'tomo', 'comi', 'cuantas', 'partes', 'pintad', 'elegid']],
              min: 1,
              hint: 'En 3/4, el 3 de arriba, ¿qué cuenta en la pizza?',
              probe: '¿Qué nos dice el número de arriba de una fracción?',
            },
          ],
        },
        {
          id: 'fr3',
          title: '¿Cuál es más grande?',
          visual: { type: 'pizza-compare', a: [2, 1], b: [4, 1] },
          text:
            'Cuando el denominador es más grande, cada parte es más pequeña. Por eso 1/2 de una pizza es más que 1/4 de la misma pizza: la mitad se obtiene al dividir en solo 2 partes, y cada pedazo es mucho más grande que cuando se divide en 4.',
          points: [
            {
              id: 'p-compara',
              weight: 2,
              label: 'si el denominador es mayor, cada parte es más pequeña',
              statement: 'Cuanto más grande es el denominador, más pequeñas son las partes. Por eso 1/2 es más que 1/4.',
              keywords: [['mas pequen', 'mas chic', 'menor', 'chiquit', 'mas grande', 'mayor', 'mas partes', 'mas pedazos'], ['denomin', 'abajo', 'partes', 'pedazo', 'pizza', 'mitad']],
              min: 1,
              hint: 'Imagina que repartes la misma pizza entre 2 personas y luego entre 4. ¿En qué caso cada pedazo es más grande?',
              example: 'Una barra de chocolate repartida entre 2 amigos da pedazos grandes; repartida entre 10 amigos, pedazos muy chiquitos.',
              probe: 'Si el denominador es más grande, ¿cómo es el tamaño de cada parte?',
            },
          ],
        },
      ],
      misconceptions: [
        {
          id: 'denominador-mayor-fraccion-mayor',
          label: 'Cree que una fracción es mayor cuando su denominador es mayor (compara solo los números)',
          confusedWith: 'comparar números enteros',
          triggers: [
            '(1 4|un cuarto|cuarto|1 8|un octavo|1 3|un tercio).{0,30}(es )?(mas grande|mayor|mas)\\b.{0,25}(1 2|la mitad|medio|1 3|un tercio|1 4)',
            'porque (el )?(4|cuatro|3|tres|8|ocho|10|diez) (es )?(mas grande|mayor|mas que)',
            '(numero|denominador|numero de abajo) (mas grande|mayor).{0,30}(fraccion|pedazo|parte) (mas grande|mayor)',
            'mientras mas grande (es )?(el )?(numero|denominador).{0,30}(mas grande|mayor)',
          ],
          child: 'Veo que estás comparando los números de abajo como si fueran números normales. Vamos a mirar qué pasa con el tamaño de los pedazos.',
          adult: 'Compara fracciones aplicando la lógica de los números enteros (4 > 2, entonces 1/4 > 1/2).',
          recommendation: 'Practicar comparación de fracciones con la misma unidad (pizzas, barras) antes de comparar con números.',
          contrast: {
            intro: 'Aquí hay dos pizzas del mismo tamaño. A la primera le comieron 1/2, a la segunda 1/4. Observa un pedazo de cada una.',
            items: [
              { id: 'A', text: 'Pizza cortada en 2 partes iguales: un pedazo es 1/2.', visual: { type: 'pizza', n: 2, take: 1 } },
              { id: 'B', text: 'Pizza cortada en 4 partes iguales: un pedazo es 1/4.', visual: { type: 'pizza', n: 4, take: 1 } },
            ],
            question: '¿En cuál pizza el pedazo es más grande? ¿Cómo lo sabes?',
            choiceQuestion: '¿En cuál pizza el pedazo es más grande?',
            correct: 'A',
            whyKeywords: [['menos partes', 'menos pedazos', 'dos partes', 'mitad', 'mas pedazos', 'mas partes', 'se corto en menos', 'dividida en 2', 'cuatro partes', 'mas pequen', 'mas chic']],
            reveal:
              'En la pizza A, el entero se dividió solo en 2 partes, así que cada pedazo es grande. En la B se dividió en 4, y cada pedazo es más pequeño. Por eso 1/2 es mayor que 1/4, aunque 4 sea mayor que 2.',
            features: [
              'Entre más partes iguales tiene el entero, más pequeña es cada parte.',
              'El denominador cuenta partes: un denominador grande significa partes chiquitas.',
            ],
          },
        },
      ],
      applyTasks: [
        {
          id: 'fr-a1',
          level: 1,
          kind: 'choice',
          prompt: 'María comió 1/2 de una pizza y Pablo comió 1/4 de otra pizza igual. ¿Quién comió más?',
          options: [
            { id: 'a', text: 'María, porque la mitad es más grande que un cuarto.' },
            { id: 'b', text: 'Pablo, porque 4 es más grande que 2.', misc: 'denominador-mayor-fraccion-mayor' },
            { id: 'c', text: 'Comieron lo mismo.' },
          ],
          correct: 'a',
          whyPrompt: 'Explica con tus palabras cómo lo sabes.',
          whyKeywords: [['pedazo', 'parte', 'mitad', 'mas grande', 'mayor', 'menos partes', 'dos partes', 'cuatro partes']],
          help: {
            hint: 'Dibuja o imagina las dos pizzas, una cortada en 2 partes y otra en 4. ¿De cuál sale el pedazo más grande?',
            example: 'Una barra de chocolate partida en 2 da pedazos más grandes que la misma barra partida en 4.',
          },
        },
        {
          id: 'fr-a2',
          level: 2,
          kind: 'open',
          prompt:
            'Inventa un ejemplo de fracción que NO sea de pizza (una barra de chocolate, un grupo de amigos, una hoja…). Escribe la fracción y explica qué significa cada número.',
          require: ['\\d\\s*/\\s*\\d|\\b(medio|mitad|tercio|cuarto|quinto|octavo)'],
          keywords: [['partes', 'pedazos', 'trozos', 'dividid', 'cort'], ['arriba', 'abajo', 'numerador', 'denominador', 'tomo', 'toma', 'como', 'pinto', 'elijo']],
          minWords: 10,
          help: {
            hint: 'Elige algo que se pueda dividir en partes iguales y di cuántas partes tiene y cuántas tomas.',
            example: 'Una hoja doblada en 8 partes iguales; si coloreo 3, es 3/8: el 8 dice cuántas partes, el 3 cuántas coloreé.',
          },
        },
        {
          id: 'fr-a3',
          level: 3,
          kind: 'choice',
          prompt: 'Ana dice: «1/3 es mayor que 1/2 porque 3 es mayor que 2». Encuentra el error en lo que dice Ana.',
          options: [
            { id: 'a', text: 'Ana dividió mal la pizza.' },
            { id: 'b', text: 'Ana comparó solo los números de abajo sin pensar en el tamaño de los pedazos.' },
            { id: 'c', text: 'No hay error: 1/3 sí es mayor que 1/2.', misc: 'denominador-mayor-fraccion-mayor' },
          ],
          correct: 'b',
          whyPrompt: '¿Cómo habría razonado Ana si pensara en una pizza?',
          whyKeywords: [['pedazo', 'parte', 'mitad', 'mas grande', 'mayor', 'menos partes', 'dos partes', 'tres partes', 'mas pequen']],
          help: {
            hint: 'Piensa en el tamaño de un pedazo cuando la pizza se corta en 2 y cuando se corta en 3.',
            example: 'Si repartes una pizza entre 2 personas, cada una recibe más que si la repartes entre 3.',
          },
        },
      ],
    },
  ],
};
