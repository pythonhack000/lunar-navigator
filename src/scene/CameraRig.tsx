import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { MathUtils, PerspectiveCamera, Raycaster, Sphere, Vector2, Vector3 } from 'three';
import { MOON_RADIUS_KM } from '../lib/ephemeris';
import type { Terrain } from '../lib/terrain';
import { useNavigator } from '../state/store';
import { unitToLatLon } from '../lib/vec';
import { fromThree } from './coords';
import {
  approach,
  clonePose,
  easeInOutCubic,
  flightPose,
  flightSeconds,
  minRangeAt,
  moveTarget,
  poseToCamera,
  GLOBE_RANGE,
  rotateHeading,
  sitePose,
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
  /** Changes on every fly request (see the store), so repeating a request still flies. */
  flyNonce: number;
  terrain: Terrain;
  relief: number;
  /** Updated every frame with what the camera looks at. */
  focus: CameraFocus;
  /** Latitude south of which the detailed polar terrain allows zooming right down. */
  polarEdgeLat: number;
  /** Edge of the medium-detail ring, if there is one. */
  outerEdgeLat?: number;
  /** Called when the Moon is clicked (a quick press without dragging). */
  onPick: (lat: number, lon: number) => void;
  /** Stay on the opening globe view (the intro flight is still on screen) instead of flying in. */
  hold: boolean;
}

const MOON_RADIUS_M = MOON_RADIUS_KM * 1000;
const DAMPING = 6;
/** The descent that follows the opening flight is the last shot of the intro, so it takes its time. */
const OPENING_DESCENT_S = 3.4;
const ORBIT_RAD_PER_PX = 0.005;
const WHEEL_ZOOM = 0.0015;
/** Keep the lens at least this far above the local terrain. */
const CLEARANCE_M = 600;
/** A press counts as a click, not a drag, if it moves less than this and is released quickly. */
const CLICK_MAX_MOVE_PX = 5;
const CLICK_MAX_MS = 450;
/** Relative altitude change worth re-rendering the HUD for. */
const ALTITUDE_REPORT_STEP = 0.02;
const MOON_SPHERE = new Sphere(new Vector3(), 1);

/** Radius of the drawn ground under `v`, including the visual relief exaggeration. */
const heightRadius = (terrain: Terrain, v: Vector3, relief: number): number => {
  const { lat, lon } = unitToLatLon(fromThree(v));
  return 1 + (terrain.heightAt(lat, lon) * relief) / MOON_RADIUS_M;
};

/**
 * Google-Earth-style navigation: drag to slide the ground, right-drag or shift-drag to turn and
 * tilt, wheel or pinch to zoom. On touch: one finger slides, two fingers pinch and tilt.
 */
export function CameraRig({ lat, lon, sunDir, isGlobeView, flyNonce, terrain, relief, focus, polarEdgeLat, outerEdgeLat, onPick, hold }: CameraRigProps) {
  // Detail stops a little inside the cap edge, so allow full zoom only once well within it.
  const polarCutY = Math.sin(((polarEdgeLat + 0.5) * Math.PI) / 180);
  const outerCutY = Math.sin((((outerEdgeLat ?? polarEdgeLat) + 0.5) * Math.PI) / 180);
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
    if (hold) return;
    const from = clonePose(current.current);
    const to = isGlobeView ? withRange(current.current, GLOBE_RANGE) : sitePose(lat, lon, sunRef.current);
    const isOpening = !useNavigator.getState().landed;
    flight.current = { from, to, t: 0, seconds: isOpening ? Math.max(OPENING_DESCENT_S, flightSeconds(from, to)) : flightSeconds(from, to) };
    goal.current = to;
  }, [lat, lon, isGlobeView, flyNonce, hold]);

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
      useNavigator.getState().setLanded();
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
        if (pinch > 0 && now > 0) goal.current = withRange(goal.current, goal.current.range * (pinch / now), minRangeAt(goal.current.target, polarCutY, outerCutY));
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
      goal.current = withRange(goal.current, goal.current.range * Math.exp(e.deltaY * WHEEL_ZOOM), minRangeAt(goal.current.target, polarCutY, outerCutY));
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
  }, [gl, camera, polarCutY, outerCutY]);

  useFrame((_, delta) => {
    const f = flight.current;
    if (f) {
      f.t = Math.min(1, f.t + delta / f.seconds);
      current.current = flightPose(f.from, f.to, easeInOutCubic(f.t));
      if (f.t >= 1) {
        flight.current = null;
        useNavigator.getState().setLanded();
      }
    } else {
      // Sliding out of the polar cap while zoomed in eases back up to the closest sharp view.
      const minRange = minRangeAt(goal.current.target, polarCutY, outerCutY);
      if (goal.current.range < minRange) goal.current = withRange(goal.current, minRange, minRange);
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

    // Report the altitude for the HUD only when it changes noticeably.
    const altitudeKm = (position.length() - heightRadius(terrain, position, 1)) * MOON_RADIUS_KM;
    const { cameraAltitudeKm, setCameraAltitude } = useNavigator.getState();
    if (Math.abs(altitudeKm - cameraAltitudeKm) > Math.max(0.5, cameraAltitudeKm * ALTITUDE_REPORT_STEP)) {
      setCameraAltitude(altitudeKm);
    }
  });

  return null;
}
