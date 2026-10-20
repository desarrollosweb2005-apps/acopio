import { NextResponse } from 'next/server';
import { createClient, isAllowed } from '@/lib/supabase/server';
import { takeSnapshot } from '@/lib/snapshot';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAllowed(user.email)) return NextResponse.json({ error: 'Sesión no iniciada' }, { status: 401 });

  const { url } = await request.json().catch(() => ({ url: '' }));
  if (typeof url !== 'string' || !url.trim()) {
    return NextResponse.json({ error: 'Falta la URL' }, { status: 400 });
  }
  return NextResponse.json(await takeSnapshot(url));
}
