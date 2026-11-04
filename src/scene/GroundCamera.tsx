import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { MathUtils, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { MOON_RADIUS_KM } from '../lib/ephemeris';
import type { Terrain } from '../lib/terrain';
import { useNavigator } from '../state/store';
import type { CameraFocus } from './globeCamera';
import { latLonToThree } from './coords';
import { easeInOutCubic } from './globeCamera';
import { lookDirection, yawPitchOf } from './groundView';
import type { SkyState } from './sky';

interface GroundCameraProps {
  lat: number;
  lon: number;
  terrain: Terrain;
  sky: SkyState;
  focus: CameraFocus;
}

const MOON_RADIUS_M = MOON_RADIUS_KM * 1000;
/** Eye height above the highest ground near the site: a lander mast or a small hill, not a tall tower. */
const EYE_M = 80;
/** Sample spacing used to find that highest ground (the CPU grid is coarser than the drawn mesh). */
const CLEAR_SAMPLE_DEG = 0.004;
const ENTER_S = 3;
const LEAVE_S = 1.6;
/** Near plane on the ground, Moon radii (~35 m): close enough for the foreground, far enough for depth precision. */
const GROUND_NEAR = 2e-5;
/** Clipmap focus range while standing: the finest terrain levels around the site. */
const GROUND_FOCUS_RANGE = 0.003;
const LOOK_RAD_PER_PX = 0.0035;
const PITCH_MIN = -0.35;
const PITCH_MAX = 0.9;
const LOOK_DAMPING = 5;

type Mode = 'off' | 'entering' | 'on' | 'leaving';

function highestGroundM(terrain: Terrain, lat: number, lon: number): number {
  let best = -Infinity;
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++) best = Math.max(best, terrain.heightAt(lat + i * CLEAR_SAMPLE_DEG, lon + j * CLEAR_SAMPLE_DEG / Math.max(Math.cos((lat * Math.PI) / 180), 1e-3)));
  return best;
}

/**
 * "Stand at the site": takes the camera over from the orbit rig, glides down to the surface and
 * lets the viewer look around the real horizon (drag to turn). Leaving glides back to the rig's
 * view. It runs after CameraRig each frame, so it only overrides the camera while active.
 */
export function GroundCamera({ lat, lon, terrain, sky, focus }: GroundCameraProps) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const mode = useRef<Mode>('off');
  const t = useRef(0);
  const from = useRef({ position: new Vector3(), quaternion: new Quaternion() });
  const last = useRef({ position: new Vector3(), quaternion: new Quaternion() });
  const view = useRef({ yaw: 0, pitch: 0.05 });
  const goal = useRef({ yaw: 0, pitch: 0.05 });
  const groundLook = useNavigator((s) => s.groundLook);

  // Face the Sun on arrival, or whichever body was asked for.
  useEffect(() => {
    if (!groundLook) return;
    const up = latLonToThree(lat, lon).normalize();
    const dir = groundLook.body === 'sun' ? sky.sunDir : sky.earthDir;
    const { yaw, pitch } = yawPitchOf(up, dir);
    goal.current = { yaw: view.current.yaw + Math.atan2(Math.sin(yaw - view.current.yaw), Math.cos(yaw - view.current.yaw)), pitch: MathUtils.clamp(pitch, PITCH_MIN, PITCH_MAX) };
  }, [groundLook, lat, lon, sky]);

  useEffect(() => {
    const el = gl.domElement;
    let dragging: { x: number; y: number } | null = null;
    const active = () => useNavigator.getState().isGroundView;
    const down = (e: PointerEvent) => {
      if (active()) dragging = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (!dragging || !active()) return;
      goal.current = {
        yaw: goal.current.yaw - (e.clientX - dragging.x) * LOOK_RAD_PER_PX,
        pitch: MathUtils.clamp(goal.current.pitch + (e.clientY - dragging.y) * LOOK_RAD_PER_PX, PITCH_MIN, PITCH_MAX),
      };
      dragging = { x: e.clientX, y: e.clientY };
    };
    const up = () => {
      dragging = null;
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [gl]);

  useFrame((_, delta) => {
    const isGround = useNavigator.getState().isGroundView;
    if (mode.current === 'off' && !isGround) return;

    if (isGround && (mode.current === 'off' || mode.current === 'leaving')) {
      from.current.position.copy(camera.position);
      from.current.quaternion.copy(camera.quaternion);
      // Start by facing the Sun: the shot every visitor wants first.
      const { yaw, pitch } = yawPitchOf(latLonToThree(lat, lon).normalize(), sky.sunDir);
      view.current = { yaw, pitch: MathUtils.clamp(pitch, PITCH_MIN, PITCH_MAX) };
      goal.current = { ...view.current };
      mode.current = 'entering';
      t.current = 0;
    } else if (!isGround && (mode.current === 'on' || mode.current === 'entering')) {
      from.current.position.copy(last.current.position);
      from.current.quaternion.copy(last.current.quaternion);
      mode.current = 'leaving';
      t.current = 0;
    }

    const k = 1 - Math.exp(-delta * LOOK_DAMPING);
    view.current = { yaw: MathUtils.lerp(view.current.yaw, goal.current.yaw, k), pitch: MathUtils.lerp(view.current.pitch, goal.current.pitch, k) };

    // Where the eye stands and looks; while leaving, the target is the rig's own view this frame.
    const target = { position: new Vector3(), quaternion: new Quaternion() };
    if (mode.current === 'leaving') {
      target.position.copy(camera.position);
      target.quaternion.copy(camera.quaternion);
    } else {
      const upDir = latLonToThree(lat, lon).normalize();
      const relief = useNavigator.getState().relief;
      const radius = 1 + (highestGroundM(terrain, lat, lon) * relief + EYE_M) / MOON_RADIUS_M;
      target.position.copy(upDir).multiplyScalar(radius);
      const look = lookDirection(upDir, view.current.yaw, view.current.pitch);
      camera.position.copy(target.position);
      camera.up.copy(upDir);
      camera.lookAt(target.position.clone().add(look));
      target.quaternion.copy(camera.quaternion);
      focus.target.copy(upDir);
      focus.range = GROUND_FOCUS_RANGE;
    }

    const seconds = mode.current === 'leaving' ? LEAVE_S : ENTER_S;
    if (mode.current === 'entering' || mode.current === 'leaving') t.current = Math.min(1, t.current + delta / seconds);
    const e = mode.current === 'on' ? 1 : easeInOutCubic(t.current);
    // Altitude shrinks on a log scale so the descent neither crawls at the top nor rushes at the end.
    const r0 = from.current.position.length();
    const r1 = target.position.length();
    const dir = from.current.position.clone().normalize().lerp(target.position.clone().normalize(), e).normalize();
    camera.position.copy(dir.multiplyScalar(Math.exp(MathUtils.lerp(Math.log(r0), Math.log(r1), e))));
    camera.quaternion.copy(from.current.quaternion).slerp(target.quaternion, e);
    last.current.position.copy(camera.position);
    last.current.quaternion.copy(camera.quaternion);

    if (camera instanceof PerspectiveCamera) {
      const near = mode.current === 'leaving' ? camera.near : GROUND_NEAR + (1 - e) * 0.002;
      if (Math.abs(camera.near - near) / near > 0.02) {
        camera.near = near;
        camera.updateProjectionMatrix();
      }
    }
    if (t.current >= 1 && mode.current === 'entering') mode.current = 'on';
    if (t.current >= 1 && mode.current === 'leaving') mode.current = 'off';
  });

  return null;
}
