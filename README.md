# Tutor adaptativo para aprender a aprender

MVP funcional de un tutor personal para niños de 9–12 años (y estudiantes universitarios) que **observa → diagnostica → adapta → enseña → practica → comprueba → recuerda**. No es un chatbot de preguntas y respuestas: el comportamiento del tutor es el producto.

- Análisis de requisitos, arquitectura y qué es real/simulado: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)

## Arrancar

```bash
npm install        # opcional: solo instala el SDK de IA (puede omitirse)
npm start          # http://127.0.0.1:3000
npm test           # 48 pruebas
npm run demo       # recorrido narrado: material → diagnóstico → … → repaso → vista adulta
```

Requiere Node ≥ 20. No hay dependencias obligatorias ni paso de compilación.

Variables: `PORT`, `HOST` (por defecto `127.0.0.1`), `DATA_FILE` (por defecto `data/db.json`), `ANTHROPIC_API_KEY` y `TUTOR_MODEL` (IA externa opcional, ver abajo).

## Probarlo en 3 minutos

1. Crea un perfil (primaria o universidad) → **Estudiar un material** → elige *Texto expositivo*.
2. Responde «sirve para contar una historia» y observa: el tutor no dice «incorrecto»; propone comparar dos textos.
3. Activa **Ver cómo piensa el tutor** (arriba en la sesión) para ver cada diagnóstico: observación, interpretación, confianza y ayuda recomendada.
4. Pide ayuda: solo aparece el siguiente nivel (pista → ejemplo → paso a paso → explicación).
5. Al terminar, en **Zona para adultos** (PIN) → *Privacidad y controles* → «Días simulados: 1» y pulsa **Repasar algo que aprendí**.
6. Para probar el modo universitario, crea un perfil «universidad» y elige *Valor p y contraste de hipótesis*.

Con material propio (texto pegado o `.txt`) el tutor divide el texto, detecta el tema y genera preguntas a partir de las ideas clave; sin IA externa el análisis de material nuevo es básico (ver límites).

## IA externa (opcional, apagada por defecto)

Con `ANTHROPIC_API_KEY` definido, un **adulto** puede activar «IA externa» en la zona adulta. Entonces el modelo (por defecto `claude-opus-5-5`, vía el SDK oficial) refina el diagnóstico, analiza material nuevo y lee fotos. Solo se envían el texto del material y la respuesta del niño, nunca su nombre. Si algo falla, se vuelve al motor local. *Esta ruta se probó con un cliente simulado, no contra la API real.*

## Límites conocidos

Sin IA externa, el diagnóstico es heurístico: es robusto en los 4 temas curados (texto expositivo, fracciones, rotación/traslación, valor p) y más limitado con material nuevo. Detalle completo en `docs/ARQUITECTURA.md` §3.

## Privacidad

Solo apodo, nivel e intereses elegidos; todo local; PIN adulto; exportar o borrar todo; sin analíticas ni publicidad.
