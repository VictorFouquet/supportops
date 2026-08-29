import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { request, ApiError } from './http.js';

beforeEach(() => {
  process.env.API_URL = 'http://api.test';
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubFetch(response: { status: number; body: unknown }) {
  const fetchMock = vi.fn(
    async (..._args: Parameters<typeof fetch>) =>
      new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: { 'content-type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('request', () => {
  it('GETs a JSON resource and returns the parsed body', async () => {
    const fetchMock = stubFetch({ status: 200, body: { id: 't1' } });
    const result = await request<{ id: string }>('/tickets/t1', { token: 'tok' });
    expect(result).toEqual({ id: 't1' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api.test/tickets/t1');
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer tok' });
  });

  it('appends defined search params and omits undefined ones', async () => {
    const fetchMock = stubFetch({ status: 200, body: { data: [] } });
    await request('/tickets', {
      token: 'tok',
      searchParams: { status: 'OPEN', teamId: undefined },
    });
    expect(fetchMock.mock.calls[0]![0]).toBe('http://api.test/tickets?status=OPEN');
  });

  it('omits the Authorization header when no token is given', async () => {
    const fetchMock = stubFetch({ status: 200, body: {} });
    await request('/health');
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('throws ApiError carrying status and body on a non-2xx response', async () => {
    stubFetch({ status: 400, body: { message: 'bad' } });
    await expect(
      request('/tickets', { token: 'tok', method: 'POST', body: {} }),
    ).rejects.toMatchObject({ name: 'ApiError', status: 400, body: { message: 'bad' } });
    expect(ApiError).toBeTypeOf('function');
  });
});
