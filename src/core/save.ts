/**
 * ワールド保存データのスキーマ定義とシリアライズ/デシリアライズ (純粋関数)。
 * IndexedDB 等の実際の永続化とは独立させ、Vitest で検証しやすくしている。
 *
 * スキーマ履歴:
 *   v1: Phase 1 (クリエイティブ専用)。
 *   v2: Phase 2 でゲームモード・サバイバル状態(体力/空腹/装備)・インベントリ・
 *       復活地点/ベッド位置・昼夜時刻を追加。v1データは creative モードへ安全に移行する。
 *   (v2のまま) Phase 3 で terrainGeneratorVersion を追加。既存フィールドと同様に
 *       「欠けていればデフォルト」で移行するため、スキーマバージョン自体は上げていない。
 *       ただし terrainGeneratorVersion のデフォルトは「地形生成の互換性」を守るため、
 *       他のPhase2フィールドとは異なり "1 (従来地形)" にフォールバックする
 *       (新規ワールドは常に CURRENT_TERRAIN_GENERATOR_VERSION で作成されるため、
 *       欠けている = Phase 3 より前に作られたワールード、という前提が成り立つ)。
 *   (v2のまま) Phase 4 で progress (探索/実績の進捗) と lootedTreasures (開封済み遺跡宝箱の
 *       座標一覧) を追加。同じく「欠けていれば全項目デフォルト(未達成/空)」で移行するため
 *       スキーマバージョンは上げていない。
 *   v3: Phase 5 で以下の破壊的変更を行うため、スキーマバージョンを実際に引き上げる:
 *       - entities (生存中の生物のスナップショット) を新規追加。欠けている場合は
 *         空配列に移行する (旧セーブは「生物なし」として開き、通常のスポーン処理に任せる)。
 *       - deathDrop (単一・上書き型) を deathDrops (最大件数付きリスト、
 *         core/deathDrops.ts の MAX_DEATH_DROPS) へ置き換える。v2以前の単一
 *         deathDropは、中身を失わずリストの先頭1件として移行する
 *         (validateAndMigrateWorldSave 内の明示的な変換ロジックを参照)。
 */
import type { BlockEdit } from "./world";
import type { CameraMode, Facing, MovementMode, Vec3Int } from "./types";
import { isValidBlockId, isValidBlockKey } from "./blocks";
import { isValidItemKey } from "./items";
import { BLOCKS_PER_CHUNK } from "./chunk";
import { DEFAULT_GAME_MODE, isGameMode, type GameMode } from "./gameMode";
import { DAY_LENGTH_SECONDS } from "./dayNight";
import { MAX_HEALTH, MAX_HUNGER } from "./survival";
import { BIOMES } from "./biome";
import { isValidAchievementId } from "./achievements";
import { ENTITY_DEFINITIONS, getEntityDef, type EntityKind } from "./entities";
import { MAX_ENTITY_ID, type EntityAIState, type EntityRuntime } from "./entityAI";
import { MAX_DEATH_DROPS, type DeathDropEntry } from "./deathDrops";
import {
  CURRENT_TERRAIN_GENERATOR_VERSION,
  TERRAIN_GENERATOR_VERSION_LEGACY
} from "./terrain";

/** 現在の保存スキーマバージョン。フォーマットを変えたら必ず上げて migrate() を追加する。 */
export const SAVE_SCHEMA_VERSION = 3;

export type EquippedWeapon = "fist" | "stone_sword";

const VALID_WEAPONS: readonly EquippedWeapon[] = ["fist", "stone_sword"];

export interface PlayerSaveData {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  cameraMode: CameraMode;
  movementMode: MovementMode;
  /** サバイバルの体力 (クリエイティブでは未使用だが常に保持する)。 */
  health: number;
  /** サバイバルの空腹度。 */
  hunger: number;
  equippedWeapon: EquippedWeapon;
}

export interface BlockEditPlain {
  index: number;
  id: number;
  facing: Facing;
  open: boolean;
}

