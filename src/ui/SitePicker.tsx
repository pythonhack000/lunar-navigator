import { useState, type FormEvent } from 'react';
import { SITES, type SiteGroup } from '../data/sites';
import { siteLabel, useT } from '../i18n';
import { siteKey, useNavigator } from '../state/store';

const GROUPS: SiteGroup[] = ['Artemis', 'South pole', 'Future missions', 'Robotic landers', 'Apollo'];

function parseCoordinate(value: string, limit: number): number | null {
  const n = Number(value.trim());
  return value.trim() !== '' && Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

function CustomSiteForm() {
  const t = useT();
  const selectSite = useNavigator((s) => s.selectSite);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const la = parseCoordinate(lat, 90);
    const lo = parseCoordinate(lon, 180);
    if (la === null || lo === null) {
      setError(t('picker.error'));
      return;
    }
    setError(null);
    selectSite({ id: null, name: '', kind: 'custom', lat: la, lon: lo });
  };

  return (
    <form className="coord-form" onSubmit={handleSubmit} noValidate>
      <label>
        <span>{t('picker.lat')}</span>
        <input inputMode="decimal" placeholder="-89.45" value={lat} onChange={(e) => setLat(e.target.value)} />
      </label>
      <label>
        <span>{t('picker.lon')}</span>
        <input inputMode="decimal" placeholder="-137.0" value={lon} onChange={(e) => setLon(e.target.value)} />
      </label>
      <button type="submit" className="ghost-button">{t('picker.go')}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}

/**
 * Site list as an accordion: every group's header stays in view, so a first-time visitor sees at
 * once that Apollo and the robotic landers are there too; one group is open at a time and its
 * sites scroll inside it. A search shows every match, all groups open.
 */
export function SitePicker() {
  const t = useT();
  const lang = useNavigator((s) => s.lang);
  const site = useNavigator((s) => s.site);
  const selectSite = useNavigator((s) => s.selectSite);
  const setOpenTool = useNavigator((s) => s.setOpenTool);
  const [query, setQuery] = useState('');
  const [openGroup, setOpenGroup] = useState<SiteGroup | null>(() => SITES.find((s) => s.id === site.id)?.group ?? 'South pole');
  const q = query.trim().toLowerCase();
  const isSearching = q !== '';
  const matches = SITES.filter((s) => !q || `${s.name} ${s.nameRu} ${s.note} ${s.noteRu}`.toLowerCase().includes(q));
  const currentKey = siteKey(site);

  return (
    <section className="panel site-picker" aria-label={t('picker.search')} data-tour="sites">
      <input className="search" type="search" placeholder={t('picker.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('picker.search')} />
      <button type="button" className="ghost-button site-search-open" data-tour="site-search" onClick={() => setOpenTool('search')}>{t('search.open')}</button>
      <div className={isSearching ? 'site-list is-searching' : 'site-list'}>
        {GROUPS.map((group) => {
          const items = matches.filter((s) => s.group === group);
          if (items.length === 0) return null;
          const isOpen = isSearching || openGroup === group;
          return (
            <div key={group} className={isOpen ? 'site-group is-open' : 'site-group'}>
              <button type="button" className="group-toggle" aria-expanded={isOpen} onClick={() => setOpenGroup(openGroup === group ? null : group)}>
                <span>{t(`group.${group}`)}</span>
                <span className="group-count">{items.length}</span>
                <span className="chevron" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div className="site-group__items">
                  {items.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={(site.id ? s.id === site.id : siteKey(s) === currentKey) ? 'site-item is-active' : 'site-item'}
                      onClick={() => selectSite({ id: s.id, name: s.name, lat: s.lat, lon: s.lon })}
                    >
                      <span className="site-item__name">{siteLabel(s, lang)}</span>
                      <span className="site-item__note">{lang === 'ru' ? s.noteRu : s.note}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <details className="custom-site">
        <summary>{t('picker.custom')}</summary>
        <p className="hint">{t('picker.hint')}</p>
        <CustomSiteForm />
      </details>
    </section>
  );
}
