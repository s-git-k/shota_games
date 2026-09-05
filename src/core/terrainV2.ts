/**
 * Phase 3: バイオーム対応の地形生成 (第2世代地形ジェネレーター)。
 *
 * terrain.ts の従来ロジック (第1世代/Phase 1-2) は既存ワールドの再現性を保つために
 * 一切変更せずそのまま残し、このファイルではバイオーム・洞窟・鉱脈・地下水・遺跡を
 * 追加した新しい生成ロジックだけを実装する。世代の切り替えは world.ts / save.ts が
 * 保持する「地形ジェネレーターバージョン」で行う (terrain.ts の generateChunk を参照)。
 */
import { fractalNoise2D, hash2D } from "./rng";
import { CHUNK_HEIGHT, CHUNK_SIZE_X, CHUNK_SIZE_Z, localIndex } from "./chunk";
import { AIR_ID, getBlockDefByKey } from "./blocks";
import { SEA_LEVEL, MAX_TERRAIN_HEIGHT } from "./worldgenConstants";
import { getBiomeAt, macroElevation, treeChanceForBiome, usesBirchTree, type Biome } from "./biome";
import { groundwaterLevelForBiome, isCaveAt, isGroundwaterAt, oreForVoxel, stampRuinIfAny } from "./underground";

const GRASS = getBlockDefByKey("grass").id;
const DIRT = getBlockDefByKey("dirt").id;
const STONE = getBlockDefByKey("stone").id;
const SAND = getBlockDefByKey("sand").id;
const SNOW = getBlockDefByKey("snow").id;
const WATER = getBlockDefByKey("water").id;
const WOOD_LOG = getBlockDefByKey("wood_log").id;
const BIRCH_LOG = getBlockDefByKey("birch_log").id;
const LEAVES = getBlockDefByKey("leaves").id;

/** 陸地側 (海・山地の判定境界) の標高が地形の高さへ与える傾き。海岸線がなだらかに繋がるよう調整。 */
const OCEAN_ELEVATION_MAX = 0.32;
const LAND_ELEVATION_SLOPE = (MAX_TERRAIN_HEIGHT - SEA_LEVEL) / (1 - OCEAN_ELEVATION_MAX);
const DETAIL_SCALE = 0.01;

/** バイオームを考慮した地表高さ。海岸線では標高が連続的につながり、急な崖にならない。 */
export function terrainHeightV2(seed: number, worldX: number, worldZ: number): number {
  const biome = getBiomeAt(seed, worldX, worldZ);
  const elevation = macroElevation(seed, worldX, worldZ);
  const detail = fractalNoise2D(seed ^ 0x7e11a1, worldX, worldZ, 5, 0.5, DETAIL_SCALE);
  const macroHeight = SEA_LEVEL + (elevation - OCEAN_ELEVATION_MAX) * LAND_ELEVATION_SLOPE;
  const amplitude = 3 + elevation * 10;
  let h = macroHeight + (detail - 0.5) * 2 * amplitude;
  if (biome === "ocean") h = Math.min(h, SEA_LEVEL - 1);
  if (biome === "mountain") h = Math.max(h, SEA_LEVEL + 10);
  return Math.max(1, Math.min(CHUNK_HEIGHT - 1, Math.round(h)));
}

function surfaceBlockForBiome(biome: Biome, height: number): number {
  if (height <= SEA_LEVEL + 1) return SAND; // 水際/湖底は常に砂にする
  switch (biome) {
    case "desert":
    case "ocean":
      return SAND;
    case "snowfield":
      return SNOW;
    case "mountain":
      return height >= SEA_LEVEL + 30 ? SNOW : STONE;
    case "forest":
    case "grassland":
    default:
      return GRASS;
  }
}

function subSurfaceBlockForBiome(biome: Biome, surface: number): number {
  if (surface === SAND) return SAND;
  if (biome === "mountain") return STONE;
  return DIRT;
}

/**
 * 1チャンク分の地形ブロックIDを生成する (バイオーム・洞窟・鉱脈・地下水・遺跡込み)。
 * すべてワールド座標 + シードのみから決まる純粋な計算のため、周囲チャンクの読み込み
 * 順序に一切依存しない (どの順で呼び出しても常に同じ結果になる)。
 */
