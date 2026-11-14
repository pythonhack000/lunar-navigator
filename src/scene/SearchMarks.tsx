import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, Color, DoubleSide, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three';
import { rankHits, type SearchHit } from '../lib/siteSearch';
import { useSiteSearch } from '../state/siteSearchStore';
import { useNavigator } from '../state/store';
import { goToHit, hitTone } from '../ui/searchActions';
import { latLonToThree } from './coords';
import { setPickInterceptor } from './pickInterceptor';

/** Room for every spot one search checks. */
const CAPACITY = 256;
const SURFACE_LIFT = 1.002;
/** Size on screen, as a share of the distance to the camera, so a spot reads the same at any zoom. */
const SCREEN_SIZE = 0.0085;
const TONE_SIZE = { fit: 1, near: 0.8, miss: 0.55 } as const;
const TONE_COLOR = { fit: new Color('#ffb547'), near: new Color('#9a6a22'), miss: new Color('#5d6168') } as const;
const HALO_SIZE = 2.6;
const PULSE_PERIOD_S = 2.2;
/** A click this close to a spot (in CSS pixels) picks the spot, not the ground under the pointer. */
const PICK_RADIUS_PX = 14;
const NUMBERED = 3;
const Z_AXIS = new Vector3(0, 0, 1);

interface Placed {
  hit: SearchHit;
  position: Vector3;
  normal: Vector3;
  orientation: Quaternion;
  tone: 'fit' | 'near' | 'miss';
}

const toCamera = new Vector3();
const scaleVec = new Vector3();
const matrix = new Matrix4();
const projected = new Vector3();

const facesCamera = (p: Placed, camera: Vector3) => toCamera.copy(camera).sub(p.position).normalize().dot(p.normal) > 0.02;

/**
 * The site search's spots, lit on the terrain: amber where the needs are met (with a soft pulsing
 * glow, so a cluster reads as a highlighted area), darker amber where they are nearly met, grey
 * where they are not. The best three carry their rank. A click on a spot flies there.
 */
export function SearchMarks() {
  const hits = useSiteSearch((s) => s.hits);
  const isGroundView = useNavigator((s) => s.isGroundView);
  const { camera, gl } = useThree();
  const discs = useRef<InstancedMesh>(null);
  const halos = useRef<InstancedMesh>(null);
  const labels = useRef<(HTMLDivElement | null)[]>([]);

  const placed = useMemo<Placed[]>(
    () =>
      hits.map((hit) => {
        const position = latLonToThree(hit.lat, hit.lon, SURFACE_LIFT);
        const normal = position.clone().normalize();
        return { hit, position, normal, orientation: new Quaternion().setFromUnitVectors(Z_AXIS, normal), tone: hitTone(hit) };
      }),
    [hits],
  );
  const fits = useMemo(() => placed.filter((p) => p.tone === 'fit'), [placed]);
  const top = useMemo(() => {
    const best = rankHits(fits.map((p) => p.hit)).slice(0, NUMBERED);
    return best.map((hit) => fits.find((p) => p.hit === hit)!);
  }, [fits]);

  useEffect(() => {
    const mesh = discs.current;
    if (!mesh) return;
    placed.slice(0, CAPACITY).forEach((p, i) => mesh.setColorAt(i, TONE_COLOR[p.tone]));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [placed]);

  // Clicks near a spot go to the spot; registered only while there are spots to click.
  useEffect(() => {
    if (placed.length === 0 || isGroundView) return undefined;
    setPickInterceptor((clientX, clientY) => {
      const rect = gl.domElement.getBoundingClientRect();
      let best: Placed | null = null;
      let bestPx = PICK_RADIUS_PX;
      for (const p of placed) {
        if (!facesCamera(p, camera.position)) continue;
        projected.copy(p.position).project(camera);
        const x = rect.left + ((projected.x + 1) / 2) * rect.width;
        const y = rect.top + ((1 - projected.y) / 2) * rect.height;
        const px = Math.hypot(x - clientX, y - clientY);
        if (px < bestPx) {
          best = p;
          bestPx = px;
        }
      }
      if (best) goToHit(best.hit);
      return best !== null;
    });
    return () => setPickInterceptor(null);
  }, [placed, isGroundView, camera, gl]);

  useFrame(({ clock }) => {
    const pulse = 1 + 0.18 * Math.sin((clock.elapsedTime * 2 * Math.PI) / PULSE_PERIOD_S);
    const disc = discs.current;
    const halo = halos.current;
    if (disc) {
      placed.slice(0, CAPACITY).forEach((p, i) => {
        const size = facesCamera(p, camera.position) ? camera.position.distanceTo(p.position) * SCREEN_SIZE * TONE_SIZE[p.tone] : 0;
        disc.setMatrixAt(i, matrix.compose(p.position, p.orientation, scaleVec.setScalar(size)));
      });
      disc.count = Math.min(placed.length, CAPACITY);
      disc.instanceMatrix.needsUpdate = true;
    }
    if (halo) {
      fits.slice(0, CAPACITY).forEach((p, i) => {
        const size = facesCamera(p, camera.position) ? camera.position.distanceTo(p.position) * SCREEN_SIZE * HALO_SIZE * pulse : 0;
        halo.setMatrixAt(i, matrix.compose(p.position, p.orientation, scaleVec.setScalar(size)));
      });
      halo.count = Math.min(fits.length, CAPACITY);
      halo.instanceMatrix.needsUpdate = true;
    }
    top.forEach((p, i) => {
      const label = labels.current[i];
      if (label) label.style.display = facesCamera(p, camera.position) ? '' : 'none';
    });
  });

  if (isGroundView || placed.length === 0) return null;
  return (
    <group>
      <instancedMesh ref={halos} args={[undefined, undefined, CAPACITY]} renderOrder={9} frustumCulled={false}>
        <circleGeometry args={[0.5, 32]} />
        <meshBasicMaterial color="#ffb547" transparent opacity={0.22} blending={AdditiveBlending} depthTest={false} depthWrite={false} toneMapped={false} side={DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={discs} args={[undefined, undefined, CAPACITY]} renderOrder={10} frustumCulled={false}>
        <circleGeometry args={[0.5, 20]} />
        <meshBasicMaterial transparent opacity={0.95} depthTest={false} depthWrite={false} toneMapped={false} side={DoubleSide} />
      </instancedMesh>
      {top.map((p, i) => (
        <Html key={`${p.hit.lat}:${p.hit.lon}`} position={p.position} center zIndexRange={[9, 0]}>
          <div
            ref={(el) => {
              labels.current[i] = el;
            }}
            className="search-rank"
          >
            {i + 1}
          </div>
        </Html>
      ))}
    </group>
  );
}
