/**
 * IndexedDB を使ったワールド/設定/アバターの永続化。
 * 大きくなりうるワールド編集データ (edits) を扱うため IndexedDB を採用している。
 * スキーマの妥当性検証・マイグレーションは core/save.ts 側の純粋関数に任せる。
 */
import { validateAndMigrateWorldSave, parseWorldFromJson, type WorldSaveData } from "./save";
import { DEFAULT_SETTINGS, clampSettings, type GameSettings } from "./settings";
import { DEFAULT_AVATAR, type AvatarConfig } from "./avatar";
import { DEFAULT_GAME_MODE, isGameMode, type GameMode } from "./gameMode";
import { validateAndMigrateBlueprint, serializeBlueprintToJson, type BlueprintRecord } from "./blueprint";

const DB_NAME = "tsumiki-oukoku";
// Phase 4: 設計図(ブループリント)保存用ストアを追加したため2へ更新。
// onupgradeneeded は追加のみ行い、既存の worlds/kv ストアには一切手を触れない
// (既存ワールド・設定・アバターは削除・変更されない)。
const DB_VERSION = 2;
const STORE_WORLDS = "worlds";
const STORE_KV = "kv";
const STORE_BLUEPRINTS = "blueprints";

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new StorageError("このブラウザはIndexedDBに対応していません。保存機能は利用できません。"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_WORLDS)) {
        db.createObjectStore(STORE_WORLDS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_KV)) {
        db.createObjectStore(STORE_KV, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_BLUEPRINTS)) {
        db.createObjectStore(STORE_BLUEPRINTS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new StorageError(`データベースを開けませんでした: ${req.error?.message ?? "不明なエラー"}`));
  });
  return dbPromise;
}

function promisifyRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new StorageError(req.error?.message ?? "IndexedDB操作に失敗しました。"));
  });
}

export function generateId(): string {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export interface WorldSummary {
  id: string;
  name: string;
  seedText: string;
  createdAt: number;
  updatedAt: number;
  gameMode: GameMode;
}

export async function listWorldSummaries(): Promise<WorldSummary[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_WORLDS, "readonly");
  const store = tx.objectStore(STORE_WORLDS);
  const all = await promisifyRequest(store.getAll());
  return (all as WorldSaveData[])
    .map((w) => ({
      id: w.id,
      name: w.name,
      seedText: w.seedText,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
      gameMode: isGameMode(w.gameMode) ? w.gameMode : DEFAULT_GAME_MODE
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadWorld(id: string): Promise<WorldSaveData | undefined> {
  const db = await openDb();
  const tx = db.transaction(STORE_WORLDS, "readonly");
  const raw = await promisifyRequest(tx.objectStore(STORE_WORLDS).get(id));
  if (raw === undefined) return undefined;
  return validateAndMigrateWorldSave(raw);
}

export async function saveWorld(data: WorldSaveData): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_WORLDS, "readwrite");
  tx.objectStore(STORE_WORLDS).put(data);
  await promisifyTransaction(tx);
}

export async function deleteWorld(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_WORLDS, "readwrite");
  tx.objectStore(STORE_WORLDS).delete(id);
  await promisifyTransaction(tx);
}

export async function renameWorld(id: string, newName: string): Promise<void> {
  const world = await loadWorld(id);
  if (!world) {
    throw new StorageError("指定されたワールドが見つかりませんでした。");
  }
  world.name = newName;
  world.updatedAt = Date.now();
  await saveWorld(world);
}

/** JSONテキストからワールドをインポートする。常に新しいIDを割り当てて既存データの上書きを防ぐ。 */
export async function importWorldFromJson(text: string): Promise<WorldSaveData> {
  const parsed = parseWorldFromJson(text);
  const imported: WorldSaveData = { ...parsed, id: generateId(), updatedAt: Date.now() };
  await saveWorld(imported);
  return imported;
}

// --- Phase 4: 設計図(ブループリント)ライブラリ ---
// クリエイティブの範囲選択/コピー内容を、ワールドをまたいで再利用できるように保存する。

export async function listBlueprints(): Promise<BlueprintRecord[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_BLUEPRINTS, "readonly");
  const all = await promisifyRequest(tx.objectStore(STORE_BLUEPRINTS).getAll());
  return (all as unknown[])
    .map((raw) => validateAndMigrateBlueprint(raw))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadBlueprint(id: string): Promise<BlueprintRecord | undefined> {
  const db = await openDb();
  const tx = db.transaction(STORE_BLUEPRINTS, "readonly");
  const raw = await promisifyRequest(tx.objectStore(STORE_BLUEPRINTS).get(id));
  if (raw === undefined) return undefined;
  return validateAndMigrateBlueprint(raw);
}

export async function saveBlueprint(record: BlueprintRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_BLUEPRINTS, "readwrite");
  tx.objectStore(STORE_BLUEPRINTS).put(record);
  await promisifyTransaction(tx);
}

