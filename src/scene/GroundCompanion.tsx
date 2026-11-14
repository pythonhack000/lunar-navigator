import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { type RefObject, useMemo, useRef } from 'react';
import { GROUND_QUESTIONS, groundQuestionLabel } from '../ui/groundLines';
import { isInvitingToAsk, isPulsingToAsk, useNavigator } from '../state/store';
import { type Camera, CylinderGeometry, type DirectionalLight, type Group, MathUtils, type Mesh, MeshStandardMaterial, PerspectiveCamera, Quaternion, SphereGeometry, Vector3 } from 'three';
import { latLonToThree } from './coords';
import { bubbleShift, groundBodies, toScreen, type BodyOnScreen } from './groundBodies';
import { clearLunaBot, MODEL_HEIGHT, readLunaAnchor, refreshLunaAnchor, styleLunaBot, TRANSFORM_PROGRESS, transformShare, transformStage, type LunaAnchor } from './lunaAnchor';
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
  /** How the camera faces once you are down; her place on screen is worked out against it. */
  rest: Quaternion;
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
/** With no 2D LUNA on screen to take over from, she pops into 3D at the very start. */
const APPEAR_UNTIL = 0.08;
/** Once changed she grows and leaves the 2D LUNA's place on screen, then settles into hers; the two overlap so she never pauses. */
const MORPH_UNTIL = 0.8;
const SETTLE_FROM = 0.25;
/** Her full size for her distance. */
const FULL_SIZE_OVER_DISTANCE = SCALE_M / DISTANCE_M;
const uprightUp = new Vector3();
const HER_VERTICAL = new Vector3(0, 1, 0);
const spin = new Quaternion();
/** Her words wait until she has left the toolbar behind. */
const WORDS_FROM = 0.3;
const WORDS_FULL = 0.55;
/** How quickly her words slide clear of a panel, per second. */
const WORDS_SLIDE_RATE = 10;
/** Her place on screen while riding, in camera space. */
const RIDE_PLACE = new Vector3(RIDE_SIDE, -RIDE_DOWN, -1).normalize();
const restPlace = new Vector3();
const restInverse = new Quaternion();
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
const POINTING_TURN = 0.2;
/** She keeps inside this part of the view (tangents from its centre), clear of the side panels. */
const VIEW_LEFT = -0.36;
const VIEW_RIGHT = -0.13;
const VIEW_UP = 0.03;
const VIEW_DOWN = -0.24;
/** Where she heads when the camera has turned away from her. */
const FOLLOW_SIDE = -0.21;
/** A little below centre, so her words stay clear of the toolbar. */
const FOLLOW_LIFT = -0.04;
const FOLLOW_RATE = 6;
/** She gathers speed and slows down instead of starting and stopping dead. */
const FOLLOW_EASE_RATE = 10;
const FOLLOW_EASE_MIN = 0.001;
/** Close enough to where she was heading to stop following, radians. */
const FOLLOW_DONE = 0.01;
const WIDE_ASPECT = 1.85;
const MOUTH_REST = 0.03;
const MOUTH_OPEN = 0.05;
const MOUTH_TALK_PER_S = 11;
const turnTo = new Quaternion();
const lookPoint = new Vector3();
const followTo = new Vector3();

