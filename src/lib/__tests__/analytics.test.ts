import { afterEach, describe, expect, it, vi } from 'vitest';
import { excludeTeamBrowser, HEARTBEAT_MS, MAX_HEARTBEATS, startHeartbeat } from '../analytics';

describe('excludeTeamBrowser', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('turns counting off for this browser when the link has ?team', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: { setItem: (k: string, v: string) => store.set(k, v) } });
    expect(excludeTeamBrowser('?team')).toBe(true);
    expect(store.get('umami.disabled')).toBe('1');
  });

  it('leaves everyone else counted', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: { setItem: (k: string, v: string) => store.set(k, v) } });
    expect(excludeTeamBrowser('?utm_source=spaceapps')).toBe(false);
    expect(store.size).toBe(0);
  });
});

describe('startHeartbeat', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function setup() {
    vi.useFakeTimers();
    const sent: number[] = [];
    vi.stubGlobal('window', {
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
      umami: { track: (_e: string, data: { minute: number }) => sent.push(data.minute) },
    });
    return sent;
  }

  it('says "still here" once a minute while the tab is visible, and stops after an hour', () => {
    const sent = setup();
    startHeartbeat(() => true);
    vi.advanceTimersByTime(3 * HEARTBEAT_MS);
    expect(sent).toEqual([1, 2, 3]);
    vi.advanceTimersByTime(2 * MAX_HEARTBEATS * HEARTBEAT_MS);
    expect(sent).toHaveLength(MAX_HEARTBEATS);
  });

  it('adds nothing while the tab is in the background', () => {
    const sent = setup();
    let visible = false;
    startHeartbeat(() => visible);
    vi.advanceTimersByTime(5 * HEARTBEAT_MS);
    visible = true;
    vi.advanceTimersByTime(HEARTBEAT_MS);
    expect(sent).toEqual([1]);
  });
});
