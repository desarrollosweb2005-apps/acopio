'use client';

import { useState } from 'react';
import { SOURCE_LABEL, type Bookmark } from '@/lib/types';
import { formatDuration } from '@/lib/url';

export function Thumb({ b }: { b: Bookmark }) {
  const [broken, setBroken] = useState(false);
  const words = b.title.replace(/^\(\d+\)\s*/, '').split(/\s+/).slice(0, 6).join(' ');
  const src = b.kind === 'prompt' ? 'note' : b.source;
  return (
    <div className={`thumb t-${src}`} aria-hidden="true">
      {b.cover_url && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={b.cover_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        <>
          <span className="thumb-src">{src === 'web' ? b.domain : SOURCE_LABEL[src]}</span>
          <span className="thumb-words">{words}</span>
        </>
      )}
      {b.duration_seconds ? <span className="dur">{formatDuration(b.duration_seconds)}</span> : null}
    </div>
  );
}

export function SourceIcon({ b }: { b: Bookmark }) {
  const src = b.kind === 'prompt' ? 'note' : b.source;
  return <span className={`c-ic c-${src}`} aria-hidden="true">{SOURCE_LABEL[src][0]}</span>;
}
