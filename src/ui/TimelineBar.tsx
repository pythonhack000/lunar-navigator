import { memo, useRef, type PointerEvent } from 'react';
import { useT } from '../i18n';
import { DAY_MS, formatShortDate } from '../lib/format';
import type { Timeline } from '../lib/visibility';

interface TimelineBarProps {
  timeline: Timeline;
  time: number;
  onSeek: (time: number) => void;
}

const W = 1000;
const ROW_H = 14;
const GAP = 6;
const LABEL_H = 14;
const H = ROW_H * 2 + GAP + LABEL_H;
const LABEL_EVERY_DAYS = 5;

const UP = 0.5;

/**
 * Run-length encodes a visibility series into solid bars (body above the terrain or not), so a month
 * needs a few dozen rects, not 700. Bars never overlap, so there are no darker seams between them.
 */
function Row({ values, y, className }: { values: Float32Array; y: number; className: string }) {
  const n = values.length;
  const bars = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const up = i < n && values[i] >= UP;
    if (up && start < 0) start = i;
    if (!up && start >= 0) {
      bars.push(<rect key={start} x={(start / n) * W} y={y} width={((i - start) / n) * W} height={ROW_H} rx={3} />);
      start = -1;
    }
  }
  return (
    <g className={className}>
      <rect x={0} y={y} width={W} height={ROW_H} rx={3} className="row-bg" />
      {bars}
    </g>
  );
}

const MemoRow = memo(Row);

function DayTicks({ timeline }: { timeline: Timeline }) {
  const span = (timeline.sun.length - 1) * timeline.stepMs;
  const firstDay = Math.ceil(timeline.start / DAY_MS) * DAY_MS;
  const ticks = [];
  for (let t = firstDay; t <= timeline.start + span; t += DAY_MS) {
    const x = ((t - timeline.start) / span) * W;
    const day = Math.round(t / DAY_MS);
    const labelled = day % LABEL_EVERY_DAYS === 0;
    ticks.push(
      <g key={t}>
        <line x1={x} x2={x} y1={ROW_H * 2 + GAP} y2={ROW_H * 2 + GAP + (labelled ? 5 : 3)} />
        {labelled && <text x={x} y={H - 1} textAnchor="middle">{formatShortDate(t)}</text>}
      </g>,
    );
  }
  return <g className="day-ticks">{ticks}</g>;
}

const MemoTicks = memo(DayTicks);

export function TimelineBar({ timeline, time, onSeek }: TimelineBarProps) {
  const t = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  const span = (timeline.sun.length - 1) * timeline.stepMs;
  const cursorX = ((time - timeline.start) / span) * W;

  const seekFromPointer = (e: PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onSeek(timeline.start + f * span);
  };

  return (
    <div className="timeline">
      <div className="timeline__labels" aria-hidden="true">
        <span className="legend legend--sun">{t('sunlight')}</span>
        <span className="legend legend--earth">{t('earthView')}</span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="slider"
        aria-label="Time within the lunar month"
        aria-valuemin={timeline.start}
        aria-valuemax={timeline.start + span}
        aria-valuenow={time}
        aria-valuetext={new Date(time).toUTCString()}
        tabIndex={0}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) seekFromPointer(e);
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? DAY_MS : timeline.stepMs;
          if (e.key === 'ArrowRight') onSeek(time + step);
          if (e.key === 'ArrowLeft') onSeek(time - step);
        }}
      >
        <MemoRow values={timeline.sun} y={0} className="row row--sun" />
        <MemoRow values={timeline.earth} y={ROW_H + GAP} className="row row--earth" />
        <MemoTicks timeline={timeline} />
        <line x1={cursorX} x2={cursorX} y1={-2} y2={ROW_H * 2 + GAP + 2} className="cursor" />
      </svg>
    </div>
  );
}
