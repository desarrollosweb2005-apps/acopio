/** Variables con forma {{nombre}} dentro de un prompt, sin repetir y en orden de aparición. */
export function promptVariables(text: string | null): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([\w\- áéíóúñÁÉÍÓÚÑ]+?)\s*\}\}/g)) seen.add(m[1]);
  return [...seen];
}

export function fillPrompt(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w\- áéíóúñÁÉÍÓÚÑ]+?)\s*\}\}/g, (all, name: string) =>
    values[name]?.trim() ? values[name] : all,
  );
}
