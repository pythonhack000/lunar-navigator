import { useEffect, useRef, useState } from 'react';
import { SITES } from '../data/sites';
import { WINDOW_MS, type SiteAnalysis } from '../hooks/useSiteAnalysis';
import { formatPercent, HOUR_MS } from '../lib/format';
import { rankSitesAsync, type RankedSite, type RankGoal } from '../lib/ranking';
import type { Terrain } from '../lib/terrain';
import { useNavigator } from '../state/store';
import { describeRanking, explainSite, QUICK_GOALS, TOUR } from './assistantScript';

type Props = {
  analysis: SiteAnalysis;
  terrain: Terrain;
  windowStart: number;
};

interface Message {
  id: number;
  from: 'luna' | 'user';
  lines: string[];
  picks?: RankedSite[];
}

const SEEN_KEY = 'luna-tour-seen';
const HIGHLIGHT_CLASS = 'tour-highlight';
/** Ranking uses a coarser time step than the panels: plenty for comparing whole months. */
const RANK_STEP_MS = 3 * HOUR_MS;

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Private mode or blocked storage: the tour simply shows again next time.
  }
}

function RobotAvatar({ isTalking }: { isTalking: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={isTalking ? 'luna-avatar is-talking' : 'luna-avatar'} aria-hidden="true">
      <line x1="32" y1="6" x2="32" y2="14" className="luna-antenna" />
      <circle cx="32" cy="5" r="3" className="luna-beacon" />
      <rect x="10" y="14" width="44" height="36" rx="14" className="luna-head" />
      <rect x="16" y="22" width="32" height="18" rx="9" className="luna-visor" />
      <circle cx="25" cy="31" r="3.4" className="luna-eye" />
      <circle cx="39" cy="31" r="3.4" className="luna-eye" />
      <rect x="22" y="54" width="20" height="5" rx="2.5" className="luna-neck" />
    </svg>
  );
}

/** LUNA, the mission assistant: a guided tour, plain-language briefings and site recommendations. */
export function Assistant({ analysis, terrain, windowStart }: Props) {
  const site = useNavigator((s) => s.site);
  const selectSite = useNavigator((s) => s.selectSite);
  const [isOpen, setOpen] = useState(() => !readSeen());
  const [tourStep, setTourStep] = useState<number | null>(() => (readSeen() ? null : 0));
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setThinking] = useState(false);
  const nextId = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);

  const step = tourStep === null ? null : TOUR[tourStep];

  // Spotlight the element the current tour step talks about.
  useEffect(() => {
    if (!step?.target) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    el?.classList.add(HIGHLIGHT_CLASS);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return () => el?.classList.remove(HIGHLIGHT_CLASS);
  }, [step]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isThinking]);

  const say = (from: Message['from'], lines: string[], picks?: RankedSite[]) =>
    setMessages((m) => [...m, { id: nextId.current++, from, lines, picks }]);

  const endTour = () => {
    markSeen();
    setTourStep(null);
    if (messages.length === 0) say('luna', ["That's the tour! Ask me anything below, or pick a quick question."]);
  };

  const handleExplain = () => {
    say('user', [`Explain ${site.name}`]);
    say('luna', explainSite(site.name, analysis));
  };

  const handleRank = async (goal: RankGoal, label: string) => {
    say('user', [label]);
    setThinking(true);
    try {
      const southPole = SITES.filter((s) => s.group !== 'Apollo');
      const ranked = await rankSitesAsync(southPole, terrain, windowStart, goal, WINDOW_MS, RANK_STEP_MS);
      say('luna', [describeRanking(goal, ranked)], ranked.slice(0, 3));
    } catch (error: unknown) {
      say('luna', [`Sorry, I could not compare the sites: ${error instanceof Error ? error.message : 'unknown error'}.`]);
    } finally {
      setThinking(false);
    }
  };

  const handleHowTo = () => {
    say('user', ['How do I use the 3D view?']);
    say('luna', [
      'Drag with the left mouse button to slide over the ground.',
      'Right-drag or hold Shift and drag to turn and tilt toward the horizon.',
      'Scroll or pinch to zoom; click the Moon to drop a new site.',
      'Use the timeline at the bottom to change the date, or press play.',
    ]);
  };

  const handleAbout = () => {
    say('user', ['What is this challenge about?']);
    say('luna', [
      "NASA's CLPS and Artemis missions target the lunar south pole, where water ice hides in permanently shadowed craters.",
      'There the Sun and Earth hover near the horizon, so a few kilometres or a few days can decide whether a lander has power and radio contact.',
      'This tool turns NASA ephemerides and LOLA terrain into an instant answer for any site and date.',
    ]);
  };

  return (
    <div className="luna" data-open={isOpen}>
      {isOpen && (
        <section className="panel luna-panel" aria-label="LUNA mission assistant">
          <header className="luna-head-row">
            <RobotAvatar isTalking={isThinking || step !== null} />
            <div>
              <strong>LUNA</strong>
              <span className="muted"> · mission assistant</span>
            </div>
            <button type="button" className="icon-button" aria-label="Close assistant" onClick={() => setOpen(false)}>
              ×
            </button>
          </header>

          {step ? (
            <div className="luna-tour">
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <div className="luna-tour-nav">
                <span className="muted">
                  {tourStep! + 1} / {TOUR.length}
                </span>
                <button type="button" className="ghost-button" onClick={endTour}>
                  Skip
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => (tourStep! + 1 < TOUR.length ? setTourStep(tourStep! + 1) : endTour())}
                >
                  {tourStep! + 1 < TOUR.length ? 'Next' : 'Done'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="luna-messages" ref={listRef}>
                {messages.length === 0 && <p className="muted">Ask me about the selected site, or let me find the best one.</p>}
                {messages.map((m) => (
                  <div key={m.id} className={`luna-msg luna-msg--${m.from}`}>
                    {m.lines.map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                    {m.picks && (
                      <ol className="luna-picks">
                        {m.picks.map((p) => (
                          <li key={p.site.name}>
                            <span>{p.site.name}</span>
                            <span className="mono">{formatPercent(p.score)}</span>
                            <button type="button" className="link-button" onClick={() => selectSite(p.site)}>
                              Fly there →
                            </button>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
                {isThinking && <p className="muted luna-thinking">Comparing sites over the next lunar month…</p>}
              </div>
              <div className="luna-chips">
                <button type="button" onClick={handleExplain}>Explain this site</button>
                {QUICK_GOALS.map((q) => (
                  <button key={q.goal} type="button" disabled={isThinking} onClick={() => void handleRank(q.goal, q.label)}>
                    {q.label}
                  </button>
                ))}
                <button type="button" onClick={handleHowTo}>How do I use it?</button>
                <button type="button" onClick={handleAbout}>What is this about?</button>
                <button type="button" onClick={() => setTourStep(0)}>Take the tour</button>
              </div>
            </>
          )}
        </section>
      )}
      <button
        type="button"
        className="luna-launcher"
        aria-label={isOpen ? 'Hide LUNA assistant' : 'Ask LUNA, the mission assistant'}
        onClick={() => setOpen(!isOpen)}
      >
        <RobotAvatar isTalking={isThinking} />
      </button>
    </div>
  );
}