/** @deprecated Phase 4以前の単一死亡ドロップ形式。移行のためだけに型を残している。 */
export interface DeathDropSaveData {
  position: Vec3Int;
  inventory: Record<string, number>;
}

/**
 * Phase 4: 探索/実績の進捗データ。SAVE_SCHEMA_VERSIONは上げず、
 * 「欠けていれば全項目デフォルト (未達成状態)」という既存の移行パターンを踏襲する。
 */
export interface ProgressSaveData {
  placedBlocksCount: number;
  craftedItemsCount: number;
  defeatedHostilesCount: number;
  openedTreasureCount: number;
  discoveredBiomes: string[];
  caveDiscovered: boolean;
  circuitPoweredEver: boolean;
  unlockedAchievements: string[];
}

export function createEmptyProgress(): ProgressSaveData {
  return {
    placedBlocksCount: 0,
    craftedItemsCount: 0,
    defeatedHostilesCount: 0,
    openedTreasureCount: 0,
    discoveredBiomes: [],
    caveDiscovered: false,
    circuitPoweredEver: false,
    unlockedAchievements: []
  };
}

export interface WorldSaveData {
  version: number;
  id: string;
  name: string;
  seedText: string;
  seed: number;
  createdAt: number;
  updatedAt: number;
  gameMode: GameMode;
  player: PlayerSaveData;
  quickbar: number[];
  /** アイテムキー(ブロックキー/アイテムキー) -> 個数。サバイバル用インベントリ。 */
  inventory: Record<string, number>;
  /** 復活地点 (ベッドが無ければここに復活する)。 */
  spawnPoint: Vec3Int;
  /** 使用したベッドの位置 (無ければ null)。 */
  bedPosition: Vec3Int | null;
  /**
   * 死亡地点に残された回収可能な持ち物のリスト (Phase 5)。
   * 上限は core/deathDrops.ts の MAX_DEATH_DROPS を参照。
   */
  deathDrops: DeathDropEntry[];
  /** 経過ゲーム内時間 (秒)。昼夜サイクルの再現に使う。 */
  timeOfDaySeconds: number;
  /**
   * 地形ジェネレーターバージョン (Phase 3で追加)。このワールドのチャンクを再生成するときに
   * 使うロジックを固定する。既存ワールドの地形が新しい生成ロジックで書き換わらないようにするための値。
   */
  terrainGeneratorVersion: number;
  /** チャンクキー("cx,cz") -> 差分ブロック配列 */
  edits: Array<[string, BlockEditPlain[]]>;
  /** Phase 4: 探索/実績の進捗。 */
  progress: ProgressSaveData;
  /** Phase 4: 開封済みの生成遺跡宝箱の座標一覧 ("x,y,z"形式)。連続入手防止の永続マーカー。 */
  lootedTreasures: string[];
  /**
   * Phase 5: ワールドを開いたときに一度だけ復元される、生存中の生物のスナップショット。
   * (種類/ID/座標/向き/HP/AI状態/タイマー/繁殖クールダウンを含む。dead状態の個体は保存前に
   * 既に取り除かれているため、ここに"dead"が現れることはない。)
   */
  entities: EntityRuntime[];
}

export class SaveValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveValidationError";
  }
}

export interface CreateWorldParams {
  id: string;
  name: string;
  seedText: string;
  seed: number;
  now: number;
  gameMode?: GameMode;
}

export function createEmptyWorldSave(params: CreateWorldParams): WorldSaveData {
  const gameMode = params.gameMode ?? DEFAULT_GAME_MODE;
  return {
    version: SAVE_SCHEMA_VERSION,
    id: params.id,
    name: params.name,
    seedText: params.seedText,
    seed: params.seed,
    createdAt: params.now,
    updatedAt: params.now,
    gameMode,
    player: {
      x: 0,
      y: 40,
      z: 0,
      yaw: 0,
      pitch: 0,
      cameraMode: "first",
      movementMode: "walk",
      health: MAX_HEALTH,
      hunger: MAX_HUNGER,
      equippedWeapon: "fist"
    },
    quickbar: [],
    inventory: {},
    spawnPoint: { x: 0, y: 40, z: 0 },
    bedPosition: null,
    deathDrops: [],
    timeOfDaySeconds: DAY_LENGTH_SECONDS * 0.25,
    terrainGeneratorVersion: CURRENT_TERRAIN_GENERATOR_VERSION,
    edits: [],
    progress: createEmptyProgress(),
    lootedTreasures: [],
    entities: []
  };
}

