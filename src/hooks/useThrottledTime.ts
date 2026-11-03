import { useEffect, useState } from 'react';
import { useNavigator } from '../state/store';

/** Panels redraw ~15 times a second while playing; the 3D scene reads the clock every frame itself. */
const DEFAULT_INTERVAL_MS = 66;

/**
 * The simulated time, delivered at most once per `intervalMs`. The last change always arrives
 * (trailing update), so a paused clock shows the exact time.
 */
export function useThrottledTime(intervalMs = DEFAULT_INTERVAL_MS): number {
  const [time, setTime] = useState(() => useNavigator.getState().time);

  useEffect(() => {
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      timer = undefined;
      last = performance.now();
      setTime(useNavigator.getState().time);
    };
    const unsubscribe = useNavigator.subscribe((state, prev) => {
      if (state.time === prev.time) return;
      const wait = intervalMs - (performance.now() - last);
      if (wait <= 0) flush();
      else if (timer === undefined) timer = setTimeout(flush, wait);
    });
    return () => {
      unsubscribe();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [intervalMs]);

  return time;
}
