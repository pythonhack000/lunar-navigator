import { useT } from '../i18n';
import { useSiteSearch } from '../state/siteSearchStore';
import { useNavigator } from '../state/store';

/**
 * While the search dialog is closed, a small bar over the Moon says what the lit spots are, with
 * the list one click away and a way to clear them.
 */
export function SearchChip() {
  const t = useT();
  const { hits, total, status, clear, request } = useSiteSearch();
  const isDialogOpen = useNavigator((s) => s.openTool === 'search');
  const isGroundView = useNavigator((s) => s.isGroundView);
  const openList = () => useNavigator.getState().setOpenTool('search');
  if (status === 'idle' || isDialogOpen || isGroundView) return null;

  const fitting = hits.filter((h) => h.fits).length;
  let text = t('search.chipRunning', { n: hits.length, total: Math.max(total, hits.length) });
  if (status === 'failed') text = t('search.failed');
  else if (status === 'done') text = fitting > 0 ? t('search.chipDone', { n: fitting }) : t(request?.period.kind === 'year' ? 'search.noneYear' : 'search.none');

  return (
    <div className="search-chip" role="status">
      <span className={status === 'running' ? 'search-chip__dot is-running' : 'search-chip__dot'} aria-hidden="true" />
      <span>{text}</span>
      <button type="button" className="link-button" onClick={openList}>{t('search.list')}</button>
      <button type="button" className="icon-button" aria-label={t('search.clear')} title={t('search.clear')} onClick={clear}>×</button>
    </div>
  );
}
