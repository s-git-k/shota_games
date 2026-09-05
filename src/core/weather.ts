/**
 * 天候サイクルの純粋計算 (Phase 3)。
 * ワールドシード + 経過秒数だけから決定論的に「晴れ/雨/雪」を求める。
 * サーバー等の外部状態を持たず、dayNight.ts と同様にいつ呼んでも同じ結果になる関数群にすることで、
 * セーブ/ロードやチャンクのロード順によらず再現性を保証する。
 */
import type { Biome } from "./biome";
import { hash2D } from "./rng";

/** 実際にプレイヤーへ提示される天候の種類。 */
export type WeatherKind = "clear" | "rain" | "snow";

export const WEATHER_LABELS_JA: Record<WeatherKind, string> = {
  clear: "晴れ",
  rain: "雨",
  snow: "雪"
};

/** 1つの天候フェーズ (晴れ/悪天候) が続くおおよその長さ (秒)。 */
const WEATHER_SEGMENT_SECONDS = 210;
/** フェーズの切り替わり際に晴れ<->悪天候を滑らかにフェードさせる秒数。 */
const WEATHER_FADE_SECONDS = 20;
/** ある区間が「悪天候(降水)」になる確率。残りは「晴れ」。 */
const PRECIPITATION_CHANCE = 0.42;

/** 内部的な大局天候: 降水があるかどうかだけを決める (種類はバイオームで決まる)。 */
export type GlobalWeatherPhase = "clear" | "precipitating";

interface WeatherSegment {
  index: number;
  phase: GlobalWeatherPhase;
  /** このセグメント内の経過秒数 (0..WEATHER_SEGMENT_SECONDS)。 */
  localSeconds: number;
}

function segmentPhase(seed: number, index: number): GlobalWeatherPhase {
  const roll = hash2D(seed ^ 0x9e37, index, 0);
  return roll < PRECIPITATION_CHANCE ? "precipitating" : "clear";
}

function getWeatherSegment(seed: number, elapsedSeconds: number): WeatherSegment {
  const safeElapsed = Math.max(0, elapsedSeconds);
  const index = Math.floor(safeElapsed / WEATHER_SEGMENT_SECONDS);
  const localSeconds = safeElapsed - index * WEATHER_SEGMENT_SECONDS;
  return { index, phase: segmentPhase(seed, index), localSeconds };
}

/** その瞬間の大局天候 (バイオームを考慮しない、降水の有無だけ)。 */
export function getGlobalWeatherPhase(seed: number, elapsedSeconds: number): GlobalWeatherPhase {
  return getWeatherSegment(seed, elapsedSeconds).phase;
}

/**
 * 天候の強さ (0..1)。セグメントの前後 WEATHER_FADE_SECONDS 秒でフェードし、
 * 「晴れ」区間は常に0、「悪天候」区間は両端をなだらかにした山型になる。
 * 描画側 (パーティクル数・音量など) はこの値をそのまま掛け合わせて使う。
 */
export function getWeatherIntensity(seed: number, elapsedSeconds: number): number {
  const segment = getWeatherSegment(seed, elapsedSeconds);
  if (segment.phase !== "precipitating") return 0;
  const fadeIn = Math.min(1, segment.localSeconds / WEATHER_FADE_SECONDS);
  const remaining = WEATHER_SEGMENT_SECONDS - segment.localSeconds;
  const fadeOut = Math.min(1, remaining / WEATHER_FADE_SECONDS);
  return Math.max(0, Math.min(1, Math.min(fadeIn, fadeOut)));
}

/**
 * バイオームを考慮した実際の天候種別を求める。
 * - 大局天候が「晴れ」なら常に clear。
 * - snowfield / mountain (高地) は雪。
 * - desert は雨が降ってもすぐ蒸発するとみなし clear のまま (乾燥地帯らしい演出)。
 * - それ以外 (grassland / forest / ocean) は rain。
 */
export function resolveWeatherKind(seed: number, elapsedSeconds: number, biome: Biome): WeatherKind {
  const phase = getGlobalWeatherPhase(seed, elapsedSeconds);
  if (phase === "clear") return "clear";
  if (biome === "snowfield" || biome === "mountain") return "snow";
  if (biome === "desert") return "clear";
  return "rain";
}

export function getWeatherLabelJa(kind: WeatherKind): string {
  return WEATHER_LABELS_JA[kind];
}
