import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { RegisterSW } from '@/components/RegisterSW';
import { SUPABASE_KEY, SUPABASE_URL } from '@/lib/supabase/env';
import './globals.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['500', '700'], variable: '--font-display' });
const body = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

// Las variables se leen al arrancar (servidor propio), no al compilar
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Acopio',
  description: 'Tu biblioteca personal de links, prompts y highlights',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Acopio', statusBarStyle: 'default' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfcfa' },
    { media: '(prefers-color-scheme: dark)', color: '#191e1c' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__ACOPIO_ENV=${JSON.stringify({ url: SUPABASE_URL ?? '', key: SUPABASE_KEY ?? '' }).replace(/</g, '\\u003c')}`,
          }}
        />
      </head>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
