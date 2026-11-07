import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { GROUND_QUESTIONS, groundQuestionLabel } from '../ui/groundLines';
import { useNavigator } from '../state/store';
import { type Camera, CylinderGeometry, type DirectionalLight, type Group, MathUtils, type Mesh, MeshStandardMaterial, PerspectiveCamera, Quaternion, SphereGeometry, Vector3 } from 'three';
import { latLonToThree } from './coords';
import { groundBodies, toScreen, type BodyOnScreen } from './groundBodies';
import type { SkyState } from './sky';

type Props = {
  lat: number;
  lon: number;
  sky: SkyState;
  companion: CompanionState;
};

/** Shared with GroundCamera, which knows where she will wait and how far the descent has come. */
export interface CompanionState {
  /** Unit direction from the eye to LUNA once you are down. */
  dir: Vector3;
  /** The descent, 0..1; the climb back runs it down to 0. */
  progress: number;
  /** She is in the scene: from the start of the descent until the climb back ends. */
  isActive: boolean;
}

const MOON_RADIUS_M = 1_737_400;
/** The eye stands on a mast, so LUNA hovers at the same height, close enough to fill part of the view. */
const DISTANCE_M = 70;
/** Metres per model unit: large enough to read as a companion from this distance. */
const SCALE_M = 6.5;
const BOB_M = 1.4;
const BOB_PER_S = 1.6;
const SKY_R = 40;
/** Where she rides on the way down: left of centre, clear of the panels on the right. */
const RIDE_SIDE = -0.16;
const RIDE_DOWN = 0.06;
/** She stays beyond the near plane, which is far away during the descent. */
const NEAR_MARGIN = 2.6;
/** She pops into 3D at the very start, and settles into her place near the end. */
const APPEAR_UNTIL = 0.08;
const SETTLE_FROM = 0.6;
const forwardOf = new Vector3();
const rightOf = new Vector3();
const screenUpOf = new Vector3();
const place = new Vector3();

const metres = (m: number) => m / MOON_RADIUS_M;

/**
 * The sky paths are drawn in the transparent pass, over everything. Her materials join that pass at
 * full opacity and her group draws later, so the lines run behind her instead of across her face.
 */
const AFTER_SKY_PATHS = { transparent: true };
const DRAW_AFTER_SKY_PATHS = 20;

const metal = new MeshStandardMaterial({ color: '#dfe3e8', metalness: 0.35, roughness: 0.45, ...AFTER_SKY_PATHS });
const darkMetal = new MeshStandardMaterial({ color: '#7c828b', metalness: 0.6, roughness: 0.4, ...AFTER_SKY_PATHS });
const visor = new MeshStandardMaterial({ color: '#0b0c0f', metalness: 0.2, roughness: 0.25, ...AFTER_SKY_PATHS });
/** Above the bloom threshold, so her eyes and lights glow even at night. */
const glow = new MeshStandardMaterial({ color: '#000000', emissive: '#ffb547', emissiveIntensity: 4, toneMapped: false, ...AFTER_SKY_PATHS });
/** Dimmer than the eyes: a lit mouth at full glow would bloom over her whole face. */
const mouthGlow = new MeshStandardMaterial({ color: '#000000', emissive: '#ffb547', emissiveIntensity: 0.9, toneMapped: false, ...AFTER_SKY_PATHS });
const ball = new SphereGeometry(1, 32, 24);
const rod = new CylinderGeometry(0.04, 0.04, 1, 8);
const disc = new CylinderGeometry(1, 1, 1, 48);

/** How quickly she turns toward what she is talking about, per second. */
const TURN_RATE = 3;
const POINTING_TURN = 0.35;
/** She keeps inside this part of the view (tangents from its centre), clear of the side panels. */
const VIEW_LEFT = -0.36;
const VIEW_RIGHT = -0.13;
const VIEW_UP = 0.24;
/** Where she heads when the camera has turned away from her. */
const FOLLOW_SIDE = -0.21;
const FOLLOW_RATE = 2.5;
const WIDE_ASPECT = 1.85;
const MOUTH_REST = 0.03;
const MOUTH_OPEN = 0.05;
const MOUTH_TALK_PER_S = 11;
const turnTo = new Quaternion();
const lookPoint = new Vector3();
const followTo = new Vector3();

