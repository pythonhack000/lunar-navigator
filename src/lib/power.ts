/**
 * Solar power at a site from the Sun's height and how much of its disc clears the terrain.
 * Near the poles the Sun skims the horizon, so landers there stand their arrays upright; a flat
 * panel would see almost nothing. The numbers are a first estimate, not a power budget.
 */
export type ArrayType = 'auto' | 'horizontal' | 'vertical' | 'tracking';
export type ResolvedArray = Exclude<ArrayType, 'auto'>;

export interface PowerConfig {
  arrayType: ArrayType;
  areaM2: number;
  /** Cell-to-bus efficiency, 0..1. */
  efficiency: number;
  loadW: number;
  batteryWh: number;
}

export const SOLAR_CONSTANT_W_M2 = 1361;
/** Example small lander; the user replaces these with their own hardware. */
export const DEFAULT_POWER: PowerConfig = { arrayType: 'auto', areaM2: 4, efficiency: 0.28, loadW: 150, batteryWh: 2000 };
/** Past this latitude the Sun stays low enough that upright panels collect more than flat ones. */
const AUTO_VERTICAL_ABOVE_LAT_DEG = 45;

const DEG = Math.PI / 180;

export function resolveArray(type: ArrayType, latDeg: number): ResolvedArray {
  if (type !== 'auto') return type;
  return Math.abs(latDeg) >= AUTO_VERTICAL_ABOVE_LAT_DEG ? 'vertical' : 'horizontal';
}

/** Share of a panel's full output, 0..1. Vertical panels are assumed to turn to face the Sun's azimuth. */
export function panelShare(array: ResolvedArray, elDeg: number, visibleFraction: number): number {
  if (array === 'tracking') return visibleFraction;
  const facing = array === 'horizontal' ? Math.max(0, Math.sin(elDeg * DEG)) : Math.max(0, Math.cos(elDeg * DEG));
  return facing * visibleFraction;
}

export const powerWatts = (cfg: PowerConfig, share: number): number => SOLAR_CONSTANT_W_M2 * cfg.areaM2 * cfg.efficiency * share;

export function powerSeries(cfg: PowerConfig, latDeg: number, elevation: Float32Array, visible: Float32Array): Float32Array {
  const array = resolveArray(cfg.arrayType, latDeg);
  const out = new Float32Array(elevation.length);
  for (let i = 0; i < out.length; i++) out[i] = powerWatts(cfg, panelShare(array, elevation[i], visible[i]));
  return out;
}

export interface EnergyResult {
  meanW: number;
  peakW: number;
  generatedKWh: number;
  /** Lowest battery level over the span, 0..1, starting full. */
  minCharge: number;
  /** Battery that would just have carried the load through the worst stretch. */
  batteryNeededWh: number;
  /** First sample where the battery is empty, or null if it never is. */
  firstEmptyIndex: number | null;
}

/** Runs the battery through the series: charges on surplus, drains on deficit, starting full. */
export function simulateEnergy(series: Float32Array, stepHours: number, cfg: PowerConfig): EnergyResult {
  let charge = cfg.batteryWh;
  let minCharge = charge;
  let deficit = 0;
  let worstDeficit = 0;
  let total = 0;
  let peakW = 0;
  let firstEmptyIndex: number | null = null;
  for (let i = 0; i < series.length; i++) {
    const netWh = (series[i] - cfg.loadW) * stepHours;
    charge = Math.min(cfg.batteryWh, Math.max(0, charge + netWh));
    minCharge = Math.min(minCharge, charge);
    if (charge <= 0 && firstEmptyIndex === null) firstEmptyIndex = i;
    deficit = Math.max(0, deficit - netWh);
    worstDeficit = Math.max(worstDeficit, deficit);
    total += series[i];
    peakW = Math.max(peakW, series[i]);
  }
  return {
    meanW: series.length > 0 ? total / series.length : 0,
    peakW,
    generatedKWh: (total * stepHours) / 1000,
    minCharge: cfg.batteryWh > 0 ? minCharge / cfg.batteryWh : 0,
    batteryNeededWh: worstDeficit,
    firstEmptyIndex,
  };
}

const REGOLITH_ABSORPTANCE = 0.88;
const REGOLITH_EMISSIVITY = 0.95;
const STEFAN_BOLTZMANN = 5.670374e-8;
/** Rough lunar-night surface temperature; permanently shadowed craters are colder still. */
export const NIGHT_SURFACE_K = 90;

/** Radiative balance of level ground: a rough figure for how hot the regolith gets under this Sun. */
export function surfaceTempK(elDeg: number, visibleFraction: number): number {
  const absorbed = REGOLITH_ABSORPTANCE * SOLAR_CONSTANT_W_M2 * Math.max(0, Math.sin(elDeg * DEG)) * visibleFraction;
  return Math.max(NIGHT_SURFACE_K, (absorbed / (REGOLITH_EMISSIVITY * STEFAN_BOLTZMANN)) ** 0.25);
}
