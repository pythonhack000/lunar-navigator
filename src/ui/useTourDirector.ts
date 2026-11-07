import { useCallback, useEffect, useRef, useState } from 'react';
import type { PowerConfig } from '../lib/power';
import { useNavigator, type MapLayer, type PlaybackSpeed, type ReliefScale, type Scenario } from '../state/store';
import { beatMs, type TourBeat, type TourRun, type TourStep } from './tourScript';

/** The ring flashes for this long before LUNA presses, so the visitor sees what gets clicked. */
const PRESS_NOTICE_MS = 650;
const DIALOG_CLASS = 'tour-dialog';
const RUN_SPEED: Partial<Record<TourRun, PlaybackSpeed>> = { 'play-slow': 6, 'play-fast': 24 };

interface Snapshot {
  time: number;
  speed: PlaybackSpeed;
  layer: MapLayer;
  relief: ReliefScale;
  compare: readonly Scenario[];
  power: PowerConfig;
}

function takeSnapshot(): Snapshot {
  const { time, speed, layer, relief, compare, power } = useNavigator.getState();
  return { time, speed, layer, relief, compare, power };
}

/** Puts everything back after a step: the visitor's site, date and settings are never left changed. */
function restore(snapshot: Snapshot): void {
  document.querySelector<HTMLButtonElement>('.report-dialog .icon-button')?.click();
  const store = useNavigator.getState();
  store.setOpenTool(null);
  store.exitGroundView();
  store.setPlaying(false);
  useNavigator.setState(snapshot);
}

const REWIND_MS = 1100;

/** Slides the clock back to where it was, so the visitor sees time return. */
function rewindClock(to: number, onDone: () => void): () => void {
  const store = useNavigator.getState();
  store.setPlaying(false);
  const from = store.time;
  const begun = performance.now();
  let frame = 0;
  const tick = () => {
    const share = Math.min(1, (performance.now() - begun) / REWIND_MS);
    useNavigator.getState().setTime(from + (to - from) * (share * (2 - share)));
    if (share < 1) frame = requestAnimationFrame(tick);
    else onDone();
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

function press(selector: string): void {
  document.querySelector<HTMLElement>(selector)?.click();
}

interface Position {
  step: number;
  beat: number;
}

export interface TourDirector {
  isActive: boolean;
  stepIndex: number;
  step: TourStep | null;
  beat: TourBeat | null;
  isPaused: boolean;
  isPressing: boolean;
  /** Changes with every beat, to restart its progress bar. */
  beatKey: string;
  start: (stepIndex?: number) => void;
  finish: () => void;
  nextStep: () => void;
  togglePause: () => void;
}

/** Runs the tour by itself, beat after beat; the visitor can pause, skip ahead or leave at any time. */
export function useTourDirector(tour: readonly TourStep[], onFinish: () => void): TourDirector {
  const [position, setPosition] = useState<Position | null>(null);
  const [isPaused, setPaused] = useState(false);
  const [isPressing, setPressing] = useState(false);
  const snapshot = useRef<Snapshot | null>(null);
  const remaining = useRef(0);
  const movedCamera = useRef(false);
  const stopRewind = useRef<(() => void) | null>(null);
  const step = position ? tour[position.step] : null;
  const beat = step && position ? step.beats[position.beat] : null;
  const stepCount = tour.length;

  /** The camera comes back only if she moved it: otherwise the visitor's own view stays. */
  const undoStep = useCallback(() => {
    stopRewind.current?.();
    stopRewind.current = null;
    if (snapshot.current) restore(snapshot.current);
    if (movedCamera.current) useNavigator.getState().flyToSite();
    movedCamera.current = false;
  }, []);

  const finish = useCallback(() => {
    undoStep();
    snapshot.current = null;
    setPosition(null);
    setPaused(false);
    setPressing(false);
    document.body.classList.remove(DIALOG_CLASS);
    onFinish();
  }, [onFinish, undoStep]);

  const goToStep = useCallback(
    (index: number) => {
      if (index >= stepCount) {
        finish();
        return;
      }
      undoStep();
      setPressing(false);
      setPosition({ step: index, beat: 0 });
    },
    [finish, stepCount, undoStep],
  );

  const start = useCallback((stepIndex = 0) => {
    snapshot.current = takeSnapshot();
    setPaused(false);
    setPosition({ step: stepIndex, beat: 0 });
  }, []);

  // A new beat: its full time, its action, and room for an open window.
  useEffect(() => {
    if (!beat) return;
    remaining.current = beatMs(beat);
    const speed = beat.run ? RUN_SPEED[beat.run] : undefined;
    if (speed) {
      const store = useNavigator.getState();
      store.setSpeed(speed);
      store.setPlaying(true);
    }
    if (beat.run === 'polar-view') {
      movedCamera.current = true;
      useNavigator.getState().showPolarView();
    }
    document.body.classList.toggle(DIALOG_CLASS, Boolean(beat.inDialog));
  }, [beat]);

  // The beat's clock; pausing keeps what is left of it.
  useEffect(() => {
    if (!beat || !position || isPaused) return;
    const total = remaining.current;
    const begun = performance.now();
    const timers: number[] = [];
    if (beat.press) timers.push(window.setTimeout(() => setPressing(true), Math.max(0, total - PRESS_NOTICE_MS)));
    timers.push(
      window.setTimeout(() => {
        if (beat.press) press(beat.press);
        setPressing(false);
        const advance = () => {
          if (position.beat + 1 < tour[position.step].beats.length) setPosition({ step: position.step, beat: position.beat + 1 });
          else goToStep(position.step + 1);
        };
        if (beat.run && RUN_SPEED[beat.run] && snapshot.current) stopRewind.current = rewindClock(snapshot.current.time, advance);
        else advance();
      }, total),
    );
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      remaining.current = Math.max(0, total - (performance.now() - begun));
    };
  }, [beat, position, isPaused, tour, goToStep]);

  return {
    isActive: position !== null,
    stepIndex: position?.step ?? 0,
    step,
    beat,
    isPaused,
    isPressing,
    beatKey: position ? `${position.step}-${position.beat}` : '',
    start,
    finish,
    nextStep: () => position && goToStep(position.step + 1),
    togglePause: () => setPaused((p) => !p),
  };
}
