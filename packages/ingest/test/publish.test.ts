import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeBundle, readBundleEntry } from '@news-globe/shared/bundle';
import { publishConfigFromEnv, publishToKv, type PublishConfig } from '../src/publish';

const cfg: PublishConfig = { accountId: 'acc', namespaceId: 'ns', apiToken: 'tok' };
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'news-globe-publish-'));
  await mkdir(join(dir, 'countries'));
  await writeFile(join(dir, 'index.json'), '{"i":1}');
  await writeFile(join(dir, 'countries', 'FR.json'), '{"fr":1}');
  await writeFile(join(dir, 'countries', 'US.json'), '{"us":1}');
  await writeFile(join(dir, 'countries', 'notes.txt'), 'not public');
  await mkdir(join(dir, 'regions'));
  await writeFile(join(dir, 'regions', 'FR-BRE.json'), '{"bre":1}');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function okFetch() {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify({ success: true, errors: [] }), { status: 200 }),
  );
}

const quiet = () => {};

function sentBundle(fetchImpl: ReturnType<typeof okFetch>, call = 0): Uint8Array {
  return fetchImpl.mock.calls[call]![1]?.body as Uint8Array;
}

const text = (bytes: Uint8Array | null) => (bytes ? new TextDecoder().decode(bytes) : null);

describe('publishToKv', () => {
  it('writes all public files as one bundle value', async () => {
    const fetchImpl = okFetch();
    const res = await publishToKv(dir, cfg, { fetchImpl, log: quiet });
    expect(res).toEqual({
      uploaded: true,
      keys: ['index.json', 'countries/FR.json', 'countries/US.json', 'regions/FR-BRE.json'],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acc/storage/kv/namespaces/ns/values/bundle');
    expect(init?.method).toBe('PUT');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    const bundle = sentBundle(fetchImpl);
    expect(text(readBundleEntry(bundle, 'index.json'))).toBe('{"i":1}');
    expect(text(readBundleEntry(bundle, 'countries/FR.json'))).toBe('{"fr":1}');
    expect(text(readBundleEntry(bundle, 'countries/US.json'))).toBe('{"us":1}');
    expect(text(readBundleEntry(bundle, 'regions/FR-BRE.json'))).toBe('{"bre":1}');
    expect(readBundleEntry(bundle, 'countries/notes.txt')).toBeNull();
  });

  it('skips the write when nothing changed', async () => {
    await publishToKv(dir, cfg, { fetchImpl: okFetch(), log: quiet });
    await writeFile(join(dir, 'index.json'), '{"i":2}');

    const fetchImpl = okFetch();
    expect((await publishToKv(dir, cfg, { fetchImpl, log: quiet })).uploaded).toBe(true);
    expect(text(readBundleEntry(sentBundle(fetchImpl), 'index.json'))).toBe('{"i":2}');

    const again = okFetch();
    expect((await publishToKv(dir, cfg, { fetchImpl: again, log: quiet })).uploaded).toBe(false);
    expect(again).not.toHaveBeenCalled();
  });

  it('throws on API failure and retries next time', async () => {
    const failing = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, errors: [{ message: 'Authentication error' }] }), { status: 403 }),
    );
    await expect(publishToKv(dir, cfg, { fetchImpl: failing, log: quiet })).rejects.toThrow('Authentication error');

    const res = await publishToKv(dir, cfg, { fetchImpl: okFetch(), log: quiet });
    expect(res.uploaded).toBe(true);
  });
});

describe('bundle', () => {
  it('round-trips multi-byte text and rejects unknown keys', () => {
    const bundle = encodeBundle({ 'a.json': '{"t":"Tuổi Trẻ 東京"}', 'b.json': '{}' });
    expect(text(readBundleEntry(bundle, 'a.json'))).toBe('{"t":"Tuổi Trẻ 東京"}');
    expect(text(readBundleEntry(bundle, 'b.json'))).toBe('{}');
    expect(readBundleEntry(bundle, 'toString')).toBeNull();
    expect(readBundleEntry(bundle, 'c.json')).toBeNull();
  });
});

describe('publishConfigFromEnv', () => {
  it('is off when nothing is set', () => {
    expect(publishConfigFromEnv({})).toBeNull();
  });

  it('reads all three variables', () => {
    expect(
      publishConfigFromEnv({ CLOUDFLARE_ACCOUNT_ID: 'a', CLOUDFLARE_KV_NAMESPACE_ID: 'n', CLOUDFLARE_API_TOKEN: 't' }),
    ).toEqual({ accountId: 'a', namespaceId: 'n', apiToken: 't' });
  });

  it('refuses a half-configured setup', () => {
    expect(() => publishConfigFromEnv({ CLOUDFLARE_ACCOUNT_ID: 'a' })).toThrow(/CLOUDFLARE_API_TOKEN/);
  });
});
