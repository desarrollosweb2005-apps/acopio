'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BOOKMARK_COLUMNS, STATUS_LABEL, type Bookmark, type Collection, type Highlight, type Status } from '@/lib/types';
import { fmtDate, fold, plural } from '@/lib/format';
import { bookmarkHaystack } from '@/lib/rows';
import { formatDuration } from '@/lib/url';
import { Thumb, SourceIcon } from './Thumb';
import { Detail } from './Detail';
import { AddDialog } from './AddDialog';
import { CollectionDialog } from './CollectionDialog';
import { OrganizeDialog } from './OrganizeDialog';
import { AskPanel } from './AskPanel';
import { BrokenPanel, DupesPanel, TagsPanel, duplicateGroups } from './Maintenance';
import { similarTagGroups } from '@/lib/tags';
import { UploadDialog, type UploadInput } from './UploadDialog';
import { FilesGallery } from './FilesGallery';
import { BUCKET, isImage } from '@/lib/files';
import { fileMeta } from '@/lib/types';
import { extractUrl } from '@/lib/url';
import { DateGroups, FilterBar, NO_FILTERS, TagLink, hasFilters, typeOf, type ColOption, type FilterState } from './Filters';
import type { GroupMode } from '@/lib/dates';

type Layout = 'cards' | 'list' | 'compact';
type Sort = 'new' | 'old' | 'title' | 'short';
const NEXT_STATUS: Record<Status, Status> = { pending: 'seen', seen: 'applied', applied: 'pending' };
const LAYOUT_KEY = 'acopio-layouts';
const GROUP_KEY = 'acopio-group';

