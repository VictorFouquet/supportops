export function nameIndex(items: { id: string; name: string }[]): Map<string, string> {
  return new Map(items.map((item) => [item.id, item.name]));
}

export function displayName(index: Map<string, string>, id: string | null): string {
  if (id === null) return '—';
  return index.get(id) ?? 'Unknown';
}
