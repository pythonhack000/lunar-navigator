import { useEffect, useMemo, useState } from 'react';
import { SITES, uniquePlaces, type NamedSite } from '../data/sites';
import { WINDOW_MS, windowStartFor, type SiteAnalysis } from '../hooks/useSiteAnalysis';
import type { SiteScoreView } from '../hooks/useSiteScore';
import { siteLabel } from '../i18n';
import { DAY_MS, formatHours, formatPercent, HOUR_MS } from '../lib/format';
import { computeHorizon } from '../lib/horizon';
import { dateCandidates, freeStars, freeThreshold, MAX_STARS, MISSION_COUNT, rankFor, starsFor, STARS_PER_MISSION, winners, type MissionKind } from '../lib/missionGame';
import { analyzePeriod } from '../lib/periodReport';
import { SLOPE_MAX_DEG } from '../lib/siteScore';
import { slopeDeg } from '../lib/slope';
import type { Terrain } from '../lib/terrain';
import { sampleTimeline } from '../lib/visibility';
import { useNavigator } from '../state/store';
import { FREE_HINT_ACTIONS, gameText, MISSIONS, RIGHT_WHY } from './gameScript';
import type { BotMood } from './LunaBot';

type Props = {
  analysis: SiteAnalysis;
  score: SiteScoreView;
  terrain: Terrain;
  onGuide: (guide: { selector: string | null; mood: BotMood }) => void;
  onClose: () => void;
};

type Phase = 'brief' | 'scout' | 'why' | 'lesson' | 'done';

interface Candidate {
  site: NamedSite;
  at: number | null;
}

const siteById = (id: string): NamedSite => SITES.find((s) => s.id === id)!;
/** The clock only needs to be near the candidate's date: the panels update on the hour. */
const SAME_TIME_MS = HOUR_MS;
const SOUTH_POOL_LAT = -60;
/** Long enough to hold a whole lunar day after the next sunrise. */
const DATE_SEARCH_MS = 45 * DAY_MS;

function liveReading(kind: MissionKind, a: SiteAnalysis): number {
  if (kind === 'power') return a.summary.sunlitShare;
  if (kind === 'comms') return a.summary.earthShare;
  if (kind === 'night') return a.summary.longestDarkHours;
  if (a.state.sun.visibleFraction < 0.5) return 0;
  return ((a.nextSunChange ?? a.state.time + WINDOW_MS) - a.state.time) / HOUR_MS;
}

interface FreeTarget {
  share: number;
  /** The place LUNA offers when the player is stuck. */
  rescue: NamedSite | null;
}

/** The real places within reach this month set how hard the open search is. */
function freeTarget(terrain: Terrain, time: number): FreeTarget {
  const start = windowStartFor(time);
  const rows = uniquePlaces(SITES)
    .filter((s) => s.lat < SOUTH_POOL_LAT && slopeDeg(terrain, s.lat, s.lon) <= SLOPE_MAX_DEG)
    .map((site) => ({ site, share: analyzePeriod(site, computeHorizon(terrain, site.lat, site.lon), { start, spanMs: WINDOW_MS }).powerLinkShare }));
  const best = rows.reduce<(typeof rows)[number] | null>((top, row) => (!top || row.share > top.share ? row : top), null);
  return { share: freeThreshold(rows.map((r) => r.share)), rescue: best?.site ?? null };
}

/** A stable shuffle of the "why" answers, so the right one is not always first. */
const whyOrder = (mission: number): readonly number[] => [[1, 0, 2], [0, 2, 1], [2, 1, 0], [1, 2, 0]][mission % 4];

