import { NextResponse } from 'next/server';
import { authedClient } from '@/lib/supabase/server';
import { chatJSON } from '@/lib/ai';
import { aiErrorResponse, clip, unauthorized } from '@/lib/ai-context';
import { fold } from '@/lib/format';

export const maxDuration = 60;

const STOP = new Set('que de la el los las un una unos unas y o en sobre para por con sin mi mis me lo le se del al es son como guarde tengo hay algo cosas cual donde alguno alguna the and for with what about'.split(' '));

/** Responde una pregunta sobre la biblioteca citando los marcadores en los que se basa. */
export async function POST(request: Request) {
  const supabase = await authedClient();
  if (!supabase) return unauthorized();
  const { question } = await request.json();
  if (!question?.trim()) return NextResponse.json({ error: 'Escribe una pregunta' }, { status: 400 });

  const { data } = await supabase.from('bookmarks')
    .select('id,title,note,excerpt,tags,domain,prompt_text,meta,created_at,highlights(text,note)')
    .order('created_at', { ascending: false });
  const all = data ?? [];
  const hay = (b: (typeof all)[number]) => fold([b.title, b.note, b.excerpt, b.domain, b.prompt_text, (b.tags as string[]).join(' '),
    ((b.meta as { summary?: string[] })?.summary ?? []).join(' '), ...(b.highlights ?? []).map((h) => `${h.text} ${h.note}`)].join(' '));
  // Preselección por palabras (con raíz corta para plurales); si nada coincide, los más recientes
  const words = fold(question).replace(/[¿?¡!.,:;]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.slice(0, Math.max(4, w.length - 2)));
  const scored = all.map((b) => { const h = hay(b); return { b, score: words.reduce((a, w) => a + (h.includes(w) ? 1 : 0), 0) }; });
  const top = scored.some((s) => s.score) ? scored.filter((s) => s.score).sort((a, b) => b.score - a.score).slice(0, 30).map((s) => s.b) : all.slice(0, 30);

  const list = top.map((b, i) => `[${i + 1}] ${clip(b.title, 160)} (${b.domain ?? 'prompt'}) — ${clip(((b.meta as { summary?: string[] })?.summary ?? []).join(' ') || b.note || b.excerpt, 260)} — etiquetas: ${(b.tags as string[]).join(', ')}`).join('\n');
  try {
    const out = await chatJSON<{ answer?: string; refs?: number[] }>(
      `Respondes preguntas sobre la biblioteca personal de links del usuario, en español y de forma breve (máx. 120 palabras). Usa solo los marcadores de la lista. Cita los que uses con su número entre corchetes, por ejemplo [2]. Si ninguno responde a la pregunta, dilo claramente. Responde solo JSON {"answer": string, "refs": number[]} con los números citados en orden de relevancia.`,
      `Pregunta: ${clip(question, 500)}\n\nMarcadores:\n${list || '(la biblioteca está vacía)'}`,
      1200,
    );
    const ids = (out.refs ?? []).map((n) => top[Number(n) - 1]?.id).filter(Boolean);
    // Las referencias [n] del texto se reescriben con el orden de la lista de citas que ve el usuario
    const order = (out.refs ?? []).map(Number);
    const answer = String(out.answer ?? '').replace(/\[(\d+)\]/g, (m, n) => { const k = order.indexOf(Number(n)); return k >= 0 ? `[${k + 1}]` : ''; });
    return NextResponse.json({ answer, ids: [...new Set(ids)] });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
