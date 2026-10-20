'use client';

import { useEffect } from 'react';

/** El service worker hace la app instalable (PWA) y la añade al menú Compartir en Android. */
export function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
