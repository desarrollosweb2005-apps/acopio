import { strFromU8, unzipSync } from 'fflate';

/** Primera hoja de un .xlsx: texto de cada celda y comentarios (notas), por referencia «A1». Se lee en el navegador. */
export interface Sheet { cells: Map<string, string>; comments: Map<string, string> }

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
const all = (n: Document | Element, tag: string) => [...n.getElementsByTagNameNS('*', tag)];
const texts = (n: Element) => all(n, 't').map((t) => t.textContent ?? '').join('');

/** Ruta de destino de una relación (`rId`) relativa a la carpeta del archivo que la declara. */
function target(files: Record<string, Uint8Array>, relsPath: string, baseDir: string, pick: (r: Element) => boolean) {
  const rels = files[relsPath];
  if (!rels) return null;
  const rel = all(parse(strFromU8(rels)), 'Relationship').find(pick);
  const t = rel?.getAttribute('Target');
  if (!t) return null;
  const parts = (t.startsWith('/') ? t.slice(1) : `${baseDir}/${t}`).split('/');
  const out: string[] = [];
  parts.forEach((p) => (p === '..' ? out.pop() : p && p !== '.' && out.push(p)));
  return out.join('/');
}

export function readXlsx(data: ArrayBuffer): Sheet {
  const files = unzipSync(new Uint8Array(data));
  const wb = files['xl/workbook.xml'];
  if (!wb) throw new Error('El archivo no es un Excel (.xlsx) válido.');
  const firstSheet = all(parse(strFromU8(wb)), 'sheet')[0];
  const rid = firstSheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const sheetPath = target(files, 'xl/_rels/workbook.xml.rels', 'xl', (r) => r.getAttribute('Id') === rid) ?? 'xl/worksheets/sheet1.xml';
  if (!files[sheetPath]) throw new Error('No se encontró la hoja del Excel.');

  const shared = files['xl/sharedStrings.xml'] ? all(parse(strFromU8(files['xl/sharedStrings.xml'])), 'si').map(texts) : [];
  const cells = new Map<string, string>();
  for (const c of all(parse(strFromU8(files[sheetPath])), 'c')) {
    const ref = c.getAttribute('r');
    if (!ref) continue;
    const t = c.getAttribute('t');
    const v = all(c, 'v')[0]?.textContent ?? '';
    const value = t === 's' ? shared[Number(v)] ?? '' : t === 'inlineStr' ? texts(c) : v;
    if (value !== '') cells.set(ref, value);
  }

  const comments = new Map<string, string>();
  const dir = sheetPath.slice(0, sheetPath.lastIndexOf('/'));
  const name = sheetPath.slice(sheetPath.lastIndexOf('/') + 1);
  const commentsPath = target(files, `${dir}/_rels/${name}.rels`, dir, (r) => /\/comments$/.test(r.getAttribute('Type') ?? ''));
  if (commentsPath && files[commentsPath]) {
    for (const c of all(parse(strFromU8(files[commentsPath])), 'comment')) {
      const ref = c.getAttribute('ref');
      const text = all(c, 'text')[0];
      if (ref && text) comments.set(ref, texts(text));
    }
  }
  return { cells, comments };
}

/** «AB12» → { col: 28, row: 12 } */
export function splitRef(ref: string) {
  const m = ref.match(/^([A-Z]+)(\d+)$/)!;
  const col = [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  return { col, row: Number(m[2]) };
}

export function colName(col: number) {
  let s = '';
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
