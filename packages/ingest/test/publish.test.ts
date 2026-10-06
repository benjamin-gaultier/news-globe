import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('publishToKv', () => {
  it('bulk-writes the public files, countries before index', async () => {
    const fetchImpl = okFetch();
    const res = await publishToKv(dir, cfg, { fetchImpl, log: quiet });
    expect(res.uploaded).toEqual(['countries/FR.json', 'countries/US.json', 'index.json']);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acc/storage/kv/namespaces/ns/bulk');
    expect(init?.method).toBe('PUT');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(init?.body as string)).toEqual([
      { key: 'countries/FR.json', value: '{"fr":1}' },
      { key: 'countries/US.json', value: '{"us":1}' },
      { key: 'index.json', value: '{"i":1}' },
    ]);
  });

  it('skips unchanged files on the next run', async () => {
    await publishToKv(dir, cfg, { fetchImpl: okFetch(), log: quiet });
    await writeFile(join(dir, 'index.json'), '{"i":2}');

    const fetchImpl = okFetch();
    const res = await publishToKv(dir, cfg, { fetchImpl, log: quiet });
    expect(res.uploaded).toEqual(['index.json']);
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]?.body as string)).toHaveLength(1);

    const again = okFetch();
    expect((await publishToKv(dir, cfg, { fetchImpl: again, log: quiet })).uploaded).toEqual([]);
    expect(again).not.toHaveBeenCalled();
  });

  it('throws on API failure and retries everything next time', async () => {
    const failing = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, errors: [{ message: 'Authentication error' }] }), { status: 403 }),
    );
    await expect(publishToKv(dir, cfg, { fetchImpl: failing, log: quiet })).rejects.toThrow('Authentication error');

    const res = await publishToKv(dir, cfg, { fetchImpl: okFetch(), log: quiet });
    expect(res.uploaded).toHaveLength(3);
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