/** Her words above her head and, once you click her, what you can ask her here. */
function SpeechBubble() {
  const speech = useNavigator((s) => s.groundSpeech);
  const isMenuOpen = useNavigator((s) => s.isGroundMenuOpen);
  const isTouring = useNavigator((s) => s.isTouring);
  const lang = useNavigator((s) => s.lang);
  const { talkOnGround, askOnGround } = useNavigator.getState();
  return (
    <>
      {speech && (
        <Html position={[0, 1.75, 0]} center zIndexRange={[10, 0]}>
          <div className="ground-talk">
            <button type="button" className="ground-bubble" onClick={talkOnGround} key={speech.text}>{speech.text}</button>
          </div>
        </Html>
      )}
      {isMenuOpen && !isTouring && (
        <Html position={[1.25, 0.35, 0]} zIndexRange={[10, 0]}>
          <div className="ground-menu">
            {GROUND_QUESTIONS.map((key) => (
              <button key={key} type="button" onClick={() => askOnGround(key)}>{groundQuestionLabel(key, lang)}</button>
            ))}
          </div>
        </Html>
      )}
    </>
  );
}

/** A click on her opens the questions: an HTML target, sure to catch the click at this tiny scale. */
function TapTarget() {
  const is3D = useNavigator((s) => s.isCompanion3D);
  const lang = useNavigator((s) => s.lang);
  if (!is3D) return null;
  return (
    <Html position={[0, 0.3, 0]} center zIndexRange={[9, 0]}>
      <button
        type="button"
        className="ground-tap"
        aria-label={lang === 'ru' ? 'Спросить LUNA' : 'Ask LUNA'}
        onClick={() => {
          const store = useNavigator.getState();
          if (!store.isTouring) store.setGroundMenuOpen(!store.isGroundMenuOpen);
        }}
      />
    </Html>
  );
}

function bodyOnScreen(camera: Camera, up: Vector3, dir: Vector3): BodyOnScreen {
  const isBehind = dir.dot(camera.getWorldDirection(new Vector3())) < 0;
  const ndc = camera.position.clone().addScaledVector(dir, SKY_R).project(camera);
  return toScreen(ndc.x, ndc.y, isBehind, dir.dot(up) < 0);
}

