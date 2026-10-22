'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { cleanTag, fold } from '@/lib/format';

/**
 * Campo de etiquetas con sugerencias: al escribir muestra las etiquetas que ya existen
 * (con cuántos marcadores las usan) y, si no hay ninguna igual, ofrece crearla.
 * Enter, coma o Tab añaden; Retroceso con el campo vacío quita la última.
 */
export function TagInput({ id, value, onChange, allTags, placeholder = 'Añadir etiquetas…' }: {
  id: string;
  value: string[];
  onChange: (tags: string[]) => void;
  allTags: [string, number][];
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const typed = cleanTag(text);
  const options = useMemo(() => {
    const q = fold(typed);
    const free = allTags.filter(([t]) => !value.includes(t));
    const matches = q
      ? free.filter(([t]) => fold(t).includes(q)).sort((a, b) => Number(!fold(a[0]).startsWith(q)) - Number(!fold(b[0]).startsWith(q)) || b[1] - a[1])
      : free;
    const rows: { tag: string; count: number | null }[] = matches.slice(0, 8).map(([tag, count]) => ({ tag, count }));
    if (typed && !value.includes(typed) && !allTags.some(([t]) => t === typed)) rows.push({ tag: typed, count: null });
    return rows;
  }, [typed, allTags, value]);

  function add(tag: string) {
    const t = cleanTag(tag);
    if (t && !value.includes(t)) onChange([...value, t]);
    setText('');
    setActive(0);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (options.length) setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
    } else if (e.key === 'Enter' || e.key === ',' || (e.key === 'Tab' && typed)) {
      // Con el campo vacío, Enter sigue enviando el formulario
      if (!typed) { if (e.key === ',') e.preventDefault(); return; }
      e.preventDefault();
      // Enter elige la sugerencia marcada; coma y Tab añaden exactamente lo escrito
      add(e.key === 'Enter' && open && options[active] ? options[active].tag : typed);
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1));
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className="tag-input">
      <div className="tags-edit" onClick={() => inputRef.current?.focus()}>
        {value.map((t) => (
          <span key={t} className="chip">#{t}
            <button type="button" onClick={(e) => { e.stopPropagation(); onChange(value.filter((x) => x !== t)); }} aria-label={`Quitar ${t}`}>×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          value={text}
          placeholder={value.length ? '' : placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-label="Añadir etiqueta"
          onChange={(e) => {
            // Pegar "a, b, c" o escribir un espacio/coma añade lo anterior de golpe
            const parts = e.target.value.split(/[,]+/);
            if (parts.length > 1) {
              const done = parts.slice(0, -1).map(cleanTag).filter((t) => t && !value.includes(t));
              if (done.length) onChange([...value, ...new Set(done)]);
              setText(parts[parts.length - 1]);
            } else {
              setText(e.target.value);
            }
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => { setOpen(false); if (typed) add(typed); }, 120)}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && options.length > 0 && (
        <ul className="tag-menu" id={listId} role="listbox">
          {!typed && <li className="tag-menu-head" aria-hidden="true">Más usadas</li>}
          {options.map((o, i) => (
            <li
              key={o.tag}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'on' : ''}
              onMouseDown={(e) => { e.preventDefault(); add(o.tag); }}
              onMouseEnter={() => setActive(i)}
            >
              <span>#{o.tag}</span>
              <span className="tag-menu-n">{o.count == null ? 'Nueva etiqueta' : o.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
