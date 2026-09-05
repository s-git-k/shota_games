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
 */
import type { BlockEdit } from "./world";
import type { CameraMode, Facing, MovementMode, Vec3Int } from "./types";
import { isValidBlockId, isValidBlockKey } from "./blocks";
import { isValidItemKey } from "./items";
import { BLOCKS_PER_CHUNK } from "./chunk";
import { DEFAULT_GAME_MODE, isGameMode, type GameMode } from "./gameMode";
import { DAY_LENGTH_SECONDS } from "./dayNight";
import { MAX_HEALTH, MAX_HUNGER } from "./survival";
import {
  CURRENT_TERRAIN_GENERATOR_VERSION,
  TERRAIN_GENERATOR_VERSION_LEGACY
} from "./terrain";

/** 現在の保存スキーマバージョン。フォーマットを変えたら必ず上げて migrate() を追加する。 */
export const SAVE_SCHEMA_VERSION = 2;

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

export interface DeathDropSaveData {
  position: Vec3Int;
  inventory: Record<string, number>;
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
  /** 死亡地点に残された回収可能な持ち物。 */
  deathDrop: DeathDropSaveData | null;
  /** 経過ゲーム内時間 (秒)。昼夜サイクルの再現に使う。 */
  timeOfDaySeconds: number;
  /**
   * 地形ジェネレーターバージョン (Phase 3で追加)。このワールドのチャンクを再生成するときに
   * 使うロジックを固定する。既存ワールドの地形が新しい生成ロジックで書き換わらないようにするための値。
   */
  terrainGeneratorVersion: number;
  /** チャンクキー("cx,cz") -> 差分ブロック配列 */
  edits: Array<[string, BlockEditPlain[]]>;
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
    deathDrop: null,
    timeOfDaySeconds: DAY_LENGTH_SECONDS * 0.25,
    terrainGeneratorVersion: CURRENT_TERRAIN_GENERATOR_VERSION,
    edits: []
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

function validateDeathDrop(v: unknown): DeathDropSaveData | null {
  if (v == null) return null;
  if (typeof v !== "object" || Array.isArray(v)) {
    throw new SaveValidationError("死亡ドロップの形式が不正です。");
  }
  const raw = v as Record<string, unknown>;
  return {
    position: validateVec3(raw.position, "死亡ドロップ位置"),
    inventory: validateInventory(raw.inventory)
  };
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
  const deathDrop = validateDeathDrop(raw.deathDrop);
  const timeOfDaySeconds = isFiniteNumber(raw.timeOfDaySeconds) && raw.timeOfDaySeconds >= 0
    ? raw.timeOfDaySeconds
    : DAY_LENGTH_SECONDS * 0.25;
  const terrainGeneratorVersion = validateTerrainGeneratorVersion(raw.terrainGeneratorVersion);
  const edits = validateEdits(raw.edits ?? []);

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
    deathDrop,
    timeOfDaySeconds,
    terrainGeneratorVersion,
    edits
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
