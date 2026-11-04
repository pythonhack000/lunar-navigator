/**
 * Moon surface shading. The Moon has no atmosphere, so there is no ambient sky light: what the Sun
 * does not hit is black, apart from a faint earthshine. Reflectance follows the Lunar-Lambert model,
 * which is why the full Moon looks evenly bright instead of darkening toward the limb.
 *
 * All terrain shares one height/colour/relief function of position (terrainData below), drawing on
 * the most detailed source for each point: the LOLA 80 m polar map, the 240 m polar ring, then the
 * global maps, with smooth blends between them. Meshes are only carriers: two clipmaps (see
 * clipmap.ts), one in longitude/latitude for the whole Moon and one in the south polar plane, whose
 * vertices are pinned to the ground. Where they overlap they shade every pixel identically, so the
 * hand-over is invisible. Shadows are ray-marched over the same terrain toward the Sun.
 */

/** Helpers shared by both meshes. Scene axes: +Y lunar north, +X prime meridian, -Z 90°E. */
const common = /* glsl */ `
  const float PI = 3.141592653589793;
  const float MOON_RADIUS_M = 1737400.0;

  vec3 toMoonFixed(vec3 t) { return vec3(t.x, -t.z, t.y); }

  /** Heights are 16-bit values split over R (high byte) and G (low byte). */
  float decodeHeight(vec4 c) { return (c.r * 65280.0 + c.g * 255.0) / 65535.0; }

  void localAxes(vec3 up, out vec3 east, out vec3 north) {
    east = cross(vec3(0.0, 1.0, 0.0), up);
    east = length(east) < 1e-5 ? vec3(0.0, 0.0, -1.0) : normalize(east);
    north = cross(up, east);
  }
`;

/**
 * Procedural small craters (bowl plus raised rim), shared by vertex and fragment shaders. Only used
 * below the resolution of the real data: it adds texture and side-on roughness, never calculations.
 */
const craterField = /* glsl */ `
  uniform float detailStrength;
  uniform vec3 detailCellKm;

  vec3 hash3(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
  }

  /**
   * Gradient of a field of small simple craters (bowl plus raised rim) around q, in cell units.
   * Only used below the resolution of the real data, purely as visual texture.
   */
  vec3 craterGradient(vec3 q) {
    vec3 cell = floor(q);
    vec3 g = vec3(0.0);
    for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
    for (int z = -1; z <= 1; z++) {
      vec3 c = cell + vec3(float(x), float(y), float(z));
      vec3 h = hash3(c);
      // Sparse, mostly small craters: a steep size-frequency curve like real lunar cratering.
      if (h.z > 0.32) continue;
      float k = h.z / 0.32;
      float r = 0.07 + 0.4 * k * k * k;
      vec3 d = q - (c + h);
      float dist = length(d);
      float s = dist / r;
      if (s > 1.7) continue;
      // Older craters are shallower and softer; h.x stands in for age.
      float depth = mix(0.35, 0.12, h.x);
      float rim = 0.12 * exp(-pow((s - 1.0) / 0.22, 2.0));
      float slope = (s < 1.0 ? 2.0 * s * smoothstep(1.0, 0.7, s) : 0.0) + rim * (-2.0 * (s - 1.0) / (0.22 * 0.22));
      g += slope * depth * d / (dist + 1e-5);
    }
    return g;
  }

  /** Height of the crater field at q, in cell units (same craters as craterGradient). */
  float craterHeight(vec3 q) {
    vec3 cell = floor(q);
    float h = 0.0;
    for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
    for (int z = -1; z <= 1; z++) {
      vec3 c = cell + vec3(float(x), float(y), float(z));
      vec3 n = hash3(c);
      if (n.z > 0.32) continue;
      float k = n.z / 0.32;
      float r = 0.07 + 0.4 * k * k * k;
      float s = length(q - (c + n)) / r;
      if (s > 1.7) continue;
      float depth = mix(0.35, 0.12, n.x);
      float bowl = s < 1.0 ? s * s - 1.0 : 0.0;
      float rim = 0.12 * exp(-pow((s - 1.0) / 0.22, 2.0));
      h += depth * r * (bowl + rim);
    }
    return h;
  }

  /**
   * Procedural relief in metres for a vertex, keeping only craters several times larger than the
   * local vertex spacing (smaller ones would just alias); the fragment normals carry the rest.
   */
  float detailHeightM(vec3 up, float spacingKm) {
    float h = 0.0;
    for (int i = 0; i < 3; i++) {
      float w = smoothstep(2.5, 5.0, detailCellKm[i] / spacingKm);
      if (w > 0.0) h += w * detailCellKm[i] * craterHeight(up * (MOON_RADIUS_M / 1000.0 / detailCellKm[i]));
    }
    return h * 1000.0 * detailStrength;
  }
`;

