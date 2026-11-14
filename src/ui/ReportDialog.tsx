import { useState } from 'react';
import type { SiteAnalysis } from '../hooks/useSiteAnalysis';
import { siteLabel, useT } from '../i18n';
import { csvFileName, downloadText, timelineCsv } from '../lib/csv';
import { DAY_MS, toDateTimeInput } from '../lib/format';
import { analyzePeriod, periodRange, type PeriodRange, type ReportPeriod } from '../lib/periodReport';
import { powerSeries } from '../lib/power';
import { buildShareQuery } from '../lib/shareLink';
import { useNavigator } from '../state/store';
import { Dialog } from './Dialog';

type Props = { analysis: SiteAnalysis; onCreate: (range: PeriodRange) => void; onClose: () => void };

const PERIODS: ReportPeriod[] = ['week', 'month', 'quarter', 'custom'];
const dateOnly = (time: number) => toDateTimeInput(time).slice(0, 10);

/** Take it with you: a PDF for people, a CSV for their tools, a link that reopens this exact view. */
export function ReportDialog({ analysis, onCreate, onClose }: Props) {
  const t = useT();
  const lang = useNavigator((s) => s.lang);
  const site = useNavigator((s) => s.site);
  const compare = useNavigator((s) => s.compare);
  const power = useNavigator((s) => s.power);
  const [now] = useState(() => useNavigator.getState().time);
  const [period, setPeriod] = useState<ReportPeriod>('month');
  const [from, setFrom] = useState(() => dateOnly(now));
  const [to, setTo] = useState(() => dateOnly(now + 14 * DAY_MS));
  const [linkState, setLinkState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const range = () => periodRange(period, now, from, to);
  const shareUrl = () => `${window.location.origin}${window.location.pathname}${buildShareQuery({ lang, site, time: now, compare })}`;

  const downloadCsv = () => {
    const chosen = range();
    const data = analyzePeriod(site, analysis.profile, chosen);
    const series = powerSeries(power, site.lat, data.timeline.sunElevation, data.timeline.sun);
    downloadText(csvFileName(siteLabel(site, lang), chosen.start), timelineCsv(site, data.timeline, data.link, series));
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setLinkState('copied');
    } catch {
      // Clipboard refused (permissions, insecure page): show the link to copy by hand.
      setLinkState('manual');
    }
  };

  return (
    <Dialog title={t('report.titleFull')} className="report-dialog" onClose={onClose}>
      <p className="muted">{t('report.hint')}</p>
      <div className="segmented report-dialog__periods" role="group" aria-label={t('compare.period')}>
        {PERIODS.map((p) => (
          <button key={p} type="button" className={p === period ? 'is-active' : undefined} aria-pressed={p === period} onClick={() => setPeriod(p)}>
            {t(`period.${p}`)}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <div className="compare__range">
          <label>{t('compare.from')} <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>{t('compare.to')} <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
      )}
      <div className="report-dialog__actions">
        <button type="button" className="primary-button" onClick={() => onCreate(range())}>{t('report.create')}</button>
        <button type="button" className="ghost-button" onClick={downloadCsv}>{t('report.csv')}</button>
      </div>
      <p className="muted report-dialog__how">{t('report.how')}</p>
      <div className="report-dialog__share">
        <button type="button" className="ghost-button" onClick={() => void copyLink()}>
          {linkState === 'copied' ? t('report.linkDone') : t('report.link')}
        </button>
        <p className="muted">{t('report.linkHint')}</p>
      </div>
      {linkState === 'manual' && (
        <label className="report-dialog__manual">
          {t('report.linkManual')}
          <input readOnly value={shareUrl()} onFocus={(e) => e.target.select()} />
        </label>
      )}
    </Dialog>
  );
}