/** Her words above her head and, once you click her, what you can ask her here. */
function SpeechBubble({ holder }: { holder: RefObject<HTMLDivElement | null> }) {
  const speech = useNavigator((s) => s.groundSpeech);
  const isMenuOpen = useNavigator((s) => s.isGroundMenuOpen);
  const isTouring = useNavigator((s) => s.isTouring);
  const lang = useNavigator((s) => s.lang);
  const { talkOnGround, askOnGround } = useNavigator.getState();
  return (
    <>
      {speech && (
        <Html position={[0, 1.75, 0]} center zIndexRange={[10, 0]}>
          <div className="ground-talk" ref={holder}>
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

/** Her body. */
function LunaMeshes() {
  return (
    <>
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
    </>
  );
}

const toggleQuestions = () => {
  const store = useNavigator.getState();
  if (!store.isTouring) store.setGroundMenuOpen(!store.isGroundMenuOpen);
};

/**
 * A click on her opens the questions: an HTML target, sure to catch the click at this tiny scale. When
 * she is quiet a ring pulses around her to say she can be asked; until that has happened once, a label
 * spells it out.
 */
function TapTarget({ invite, body }: { invite: RefObject<HTMLDivElement | null>; body: RefObject<HTMLDivElement | null> }) {
  const is3D = useNavigator((s) => s.isCompanion3D);
  const lang = useNavigator((s) => s.lang);
  const isInviting = useNavigator(isInvitingToAsk);
  const isPulsing = useNavigator(isPulsingToAsk);
  if (!is3D) return null;
  return (
    <>
      <Html position={[0, 0.3, 0]} center zIndexRange={[9, 0]}>
        <div className="ground-body" ref={body}>
          {isPulsing && <span className="ground-invite__ring" />}
          <button type="button" className="ground-tap" aria-label={lang === 'ru' ? 'Спросить LUNA' : 'Ask LUNA'} onClick={toggleQuestions} />
        </div>
      </Html>
      {isInviting && (
        <Html position={[1.25, 0.35, 0]} zIndexRange={[9, 0]}>
          <div className="ground-invite" ref={invite}>
            <button type="button" className="ground-invite__label" onClick={toggleQuestions}>{lang === 'ru' ? 'Нажми на меня и спроси' : 'Click me and ask'}</button>
          </div>
        </Html>
      )}
    </>
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
  const isFollowing = useRef(false);
  const followEase = useRef(0);
  /** Undefined until looked for: once at the start of each flight. */
  const anchor = useRef<LunaAnchor | null | undefined>(undefined);
  const wasActive = useRef(false);
  /** Which way she faces before the change's turn is added on top. */
  const facingNow = useRef(new Quaternion());
  const words = useRef<HTMLDivElement>(null);
  const wordsShift = useRef(0);
  const invite = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const up = useMemo(() => latLonToThree(lat, lon).normalize(), [lat, lon]);

  useFrame(({ clock }, delta) => {
    const group = root.current;
    if (!group) return;
    group.visible = companion.isActive;
    if (!companion.isActive) {
      if (anchor.current?.element) clearLunaBot(anchor.current.element);
      anchor.current = undefined;
      wasActive.current = false;
      return;
    }
    const isJustActive = !wasActive.current;
    wasActive.current = true;
    if (companion.progress >= 1) {
      if (anchor.current?.element) clearLunaBot(anchor.current.element);
      anchor.current = undefined;
    } else if (anchor.current === undefined && camera instanceof PerspectiveCamera) {
      anchor.current = readLunaAnchor(gl.domElement, camera.fov);
    } else if (anchor.current && camera instanceof PerspectiveCamera) {
      anchor.current = refreshLunaAnchor(anchor.current, gl.domElement, camera.fov);
    }
    const from = anchor.current ?? null;
    const morph = from ? MathUtils.smoothstep(companion.progress, TRANSFORM_PROGRESS, MORPH_UNTIL) : 1;
    const share = from ? transformShare(companion.progress) : 1;
    const stage = transformStage(share);
    group.visible = stage.isModelShown;
    if (from?.element) styleLunaBot(from.element, stage, share);
    // Only once she has arrived: on the way down she is on the move and the view belongs to the flight.
    const hasArrived = companion.progress >= 1;
    if (invite.current) invite.current.style.visibility = hasArrived ? 'visible' : 'hidden';
    if (body.current && camera instanceof PerspectiveCamera) {
      // Her full height on screen, so the place to click and the ring match her at any window size.
      const heightPx = (MODEL_HEIGHT * FULL_SIZE_OVER_DISTANCE * gl.domElement.clientHeight) / (2 * Math.tan(MathUtils.degToRad(camera.fov) / 2));
      body.current.style.setProperty('--luna-px', `${heightPx}px`);
      body.current.classList.toggle('has-arrived', hasArrived);
    }
    if (words.current) {
      words.current.style.opacity = String(MathUtils.smoothstep(morph, WORDS_FROM, WORDS_FULL));
      const bubble = words.current.firstElementChild?.getBoundingClientRect();
      const panel = document.querySelector('.luna:not(.is-hidden) .luna-panel')?.getBoundingClientRect();
      if (bubble) {
        const wanted = bubbleShift(bubble.left - wordsShift.current, panel?.right ?? null, window.innerWidth);
        wordsShift.current = MathUtils.damp(wordsShift.current, wanted, WORDS_SLIDE_RATE, delta);
        words.current.style.translate = `${wordsShift.current}px 0`;
      }
    }
    camera.getWorldDirection(forwardOf);
    rightOf.crossVectors(forwardOf, camera.up).normalize();
    screenUpOf.crossVectors(rightOf, forwardOf).normalize();
    // Riding beside the viewer, easing across the screen to where she waits. Blending in camera space
    // keeps the camera's own turn out of it, so she glides there without a swoop.
    restPlace.copy(companion.dir).applyQuaternion(restInverse.copy(companion.rest).invert());
    place.copy(RIDE_PLACE).lerp(restPlace, MathUtils.smoothstep(companion.progress, SETTLE_FROM, 1));
    if (from) place.lerp(from.place, 1 - morph);
    place.normalize().applyQuaternion(camera.quaternion);
    // Turn away from her and she comes along, so she and her words stay in view.
    if (companion.progress >= 1) {
      const ahead = companion.dir.dot(forwardOf);
      // On a narrow screen there is less room to each side, so she keeps closer to the middle.
      const room = camera instanceof PerspectiveCamera ? Math.min(1, camera.aspect / WIDE_ASPECT) : 1;
      const side = companion.dir.dot(rightOf) / Math.max(ahead, 1e-3);
      const lift = companion.dir.dot(screenUpOf) / Math.max(ahead, 1e-3);
      followTo.copy(forwardOf).addScaledVector(rightOf, FOLLOW_SIDE * room).addScaledVector(screenUpOf, FOLLOW_LIFT).normalize();
      // Once she sets off she goes all the way, or she would stop dead at the edge of her area.
      if (ahead <= 0 || side < VIEW_LEFT * room || side > VIEW_RIGHT * room || lift > VIEW_UP || lift < VIEW_DOWN) isFollowing.current = true;
      else if (companion.dir.angleTo(followTo) < FOLLOW_DONE) isFollowing.current = false;
      followEase.current = MathUtils.damp(followEase.current, isFollowing.current ? 1 : 0, FOLLOW_EASE_RATE, delta);
      if (followEase.current > FOLLOW_EASE_MIN) companion.dir.lerp(followTo, 1 - Math.exp(-delta * FOLLOW_RATE * followEase.current)).normalize();
    } else {
      isFollowing.current = false;
      followEase.current = 0;
    }
    const near = camera instanceof PerspectiveCamera ? camera.near : 0;
    const distance = Math.max(metres(DISTANCE_M), near * NEAR_MARGIN);
    const size = distance / metres(DISTANCE_M);
    const bob = Math.sin(clock.elapsedTime * BOB_PER_S) * metres(BOB_M) * size * morph;
    group.position.copy(camera.position).addScaledVector(place, distance).addScaledVector(up, bob);
    const sizeOverDistance = from ? MathUtils.lerp(from.sizeOverDistance, FULL_SIZE_OVER_DISTANCE, morph) : FULL_SIZE_OVER_DISTANCE * MathUtils.smoothstep(companion.progress, 0, APPEAR_UNTIL);
    const scale = distance * sizeOverDistance;
    group.scale.set(scale, scale, scale * stage.modelDepth);
    // She faces you, or turns to what she is pointing at, then the beam reaches out to it.
    const speech = useNavigator.getState().groundSpeech;
    const named = speech?.point === 'sun' ? sky.sunDir : speech?.point === 'earth' ? sky.earthDir : null;
    // Something below the horizon is talked about, not pointed at: she would tip over into the ground.
    const pointDir = named && named.dot(up) > 0 ? named : null;
    turnTo.copy(facingNow.current);
    // Upright on the screen where she takes over from the 2D LUNA, upright on the ground once down.
    group.up.copy(uprightUp.copy(screenUpOf).lerp(up, morph).normalize());
    group.lookAt(camera.position);
    const facing = group.quaternion.clone();
    // Pointing she turns only part of the way: you still see her face.
    if (pointDir) {
      group.lookAt(lookPoint.copy(group.position).addScaledVector(pointDir, SKY_R));
      facing.slerp(group.quaternion, POINTING_TURN);
    }
    if (isJustActive) facingNow.current.copy(facing);
    else facingNow.current.copy(turnTo).slerp(facing, 1 - Math.exp(-delta * TURN_RATE));
    group.quaternion.copy(facingNow.current).multiply(spin.setFromAxisAngle(HER_VERTICAL, stage.modelTurnRad));
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
        <TapTarget invite={invite} body={body} />
        <SpeechBubble holder={words} />
        <mesh ref={mouth} geometry={ball} material={mouthGlow} scale={[0.14, MOUTH_REST, 0.03]} position={[0, -0.1, 0.84]} />
        <LunaMeshes />
      </group>
    </>
  );
}