/** Fragment-only helper (it needs screen-space derivatives). */
export const equirectSampling = /* glsl */ `
  /** Samples an equirectangular map without the mip seam where longitude wraps. */
  vec4 sampleEquirect(sampler2D tex, vec2 uv) {
    vec2 alt = vec2(fract(uv.x + 0.5) - 0.5, uv.y);
    vec2 dx = dFdx(uv);
    vec2 dy = dFdy(uv);
    vec2 dxAlt = dFdx(alt);
    vec2 dyAlt = dFdy(alt);
    if (abs(dx.x) + abs(dy.x) > abs(dxAlt.x) + abs(dyAlt.x)) {
      dx = dxAlt;
      dy = dyAlt;
    }
    return textureGrad(tex, uv, dx, dy);
  }
`;

const lighting = /* glsl */ `
  uniform vec3 sunDir;
  uniform vec3 earthDir;
  uniform float sunIntensity;
  uniform float earthshine;
  uniform float bumpStrength;
  uniform float relief;
  uniform float fillLight;

  const float LUNAR_LAMBERT_L = 0.6;

  /** Two finer octaves below the configured three, for regolith pitting seen right up close. */
  const int DETAIL_OCTAVES = 5;
  const float FINE_OCTAVE_RATIO = 3.0;

  float octaveCellKm(int i) {
    return i < 3 ? detailCellKm[i] : detailCellKm[2] / pow(FINE_OCTAVE_RATIO, float(i - 2));
  }

  vec3 detailGradient(vec3 up) {
    vec3 g = vec3(0.0);
    for (int i = 0; i < DETAIL_OCTAVES; i++) {
      vec3 q = up * (MOON_RADIUS_M / 1000.0 / octaveCellKm(i));
      // Fade each octave out once its craters shrink below a couple of pixels.
      float fade = 1.0 - smoothstep(0.15, 0.6, length(fwidth(q)));
      if (fade > 0.0) g += craterGradient(q) * fade;
    }
    return g;
  }

  /** Soft brightness mottling of the regolith at ~50 m and ~15 m, faded out when not resolved. */
  float albedoMottle(vec3 up) {
    float m = 1.0;
    for (int i = 0; i < 2; i++) {
      vec3 q = up * (MOON_RADIUS_M / (i == 0 ? 50.0 : 15.0));
      float fade = 1.0 - smoothstep(0.2, 0.8, length(fwidth(q)));
      if (fade <= 0.0) continue;
      vec3 c = floor(q);
      vec3 f = fract(q);
      f = f * f * (3.0 - 2.0 * f);
      float n = mix(
        mix(mix(hash3(c).x, hash3(c + vec3(1, 0, 0)).x, f.x), mix(hash3(c + vec3(0, 1, 0)).x, hash3(c + vec3(1, 1, 0)).x, f.x), f.y),
        mix(mix(hash3(c + vec3(0, 0, 1)).x, hash3(c + vec3(1, 0, 1)).x, f.x), mix(hash3(c + vec3(0, 1, 1)).x, hash3(c + vec3(1, 1, 1)).x, f.x), f.y),
        f.z);
      m *= 1.0 + (n - 0.5) * 0.18 * fade;
    }
    return m;
  }

  vec3 shade(vec3 up, vec3 tangentNormal, vec3 albedo, float shadow, vec3 worldPos) {
    vec3 east;
    vec3 north;
    localAxes(up, east, north);
    // Steeper normals to match the exaggerated geometry; sqrt keeps 5x from looking like plastic.
    tangentNormal.xy *= bumpStrength * sqrt(relief);
    vec3 n = normalize(tangentNormal.x * east + tangentNormal.y * north + tangentNormal.z * up);
    if (detailStrength > 0.0) {
      vec3 g = detailGradient(up);
      n = normalize(n - detailStrength * (g - dot(g, up) * up));
    }

    albedo *= albedoMottle(up);
    vec3 viewDir = normalize(cameraPosition - worldPos);
    float cosI = dot(n, sunDir);
    float cosE = max(dot(n, viewDir), 0.0);
    float lambert = max(cosI, 0.0);
    float lommel = cosI > 0.0 ? 2.0 * cosI / (cosI + cosE + 1e-4) : 0.0;
    float reflectance = mix(lambert, lommel, LUNAR_LAMBERT_L);

    // Slopes facing the Sun can light up past the terminator; fade them on the night side.
    float dayside = smoothstep(-0.03, 0.04, dot(up, sunDir));

    vec3 color = albedo * reflectance * dayside * shadow * sunIntensity;
    color += albedo * earthshine * max(dot(n, earthDir), 0.0) * (1.0 - dayside * shadow);
    // Not physical (space has no sky light): a faint fill from above and behind the viewer, as games
    // use, shaded by the surface normal so craters and slopes in shadow or at night keep their shape.
    vec3 fillDir = normalize(up + viewDir);
    float fill = 0.25 + 0.75 * max(dot(n, fillDir), 0.0);
    color += albedo * fillLight * fill * fill * (1.0 - shadow * dayside * max(cosI, 0.0));
    return color;
  }
`;

