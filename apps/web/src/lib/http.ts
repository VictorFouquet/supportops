import 'server-only';
import { getApiUrl } from './env.js';

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    super(`API request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export interface RequestOptions {
  method?: string;
  token?: string;
  body?: unknown;
  searchParams?: Record<string, string | undefined>;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(`${getApiUrl()}${path}`);
  for (const [key, value] of Object.entries(opts.searchParams ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(url.toString(), {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: 'no-store',
  });

  const text = await response.text();
  let parsed: unknown;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Upstream can fail with a non-JSON body (e.g. a gateway's HTML error page); fall back
      // to the raw text so callers still get the real status instead of a raw SyntaxError.
      parsed = text;
    }
  }
  if (!response.ok) throw new ApiError(response.status, parsed);
  return parsed as T;
}