export function editsMapToPlain(edits: ReadonlyMap<string, Map<number, BlockEdit>>): Array<[string, BlockEditPlain[]]> {
  const result: Array<[string, BlockEditPlain[]]> = [];
  for (const [key, map] of edits) {
    result.push([key, Array.from(map.values())]);
  }
  return result;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isValidInventoryKey(key: string): boolean {
  return isValidBlockKey(key) || isValidItemKey(key);
}

function validatePlayer(v: unknown): PlayerSaveData {
  if (typeof v !== "object" || v === null) {
    throw new SaveValidationError("プレイヤーデータが不正です。");
  }
  const p = v as Record<string, unknown>;
  if (!isFiniteNumber(p.x) || !isFiniteNumber(p.y) || !isFiniteNumber(p.z)) {
    throw new SaveValidationError("プレイヤー座標が不正です。");
  }
  if (!isFiniteNumber(p.yaw) || !isFiniteNumber(p.pitch)) {
    throw new SaveValidationError("プレイヤーの向きが不正です。");
  }
  const cameraMode = p.cameraMode === "third" ? "third" : "first";
  const movementMode = p.movementMode === "fly" ? "fly" : "walk";
  const health = isFiniteNumber(p.health) ? Math.max(0, Math.min(MAX_HEALTH, p.health)) : MAX_HEALTH;
  const hunger = isFiniteNumber(p.hunger) ? Math.max(0, Math.min(MAX_HUNGER, p.hunger)) : MAX_HUNGER;
  const equippedWeapon = (VALID_WEAPONS as readonly string[]).includes(p.equippedWeapon as string)
    ? (p.equippedWeapon as EquippedWeapon)
    : "fist";
  return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, cameraMode, movementMode, health, hunger, equippedWeapon };
}

function validateVec3(v: unknown, label: string): Vec3Int {
  if (typeof v !== "object" || v === null) {
    throw new SaveValidationError(`${label}が不正です。`);
  }
  const p = v as Record<string, unknown>;
  if (!isFiniteNumber(p.x) || !isFiniteNumber(p.y) || !isFiniteNumber(p.z)) {
    throw new SaveValidationError(`${label}の座標が不正です。`);
  }
  return { x: p.x, y: p.y, z: p.z };
}

function validateInventory(v: unknown): Record<string, number> {
  if (v === undefined) return {};
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new SaveValidationError("インベントリデータの形式が不正です。");
  }
  const out: Record<string, number> = {};
  for (const [itemKey, count] of Object.entries(v as Record<string, unknown>)) {
    if (!isValidInventoryKey(itemKey)) {
      throw new SaveValidationError(`インベントリに未知のアイテムキーが含まれています: ${itemKey}`);
    }
    if (!isFiniteNumber(count) || !Number.isInteger(count) || count < 0) {
      throw new SaveValidationError(`インベントリの個数が不正です (${itemKey})。`);
    }
    if (count > 0) out[itemKey] = count;
  }
  return out;
}

function validateSingleDeathDropEntry(v: unknown, fallbackId: string): DeathDropEntry {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new SaveValidationError("死亡ドロップの形式が不正です。");
  }
  const raw = v as Record<string, unknown>;
  const id = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : fallbackId;
  const createdAt = isFiniteNumber(raw.createdAt) ? raw.createdAt : Date.now();
  return {
    id,
    position: validateVec3(raw.position, "死亡ドロップ位置"),
    inventory: validateInventory(raw.inventory),
    createdAt
  };
}