// ---------------------------------------------------------------- terrain data

const terrainData = /* glsl */ `
  uniform float heightMin;
  uniform float heightRange;
  uniform sampler2D globalHeightMap;
  uniform vec2 globalHeightSize;
  uniform sampler2D innerHeightMap;
  uniform float innerSize;
  uniform float innerRhoMax;
  uniform float innerRhoEdge;
  uniform sampler2D outerHeightMap;
  uniform float outerSize;
  uniform float outerRhoMax;
  uniform float outerRhoEdge;
  uniform float hasOuter;
  /** Streamed LOLA detail tiles (3x3 block of 10° tiles) around the camera; see detailAtlas.ts. */
  uniform sampler2D atlasHeightMap;
  uniform vec2 atlasOrigin;
  uniform float atlasSpan;
  uniform float atlasHeightSize;
  uniform float hasAtlas;
  /** Fade-in band at the atlas edge, as a fraction of its span. */
  const float ATLAS_BLEND = 0.12;
  /** Width of each blend between sources, as a fraction of the tile radius. */
  const float BLEND_FRACTION = 0.06;

  vec2 equirectUv(vec3 p) {
    return vec2(atan(p.y, p.x) / (2.0 * PI) + 0.5, asin(clamp(p.z, -1.0, 1.0)) / PI + 0.5);
  }

  /** South polar stereographic plane coordinates (unit sphere) of a scene direction. */
  vec2 polarPlane(vec3 up) {
    vec3 p = toMoonFixed(up);
    return 2.0 * p.xy / max(1.0 - p.z, 1e-6);
  }

  vec3 polarToScene(vec2 xy) {
    float r2 = dot(xy, xy);
    vec3 p = vec3(4.0 * xy, r2 - 4.0) / (r2 + 4.0);
    return vec3(p.x, p.z, -p.y);
  }

  /** Bilinear height in metres from a packed map; bytes cannot be GPU-filtered, so taps decode first. */
  float packedBilinear(sampler2D map, vec2 uv, vec2 size, bool wrapX) {
    vec2 f = uv * size - 0.5;
    vec2 i = floor(f);
    vec2 t = f - i;
    ivec2 last = ivec2(size) - 1;
    int x0 = wrapX ? int(mod(i.x, size.x)) : clamp(int(i.x), 0, last.x);
    int x1 = wrapX ? (x0 + 1) % int(size.x) : min(x0 + 1, last.x);
    int y0 = clamp(int(i.y), 0, last.y);
    int y1 = min(y0 + 1, last.y);
    float h00 = decodeHeight(texelFetch(map, ivec2(x0, y0), 0));
    float h10 = decodeHeight(texelFetch(map, ivec2(x1, y0), 0));
    float h01 = decodeHeight(texelFetch(map, ivec2(x0, y1), 0));
    float h11 = decodeHeight(texelFetch(map, ivec2(x1, y1), 0));
    return mix(mix(h00, h10, t.x), mix(h01, h11, t.x), t.y) * heightRange + heightMin;
  }

  float coarseHeight(vec3 up) { return packedBilinear(globalHeightMap, equirectUv(toMoonFixed(up)), globalHeightSize, true); }

  /** Position in the detail atlas (0..1 inside), longitude measured eastward from its west edge. */
  vec2 atlasUv(vec3 up) {
    vec3 p = toMoonFixed(up);
    float east = mod(atan(p.y, p.x) - atlasOrigin.x + 4.0 * PI, 2.0 * PI);
    return vec2(east, asin(clamp(p.z, -1.0, 1.0)) - atlasOrigin.y) / atlasSpan;
  }

  /** Atlas weight with a fade at its edge, times whether a tile exists there (alpha). */
  float atlasWeight(vec2 uv) {
    if (hasAtlas < 0.5 || any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 0.0;
    vec2 edge = min(uv, 1.0 - uv);
    ivec2 texel = clamp(ivec2(uv * atlasHeightSize), ivec2(0), ivec2(int(atlasHeightSize) - 1));
    return smoothstep(0.0, ATLAS_BLEND, min(edge.x, edge.y)) * texelFetch(atlasHeightMap, texel, 0).a;
  }

  /** Whole-Moon height: the streamed detail tiles where loaded, the coarse global map elsewhere. */
  float globalHeight(vec3 up) {
    float h = coarseHeight(up);
    vec2 uv = atlasUv(up);
    float w = atlasWeight(uv);
    return w > 0.0 ? mix(h, packedBilinear(atlasHeightMap, uv, vec2(atlasHeightSize), false), w) : h;
  }
  float innerHeight(vec2 xy) { return packedBilinear(innerHeightMap, xy / (2.0 * innerRhoMax) + 0.5, vec2(innerSize), false); }
  float outerHeight(vec2 xy) { return packedBilinear(outerHeightMap, xy / (2.0 * outerRhoMax) + 0.5, vec2(outerSize), false); }

  /** Weight of a polar tile at radius r: 1 well inside, fading to 0 at its edge. */
  float tileWeight(float r, float edge) { return 1.0 - smoothstep(edge * (1.0 - BLEND_FRACTION), edge, r); }

  /** Blend weights of the inner and outer polar tiles at a point (zero in the north). */
  vec2 polarWeights(vec3 up, out vec2 xy) {
    xy = polarPlane(up);
    if (toMoonFixed(up).z > 0.0) return vec2(0.0);
    float r = length(xy);
    return vec2(tileWeight(r, innerRhoEdge), hasOuter > 0.5 ? tileWeight(r, outerRhoEdge) : 0.0);
  }

  /** Terrain height in metres, blending every source that covers the point. */
  float terrainHeight(vec3 up) {
    vec2 xy;
    vec2 w = polarWeights(up, xy);
    if (w.x >= 1.0) return innerHeight(xy);
    float h = w.y >= 1.0 ? outerHeight(xy) : globalHeight(up);
    if (w.y > 0.0 && w.y < 1.0) h = mix(h, outerHeight(xy), w.y);
    if (w.x > 0.0) h = mix(h, innerHeight(xy), w.x);
    return h;
  }

  /** Ground distance between height samples for the slope map: 300 m, as in lib/slope.ts. */
  const float SLOPE_STEP_RAD = 300.0 / MOON_RADIUS_M;

  /** Steepest regional slope at a point, degrees, from central differences east and north. */
  float slopeDegAt(vec3 up) {
    vec3 east;
    vec3 north;
    localAxes(up, east, north);
    float dE = terrainHeight(normalize(up + east * SLOPE_STEP_RAD)) - terrainHeight(normalize(up - east * SLOPE_STEP_RAD));
    float dN = terrainHeight(normalize(up + north * SLOPE_STEP_RAD)) - terrainHeight(normalize(up - north * SLOPE_STEP_RAD));
    return degrees(atan(length(vec2(dE, dN)) / (2.0 * SLOPE_STEP_RAD * MOON_RADIUS_M)));
  }

  /** The single finest source covering the point (no blending): cheap enough for shadow marching. */
  float terrainHeightFast(vec3 up) {
    vec2 xy;
    vec2 w = polarWeights(up, xy);
    if (w.x > 0.5) return innerHeight(xy);
    if (w.y > 0.5) return outerHeight(xy);
    return globalHeight(up);
  }

  /** Ground spacing of the finest data at a point, metres (sets the first shadow-march step). */
  float dataSpacingM(vec3 up) {
    vec2 xy;
    vec2 w = polarWeights(up, xy);
    if (w.x > 0.5) return 2.0 * innerRhoMax * MOON_RADIUS_M / innerSize;
    if (w.y > 0.5) return 2.0 * outerRhoMax * MOON_RADIUS_M / outerSize;
    if (atlasWeight(atlasUv(up)) > 0.5) return atlasSpan * MOON_RADIUS_M / atlasHeightSize;
    return 2.0 * PI * MOON_RADIUS_M / globalHeightSize.x;
  }
`;

