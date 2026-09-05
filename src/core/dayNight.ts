/**
 * 昼夜サイクルの純粋計算。
 * 経過秒数からその日の時刻 (0..1) を求め、空の色・光の強さ・敵対生物の出現可否などを
 * 決定論的に計算する。実際のThree.jsシーンへの適用はgame.ts側で行う。
 */

/** 1日 (昼+夜) の長さ (秒)。現実の12分でゲーム内の1日が経過する。 */
export const DAY_LENGTH_SECONDS = 720;

/** 0.5未満が昼、0.5以上が夜。 */
export const NIGHT_START = 0.5;
export const NIGHT_END = 1.0;

export interface TimeOfDay {
  /** 0..1 (0=夜明け, 0.25=正午, 0.5=日没, 0.75=真夜中) */
  fraction: number;
  /** 経過した日数 (0始まり) */
  dayNumber: number;
}

export function getTimeOfDay(elapsedSeconds: number): TimeOfDay {
  const safeElapsed = Math.max(0, elapsedSeconds);
  const dayNumber = Math.floor(safeElapsed / DAY_LENGTH_SECONDS);
  const fraction = (safeElapsed % DAY_LENGTH_SECONDS) / DAY_LENGTH_SECONDS;
  return { fraction, dayNumber };
}

export function isNight(fraction: number): boolean {
  return fraction >= NIGHT_START && fraction < NIGHT_END;
}

/** HH:MM 形式の時刻ラベル (0.0=6:00の朝として表示し、直感的にわかりやすくする)。 */
export function formatTimeLabel(fraction: number): string {
  // fraction 0 を朝6時として扱う (0.5=夜18時, 0.75=深夜0時 相当の見た目にする)
  const totalMinutes = Math.floor(((fraction * 24 + 6) % 24) * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothPulse(fraction: number, center: number, width: number): number {
  const d = Math.abs(fraction - center);
  const t = Math.max(0, 1 - d / width);
  return t * t * (3 - 2 * t);
}

/** 太陽の明るさ (0=真夜中, 1=正午)。 */
export function getSunIntensity(fraction: number): number {
  // 正午(0.25)を中心にした滑らかな山、真夜中(0.75)側は0に近い
  const angle = (fraction - 0.25) * Math.PI * 2;
  const raw = Math.cos(angle);
  return Math.max(0, raw) ** 0.6;
}

/** 環境光の下限を確保しつつ、昼夜で滑らかに変化する強さ。 */
export function getAmbientIntensity(fraction: number): number {
  const sun = getSunIntensity(fraction);
  return lerp(0.18, 0.9, sun);
}

export interface SkyColors {
  sky: number;
  fog: number;
}

const SKY_DAY = { r: 0x9f, g: 0xd8, b: 0xff };
const SKY_SUNSET = { r: 0xff, g: 0xa8, b: 0x6b };
const SKY_NIGHT = { r: 0x0a, g: 0x0f, b: 0x2a };

function mixColor(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, t: number): number {
  const r = Math.round(lerp(a.r, b.r, t));
  const g = Math.round(lerp(a.g, b.g, t));
  const bl = Math.round(lerp(a.b, b.b, t));
  return (r << 16) | (g << 8) | bl;
}

/** 空/フォグの色を時刻から求める。日没・夜明けにオレンジがかった色を挟む。 */
export function getSkyColors(fraction: number): SkyColors {
  const sunset = smoothPulse(fraction, 0.5, 0.08) + smoothPulse(fraction, 1.0, 0.08) + smoothPulse(fraction, 0.0, 0.08);
  const sun = getSunIntensity(fraction);
  const nightMix = 1 - sun;

  let base = mixColor(SKY_DAY, SKY_NIGHT, Math.min(1, nightMix * 1.05));
  const baseColor = { r: (base >> 16) & 0xff, g: (base >> 8) & 0xff, b: base & 0xff };
  const withSunset = mixColor(baseColor, SKY_SUNSET, Math.min(1, sunset));
  return { sky: withSunset, fog: withSunset };
}

/** 地下 (太陽光が届かないとみなすY座標) の閾値。 */
export const UNDERGROUND_Y_THRESHOLD = 14;

/** 敵対生物が出現できる条件 (夜間、または地下の暗所)。 */
export function canSpawnHostileAt(fraction: number, y: number): boolean {
  return isNight(fraction) || y < UNDERGROUND_Y_THRESHOLD;
}
