'use client';

import { useEffect, useState } from 'react';
import type { Collection } from '@/lib/types';
import { plural } from '@/lib/format';

const ICONS = ['📁', '🤖', '✳️', '🧩', '💬', '🛠️', '🎨', '🎓', '🎧', '💿', '🎬', '📈', '💡', '🧠', '📚', '🚀', '🏠', '💼', '🛒', '✈️', '🍳', '🎮', '🧪', '⭐'];

export function CollectionDialog({ collection, collections, count, onClose, onSave, onDelete }: {
  collection: Collection | null;
  collections: Collection[];
  count: number;
  onClose: () => void;
  onSave: (c: { id?: string; name: string; icon: string; parent_id: string | null }) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(collection?.name ?? '');
  const [icon, setIcon] = useState(collection?.icon ?? '📁');
  const [parent, setParent] = useState(collection?.parent_id ?? '');
  const [confirm, setConfirm] = useState(false);
  const hasChildren = !!collection && collections.some((c) => c.parent_id === collection.id);
  // Solo un nivel de anidado: el padre tiene que ser una colección raíz distinta de esta
  const parents = collections.filter((c) => !c.parent_id && c.id !== collection?.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSave({ id: collection?.id, name: name.trim(), icon, parent_id: parent || null }); }}>
        <h2>{collection ? 'Editar colección' : 'Nueva colección'}</h2>
        <label className="field"><span>Nombre</span>
          <input id="col-name" autoFocus required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field"><span>Icono</span>
          <div className="emoji-row">
            {ICONS.map((i) => (
              <button type="button" key={i} className={icon === i ? 'on' : ''} onClick={() => setIcon(i)} aria-label={`Icono ${i}`} aria-pressed={icon === i}>{i}</button>
            ))}
            <input aria-label="Otro emoji" placeholder="otro" value={ICONS.includes(icon) ? '' : icon} onChange={(e) => e.target.value && setIcon([...e.target.value].slice(0, 2).join(''))}
              style={{ width: 64, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)', padding: '0 8px' }} />
          </div>
        </div>
        {!hasChildren && (
          <label className="field"><span>Dentro de</span>
            <select id="col-parent" value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">Ninguna (colección principal)</option>
              {parents.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
            </select>
          </label>
        )}
        <div className="modal-actions">
          {collection && !confirm && <button type="button" className="ghost del" style={{ marginRight: 'auto' }} onClick={() => setConfirm(true)}>Eliminar</button>}
          {collection && confirm && (
            <span className="row" style={{ marginRight: 'auto' }}>
              <span>{count ? `${plural(count, 'marcador pasará', 'marcadores pasarán')} a la Bandeja.` : '¿Seguro?'}</span>
              <button type="button" className="ghost del solid" onClick={() => onDelete(collection.id)}>Eliminar</button>
            </span>
          )}
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button className="primary" type="submit">Guardar</button>
        </div>
      </form>
    </div>
  );
}
