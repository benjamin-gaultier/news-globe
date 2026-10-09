// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { latestData, useAsync } from '../src/hooks/useAsync';
import { MOBILE_QUERY, useMediaQuery } from '../src/hooks/useMediaQuery';
import { useNow } from '../src/hooks/useNow';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A load function whose calls can be settled by hand. */
function deferredLoader<T>() {
  const calls: { signal: AbortSignal; resolve: (v: T) => void; reject: (e: unknown) => void }[] = [];
  const load = vi.fn(
    (signal: AbortSignal) => new Promise<T>((resolve, reject) => calls.push({ signal, resolve, reject })),
  );
  return { load, calls };
}

describe('useAsync', () => {
  it('stays idle without a loader', () => {
    const { result } = renderHook(() => useAsync(null, []));
    expect(result.current).toEqual({ status: 'idle' });
  });

  it('goes from loading to ready', async () => {
    const { load, calls } = deferredLoader<string>();
    const { result } = renderHook(() => useAsync(load, []));
    expect(result.current).toEqual({ status: 'loading', previous: undefined });
    await act(async () => calls[0]!.resolve('data'));
    expect(result.current).toEqual({ status: 'ready', data: 'data' });
  });

  it('reports an error message', async () => {
    const { load, calls } = deferredLoader<string>();
    const { result, rerender } = renderHook(({ k }) => useAsync(load, [k]), { initialProps: { k: 1 } });
    await act(async () => calls[0]!.reject(new Error('HTTP 500')));
    expect(result.current).toEqual({ status: 'error', error: 'HTTP 500' });

    rerender({ k: 2 });
    await act(async () => calls[1]!.reject('plain'));
    expect(result.current).toEqual({ status: 'error', error: 'plain' });
  });

  it('keeps the previous data through a failed reload and the next one', async () => {
    const { load, calls } = deferredLoader<string>();
    const { result, rerender } = renderHook(({ k }) => useAsync(load, [k]), { initialProps: { k: 1 } });
    await act(async () => calls[0]!.resolve('one'));

    rerender({ k: 2 });
    await act(async () => calls[1]!.reject(new Error('offline')));
    expect(result.current).toEqual({ status: 'error', error: 'offline', previous: 'one' });
    expect(latestData(result.current)).toBe('one');

    rerender({ k: 3 });
    expect(result.current).toEqual({ status: 'loading', previous: 'one' });
  });

  it('reloads on a dependency change, keeping the previous data and aborting the stale request', async () => {
    const { load, calls } = deferredLoader<string>();
    const { result, rerender } = renderHook(({ k }) => useAsync(load, [k]), { initialProps: { k: 1 } });
    await act(async () => calls[0]!.resolve('one'));

    rerender({ k: 2 });
    expect(result.current).toEqual({ status: 'loading', previous: 'one' });
    rerender({ k: 3 });
    expect(calls[1]!.signal.aborted).toBe(true);
    // The aborted request's failure is not an error to show.
    await act(async () => calls[1]!.reject(new DOMException('aborted', 'AbortError')));
    expect(result.current.status).toBe('loading');

    await act(async () => calls[2]!.resolve('three'));
    expect(result.current).toEqual({ status: 'ready', data: 'three' });
  });

  it('goes back to idle when the loader is removed, and aborts on unmount', async () => {
    const { load, calls } = deferredLoader<string>();
    const { result, rerender, unmount } = renderHook(({ l }) => useAsync(l, [l]), {
      initialProps: { l: load as typeof load | null },
    });
    rerender({ l: null });
    expect(result.current).toEqual({ status: 'idle' });
    expect(calls[0]!.signal.aborted).toBe(true);

    rerender({ l: load });
    unmount();
    expect(calls[1]!.signal.aborted).toBe(true);
  });
});

describe('useNow', () => {
  it('ticks on its interval until unmounted', () => {
    vi.useFakeTimers({ now: 1_000 });
    const { result, unmount } = renderHook(() => useNow(10_000));
    expect(result.current).toBe(1_000);
    act(() => vi.advanceTimersByTime(9_999));
    expect(result.current).toBe(1_000);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(11_000);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('useMediaQuery', () => {
  it('follows the media query as it changes', () => {
    const listeners = new Set<() => void>();
    let matches = false;
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
      (media) =>
        ({
          media,
          get matches() {
            return matches;
          },
          addEventListener: (_: string, l: () => void) => listeners.add(l),
          removeEventListener: (_: string, l: () => void) => listeners.delete(l),
        }) as unknown as MediaQueryList,
    );

    const { result, unmount } = renderHook(() => useMediaQuery(MOBILE_QUERY));
    expect(result.current).toBe(false);
    expect(matchMedia).toHaveBeenCalledWith('(max-width: 767px)');

    matches = true;
    act(() => {
      for (const l of listeners) l();
    });
    expect(result.current).toBe(true);

    unmount();
    expect(listeners.size).toBe(0);
  });
});

describe('useTranslated', () => {
  it('passes text through when translation is off or impossible', async () => {
    const { useTranslated } = await import('../src/hooks/useTranslated');
    const { result } = renderHook(() => useTranslated('Bonjour', 'fr', true));
    // jsdom has no Translator API.
    await waitFor(() => expect(result.current).toEqual({ text: 'Bonjour', translated: false }));
    const off = renderHook(() => useTranslated(null, 'fr', false));
    expect(off.result.current).toEqual({ text: null, translated: false });
  });
});
