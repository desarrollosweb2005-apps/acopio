import { NextResponse } from 'next/server';
import { authedClient } from '@/lib/supabase/server';
import { chatJSON } from '@/lib/ai';
import { aiErrorResponse, cleanTags, clip, libraryContext, unauthorized } from '@/lib/ai-context';

export const maxDuration = 60;

export interface PlannedCollection { key: string; name: string; icon: string; parent: string | null }
export interface PlanItem { id: string; collection: string; tags: string[] }

/**
 * Propone colección y etiquetas para un grupo de marcadores (hasta 25 por llamada).
 * Puede proponer colecciones nuevas; el cliente las acumula entre llamadas en `planned`
 * para que todos los grupos usen el mismo esquema. No escribe nada: el usuario revisa y aplica.
 */
export async function POST(request: Request) {
  const supabase = await authedClient();
  if (!supabase) return unauthorized();
  const { ids, planned = [] } = (await request.json()) as { ids: string[]; planned?: PlannedCollection[] };
  if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ error: 'No hay marcadores que organizar' }, { status: 400 });

  const { data: rows } = await supabase.from('bookmarks').select('id,title,note,excerpt,domain,tags,kind').in('id', ids.slice(0, 25));
  const items = rows ?? [];
  try {
    const ctx = await libraryContext(supabase);
    const plannedText = planned.length ? planned.map((p) => `- key "${p.key}": ${p.icon} ${p.name}${p.parent ? ` (dentro de ${p.parent})` : ''}`).join('\n') : '(ninguna)';
    const list = items.map((b) => `- id "${b.id}" | ${clip(b.title, 140)} | ${b.domain ?? (b.kind === 'prompt' ? 'prompt' : '')} | etiquetas: ${(b.tags as string[]).join(', ') || '-'} | ${clip(b.note || b.excerpt, 160)}`).join('\n');

    const out = await chatJSON<{ new_collections?: { key: string; name: string; icon?: string; parent?: string | null }[]; items?: { id: string; collection: string; tags?: string[] }[] }>(
      `Organizas la biblioteca personal de links de un usuario hispanohablante. Responde solo JSON:
{"new_collections": [{"key": "slug-unico", "name": "Nombre", "icon": "un emoji", "parent": null | "id o key de una colección principal"}],
 "items": [{"id": "id del marcador", "collection": "id existente o key nueva", "tags": ["..."]}]}
Reglas:
- Usa las colecciones existentes y las ya planificadas siempre que encajen. Crea colecciones nuevas solo si hacen falta.
- Colecciones por tema o por para qué sirve (p. ej. "Música para concentrarse", "Prompts de vídeo", "Herramientas de IA", "Cursos"), no por web de origen. Nombres cortos en español.
- En total no debería haber más de 10 colecciones principales. Puedes anidar un solo nivel (parent) si un tema tiene subgrupos claros.
- Cada marcador va exactamente a una colección.
- tags: 2 a 4 por marcador, en minúsculas con guiones. Conserva las etiquetas útiles que ya tiene y reutiliza las existentes de la biblioteca.`,
      `Colecciones existentes:\n${ctx.collectionsText}\n\nColecciones nuevas ya planificadas:\n${plannedText}\n\nEtiquetas de la biblioteca: ${ctx.tags.join(', ') || '(ninguna)'}\n\nMarcadores a organizar:\n${list}`,
      4000,
    );

    // Validación: solo referencias que existan; si algo no cuadra, ese marcador se queda sin propuesta
    const existing = new Set(ctx.collections.filter((c) => !c.parent_id).map((c) => c.id));
    const allExisting = new Set(ctx.collections.map((c) => c.id));
    const known = new Map(planned.map((p) => [p.key, p]));
    const fresh: PlannedCollection[] = [];
    for (const n of out.new_collections ?? []) {
      const key = String(n.key ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40);
      const name = clip(n.name, 60);
      if (!key || !name || known.has(key) || allExisting.has(key)) continue;
      const parentOk = !n.parent || existing.has(n.parent) || (known.has(n.parent) && !known.get(n.parent)!.parent);
      const p: PlannedCollection = { key, name, icon: clip(n.icon, 4) || '📁', parent: parentOk ? n.parent ?? null : null };
      known.set(key, p);
      fresh.push(p);
    }
    const valid = new Set(items.map((b) => b.id));
    const planItems: PlanItem[] = (out.items ?? [])
      .filter((i) => valid.has(i.id) && (allExisting.has(i.collection) || known.has(i.collection)))
      .map((i) => ({ id: i.id, collection: i.collection, tags: cleanTags(i.tags, 4) }));
    // Solo se devuelven las colecciones nuevas que alguien usa (directamente o como padre)
    const used = new Set(planItems.map((i) => i.collection));
    fresh.forEach((p) => used.has(p.key) && p.parent && used.add(p.parent));
    return NextResponse.json({ new_collections: fresh.filter((p) => used.has(p.key)), items: planItems });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
