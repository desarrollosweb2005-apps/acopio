import type { Source } from './types';

const TRACKING = /^(utm_\w+|_bhlid|si|s|ref|ref_src|fbclid|gclid|igshid|feature|mc_cid|mc_eid)$/i;

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.replace(/^(www\.|m\.|mobile\.)/, '').toLowerCase();
    // youtu.be/ID y shorts → forma canónica watch?v=ID
    if (host === 'youtu.be') return `youtube.com/watch?v=${u.pathname.slice(1)}`;
    if (host === 'youtube.com' && u.pathname.startsWith('/shorts/')) {
      return `youtube.com/watch?v=${u.pathname.split('/')[2]}`;
    }
    const twitterHost = host === 'twitter.com' ? 'x.com' : host;
    [...u.searchParams.keys()].forEach((k) => TRACKING.test(k) && u.searchParams.delete(k));
    const search = u.searchParams.toString();
    // Solo el dominio va en minúsculas: rutas e IDs (YouTube, X) distinguen mayúsculas
    return `${twitterHost}${u.pathname.replace(/\/$/, '')}${search ? '?' + search : ''}`;
  } catch {
    return raw.trim();
  }
}

export function domainOf(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function sourceOf(raw: string): Source {
  const d = domainOf(raw);
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(d)) return 'video';
  if (/(^|\.)(x|twitter)\.com$/.test(d)) return 'x';
  if (d === 'github.com') return 'repo';
  return 'web';
}

/** Android comparte "Título https://..." en el campo text: saca la primera URL. */
export function extractUrl(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    const m = c?.match(/https?:\/\/[^\s"'<>]+/);
    if (m) return m[0];
  }
  return null;
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}
