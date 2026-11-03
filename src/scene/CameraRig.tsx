import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { MathUtils, PerspectiveCamera, Raycaster, Sphere, Vector2, Vector3 } from 'three';
import { MOON_RADIUS_KM } from '../lib/ephemeris';
import type { Terrain } from '../lib/terrain';
import { unitToLatLon } from '../lib/vec';
import { fromThree, latLonToThree } from './coords';
import {
  approach,
  clonePose,
  easeInOutCubic,
  flightPose,
  flightSeconds,
  moveTarget,
  poseToCamera,
  rotateHeading,
  tangentAt,
  withRange,
  withTilt,
  type CameraFocus,
  type CameraPose,
} from './globeCamera';

interface CameraRigProps {
  lat: number;
  lon: number;
  sunDir: Vector3;
  isGlobeView: boolean;
  terrain: Terrain;
  relief: number;
  /** Updated every frame with what the camera looks at. */
  focus: CameraFocus;
  /** Called when the Moon is clicked (a quick press without dragging). */
  onPick: (lat: number, lon: number) => void;
}

const MOON_RADIUS_M = MOON_RADIUS_KM * 1000;
const GLOBE_RANGE = 2.4;
/** Arrival over a site: ~300 km out, tilted toward the Sun so shadows fall toward the viewer. */
const SITE_RANGE = 0.17;
const SITE_TILT = MathUtils.degToRad(62);
const DAMPING = 6;
const ORBIT_RAD_PER_PX = 0.005;
const WHEEL_ZOOM = 0.0015;
/** Keep the lens at least this far above the local terrain. */
const CLEARANCE_M = 600;
/** A press counts as a click, not a drag, if it moves less than this and is released quickly. */
const CLICK_MAX_MOVE_PX = 5;
const CLICK_MAX_MS = 450;
const MOON_SPHERE = new Sphere(new Vector3(), 1);

/** Radius of the drawn ground under `v`, including the visual relief exaggeration. */
const heightRadius = (terrain: Terrain, v: Vector3, relief: number): number => {
  const { lat, lon } = unitToLatLon(fromThree(v));
  return 1 + (terrain.heightAt(lat, lon) * relief) / MOON_RADIUS_M;
};

function sitePose(lat: number, lon: number, sunDir: Vector3): CameraPose {
  const target = latLonToThree(lat, lon).normalize();
  return { target, forward: tangentAt(target, sunDir), range: SITE_RANGE, tilt: SITE_TILT };
}

/**
 * Google-Earth-style navigation: drag to slide the ground, right-drag or shift-drag to turn and
 * tilt, wheel or pinch to zoom. On touch: one finger slides, two fingers pinch and tilt.
 */