/**
 * Phase 5: 死亡ドロップのリストを検証する。欠けている場合 (Phase 5より前のセーブ) は
 * validateAndMigrateWorldSave 側で旧形式の単一 deathDrop から移行するため、ここでは
 * 単に「配列であること・上限件数以下であること・ID重複がないこと」だけを見る。
 */
function validateDeathDrops(v: unknown): DeathDropEntry[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    throw new SaveValidationError("死亡ドロップ一覧(deathDrops)が配列ではありません。");
  }
  if (v.length > MAX_DEATH_DROPS) {
    throw new SaveValidationError(`死亡ドロップの数が多すぎます (最大${MAX_DEATH_DROPS}件)。`);
  }
  const seen = new Set<string>();
  const out: DeathDropEntry[] = [];
  v.forEach((item, i) => {
    const entry = validateSingleDeathDropEntry(item, `legacy-drop-${i}`);
    if (seen.has(entry.id)) {
      throw new SaveValidationError(`死亡ドロップIDが重複しています: ${entry.id}`);
    }
    seen.add(entry.id);
    out.push(entry);
  });
  return out;
}

/** Phase 5で保存できる生存生物の最大数 (壊れた/悪意あるインポートによる肥大化を防ぐ安全弁)。 */
const MAX_PERSISTED_ENTITIES = 64;
/** 採番時の加算が安全に行え、通常プレイでは到達しない十分大きな上限。 */
export const MAX_PERSISTED_ENTITY_ID = MAX_ENTITY_ID;
/** 生物座標の絶対値の妥当な上限 (有限だが極端に大きい座標を弾くための安全弁)。 */
const MAX_ENTITY_COORD = 1_000_000;
/** 保存時に存在しうる生物のAI状態。"dead"は死亡と同時に取り除かれるため保存対象にならない。 */
const VALID_PERSISTABLE_ENTITY_STATES: readonly EntityAIState[] = ["idle", "wander", "chase", "attack"];

function isKnownEntityKind(k: unknown): k is EntityKind {
  return typeof k === "string" && ENTITY_DEFINITIONS.some((d) => d.kind === k);
}

function validateFiniteBounded(v: unknown, label: string): number {
  if (!isFiniteNumber(v) || Math.abs(v) > MAX_ENTITY_COORD) {
    throw new SaveValidationError(`生物の${label}が不正です。`);
  }
  return v;
}

function validateEntity(v: unknown): EntityRuntime {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new SaveValidationError("生物データの形式が不正です。");
  }
  const r = v as Record<string, unknown>;
  if (!isFiniteNumber(r.id) || !Number.isInteger(r.id) || r.id <= 0 || r.id > MAX_PERSISTED_ENTITY_ID) {
    throw new SaveValidationError("生物IDが不正です。");
  }
  if (!isKnownEntityKind(r.kind)) {
    throw new SaveValidationError(`未知の生物種類です: ${String(r.kind)}`);
  }
  const kind = r.kind;
  const def = getEntityDef(kind);
  const x = validateFiniteBounded(r.x, "x座標");
  const y = validateFiniteBounded(r.y, "y座標");
  const z = validateFiniteBounded(r.z, "z座標");
  const vx = validateFiniteBounded(r.vx, "速度(vx)");
  const vy = validateFiniteBounded(r.vy, "速度(vy)");
  const vz = validateFiniteBounded(r.vz, "速度(vz)");
  const yaw = validateFiniteBounded(r.yaw, "向き(yaw)");
  if (!isFiniteNumber(r.hp) || r.hp < 0 || r.hp > def.maxHp) {
    throw new SaveValidationError(`生物のHPが不正です (${kind})。`);
  }
  if (typeof r.state !== "string" || !VALID_PERSISTABLE_ENTITY_STATES.includes(r.state as EntityAIState)) {
    throw new SaveValidationError(`生物の状態(state)が不正です: ${String(r.state)}`);
  }
  if (!isFiniteNumber(r.stateTimer) || !isFiniteNumber(r.attackCooldownTimer) || !isFiniteNumber(r.breedCooldown)) {
    throw new SaveValidationError("生物のタイマー(stateTimer/attackCooldownTimer/breedCooldown)が不正です。");
  }
  return {
    id: r.id,
    kind,
    x,
    y,
    z,
    vx,
    vy,
    vz,
    hp: r.hp,
    state: r.state as EntityAIState,
    stateTimer: r.stateTimer,
    attackCooldownTimer: r.attackCooldownTimer,
    yaw,
    breedCooldown: r.breedCooldown
  };
}