export function generateChunkIdsV2(seed: number, cx: number, cz: number): Uint8Array {
  const ids = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Z * CHUNK_HEIGHT);
  const baseX = cx * CHUNK_SIZE_X;
  const baseZ = cz * CHUNK_SIZE_Z;

  const heights = new Int16Array(CHUNK_SIZE_X * CHUNK_SIZE_Z);
  const biomes: Biome[] = new Array(CHUNK_SIZE_X * CHUNK_SIZE_Z);

  for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
      const wx = baseX + lx;
      const wz = baseZ + lz;
      const columnIdx = lz * CHUNK_SIZE_X + lx;
      const biome = getBiomeAt(seed, wx, wz);
      const height = terrainHeightV2(seed, wx, wz);
      heights[columnIdx] = height;
      biomes[columnIdx] = biome;

      const surface = surfaceBlockForBiome(biome, height);
      const subSurface = subSurfaceBlockForBiome(biome, surface);
      const groundwaterLevel = groundwaterLevelForBiome(biome);
      const colTop = Math.min(height, CHUNK_HEIGHT - 1);

      for (let y = 0; y <= colTop; y++) {
        let id: number;
        if (y === height) {
          id = surface;
        } else if (y >= height - 3) {
          id = subSurface;
        } else {
          id = STONE;
        }

        if (y < height) {
          if (isCaveAt(seed, wx, y, wz, height)) {
            id = isGroundwaterAt(seed, wx, y, wz, groundwaterLevel) ? WATER : AIR_ID;
          } else if (y < height - 3 && id === STONE) {
            const ore = oreForVoxel(seed, wx, y, wz, biome);
            if (ore !== null) id = ore;
          }
        }

        ids[localIndex(lx, y, lz)] = id;
      }

      // 地形より低い場所は海面まで水で満たす (海・湖・入り江)
      for (let y = height + 1; y <= SEA_LEVEL && y < CHUNK_HEIGHT; y++) {
        ids[localIndex(lx, y, lz)] = WATER;
      }
    }
  }

  // 地下遺跡 (存在すれば、チャンク内部に完結する形でスタンプする)
  stampRuinIfAny(ids, seed, cx, cz, CHUNK_HEIGHT, (lx, lz) => heights[lz * CHUNK_SIZE_X + lx] ?? SEA_LEVEL);

  // 木の配置 (境界から2マス以上離れた場所のみ)。バイオームごとに密度と樹種を変える。
  for (let lx = 2; lx < CHUNK_SIZE_X - 2; lx++) {
    for (let lz = 2; lz < CHUNK_SIZE_Z - 2; lz++) {
      const wx = baseX + lx;
      const wz = baseZ + lz;
      const columnIdx = lz * CHUNK_SIZE_X + lx;
      const biome = biomes[columnIdx] ?? "grassland";
      const chance = treeChanceForBiome(biome);
      if (chance <= 0) continue;

      const height = heights[columnIdx] ?? SEA_LEVEL;
      const surface = surfaceBlockForBiome(biome, height);
      const birch = usesBirchTree(biome);
      if (birch ? surface !== SNOW : surface !== GRASS) continue;

      const roll = hash2D(seed ^ 0x5eed, wx, wz);
      if (roll > chance) continue;
      // 近傍に既に木があるなら間引く (簡易的な最小間隔)
      const spacing = hash2D(seed ^ 0x5eed, Math.floor(wx / 3), Math.floor(wz / 3));
      if (spacing > 0.5) continue;

      const trunkHeight = 4 + Math.floor(hash2D(seed ^ 0xf00d, wx, wz) * 2);
      const top = height + trunkHeight;
      if (top + 2 >= CHUNK_HEIGHT) continue;

      const logId = birch ? BIRCH_LOG : WOOD_LOG;
      for (let ty = height + 1; ty <= top; ty++) {
        ids[localIndex(lx, ty, lz)] = logId;
      }
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          for (let dy = -2; dy <= 1; dy++) {
            const nx = lx + dx;
            const nz = lz + dz;
            const ny = top + dy;
            if (nx < 0 || nx >= CHUNK_SIZE_X || nz < 0 || nz >= CHUNK_SIZE_Z) continue;
            if (ny < 0 || ny >= CHUNK_HEIGHT) continue;
            const dist = Math.sqrt(dx * dx + dz * dz + dy * dy * 0.7);
            if (dist > 2.4) continue;
            const idx = localIndex(nx, ny, nz);
            if (ids[idx] === AIR_ID) {
              ids[idx] = LEAVES;
            }
          }
        }
      }
    }
  }

  return ids;
}
