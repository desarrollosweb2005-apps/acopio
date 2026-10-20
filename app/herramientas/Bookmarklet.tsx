'use client';

import { useEffect, useRef } from 'react';

/** React bloquea los href `javascript:`, así que el enlace se pone a mano tras montar. */
export function Bookmarklet() {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const origin = window.location.origin;
    const code =
      `(function(){var u=encodeURIComponent(location.href),t=encodeURIComponent(document.title);` +
      `window.open('${origin}/save?url='+u+'&title='+t,'acopio','width=520,height=680');})();`;
    ref.current?.setAttribute('href', `javascript:${code}`);
  }, []);
  return (
    <a ref={ref} className="bookmarklet" onClick={(e) => e.preventDefault()} title="Arrástrame a la barra de favoritos">
      + Acopio
    </a>
  );
}
