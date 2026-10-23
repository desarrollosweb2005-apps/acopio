import { colName, splitRef, type Sheet } from './xlsx';
import { normalizeUrl } from './url';

/**
 * Planilla de vídeos vistos: una columna por mes; filas celestes = categoría, debajo los subtemas
 * («3 Claude»). El número es cuántos vídeos se vieron ese mes y el comentario de la celda lleva
 * cada vídeo numerado: «1.- Canal https://youtube.com/@canal / Título / https://youtube.com/watch?v=…».
 * Solo cuentan las celdas con número mayor que 0 (las que tienen 0 pueden arrastrar comentarios de meses anteriores).
 */
export interface ExcelVideo {
  /** Posición de la columna de mes (0 = primera) */
  month: number;
  cell: string;
  /** Orden dentro del mes, como en la planilla */
  order: number;
  category: string;
  topic: string;
  url: string;
  urlNorm: string;
  kind: 'video' | 'channel' | 'web';
  author: string;
  title: string;
}

export interface ExcelParse {
  columns: { letter: string; count: number; sample: string }[];
  items: ExcelVideo[];
  /** Vídeos en celdas con 0 (no se importan) */
  zeroCells: number;
  /** El mismo link más de una vez en la planilla (se guarda el primero) */
  repeated: number;
}

const URL_RE = /https?:\/\/[^\s<>"]+/g;
const youtubeVideo = (u: string) => /youtu\.be\/[\w-]+|youtube\.com\/(watch\?|shorts\/|live\/)/.test(u);
const youtubeAny = (u: string) => /(^|\/\/)(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(u);

function leadingNumber(v: string) {
  const m = v.match(/^\s*(\d+)\s*(.*)$/s);
  return m ? { n: Number(m[1]), label: m[2].trim() } : { n: null, label: v.trim() };
}

const cleanLabel = (s: string) => s.replace(/\s+/g, ' ').replace(/[\s/]+$/, '').trim();

/** «Dan Koe (IA/Productivity)» → «dan-koe»; «N8N Cotizadores PDF» → «n8n-cotizadores-pdf» */
export function topicTag(label: string) {
  return label.replace(/\([^)]*\)/g, ' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
}

function parseComment(text: string) {
  // Bloques numerados: «1.-», «2.», «7..-», «3 .-»
  return text.split(/^[ \t]*\d+[ \t]*\.+[ \t]*-?[ \t]*/m).slice(1).flatMap((block) => {
    const urls = (block.match(URL_RE) ?? []).map((u) => u.replace(/[),.;]+$/, ''));
    const url = urls.find(youtubeVideo) ?? urls.find(youtubeAny) ?? urls[0];
    if (!url) return [];
    const raw = block.split('\n').filter((l) => l.replace(URL_RE, '').trim());
    const text = (l: string) => l.replace(URL_RE, '').replace(/^[\s/|–-]+|[\s/|–-]+$/g, '').trim();
    const kind: ExcelVideo['kind'] = youtubeVideo(url) ? 'video' : youtubeAny(url) ? 'channel' : 'web';
    // La primera línea es el canal si hay más líneas o si lleva el link del canal («Canal // https://youtube.com/@canal»)
    const firstIsAuthor = raw.length > 1 || (!!raw[0] && (/\/\/\s|youtube\.com\/@/.test(raw[0]) || kind === 'channel'));
    const lines = raw.map(text).filter(Boolean);
    return [{ url, kind, author: firstIsAuthor ? lines[0] ?? '' : '', title: (firstIsAuthor ? lines.slice(1) : lines).join(' ') }];
  });
}

export function parseVideoSheet(sheet: Sheet): ExcelParse {
  const maxRow = Math.max(0, ...[...sheet.cells.keys()].map((r) => splitRef(r).row));
  const value = (col: number, row: number) => sheet.cells.get(`${colName(col)}${row}`) ?? '';
  // Columnas de mes: las que tienen varias celdas «número + subtema» (un comentario suelto no cuenta)
  const numbered = new Map<number, number>();
  sheet.cells.forEach((v, ref) => { if (/^\s*\d+\s+\S/.test(v)) { const c = splitRef(ref).col; numbered.set(c, (numbered.get(c) ?? 0) + 1); } });
  const monthCols = [...new Set([...sheet.comments.keys()].map((r) => splitRef(r).col))]
    .filter((c) => (numbered.get(c) ?? 0) >= 3).sort((a, b) => a - b);

  // Los nombres pueden cambiar de un mes a otro: se usa el del mes más reciente para toda la fila
  const latest = (row: number, header: boolean) => {
    for (const col of [...monthCols].reverse()) {
      const v = value(col, row);
      if (!v) continue;
      const { n, label } = leadingNumber(v);
      if ((n === null) === header && label) return cleanLabel(label);
    }
    return '';
  };

  const items: ExcelVideo[] = [];
  let zeroCells = 0;
  monthCols.forEach((col, month) => {
    let headerRow = 0;
    let order = 0;
    for (let row = 1; row <= maxRow; row++) {
      const v = value(col, row);
      const { n } = leadingNumber(v);
      if (v && n === null) { headerRow = row; continue; }
      const comment = sheet.comments.get(`${colName(col)}${row}`);
      if (!comment) continue;
      const found = parseComment(comment);
      if (!n) { zeroCells += found.length; continue; }
      const category = headerRow ? latest(headerRow, true) : '';
      const topic = latest(row, false);
      found.forEach((f) => items.push({
        ...f, month, cell: `${colName(col)}${row}`, order: ++order, category, topic, urlNorm: normalizeUrl(f.url),
      }));
    }
  });

  const seen = new Set<string>();
  const unique = items.filter((it) => (seen.has(it.urlNorm) ? false : (seen.add(it.urlNorm), true)));
  return {
    columns: monthCols.map((col, i) => {
      const its = unique.filter((it) => it.month === i);
      return { letter: colName(col), count: its.length, sample: its.find((it) => it.title)?.title ?? '' };
    }),
    items: unique,
    zeroCells,
    repeated: items.length - unique.length,
  };
}
