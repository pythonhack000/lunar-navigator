import { useEffect, useRef, useState } from 'react';
import { SITES } from '../data/sites';
import { WINDOW_MS, type SiteAnalysis } from '../hooks/useSiteAnalysis';
import { formatPercent, HOUR_MS } from '../lib/format';
import { rankSitesAsync, type RankedSite, type RankGoal } from '../lib/ranking';
import type { Terrain } from '../lib/terrain';
import { siteLabel } from '../i18n';
import { MAX_COMPARE, useNavigator } from '../state/store';
import { assistantText, describeRanking, explainSite, tourFor } from './assistantScript';

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
const VOICE_KEY = 'luna-voice';
const HIGHLIGHT_CLASS = 'tour-highlight';
/** Ranking uses a coarser time step than the panels: plenty for comparing whole months. */
const RANK_STEP_MS = 3 * HOUR_MS;
const TYPE_MS_PER_CHAR = 14;

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

/** Natural-sounding female voices that ship with common systems, best first. */
const PREFERRED_VOICES = {
  en: ['Samantha', 'Ava', 'Allison', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Karen', 'Moira', 'Tessa', 'Serena', 'Victoria'],
  ru: ['Milena', 'Google русский', 'Microsoft Svetlana', 'Microsoft Irina', 'Katya', 'Alena'],
} as const;

function pickVoice(lang: 'en' | 'ru'): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang));
  for (const name of PREFERRED_VOICES[lang]) {
    const match = voices.find((v) => v.name.includes(name));
    if (match) return match;
  }
  return voices.find((v) => /female|enhanced|premium|natural/i.test(v.name)) ?? voices[0];
}

/** Reads text aloud with the browser's built-in speech synthesis (no server involved). */
function speak(text: string, lang: 'en' | 'ru') {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === 'ru' ? 'ru-RU' : 'en-US';
  const voice = pickVoice(lang);
  if (voice) u.voice = voice;
  // Close to natural speech: a robot-like pitch or speed sounds cheap.
  u.rate = 1;
  u.pitch = 1;
  window.speechSynthesis.speak(u);
}