export function Library({ initialCollections, initialBookmarks, aiEnabled }: { initialCollections: Collection[]; initialBookmarks: Bookmark[]; aiEnabled: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [collections, setCollections] = useState(initialCollections);
  const [bookmarks, setBookmarks] = useState(initialBookmarks);
  const [view, setView] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [minutes, setMinutes] = useState(0);
  const [filters, setFilters] = useState<FilterState>(NO_FILTERS);
  const [group, setGroup] = useState<GroupMode>('none');
  const [selId, setSelId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [adding, setAdding] = useState<null | 'link' | 'prompt'>(null);
  const [addUrl, setAddUrl] = useState<string | undefined>(undefined);
  const [organizing, setOrganizing] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [uploading, setUploading] = useState<UploadInput | null>(null);
  // Enlaces firmados (caducan) para ver las imágenes privadas del almacenamiento
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});
  const [editingCol, setEditingCol] = useState<null | { id?: string }>(null);
  const [layouts, setLayouts] = useState<Record<string, Layout>>({ 'f:video': 'cards' });
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_KEY);
      if (saved) setLayouts(JSON.parse(saved));
      const g = localStorage.getItem(GROUP_KEY);
      if (g === 'week' || g === 'month') setGroup(g);
    } catch {}
  }, []);

  const requested = useRef(new Set<string>());
  useEffect(() => {
    const missing = bookmarks.map(fileMeta).filter((f) => f && isImage(f.type) && !requested.current.has(f.path)).map((f) => f!.path);
    if (!missing.length) return;
    missing.forEach((p) => requested.current.add(p));
    supabase.storage.from(BUCKET).createSignedUrls(missing, 60 * 60 * 12).then(({ data }) => {
      if (data) setFileUrls((m) => ({ ...m, ...Object.fromEntries(data.filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string])) }));
    });
  }, [bookmarks, supabase]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg((m) => (m === msg ? '' : m)), 2400);
  }, []);

  /* ---------- Datos derivados ---------- */
  const colById = useMemo(() => new Map(collections.map((c) => [c.id, c])), [collections]);
  const colPath = useCallback((id: string | null) => {
    const c = id ? colById.get(id) : undefined;
    if (!c) return 'Bandeja';
    const p = c.parent_id ? colById.get(c.parent_id) : undefined;
    return p ? `${p.name} › ${c.name}` : c.name;
  }, [colById]);
  const colIcon = (id: string | null) => (id && colById.get(id)?.icon) || '📥';
  const childIds = useCallback((id: string) => [id, ...collections.filter((c) => c.parent_id === id).map((c) => c.id)], [collections]);
  const roots = useMemo(() => collections.filter((c) => !c.parent_id || !colById.has(c.parent_id)), [collections, colById]);

  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    bookmarks.forEach((b) => b.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [bookmarks]);

  const inView = useCallback((b: Bookmark, v: string) => {
    if (v === 'all') return true;
    if (v === 'inbox') return !b.collection_id;
    if (v === 'queue') return b.kind === 'link' && b.status === 'pending';
    if (v === 'prompts') return b.kind === 'prompt';
    if (v === 'files') return b.kind === 'file';
    if (v === 'f:notes') return !!b.note;
    if (v === 'f:hl') return b.highlights.length > 0;
    if (v === 'f:video') return b.source === 'video';
    if (v === 'f:repo') return b.source === 'repo';
    if (v === 'f:x') return b.source === 'x';
    if (v === 'f:applied') return b.status === 'applied';
    if (v.startsWith('col:')) return !!b.collection_id && childIds(v.slice(4)).includes(b.collection_id);
    if (v.startsWith('tag:')) return b.tags.includes(v.slice(4));
    return true;
  }, [childIds]);

  const count = (v: string) => bookmarks.filter((b) => inView(b, v)).length;

  // Sección + búsqueda; los filtros se aplican encima
  const base = useMemo(() => {
    let l = bookmarks.filter((b) => inView(b, view));
    if (view === 'queue' && minutes) l = l.filter((b) => b.duration_seconds && b.duration_seconds <= minutes * 60);
    const words = fold(q).split(/\s+/).filter(Boolean);
    if (words.length) l = l.filter((b) => { const h = fold(bookmarkHaystack(b, colPath(b.collection_id))); return words.every((w) => h.includes(w)); });
    return l;
  }, [bookmarks, view, q, minutes, inView, colPath]);

  const passes = useCallback((b: Bookmark, skip?: keyof FilterState) =>
    (skip === 'type' || !filters.type || typeOf(b) === filters.type)
    && (skip === 'col' || !filters.col || (filters.col === 'inbox' ? !b.collection_id : inView(b, `col:${filters.col}`)))
    && (skip === 'status' || !filters.status || (b.kind === 'link' && b.status === filters.status))
    && (skip === 'tags' || filters.tags.every((t) => b.tags.includes(t))), [filters, inView]);

  // Cuántos quedarían con cada opción, teniendo en cuenta los demás filtros
  const facets = useMemo(() => {
    const tally = (skip: keyof FilterState, keys: (b: Bookmark) => string[]) => {
      const m = new Map<string, number>();
      base.forEach((b) => { if (passes(b, skip)) keys(b).forEach((k) => m.set(k, (m.get(k) ?? 0) + 1)); });
      return m;
    };
    const types = tally('type', (b) => [typeOf(b)]);
    const statuses = tally('status', (b) => (b.kind === 'link' ? [b.status] : []));
    const tags = [...tally('tags', (b) => b.tags)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const byCol = tally('col', (b) => {
      if (!b.collection_id) return ['inbox'];
      const c = colById.get(b.collection_id);
      return c?.parent_id && colById.has(c.parent_id) ? [c.id, c.parent_id] : [b.collection_id];
    });
    const cols: ColOption[] = [{ value: 'inbox', label: '📥 Bandeja', n: byCol.get('inbox') ?? 0 }];
    roots.forEach((c) => {
      cols.push({ value: c.id, label: `${c.icon} ${c.name}`, n: byCol.get(c.id) ?? 0 });
      collections.filter((k) => k.parent_id === c.id).forEach((k) => cols.push({ value: k.id, label: `\u00a0\u00a0\u00a0${k.icon} ${k.name}`, n: byCol.get(k.id) ?? 0 }));
    });
    return { types, statuses, tags, cols };
  }, [base, passes, colById, roots, collections]);

  const effSort: Sort = view === 'queue' && sort === 'new' ? 'old' : sort;
  const list = useMemo(() => {
    const s = effSort;
    return base.filter((b) => passes(b)).sort((a, b) =>
      s === 'title' ? a.title.localeCompare(b.title)
      : s === 'old' ? a.created_at.localeCompare(b.created_at)
      : s === 'short' ? (a.duration_seconds ?? 1e9) - (b.duration_seconds ?? 1e9)
      : b.created_at.localeCompare(a.created_at));
  }, [base, passes, effSort]);
  const groupDir = effSort === 'old' ? 'asc' : 'desc';

  const selected = bookmarks.find((b) => b.id === selId) ?? null;
  const layout: Layout = layouts[view] ?? 'list';

  /* ---------- Cambios en la base de datos ---------- */
  async function updateBookmark(id: string, patch: Partial<Bookmark>) {
    const before = bookmarks.find((b) => b.id === id);
    setBookmarks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    const { highlights: _h, ...row } = patch;
    const { error } = await supabase.from('bookmarks').update(row).eq('id', id);
    if (error) {
      toast(`No se pudo guardar: ${error.message}`);
      if (before) setBookmarks((bs) => bs.map((b) => (b.id === id ? before : b)));
    }
  }
  async function deleteBookmark(id: string) {
    const file = fileMeta(bookmarks.find((b) => b.id === id) ?? {});
    const { error } = await supabase.from('bookmarks').delete().eq('id', id);
    if (error) return toast(`No se pudo eliminar: ${error.message}`);
    if (file) await supabase.storage.from(BUCKET).remove([file.path]);
    setBookmarks((bs) => bs.filter((b) => b.id !== id));
    setSelId(null);
    toast('Marcador eliminado');
  }
  async function addHighlight(bookmarkId: string, h: Pick<Highlight, 'text' | 'note' | 'color' | 'time_label'>) {
    const { data, error } = await supabase.from('highlights').insert({ ...h, bookmark_id: bookmarkId }).select().single();
    if (error) return toast(`No se pudo guardar el highlight: ${error.message}`);
    setBookmarks((bs) => bs.map((b) => (b.id === bookmarkId ? { ...b, highlights: [...b.highlights, data as Highlight] } : b)));
    toast('Highlight guardado');
  }
  async function removeHighlight(bookmarkId: string, hid: string) {
    const { error } = await supabase.from('highlights').delete().eq('id', hid);
    if (error) return toast(`No se pudo borrar: ${error.message}`);
    setBookmarks((bs) => bs.map((b) => (b.id === bookmarkId ? { ...b, highlights: b.highlights.filter((h) => h.id !== hid) } : b)));
  }
  async function insertBookmark(row: Record<string, unknown>) {
    const { data, error } = await supabase.from('bookmarks').insert(row).select(BOOKMARK_COLUMNS).single();
    if (error) { toast(`No se pudo guardar: ${error.message}`); return null; }
    const b = data as unknown as Bookmark;
    setBookmarks((bs) => [b, ...bs]);
    return b;
  }
  async function saveCollection(c: { id?: string; name: string; icon: string; parent_id: string | null }) {
    if (c.id) {
      const { error } = await supabase.from('collections').update({ name: c.name, icon: c.icon, parent_id: c.parent_id }).eq('id', c.id);
      if (error) return toast(`No se pudo guardar: ${error.message}`);
      setCollections((cs) => cs.map((x) => (x.id === c.id ? { ...x, ...c } as Collection : x)));
    } else {
      const position = collections.length;
      const { data, error } = await supabase.from('collections').insert({ name: c.name, icon: c.icon, parent_id: c.parent_id, position }).select('id,parent_id,name,icon,position').single();
      if (error) return toast(`No se pudo crear: ${error.message}`);
      setCollections((cs) => [...cs, data as Collection]);
      go(`col:${(data as Collection).id}`);
    }
    setEditingCol(null);
  }
  async function deleteCollection(id: string) {
    const { error } = await supabase.from('collections').delete().eq('id', id);
    if (error) return toast(`No se pudo eliminar: ${error.message}`);
    setCollections((cs) => cs.filter((c) => c.id !== id).map((c) => (c.parent_id === id ? { ...c, parent_id: null } : c)));
    setBookmarks((bs) => bs.map((b) => (b.collection_id === id ? { ...b, collection_id: null } : b)));
    setEditingCol(null);
    go('inbox');
    toast('Colección eliminada. Sus marcadores pasaron a la Bandeja');
  }

  function go(v: string) {
    setView(v);
    setFilters(NO_FILTERS);
    setSelId(null);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }
  function chooseGroup(g: GroupMode) {
    setGroup(g);
    try { localStorage.setItem(GROUP_KEY, g); } catch {}
  }
  function addTagFilter(t: string) {
    if (view === `tag:${t}` || filters.tags.includes(t)) return;
    setFilters((f) => ({ ...f, tags: [...f.tags, t] }));
    window.scrollTo(0, 0);
  }
  function setLayout(l: Layout) {
    const next = { ...layouts, [view]: l };
    setLayouts(next);
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)); } catch {}
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (adding || editingCol) return; setSelId(null); setMenuOpen(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [adding, editingCol]);

  // Pegar (Ctrl+V) o arrastrar un link sobre la app abre «Añadir» con el link ya leído
  useEffect(() => {
    const busy = () => adding || editingCol || organizing || uploading;
    const open = (url: string) => { setAddUrl(url); setAdding('link'); setMenuOpen(false); };
    const linkFrom = (dt: DataTransfer | null) =>
      extractUrl(dt?.getData('text/uri-list').split('\n').find((l) => l && !l.startsWith('#')), dt?.getData('text/plain'));
    const onPaste = (e: ClipboardEvent) => {
      if (busy() || (e.target as HTMLElement).closest?.('input, textarea, [contenteditable]')) return;
      const file = e.clipboardData?.files[0];
      if (file) { e.preventDefault(); setUploading({ file }); setMenuOpen(false); return; }
      const url = linkFrom(e.clipboardData);
      if (url) { e.preventDefault(); open(url); }
    };
    const hasLink = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].some((t) => t === 'text/uri-list' || t === 'text/plain' || t === 'Files');
    const onOver = (e: DragEvent) => { if (busy() || !hasLink(e)) return; e.preventDefault(); setDropping(true); };
    const onLeave = (e: DragEvent) => { if (!e.relatedTarget) setDropping(false); };
    const onDrop = (e: DragEvent) => {
      setDropping(false);
      if (busy() || !hasLink(e)) return;
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file) { setUploading({ file }); return; }
      const url = linkFrom(e.dataTransfer);
      if (url) open(url); else toast('Eso no es un link');
    };
    document.addEventListener('paste', onPaste);
    document.addEventListener('dragover', onOver);
    document.addEventListener('dragleave', onLeave);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('dragover', onOver);
      document.removeEventListener('dragleave', onLeave);
      document.removeEventListener('drop', onDrop);
    };
  }, [adding, editingCol, organizing, uploading, toast]);

  /* ---------- Vista ---------- */
  const dupes = useMemo(() => duplicateGroups(bookmarks), [bookmarks]);
  const similarTags = useMemo(() => similarTagGroups(tagCounts), [tagCounts]);
  const special = view === 'ask' || view === 'files' || view.startsWith('m:');
  const listed = !special || view === 'files';
  const [title, sub] = viewTitle(view, colById, colPath);
  const queueTotal = view === 'queue' ? list.reduce((a, b) => a + (b.duration_seconds ?? 0), 0) : 0;
  const curCol = view.startsWith('col:') ? view.slice(4) : null;

  const Nav = ({ v, ic, label, n, cls = '' }: { v: string; ic: string; label: string; n?: number; cls?: string }) => (
    <button className={`nav ${cls} ${view === v ? 'on' : ''}`} onClick={() => go(v)}>
      <span className="ic" aria-hidden="true">{ic}</span>
      <span className="lb">{label}</span>
      {n != null && <span className={`n ${cls.includes('alert') ? 'alert' : ''}`}>{n}</span>}
    </button>
  );

  return (
    <div className="app">
      <aside className={`side ${menuOpen ? 'open' : ''}`} aria-label="Colecciones y filtros">
        <div className="brand">
          <span className="logo"><i aria-hidden="true" />Acopio</span>
          <button className="primary" onClick={() => { setAdding('link'); setMenuOpen(false); }}>+ Añadir</button>
        </div>
        <div className="grp">
          <Nav v="all" ic="☰" label="Todos" n={bookmarks.length} />
          <Nav v="inbox" ic="📥" label="Bandeja" n={count('inbox')} cls={count('inbox') ? 'alert' : ''} />
          <Nav v="queue" ic="⏱" label="Cola pendiente" n={count('queue')} />
          <Nav v="prompts" ic="💬" label="Prompts" n={count('prompts')} />
          <Nav v="files" ic="▣" label="Capturas y archivos" n={count('files')} />
          <Nav v="ask" ic="✦" label="Preguntar" />
        </div>
        <div className="grp">
          <div className="grp-head"><h4>Filtros</h4></div>
          <Nav v="f:notes" ic="✎" label="Con notas" n={count('f:notes')} />
          <Nav v="f:hl" ic="▍" label="Highlights" n={bookmarks.reduce((a, b) => a + b.highlights.length, 0)} />
          <Nav v="f:video" ic="▶" label="Vídeos" n={count('f:video')} />
          <Nav v="f:repo" ic="⌥" label="Repos" n={count('f:repo')} />
          <Nav v="f:x" ic="𝕏" label="Posts de X" n={count('f:x')} />
          <Nav v="f:applied" ic="✓" label="Aplicados" n={count('f:applied')} />
        </div>
        <div className="grp">
          <div className="grp-head"><h4>Colecciones</h4><button onClick={() => setEditingCol({})} aria-label="Nueva colección" title="Nueva colección">+</button></div>
          {roots.map((c) => (
            <div key={c.id}>
              <Nav v={`col:${c.id}`} ic={c.icon} label={c.name} n={count(`col:${c.id}`)} />
              {collections.filter((k) => k.parent_id === c.id).map((k) => (
                <Nav key={k.id} v={`col:${k.id}`} ic={k.icon} label={k.name} n={count(`col:${k.id}`)} cls="child" />
              ))}
            </div>
          ))}
          {!roots.length && <button className="nav" onClick={() => setEditingCol({})}><span className="ic">+</span><span className="lb">Crear la primera colección</span></button>}
        </div>
        {tagCounts.length > 0 && (
          <div className="grp">
            <div className="grp-head"><h4>Etiquetas</h4></div>
            <div className="tagcloud">
              {tagCounts.map(([t, n]) => (
                <button key={t} className={`tagbtn ${view === `tag:${t}` ? 'on' : ''}`} onClick={() => go(`tag:${t}`)}>#{t}<b>{n}</b></button>
              ))}
            </div>
          </div>
        )}
        <div className="grp">
          <div className="grp-head"><h4>Mantenimiento</h4></div>
          <Nav v="m:dupes" ic="⧉" label="Duplicados" n={dupes.length} cls={dupes.length ? 'alert' : ''} />
          <Nav v="m:tags" ic="≈" label="Etiquetas parecidas" n={similarTags.length} cls={similarTags.length ? 'alert' : ''} />
          <Nav v="m:broken" ic="⚠" label="Links rotos" n={bookmarks.filter((b) => b.is_broken).length} cls={bookmarks.some((b) => b.is_broken) ? 'alert' : ''} />
        </div>
        <div className="side-foot">
          <a className="nav" href="/herramientas"><span className="ic">⇪</span><span className="lb">Guardar desde navegador y móvil</span></a>
          <a className="nav" href="/importar"><span className="ic">⤓</span><span className="lb">Importar de Raindrop</span></a>
          <button className="nav" onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login'; }}><span className="ic">⎋</span><span className="lb">Salir</span></button>
        </div>
      </aside>

      <main className="main">
        <div className="top">
          <button className="icon-btn burger" onClick={() => setMenuOpen((o) => !o)} aria-label="Abrir menú">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 4h12M2 8h12M2 12h12" /></svg>
          </button>
          <label className="search">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="7" cy="7" r="4.8" /><path d="M10.6 10.6 14 14" /></svg>
            <input id="q" type="search" placeholder="Buscar en títulos, notas, prompts y highlights" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {view === 'prompts' && <button className="ghost" onClick={() => setAdding('prompt')}>+ Prompt</button>}
        </div>
        <div className="scroll">
          <div className="head">
            <div>
              <h1>{title}</h1>
              <div className="sub">
                {listed && <>{plural(list.length, 'marcador', 'marcadores')}{queueTotal ? ` · ${formatDuration(queueTotal)} en total` : ''} · </>}{sub}
                {curCol && <> · <button className="link-btn" onClick={() => setEditingCol({ id: curCol })}>Editar colección</button></>}
              </div>
            </div>
            {listed && <div className="tools">
              {view === 'queue' && (
                <div className="seg" role="group" aria-label="Tiempo disponible">
                  {[[0, 'Todo'], [15, '≤ 15 min'], [30, '≤ 30 min'], [60, '≤ 1 h']].map(([m, l]) => (
                    <button key={m} className={minutes === m ? 'on' : ''} aria-pressed={minutes === m} onClick={() => setMinutes(m as number)}>{l}</button>
                  ))}
                </div>
              )}
              <select className="sm" id="sort" aria-label="Ordenar" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="new">{view === 'queue' ? 'Más antiguos primero' : 'Más recientes'}</option>
                {view !== 'queue' && <option value="old">Más antiguos</option>}
                <option value="title">Título A–Z</option>
                <option value="short">Más cortos primero</option>
              </select>
              <select className="sm" aria-label="Agrupar" value={group} onChange={(e) => chooseGroup(e.target.value as GroupMode)}>
                <option value="none">Sin agrupar</option>
                <option value="week">Por semana</option>
                <option value="month">Por mes</option>
              </select>
              {!special && <div className="seg" role="group" aria-label="Vista">
                {(['cards', 'list', 'compact'] as Layout[]).map((k) => (
                  <button key={k} className={layout === k ? 'on' : ''} aria-pressed={layout === k} onClick={() => setLayout(k)}>
                    {k === 'cards' ? 'Cards' : k === 'list' ? 'Lista' : 'Compacta'}
                  </button>
                ))}
              </div>}
            </div>}
          </div>

          {listed && (
            <FilterBar value={filters} onChange={setFilters} typeCounts={facets.types} colOptions={facets.cols} statusCounts={facets.statuses}
              tagCounts={facets.tags} hideCol={!!curCol} hideTag={view.startsWith('tag:') ? view.slice(4) : null} />
          )}

          {view === 'inbox' && list.length > 0 && (
            <div className="banner">
              <span>La IA puede proponer una colección y etiquetas para cada marcador de la Bandeja. Revisas la propuesta antes de aplicar nada.</span>
              {aiEnabled
                ? <button className="primary" onClick={() => setOrganizing(true)}>✦ Organizar con IA</button>
                : <span>Añade <code>GROQ_API_KEY</code> en Vercel para activarlo.</span>}
            </div>
          )}

          {view === 'queue' && minutes > 0 && (
            <div className="banner">Solo se muestran los que tienen duración conocida. Los posts y algunas webs no la tienen.</div>
          )}

          {view === 'ask' ? (
            <AskPanel bookmarks={bookmarks} aiEnabled={aiEnabled} onOpen={(id) => setSelId(id)} />
          ) : view === 'files' ? (
            <FilesGallery items={list} group={group} groupDir={groupDir} filtered={list.length < count('files')} fileUrls={fileUrls} colPath={colPath}
              onOpen={(id) => setSelId(id)} onUpload={(file) => setUploading({ file })} onTag={addTagFilter} />
          ) : view === 'm:dupes' ? (
            <DupesPanel bookmarks={bookmarks} setBookmarks={setBookmarks} supabase={supabase} toast={toast} colPath={colPath} onOpen={(id) => setSelId(id)} />
          ) : view === 'm:tags' ? (
            <TagsPanel bookmarks={bookmarks} setBookmarks={setBookmarks} supabase={supabase} toast={toast} tagCounts={tagCounts} aiEnabled={aiEnabled} />
          ) : view === 'm:broken' ? (
            <BrokenPanel bookmarks={bookmarks} setBookmarks={setBookmarks} supabase={supabase} toast={toast} onOpen={(id) => setSelId(id)} />
          ) : list.length ? (
            <DateGroups key={group} items={list} mode={group} dir={groupDir} render={(items) => (
              <div className={`items ${layout}`}>
                {items.map((b) => (
                  <Item key={b.id} b={b} image={fileUrls[fileMeta(b)?.path ?? '']} layout={layout} selected={b.id === selId} colLabel={`${colIcon(b.collection_id)} ${colPath(b.collection_id)}`}
                    onOpen={() => setSelId(b.id)} onStatus={() => updateBookmark(b.id, { status: NEXT_STATUS[b.status] })} onTag={addTagFilter} />
                ))}
              </div>
            )} />
          ) : (
            <div className="empty">{emptyText(view, q || (hasFilters(filters) ? 'f' : ''), bookmarks.length)}</div>
          )}
        </div>
      </main>

      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
      {selected && (
        <>
          <div className="scrim" onClick={() => setSelId(null)} />
          <Detail
            key={selected.id}
            b={selected}
            collections={collections}
            allTags={tagCounts}
            aiEnabled={aiEnabled}
            image={fileUrls[fileMeta(selected)?.path ?? '']}
            onPatched={(patch) => setBookmarks((bs) => bs.map((x) => (x.id === selected.id ? { ...x, ...patch } : x)))}
            colPath={colPath}
            supabase={supabase}
            toast={toast}
            onClose={() => setSelId(null)}
            onUpdate={(patch) => updateBookmark(selected.id, patch)}
            onDelete={() => deleteBookmark(selected.id)}
            onAddHighlight={(h) => addHighlight(selected.id, h)}
            onRemoveHighlight={(hid) => removeHighlight(selected.id, hid)}
          />
        </>
      )}
      {adding && (
        <AddDialog
          mode={adding}
          initialUrl={addUrl}
          aiEnabled={aiEnabled}
          collections={collections}
          colPath={colPath}
          bookmarks={bookmarks}
          allTags={tagCounts}
          defaultCollection={curCol}
          onClose={() => { setAdding(null); setAddUrl(undefined); }}
          onOpenExisting={(id) => { setAdding(null); setAddUrl(undefined); setSelId(id); }}
          onInsert={async (row) => {
            const b = await insertBookmark(row);
            if (b) { setAdding(null); setAddUrl(undefined); setSelId(b.id); toast(`Guardado en ${colPath(b.collection_id)}`); }
          }}
        />
      )}
      {editingCol && (
        <CollectionDialog
          collection={editingCol.id ? colById.get(editingCol.id) ?? null : null}
          collections={collections}
          count={editingCol.id ? bookmarks.filter((b) => b.collection_id === editingCol.id).length : 0}
          onClose={() => setEditingCol(null)}
          onSave={saveCollection}
          onDelete={deleteCollection}
        />
      )}
      {organizing && (
        <OrganizeDialog
          items={bookmarks.filter((b) => !b.collection_id)}
          collections={collections}
          colPath={colPath}
          supabase={supabase}
          onClose={() => setOrganizing(false)}
          onDone={({ created, updates }) => {
            setCollections((cs) => [...cs, ...created]);
            const byId = new Map(updates.map((u) => [u.id, u]));
            setBookmarks((bs) => bs.map((b) => (byId.has(b.id) ? { ...b, ...byId.get(b.id)! } : b)));
            setOrganizing(false);
            toast(`${plural(updates.length, 'marcador organizado', 'marcadores organizados')}${created.length ? ` en ${plural(created.length, 'colección nueva', 'colecciones nuevas')}` : ''}`);
          }}
        />
      )}
      {uploading && (
        <UploadDialog
          input={uploading}
          supabase={supabase}
          collections={collections}
          colPath={colPath}
          allTags={tagCounts}
          defaultCollection={curCol}
          onClose={() => setUploading(null)}
          onInsert={async (row) => {
            const b = await insertBookmark(row);
            if (!b) return false;
            setUploading(null);
            setSelId(b.id);
            toast(`Guardado en ${colPath(b.collection_id)}`);
            return true;
          }}
        />
      )}
      {dropping && <div className="drop-hint">Suelta aquí el link, la imagen o el archivo</div>}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
}

