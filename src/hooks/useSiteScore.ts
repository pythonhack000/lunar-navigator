import { useEffect, useMemo, useState } from 'react';
import { getLightMap, iceDistanceKm, type LightMap } from '../lib/lightMap';
import { siteScore, type SiteScore } from '../lib/siteScore';
import { slopeDeg } from '../lib/slope';
import type { Terrain } from '../lib/terrain';
import type { SiteAnalysis } from './useSiteAnalysis';

export interface SiteScoreView {
  score: SiteScore;
  slopeDeg: number;
  /** Null outside the south polar light map, or with no permanent shadow within reach. */
  iceKm: number | null;
}

/** The selected site's 0-100 score: its month of light and DSN link, its slope, and nearby ice. */
export function useSiteScore(terrain: Terrain, polarRhoMax: number, analysis: SiteAnalysis): SiteScoreView {
  const { lat, lon } = analysis.site;
  const [map, setMap] = useState<LightMap | null>(null);

  useEffect(() => {
    let alive = true;
    getLightMap(polarRhoMax)
      .then((m) => alive && setMap(m))
      .catch((err: unknown) => console.warn('Light map unavailable; scoring without ice', err));
    return () => {
      alive = false;
    };
  }, [polarRhoMax]);

  const slope = useMemo(() => slopeDeg(terrain, lat, lon), [terrain, lat, lon]);
  const iceKm = useMemo(() => (map ? iceDistanceKm(map, lat, lon) : null), [map, lat, lon]);
  const score = useMemo(
    () => siteScore({ sunShare: analysis.summary.sunlitShare, linkShare: analysis.linkShare, slopeDeg: slope, iceKm }),
    [analysis.summary.sunlitShare, analysis.linkShare, slope, iceKm],
  );
  return { score, slopeDeg: slope, iceKm };
}
