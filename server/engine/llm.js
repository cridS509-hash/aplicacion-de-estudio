// Proveedor LLM OPCIONAL (Claude, vía el SDK oficial @anthropic-ai/sdk).
// - Está apagado por defecto: sin ANTHROPIC_API_KEY y sin que un ADULTO lo active, nada sale del dispositivo.
// - Solo envía el texto del material y la respuesta del niño; nunca nombre, edad ni otros datos del perfil.
// - Cualquier fallo (red, rechazo del modelo, JSON inválido) vuelve al motor heurístico local.
// NOTA: esta ruta no se ha podido probar contra la API real en el entorno de desarrollo (sin clave);
// está cubierta por pruebas con un cliente simulado.

import { buildLesson } from './material.js';

export const DEFAULT_MODEL = process.env.TUTOR_MODEL || 'claude-opus-5-5';

let clientPromise = null;
let injectedClient = null;

/** Para pruebas: permite inyectar un cliente simulado. */
export function _setClient(c) {
  injectedClient = c;
  clientPromise = null;
}

async function getClient() {
  if (injectedClient) return injectedClient;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  clientPromise ||= import('@anthropic-ai/sdk')
    .then((m) => new (m.default || m.Anthropic)())
    .catch(() => null);
  return clientPromise;
}

export async function llmAvailable() {
  return !!(await getClient());
}

const MATERIAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'subject', 'concepts'],
  properties: {
    title: { type: 'string' },
    subject: { type: 'string' },
    concepts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'summary', 'prior', 'chunks', 'misconceptions', 'applyTasks'],
        properties: {
          name: { type: 'string' },
          summary: { type: 'string' },
          prior: { type: 'array', items: { type: 'string' } },
          chunks: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'text', 'points'],
              properties: {
                title: { type: 'string' },
                text: { type: 'string' },
                points: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['label', 'statement', 'keywords', 'hint', 'example', 'probe'],
                    properties: {
                      label: { type: 'string' },
                      statement: { type: 'string' },
                      keywords: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
                      hint: { type: 'string' },
                      example: { type: 'string' },
                      probe: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          misconceptions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['label', 'confusedWith', 'triggers', 'adult'],
              properties: {
                label: { type: 'string' },
                confusedWith: { type: 'string' },
                triggers: { type: 'array', items: { type: 'string' } },
                adult: { type: 'string' },
              },
            },
          },
          applyTasks: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['prompt', 'keywords', 'hint', 'example'],
              properties: {
                prompt: { type: 'string' },
                keywords: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
                hint: { type: 'string' },
                example: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};

const DIAG_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['outcome', 'comprehension', 'covered_ideas', 'missing_ideas', 'misconception', 'observation', 'interpretation', 'confidence'],
  properties: {
    outcome: { type: 'string', enum: ['correct', 'partial', 'incorrect', 'confused', 'no_knowledge', 'comprehension_issue', 'application_issue'] },
    comprehension: { type: 'integer', enum: [0, 1, 2, 3] },
    covered_ideas: { type: 'array', items: { type: 'string' } },
    missing_ideas: { type: 'array', items: { type: 'string' } },
    misconception: { type: 'string' },
    observation: { type: 'string' },
    interpretation: { type: 'string' },
    confidence: { type: 'number' },
  },
};

const SYSTEM_BASE = `Eres el motor de análisis de un tutor adaptativo que enseña a aprender. Reglas:
- Analizas con prudencia: separa OBSERVACIÓN (hechos de la respuesta) de INTERPRETACIÓN (hipótesis, nunca certezas).
- Nunca etiquetes al estudiante («es visual», «tiene mala memoria»).
- No des la respuesta al estudiante; solo analiza.
- Responde exclusivamente con el JSON pedido, en español.`;