/** LUNA in 3D, hovering beside you on the surface, so the place has scale and you are not alone. */
export function GroundCompanion({ lat, lon, sky, companion }: Props) {
  const root = useRef<Group>(null);
  const mouth = useRef<Mesh>(null);
  const light = useRef<DirectionalLight>(null);
  const camera = useThree((s) => s.camera);
  const up = useMemo(() => latLonToThree(lat, lon).normalize(), [lat, lon]);

  useFrame(({ clock }, delta) => {
    const group = root.current;
    if (!group) return;
    group.visible = companion.isActive;
    if (!companion.isActive) return;
    camera.getWorldDirection(forwardOf);
    rightOf.crossVectors(forwardOf, camera.up).normalize();
    screenUpOf.crossVectors(rightOf, forwardOf).normalize();
    // Riding beside the viewer at first, easing into her spot on the surface.
    place.copy(forwardOf).addScaledVector(rightOf, RIDE_SIDE).addScaledVector(screenUpOf, -RIDE_DOWN).normalize();
    place.lerp(companion.dir, MathUtils.smoothstep(companion.progress, SETTLE_FROM, 1)).normalize();
    // Turn away from her and she comes along, so she and her words stay in view.
    if (companion.progress >= 1) {
      const ahead = companion.dir.dot(forwardOf);
      // On a narrow screen there is less room to each side, so she keeps closer to the middle.
      const room = camera instanceof PerspectiveCamera ? Math.min(1, camera.aspect / WIDE_ASPECT) : 1;
      const side = companion.dir.dot(rightOf) / Math.max(ahead, 1e-3);
      const lift = companion.dir.dot(screenUpOf) / Math.max(ahead, 1e-3);
      if (ahead <= 0 || side < VIEW_LEFT * room || side > VIEW_RIGHT * room || Math.abs(lift) > VIEW_UP) {
        followTo.copy(forwardOf).addScaledVector(rightOf, FOLLOW_SIDE * room).normalize();
        companion.dir.lerp(followTo, 1 - Math.exp(-delta * FOLLOW_RATE)).normalize();
      }
    }
    const near = camera instanceof PerspectiveCamera ? camera.near : 0;
    const distance = Math.max(metres(DISTANCE_M), near * NEAR_MARGIN);
    const size = distance / metres(DISTANCE_M);
    const bob = Math.sin(clock.elapsedTime * BOB_PER_S) * metres(BOB_M) * size;
    group.position.copy(camera.position).addScaledVector(place, distance).addScaledVector(up, bob);
    group.scale.setScalar(metres(SCALE_M) * size * MathUtils.smoothstep(companion.progress, 0, APPEAR_UNTIL));
    // She faces you, or turns to what she is pointing at, then the beam reaches out to it.
    const speech = useNavigator.getState().groundSpeech;
    const pointDir = speech?.point === 'sun' ? sky.sunDir : speech?.point === 'earth' ? sky.earthDir : null;
    turnTo.copy(group.quaternion);
    group.up.copy(up);
    group.lookAt(camera.position);
    const facing = group.quaternion.clone();
    // Pointing she turns only part of the way: you still see her face.
    if (pointDir) {
      group.lookAt(lookPoint.copy(group.position).addScaledVector(pointDir, SKY_R));
      facing.slerp(group.quaternion, POINTING_TURN);
    }
    group.quaternion.copy(turnTo).slerp(facing, 1 - Math.exp(-delta * TURN_RATE));
    if (mouth.current) mouth.current.scale.y = speech ? MOUTH_REST + MOUTH_OPEN * Math.abs(Math.sin(clock.elapsedTime * MOUTH_TALK_PER_S)) : MOUTH_REST;
    light.current?.position.copy(sky.sunDir);
    groundBodies.sun = bodyOnScreen(camera, up, sky.sunDir);
    groundBodies.earth = bodyOnScreen(camera, up, sky.earthDir);
  });

  return (
    <>
      <directionalLight ref={light} intensity={3} />
      <ambientLight intensity={1.1} />
      <group ref={root} scale={0} renderOrder={DRAW_AFTER_SKY_PATHS}>
        <TapTarget />
        <SpeechBubble />
        <mesh ref={mouth} geometry={ball} material={mouthGlow} scale={[0.14, MOUTH_REST, 0.03]} position={[0, -0.1, 0.84]} />
        <mesh geometry={ball} material={metal} scale={[1, 0.9, 0.85]} position={[0, 0.3, 0]} />
        <mesh geometry={ball} material={visor} scale={[0.32, 0.2, 0.1]} position={[-0.42, 0.28, 0.72]} rotation={[0, 0, -0.35]} />
        <mesh geometry={ball} material={visor} scale={[0.32, 0.2, 0.1]} position={[0.42, 0.28, 0.72]} rotation={[0, 0, 0.35]} />
        <mesh geometry={ball} material={glow} scale={0.09} position={[-0.42, 0.28, 0.81]} />
        <mesh geometry={ball} material={glow} scale={0.09} position={[0.42, 0.28, 0.81]} />
        <mesh geometry={rod} material={darkMetal} scale={[1, 0.6, 1]} position={[-0.4, 1.32, 0]} rotation={[0, 0, 0.5]} />
        <mesh geometry={rod} material={darkMetal} scale={[1, 0.6, 1]} position={[0.4, 1.32, 0]} rotation={[0, 0, -0.5]} />
        <mesh geometry={ball} material={glow} scale={0.09} position={[-0.56, 1.58, 0]} />
        <mesh geometry={ball} material={glow} scale={0.09} position={[0.56, 1.58, 0]} />
        <mesh geometry={rod} material={darkMetal} scale={[3.5, 0.4, 3.5]} position={[0, -0.7, 0]} />
        <mesh geometry={disc} material={darkMetal} scale={[1.2, 0.12, 1.2]} position={[0, -0.95, 0]} />
        <mesh geometry={disc} material={metal} scale={[0.65, 0.12, 0.65]} position={[0, -0.84, 0]} />
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <mesh key={k} geometry={ball} material={glow} scale={0.06} position={[Math.cos((k * Math.PI) / 3) * 1.1, -0.98, Math.sin((k * Math.PI) / 3) * 1.1]} />
        ))}
      </group>
    </>
  );
}