export async function deleteBlueprint(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_BLUEPRINTS, "readwrite");
  tx.objectStore(STORE_BLUEPRINTS).delete(id);
  await promisifyTransaction(tx);
}

export async function renameBlueprint(id: string, newName: string): Promise<void> {
  const blueprint = await loadBlueprint(id);
  if (!blueprint) {
    throw new StorageError("指定された設計図が見つかりませんでした。");
  }
  const renamed = validateAndMigrateBlueprint({ ...blueprint, name: newName, updatedAt: Date.now() });
  await saveBlueprint(renamed);
}

/** JSONテキストから設計図をインポートする。常に新しいIDを割り当てて既存データの上書きを防ぐ。 */
export async function importBlueprintFromJson(text: string): Promise<BlueprintRecord> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new StorageError("JSONとして読み込めませんでした。ファイルが破損している可能性があります。");
  }
  const validated = validateAndMigrateBlueprint(parsed);
  const imported: BlueprintRecord = { ...validated, id: generateId(), updatedAt: Date.now() };
  await saveBlueprint(imported);
  return imported;
}

export function exportBlueprintToJson(record: BlueprintRecord): string {
  return serializeBlueprintToJson(record);
}

function promisifyTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new StorageError(tx.error?.message ?? "IndexedDBの書き込みに失敗しました。"));
    tx.onabort = () => reject(new StorageError("IndexedDBの操作が中断されました。"));
  });
}

interface KvRecord<T> {
  key: string;
  value: T;
}

async function getKv<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const tx = db.transaction(STORE_KV, "readonly");
  const record = (await promisifyRequest(tx.objectStore(STORE_KV).get(key))) as KvRecord<T> | undefined;
  return record?.value;
}

async function putKv<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_KV, "readwrite");
  tx.objectStore(STORE_KV).put({ key, value } satisfies KvRecord<T>);
  await promisifyTransaction(tx);
}

export async function loadSettings(): Promise<GameSettings> {
  try {
    const raw = await getKv<Partial<GameSettings>>("settings");
    return clampSettings(raw ?? {});
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: GameSettings): Promise<void> {
  await putKv("settings", settings);
}

export async function loadAvatar(): Promise<AvatarConfig> {
  try {
    const raw = await getKv<AvatarConfig>("avatar");
    return raw ?? DEFAULT_AVATAR;
  } catch {
    return DEFAULT_AVATAR;
  }
}

export async function saveAvatar(avatar: AvatarConfig): Promise<void> {
  await putKv("avatar", avatar);
}

export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    return (await getKv<boolean>("onboardingSeen")) ?? false;
  } catch {
    return false;
  }
}

export async function setOnboardingSeen(): Promise<void> {
  await putKv("onboardingSeen", true);
}

/**
 * Phase 5: ワールドごとの「はじめてのチュートリアル」チェックリストの進捗。
 * セーブデータ本体 (WorldSaveData) には含めず、UIの表示状態としてKVストアに
 * ワールドIDごとに保持する (ゲームプレイ上の状態ではないため)。
 */
export interface TutorialChecklistState {
  /** ユーザーが手動で閉じた/全項目完了して自動的に閉じた場合に true。 */
  dismissed: boolean;
  /** 完了済みの項目ID一覧。 */
  completedSteps: string[];
}

const DEFAULT_TUTORIAL_STATE: TutorialChecklistState = { dismissed: false, completedSteps: [] };

function tutorialKey(worldId: string): string {
  return `tutorial:${worldId}`;
}

export async function loadTutorialChecklistState(worldId: string): Promise<TutorialChecklistState> {
  try {
    const raw = await getKv<TutorialChecklistState>(tutorialKey(worldId));
    if (!raw || typeof raw !== "object") return { ...DEFAULT_TUTORIAL_STATE };
    return {
      dismissed: Boolean(raw.dismissed),
      completedSteps: Array.isArray(raw.completedSteps) ? raw.completedSteps.filter((s) => typeof s === "string") : []
    };
  } catch {
    return { ...DEFAULT_TUTORIAL_STATE };
  }
}

export async function saveTutorialChecklistState(worldId: string, state: TutorialChecklistState): Promise<void> {
  await putKv(tutorialKey(worldId), state);
}
