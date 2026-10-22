import 'server-only';

const BASE = 'https://api.groq.com/openai/v1';
// Orden de preferencia; si Groq retira uno, se elige otro de los disponibles en la cuenta
const PREFERRED = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile'];
let modelCache: string | null = null;

export const aiEnabled = () => !!process.env.GROQ_API_KEY;

export class AiError extends Error {}

async function availableModel(): Promise<string> {
  const res = await fetch(`${BASE}/models`, { headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}` }, cache: 'no-store' });
  if (!res.ok) throw new AiError('No se pudo consultar los modelos de Groq. Revisa la clave GROQ_API_KEY.');
  const ids: string[] = ((await res.json()).data ?? []).map((m: { id: string }) => m.id);
  const pick = PREFERRED.find((p) => ids.includes(p)) ?? ids.find((id) => !/whisper|guard|tts|orpheus|playai|compound|distil/i.test(id));
  if (!pick) throw new AiError('Tu cuenta de Groq no tiene modelos de texto disponibles.');
  return pick;
}

/** Llama a Groq y devuelve la respuesta como JSON. */
export async function chatJSON<T>(system: string, user: string, maxTokens = 2500): Promise<T> {
  if (!aiEnabled()) throw new AiError('Falta la clave GROQ_API_KEY en Vercel.');
  let model = process.env.GROQ_MODEL || modelCache || PREFERRED[0];
  for (let attempt = 0; attempt < 3; attempt++) {
    const reasoning = model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {};
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_completion_tokens: maxTokens,
        ...reasoning,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(55_000),
    });
    if (res.ok) {
      const data = await res.json();
      const text: string = data.choices?.[0]?.message?.content ?? '';
      try {
        return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')) as T;
      } catch {
        if (attempt < 2) continue;
        throw new AiError('La IA devolvió una respuesta que no se pudo leer. Prueba otra vez.');
      }
    }
    const body = await res.text();
    if (res.status === 429) throw new AiError('Groq está al límite de uso por minuto. Espera un momento y vuelve a intentarlo.');
    if (res.status === 401) throw new AiError('Groq rechazó la clave. Revisa GROQ_API_KEY en Vercel.');
    if (/model/i.test(body) && /not found|does not exist|decommission|deprecated|not available/i.test(body) && !process.env.GROQ_MODEL) {
      model = modelCache = await availableModel();
      continue;
    }
    if (/json/i.test(body) && res.status === 400 && attempt < 2) continue; // json_validate_failed: reintenta
    throw new AiError(`Groq respondió ${res.status}: ${body.slice(0, 200)}`);
  }
  throw new AiError('La IA no respondió. Prueba otra vez.');
}
