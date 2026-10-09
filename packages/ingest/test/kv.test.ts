import { describe, expect, it, vi } from 'vitest';
import { kvClient, kvConfigFromEnv } from '../src/kv';

const cfg = { accountId: 'acc', namespaceId: 'ns', apiToken: 'tok' };

describe('kvClient', () => {
  it('writes to the key, encoded, with the token', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ success: true, errors: [] }), { status: 200 }),
    );
    await kvClient(cfg, fetchImpl).put('archive/2026-10-08', new Uint8Array([1]));
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acc/storage/kv/namespaces/ns/values/archive%2F2026-10-08');
    expect(init?.method).toBe('PUT');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('throws with Cloudflare’s message when a write is refused', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, errors: [{ message: 'nope' }] }), { status: 500 }),
    );
    await expect(kvClient(cfg, fetchImpl).put('today', new Uint8Array())).rejects.toThrow('KV write of today failed: nope');
  });

  it('reads a missing key as null and throws on other failures', async () => {
    const missing = vi.fn(async () => new Response('not found', { status: 404 }));
    expect(await kvClient(cfg, missing).get('today')).toBeNull();
    const broken = vi.fn(async () => new Response('', { status: 502 }));
    await expect(kvClient(cfg, broken).get('today')).rejects.toThrow('KV read of today failed: HTTP 502');
  });
});

describe('kvConfigFromEnv', () => {
  it('is off when nothing is set', () => {
    expect(kvConfigFromEnv({})).toBeNull();
  });

  it('reads all three variables', () => {
    expect(
      kvConfigFromEnv({ CLOUDFLARE_ACCOUNT_ID: 'a', CLOUDFLARE_KV_NAMESPACE_ID: 'n', CLOUDFLARE_API_TOKEN: 't' }),
    ).toEqual({ accountId: 'a', namespaceId: 'n', apiToken: 't' });
  });

  it('refuses a half-configured setup', () => {
    expect(() => kvConfigFromEnv({ CLOUDFLARE_ACCOUNT_ID: 'a' })).toThrow(/CLOUDFLARE_API_TOKEN/);
  });
});
