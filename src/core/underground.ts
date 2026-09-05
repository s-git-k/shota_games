/**
 * Phase 3: 地下生成 (洞窟・鉱脈・地下水・遺跡) の純粋関数群。
 *
 * 重要な設計方針:
 * - すべてワールド座標 (worldX, worldY, worldZ) とシードだけから値を求める「純粋関数」にする。
 *   これにより、あるチャンクを生成する処理が他のチャンクの生成順序に一切依存しなくなり、
 *   「どの順番でチャンクが読み込まれても同じ結果になる」ことが構造的に保証される
 *   (チャンク境界での継ぎ目/矛盾が発生しない)。
 * - 遺跡だけは複数ブロックにまたがる構造物だが、チャンク境界をまたがないよう
 *   常にチャンク内部 (余白付き) に収まるサイズ・配置にしている。
 */
import { fractalNoise3D, hash2D, hash3D } from "./rng";
import { getBlockDefByKey } from "./blocks";
import type { Biome } from "./biome";
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, localIndex } from "./chunk";
import { SEA_LEVEL } from "./worldgenConstants";

const STONE = getBlockDefByKey("stone").id;
const WATER = getBlockDefByKey("water").id;
const METAL = getBlockDefByKey("metal").id;
const GOLD = getBlockDefByKey("gold").id;
const GLOW_CRYSTAL = getBlockDefByKey("glow_crystal").id;
const STONE_BRICK = getBlockDefByKey("stone_brick").id;
const COBBLESTONE = getBlockDefByKey("cobblestone").id;
const MOSSY_STONE = getBlockDefByKey("mossy_stone").id;

/** この高さより下には洞窟を掘らない (最下層の岩盤を保証し、地形テストの前提も壊さない)。 */
export const CAVE_MIN_Y = 4;
/** 地表からこの分だけ内側でなければ洞窟にしない (地表に穴が開いて崩れて見えるのを防ぐ)。 */
export const CAVE_SURFACE_MARGIN = 4;

/**
 * 指定したワールド座標が洞窟 (空洞) かどうか。
 * 3次元フラクタルノイズのしきい値判定によるスポンジ状の洞窟網で、トンネル/空洞として
 * 十分に歩き回れる密度になるよう閾値を調整している。
 */
export function isCaveAt(seed: number, worldX: number, worldY: number, worldZ: number, surfaceHeight: number): boolean {
  if (worldY < CAVE_MIN_Y || worldY > surfaceHeight - CAVE_SURFACE_MARGIN) return false;
  const density = fractalNoise3D(seed ^ 0x0cafe, worldX, worldY, worldZ, 3, 0.5, 0.075);
  return density > 0.6;
}

/** バイオームごとの地下水面の目安 (この高さ以下の洞窟空洞は地下水で満たされ得る)。 */
export function groundwaterLevelForBiome(biome: Biome): number {
  switch (biome) {
    case "desert":
      return SEA_LEVEL - 12; // 乾燥地なので地下水面が低く、水没しにくい
    case "ocean":
      return SEA_LEVEL + 2; // 海に近く地下水面が高い
    case "mountain":
      return SEA_LEVEL - 8;
    case "snowfield":
      return SEA_LEVEL - 5;
    default:
      return SEA_LEVEL - 6;
  }
}

/**
 * 洞窟内の指定座標が地下水で満たされているか。
 * 大きめのスケールのノイズで判定することで、単一ボクセルだけが水没するのではなく
 * まとまった「水たまり/地下水脈」として連続した領域になる。
 */
export function isGroundwaterAt(seed: number, worldX: number, worldY: number, worldZ: number, groundwaterLevel: number): boolean {
  if (worldY > groundwaterLevel) return false;
  const density = fractalNoise3D(seed ^ 0x0a9ea, worldX, worldY, worldZ, 2, 0.5, 0.035);
  return density > 0.56;
}

/**
 * 石の内部を置き換える鉱石/クリスタルを決定論的に選ぶ。
 * 既存の金属パネル/黄金ブロック/光晶石ブロックをそのまま「鉱石」として再利用し、
 * ブロック種類を増やさずに済ませている。高さ (深さ) とバイオームで出現率を変える:
 * - 金属: 海面下〜中程度の深さに幅広く分布。山地では鉱脈が豊富になる。
 * - 黄金: より深い場所にのみ、低確率で分布。山地でやや出やすい。
 * - 光晶石: 洞窟が多い深度帯にごく低確率で分布 (探索の目印/光源になる)。
 */
export function oreForVoxel(seed: number, worldX: number, worldY: number, worldZ: number, biome: Biome): number | null {
  const mountainBoost = biome === "mountain" ? 1.7 : 1;

  if (worldY <= SEA_LEVEL + 10) {
    const goldRoll = hash3D(seed ^ 0x60ed, worldX, worldY, worldZ);
    const goldChance = 0.006 * mountainBoost;
    if (goldRoll < goldChance) return GOLD;
  }

  if (worldY <= SEA_LEVEL + 30) {
    const metalRoll = hash3D(seed ^ 0x4e7a1, worldX, worldY, worldZ);
    const metalChance = (worldY <= SEA_LEVEL ? 0.028 : 0.014) * mountainBoost;
    if (metalRoll < metalChance) return METAL;
  }

  if (worldY <= SEA_LEVEL + 4) {
    const glowRoll = hash3D(seed ^ 0x910c, worldX, worldY, worldZ);
    if (glowRoll < 0.0035) return GLOW_CRYSTAL;
  }

  return null;
}

// ---- 地下遺跡 ----

