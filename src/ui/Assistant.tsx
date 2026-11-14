import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SITES, uniquePlaces } from '../data/sites';
import { WINDOW_MS, type SiteAnalysis } from '../hooks/useSiteAnalysis';
import type { SiteScoreView } from '../hooks/useSiteScore';
import { formatLatLon, formatPercent, HOUR_MS } from '../lib/format';
import { findBestSites } from '../lib/candidates';
import { getLightMap } from '../lib/lightMap';
import { rankSitesAsync, type RankedSite, type RankGoal } from '../lib/ranking';
import type { Terrain } from '../lib/terrain';
import { siteLabel } from '../i18n';
import { MAX_COMPARE, useNavigator, type SelectedSite } from '../state/store';
import { assistantText, describeRanking, explainSite, moonVsEarth, tourFact } from './assistantScript';
import { LunaBot, type BotMood } from './LunaBot';
import { MissionGame } from './MissionGame';
import { track } from '../lib/analytics';
import { TourGuide } from './TourGuide';
import { beatMs, tourFor } from './tourScript';
import { useTourDirector } from './useTourDirector';

type Props = {
  analysis: SiteAnalysis;
  score: SiteScoreView;
  terrain: Terrain;
  windowStart: number;
  polarRhoMax: number;
};

/** A landing spot LUNA found, ready to fly to. */
interface BestPick {
  site: SelectedSite;
  score: number;
}

interface Message {
  id: number;
  from: 'luna' | 'user';
  lines: string[];
  picks?: RankedSite[];
  best?: BestPick[];
  /** Ends with a button that starts the mission game. */
  offersGame?: boolean;
}

const SEEN_KEY = 'luna-tour-seen';
const STAGE_SPOT = /layer-|relief|look-|ground-arrows/;
/** While her panel is on the left, the site list under it steps aside so their texts never mix. */
const LEFT_PANEL_CLASS = 'luna-on-left';
/** How long LUNA is pleased about being clicked. */
const HOP_MS = 700;
/** Ranking uses a coarser time step than the panels: plenty for comparing whole months. */
const RANK_STEP_MS = 3 * HOUR_MS;
/** Pace of LUNA's words appearing one after another. */
const WORD_MS = 38;
/** Room left above the question when a new answer scrolls into view. */
const ANSWER_TOP_GAP_PX = 8;
/** The greeting waits for LUNA's fly-in (index.css) to finish. */
const GREET_DELAY_MS = 1100;

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Private mode or blocked storage: the choice lasts for this visit only.
  }
}

/**
 * LUNA's reply surfaces word by word, each fading in from a soft blur. The stagger is pure CSS
 * (an animation delay per word), so there is no re-render per letter and no blinking cursor.
 * Click to show everything at once.
 */
