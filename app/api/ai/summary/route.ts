import { NextResponse } from 'next/server';
import { authedClient } from '@/lib/supabase/server';
import { chatJSON } from '@/lib/ai';
import { aiErrorResponse, clip, unauthorized } from '@/lib/ai-context';

/** Resumen en español del contenido guardado de un marcador. Se guarda en meta.summary. */
export async function POST(request: Request) {
  const supabase = await authedClient();
  if (!supabase) return unauthorized();
  const { id } = await request.json();
  const { data: b } = await supabase.from('bookmarks').select('title,excerpt,note,content,domain,meta').eq('id', id).single();
  if (!b) return NextResponse.json({ error: 'No se encontró el marcador' }, { status: 404 });
  const text = clip(b.content, 9000) || clip(b.excerpt, 2000);
  if (!text) return NextResponse.json({ error: 'No hay contenido guardado que resumir. Pulsa antes «Guardar copia ahora».' }, { status: 400 });
  try {
    const out = await chatJSON<{ points?: string[] }>(
      `Resume contenido guardado en una biblioteca personal. Responde solo JSON {"points": string[]} con 3 a 5 puntos breves y concretos en español (aunque el original esté en otro idioma). Sin relleno ni frases de marketing: qué es, qué enseña o qué ofrece, y lo más útil para recordar.`,
      `Título: ${clip(b.title, 300)}\nWeb: ${b.domain ?? ''}\n\nContenido:\n${text}`,
      900,
    );
    const points = (out.points ?? []).map((p) => clip(String(p), 300)).filter(Boolean).slice(0, 5);
    if (!points.length) throw new Error('vacío');
    const meta = { ...(b.meta ?? {}), summary: points, summary_at: new Date().toISOString() };
    await supabase.from('bookmarks').update({ meta }).eq('id', id);
    return NextResponse.json({ meta });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