async function callJSON(client, { system, user, schema, maxTokens = 6000, effort = 'low', signal }) {
  const res = await client.messages.create(
    {
      model: DEFAULT_MODEL,
      max_tokens: maxTokens,
      system: `${SYSTEM_BASE}\n${system}`,
      messages: [{ role: 'user', content: user }],
      output_config: { effort, format: { type: 'json_schema', schema } },
    },
    signal ? { signal } : undefined,
  );
  if (res.stop_reason === 'refusal') throw new Error('refusal');
  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

/** Análisis real del material: conceptos, ideas clave, errores típicos y tareas de aplicación. */
export async function analyzeMaterialLLM(text, { level = 'primary', subject, title, chunkWords, timeoutMs = 45000 } = {}) {
  const client = await getClient();
  if (!client) return null;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const audience = level === 'university' ? 'estudiante universitario (mantén el rigor)' : 'niño de 9 a 12 años (lenguaje sencillo)';
    const out = await callJSON(client, {
      system: `Divide el material en conceptos y fragmentos de ~${chunkWords || 90} palabras (conserva el texto original en "text"). Para cada fragmento da 1-3 ideas clave con "keywords" (grupos de alternativas: prefijos de palabra en minúscula y sin tildes), una pista mínima (hint), un ejemplo (example) y una pregunta que sondee la idea sin revelarla (probe). Añade errores conceptuales plausibles con "triggers" como expresiones regulares sobre texto sin tildes ni signos. Añade 2 tareas de aplicación. Audiencia: ${audience}.`,
      user: `Título: ${title || '(sin título)'}\nMateria: ${subject || '(sin materia)'}\n\nMATERIAL:\n${text.slice(0, 20000)}`,
      schema: MATERIAL_SCHEMA,
      maxTokens: 12000,
      effort: 'medium',
      signal: ac.signal,
    });
    return validateLLMLesson(out, text, level);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Convierte y valida la salida del modelo en una lección con la misma forma que el motor local. */
export function validateLLMLesson(out, text, level) {
  if (!out || !Array.isArray(out.concepts) || !out.concepts.length) return null;
  let n = 0;
  const concepts = out.concepts.slice(0, 8).map((c, ci) => {
    const chunks = (c.chunks || []).filter((k) => k.text).map((k, ki) => ({
      id: `c${ci + 1}k${ki + 1}`,
      title: k.title || `Parte ${ki + 1}`,
      text: k.text,
      points: (k.points || []).slice(0, 4).map((p, pi) => ({
        id: `c${ci + 1}k${ki + 1}-p${pi + 1}`,
        weight: 1,
        label: p.label,
        statement: p.statement,
        keywords: (p.keywords || []).filter((g) => Array.isArray(g) && g.length).map((g) => g.map(String)),
        min: 0.5,
        hint: p.hint,
        example: p.example,
        probe: p.probe,
      })),
    }));
    if (!chunks.length) return null;
    const misconceptions = (c.misconceptions || []).slice(0, 4).map((m, mi) => {
      const triggers = (m.triggers || []).filter((t) => {
        try {
          new RegExp(t);
          return true;
        } catch {
          return false;
        }
      });
      return { id: `llm-m${ci}-${mi}`, label: m.label, confusedWith: m.confusedWith, triggers, adult: m.adult, child: 'Creo que aquí se están mezclando dos ideas. Vamos a mirarlo con calma.', recommendation: `Practicar la diferencia con ${m.confusedWith}.`, contrast: null };
    });
    const applyTasks = (c.applyTasks || []).slice(0, 3).map((t, ti) => ({
      id: `llm-a${ci}-${ti}`, level: ti + 1, kind: 'open', prompt: t.prompt, keywords: (t.keywords || []).filter((g) => Array.isArray(g)), minWords: 10, novelty: true,
      help: { hint: t.hint, example: t.example },
    }));
    n++;
    return { id: `llm-c${ci + 1}`, name: c.name, summary: c.summary, prior: (c.prior || []).slice(0, 3), analogies: {}, vocabulary: [], chunks, misconceptions, applyTasks, terms: [], generated: true };
  }).filter(Boolean);
  if (!concepts.length) return null;
  return {
    id: `les-llm-${Date.now().toString(36)}`,
    title: out.title || concepts[0].name,
    subject: out.subject || 'General',
    level,
    source: 'llm',
    packId: null,
    concepts,
    sourceText: text,
    notes: ['Análisis del material con IA externa activada por un adulto.'],
  };
}

/**
 * Refina un diagnóstico heurístico con el modelo. Devuelve el mismo objeto con campos mejorados
 * (outcome, comprensión, observación e interpretación) o el original si algo falla.
 */
export async function refineDiagnosis(ctx, heuristic, { timeoutMs = 25000 } = {}) {
  const client = await getClient();
  if (!client) return heuristic;
  if (ctx.purpose === 'prior' || ctx.qType === 'order') return heuristic;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const ideas = (ctx.points || []).map((p) => `- ${p.statement}`).join('\n') || '(sin ideas fijadas)';
    const miscs = (ctx.concept?.misconceptions || []).map((m) => `- ${m.label}`).join('\n') || '(ninguno conocido)';
    const out = await callJSON(client, {
      system: 'Analiza la respuesta de un estudiante a una pregunta de comprensión. "misconception" es el texto de uno de los errores conocidos si aplica, si no cadena vacía.',
      user: `Nivel: ${ctx.level}\nTipo de actividad: ${ctx.purpose}\nIdeas esperadas:\n${ideas}\nErrores conocidos:\n${miscs}\n\nRESPUESTA DEL ESTUDIANTE:\n${String(ctx.answer?.text || ctx.answer?.choice || '').slice(0, 1500)}`,
      schema: DIAG_SCHEMA,
      maxTokens: 2500,
      effort: 'low',
      signal: ac.signal,
    });
    const merged = { ...heuristic };
    if (out.outcome && ['correct', 'partial', 'incorrect', 'confused', 'no_knowledge', 'comprehension_issue', 'application_issue'].includes(out.outcome)) merged.outcome = out.outcome;
    if (Number.isInteger(out.comprehension) && merged.dims.comprehension !== null) merged.dims = { ...merged.dims, comprehension: out.comprehension };
    merged.observation = `${out.observation}`;
    merged.interpretation = `${out.interpretation}`;
    merged.confidence = Math.max(0.1, Math.min(0.95, Number(out.confidence) || merged.confidence));
    merged.source = 'llm';
    if (out.misconception) {
      const m = (ctx.concept?.misconceptions || []).find((x) => out.misconception.includes(x.label) || x.label.includes(out.misconception));
      if (m) merged.misconception = { id: m.id, label: m.label, confusedWith: m.confusedWith, via: 'llm' };
    }
    return merged;
  } catch {
    return heuristic;
  } finally {
    clearTimeout(t);
  }
}

/** Transcribe una foto de material escolar (requiere IA externa activada). */
export async function transcribeImage(dataUrl, { timeoutMs = 45000 } = {}) {
  const client = await getClient();
  if (!client) return null;
  const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m || m[2].length > 8_000_000) return null;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await client.messages.create(
      {
        model: DEFAULT_MODEL,
        max_tokens: 6000,
        system: 'Transcribe fielmente el texto de la imagen de material escolar. Devuelve solo el texto, sin comentarios.',
        messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }, { type: 'text', text: 'Transcribe el texto de esta imagen.' }] }],
        output_config: { effort: 'low' },
      },
      { signal: ac.signal },
    );
    if (res.stop_reason === 'refusal') return null;
    return (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export { buildLesson };