function Item({ b, image, layout, selected, colLabel, onOpen, onStatus, onTag }: {
  b: Bookmark; image?: string; layout: Layout; selected: boolean; colLabel: string; onOpen: () => void; onStatus: () => void; onTag: (t: string) => void;
}) {
  const open = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(); };
  const statusBtn = b.kind === 'link' && (
    <button type="button" className={`status ${b.status}`} style={{ border: 0 }} title="Cambiar estado"
      onClick={(e) => { e.stopPropagation(); onStatus(); }}>{STATUS_LABEL[b.status]}</button>
  );
  if (layout === 'compact') {
    return (
      <div className={`it ${selected ? 'sel' : ''}`} onClick={onOpen} onKeyDown={open} role="button" tabIndex={0}>
        <SourceIcon b={b} />
        <span className="c-ttl">{b.title}</span>
        {statusBtn}
        <span className="c-meta" suppressHydrationWarning>{fmtDate(b.created_at)}</span>
      </div>
    );
  }
  return (
    <article className={`it ${selected ? 'sel' : ''}`} onClick={onOpen} onKeyDown={open} tabIndex={0}>
      <Thumb b={b} image={image} />
      <div className="body">
        <h3 className="ttl">{b.title}</h3>
        {(b.note || b.excerpt) && <p className="note">{b.note || b.excerpt}</p>}
        {b.tags.length > 0 && <div className="tags">{b.tags.map((t) => <TagLink key={t} t={t} onTag={onTag} />)}</div>}
        {(b.highlights.length > 0 || b.is_broken) && (
          <div className="badges">
            {b.highlights.length > 0 && <span className="badge">{plural(b.highlights.length, 'highlight', 'highlights')}</span>}
            {b.is_broken && <span className="badge bad">Link roto</span>}
          </div>
        )}
        <div className="meta">
          {statusBtn}
          <span>{colLabel}</span>
          {b.domain && <span>{b.domain}</span>}
          <span suppressHydrationWarning>{fmtDate(b.created_at)}</span>
        </div>
      </div>
    </article>
  );
}

