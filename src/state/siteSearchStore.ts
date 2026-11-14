import { create } from 'zustand';
import type { SearchCriteria, SearchHit, SearchPeriod } from '../lib/siteSearch';
import { SLOPE_MAX_DEG } from '../lib/siteScore';

/**
 * The site search lives here rather than in its dialog, so it keeps running when the dialog
 * closes and its spots stay lit on the Moon until the visitor clears them.
 */
export type SearchStatus = 'idle' | 'running' | 'done' | 'failed';

export interface SearchRequest {
  criteria: SearchCriteria;
  period: SearchPeriod;
  nonce: number;
}

export const DEFAULT_SEARCH_CRITERIA: SearchCriteria = {
  sun: { op: 'atLeast', value: 0.8 },
  link: { op: 'atLeast', value: 0.3 },
  antennaMaskDeg: 1,
  maxSlopeDeg: SLOPE_MAX_DEG,
  maxIceKm: null,
};

interface SiteSearchState {
  /** The last search asked for; its form values reopen with the dialog. */
  request: SearchRequest | null;
  hits: SearchHit[];
  /** How many spots this search checks in all. */
  total: number;
  status: SearchStatus;
  start: (criteria: SearchCriteria, period: SearchPeriod) => void;
  progress: (nonce: number, hits: SearchHit[]) => void;
  setTotal: (nonce: number, total: number) => void;
  finish: (nonce: number, status: 'done' | 'failed') => void;
  clear: () => void;
}

export const useSiteSearch = create<SiteSearchState>((set) => ({
  request: null,
  hits: [],
  total: 0,
  status: 'idle',
  start: (criteria, period) => set((s) => ({ request: { criteria, period, nonce: (s.request?.nonce ?? 0) + 1 }, hits: [], total: 0, status: 'running' })),
  // A stale search's late results are dropped: only the current nonce may write.
  progress: (nonce, hits) => set((s) => (s.request?.nonce === nonce ? { hits } : s)),
  setTotal: (nonce, total) => set((s) => (s.request?.nonce === nonce ? { total } : s)),
  finish: (nonce, status) => set((s) => (s.request?.nonce === nonce ? { status } : s)),
  clear: () => set((s) => ({ request: s.request ? { ...s.request, nonce: s.request.nonce + 1 } : null, hits: [], total: 0, status: 'idle' })),
}));
