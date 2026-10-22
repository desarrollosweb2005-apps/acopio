import { fold } from './format';

// Equivalencias habituales (inglés/español, singular/plural, variantes). El valor es solo una clave común.
const SYN: Record<string, string> = {
  ai: 'ia', 'artificial-intelligence': 'ia', 'inteligencia-artificial': 'ia',
  music: 'musica', agents: 'agentes', agent: 'agentes', agente: 'agentes',
  video: 'videos', tutorial: 'tutoriales', tutorials: 'tutoriales',
  design: 'diseno', designs: 'diseno', prompts: 'prompt', course: 'cursos', courses: 'cursos', curso: 'cursos',
  tool: 'herramientas', tools: 'herramientas', herramienta: 'herramientas', template: 'plantillas', templates: 'plantillas', plantilla: 'plantillas',
  skill: 'skills', youtube: 'yt', 'open-source': 'opensource', 'free-llm': 'free-llms', automatizacion: 'automatizaciones',
  automation: 'automatizaciones', automations: 'automatizaciones', news: 'noticias', app: 'apps', short: 'shorts', reel: 'reels',
};

/** Clave para agrupar etiquetas que significan lo mismo. */
export function tagKey(tag: string) {
  const f = fold(tag);
  const base = SYN[f] ?? f;
  const compact = base.replace(/[-_\s]+/g, '');
  return SYN[compact] ?? (compact.length > 4 && compact.endsWith('s') ? compact.slice(0, -1) : compact);
}

export interface TagGroup { tags: string[]; keep: string }

/** Grupos de etiquetas parecidas; se propone conservar la más usada. */
export function similarTagGroups(counts: [string, number][]): TagGroup[] {
  const groups = new Map<string, [string, number][]>();
  counts.forEach(([t, n]) => groups.set(tagKey(t), [...(groups.get(tagKey(t)) ?? []), [t, n]]));
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => {
      const sorted = [...g].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length);
      return { tags: sorted.map(([t]) => t), keep: sorted[0][0] };
    });
}