/**
 * Phase 5: 保存された生存生物のスナップショットを検証する。
 * 欠けている場合 (Phase 5より前のセーブ) は空配列に移行し、通常のスポーン処理に任せる。
 * 件数上限・既知の種類・有限で妥当な範囲の座標・種類ごとの最大HP以内・有効な状態・
 * ID重複なしを厳格に検証し、壊れた/悪意あるデータをサイレントに受け入れない。
 */
function validateEntities(v: unknown): EntityRuntime[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    throw new SaveValidationError("生物データ(entities)が配列ではありません。");
  }
  if (v.length > MAX_PERSISTED_ENTITIES) {
    throw new SaveValidationError(`保存されている生物の数が多すぎます (最大${MAX_PERSISTED_ENTITIES}体)。`);
  }
  const seenIds = new Set<number>();
  const out: EntityRuntime[] = [];
  for (const item of v) {
    const entity = validateEntity(item);
    if (seenIds.has(entity.id)) {
      throw new SaveValidationError(`生物IDが重複しています: ${entity.id}`);
    }
    seenIds.add(entity.id);
    out.push(entity);
  }
  return out;
}

const VALID_BIOME_IDS: readonly string[] = BIOMES;

function nonNegativeIntOrDefault(v: unknown, label: string, fallback: number): number {
  if (v === undefined) return fallback;
  if (!isFiniteNumber(v) || !Number.isInteger(v) || v < 0) {
    throw new SaveValidationError(`${label}が不正です。`);
  }
  return v;
}

function booleanOrDefault(v: unknown, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  if (typeof v !== "boolean") return fallback;
  return v;
}

function validateStringArrayOfKnown(v: unknown, isKnown: (s: string) => boolean, label: string): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    throw new SaveValidationError(`${label}の形式が不正です (配列ではありません)。`);
  }
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string" || !isKnown(item)) {
      throw new SaveValidationError(`${label}に未知の値が含まれています: ${String(item)}`);
    }
    out.push(item);
  }
  return out;
}

/**
 * Phase 4: 探索/実績の進捗を検証する。
 * 欠けている場合 (=Phase 4より前に作られたセーブ) は全項目デフォルト(未達成)に移行する。
 * 個々のフィールドが不正な型/値の場合はサイレントに無視せず例外を投げる (壊れたデータの検出)。
 */
function validateProgress(v: unknown): ProgressSaveData {
  if (v === undefined) return createEmptyProgress();
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new SaveValidationError("進捗データ(progress)の形式が不正です。");
  }
  const raw = v as Record<string, unknown>;
  return {
    placedBlocksCount: nonNegativeIntOrDefault(raw.placedBlocksCount, "設置ブロック数", 0),
    craftedItemsCount: nonNegativeIntOrDefault(raw.craftedItemsCount, "クラフト回数", 0),
    defeatedHostilesCount: nonNegativeIntOrDefault(raw.defeatedHostilesCount, "撃破数", 0),
    openedTreasureCount: nonNegativeIntOrDefault(raw.openedTreasureCount, "宝箱開封数", 0),
    discoveredBiomes: validateStringArrayOfKnown(
      raw.discoveredBiomes,
      (s) => VALID_BIOME_IDS.includes(s),
      "発見済みバイオーム"
    ),
    caveDiscovered: booleanOrDefault(raw.caveDiscovered, false),
    circuitPoweredEver: booleanOrDefault(raw.circuitPoweredEver, false),
    unlockedAchievements: validateStringArrayOfKnown(raw.unlockedAchievements, isValidAchievementId, "解除済み実績")
  };
}