function SpeakerIcon({ isOn }: { isOn: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="speaker-icon" aria-hidden="true">
      <path d="M3 8h3l4-3.5v11L6 12H3z" fill="currentColor" />
      {isOn ? (
        <path d="M13 7.5a3.5 3.5 0 0 1 0 5M15 5.5a6.5 6.5 0 0 1 0 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <path d="M13.5 8l4 4m0-4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
}

/** Types its text out letter by letter, like a terminal; click to show it all at once. */
function Typewriter({ lines, isLive }: { lines: string[]; isLive: boolean }) {
  const full = lines.join('\n');
  const [count, setCount] = useState(isLive ? 0 : full.length);
  useEffect(() => {
    if (count >= full.length) return;
    const id = window.setTimeout(() => setCount((c) => Math.min(full.length, c + 2)), TYPE_MS_PER_CHAR * 2);
    return () => window.clearTimeout(id);
  }, [count, full.length]);
  const shown = full.slice(0, count).split('\n');
  return (
    <div onClick={() => setCount(full.length)} className={count < full.length ? 'is-typing' : undefined}>
      {shown.map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </div>
  );
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
  const lang = useNavigator((s) => s.lang);
  const site = useNavigator((s) => s.site);
  const compare = useNavigator((s) => s.compare);
  const { selectSite, toggleCompare } = useNavigator.getState();
  const text = assistantText(lang);
  const tour = tourFor(lang);
  const [isOpen, setOpen] = useState(() => !readFlag(SEEN_KEY));
  const [tourStep, setTourStep] = useState<number | null>(() => (readFlag(SEEN_KEY) ? null : 0));
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setThinking] = useState(false);
  const [hasVoice, setVoice] = useState(() => readFlag(VOICE_KEY));
  const nextId = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);
  const step = tourStep === null ? null : tour[tourStep];

  // Spotlight the element the current tour step talks about, and read the step aloud.
  useEffect(() => {
    if (!step) return;
    if (hasVoice) speak(`${step.title}. ${step.body}`, lang);
    if (!step.target) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    el?.classList.add(HIGHLIGHT_CLASS);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return () => el?.classList.remove(HIGHLIGHT_CLASS);
  }, [step, hasVoice, lang]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isThinking]);

  // A new language starts a fresh conversation in that language.
  const firstLang = useRef(lang);
  useEffect(() => {
    if (lang === firstLang.current) return;
    firstLang.current = lang;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setMessages([{ id: nextId.current++, from: 'luna', lines: [assistantText(lang).switched] }]);
  }, [lang]);

  const say = (from: Message['from'], lines: string[], picks?: RankedSite[]) => {
    setMessages((m) => [...m, { id: nextId.current++, from, lines, picks }]);
    if (from === 'luna' && hasVoice) speak(lines.join(' '), lang);
  };

  const endTour = () => {
    writeFlag(SEEN_KEY, true);
    setTourStep(null);
    if (messages.length === 0) say('luna', [text.tourDone]);
  };

  const rank = async (goal: RankGoal, label: string, artemisOnly: boolean) => {
    say('user', [label]);
    setThinking(true);
    try {
      const pool = SITES.filter((s) => (artemisOnly ? s.group === 'Artemis III' : s.group !== 'Apollo'));
      const ranked = await rankSitesAsync(pool, terrain, windowStart, goal, WINDOW_MS, RANK_STEP_MS);
      say('luna', [describeRanking(goal, ranked, lang)], ranked.slice(0, 3));
    } catch {
      say('luna', [text.error]);
    } finally {
      setThinking(false);
    }
  };

  const addToCompare = (picks: RankedSite[]) => {
    for (const p of picks) {
      const already = useNavigator.getState().compare.some((c) => c.lat === p.site.lat && c.lon === p.site.lon);
      if (!already && useNavigator.getState().compare.length < MAX_COMPARE) toggleCompare(p.site);
    }
  };

  const toggleVoice = () => {
    const next = !hasVoice;
    setVoice(next);
    writeFlag(VOICE_KEY, next);
    if (!next && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  };

  const lastLunaId = [...messages].reverse().find((m) => m.from === 'luna')?.id;

  return (
    <div className="luna" data-open={isOpen}>
      {isOpen && (
        <section className="panel luna-panel" aria-label="LUNA">
          <header className="luna-head-row">
            <RobotAvatar isTalking={isThinking || step !== null} />
            <div>
              <strong>LUNA</strong>
              <span className="muted"> · {text.role}</span>
            </div>
            <button type="button" className={hasVoice ? 'icon-button is-on' : 'icon-button'} aria-pressed={hasVoice} aria-label={hasVoice ? text.voiceOn : text.voiceOff} title={hasVoice ? text.voiceOn : text.voiceOff} onClick={toggleVoice}>
              <SpeakerIcon isOn={hasVoice} />
            </button>
            <button type="button" className="icon-button" aria-label="×" onClick={() => setOpen(false)}>
              ×
            </button>
          </header>

          {step ? (
            <div className="luna-tour">
              <h3>{step.title}</h3>
              <Typewriter key={`${tourStep}-${lang}`} lines={[step.body]} isLive />
              <div className="luna-tour-nav">
                <span className="muted">{tourStep! + 1} / {tour.length}</span>
                <button type="button" className="ghost-button" onClick={endTour}>{text.skip}</button>
                <button type="button" className="primary-button" onClick={() => (tourStep! + 1 < tour.length ? setTourStep(tourStep! + 1) : endTour())}>
                  {tourStep! + 1 < tour.length ? text.next : text.done}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="luna-messages" ref={listRef}>
                {messages.length === 0 && <p className="muted">{text.empty}</p>}
                {messages.map((m) => (
                  <div key={m.id} className={`luna-msg luna-msg--${m.from}`}>
                    {m.from === 'luna' ? <Typewriter lines={m.lines} isLive={m.id === lastLunaId} /> : m.lines.map((l, i) => <p key={i}>{l}</p>)}
                    {m.picks && (
                      <>
                        <ol className="luna-picks">
                          {m.picks.map((p) => (
                            <li key={p.site.name}>
                              <span>{p.site.name}</span>
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
              </div>
              <div className="luna-chips">
                <button type="button" onClick={() => { say('user', [text.explain]); say('luna', explainSite(siteLabel(site, lang), analysis, lang)); }}>{text.explain}</button>
                <button type="button" disabled={isThinking} onClick={() => void rank('both', text.artemis, true)}>{text.artemis}</button>
                {(['power', 'comms', 'both'] as const).map((g) => (
                  <button key={g} type="button" disabled={isThinking} onClick={() => void rank(g, text.goals[g], false)}>{text.goals[g]}</button>
                ))}
                <button type="button" onClick={() => { say('user', [text.howTo]); say('luna', [...text.howToLines]); }}>{text.howTo}</button>
                <button type="button" onClick={() => { say('user', [text.about]); say('luna', [...text.aboutLines]); }}>{text.about}</button>
                <button type="button" onClick={() => setTourStep(0)}>{text.tour}</button>
              </div>
            </>
          )}
        </section>
      )}
      <button type="button" className="luna-launcher" aria-label="LUNA" onClick={() => setOpen(!isOpen)}>
        <RobotAvatar isTalking={isThinking} />
      </button>
    </div>
  );
}
