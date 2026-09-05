/**
 * シード付き手続き型地形生成。
 * チャンク座標とワールドシードだけから決定論的にブロックを生成するため、
 * 保存データにはプレイヤーが変更した差分だけを持てば良い (地形は再生成可能)。
 *
 * Phase 3 での重要な方針: 既存ワールドの再現性を壊さないため、この第1世代
 * (Phase 1-2) の生成ロジックは一切変更しない。バイオーム/洞窟/鉱脈対応の
 * 新しい生成ロジックは terrainV2.ts に実装し、generateChunk() が
 * 「地形ジェネレーターバージョン」に応じてどちらを使うか振り分ける。
 */
import { fractalNoise2D, hash2D } from "./rng";
import { CHUNK_HEIGHT, CHUNK_SIZE_X, CHUNK_SIZE_Z, Chunk, localIndex } from "./chunk";
import { getBlockDefByKey } from "./blocks";
import { SEA_LEVEL, MAX_TERRAIN_HEIGHT } from "./worldgenConstants";
import { generateChunkIdsV2 } from "./terrainV2";

export { SEA_LEVEL, MAX_TERRAIN_HEIGHT };

/** Phase 1-2 の従来地形 (バイオーム/洞窟なし)。既存セーブの再現用に維持する。 */
export const TERRAIN_GENERATOR_VERSION_LEGACY = 1;
/** Phase 3 のバイオーム/洞窟/鉱脈/地下水/遺跡対応地形。新規ワールドはこちらを使う。 */
export const TERRAIN_GENERATOR_VERSION_BIOMES = 2;
/** 新規ワールド作成時に使う最新バージョン。 */
export const CURRENT_TERRAIN_GENERATOR_VERSION = TERRAIN_GENERATOR_VERSION_BIOMES;

const GRASS = getBlockDefByKey("grass").id;
const DIRT = getBlockDefByKey("dirt").id;
const STONE = getBlockDefByKey("stone").id;
const SAND = getBlockDefByKey("sand").id;
const SNOW = getBlockDefByKey("snow").id;
const WOOD_LOG = getBlockDefByKey("wood_log").id;
const LEAVES = getBlockDefByKey("leaves").id;

/** 指定ワールドXZ座標の地表高さ (整数ブロックY) を返す。 */
export function terrainHeight(seed: number, worldX: number, worldZ: number): number {
  const base = fractalNoise2D(seed, worldX, worldZ, 5, 0.5, 0.008);
  const h = SEA_LEVEL + Math.floor(base * (MAX_TERRAIN_HEIGHT - SEA_LEVEL));
  return Math.max(1, Math.min(CHUNK_HEIGHT - 1, h));
}

function surfaceBlockFor(height: number): number {
  if (height <= SEA_LEVEL + 2) return SAND;
  if (height >= SEA_LEVEL + 20) return SNOW;
  return GRASS;
}

/** 木を生やせる表面ブロックかどうか (草の上のみ)。 */
function canGrowTree(surface: number): boolean {
  return surface === GRASS;
}

/**
 * 1チャンク分の地形ブロックIDを生成する。
 * 木はチャンク境界をまたがないよう、内側の余白があるローカル座標にのみ生やす。
 */
export function generateChunkIds(seed: number, cx: number, cz: number): Uint8Array {
  const ids = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Z * CHUNK_HEIGHT);
  const baseX = cx * CHUNK_SIZE_X;
  const baseZ = cz * CHUNK_SIZE_Z;

  const heights = new Int16Array(CHUNK_SIZE_X * CHUNK_SIZE_Z);

  for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
      const wx = baseX + lx;
      const wz = baseZ + lz;
      const height = terrainHeight(seed, wx, wz);
      heights[lz * CHUNK_SIZE_X + lx] = height;
      const surface = surfaceBlockFor(height);
      for (let y = 0; y <= height && y < CHUNK_HEIGHT; y++) {
        let id: number;
        if (y === height) {
          id = surface;
        } else if (y >= height - 3) {
          id = surface === SAND ? SAND : DIRT;
        } else {
          id = STONE;
        }
        ids[localIndex(lx, y, lz)] = id;
      }
    }
  }

  // 木の配置 (境界から2マス以上離れた場所のみ、重なり回避のため簡易的に間引く)
  for (let lx = 2; lx < CHUNK_SIZE_X - 2; lx++) {
    for (let lz = 2; lz < CHUNK_SIZE_Z - 2; lz++) {
      const wx = baseX + lx;
      const wz = baseZ + lz;
      const height = heights[lz * CHUNK_SIZE_X + lx] ?? SEA_LEVEL;
      const surface = surfaceBlockFor(height);
      if (!canGrowTree(surface)) continue;
      const chance = hash2D(seed ^ 0x5eed, wx, wz);
      if (chance > 0.03) continue;
      // 近傍に既に木があるなら間引く (簡易的な最小間隔)
      const spacing = hash2D(seed ^ 0x5eed, Math.floor(wx / 3), Math.floor(wz / 3));
      if (spacing > 0.5) continue;

      const trunkHeight = 4 + Math.floor(hash2D(seed ^ 0xf00d, wx, wz) * 2);
      const top = height + trunkHeight;
      if (top + 2 >= CHUNK_HEIGHT) continue;

      for (let ty = height + 1; ty <= top; ty++) {
        ids[localIndex(lx, ty, lz)] = WOOD_LOG;
      }
      // 葉の塊 (球っぽい形)
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
            if (ids[idx] === 0) {
              ids[idx] = LEAVES;
            }
          }
        }
      }
    }
  }

  return ids;
}

export function generateChunk(
  seed: number,
  cx: number,
  cz: number,
  generatorVersion: number = CURRENT_TERRAIN_GENERATOR_VERSION
): Chunk {
  const ids =
    generatorVersion >= TERRAIN_GENERATOR_VERSION_BIOMES ? generateChunkIdsV2(seed, cx, cz) : generateChunkIds(seed, cx, cz);
  return new Chunk(cx, cz, ids);
}
