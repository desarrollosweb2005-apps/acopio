import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_KEY, SUPABASE_URL } from '@/lib/supabase/env';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Llamado desde un Server Component: el middleware ya refresca la sesión.
          }
        },
      },
    },
  );
}

export function isAllowed(email: string | undefined | null) {
  const allowed = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  return !allowed || email?.toLowerCase() === allowed;
}

/** Para las rutas /api: devuelve el cliente si hay sesión válida, o null. */
export async function authedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user && isAllowed(user.email) ? supabase : null;
}
