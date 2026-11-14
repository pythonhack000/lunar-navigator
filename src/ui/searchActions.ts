import { track } from '../lib/analytics';
import type { SearchHit } from '../lib/siteSearch';
import { useSiteSearch } from '../state/siteSearchStore';
import { useNavigator } from '../state/store';

/** Flies to a found spot; for a search over dates the clock goes to the first of them. */
export function goToHit(hit: SearchHit): void {
  const nav = useNavigator.getState();
  nav.selectSite({ id: null, name: '', kind: 'custom', lat: hit.lat, lon: hit.lon });
  const period = useSiteSearch.getState().request?.period;
  if (period?.kind === 'dates') nav.setTime(Math.min(period.from, period.to));
  track('site-search-go');
}

/** A miss within this of the needs is drawn as "almost": worth a look on other dates. */
const NEAR_MISS = 0.1;

export function hitTone(hit: SearchHit): 'fit' | 'near' | 'miss' {
  if (hit.fits) return 'fit';
  return hit.margin > -NEAR_MISS ? 'near' : 'miss';
}
