/**
 * Moon surface shading. The Moon has no atmosphere, so there is no ambient sky light: what the Sun
 * does not hit is black, apart from a faint earthshine. Reflectance follows the Lunar-Lambert model,
 * which is why the full Moon looks evenly bright instead of darkening toward the limb.
 *
 * Two meshes share this lighting: the global sphere, and a dense south polar cap (south of 80° S)
 * built in polar stereographic space so the pole is not pinched. The cap also ray-marches the LOLA
 * height map toward the Sun, so crater floors fill with true cast shadows.
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

/** Fragment-only helper (it needs screen-space derivatives). */
const equirectSampling = /* glsl */ `
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
  uniform float detailStrength;
  uniform vec3 detailCellKm;

  const float LUNAR_LAMBERT_L = 0.6;

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

  vec3 detailGradient(vec3 up) {
    vec3 g = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      vec3 q = up * (MOON_RADIUS_M / 1000.0 / detailCellKm[i]);
      // Fade each octave out once its craters shrink below a couple of pixels.
      float fade = 1.0 - smoothstep(0.15, 0.6, length(fwidth(q)));
      if (fade > 0.0) g += craterGradient(q) * fade;
    }
    return g;
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

// ---------------------------------------------------------------- whole Moon

/**
 * The whole-Moon mesh is one grid laid out around `focus` (the point the camera looks at) in an
 * azimuthal equidistant projection: vertices crowd near the focus and thin out toward the far
 * side, like a game terrain LOD. Heights come from the LOLA equirectangular map.
 */
const globeCommon = /* glsl */ `
  uniform sampler2D heightMap;
  uniform float heightMin;
  uniform float heightRange;
  uniform vec2 heightSize;

  vec2 equirectUv(vec3 p) {
    return vec2(atan(p.y, p.x) / (2.0 * PI) + 0.5, asin(clamp(p.z, -1.0, 1.0)) / PI + 0.5);
  }

  /** Bilinear LOLA height in metres under a scene-space direction; longitude wraps. */
  float globeHeight(vec3 up) {
    vec2 f = equirectUv(toMoonFixed(up)) * heightSize - 0.5;
    vec2 i = floor(f);
    vec2 t = f - i;
    int w = int(heightSize.x);
    int x0 = int(mod(i.x, heightSize.x));
    int x1 = (x0 + 1) % w;
    int y0 = clamp(int(i.y), 0, int(heightSize.y) - 1);
    int y1 = min(y0 + 1, int(heightSize.y) - 1);
    float h00 = decodeHeight(texelFetch(heightMap, ivec2(x0, y0), 0));
    float h10 = decodeHeight(texelFetch(heightMap, ivec2(x1, y0), 0));
    float h01 = decodeHeight(texelFetch(heightMap, ivec2(x0, y1), 0));
    float h11 = decodeHeight(texelFetch(heightMap, ivec2(x1, y1), 0));
    return mix(mix(h00, h10, t.x), mix(h01, h11, t.x), t.y) * heightRange + heightMin;
  }
