# Lunar Site Navigator

Pick any spot on the Moon and any date, and see where the Sun and Earth sit above the **real terrain horizon** —
how much sunlight a solar array gets, when the Sun sets behind a ridge, and when Earth drops out of view and
direct-to-Earth radio goes dark.

Built for the NASA Space Apps Challenge 2026 — *Lunar Landing Site Navigator*.

## What it does

- **3D Moon** with the LRO colour mosaic, LOLA relief and physically based lighting: one hard light source,
  no atmosphere, faint earthshine. The Sun, Earth and stars are placed from real ephemerides.
- **South pole in true 3D**: the cap south of 80° S is a dense terrain mesh built from the LOLA 80 m polar
  elevation map, refined around the camera, with shadows ray-marched toward the Sun (including the
  penumbra of the solar disc). A *Relief 1× / 3× / 5×* switch exaggerates heights for the eye only —
  every number in the panels is computed from true heights.
- **Pick a site** from Apollo, south pole and robotic lander targets, type coordinates, or click the globe.
- **Navigate like Google Earth**: drag to slide the ground, right-drag or Shift-drag to turn and tilt toward
  the horizon, scroll or pinch to zoom. Choosing a site flies the camera there along a smooth arc.
- **Sun & Earth readouts**: elevation, azimuth, terrain horizon in that direction, clearance, share of the disc
  above the ridge, and a countdown to the next sunset / Earthset (or rise).
- **Horizon panorama**: the 360° LOLA skyline around the site, with the Sun's and Earth's paths over the month.
- **Lunar-month timeline**: sunlight and Earth visibility hour by hour; drag to scrub, or play at 1 h – 1 day per second.
- **Compare** up to four sites side by side: sunlight share, Earth visibility, both at once, longest night.
- **LUNA, the mission assistant**: a guided tour of the interface, plain-language briefings on the selected
  site, and one-click rankings of the best sites for solar power, Earth link, or both.
- **Terrain everywhere**: a clipmap (nested, ground-pinned grids) draws the whole Moon; LOLA 64 px/deg detail
  tiles stream in around the camera, the 80 m and 240 m polar maps take over near the south pole.

## How it works

| Piece | Source / method |
| --- | --- |
| Sun, Earth, Moon positions | [astronomy-engine](https://github.com/cosinekitty/astronomy) (VSOP87 / ELP), IAU lunar rotation model |
| Terrain | LOLA elevation: 4 px/° globally, 16 px/° south of 60° S (NASA SVS CGI Moon Kit), and the 80 m/px polar stereographic map LDEM_80S_80M south of 80° S (NASA PDS) |
| Horizon | For 720 azimuths, march 1–300 km outward along great circles and keep the highest elevation angle (curvature included; no refraction because there is no air) |
| Visibility | Share of the solar / Earth disc above the local horizon line |

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for ephemeris, horizon and visibility maths
```

The prepared assets live in `public/`. To rebuild them from the NASA originals, download into one folder:

- `lroc_color_poles_16k.tif` (or `_8k`), `ldem_64_uint.tif`, `ldem_16_uint.tif` and `ldem_4_uint.tif` from
  [svs.gsfc.nasa.gov/4720](https://svs.gsfc.nasa.gov/4720)
- `ldem_80s_80m.img` from the
  [LOLA polar GDR on NASA PDS](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/)
- optionally an `earth.jpg` Blue Marble map

then run (the PDS grid's axis orientation is matched automatically against the global data):

```bash
python3 -I scripts/prepare_assets.py ~/path/to/nasa-files
python3 -I scripts/make_tiles.py ~/path/to/nasa-files     # 540 streamed 10° detail tiles
```

## Data credits

- Moon colour and elevation: NASA Scientific Visualization Studio, *CGI Moon Kit* (LRO LROC and LOLA teams).
- South polar elevation: LRO LOLA team, *LDEM_80S_80M*, NASA Planetary Data System.
- Unimaged (permanently shadowed) gaps in the colour mosaic are filled with the surrounding regolith colour;
  small craters below the data resolution are added procedurally for close-up texture and play no part in
  any calculation.
- Earth: day map `earth_atmos_2048.jpg` from the three.js examples (MIT).
- Ephemerides: Don Cross, *Astronomy Engine* (MIT).
