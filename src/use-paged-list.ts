import {useCallback, useEffect, useRef, useState} from 'react';
import {clean, type Page, type ReadOptions} from './model.js';

export type PageLoader<T> = (signal: AbortSignal, options: ReadOptions) => Promise<Page<T>>;
type State<T> = {
  loader: PageLoader<T>; items: T[]; nextPageToken?: string;
  loading: boolean; loadingMore: boolean; error: string; moreError: string;
};
type Session<T> = {
  loader: PageLoader<T>; controller: AbortController; items: T[];
  nextPageToken?: string; seenTokens: Set<string>; pages: number; busy: boolean;
};

function append<T extends {id: string}>(session: Session<T>, page: Page<T>, token?: string) {
  const seen = new Set(session.seenTokens);
  if (token) seen.add(token);
  if (page.nextPageToken && seen.has(page.nextPageToken)) throw new Error('The service repeated a page cursor.');
  session.items = [...new Map([...session.items, ...page.items].map(item => [item.id, item])).values()];
  session.nextPageToken = page.nextPageToken;
  session.seenTokens = seen;
  session.pages++;
}

export function usePagedList<T extends {id: string}>(loader: PageLoader<T>, revision: {id: number; fresh: boolean}) {
  const session = useRef<Session<T> | undefined>(undefined);
  const readRevision = useRef(0);
  const [state, setState] = useState<State<T>>({loader, items: [], loading: true, loadingMore: false, error: '', moreError: ''});

  useEffect(() => {
    const previous = session.current;
    const sameCollection = previous?.loader === loader;
    const pages = sameCollection ? Math.max(1, previous?.pages ?? 1) : 1;
    const current: Session<T> = {loader, controller: new AbortController(), items: [], seenTokens: new Set(), pages: 0, busy: true};
    session.current = current;
    const fresh = revision.fresh && readRevision.current !== revision.id;
    readRevision.current = revision.id;
    setState({loader, items: sameCollection && previous ? previous.items : [], loading: true, loadingMore: false, error: '', moreError: ''});
    void (async () => {
      try {
        // Refresh the pages already browsed so older selections survive reloads
        // and writes. Pages first visited afterwards use the configured TTL.
        for (let index = 0; index < pages; index++) {
          const token = current.nextPageToken;
          const page = await loader(current.controller.signal, {fresh, ...(token ? {pageToken: token} : {})});
          if (current.controller.signal.aborted || session.current !== current) return;
          append(current, page, token);
          if (!current.nextPageToken) break;
        }
        current.busy = false;
        setState({loader, items: current.items, nextPageToken: current.nextPageToken, loading: false, loadingMore: false, error: '', moreError: ''});
      } catch (cause) {
        if (current.controller.signal.aborted || session.current !== current) return;
        if (sameCollection && previous) {
          current.items = previous.items; current.pages = previous.pages;
          current.nextPageToken = previous.nextPageToken; current.seenTokens = previous.seenTokens;
        }
        current.busy = false;
        setState(old => ({...old, loading: false, error: clean(cause instanceof Error ? cause.message : cause)}));
      }
    })();
    return () => current.controller.abort();
  }, [loader, revision]);

  const loadMore = useCallback(async () => {
    const current = session.current;
    const token = current?.nextPageToken;
    if (!current || current.busy || current.controller.signal.aborted || !token) return;
    current.busy = true;
    setState(old => ({...old, loadingMore: true, moreError: ''}));
    try {
      const page = await current.loader(current.controller.signal, {pageToken: token});
      if (current.controller.signal.aborted || session.current !== current) return;
      append(current, page, token);
      setState({loader: current.loader, items: current.items, nextPageToken: current.nextPageToken, loading: false, loadingMore: false, error: '', moreError: ''});
    } catch (cause) {
      if (current.controller.signal.aborted || session.current !== current) return;
      setState(old => ({...old, loadingMore: false, moreError: `Could not load more. Press g to retry. ${clean(cause instanceof Error ? cause.message : cause)}`}));
    } finally {current.busy = false;}
  }, []);

  // Hide the previous collection immediately, before the new effect runs.
  return {...(state.loader === loader ? state : {loader, items: [], nextPageToken: undefined, loading: true, loadingMore: false, error: '', moreError: ''}), loadMore};
}
