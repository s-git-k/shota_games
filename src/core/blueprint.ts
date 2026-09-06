/**
 * Phase 4: 設計図(ブループリント)ライブラリ。
 * クリップボード内容 (core/selection.ts の Clipboard) に名前・IDを付けて保存し、
 * ワールドをまたいで再利用できるようにする。永続化そのものは core/storage.ts が担当し、
 * ここでは検証・シリアライズ (純粋関数) だけを扱う (テストしやすさを優先)。
 */
import { isValidBlockId } from "./blocks";
import { MAX_SELECTION_VOLUME, type Clipboard, type ClipboardCell } from "./selection";
import type { Facing } from "./types";

/** ブループリントデータ自体のスキーマバージョン (ワールド保存スキーマとは独立)。 */
export const BLUEPRINT_SCHEMA_VERSION = 1;

/** ブループリント名の最大文字数 (ワールド名と同じ上限に揃える)。 */
export const MAX_BLUEPRINT_NAME_LENGTH = 40;

export class BlueprintValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlueprintValidationError";
  }
}

export interface BlueprintRecord {
  version: number;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  clipboard: Clipboard;
}

/** ユーザー入力の名前を検証する: 前後空白を除去して1〜40文字であることを要求する。 */
export function validateBlueprintName(rawName: string): string {
  const trimmed = rawName.trim();
  if (trimmed.length === 0) {
    throw new BlueprintValidationError("設計図の名前を空にはできません。");
  }
  if (trimmed.length > MAX_BLUEPRINT_NAME_LENGTH) {
    throw new BlueprintValidationError(`設計図の名前は${MAX_BLUEPRINT_NAME_LENGTH}文字以内にしてください。`);
  }
  return trimmed;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isPositiveInt(v: unknown): v is number {
  return isFiniteNumber(v) && Number.isInteger(v) && v > 0;
}

/** クリップボード(設計図の中身)を厳密に検証する。寸法・体積上限・ID/facingの妥当性を確認する。 */
export function validateClipboardData(v: unknown): Clipboard {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new BlueprintValidationError("設計図データの形式が不正です。");
  }
  const raw = v as Record<string, unknown>;
  if (!isPositiveInt(raw.sizeX) || !isPositiveInt(raw.sizeY) || !isPositiveInt(raw.sizeZ)) {
    throw new BlueprintValidationError("設計図の寸法が不正です。");
  }
  const sizeX = raw.sizeX;
  const sizeY = raw.sizeY;
  const sizeZ = raw.sizeZ;
  const volume = sizeX * sizeY * sizeZ;
  if (volume > MAX_SELECTION_VOLUME) {
    throw new BlueprintValidationError(`設計図が大きすぎます (${volume}ブロック)。上限は${MAX_SELECTION_VOLUME}ブロックです。`);
  }
  if (!Array.isArray(raw.cells)) {
    throw new BlueprintValidationError("設計図のセルデータが配列ではありません。");
  }
  if (raw.cells.length > volume) {
    throw new BlueprintValidationError("設計図のセル数が寸法と矛盾しています。");
  }
  const seenCoordinates = new Set<string>();
  const cells: ClipboardCell[] = raw.cells.map((cellRaw) => {
    if (typeof cellRaw !== "object" || cellRaw === null) {
      throw new BlueprintValidationError("設計図のセル形式が不正です。");
    }
    const cell = cellRaw as Record<string, unknown>;
    if (
      !isFiniteNumber(cell.dx) ||
      !Number.isInteger(cell.dx) ||
      cell.dx < 0 ||
      cell.dx >= sizeX ||
      !isFiniteNumber(cell.dy) ||
      !Number.isInteger(cell.dy) ||
      cell.dy < 0 ||
      cell.dy >= sizeY ||
      !isFiniteNumber(cell.dz) ||
      !Number.isInteger(cell.dz) ||
      cell.dz < 0 ||
      cell.dz >= sizeZ
    ) {
      throw new BlueprintValidationError("設計図のセル座標が範囲外です。");
    }
    if (!isFiniteNumber(cell.id) || !Number.isInteger(cell.id) || !isValidBlockId(cell.id)) {
      throw new BlueprintValidationError(`設計図に未知のブロックIDが含まれています: ${String(cell.id)}`);
    }
    const coordinateKey = `${cell.dx},${cell.dy},${cell.dz}`;
    if (seenCoordinates.has(coordinateKey)) {
      throw new BlueprintValidationError(`設計図のセル座標が重複しています: ${coordinateKey}`);
    }
    seenCoordinates.add(coordinateKey);
    const facingValue = cell.facing;
    if (!isFiniteNumber(facingValue) || !Number.isInteger(facingValue) || facingValue < 0 || facingValue > 3) {
      throw new BlueprintValidationError("設計図のブロックの向きが不正です。");
    }
    return {
      dx: cell.dx,
      dy: cell.dy,
      dz: cell.dz,
      id: cell.id,
      facing: facingValue as Facing,
      open: Boolean(cell.open)
    };
  });
  return { sizeX, sizeY, sizeZ, cells };
}

export interface CreateBlueprintParams {
  id: string;
  name: string;
  clipboard: Clipboard;
  now: number;
}

export function createBlueprintRecord(params: CreateBlueprintParams): BlueprintRecord {
  return {
    version: BLUEPRINT_SCHEMA_VERSION,
    id: params.id,
    name: validateBlueprintName(params.name),
    createdAt: params.now,
    updatedAt: params.now,
    clipboard: params.clipboard
  };
}

/**
 * 未知の入力 (IndexedDBやJSONファイルから読んだもの) を厳密に検証し、BlueprintRecord を返す。
 * 壊れた/未知の形式・将来バージョン・巨大すぎるデータはサイレントに失敗せず例外を投げる。
 */
export function validateAndMigrateBlueprint(input: unknown): BlueprintRecord {
  if (typeof input !== "object" || input === null) {
    throw new BlueprintValidationError("設計図データの形式が不正です (オブジェクトではありません)。");
  }
  const raw = input as Record<string, unknown>;
  const version = typeof raw.version === "number" ? raw.version : 0;
  if (version > BLUEPRINT_SCHEMA_VERSION) {
    throw new BlueprintValidationError(
      `この設計図 (v${version}) は現在のバージョン (v${BLUEPRINT_SCHEMA_VERSION}) より新しく読み込めません。`
    );
  }
  if (typeof raw.id !== "string" || raw.id.length === 0) {
    throw new BlueprintValidationError("設計図のIDが不正です。");
  }
  const name = validateBlueprintName(typeof raw.name === "string" ? raw.name : "");
  if (!isFiniteNumber(raw.createdAt) || !isFiniteNumber(raw.updatedAt)) {
    throw new BlueprintValidationError("設計図のタイムスタンプが不正です。");
  }
  const clipboard = validateClipboardData(raw.clipboard);
  return {
    version: BLUEPRINT_SCHEMA_VERSION,
    id: raw.id,
    name,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    clipboard
  };
}

export function serializeBlueprintToJson(record: BlueprintRecord): string {
  return JSON.stringify(record, null, 2);
}

export function parseBlueprintFromJson(text: string): BlueprintRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BlueprintValidationError("JSONとして読み込めませんでした。ファイルが破損している可能性があります。");
  }
  return validateAndMigrateBlueprint(parsed);
}
