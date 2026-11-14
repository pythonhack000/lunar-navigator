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
- **Compare** up to four scenarios side by side, each a site with its own landing date: sunlight, solar energy,
  Earth visibility, both at once, longest night. Delay buttons add the same site 1, 7 or 30 days later.
- **Windows for a mission**: enter its length, sunlight and link needs and the antenna margin, and see every
  landing date that works in the next year.
- **Power**: flat, upright or tracking arrays, area, efficiency, load and battery give watts, the month's energy
  and whether the battery survives the night, plus a rough ground temperature.
- **What if?**: sunlight and link mapped cell by cell around the site, the same mission delayed up to 90 days,
  and the libration that lifts the Earth in and out of view.
- **Landing day**: stand at Apollo and robotic sites at the moment they touched down, with the Sun computed for it, and switch back to now on the spot.
- **Take it with you**: a one-page PDF, an hourly CSV, and a link that reopens the same site, date and comparison.
- **LUNA, the mission assistant**: a guided tour of the interface, plain-language briefings on the selected
  site, one-click rankings, a Moon-versus-Earth explainer and a small game, Mission commander.
- **Terrain everywhere**: a clipmap (nested, ground-pinned grids) draws the whole Moon; LOLA 64 px/deg detail
  tiles stream in around the camera, the 80 m and 240 m polar maps take over near the south pole.

## How it works

| Piece | Source / method |
| --- | --- |
| Sun, Earth, Moon positions | [astronomy-engine](https://github.com/cosinekitty/astronomy) (VSOP87 / ELP), IAU lunar rotation model |
| Terrain | LOLA elevation: 4 px/° globally, 16 px/° south of 60° S (NASA SVS CGI Moon Kit), and the 80 m/px polar stereographic map LDEM_80S_80M south of 80° S (NASA PDS) |
| Horizon | For 720 azimuths, march 1–300 km outward along great circles and keep the highest elevation angle (curvature included; no refraction because there is no air) |
| Visibility | Share of the solar / Earth disc above the local horizon line |
| Accuracy | Sun and Earth positions checked against NASA/JPL Horizons (DE441): largest error 0.006° over two years at four sites (`scripts/fetch_horizons.py`); illumination compared with published LOLA studies |
| NASA Moon Trek, live | For south polar sites the site panel reads NASA's LROC WAC year-of-sunlight map (Speyerer et al. 2016) straight from Moon Trek's WMTS tiles and shows it beside a year of our own geometry at the same point; the LROC NAC 1 m mosaic gives a photo of the spot. If Moon Trek is unreachable the panel keeps our figure alone. Tiles are cached by the service worker |
| Power | 1361 W/m² × area × efficiency × panel facing × visible disc; a first estimate, not a power budget |
| Mission sites | Published landing points where they exist. Most future missions name only a region, marked ≈. Dates are operators' plans as of November 2026 |

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
sh scripts/webp_heights.sh                                  # height maps as lossless WebP (needs cwebp)
```

Height maps ship as lossless WebP, about 25% smaller than PNG and byte-identical once decoded.

On a slow connection (measured on the first textures, below about 6 Mbit/s) or with the browser's data
saver on, the app keeps the preview textures and skips the ~100 MB sharp set, leaving the bandwidth for
the detail tiles around the camera. On software rendering or older integrated graphics it skips only the
8K globe.

## Data sources

The challenge lists four resources. How the app uses each:

| Resource | Used for |
| --- | --- |
| [NASA/JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) | Reference Sun and Earth positions (DE441) that our ephemeris is checked against, in the "How accurate is this?" panel and in a unit test |
| [NASA Moon Trek](https://trek.nasa.gov/moon/) | Live: LROC WAC sunlight map and LROC NAC photo for the selected south polar site |
| [LROC Quickmap](https://quickmap.lroc.asu.edu/) | Linked from the data sources list for exploring a site further; it serves the same LRO data |
| [CSA Moon Exploration](https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/) | Background on south pole missions, linked from the data sources list |

Everything the analysis needs (terrain, colour, ephemeris) is bundled, so the app works without these
services; Moon Trek adds a second, independent figure when it can be reached. Moon Trek's Earth visibility
tiles are not used: their 8-bit pixel values do not map reliably to percentages (a near-side point that always
sees the Earth reads 83–88%).

## Privacy

The published site counts visits anonymously with [Umami](https://umami.is) (EU region, no cookies, no
personal data): pages, time on site, country, device, and which tools are opened. Nothing is counted when
running locally. Team members open the site once with `?team` to stop counting their own browser.

## Data credits

- Moon colour and elevation: NASA Scientific Visualization Studio, *CGI Moon Kit* (LRO LROC and LOLA teams).
- South polar elevation: LRO LOLA team, *LDEM_80S_80M*, NASA Planetary Data System.
- Unimaged (permanently shadowed) gaps in the colour mosaic are filled with the surrounding regolith colour;
  small craters below the data resolution are added procedurally for close-up texture and play no part in
  any calculation.
- Earth: day map `earth_atmos_2048.jpg` from the three.js examples (MIT).
- Ephemerides: Don Cross, *Astronomy Engine* (MIT).
- South polar sunlight and photo, read live: NASA Moon Trek (JPL / SSERVI); LROC WAC polar illumination
  (Speyerer et al. 2016) and LROC NAC south pole mosaic (NASA/GSFC/Arizona State University).
