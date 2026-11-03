import { useState, type FormEvent } from 'react';
import { SITES, type SiteGroup } from '../data/sites';
import { siteKey, useNavigator } from '../state/store';

const GROUPS: SiteGroup[] = ['South pole', 'Apollo', 'Robotic landers'];

function parseCoordinate(value: string, limit: number): number | null {
  const n = Number(value.trim());
  return value.trim() !== '' && Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

function CustomSiteForm() {
  const selectSite = useNavigator((s) => s.selectSite);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const la = parseCoordinate(lat, 90);
    const lo = parseCoordinate(lon, 180);
    if (la === null || lo === null) {
      setError('Latitude −90…90, longitude −180…180');
      return;
    }
    setError(null);
    selectSite({ id: null, name: 'Custom site', lat: la, lon: lo });
  };

  return (
    <form className="coord-form" onSubmit={handleSubmit} noValidate>
      <label>
        <span>Lat</span>
        <input inputMode="decimal" placeholder="-89.45" value={lat} onChange={(e) => setLat(e.target.value)} />
      </label>
      <label>
        <span>Lon</span>
        <input inputMode="decimal" placeholder="-137.0" value={lon} onChange={(e) => setLon(e.target.value)} />
      </label>
      <button type="submit" className="ghost-button">Go</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}

export function SitePicker() {
  const site = useNavigator((s) => s.site);
  const selectSite = useNavigator((s) => s.selectSite);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = SITES.filter((s) => !q || `${s.name} ${s.note}`.toLowerCase().includes(q));
  const currentKey = siteKey(site);

  return (
    <section className="panel site-picker" aria-label="Landing sites" data-tour="sites">
      <input
        className="search"
        type="search"
        placeholder="Search landing sites"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search landing sites"
      />
      <div className="site-list">
        {GROUPS.map((group) => {
          const items = matches.filter((s) => s.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="site-group">
              <h3>{group}</h3>
              {items.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={siteKey(s) === currentKey ? 'site-item is-active' : 'site-item'}
                  onClick={() => selectSite({ id: s.id, name: s.name, lat: s.lat, lon: s.lon })}
                >
                  <span className="site-item__name">{s.name}</span>
                  <span className="site-item__note">{s.note}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <div className="custom-site">
        <h3>Custom coordinates</h3>
        <p className="hint">Or click anywhere on the Moon.</p>
        <CustomSiteForm />
      </div>
    </section>
  );
}
