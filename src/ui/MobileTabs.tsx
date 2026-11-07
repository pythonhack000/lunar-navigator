import { useT, type StringKey } from '../i18n';
import { useNavigator, type MobileTab } from '../state/store';

const TABS: { id: MobileTab; label: StringKey }[] = [
  { id: 'site', label: 'tab.site' },
  { id: 'time', label: 'tab.time' },
  { id: 'list', label: 'tab.list' },
];

/** On a phone the Moon stays on top, and one of these three fills the space below it. */
export function MobileTabs() {
  const t = useT();
  const tab = useNavigator((s) => s.mobileTab);
  const setTab = useNavigator((s) => s.setMobileTab);
  return (
    <nav className="mobile-tabs" aria-label={t('tab.label')}>
      {TABS.map(({ id, label }) => (
        <button key={id} type="button" className={id === tab ? 'is-active' : undefined} aria-pressed={id === tab} onClick={() => setTab(id)}>
          {t(label)}
        </button>
      ))}
    </nav>
  );
}
