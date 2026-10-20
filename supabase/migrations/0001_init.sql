-- Acopio · esquema inicial (fase 1)
-- Ejecutar en Supabase → SQL Editor, o con `supabase db push`.

create extension if not exists pgcrypto;

-- Colecciones anidadas (un nivel de hijos en la interfaz, el esquema admite más)
create table public.collections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  parent_id   uuid references public.collections on delete set null,
  name        text not null check (char_length(name) between 1 and 80),
  icon        text not null default '📁',
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index collections_user_idx on public.collections (user_id, position);

-- Marcadores: links y prompts
--   kind     link | prompt              (mejora 2: los prompts son un tipo propio)
--   status   pending | seen | applied   (mejora 1: Pendiente / Visto / Aplicado)
--   content  copia del texto al guardar (mejora 3: si el link muere, no se pierde)
create table public.bookmarks (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users on delete cascade,
  collection_id      uuid references public.collections on delete set null,
  kind               text not null default 'link' check (kind in ('link', 'prompt')),
  status             text not null default 'pending' check (status in ('pending', 'seen', 'applied')),
  source             text not null default 'web' check (source in ('video', 'x', 'repo', 'web', 'note')),
  url                text,
  url_norm           text,
  domain             text,
  title              text not null default '',
  note               text not null default '',
  excerpt            text not null default '',
  cover_url          text,
  tags               text[] not null default '{}',
  prompt_text        text,
  content            text,
  content_fetched_at timestamptz,
  duration_seconds   integer,
  is_broken          boolean not null default false,
  meta               jsonb not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index bookmarks_user_created_idx on public.bookmarks (user_id, created_at desc);
create index bookmarks_user_url_idx on public.bookmarks (user_id, url_norm);
create index bookmarks_tags_idx on public.bookmarks using gin (tags);

-- Highlights: fragmentos con color y nota, con minuto opcional en vídeos
create table public.highlights (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  bookmark_id  uuid not null references public.bookmarks on delete cascade,
  text         text not null,
  note         text not null default '',
  color        text not null default 'y' check (color in ('y', 'g', 'b', 'p')),
  time_label   text,
  created_at   timestamptz not null default now()
);
create index highlights_bookmark_idx on public.highlights (bookmark_id);

-- updated_at automático
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger bookmarks_touch before update on public.bookmarks
  for each row execute function public.touch_updated_at();

-- Seguridad: cada usuario solo ve y toca sus filas
alter table public.collections enable row level security;
alter table public.bookmarks   enable row level security;
alter table public.highlights  enable row level security;

create policy "own collections" on public.collections
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own bookmarks" on public.bookmarks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own highlights" on public.highlights
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
