// Sun directions in the Moon-fixed frame (IAU rotation model, same as the app) for one year.
// Usage: node scripts/sun_vectors.mjs > scripts/.cache/sun_2027.json
import { Body, GeoMoon, GeoVector, RotationAxis } from 'astronomy-engine';

const STEP_HOURS = 6;
const START = Date.UTC(2027, 0, 1);
const END = Date.UTC(2028, 0, 1);
const DEG = Math.PI / 180;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(...a);
  return a.map((v) => v / l);
};
const vec = (v) => [v.x, v.y, v.z];

const out = [];
for (let t = START; t < END; t += STEP_HOURS * 3_600_000) {
  const date = new Date(t);
  const axis = RotationAxis(Body.Moon, date);
  const z = norm(vec(axis.north));
  const node = norm(cross([0, 0, 1], z));
  const nodeY = cross(z, node);
  const w = axis.spin * DEG;
  const x = node.map((n, k) => n * Math.cos(w) + nodeY[k] * Math.sin(w));
  const y = cross(z, x);
  const sun = norm(sub(vec(GeoVector(Body.Sun, date, false)), vec(GeoMoon(date))));
  out.push([dot(sun, x), dot(sun, y), dot(sun, z)].map((v) => +v.toFixed(7)));
}
process.stdout.write(JSON.stringify(out));
