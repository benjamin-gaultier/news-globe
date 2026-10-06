import { useEffect, useState, type DependencyList } from 'react';

export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading'; previous?: T }
  | { status: 'error'; error: string }
  | { status: 'ready'; data: T };

/**
 * Run `load` whenever `deps` change (pass null to stay idle). Aborts the
 * in-flight request on change/unmount. While reloading, the previous data is
 * kept in `previous` so the UI can avoid flashing a skeleton.
 */
export function useAsync<T>(load: ((signal: AbortSignal) => Promise<T>) | null, deps: DependencyList): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: load ? 'loading' : 'idle' });

  useEffect(() => {
    if (!load) {
      setState({ status: 'idle' });
      return;
    }
    const ctrl = new AbortController();
    setState((prev) => ({ status: 'loading', previous: prev.status === 'ready' ? prev.data : undefined }));
    load(ctrl.signal).then(
      (data) => setState({ status: 'ready', data }),
      (err: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      },
    );
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