const RUIN_CHANCE = 0.09;
const RUIN_MARGIN = 3;
const RUIN_SIZE_X = 5;
const RUIN_SIZE_Z = 5;
const RUIN_HEIGHT = 4;

export interface RuinPlan {
  /** チャンクローカル座標での遺跡の基準コーナー (X/Z) */
  localOriginX: number;
  localOriginZ: number;
  /** 遺跡の床のワールドY座標 */
  baseY: number;
  sizeX: number;
  sizeZ: number;
  height: number;
}

/**
 * このチャンクに地下遺跡が存在するなら、その配置計画を返す (存在しなければ null)。
 * チャンク座標のハッシュだけで決まるため、周囲のチャンクの生成状況に依存しない。
 * 遺跡は必ずチャンク内部の余白付き範囲に収まるサイズ・位置にすることで、
 * チャンク境界をまたぐ複雑さを避けている。
 */
export function ruinPlanForChunk(
  seed: number,
  cx: number,
  cz: number,
  terrainHeightAtLocal: (lx: number, lz: number) => number
): RuinPlan | null {
  const existsRoll = hash2D(seed ^ 0x1101, cx, cz);
  if (existsRoll > RUIN_CHANCE) return null;

  const maxOriginX = CHUNK_SIZE_X - RUIN_SIZE_X - RUIN_MARGIN;
  const maxOriginZ = CHUNK_SIZE_Z - RUIN_SIZE_Z - RUIN_MARGIN;
  const localOriginX = RUIN_MARGIN + Math.floor(hash2D(seed ^ 0x1102, cx, cz) * Math.max(1, maxOriginX - RUIN_MARGIN + 1));
  const localOriginZ = RUIN_MARGIN + Math.floor(hash2D(seed ^ 0x1103, cx, cz) * Math.max(1, maxOriginZ - RUIN_MARGIN + 1));

  const centerLx = localOriginX + Math.floor(RUIN_SIZE_X / 2);
  const centerLz = localOriginZ + Math.floor(RUIN_SIZE_Z / 2);
  const surfaceHeight = terrainHeightAtLocal(centerLx, centerLz);

  const depthBelowSurface = 5 + Math.floor(hash2D(seed ^ 0x1104, cx, cz) * 5);
  const baseY = Math.max(CAVE_MIN_Y + 1, surfaceHeight - depthBelowSurface);

  return { localOriginX, localOriginZ, baseY, sizeX: RUIN_SIZE_X, sizeZ: RUIN_SIZE_Z, height: RUIN_HEIGHT };
}

/**
 * 遺跡の1ボクセル分のブロックIDを求める (壁/床/内部の空洞/中央の宝を決定論的に配置)。
 * 範囲外なら null を返す (呼び出し側は既存のブロックをそのまま使う)。
 */
function ruinBlockAt(plan: RuinPlan, seed: number, cx: number, cz: number, lx: number, ly: number, lz: number): number | null {
  const dx = lx - plan.localOriginX;
  const dz = lz - plan.localOriginZ;
  const dy = ly - plan.baseY;
  if (dx < 0 || dx >= plan.sizeX || dz < 0 || dz >= plan.sizeZ || dy < 0 || dy >= plan.height) return null;

  const isEdgeX = dx === 0 || dx === plan.sizeX - 1;
  const isEdgeZ = dz === 0 || dz === plan.sizeZ - 1;
  const isWall = isEdgeX || isEdgeZ;
  const isFloor = dy === 0;
  const isCenter = dx === Math.floor(plan.sizeX / 2) && dz === Math.floor(plan.sizeZ / 2);

  if (isFloor) {
    return isCenter && dy === 0 ? GOLD : COBBLESTONE;
  }
  if (isWall) {
    // 一部の壁ブロックは苔むした石にして、古い遺跡らしい風化した見た目にする
    const mossRoll = hash3D(seed ^ 0x1201, lx + cx * CHUNK_SIZE_X, ly, lz + cz * CHUNK_SIZE_Z);
    // 入口 (1マス) を1面だけ開ける
    if (dz === 0 && dx === Math.floor(plan.sizeX / 2) && dy <= 2) return null;
    return mossRoll < 0.3 ? MOSSY_STONE : STONE_BRICK;
  }
  if (isCenter && dy === plan.height - 2) {
    // 部屋の中央に光る目印を置く (宝箱の代わりの簡易的な目印)
    return GLOW_CRYSTAL;
  }
  return 0; // 内部は空洞 (空気)
}

/**
 * 1チャンク分の ids 配列に遺跡があれば書き込む (存在しなければ何もしない)。
 * CHUNK_HEIGHT を超える範囲には書き込まない。
 */
export function stampRuinIfAny(
  ids: Uint8Array,
  seed: number,
  cx: number,
  cz: number,
  chunkHeight: number,
  terrainHeightAtLocal: (lx: number, lz: number) => number
): void {
  const plan = ruinPlanForChunk(seed, cx, cz, terrainHeightAtLocal);
  if (!plan) return;
  for (let lx = plan.localOriginX; lx < plan.localOriginX + plan.sizeX; lx++) {
    for (let lz = plan.localOriginZ; lz < plan.localOriginZ + plan.sizeZ; lz++) {
      for (let ly = plan.baseY; ly < plan.baseY + plan.height; ly++) {
        if (ly < 0 || ly >= chunkHeight) continue;
        const blockId = ruinBlockAt(plan, seed, cx, cz, lx, ly, lz);
        if (blockId === null) continue;
        ids[localIndex(lx, ly, lz)] = blockId;
      }
    }
  }
}

export { STONE, WATER };