// ---------------------------------------------------------------- clipmap vertex shader

/**
 * One clipmap level. Vertices sit on fixed lattice points of the level's parameter space
 * (longitude/latitude in radians, or the south polar plane), so they never slide over the ground.
 * In the outer band of a level, odd vertices morph onto the edges of the next coarser level so the
 * two meet exactly. Define POLAR_PARAM for the polar plane.
 */
const clipmapVertex = /* glsl */ `
  uniform vec2 levelOrigin;
  uniform float levelCell;
  uniform float gridCells;
  uniform float isCoarsest;
  /** Kilometres of ground per parameter unit (both parameterisations are ~radians on a unit sphere). */
  uniform float kmPerParam;
  uniform float heightScale;
  uniform float relief;

  varying vec2 vParam;
  varying vec3 vUp;
  varying vec3 vWorldPos;

  vec3 paramToUp(vec2 prm) {
  #ifdef POLAR_PARAM
    return polarToScene(prm);
  #else
    float lat = clamp(prm.y, -0.5 * PI, 0.5 * PI);
    vec3 m = vec3(cos(lat) * cos(prm.x), cos(lat) * sin(prm.x), sin(lat));
    return vec3(m.x, m.z, -m.y);
  #endif
  }

  vec3 groundPoint(vec2 prm, float spacingKm) {
    vec3 up = paramToUp(prm);
    float h = terrainHeight(up) + detailHeightM(up, spacingKm);
    return up * (1.0 + h * heightScale * relief);
  }

  void main() {
    vec2 idx = floor(position.xy * gridCells + 0.5);
    vec2 prm = levelOrigin + idx * levelCell;
    vec2 edge = abs(position.xy - 0.5) * 2.0;
    float morph = isCoarsest > 0.5 ? 0.0 : smoothstep(0.7, 0.95, max(edge.x, edge.y));
    float cellKm = levelCell * kmPerParam;
    vec3 pos = groundPoint(prm, cellKm * mix(1.0, 2.0, morph));
    vec2 odd = mod(idx, 2.0);
    if (morph > 0.0 && odd.x + odd.y > 0.0) {
      // Halfway along the coarser level's edge, as that level draws it (a straight chord).
      vec3 a = groundPoint(prm - odd * levelCell, 2.0 * cellKm);
      vec3 b = groundPoint(prm + odd * levelCell, 2.0 * cellKm);
      pos = mix(pos, 0.5 * (a + b), morph);
    }
    vec4 world = modelMatrix * vec4(pos, 1.0);
    vParam = prm;
    vUp = normalize(pos);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// ---------------------------------------------------------------- fragment shader

const terrainFragment = /* glsl */ `
  uniform sampler2D globalColorMap;
  uniform sampler2D globalNormalMap;
  uniform sampler2D innerColorMap;
  uniform sampler2D innerNormalMap;
  uniform sampler2D outerColorMap;
  uniform sampler2D outerNormalMap;
  uniform sampler2D atlasNormalMap;
  /** Annual sunlight (R), permanent shadow (G) and coverage (B) south of 80° S; see make_illumination.py. */
  uniform sampler2D lightMap;
  /** 0 terrain only, 1 sunlight heat map, 2 permanent shadow (ice). */
  uniform float layerMode;
  uniform float sunRadius;
  uniform vec4 holeRect;
  uniform float hasHole;
  /** Drawing limits per mesh: the globe stops a little inside the polar mesh, which ends at its tile. */
  uniform float minLatitude;
  uniform float maxPolarRho;

  varying vec2 vParam;
  varying vec3 vUp;
  varying vec3 vWorldPos;

  const int SHADOW_STEPS = 36;
  const float SHADOW_GROWTH = 1.25;
  const float OBSERVER_M = 2.0;

  void surface(vec3 up, out vec3 albedo, out vec3 tangentNormal) {
    vec2 uv = equirectUv(toMoonFixed(up));
    albedo = sampleEquirect(globalColorMap, uv).rgb;
    tangentNormal = sampleEquirect(globalNormalMap, uv).xyz * 2.0 - 1.0;
    vec2 auv = atlasUv(up);
    float aw = atlasWeight(auv);
    if (aw > 0.0) tangentNormal = mix(tangentNormal, texture2D(atlasNormalMap, auv).xyz * 2.0 - 1.0, aw);
    vec2 xy;
    vec2 w = polarWeights(up, xy);
    if (w.y > 0.0) {
      vec2 ouv = xy / (2.0 * outerRhoMax) + 0.5;
      albedo = mix(albedo, texture2D(outerColorMap, ouv).rgb, w.y);
      tangentNormal = mix(tangentNormal, texture2D(outerNormalMap, ouv).xyz * 2.0 - 1.0, w.y);
    }
    if (w.x > 0.0) {
      vec2 iuv = xy / (2.0 * innerRhoMax) + 0.5;
      albedo = mix(albedo, texture2D(innerColorMap, iuv).rgb, w.x);
      tangentNormal = mix(tangentNormal, texture2D(innerNormalMap, iuv).xyz * 2.0 - 1.0, w.x);
    }
  }

  /** Share of the solar disc visible: march along the ground toward the Sun, keep the worst margin. */
  float sunVisibility(vec3 up) {
    float su = dot(sunDir, up);
    if (su <= -0.05) return 0.0;
    vec3 flatSun = sunDir - su * up;
    float horiz = length(flatSun);
    if (horiz < 1e-6) return 1.0;
    float tanEl = su / horiz;
    vec3 dir = flatSun / horiz;
    float h0 = terrainHeightFast(up) * relief + OBSERVER_M;
    // Jitter anchored to the ground (not the screen), so shadow edges do not shimmer while moving.
    float jitter = fract(52.9829189 * fract(dot(floor(equirectUv(toMoonFixed(up)) * vec2(65536.0, 32768.0)), vec2(0.06711056, 0.00583715))));
    float d = dataSpacingM(up) * (0.8 + 0.4 * jitter);
    float vis = 1.0;
    for (int i = 0; i < SHADOW_STEPS; i++) {
      float a = d / MOON_RADIUS_M;
      vec3 q = normalize(up * cos(a) + dir * sin(a));
      // The sphere curves away beneath a straight sunbeam.
      float beam = h0 + d * tanEl + d * d / (2.0 * MOON_RADIUS_M);
      float blockAngle = (terrainHeightFast(q) * relief - beam) / d;
      vis = min(vis, clamp(0.5 - blockAngle / (2.0 * sunRadius), 0.0, 1.0));
      if (vis <= 0.0) break;
      d *= SHADOW_GROWTH;
    }
    return vis;
  }

  void main() {
    if (hasHole > 0.5 && all(greaterThan(vParam, holeRect.xy)) && all(lessThan(vParam, holeRect.zw))) discard;
  #ifdef POLAR_PARAM
    if (length(vParam) > maxPolarRho) discard;
  #else
    if (abs(vParam.y) > 0.5 * PI || vParam.y < minLatitude) discard;
  #endif
    vec3 up = normalize(vUp);
    vec3 albedo;
    vec3 tangentNormal;
    surface(up, albedo, tangentNormal);
    vec3 color = shade(up, tangentNormal, albedo, sunVisibility(up), vWorldPos);
    if (layerMode > 2.5) {
      // Self-lit hazard map, readable in shadow too: green safe, amber marginal, red too steep.
      float s = slopeDegAt(up);
      vec3 tint = mix(vec3(0.25, 0.8, 0.45), vec3(1.0, 0.71, 0.28), smoothstep(6.5, 9.5, s));
      tint = mix(tint, vec3(0.95, 0.27, 0.22), smoothstep(13.0, 17.0, s));
      // Safe ground only gets a light wash; the steep places, the ones to avoid, stand out.
      color = mix(color, tint * 0.9, mix(0.22, 0.6, smoothstep(6.5, 15.0, s)));
    } else if (layerMode > 0.5 && toMoonFixed(up).z < 0.0) {
      vec2 luv = polarPlane(up) / (2.0 * innerRhoMax) + 0.5;
      // Only inside the map: outside it clamp-to-edge would smear the border texels into streaks
      // running out to the limb. B is the coverage mask, so it also fades the overlay's rim softly.
      vec2 inside = step(vec2(0.0), luv) * step(luv, vec2(1.0));
      vec4 light = texture2D(lightMap, clamp(luv, 0.0, 1.0));
      float rim = 1.0 - smoothstep(0.82, 1.0, length(luv - 0.5) * 2.0);
      float cover = inside.x * inside.y * smoothstep(0.5, 1.0, light.b) * rim;
      if (cover > 0.0) {
        if (layerMode < 1.5) {
          // Self-lit so the map reads in shadow too: deep blue (dark all year) to amber (sunny).
          vec3 heat = mix(vec3(0.04, 0.07, 0.3), vec3(1.0, 0.71, 0.28), light.r);
          heat = mix(heat, vec3(1.0, 0.96, 0.85), smoothstep(0.75, 1.0, light.r));
          color = mix(color, heat * 1.3, 0.62 * cover);
        } else {
          color = mix(color, mix(color * 0.55, vec3(0.35, 0.85, 1.0) * 1.6, light.g * 0.85), cover);
        }
      }
    }
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const vertexChunks = `${common}\n${terrainData}\n${craterField}\n${clipmapVertex}`;
const fragmentChunks = `${common}\n${equirectSampling}\n${craterField}\n${lighting}\n${terrainData}\n${terrainFragment}`;

export const globeVertexShader = vertexChunks;
export const globeFragmentShader = fragmentChunks;
export const polarVertexShader = `#define POLAR_PARAM\n${vertexChunks}`;
export const polarFragmentShader = `#define POLAR_PARAM\n${fragmentChunks}`;
