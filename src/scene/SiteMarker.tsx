import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { DoubleSide, Quaternion, Vector3, type Group } from 'three';
import { latLonToThree } from './coords';

interface SiteMarkerProps {
  lat: number;
  lon: number;
  label: string;
  isPrimary: boolean;
}

const SURFACE_LIFT = 1.002;
const Y_AXIS = new Vector3(0, 1, 0);
const PULSE_PERIOD_S = 2.4;
const SCREEN_SIZE = 0.018;
const toCamera = new Vector3();

/**
 * Drawn on top of the relief (which is exaggerated and would swallow it) and hidden while the
 * site is on the far side of the globe.
 */
export function SiteMarker({ lat, lon, label, isPrimary }: SiteMarkerProps) {
  const root = useRef<Group>(null);
  const ring = useRef<Group>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const { position, normal, orientation } = useMemo(() => {
    const p = latLonToThree(lat, lon, SURFACE_LIFT);
    const n = p.clone().normalize();
    return { position: p, normal: n, orientation: new Quaternion().setFromUnitVectors(Y_AXIS, n) };
  }, [lat, lon]);

  useFrame(({ clock, camera }) => {
    if (!root.current || !ring.current) return;
    const facing = toCamera.copy(camera.position).sub(position).normalize().dot(normal) > 0.02;
    root.current.visible = facing;
    if (labelRef.current) labelRef.current.style.display = facing ? '' : 'none';
    const size = camera.position.distanceTo(position) * SCREEN_SIZE;
    const pulse = isPrimary ? 1 + 0.25 * Math.sin((clock.elapsedTime * 2 * Math.PI) / PULSE_PERIOD_S) : 1;
    ring.current.scale.setScalar(size * pulse);
  });

  const color = isPrimary ? '#ffb547' : '#c9ced6';

  return (
    <group position={position} quaternion={orientation}>
      <group ref={root}>
        <group ref={ring} renderOrder={10}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
            <ringGeometry args={[0.55, 0.75, 48]} />
            <meshBasicMaterial color={color} side={DoubleSide} toneMapped={false} depthTest={false} transparent />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
            <circleGeometry args={[0.18, 24]} />
            <meshBasicMaterial color={color} side={DoubleSide} toneMapped={false} depthTest={false} transparent />
          </mesh>
        </group>
      </group>
      <Html center zIndexRange={[10, 0]}>
        <div ref={labelRef} className={isPrimary ? 'marker-label marker-label--primary' : 'marker-label'}>
          {label}
        </div>
      </Html>
    </group>
  );
}