export function CameraRig({ lat, lon, sunDir, isGlobeView, terrain, relief, focus, onPick }: CameraRigProps) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  // Start out at the whole globe, then fly in to the first site.
  const [initial] = useState(() => withRange(sitePose(lat, lon, sunDir), GLOBE_RANGE));
  const goal = useRef<CameraPose>(initial);
  const current = useRef<CameraPose>(clonePose(initial));
  const flight = useRef<{ from: CameraPose; to: CameraPose; t: number; seconds: number } | null>(null);
  const pickRef = useRef(onPick);
  // The Sun moves every tick; arrival heading reads it from a ref so the flight is not re-aimed constantly.
  const sunRef = useRef(sunDir);

  useEffect(() => {
    pickRef.current = onPick;
    sunRef.current = sunDir;
  }, [onPick, sunDir]);

  // Fly to the selected site, or out to the whole globe, along a smooth arc.
  useEffect(() => {
    const from = clonePose(current.current);
    const to = isGlobeView ? withRange(current.current, GLOBE_RANGE) : sitePose(lat, lon, sunRef.current);
    flight.current = { from, to, t: 0, seconds: flightSeconds(from, to) };
    goal.current = to;
  }, [lat, lon, isGlobeView]);

  useEffect(() => {
    const el = gl.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let orbiting = false;
    let pinch = 0;
    let press = { x: 0, y: 0, time: 0, travel: 0 };
    const raycaster = new Raycaster();

    const pickAt = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.ray.intersectSphere(MOON_SPHERE, new Vector3());
      if (!hit) return;
      const { lat: pLat, lon: pLon } = unitToLatLon(fromThree(hit));
      pickRef.current(pLat, pLon);
    };

    const groundRadiansPerPx = () => {
      const fov = camera instanceof PerspectiveCamera ? MathUtils.degToRad(camera.fov) : 0.7;
      return Math.min(2 * goal.current.range * Math.tan(fov / 2), 2.5) / Math.max(el.clientHeight, 1);
    };
    const spread = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    /** Any manual input takes over immediately from a flight in progress. */
    const takeOver = () => {
      if (!flight.current) return;
      flight.current = null;
      goal.current = clonePose(current.current);
    };

    const handleDown = (e: PointerEvent) => {
      takeOver();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Capture is a nicety (drags keep working off-canvas); navigation works without it.
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      orbiting = e.button === 2 || e.shiftKey || e.ctrlKey || e.altKey;
      if (pointers.size === 2) pinch = spread();
      if (pointers.size === 1) press = { x: e.clientX, y: e.clientY, time: performance.now(), travel: 0 };
    };

    const handleMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      press.travel += Math.hypot(dx, dy);
      if (pointers.size === 2) {
        const now = spread();
        if (pinch > 0 && now > 0) goal.current = withRange(goal.current, goal.current.range * (pinch / now));
        pinch = now;
        goal.current = withTilt(goal.current, goal.current.tilt - (dy / 2) * ORBIT_RAD_PER_PX);
        return;
      }
      if (orbiting) {
        goal.current = withTilt(rotateHeading(goal.current, -dx * ORBIT_RAD_PER_PX), goal.current.tilt - dy * ORBIT_RAD_PER_PX);
        return;
      }
      const a = groundRadiansPerPx();
      goal.current = moveTarget(goal.current, -dx * a, dy * a);
    };

    const handleUp = (e: PointerEvent) => {
      const wasSingle = pointers.size === 1 && pointers.has(e.pointerId);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
      const isClick =
        wasSingle && e.button === 0 && !orbiting && press.travel < CLICK_MAX_MOVE_PX && performance.now() - press.time < CLICK_MAX_MS;
      if (isClick) pickAt(e.clientX, e.clientY);
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      takeOver();
      goal.current = withRange(goal.current, goal.current.range * Math.exp(e.deltaY * WHEEL_ZOOM));
    };

    const preventMenu = (e: Event) => e.preventDefault();

    el.addEventListener('pointerdown', handleDown);
    el.addEventListener('pointermove', handleMove);
    el.addEventListener('pointerup', handleUp);
    el.addEventListener('pointercancel', handleUp);
    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('contextmenu', preventMenu);
    return () => {
      el.removeEventListener('pointerdown', handleDown);
      el.removeEventListener('pointermove', handleMove);
      el.removeEventListener('pointerup', handleUp);
      el.removeEventListener('pointercancel', handleUp);
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('contextmenu', preventMenu);
    };
  }, [gl, camera]);

  useFrame((_, delta) => {
    const f = flight.current;
    if (f) {
      f.t = Math.min(1, f.t + delta / f.seconds);
      current.current = flightPose(f.from, f.to, easeInOutCubic(f.t));
      if (f.t >= 1) flight.current = null;
    } else {
      current.current = approach(current.current, goal.current, 1 - Math.exp(-delta * DAMPING));
    }
    focus.target.copy(current.current.target);
    focus.range = current.current.range;
    const { position, up, lookAt } = poseToCamera(current.current, heightRadius(terrain, current.current.target, relief));

    // Do not let a low, tilted camera sink into a mountain it is looking past.
    const floor = heightRadius(terrain, position, relief) + CLEARANCE_M / MOON_RADIUS_M;
    if (position.length() < floor) position.setLength(floor);

    camera.position.copy(position);
    camera.up.copy(up);
    camera.lookAt(lookAt);
  });

  return null;
}