/** "x,y,z" (整数x3) 形式の座標キーかどうかを検証する。 */
function isValidPosKey(s: string): boolean {
  const parts = s.split(",");
  if (parts.length !== 3) return false;
  return parts.every((p) => /^-?\d+$/.test(p));
}

/**
 * Phase 4: 開封済みの生成遺跡宝箱の座標一覧を検証する。
 * 欠けている場合 (=Phase 4より前に作られたセーブ) は空配列に移行する。
 */
function validateLootedTreasures(v: unknown): string[] {
  return validateStringArrayOfKnown(v, isValidPosKey, "開封済み宝箱の座標一覧");
}

/**
 * 地形ジェネレーターバージョンを検証する。
 * 欠けている場合 (=Phase 3より前に作られたセーブ) は "1 (従来地形)" にフォールバックし、
 * 既存ワールドの地形が新しい生成ロジックへ勝手に切り替わらないようにする。
 * 現在サポートしている最大値より大きい値は、未来のクライアントで作られたものとして拒否する。
 */
function validateTerrainGeneratorVersion(v: unknown): number {
  if (v === undefined) return TERRAIN_GENERATOR_VERSION_LEGACY;
  if (!isFiniteNumber(v) || !Number.isInteger(v) || v < TERRAIN_GENERATOR_VERSION_LEGACY) {
    throw new SaveValidationError("地形ジェネレーターバージョンが不正です。");
  }
  if (v > CURRENT_TERRAIN_GENERATOR_VERSION) {
    throw new SaveValidationError(
      `このセーブデータの地形ジェネレーター (v${v}) は現在のバージョン (v${CURRENT_TERRAIN_GENERATOR_VERSION}) より新しく読み込めません。`
    );
  }
  return v;
}

function validateEdits(v: unknown): Array<[string, BlockEditPlain[]]> {
  if (!Array.isArray(v)) {
    throw new SaveValidationError("編集データ(edits)が配列ではありません。");
  }
  const out: Array<[string, BlockEditPlain[]]> = [];
  for (const entry of v) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || !Array.isArray(entry[1])) {
      throw new SaveValidationError("編集データの形式が不正です。");
    }
    const cells: BlockEditPlain[] = [];
    for (const c of entry[1]) {
      if (typeof c !== "object" || c === null) {
        throw new SaveValidationError("編集セルの形式が不正です。");
      }
      const rec = c as Record<string, unknown>;
      if (
        !isFiniteNumber(rec.index) ||
        !Number.isInteger(rec.index) ||
        rec.index < 0 ||
        rec.index >= BLOCKS_PER_CHUNK ||
        !isFiniteNumber(rec.id) ||
        !Number.isInteger(rec.id) ||
        !isValidBlockId(rec.id)
      ) {
        throw new SaveValidationError("編集セルの値が不正です。");
      }
      const facingValue = isFiniteNumber(rec.facing) ? rec.facing : 0;
      if (!Number.isInteger(facingValue) || facingValue < 0 || facingValue > 3) {
        throw new SaveValidationError("編集セルの向きが不正です。");
      }
      const facing = facingValue as Facing;
      cells.push({ index: rec.index, id: rec.id, facing, open: Boolean(rec.open) });
    }
    out.push([entry[0], cells]);
  }
  return out;
}

/**
 * 未知の入力 (JSONパース結果やIndexedDBから読んだもの) を検証し、
 * 現行スキョーマに合わせて移行 (migrate) した WorldSaveData を返す。
 * 壊れた/未知の形式は例外を投げてサイレントに失敗しないようにする。
 */
