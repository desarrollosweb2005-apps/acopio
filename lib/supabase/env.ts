// Dirección y clave pública de Supabase.
// - En Vercel llegan como NEXT_PUBLIC_* y se incrustan al compilar.
// - En un servidor propio (Docker/Coolify) basta con definirlas al arrancar: el servidor las lee
//   en tiempo de ejecución y el layout se las pasa al navegador en window.__ACOPIO_ENV.
// Supabase llama a la clave «publishable» (sb_publishable_...) en proyectos nuevos y «anon» en los antiguos.
declare global {
  interface Window { __ACOPIO_ENV?: { url: string; key: string } }
}

const browser = typeof window !== 'undefined' ? window.__ACOPIO_ENV : undefined;

export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || browser?.url || process.env.SUPABASE_URL)!;
export const SUPABASE_KEY = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  browser?.key ||
  process.env.SUPABASE_PUBLISHABLE_KEY
)!;