function Typewriter({ lines, isLive }: { lines: string[]; isLive: boolean }) {
  const [isRevealed, setRevealed] = useState(!isLive);
  let index = 0;
  return (
    <div onClick={() => setRevealed(true)} className={isRevealed ? undefined : 'is-revealing'}>
      {lines.map((line, i) => (
        <p key={i}>
          {line.split(/(\s+)/).map((part, j) => {
            if (/^\s+$/.test(part) || part === '') return part;
            const delay = index++ * WORD_MS;
            return (
              <span key={j} className="luna-word" style={{ animationDelay: `${delay}ms` }}>
                {part}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}

/** LUNA, the mission assistant: a guided tour, plain-language briefings and site recommendations. */
export function Assistant({ analysis, score, terrain, windowStart, polarRhoMax }: Props) {
  const lang = useNavigator((s) => s.lang);
  const site = useNavigator((s) => s.site);
  const compare = useNavigator((s) => s.compare);
  const { selectSite, toggleCompare } = useNavigator.getState();
  const text = assistantText(lang);
  const isFlat = useNavigator((s) => s.graphicsTier === 'none');
  const tour = useMemo(() => tourFor(lang, isFlat), [lang, isFlat]);
  const landed = useNavigator((s) => s.landed);
  const [isFirstVisit] = useState(() => !readFlag(SEEN_KEY));
  const [isOpen, setOpen] = useState(false);
  const [isGreeting, setGreeting] = useState(false);
  const [hasGreeted, setGreeted] = useState(() => !isFirstVisit);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setThinking] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [isPlaying, setPlaying] = useState(false);
  const [gameGuide, setGameGuide] = useState<{ selector: string | null; mood: BotMood }>({ selector: null, mood: 'talk' });
  const isGroundView = useNavigator((s) => s.isGroundView);
  const power = useNavigator((s) => s.power);
  const isCompanion3D = useNavigator((s) => s.isCompanion3D);
  const closeGame = useCallback(() => setPlaying(false), []);
  useEffect(() => {
    if (!isPlaying) return;
    useNavigator.getState().markTip('mission');
    track('mission-start');
  }, [isPlaying]);
  const nextId = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);
  const [isHopping, setHopping] = useState(false);
  const endTourText = useRef<() => void>(() => undefined);
  const onTourEnd = useCallback(() => endTourText.current(), []);
  const director = useTourDirector(tour, onTourEnd);
  const { step, beat } = director;

  // LUNA flies in once the camera has landed; on a first visit she then says hello.
  useEffect(() => {
    if (!landed || !isFirstVisit) return;
    const id = window.setTimeout(() => {
      setGreeting(true);
      setGreeted(true);
    }, GREET_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [landed, isFirstVisit]);

  // Tell the surface scene the tour is running, and let 3D LUNA say the line while you are down there.
  const isTourRunning = director.isActive;

  // While LUNA says hello or runs her tour, other first-run hints wait, so they never talk over her.
  const isLunaBusy = isGreeting || isTourRunning || (landed && !hasGreeted);
  useEffect(() => {
    useNavigator.getState().setLunaBusy(isLunaBusy);
  }, [isLunaBusy]);
  const line = isGroundView && beat ? beat.say : null;
  const linePoint = beat?.point ?? null;
  useEffect(() => {
    const store = useNavigator.getState();
    store.setTouring(isTourRunning);
    if (isTourRunning) store.setGroundSpeech(line ? { text: line, point: linePoint } : null);
  }, [isTourRunning, line, linePoint]);

  // A new answer is read from its start: the question and the first lines of the reply come into
  // view, never the end of a long reply with its beginning scrolled away above.
  const shownCount = useRef(0);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const items = [...list.querySelectorAll<HTMLElement>('.luna-msg')];
    const seen = shownCount.current <= items.length ? shownCount.current : 0;
    shownCount.current = items.length;
    const last = items.at(-1);
    const bottom = list.scrollHeight - list.clientHeight;
    if (!last || isThinking || !last.classList.contains('luna-msg--luna')) {
      list.scrollTo({ top: bottom, behavior: 'smooth' });
      return;
    }
    // The reader starts at the first of the newly arrived replies, with the question just above it.
    const firstNew = items[seen] ?? last;
    const before = items[items.indexOf(firstNew) - 1];
    const anchor = before?.classList.contains('luna-msg--user') ? before : firstNew;
    const top = list.scrollTop + anchor.getBoundingClientRect().top - list.getBoundingClientRect().top - ANSWER_TOP_GAP_PX;
    list.scrollTo({ top: Math.min(Math.max(0, top), bottom), behavior: 'smooth' });
  }, [messages, isThinking]);

  // A new language starts a fresh conversation in that language.
  const firstLang = useRef(lang);
  useEffect(() => {
    if (lang === firstLang.current) return;
    firstLang.current = lang;
    setMessages([{ id: nextId.current++, from: 'luna', lines: [assistantText(lang).switched] }]);
  }, [lang]);

  const say = (from: Message['from'], lines: string[], picks?: RankedSite[], best?: BestPick[]) => {
    setMessages((m) => [...m, { id: nextId.current++, from, lines, picks, best }]);
  };

  const acceptGreeting = () => {
    useNavigator.getState().markTip('luna');
    setGreeting(false);
    setOpen(true);
    director.start();
  };

  const declineGreeting = () => {
    setGreeting(false);
    writeFlag(SEEN_KEY, true);
  };

  useEffect(() => {
    endTourText.current = () => {
      writeFlag(SEEN_KEY, true);
      setMessages((m) => [...m, { id: nextId.current++, from: 'luna', lines: [text.tourDone], offersGame: true }]);
    };
  });

  const hop = () => {
    setHopping(true);
    window.setTimeout(() => setHopping(false), HOP_MS);
  };

  const rank = async (goal: RankGoal, label: string, artemisOnly: boolean) => {
    say('user', [label]);
    setThinking(true);
    try {
      const pool = uniquePlaces(SITES.filter((s) => (artemisOnly ? s.group === 'Artemis' : s.group !== 'Apollo')));
      const ranked = await rankSitesAsync(pool, terrain, windowStart, goal, WINDOW_MS, RANK_STEP_MS);
      say('luna', [describeRanking(goal, ranked, lang)], ranked.slice(0, 3));
    } catch {
      say('luna', [text.error]);
    } finally {
      setThinking(false);
    }
  };

  const findBest = async () => {
    say('user', [text.best]);
    setThinking(true);
    try {
      const map = await getLightMap(polarRhoMax);
      const found = await findBestSites(map, terrain, analysis.dsn);
      const best = found.map((b, i) => ({ site: { id: null, name: `${text.candidate} ${i + 1}`, lat: b.lat, lon: b.lon }, score: b.score.total }));
      say('luna', [best.length > 0 ? text.bestIntro : text.bestNone], undefined, best);
    } catch {
      say('luna', [text.error]);
    } finally {
      setThinking(false);
    }
  };

  const addToCompare = (picks: { site: SelectedSite }[]) => {
    for (const p of picks) {
      const already = useNavigator.getState().compare.some((c) => c.lat === p.site.lat && c.lon === p.site.lon);
      if (!already && useNavigator.getState().compare.length < MAX_COMPARE) toggleCompare(p.site);
    }
  };

  const hidesSiteList = isOpen && (isPlaying || (director.isActive && !director.beat?.panelRight));
  useEffect(() => {
    document.body.classList.toggle(LEFT_PANEL_CLASS, hidesSiteList);
    return () => document.body.classList.remove(LEFT_PANEL_CLASS);
  }, [hidesSiteList]);

  const closePanel = () => {
    if (director.isActive) director.finish();
    setPlaying(false);
    setOpen(false);
  };

  const lastLunaId = [...messages].reverse().find((m) => m.from === 'luna')?.id;
  const isGuiding = isOpen && (director.isActive || isPlaying);
  const fact = step && beat === step.beats[step.beats.length - 1] ? tourFact(step.key, analysis, score, power, lang) : null;
  const panelClass = step || isPlaying ? 'panel luna-panel is-tour' : 'panel luna-panel';
  const isOnLeft = isPlaying || (director.isActive && !beat?.panelRight);
  const isOutOfSight = (isGroundView || isCompanion3D) && !isGuiding;
  // On a phone her panel sits over the Moon while the part below is shown, and below while the Moon is.
  const isShowingStage = director.isActive && (!beat?.spot || STAGE_SPOT.test(beat.spot));
  const rootClass = ['luna', isShowingStage && 'is-over-sheet', landed && 'is-arrived', director.isActive && 'is-touring', isOnLeft && 'is-left', isOutOfSight && 'is-hidden'].filter(Boolean).join(' ');

  return createPortal(
    <div className={rootClass} data-open={isOpen}>
      {isGuiding && (
        <TourGuide
          selector={isPlaying ? gameGuide.selector : beat?.spot ?? null}
          isSoft={isPlaying}
          isPressing={director.isPressing}
          mood={isHopping ? 'happy' : isPlaying ? gameGuide.mood : director.isPaused ? 'idle' : 'talk'}
          onBotClick={() => {
            hop();
            if (director.isActive) director.togglePause();
          }}
        />
      )}
      {isGreeting && !isOpen && (
        <section className="panel luna-greet" role="dialog" aria-label={text.greetTitle}>
          <h3>{text.greetTitle}</h3>
          <Typewriter key={lang} lines={[text.greetBody]} isLive />
          <div className="luna-tour-nav">
            <button type="button" className="ghost-button" onClick={declineGreeting}>{text.greetNo}</button>
            <button type="button" className="primary-button" onClick={acceptGreeting}>{text.greetYes}</button>
          </div>
        </section>
      )}
      {isOpen && (
        <section className={panelClass} aria-label="LUNA">
          <header className="luna-head-row">
            <span className="luna-head-bot"><LunaBot mood={isThinking ? 'think' : step ? 'talk' : 'idle'} /></span>
            <div>
              <strong>LUNA</strong>
              <span className="muted"> · {text.role}</span>
            </div>
            <button type="button" className="icon-button" aria-label="×" onClick={closePanel}>
              ×
            </button>
          </header>

          {step ? (
            <div className="luna-tour">
              <h3>{step.title}</h3>
              {beat && !isGroundView && <Typewriter key={`${director.beatKey}-${lang}`} lines={[beat.say]} isLive />}
              {fact && <p className="luna-fact">{fact}</p>}
              {beat && (
                <div className="tour-progress" key={director.beatKey}>
                  <span className={director.isPaused ? 'is-paused' : undefined} style={{ animationDuration: `${beatMs(beat)}ms` }} />
                </div>
              )}
              <div className="luna-tour-nav">
                <span className="muted">{director.stepIndex + 1} / {tour.length}</span>
                <button type="button" className="ghost-button" onClick={director.togglePause}>{director.isPaused ? text.resume : text.pause}</button>
                <button type="button" className="ghost-button" onClick={director.nextStep}>{text.next}</button>
                <button type="button" className="ghost-button" onClick={director.finish}>{text.skip}</button>
              </div>
            </div>
          ) : isPlaying ? (
            <MissionGame analysis={analysis} score={score} terrain={terrain} onGuide={setGameGuide} onClose={closeGame} />
          ) : (
            <>
              {!showMore && <div className="luna-messages" ref={listRef}>
                {messages.length === 0 && <p className="muted">{text.empty}</p>}
                {messages.map((m) => (
                  <div key={m.id} className={`luna-msg luna-msg--${m.from}`}>
                    {m.from === 'luna' ? <Typewriter lines={m.lines} isLive={m.id === lastLunaId} /> : m.lines.map((l, i) => <p key={i}>{l}</p>)}
                    {m.offersGame && (
                      <button type="button" className="primary-button luna-offer" onClick={() => setPlaying(true)}>{text.startMission}</button>
                    )}
                    {m.best && m.best.length > 0 && (
                      <>
                        <ol className="luna-picks">
                          {m.best.map((p) => (
                            <li key={p.site.name}>
                              <span>{p.site.name} <small className="muted">{formatLatLon(p.site.lat, p.site.lon)}</small></span>
                              <span className="mono">{p.score}/100</span>
                              <button type="button" className="link-button" onClick={() => selectSite(p.site)}>{text.fly}</button>
                            </li>
                          ))}
                        </ol>
                        <button type="button" className="link-button luna-add" disabled={compare.length >= MAX_COMPARE} onClick={() => addToCompare(m.best!.slice(0, 3))}>
                          {text.addCompare}
                        </button>
                      </>
                    )}
                    {m.picks && (
                      <>
                        <ol className="luna-picks">
                          {m.picks.map((p) => (
                            <li key={p.site.name}>
                              <span>{siteLabel(p.site, lang)}</span>
                              <span className="mono">{formatPercent(p.score)}</span>
                              <button type="button" className="link-button" onClick={() => selectSite(p.site)}>{text.fly}</button>
                            </li>
                          ))}
                        </ol>
                        <button type="button" className="link-button luna-add" disabled={compare.length >= MAX_COMPARE} onClick={() => addToCompare(m.picks!)}>
                          {text.addCompare}
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {isThinking && <p className="muted luna-thinking">{text.thinking}</p>}
              </div>}
              {/* The four questions people ask most stay in view; the rest open on demand. */}
              <div className={showMore ? 'luna-chips is-open' : 'luna-chips'} onClick={(e) => { if (!(e.target as HTMLElement).closest('.luna-chips__more')) setShowMore(false); }}>
                <button type="button" onClick={() => { say('user', [text.explain]); say('luna', explainSite(siteLabel(site, lang), analysis, lang, score)); }}>{text.explain}</button>
                <button type="button" disabled={isThinking} onClick={() => void findBest()}>{text.best}</button>
                <button type="button" className="luna-chips__game" data-tour="game-chip" onClick={() => setPlaying(true)}>{text.game}</button>
                <button type="button" onClick={() => director.start()}>{text.tour}</button>
                {showMore && (
                  <>
                    <button type="button" onClick={() => { setOpen(false); useNavigator.getState().visitLanding('apollo11'); }}>{text.timeMachine}</button>
                    <button type="button" onClick={() => useNavigator.getState().setValidationOpen(true)}>{text.accuracy}</button>
                    <button type="button" onClick={() => { say('user', [text.moonVsEarth]); say('luna', moonVsEarth(analysis, lang)); }}>{text.moonVsEarth}</button>
                    <button type="button" disabled={isThinking} onClick={() => void rank('both', text.artemis, true)}>{text.artemis}</button>
                    {(['power', 'comms', 'both'] as const).map((g) => (
                      <button key={g} type="button" disabled={isThinking} onClick={() => void rank(g, text.goals[g], false)}>{text.goals[g]}</button>
                    ))}
                    <button type="button" onClick={() => { say('user', [text.howTo]); say('luna', [...text.howToLines]); }}>{text.howTo}</button>
                    <button type="button" onClick={() => { say('user', [text.about]); say('luna', [...text.aboutLines]); }}>{text.about}</button>
                  </>
                )}
                <button type="button" className="luna-chips__more" aria-expanded={showMore} onClick={() => setShowMore(!showMore)}>
                  {showMore ? text.less : text.more}
                </button>
              </div>
            </>
          )}
        </section>
      )}
      {!isGuiding && (
        <button type="button" className={isGreeting ? 'luna-launcher is-waving' : 'luna-launcher'} aria-label="LUNA" onClick={() => {
          useNavigator.getState().markTip('luna');
          hop();
          if (isGreeting) acceptGreeting();
          else setOpen(!isOpen);
        }}>
          <LunaBot mood={isHopping ? 'happy' : isGreeting ? 'wave' : isThinking ? 'think' : 'idle'} />
        </button>
      )}
    </div>,
    document.body,
  );
}