export function validateAndMigrateWorldSave(input: unknown): WorldSaveData {
  if (typeof input !== "object" || input === null) {
    throw new SaveValidationError("セーブデータの形式が不正です (オブジェクトではありません)。");
  }
  const raw = input as Record<string, unknown>;
  const version = typeof raw.version === "number" ? raw.version : 0;

  if (version > SAVE_SCHEMA_VERSION) {
    throw new SaveValidationError(
      `このセーブデータ (v${version}) は現在のバージョン (v${SAVE_SCHEMA_VERSION}) より新しく読み込めません。`
    );
  }

  // v1 (またはそれ以前) -> v2: ゲームモード/サバイバル状態/インベントリ/復活地点/時刻が
  // 存在しない場合はデフォルト値 (クリエイティブ・満タン・空・現在地点) を補う。
  // (各フィールドは version を問わず「欠けていればデフォルト」というフォールバックで
  //  自然に移行できるため、バージョン分岐は個別には不要。)

  if (typeof raw.id !== "string" || raw.id.length === 0) {
    throw new SaveValidationError("ワールドIDが不正です。");
  }
  if (typeof raw.name !== "string" || raw.name.length === 0) {
    throw new SaveValidationError("ワールド名が不正です。");
  }
  if (typeof raw.seedText !== "string") {
    throw new SaveValidationError("シード文字列が不正です。");
  }
  if (!isFiniteNumber(raw.seed)) {
    throw new SaveValidationError("シード値が不正です。");
  }
  if (!isFiniteNumber(raw.createdAt) || !isFiniteNumber(raw.updatedAt)) {
    throw new SaveValidationError("タイムスタンプが不正です。");
  }

  const gameMode: GameMode = isGameMode(raw.gameMode) ? raw.gameMode : DEFAULT_GAME_MODE;
  const player = validatePlayer(raw.player);
  const quickbar = Array.isArray(raw.quickbar)
    ? raw.quickbar.map((id) => {
        if (!isFiniteNumber(id) || !Number.isInteger(id) || !isValidBlockId(id)) {
          throw new SaveValidationError("クイックバーに不正なブロックIDが含まれています。");
        }
        return id;
      })
    : [];
  const inventory = validateInventory(raw.inventory);
  const spawnPoint = validateVec3(
    raw.spawnPoint ?? { x: Math.floor(player.x), y: Math.max(0, Math.floor(player.y) - 1), z: Math.floor(player.z) },
    "復活地点"
  );
  const bedPosition = raw.bedPosition == null ? null : validateVec3(raw.bedPosition, "ベッド位置");
  // Phase 5: deathDrops (リスト) を優先し、無ければ旧形式 (単一 deathDrop) から
  // 中身を失わずに1件のリストへ移行する。どちらも無ければ空リスト。
  let deathDrops: DeathDropEntry[];
  if (raw.deathDrops !== undefined) {
    deathDrops = validateDeathDrops(raw.deathDrops);
  } else if (raw.deathDrop != null) {
    deathDrops = [validateSingleDeathDropEntry(raw.deathDrop, "legacy-death-drop")];
  } else {
    deathDrops = [];
  }
  const entities = validateEntities(raw.entities);
  const timeOfDaySeconds = isFiniteNumber(raw.timeOfDaySeconds) && raw.timeOfDaySeconds >= 0
    ? raw.timeOfDaySeconds
    : DAY_LENGTH_SECONDS * 0.25;
  const terrainGeneratorVersion = validateTerrainGeneratorVersion(raw.terrainGeneratorVersion);
  const edits = validateEdits(raw.edits ?? []);
  const progress = validateProgress(raw.progress);
  const lootedTreasures = validateLootedTreasures(raw.lootedTreasures);

  return {
    version: SAVE_SCHEMA_VERSION,
    id: raw.id,
    name: raw.name,
    seedText: raw.seedText,
    seed: raw.seed,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    gameMode,
    player,
    quickbar,
    inventory,
    spawnPoint,
    bedPosition,
    deathDrops,
    timeOfDaySeconds,
    terrainGeneratorVersion,
    edits,
    progress,
    lootedTreasures,
    entities
  };
}

export function serializeWorldToJson(data: WorldSaveData): string {
  return JSON.stringify(data, null, 2);
}

export function parseWorldFromJson(text: string): WorldSaveData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SaveValidationError("JSONとして読み込めませんでした。ファイルが破損している可能性があります。");
  }
  return validateAndMigrateWorldSave(parsed);
}
