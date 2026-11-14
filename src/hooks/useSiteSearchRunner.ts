import { useEffect } from 'react';
import { getLightMap } from '../lib/lightMap';
import { searchSites } from '../lib/siteSearch';
import type { Terrain } from '../lib/terrain';
import { useSiteSearch } from '../state/siteSearchStore';
import { useNavigator } from '../state/store';

/** Spots checked per search: the lit ridges of the whole cap, a few seconds on a laptop. */
const CANDIDATES = 200;

/**
 * Runs the current site search. Mounted with the app, not the dialog, so closing the dialog lets
 * the visitor watch the spots light up on the Moon. A newer search or a clear stops this one.
 */
export function useSiteSearchRunner(terrain: Terrain, polarRhoMax: number): void {
  const request = useSiteSearch((s) => s.request);
  useEffect(() => {
    if (!request || useSiteSearch.getState().status !== 'running') return undefined;
    const { nonce } = request;
    let isStopped = false;
    const store = () => useSiteSearch.getState();
    getLightMap(polarRhoMax)
      .then((map) =>
        searchSites(map, terrain, request.criteria, request.period, {
          candidates: CANDIDATES,
          now: useNavigator.getState().time,
          onCount: (n) => store().setTotal(nonce, n),
          onProgress: (hits) => store().progress(nonce, hits),
          isCancelled: () => isStopped || store().request?.nonce !== nonce,
        }),
      )
      .then(() => !isStopped && store().finish(nonce, 'done'))
      .catch((err: unknown) => {
        console.warn('Site search failed', err);
        if (!isStopped) store().finish(nonce, 'failed');
      });
    return () => {
      isStopped = true;
    };
  }, [request, terrain, polarRhoMax]);
}
