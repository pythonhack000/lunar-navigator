import { useState, type PointerEvent } from 'react';

type Props = {
  label: string;
  values: Float32Array;
  start: number;
  stepMs: number;
  tone: 'sun' | 'earth';
  format: (value: number) => string;
  /** A level to mark across the chart, such as the load a battery must cover. */
  reference?: { value: number; label: string };
  locale: string;
};

const WIDTH = 480;
const HEIGHT = 96;
const PAD = 4;

/** A single line over time on one axis: min and max labelled, the exact value on hover. */
export function MiniChart({ label, values, start, stepMs, tone, format, reference, locale }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const high = Math.max(...values, reference?.value ?? -Infinity);
  const low = Math.min(...values, reference?.value ?? Infinity);
  const span = Math.max(high - low, 1e-6);
  const x = (i: number) => PAD + (i / Math.max(1, values.length - 1)) * (WIDTH - 2 * PAD);
  const y = (v: number) => HEIGHT - PAD - ((v - low) / span) * (HEIGHT - 2 * PAD);
  const points = Array.from(values, (v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const date = (i: number) => new Date(start + i * stepMs).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const share = (e.clientX - box.left) / box.width;
    setHover(Math.max(0, Math.min(values.length - 1, Math.round(share * (values.length - 1)))));
  };

  return (
    <figure className="mini-chart">
      <figcaption className="mini-chart__head">
        <span>{label}</span>
        <span className="mono muted">{hover === null ? `${format(low)} … ${format(high)}` : `${date(hover)} · ${format(values[hover])}`}</span>
      </figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={`${label}: ${format(low)} … ${format(high)}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {reference && <line className="mini-chart__reference" x1={PAD} x2={WIDTH - PAD} y1={y(reference.value)} y2={y(reference.value)} />}
        <polyline className={`mini-chart__line mini-chart__line--${tone}`} points={points} />
        {hover !== null && <line className="mini-chart__cursor" x1={x(hover)} x2={x(hover)} y1={0} y2={HEIGHT} />}
      </svg>
      {reference && <p className="mini-chart__note muted">{reference.label}: {format(reference.value)}</p>}
    </figure>
  );
}