function viewTitle(v: string, colById: Map<string, Collection>, colPath: (id: string | null) => string): [string, string] {
  const F: Record<string, [string, string]> = {
    all: ['Todos los marcadores', 'Todo lo que has guardado'],
    inbox: ['Bandeja', 'Sin colección todavía'],
    queue: ['Cola pendiente', 'Lo que guardaste y aún no has visto'],
    prompts: ['Prompts', 'Tu librería de prompts reutilizables'],
    files: ['Capturas y archivos', 'Imágenes recortadas, PDFs y documentos'],
    ask: ['Preguntar a tu biblioteca', 'Responde con IA citando tus marcadores'],
    'm:dupes': ['Duplicados', 'El mismo link guardado más de una vez'],
    'm:tags': ['Etiquetas parecidas', 'Unifica etiquetas que significan lo mismo'],
    'm:broken': ['Links rotos', 'Páginas, vídeos o posts que ya no existen'],
    'f:notes': ['Con notas', 'Marcadores en los que escribiste algo'],
    'f:hl': ['Highlights', 'Marcadores con fragmentos guardados'],
    'f:video': ['Vídeos', 'YouTube'],
    'f:repo': ['Repos', 'Proyectos de GitHub'],
    'f:x': ['Posts de X', 'Hilos y posts guardados'],
    'f:applied': ['Aplicados', 'Lo que ya pusiste en práctica'],
  };
  if (F[v]) return F[v];
  if (v.startsWith('col:')) {
    const c = colById.get(v.slice(4));
    if (!c) return ['Colección', ''];
    return [`${c.icon} ${c.name}`, c.parent_id ? `Dentro de ${colPath(c.parent_id)}` : 'Colección'];
  }
  if (v.startsWith('tag:')) return [`#${v.slice(4)}`, 'Etiqueta'];
  return ['', ''];
}

function emptyText(view: string, q: string, total: number) {
  if (q) return 'Nada coincide con la búsqueda o los filtros.';
  if (!total) return 'Todavía no hay nada guardado. Pulsa «+ Añadir» o importa tus marcadores de Raindrop.';
  if (view === 'inbox') return 'Bandeja vacía. Todo está en su colección.';
  if (view === 'queue') return 'No queda nada pendiente.';
  if (view === 'prompts') return 'Aún no hay prompts. Pulsa «+ Prompt» para crear el primero.';
  return 'Aquí no hay marcadores todavía.';
}
