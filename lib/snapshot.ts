import 'server-only';
import type { Snapshot } from './types';
import { domainOf, normalizeUrl, sourceOf } from './url';

const UA = 'Mozilla/5.0 (compatible; AcopioBot/1.0; +https://github.com/desarrollosweb2005-apps/acopio)';
const MAX_CONTENT = 30_000;

/**
 * Lee un link y devuelve título, extracto, portada y una copia del texto.
 * La copia se guarda en la base de datos para no perder el contenido si el link muere.
 */
export async function takeSnapshot(rawUrl: string): Promise<Snapshot> {
  const url = rawUrl.trim();
  const base: Snapshot = {
    url,
    url_norm: normalizeUrl(url),
    domain: domainOf(url),
    source: sourceOf(url),
    title: '',
    excerpt: '',
    cover_url: null,
    content: null,
    duration_seconds: null,
    meta: {},
  };

  if (!/^https?:\/\//i.test(url)) return { ...base, error: 'La URL tiene que empezar por http:// o https://' };
  if (!isPublicHttpUrl(url)) return { ...base, error: 'Esa dirección no es una web pública' };

  try {
    if (base.source === 'video') return await youtube(base);
    if (base.source === 'x') return await xPost(base);
    if (base.source === 'repo') return await github(base);
    return await webPage(base);
  } catch (e) {
    // Si falla la lectura, el marcador se guarda igual con lo que haya
    return { ...base, title: base.title || base.domain, error: e instanceof Error ? e.message : 'No se pudo leer la página' };
  }
}

function isPublicHttpUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return false;
    const h = u.hostname;
    return !(
      h === 'localhost' ||
      h.endsWith('.local') ||
      h.endsWith('.internal') ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      h.startsWith('[')
    );
  } catch {
    return false;
  }
}

async function get(url: string, accept = 'text/html,application/json') {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept, 'accept-language': 'es,en;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(9000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`La página respondió ${res.status}`);
  return res;
}

async function youtube(s: Snapshot): Promise<Snapshot> {
  const o = await (await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(s.url)}`)).json();
  const out: Snapshot = {
    ...s,
    title: o.title ?? '',
    cover_url: o.thumbnail_url ?? null,
    meta: { author: o.author_name, author_url: o.author_url },
  };
  // Duración y descripción vienen en el HTML del vídeo; si YouTube no las da, seguimos sin ellas
  try {
    const html = await (await get(s.url)).text();
    const len = html.match(/"lengthSeconds":"(\d+)"/);
    if (len) out.duration_seconds = Number(len[1]);
    const desc = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
    if (desc) {
      const text = JSON.parse(`"${desc[1]}"`) as string;
      out.content = text.slice(0, MAX_CONTENT);
      out.excerpt = firstLine(text);
    }
  } catch {
    /* sin duración */
  }
  if (!out.excerpt && o.author_name) out.excerpt = `Canal: ${o.author_name}`;
  return out;
}

async function xPost(s: Snapshot): Promise<Snapshot> {
  const o = await (
    await get(`https://publish.twitter.com/oembed?omit_script=1&dnt=true&url=${encodeURIComponent(s.url)}`)
  ).json();
  // Solo el texto del post (<p>), sin la firma "— autor (@usuario) fecha" ni los links de imágenes
  const html = String(o.html ?? '');
  const body = html.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? html;
  const text = htmlToText(body.replace(/<a [^>]*>(pic\.twitter\.com[^<]*)<\/a>/g, ''));
  const author = o.author_name ?? '';
  const oneLine = text.replace(/\s+/g, ' ');
  return {
    ...s,
    title: author ? `${author} en X: ${truncate(oneLine, 90)}` : truncate(oneLine, 110),
    excerpt: truncate(text, 280),
    content: text,
    meta: { author, author_url: o.author_url },
  };
}

async function github(s: Snapshot): Promise<Snapshot> {
  const [, owner, repo] = new URL(s.url).pathname.split('/');
  if (!owner || !repo) return webPage(s);
  const r = await (await get(`https://api.github.com/repos/${owner}/${repo}`, 'application/vnd.github+json')).json();
  let readme: string | null = null;
  try {
    readme = await (await get(`https://api.github.com/repos/${owner}/${repo}/readme`, 'application/vnd.github.raw')).text();
  } catch {
    /* repo sin README */
  }
  return {
    ...s,
    title: r.description ? `${r.full_name}: ${r.description}` : r.full_name,
    excerpt: r.description ?? '',
    cover_url: `https://opengraph.githubassets.com/1/${r.full_name}`,
    content: readme ? readme.slice(0, MAX_CONTENT) : null,
    meta: {
      stars: r.stargazers_count,
      pushed_at: r.pushed_at,
      license: r.license?.spdx_id ?? null,
      archived: r.archived,
      language: r.language,
    },
  };
}

async function webPage(s: Snapshot): Promise<Snapshot> {
  const res = await get(s.url);
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('html')) return { ...s, title: decodeURIComponent(s.url.split('/').pop() || s.domain) };
  const html = (await res.text()).slice(0, 2_000_000);
  const meta = (name: string) =>
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, 'i'))?.[1];
  const title = decode(meta('og:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').trim();
  const body = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html;
  const text = htmlToText(
    body.replace(/<(script|style|noscript|svg|nav|footer|header|form|aside)[\s\S]*?<\/\1>/gi, ' '),
  ).slice(0, MAX_CONTENT);
  const words = text.split(/\s+/).length;
  let cover = meta('og:image') ?? null;
  if (cover) {
    try {
      cover = new URL(decode(cover), s.url).toString();
    } catch {
      cover = null;
    }
  }
  return {
    ...s,
    title: title || s.domain,
    excerpt: decode(meta('og:description') ?? meta('description') ?? '').trim() || truncate(text, 200),
    cover_url: cover,
    content: text || null,
    // Tiempo de lectura aproximado (200 palabras por minuto)
    duration_seconds: words > 150 ? Math.round((words / 200) * 60) : null,
  };
}

function htmlToText(html: string) {
  return decode(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h\d|blockquote|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

function decode(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&');
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const firstLine = (s: string) => truncate(s.split('\n').find((l) => l.trim()) ?? '', 200);
