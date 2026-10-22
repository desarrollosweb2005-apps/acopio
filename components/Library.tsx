'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BOOKMARK_COLUMNS, STATUS_LABEL, type Bookmark, type Collection, type Highlight, type Status } from '@/lib/types';
import { fmtDate, fold, plural } from '@/lib/format';
import { bookmarkHaystack } from '@/lib/rows';
import { formatDuration } from '@/lib/url';
import { Thumb, SourceIcon } from './Thumb';
import { Detail } from './Detail';
import { AddDialog } from './AddDialog';
import { CollectionDialog } from './CollectionDialog';

type Layout = 'cards' | 'list' | 'compact';
type Sort = 'new' | 'old' | 'title' | 'short';
const NEXT_STATUS: Record<Status, Status> = { pending: 'seen', seen: 'applied', applied: 'pending' };
const LAYOUT_KEY = 'acopio-layouts';

export function Library({ initialCollections, initialBookmarks }: { initialCollections: Collection[]; initialBookmarks: Bookmark[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [collections, setCollections] = useState(initialCollections);
  const [bookmarks, setBookmarks] = useState(initialBookmarks);
  const [view, setView] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [minutes, setMinutes] = useState(0);
  const [selId, setSelId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [adding, setAdding] = useState<null | 'link' | 'prompt'>(null);
  const [editingCol, setEditingCol] = useState<null | { id?: string }>(null);
  const [layouts, setLayouts] = useState<Record<string, Layout>>({ 'f:video': 'cards' });
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_KEY);
      if (saved) setLayouts(JSON.parse(saved));
    } catch {}
  }, []);

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
  const roots = collections.filter((c) => !c.parent_id || !colById.has(c.parent_id));

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

  const list = useMemo(() => {
    let l = bookmarks.filter((b) => inView(b, view));
    if (view === 'queue' && minutes) l = l.filter((b) => b.duration_seconds && b.duration_seconds <= minutes * 60);
    const words = fold(q).split(/\s+/).filter(Boolean);
    if (words.length) l = l.filter((b) => { const h = fold(bookmarkHaystack(b, colPath(b.collection_id))); return words.every((w) => h.includes(w)); });
    const s = view === 'queue' && sort === 'new' ? 'old' : sort;
    return [...l].sort((a, b) =>
      s === 'title' ? a.title.localeCompare(b.title)
      : s === 'old' ? a.created_at.localeCompare(b.created_at)
      : s === 'short' ? (a.duration_seconds ?? 1e9) - (b.duration_seconds ?? 1e9)
      : b.created_at.localeCompare(a.created_at));
  }, [bookmarks, view, q, sort, minutes, inView, colPath]);

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
    const { error } = await supabase.from('bookmarks').delete().eq('id', id);
    if (error) return toast(`No se pudo eliminar: ${error.message}`);
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
    setSelId(null);
    setMenuOpen(false);
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

  /* ---------- Vista ---------- */
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
                {plural(list.length, 'marcador', 'marcadores')}
                {queueTotal ? ` · ${formatDuration(queueTotal)} en total` : ''} · {sub}
                {curCol && <> · <button className="link-btn" onClick={() => setEditingCol({ id: curCol })}>Editar colección</button></>}
              </div>
            </div>
            <div className="tools">
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
              <div className="seg" role="group" aria-label="Vista">
                {(['cards', 'list', 'compact'] as Layout[]).map((k) => (
                  <button key={k} className={layout === k ? 'on' : ''} aria-pressed={layout === k} onClick={() => setLayout(k)}>
                    {k === 'cards' ? 'Cards' : k === 'list' ? 'Lista' : 'Compacta'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {view === 'queue' && minutes > 0 && (
            <div className="banner">Solo se muestran los que tienen duración conocida. Los posts y algunas webs no la tienen.</div>
          )}

          {list.length ? (
            <div className={`items ${layout}`}>
              {list.map((b) => (
                <Item key={b.id} b={b} layout={layout} selected={b.id === selId} colLabel={`${colIcon(b.collection_id)} ${colPath(b.collection_id)}`}
                  onOpen={() => setSelId(b.id)} onStatus={() => updateBookmark(b.id, { status: NEXT_STATUS[b.status] })} />
              ))}
            </div>
          ) : (
            <div className="empty">{emptyText(view, q, bookmarks.length)}</div>
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
          collections={collections}
          colPath={colPath}
          bookmarks={bookmarks}
          allTags={tagCounts}
          defaultCollection={curCol}
          onClose={() => setAdding(null)}
          onOpenExisting={(id) => { setAdding(null); setSelId(id); }}
          onInsert={async (row) => {
            const b = await insertBookmark(row);
            if (b) { setAdding(null); setSelId(b.id); toast(`Guardado en ${colPath(b.collection_id)}`); }
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
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
}

function Item({ b, layout, selected, colLabel, onOpen, onStatus }: {
  b: Bookmark; layout: Layout; selected: boolean; colLabel: string; onOpen: () => void; onStatus: () => void;
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
      <Thumb b={b} />
      <div className="body">
        <h3 className="ttl">{b.title}</h3>
        {(b.note || b.excerpt) && <p className="note">{b.note || b.excerpt}</p>}
        {b.tags.length > 0 && <div className="tags">{b.tags.map((t) => <span key={t} className="tag">#{t}</span>)}</div>}
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
  if (q) return 'Nada coincide con la búsqueda.';
  if (!total) return 'Todavía no hay nada guardado. Pulsa «+ Añadir» o importa tus marcadores de Raindrop.';
  if (view === 'inbox') return 'Bandeja vacía. Todo está en su colección.';
  if (view === 'queue') return 'No queda nada pendiente.';
  if (view === 'prompts') return 'Aún no hay prompts. Pulsa «+ Prompt» para crear el primero.';
  return 'Aquí no hay marcadores todavía.';
}
