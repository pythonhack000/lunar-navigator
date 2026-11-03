import { useEffect } from 'react';
import { useT, type StringKey } from '../i18n';
import { formatUtc, fromDateTimeInput, HOUR_MS, toDateTimeInput } from '../lib/format';
import { useThrottledTime } from '../hooks/useThrottledTime';
import { useNavigator, type PlaybackSpeed } from '../state/store';

const SPEEDS: { value: PlaybackSpeed; label: StringKey }[] = [
  { value: 1, label: 'speed.1' },
  { value: 6, label: 'speed.6' },
  { value: 24, label: 'speed.24' },
];

/** Advances the simulated clock while playing. */
function usePlayback() {
  const playing = useNavigator((s) => s.playing);
  const speed = useNavigator((s) => s.speed);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const { time, setTime } = useNavigator.getState();
      setTime(time + ((now - last) / 1000) * speed * HOUR_MS);
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);
}

export function TimeControls() {
  const t = useT();
  usePlayback();
  const time = useThrottledTime();
  const playing = useNavigator((s) => s.playing);
  const speed = useNavigator((s) => s.speed);
  const { setTime, setPlaying, setSpeed } = useNavigator.getState();

  const handleDate = (value: string) => {
    const t = fromDateTimeInput(value);
    if (t !== null) setTime(t);
  };

  return (
    <div className="time-controls">
      <button
        type="button"
        className="play-button"
        onClick={() => setPlaying(!playing)}
        aria-label={playing ? t('pause') : t('play')}
      >
        {playing ? (
          <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg>
        ) : (
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11a.5.5 0 0 0 .77.42l8.5-5.5a.5.5 0 0 0 0-.84l-8.5-5.5A.5.5 0 0 0 4 2.5Z" /></svg>
        )}
      </button>
      <div className="segmented" role="group" aria-label="Playback speed">
        {SPEEDS.map((s) => (
          <button
            key={s.value}
            type="button"
            className={s.value === speed ? 'is-active' : undefined}
            aria-pressed={s.value === speed}
            onClick={() => setSpeed(s.value)}
          >
            {t(s.label)}
          </button>
        ))}
      </div>
      <label className="date-field">
        <span className="visually-hidden">Date and time (UTC)</span>
        <input type="datetime-local" value={toDateTimeInput(time)} onChange={(e) => handleDate(e.target.value)} />
        <span className="date-field__zone">UTC</span>
      </label>
      <button type="button" className="ghost-button" onClick={() => setTime(Math.floor(Date.now() / HOUR_MS) * HOUR_MS)}>
        {t('now')}
      </button>
      <span className="time-readout" aria-live="off">{formatUtc(time)}</span>
    </div>
  );
}
