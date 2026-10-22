import { NextResponse } from 'next/server';
import { authedClient } from '@/lib/supabase/server';
import { unauthorized } from '@/lib/ai-context';

export const maxDuration = 60;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

type Result = 'ok' | 'broken' | 'unknown';

/**
 * Comprueba si los links responden. Solo se marca como roto lo que es seguro
 * (404/410, dominio que ya no existe, vídeo o post borrado); un 403 o un 429 suele ser
 * una web que bloquea robots, no un link roto.
 */
async function check(url: string): Promise<Result> {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    // YouTube y X: su oEmbed dice si el vídeo o el post siguen publicados
    if (/youtube\.com$|youtu\.be$/.test(host) && !u.pathname.startsWith('/@')) {
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(8000) });
      return r.ok ? 'ok' : r.status === 404 || r.status === 401 ? 'broken' : 'unknown';
    }
    if (/(^|\.)(x|twitter)\.com$/.test(host) && u.pathname.includes('/status/')) {
      const r = await fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(8000) });
      return r.ok ? 'ok' : r.status === 404 ? 'broken' : 'unknown';
    }
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(9000) });
    r.body?.cancel().catch(() => {});
    if (r.ok) return 'ok';
    return r.status === 404 || r.status === 410 ? 'broken' : 'unknown';
  } catch (e) {
    const code = (e as { cause?: { code?: string } }).cause?.code;
    return code === 'ENOTFOUND' || code === 'EAI_NONAME' ? 'broken' : 'unknown';
  }
}

export async function POST(request: Request) {
  const supabase = await authedClient();
  if (!supabase) return unauthorized();
  const { ids } = (await request.json()) as { ids: string[] };
  const { data } = await supabase.from('bookmarks').select('id,url,meta').in('id', (ids ?? []).slice(0, 12)).not('url', 'is', null);
  const results = await Promise.all((data ?? []).map(async (b) => ({ id: b.id as string, meta: b.meta, result: await check(b.url as string) })));
  const checked_at = new Date().toISOString();
  await Promise.all(results.map((r) => supabase.from('bookmarks')
    .update({ ...(r.result === 'unknown' ? {} : { is_broken: r.result === 'broken' }), meta: { ...(r.meta ?? {}), checked_at, check_result: r.result } })
    .eq('id', r.id)));
  return NextResponse.json({ results: results.map(({ id, result }) => ({ id, result, checked_at })) });
}
