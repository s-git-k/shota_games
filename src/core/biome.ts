/**
 * Phase 3: バイオーム (地域気候) の決定論的な選択。
 * ワールドシードと世界座標だけから、6種類のバイオームのうちどれに属するかを純粋関数で求める。
 * 大縮尺 (広範囲でゆっくり変化する) ノイズを使うことで、バイオームの領域は広く滑らかに
 * つながり、1ブロックごとに切り替わるような「市松模様」にはならない。
 */
import { fractalNoise2D } from "./rng";

export type Biome = "grassland" | "forest" | "desert" | "snowfield" | "mountain" | "ocean";

export const BIOMES: readonly Biome[] = ["grassland", "forest", "desert", "snowfield", "mountain", "ocean"];

/** HUD/UI表示用の日本語ラベル。 */
export const BIOME_LABELS_JA: Record<Biome, string> = {
  grassland: "草原",
  forest: "森林",
  desert: "砂漠",
  snowfield: "雪原",
  mountain: "山地",
  ocean: "海"
};

// 広い領域でゆっくり変化するよう、非常に小さいスケールを使う (数百ブロック規模の地域になる)。
const ELEVATION_SCALE = 0.0035;
const TEMPERATURE_SCALE = 0.003;
const MOISTURE_SCALE = 0.0027;

// 気温/湿度は標高と別系統のノイズにするため、シードをずらして相関を薄める。
const TEMPERATURE_SEED_OFFSET = 0x7e57c0de;
const MOISTURE_SEED_OFFSET = 0x51de51de;

/** 広域の標高 (0=低地/海寄り, 1=高山寄り)。海と山地の判定、および地形の高さ計算の両方に使う。 */
export function macroElevation(seed: number, worldX: number, worldZ: number): number {
  return fractalNoise2D(seed, worldX, worldZ, 3, 0.5, ELEVATION_SCALE);
}

/** 広域の気温 (0=寒い, 1=暑い)。 */
export function macroTemperature(seed: number, worldX: number, worldZ: number): number {
  return fractalNoise2D(seed + TEMPERATURE_SEED_OFFSET, worldX, worldZ, 3, 0.5, TEMPERATURE_SCALE);
}

/** 広域の湿度 (0=乾燥, 1=多湿)。 */
export function macroMoisture(seed: number, worldX: number, worldZ: number): number {
  return fractalNoise2D(seed + MOISTURE_SEED_OFFSET, worldX, worldZ, 3, 0.5, MOISTURE_SCALE);
}

const OCEAN_ELEVATION_MAX = 0.32;
const MOUNTAIN_ELEVATION_MIN = 0.78;
const SNOW_TEMPERATURE_MAX = 0.35;
const DESERT_TEMPERATURE_MIN = 0.62;
const DESERT_MOISTURE_MAX = 0.42;
const FOREST_MOISTURE_MIN = 0.52;

/**
 * 指定したワールドXZ座標のバイオームを決定論的に返す。
 * 標高で海/山地を最優先に判定し (領域を広く保つ)、残りを気温/湿度で
 * 草原・森林・砂漠・雪原に振り分ける。
 */
export function getBiomeAt(seed: number, worldX: number, worldZ: number): Biome {
  const elevation = macroElevation(seed, worldX, worldZ);
  if (elevation < OCEAN_ELEVATION_MAX) return "ocean";
  if (elevation > MOUNTAIN_ELEVATION_MIN) return "mountain";

  const temperature = macroTemperature(seed, worldX, worldZ);
  const moisture = macroMoisture(seed, worldX, worldZ);

  if (temperature < SNOW_TEMPERATURE_MAX) return "snowfield";
  if (temperature > DESERT_TEMPERATURE_MIN && moisture < DESERT_MOISTURE_MAX) return "desert";
  if (moisture > FOREST_MOISTURE_MIN) return "forest";
  return "grassland";
}

/** バイオームごとの木の生えやすさ (0=生えない)。森林は密、草原はまばら、雪原はまばらな白樺。 */
export function treeChanceForBiome(biome: Biome): number {
  switch (biome) {
    case "forest":
      return 0.09;
    case "grassland":
      return 0.02;
    case "snowfield":
      return 0.015;
    default:
      return 0;
  }
}

/** 雪原の木は白樺 (既存ブロックを流用) にして見た目のバリエーションを出す。 */
export function usesBirchTree(biome: Biome): boolean {
  return biome === "snowfield";
}

/**
 * 新規プレイヤー用に、開始地点から最も近い陸地の候補を決定論的に探す。
 * 地形チャンクを生成せず広域バイオームだけを調べるため、海スタートを避けても軽量。
 */
export function findNearestLandPosition(
  seed: number,
  startX = 0,
  startZ = 0,
  maxRadius = 512,
  step = 8
): { x: number; z: number } {
  if (getBiomeAt(seed, startX, startZ) !== "ocean") {
    return { x: startX, z: startZ };
  }

  for (let radius = step; radius <= maxRadius; radius += step) {
    for (let offset = -radius; offset <= radius; offset += step) {
      const candidates = [
        { x: startX + offset, z: startZ - radius },
        { x: startX + offset, z: startZ + radius },
        { x: startX - radius, z: startZ + offset },
        { x: startX + radius, z: startZ + offset }
      ];
      for (const candidate of candidates) {
        if (getBiomeAt(seed, candidate.x, candidate.z) !== "ocean") {
          return candidate;
        }
      }
    }
  }

  return { x: startX, z: startZ };
}