`;

export const moonVertexShader = /* glsl */ `
  ${common}
  ${globeCommon}
  uniform float heightScale;
  uniform float relief;
  uniform vec3 focus;
  uniform float density;

  varying vec3 vUp;
  varying vec3 vWorldPos;

  void main() {
    vec2 g = position.xy;
    vec2 w = g * (density + (1.0 - density) * g * g) * PI;
    float angle = min(length(w), PI);
    vec3 east;
    vec3 north;
    localAxes(focus, east, north);
    vec3 up = angle < 1e-7 ? focus : normalize(cos(angle) * focus + sin(angle) * normalize(w.x * east + w.y * north));
    float h = globeHeight(up);
    vec4 world = modelMatrix * vec4(up * (1.0 + h * heightScale * relief), 1.0);
    vUp = up;
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const moonFragmentShader = /* glsl */ `
  ${common}
  ${equirectSampling}
  ${lighting}
  ${globeCommon}
  uniform sampler2D colorMap;
  uniform sampler2D normalMap;
  uniform float polarCutZ;
  uniform float sunRadius;

  varying vec3 vUp;
  varying vec3 vWorldPos;

  const int SHADOW_STEPS = 26;
  const float SHADOW_FIRST_M = 1300.0; // about half a height-map pixel
  const float SHADOW_GROWTH = 1.27;
  /** Above this Sun elevation (sine) cast shadows are too short to see at this data resolution. */
  const float SHADOW_MAX_SUN = 0.35;


  /** Share of the solar disc visible here: march along the ground toward the Sun. */
  float sunVisibility(vec3 up) {
    float su = dot(sunDir, up);
    if (su <= -0.05) return 0.0;
    if (su >= SHADOW_MAX_SUN) return 1.0;
    vec3 flatSun = sunDir - su * up;
    float horiz = length(flatSun);
    if (horiz < 1e-6) return 1.0;
    float tanEl = su / horiz;
    vec3 dir = flatSun / horiz;
    float h0 = globeHeight(up) * relief + 2.0;
    // Jitter anchored to the ground (not the screen), so shadow edges do not shimmer while moving.
    float jitter = fract(52.9829189 * fract(dot(floor(equirectUv(toMoonFixed(up)) * vec2(32768.0, 16384.0)), vec2(0.06711056, 0.00583715))));
    float d = SHADOW_FIRST_M * (0.8 + 0.4 * jitter);
    float vis = 1.0;
    for (int i = 0; i < SHADOW_STEPS; i++) {
      float a = d / MOON_RADIUS_M;
      vec3 q = normalize(up * cos(a) + dir * sin(a));
      float beam = h0 + d * tanEl + d * d / (2.0 * MOON_RADIUS_M);
      float blockAngle = (globeHeight(q) * relief - beam) / d;
      vis = min(vis, clamp(0.5 - blockAngle / (2.0 * sunRadius), 0.0, 1.0));
      if (vis <= 0.0) break;
      d *= SHADOW_GROWTH;
    }
    return vis;
  }

  void main() {
    vec3 up = normalize(vUp);
    vec3 p = toMoonFixed(up);
    if (p.z < polarCutZ) discard; // the polar cap draws this part
    vec2 uv = equirectUv(p);
    vec3 albedo = sampleEquirect(colorMap, uv).rgb;
    vec3 tangentNormal = sampleEquirect(normalMap, uv).xyz * 2.0 - 1.0;
    gl_FragColor = vec4(shade(up, tangentNormal, albedo, sunVisibility(up), vWorldPos), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------- south polar cap

/** Unit-sphere point for polar stereographic (X, Y) about the south pole, in scene axes. */
const polarCommon = /* glsl */ `
  uniform float rhoMax;
  uniform sampler2D heightMap;
  uniform float heightMin;
  uniform float heightRange;
  uniform float heightSize;

  vec3 polarToScene(vec2 xy) {
    float r2 = dot(xy, xy);
    vec3 p = vec3(4.0 * xy, r2 - 4.0) / (r2 + 4.0);
    return vec3(p.x, p.z, -p.y);
  }

  vec2 polarUv(vec2 xy) { return xy / (2.0 * rhoMax) + 0.5; }

  /**
   * Near its outer edge a tile fades into the coarser global maps (height, relief, colour), so at
   * the very edge both meshes agree and no step or line shows. blendStart >= rhoEdge disables it.
   */
  uniform float blendStart;
  uniform float rhoEdgeBlend;
  uniform sampler2D globalHeightMap;
  uniform vec2 globalHeightSize;

  float edgeBlend(vec2 xy) { return smoothstep(blendStart, rhoEdgeBlend, length(xy)); }

  vec2 globalUv(vec3 up) {
    vec3 p = toMoonFixed(up);
    return vec2(atan(p.y, p.x) / (2.0 * PI) + 0.5, asin(clamp(p.z, -1.0, 1.0)) / PI + 0.5);
  }

  float globalHeightAt(vec3 up) {
    vec2 f = globalUv(up) * globalHeightSize - 0.5;
    vec2 i = floor(f);
    vec2 t = f - i;
    int w = int(globalHeightSize.x);
    int x0 = int(mod(i.x, globalHeightSize.x));
    int x1 = (x0 + 1) % w;
    int y0 = clamp(int(i.y), 0, int(globalHeightSize.y) - 1);
    int y1 = min(y0 + 1, int(globalHeightSize.y) - 1);
    float h00 = decodeHeight(texelFetch(globalHeightMap, ivec2(x0, y0), 0));
    float h10 = decodeHeight(texelFetch(globalHeightMap, ivec2(x1, y0), 0));
    float h01 = decodeHeight(texelFetch(globalHeightMap, ivec2(x0, y1), 0));
    float h11 = decodeHeight(texelFetch(globalHeightMap, ivec2(x1, y1), 0));
    return mix(mix(h00, h10, t.x), mix(h01, h11, t.x), t.y) * heightRange + heightMin;
  }

  /** Bilinear height in metres; the packed bytes cannot be filtered by the GPU, so taps are decoded first. */
  float heightAt(vec2 uv) {
    vec2 f = uv * heightSize - 0.5;
    vec2 i = floor(f);
    vec2 t = f - i;
    ivec2 maxI = ivec2(int(heightSize) - 1);
    ivec2 a = clamp(ivec2(i), ivec2(0), maxI);
    ivec2 b = clamp(ivec2(i) + 1, ivec2(0), maxI);
    float h00 = decodeHeight(texelFetch(heightMap, a, 0));
    float h10 = decodeHeight(texelFetch(heightMap, ivec2(b.x, a.y), 0));
    float h01 = decodeHeight(texelFetch(heightMap, ivec2(a.x, b.y), 0));
    float h11 = decodeHeight(texelFetch(heightMap, b, 0));
    return mix(mix(h00, h10, t.x), mix(h01, h11, t.x), t.y) * heightRange + heightMin;
  }
`;

/**
 * The cap grid is not uniform: vertices crowd around `focus` (the point the camera looks at) and
 * thin out toward the far edge, like a game terrain LOD. `density` near 0 packs them tightly.
 */
export const polarVertexShader = /* glsl */ `
  ${common}
  ${polarCommon}
  uniform float heightScale;
  uniform float relief;
  uniform vec2 focus;
  uniform float extent;
  uniform float density;

  varying vec2 vXY;
  varying vec3 vUp;
  varying vec3 vWorldPos;

  void main() {
    vec2 g = position.xy;
    vec2 xy = focus + g * (density + (1.0 - density) * g * g) * extent;
    // Pin vertices that land beyond the tile onto its rim. Otherwise, when the camera looks away
    // from the pole, huge triangles would cut chords across the sphere and smear polar texture
    // over the rest of the Moon.
    float rho = length(xy);
    if (rho > rhoMax) xy *= rhoMax / rho;
    vec3 up = polarToScene(xy);
    float b = edgeBlend(xy);
    float h = b > 0.0 ? mix(heightAt(polarUv(xy)), globalHeightAt(up), b) : heightAt(polarUv(xy));
    vec4 world = modelMatrix * vec4(up * (1.0 + h * heightScale * relief), 1.0);
    vXY = xy;
    vUp = up;
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const polarFragmentShader = /* glsl */ `
  ${common}
  ${equirectSampling}
  ${lighting}
  ${polarCommon}
  uniform sampler2D colorMap;
  uniform sampler2D normalMap;
  uniform sampler2D globalColorMap;
  uniform sampler2D globalNormalMap;
  uniform float rhoEdge;
  uniform float innerRho;
  uniform float sunRadius;

  varying vec2 vXY;
  varying vec3 vUp;
  varying vec3 vWorldPos;

  const int SHADOW_STEPS = 40;
  const float SHADOW_FIRST_M = 80.0;
  const float SHADOW_GROWTH = 1.23;
  const float OBSERVER_M = 2.0;

  /**
   * Share of the solar disc visible from this point: march toward the Sun over the terrain and
   * keep the worst margin, measured in solar radii, so shadow edges get a true penumbra.
   */
  float sunVisibility(vec2 xy, vec3 up) {
    vec3 east;
    vec3 north;
    localAxes(up, east, north);
    float se = dot(sunDir, east);
    float sn = dot(sunDir, north);
    float su = dot(sunDir, up);
    float horiz = length(vec2(se, sn));
    if (horiz < 1e-6) return su > 0.0 ? 1.0 : 0.0;
    float tanEl = su / horiz;

    // In the polar plane, north points away from the pole and east is 90° counter-clockwise from it.
    vec2 radial = length(xy) > 1e-7 ? normalize(xy) : vec2(1.0, 0.0);
    vec2 eastPlane = vec2(-radial.y, radial.x);
    vec2 dir = normalize(se * eastPlane + sn * radial);

    vec2 uv0 = polarUv(xy);
    // Shadows follow the terrain as drawn, so they stay consistent with the relief setting.
    float h0 = heightAt(uv0) * relief + OBSERVER_M;
    float metresPerUv = 2.0 * rhoMax * MOON_RADIUS_M;
    float vis = 1.0;
    // Offset the march per pixel so the fixed step spacing never shows up as stepped shadow edges.
    // Jitter anchored to the ground (not the screen), so shadow edges do not shimmer while moving.
    float jitter = fract(52.9829189 * fract(dot(floor(polarUv(xy) * 16384.0), vec2(0.06711056, 0.00583715))));
    float d = SHADOW_FIRST_M * (0.8 + 0.4 * jitter);
    for (int i = 0; i < SHADOW_STEPS; i++) {
      vec2 uv = uv0 + dir * (d / metresPerUv);
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
      // The sphere curves away beneath a straight sunbeam.
      float beam = h0 + d * tanEl + d * d / (2.0 * MOON_RADIUS_M);
      float blockAngle = (heightAt(uv) * relief - beam) / d;
      vis = min(vis, clamp(0.5 - blockAngle / (2.0 * sunRadius), 0.0, 1.0));
      if (vis <= 0.0) break;
      d *= SHADOW_GROWTH;
    }
    return vis;
  }

  void main() {
    float r = length(vXY);
    if (r > rhoEdge || r < innerRho) discard; // a coarser mesh draws outside, a finer tile inside
    vec3 up = normalize(vUp);
    vec2 uv = polarUv(vXY);
    vec3 albedo = texture2D(colorMap, uv).rgb;
    vec3 tangentNormal = texture2D(normalMap, uv).xyz * 2.0 - 1.0;
    float b = edgeBlend(vXY);
    if (b > 0.0) {
      vec2 guv = globalUv(up);
      albedo = mix(albedo, sampleEquirect(globalColorMap, guv).rgb, b);
      tangentNormal = mix(tangentNormal, sampleEquirect(globalNormalMap, guv).xyz * 2.0 - 1.0, b);
    }
    float shadow = dot(up, sunDir) > -0.05 ? sunVisibility(vXY, up) : 0.0;
    gl_FragColor = vec4(shade(up, tangentNormal, albedo, shadow, vWorldPos), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
