-- Acopio · fase 4: capturas y archivos
-- Ejecutar en Supabase → SQL Editor. Se puede ejecutar más de una vez sin error.

-- Nuevo tipo de marcador «file» (capturas, imágenes, PDFs y documentos)
alter table public.bookmarks drop constraint if exists bookmarks_kind_check;
alter table public.bookmarks add constraint bookmarks_kind_check check (kind in ('link', 'prompt', 'file'));
alter table public.bookmarks drop constraint if exists bookmarks_source_check;
alter table public.bookmarks add constraint bookmarks_source_check
  check (source in ('video', 'x', 'repo', 'web', 'note', 'image', 'pdf', 'file'));

-- Almacenamiento privado: cada usuario solo ve su carpeta (files/<id de usuario>/…). Máximo 50 MB por archivo.
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "acopio: ver mis archivos" on storage.objects;
create policy "acopio: ver mis archivos" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "acopio: subir mis archivos" on storage.objects;
create policy "acopio: subir mis archivos" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "acopio: cambiar mis archivos" on storage.objects;
create policy "acopio: cambiar mis archivos" on storage.objects for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "acopio: borrar mis archivos" on storage.objects;
create policy "acopio: borrar mis archivos" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
