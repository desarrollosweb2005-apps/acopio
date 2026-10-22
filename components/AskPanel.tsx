'use client';

import { useState } from 'react';
import type { Bookmark } from '@/lib/types';
import { SourceIcon } from './Thumb';

const EXAMPLES = ['¿Qué guardé para hacer vídeos con código?', 'Música para concentrarme', 'Repos de agentes de IA', '¿Qué cursos de n8n tengo?'];

/** «Preguntar a tu biblioteca»: respuesta de la IA con los marcadores citados. */
export function AskPanel({ bookmarks, aiEnabled, onOpen }: { bookmarks: Bookmark[]; aiEnabled: boolean; onOpen: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ answer: string; ids: string[] } | null>(null);
  const [error, setError] = useState('');

  async function ask(question: string) {
    if (!question.trim()) return;
    setQ(question);
    setBusy(true);
    setError('');
    const res = await fetch('/api/ai/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }) });
    const data = await res.json().catch(() => ({ error: 'Respuesta no válida' }));
    setBusy(false);
    if (!res.ok) { setError(data.error); setResult(null); return; }
    setResult(data);
  }

  if (!aiEnabled) {
    return <div className="empty">Para preguntar a tu biblioteca, añade la variable <code>GROQ_API_KEY</code> en Vercel y vuelve a desplegar.</div>;
  }
  const cited = (result?.ids ?? []).map((id) => bookmarks.find((b) => b.id === id)).filter(Boolean) as Bookmark[];
  return (
    <div>
      <form className="ask" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input id="ask-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej.: ¿qué guardé sobre Three.js?" aria-label="Pregunta" />
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Pensando…' : 'Preguntar'}</button>
      </form>
      <div className="chips">{EXAMPLES.map((e) => <button key={e} type="button" onClick={() => ask(e)} disabled={busy}>{e}</button>)}</div>
      {error && <div className="error" style={{ marginTop: 14 }}>{error}</div>}
      {result && (
        <div className="answer">
          <p>{result.answer}</p>
          {cited.map((b, i) => (
            <button key={b.id} className="cite" onClick={() => onOpen(b.id)}>
              <span className="mono">[{i + 1}]</span>
              <SourceIcon b={b} />
              <span className="ttl">{b.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
