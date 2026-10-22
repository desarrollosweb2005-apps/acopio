export type Source = 'video' | 'x' | 'repo' | 'web' | 'note' | 'image' | 'pdf' | 'file';
export type Status = 'pending' | 'seen' | 'applied';
export type Kind = 'link' | 'prompt' | 'file';
export type HlColor = 'y' | 'g' | 'b' | 'p';

export interface Collection {
  id: string;
  parent_id: string | null;
  name: string;
  icon: string;
  position: number;
}

export interface Highlight {
  id: string;
  bookmark_id: string;
  text: string;
  note: string;
  color: HlColor;
  time_label: string | null;
  created_at: string;
}

export interface Bookmark {
  id: string;
  collection_id: string | null;
  kind: Kind;
  status: Status;
  source: Source;
  url: string | null;
  url_norm: string | null;
  domain: string | null;
  title: string;
  note: string;
  excerpt: string;
  cover_url: string | null;
  tags: string[];
  prompt_text: string | null;
  content_fetched_at: string | null;
  duration_seconds: number | null;
  is_broken: boolean;
  meta: Record<string, unknown>;
  created_at: string;
  highlights: Highlight[];
}

/** Columnas que se cargan en la lista (sin `content`, que puede ser grande). */
export const BOOKMARK_COLUMNS =
  'id,collection_id,kind,status,source,url,url_norm,domain,title,note,excerpt,cover_url,tags,prompt_text,content_fetched_at,duration_seconds,is_broken,meta,created_at,highlights(*)';

export interface Snapshot {
  url: string;
  url_norm: string;
  domain: string;
  source: Source;
  title: string;
  excerpt: string;
  cover_url: string | null;
  content: string | null;
  duration_seconds: number | null;
  meta: Record<string, unknown>;
  error?: string;
}

export const STATUS_LABEL: Record<Status, string> = {
  pending: 'Pendiente',
  seen: 'Visto',
  applied: 'Aplicado',
};

export const SOURCE_LABEL: Record<Source, string> = {
  video: 'YouTube',
  x: 'X',
  repo: 'GitHub',
  web: 'Web',
  note: 'Prompt',
  image: 'Imagen',
  pdf: 'PDF',
  file: 'Archivo',
};

/** Datos del archivo subido (marcadores de tipo «file»), guardados en meta.file */
export interface FileMeta { path: string; type: string; size: number; name: string; width?: number; height?: number }
export const fileMeta = (b: { meta?: Record<string, unknown> | null }) => (b.meta?.file as FileMeta | undefined) ?? null;
