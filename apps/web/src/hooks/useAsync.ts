import { useEffect, useState, type DependencyList } from 'react';

export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading'; previous?: T }
  | { status: 'error'; error: string; previous?: T }
  | { status: 'ready'; data: T };

/** The freshest data the state holds: the loaded data, else what a reload or a failed reload kept. */
export function latestData<T>(state: AsyncState<T>): T | undefined {
  if (state.status === 'ready') return state.data;
  return state.status === 'idle' ? undefined : state.previous;
}

/**
 * Run `load` whenever `deps` change (pass null to stay idle). Aborts the
 * in-flight request on change/unmount. While reloading, and after a reload
 * fails, the previous data is kept in `previous`, so a refresh that fails (a
 * flaky network) doesn't blank what is already shown.
 */
export function useAsync<T>(load: ((signal: AbortSignal) => Promise<T>) | null, deps: DependencyList): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: load ? 'loading' : 'idle' });

  useEffect(() => {
    if (!load) {
      setState({ status: 'idle' });
      return;
    }
    const ctrl = new AbortController();
    setState((prev) => ({ status: 'loading', previous: latestData(prev) }));
    load(ctrl.signal).then(
      (data) => {
        if (!ctrl.signal.aborted) setState({ status: 'ready', data });
      },
      (err: unknown) => {
        if (ctrl.signal.aborted) return;
        const error = err instanceof Error ? err.message : String(err);
        setState((prev) => ({ status: 'error', error, previous: latestData(prev) }));
      },
    );
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
