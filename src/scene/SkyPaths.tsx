import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, Color, LineBasicMaterial, LineDashedMaterial, LineLoop, LineSegments, Vector3 } from 'three';
import { MOON_RADIUS_KM, moonSky } from '../lib/ephemeris';
import { DAY_MS, HOUR_MS } from '../lib/format';
import { computeHorizon, type HorizonProfile } from '../lib/horizon';
import type { Terrain } from '../lib/terrain';
import type { Site } from '../lib/topocentric';
import { normalize } from '../lib/vec';
import { siteState } from '../lib/visibility';
import { useNavigator } from '../state/store';
import { toThree } from './coords';
import { eyePosition, localFrame } from './groundView';
import type { SkyState } from './sky';

interface SkyPathsProps {
  lat: number;
  lon: number;
  terrain: Terrain;
  sky: SkyState;
}

/** Paths are drawn on a sphere this far from the eye (Moon radii): beyond any terrain, inside the far plane. */
const SKY_R = 40;
const SPAN_MS = 29.53 * DAY_MS;
const UP = 0.5;
const SUN_COLOR = new Color('#ffb547');
const EARTH_COLOR = new Color('#7db4ff');
/** Angular radius of the "you are here" ring around each body, radians. */
const RING_RAD = { sun: 0.03, earth: 0.04 } as const;
const RING_POINTS = 48;

type Body = 'sun' | 'earth';

function directionOf(body: Body, time: number, eye: Vector3): Vector3 {
  const s = moonSky(new Date(time));
  if (body === 'sun') return toThree(normalize(s.sun));
  return toThree(s.earth).multiplyScalar(1 / MOON_RADIUS_KM).sub(eye).normalize();
}

/** One lunar month of a body's path across the sky, split into what is in view and what is hidden. */
function samplePath(body: Body, site: Site, profile: HorizonProfile, eye: Vector3, start: number) {
  const solid: number[] = [];
  const dashed: number[] = [];
  let prev: { p: Vector3; up: boolean } | null = null;
  for (let t = start; t <= start + SPAN_MS; t += HOUR_MS) {
    const p = eye.clone().addScaledVector(directionOf(body, t, eye), SKY_R);
    const up = siteState(site, profile, t)[body].visibleFraction >= UP;
    if (prev) (prev.up && up ? solid : dashed).push(prev.p.x, prev.p.y, prev.p.z, p.x, p.y, p.z);
    prev = { p, up };
  }
  return { solid: new Float32Array(solid), dashed: new Float32Array(dashed) };
}

function segments(points: Float32Array, color: Color, isDashed: boolean): LineSegments {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(points, 3));
  const common = { color, transparent: true, depthTest: false, depthWrite: false, toneMapped: false };
  const material = isDashed
    ? new LineDashedMaterial({ ...common, dashSize: 0.22, gapSize: 0.18, opacity: 0.75 })
    : new LineBasicMaterial({ ...common, opacity: 0.95 });
  const line = new LineSegments(geometry, material);
  if (isDashed) line.computeLineDistances();
  line.renderOrder = 10;
  line.frustumCulled = false;
  return line;
}

function ring(color: Color, isDashed: boolean): LineLoop {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(RING_POINTS * 3), 3));
  const common = { color, transparent: true, depthTest: false, depthWrite: false, toneMapped: false };
  const material = isDashed ? new LineDashedMaterial({ ...common, dashSize: 0.08, gapSize: 0.07 }) : new LineBasicMaterial(common);
  const loop = new LineLoop(geometry, material);
  loop.renderOrder = 11;
  loop.frustumCulled = false;
  return loop;
}

/** Moves a ring to circle `dir` as seen from the eye. */
function placeRing(loop: LineLoop, eye: Vector3, dir: Vector3, radius: number) {
  const { north, east } = localFrame(dir);
  const attr = loop.geometry.getAttribute('position') as BufferAttribute;
  for (let i = 0; i < RING_POINTS; i++) {
    const a = (2 * Math.PI * i) / RING_POINTS;
    const p = dir.clone().addScaledVector(north, Math.cos(a) * radius).addScaledVector(east, Math.sin(a) * radius).normalize();
    attr.setXYZ(i, eye.x + p.x * SKY_R, eye.y + p.y * SKY_R, eye.z + p.z * SKY_R);
  }
  attr.needsUpdate = true;
  loop.geometry.computeBoundingSphere();
  if (loop.material instanceof LineDashedMaterial) loop.computeLineDistances();
}

/**
 * Standing at the site: where the Sun and the Earth travel over the next lunar month, solid while
 * in view and dashed while behind the terrain, with a ring on each body now (dashed when hidden).
 */
export function SkyPaths({ lat, lon, terrain, sky }: SkyPathsProps) {
  const time = useNavigator((s) => s.time);
  const day = Math.floor(time / DAY_MS) * DAY_MS;
  const { site, profile, eye } = useMemo(() => {
    const profile = computeHorizon(terrain, lat, lon);
    return { profile, site: { lat, lon, heightM: profile.siteHeightM }, eye: eyePosition(terrain, lat, lon, 1) };
  }, [terrain, lat, lon]);

  const lines = useMemo(() => {
    const sun = samplePath('sun', site, profile, eye, day);
    const earth = samplePath('earth', site, profile, eye, day);
    return [
      segments(sun.solid, SUN_COLOR, false),
      segments(sun.dashed, SUN_COLOR, true),
      segments(earth.solid, EARTH_COLOR, false),
      segments(earth.dashed, EARTH_COLOR, true),
    ];
  }, [site, profile, eye, day]);

  const rings = useMemo(
    () => ({
      sun: { solid: ring(SUN_COLOR, false), dashed: ring(SUN_COLOR, true) },
      earth: { solid: ring(EARTH_COLOR, false), dashed: ring(EARTH_COLOR, true) },
    }),
    [],
  );

  useEffect(
    () => () => {
      for (const l of lines) {
        l.geometry.dispose();
        (l.material as LineBasicMaterial).dispose();
      }
    },
    [lines],
  );
  useEffect(
    () => () => {
      for (const r of [rings.sun.solid, rings.sun.dashed, rings.earth.solid, rings.earth.dashed]) {
        r.geometry.dispose();
        (r.material as LineBasicMaterial).dispose();
      }
    },
    [rings],
  );

  // Rings follow the clock; their style (solid or dashed) follows whether the body is in view.
  const shownAt = useRef(Number.NaN);
  useFrame(() => {
    if (sky.time === shownAt.current) return;
    shownAt.current = sky.time;
    const state = siteState(site, profile, sky.time);
    for (const body of ['sun', 'earth'] as const) {
      const dir = body === 'sun' ? sky.sunDir.clone() : sky.earthPos.clone().sub(eye).normalize();
      const up = state[body].visibleFraction >= UP;
      const { solid, dashed } = rings[body];
      placeRing(up ? solid : dashed, eye, dir, RING_RAD[body]);
      solid.visible = up;
      dashed.visible = !up;
    }
  });

  return (
    <group>
      {lines.map((l) => <primitive key={l.uuid} object={l} />)}
      {Object.values(rings).flatMap((r) => [r.solid, r.dashed]).map((r) => <primitive key={r.uuid} object={r} />)}
    </group>
  );
}