/** Mission commander: scout, write down, compare, choose, explain. */
export function MissionGame({ analysis, score, terrain, onGuide, onClose }: Props) {
  const lang = useNavigator((s) => s.lang);
  const isDetailed = useNavigator((s) => s.isTerrainDetailed);
  const { selectSite, setTime, setPlaying } = useNavigator.getState();
  const text = gameText(lang);
  const [start] = useState(() => {
    const s = useNavigator.getState();
    return { site: s.site, time: s.time, layer: s.layer };
  });
  const [missionIndex, setMissionIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('brief');
  const [readings, setReadings] = useState<(number | null)[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [whyPicked, setWhyPicked] = useState<number | null>(null);
  const [usedHint, setUsedHint] = useState(false);
  /** Stars per mission, so finishing a mission twice can never count twice. */
  const [earnedByMission, setEarnedByMission] = useState<readonly number[]>([]);
  const [freeTried, setFreeTried] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [isRescued, setRescued] = useState(false);
  const mission = MISSIONS[missionIndex];
  const stars = earnedByMission.reduce((sum, n) => sum + (n ?? 0), 0);
  const earned = earnedByMission[missionIndex] ?? 0;
  const words = text.missions[missionIndex];
  const locale = lang === 'ru' ? 'ru-RU' : 'en-GB';

  const candidates = useMemo<Candidate[]>(() => {
    if (mission.kind === 'free') return [];
    if (mission.kind !== 'dates') return mission.siteIds.map((id) => ({ site: siteById(id), at: null }));
    const site = siteById(mission.siteIds[0]);
    const profile = computeHorizon(terrain, site.lat, site.lon);
    const windowStart = windowStartFor(start.time);
    const timeline = sampleTimeline({ lat: site.lat, lon: site.lon, heightM: profile.siteHeightM }, profile, windowStart, DATE_SEARCH_MS, HOUR_MS);
    return dateCandidates(timeline.sun, windowStart, HOUR_MS).map((at) => ({ site, at }));
  }, [mission, terrain, start.time]);

  const target = useMemo<FreeTarget>(() => (mission.kind === 'free' ? freeTarget(terrain, start.time) : { share: 0, rescue: null }), [mission.kind, terrain, start.time]);

  const isAt = (c: Candidate) =>
    analysis.site.lat === c.site.lat && analysis.site.lon === c.site.lon && (c.at === null || Math.abs(analysis.state.time - c.at) < SAME_TIME_MS);
  const allRead = candidates.length > 0 && candidates.every((_, i) => readings[i] !== null && readings[i] !== undefined);
  const best = allRead ? winners(readings as number[], mission.better) : [];
  const isScouting = phase === 'scout' && !allRead;
  // Compared as shown on screen: "50%" against "50%" must count as passing.
  const linkPasses = Math.round(analysis.powerLinkShare * 100) >= Math.round(target.share * 100);
  const slopePasses = score.slopeDeg <= SLOPE_MAX_DEG;
  const passes = linkPasses && slopePasses;

  // LUNA points at the part of the screen that holds the answer while the player is reading it.
  useEffect(() => {
    let mood: BotMood = isRescued ? 'happy' : 'talk';
    if (phase === 'lesson') mood = picked !== null && best.includes(picked) ? 'happy' : 'sad';
    if (phase === 'done') mood = 'happy';
    onGuide({ selector: isScouting || (phase === 'scout' && mission.kind === 'free') ? mission.spot : null, mood });
    // best is derived from readings and only matters at the lesson.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isScouting, mission.spot, mission.kind, picked, onGuide, isRescued]);

  // Leaving the game puts the visitor back where they were.
  useEffect(
    () => () => {
      const store = useNavigator.getState();
      store.selectSite(start.site);
      store.setTime(start.time);
      store.setLayer(start.layer);
    },
    [start],
  );

  const fly = (c: Candidate) => {
    setPlaying(false);
    selectSite({ id: c.site.id, name: c.site.name, lat: c.site.lat, lon: c.site.lon });
    setTime(c.at ?? start.time);
  };

  const record = (i: number) => {
    setReadings((r) => {
      const next = Array.from({ length: candidates.length }, (_, k) => r[k] ?? null);
      next[i] = liveReading(mission.kind, analysis);
      return next;
    });
  };

  const finishMission = (gained: number) => {
    setEarnedByMission((all) => all.map((n, i) => (i === missionIndex ? gained : n)).concat(all.length > missionIndex ? [] : [gained]));
    setPhase('lesson');
  };

  // Every mission starts from the same date, whatever the last one scouted.
  const resetMission = () => {
    setPhase('brief');
    setReadings([]);
    setPicked(null);
    setWhyPicked(null);
    setUsedHint(false);
    setFreeTried(false);
    setHintsUsed(0);
    setRescued(false);
    setTime(start.time);
  };

  const nextMission = () => {
    if (missionIndex + 1 >= MISSION_COUNT) {
      setPhase('done');
      return;
    }
    setMissionIndex(missionIndex + 1);
    resetMission();
  };

  const nextFreeHint = () => {
    const action = FREE_HINT_ACTIONS[hintsUsed];
    const store = useNavigator.getState();
    if (action === 'light-map') store.setLayer('light');
    if (action === 'polar-view') store.showPolarView();
    if (action === 'slope-map') store.setLayer('slope');
    setHintsUsed(hintsUsed + 1);
  };

  const rescue = () => {
    if (!target.rescue) return;
    const { id, name, lat, lon } = target.rescue;
    useNavigator.getState().setLayer('none');
    selectSite({ id, name, lat, lon });
    setRescued(true);
  };

  const restart = () => {
    setEarnedByMission([]);
    setMissionIndex(0);
    resetMission();
  };

  const show = (value: number): string => {
    if (mission.kind === 'night') return value > 0 ? formatHours(value, lang) : '0';
    if (mission.kind === 'dates') return value > 0 ? formatHours(value, lang) : text.night;
    return formatPercent(value);
  };
  const label = (c: Candidate): string =>
    c.at === null ? siteLabel(c.site, lang) : new Date(c.at).toLocaleDateString(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' });

  const header = (
    <header className="game-head">
      <span className="muted">{text.missionOf.replace('{n}', String(missionIndex + 1)).replace('{total}', String(MISSION_COUNT))}</span>
      <span className="game-stars" aria-label={`${stars} / ${MAX_STARS}`}>★ {stars}</span>
    </header>
  );

  const hintBlock = (
    <div className="game-hint">
      {usedHint ? <p>{words.hint}</p> : <button type="button" className="link-button" onClick={() => setUsedHint(true)}>{text.hint}</button>}
    </div>
  );

  if (phase === 'done') {
    const rank = rankFor(stars);
    return (
      <div className="game">
        <p className="game-rank-label muted">★ {stars} / {MAX_STARS}</p>
        <h3 className="game-rank">{text.ranks[rank]}</h3>
        <p>{text.rankLine[rank]}</p>
        <div className="luna-tour-nav">
          <button type="button" className="ghost-button" onClick={onClose}>{text.close}</button>
          <button type="button" className="primary-button" onClick={restart}>{text.again}</button>
        </div>
      </div>
    );
  }

  if (phase === 'brief') {
    return (
      <div className="game">
        {header}
        <h3>{words.title}</h3>
        <p>{words.story}</p>
        <p className="game-task">{words.lookAt}</p>
        <div className="luna-tour-nav">
          <button type="button" className="ghost-button" onClick={onClose}>{text.close}</button>
          <button type="button" className="primary-button" onClick={() => setPhase('scout')}>{text.start}</button>
        </div>
      </div>
    );
  }

  if (phase === 'lesson') {
    const isRight = mission.kind === 'free' || (picked !== null && best.includes(picked));
    const bestLabel = best.length > 0 ? label(candidates[best[0]]) : '';
    return (
      <div className="game">
        {header}
        <h3>{words.title}</h3>
        {mission.kind === 'free' ? <p className="game-verdict">{isRescued ? text.freeHelped : text.freeYes}</p> : (
          <p className="game-verdict">{isRight ? text.right : text.wrong.replace('{best}', bestLabel)}</p>
        )}
        <p>{words.lesson}</p>
        <p className="game-earned" aria-label={`${earned} / ${STARS_PER_MISSION}`}>{'★'.repeat(earned)}<span>{'★'.repeat(STARS_PER_MISSION - earned)}</span></p>
        <div className="luna-tour-nav">
          <button type="button" className="primary-button" onClick={nextMission}>{missionIndex + 1 >= MISSION_COUNT ? text.results : text.next}</button>
        </div>
      </div>
    );
  }

  if (phase === 'why' && words.why) {
    const why = words.why;
    return (
      <div className="game">
        {header}
        <h3>{why.question}</h3>
        <div className="game-options">
          {whyOrder(missionIndex).map((option) => (
            <button
              key={option}
              type="button"
              className={whyPicked === null ? 'ghost-button' : option === RIGHT_WHY ? 'ghost-button is-on' : 'ghost-button'}
              disabled={whyPicked !== null && option !== RIGHT_WHY}
              onClick={() => {
                if (whyPicked !== null) return;
                setWhyPicked(option);
              }}
            >
              {why.options[option]}
            </button>
          ))}
        </div>
        {whyPicked !== null && (
          <>
            <p className="game-verdict" role="status">{whyPicked === RIGHT_WHY ? text.whyRight : text.whyWrong}</p>
            <div className="luna-tour-nav">
              <button
                type="button"
                className="primary-button"
                onClick={() => finishMission(starsFor({ isRightPick: picked !== null && best.includes(picked), isRightWhy: whyPicked === RIGHT_WHY, usedHint }))}
              >
                {text.toLesson}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (mission.kind === 'free') {
    const canAskRescue = target.rescue !== null && !isRescued && (freeTried || hintsUsed > 0);
    return (
      <div className="game">
        {header}
        <h3>{words.title}</h3>
        <p className="game-task">{text.freeGoal}</p>
        <ul className="game-checks">
          <li className={linkPasses ? 'is-ok' : undefined}>
            <span aria-hidden="true">{linkPasses ? '✓' : '○'}</span>
            {text.freeLink.replace('{p}', formatPercent(target.share)).replace('{now}', formatPercent(analysis.powerLinkShare))}
          </li>
          <li className={slopePasses ? 'is-ok' : undefined}>
            <span aria-hidden="true">{slopePasses ? '✓' : '○'}</span>
            {text.freeSlope.replace('{s}', String(SLOPE_MAX_DEG)).replace('{now}', score.slopeDeg.toFixed(1))}
          </li>
        </ul>
        {hintsUsed > 0 && (
          <p className="game-hints">{text.freeHints[hintsUsed - 1]}</p>
        )}
        {isRescued && target.rescue && <p className="game-verdict">{text.rescued.replace('{name}', siteLabel(target.rescue, lang))}</p>}
        {freeTried && !passes && !isRescued && <p role="status">{text.freeNo}</p>}
        <div className="game-help">
          {hintsUsed < text.freeHints.length && !isRescued && (
            <button type="button" className="link-button" onClick={nextFreeHint}>{hintsUsed === 0 ? text.hint : text.moreHint}</button>
          )}
          {canAskRescue && <button type="button" className="link-button game-rescue" onClick={rescue}>{text.rescue}</button>}
        </div>
        <div className="luna-tour-nav">
          <button type="button" className="ghost-button" onClick={onClose}>{text.close}</button>
          <button
            type="button"
            className="primary-button"
            disabled={!isDetailed}
            onClick={() => {
              setFreeTried(true);
              if (passes) finishMission(freeStars(hintsUsed, isRescued));
            }}
          >
            {isDetailed ? text.check : text.refining}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="game">
      {header}
      <h3>{words.title}</h3>
      <p className="game-task">{allRead ? text.choose : text.goScout}</p>
      <table className="game-log">
        <caption className="visually-hidden">{text.journal}</caption>
        <thead>
          <tr><th scope="col">{text.journal}</th><th scope="col">{words.reading}</th></tr>
        </thead>
        <tbody>
          {candidates.map((c, i) => {
            const value = readings[i];
            const here = isAt(c);
            return (
              <tr key={`${c.site.id}-${c.at ?? ''}`} className={here && !allRead ? 'is-here' : undefined}>
                <th scope="row">
                  {allRead ? (
                    <button
                      type="button"
                      className="primary-button game-pick"
                      onClick={() => {
                        setPicked(i);
                        if (words.why) setPhase('why');
                      }}
                    >
                      {label(c)}
                    </button>
                  ) : label(c)}
                </th>
                <td>
                  {value !== null && value !== undefined ? <b className="mono">{show(value)}</b> : here ? (
                    <button type="button" className="primary-button game-action" disabled={!isDetailed} onClick={() => record(i)}>{isDetailed ? text.record : text.refining}</button>
                  ) : (
                    <button type="button" className="ghost-button game-action" onClick={() => fly(c)}>{text.fly} →</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!allRead && hintBlock}
      {!allRead && <p className="muted game-look">{words.lookAt}</p>}
    </div>
  );
}
