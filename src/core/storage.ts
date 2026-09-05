/**
 * IndexedDB を使ったワールド/設定/アバターの永続化。
 * 大きくなりうるワールド編集データ (edits) を扱うため IndexedDB を採用している。
 * スキーマの妥当性検証・マイグレーションは core/save.ts 側の純粋関数に任せる。
 */
import { validateAndMigrateWorldSave, parseWorldFromJson, type WorldSaveData } from "./save";
import { DEFAULT_SETTINGS, clampSettings, type GameSettings } from "./settings";
import { DEFAULT_AVATAR, type AvatarConfig } from "./avatar";
import { DEFAULT_GAME_MODE, isGameMode, type GameMode } from "./gameMode";

const DB_NAME = "tsumiki-oukoku";
const DB_VERSION = 1;
const STORE_WORLDS = "worlds";
const STORE_KV = "kv";

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
