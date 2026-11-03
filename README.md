# Lunar Site Navigator

Pick any spot on the Moon and any date, and see where the Sun and Earth sit above the **real terrain horizon** —
how much sunlight a solar array gets, when the Sun sets behind a ridge, and when Earth drops out of view and
direct-to-Earth radio goes dark.

Built for the NASA Space Apps Challenge 2026 — *Lunar Landing Site Navigator*.

## What it does

- **3D Moon** with the LRO colour mosaic, LOLA relief and physically based lighting: one hard light source,
  no atmosphere, black shadows and faint earthshine. The Sun, Earth and stars are placed from real ephemerides.
- **Pick a site** from Apollo, south pole and robotic lander targets, type coordinates, or click the globe.
- **Sun & Earth readouts**: elevation, azimuth, terrain horizon in that direction, clearance, share of the disc
  above the ridge, and a countdown to the next sunset / Earthset (or rise).
- **Horizon panorama**: the 360° LOLA skyline around the site, with the Sun's and Earth's paths over the month.
- **Lunar-month timeline**: sunlight and Earth visibility hour by hour; drag to scrub, or play at 1 h – 1 day per second.
- **Compare** up to four sites side by side: sunlight share, Earth visibility, both at once, longest night.

## How it works

| Piece | Source / method |
| --- | --- |
| Sun, Earth, Moon positions | [astronomy-engine](https://github.com/cosinekitty/astronomy) (VSOP87 / ELP), IAU lunar rotation model |
| Terrain | LOLA gridded elevation, 4 px/° globally and 16 px/° south of 60° S (NASA SVS CGI Moon Kit) |
| Horizon | For 720 azimuths, march 1–300 km outward along great circles and keep the highest elevation angle (curvature included; no refraction because there is no air) |
| Visibility | Share of the solar / Earth disc above the local horizon line |

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for ephemeris, horizon and visibility maths
```

The prepared assets live in `public/`. To rebuild them from the NASA originals, download
`lroc_color_poles_8k.tif`, `ldem_16_uint.tif` and `ldem_4_uint.tif` from
[svs.gsfc.nasa.gov/4720](https://svs.gsfc.nasa.gov/4720) (and optionally an `earth.jpg` Blue Marble map) into a
folder, then run:

```bash
python3 -I scripts/prepare_assets.py ~/path/to/nasa-files
```

## Data credits

- Moon colour and elevation: NASA Scientific Visualization Studio, *CGI Moon Kit* (LRO LROC and LOLA teams).
- Earth: NASA Visible Earth, *Blue Marble*.
- Ephemerides: Don Cross, *Astronomy Engine* (MIT).
