export type MutateResult = { ok: true } | { ok: false; status: number };

/**
 * POST/PATCH JSON to a same-origin route handler and report whether it succeeded.
 * Client-safe: only calls fetch, never touches the session or the upstream API directly.
 */
export async function mutate(
  path: string,
  method: 'POST' | 'PATCH',
  body: unknown,
): Promise<MutateResult> {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true };
}
