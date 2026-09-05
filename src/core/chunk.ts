/**
 * チャンク: ワールドをX/Z方向に分割した固定サイズのボクセル領域。
 * 「効果的に無限」な地形をパフォーマンスよく扱うための基本単位。
 */
import { AIR_ID } from "./blocks";
import type { Facing } from "./types";

export const CHUNK_SIZE_X = 16;
export const CHUNK_SIZE_Z = 16;
export const CHUNK_HEIGHT = 64;
export const BLOCKS_PER_CHUNK = CHUNK_SIZE_X * CHUNK_SIZE_Z * CHUNK_HEIGHT;

export function localIndex(x: number, y: number, z: number): number {
  return (y * CHUNK_SIZE_Z + z) * CHUNK_SIZE_X + x;
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function parseChunkKey(key: string): { cx: number; cz: number } {
  const [cx, cz] = key.split(",").map(Number);
  return { cx: cx ?? 0, cz: cz ?? 0 };
}

export function worldToChunkCoord(worldX: number): number {
  return Math.floor(worldX / CHUNK_SIZE_X);
}

export function worldToLocal(worldCoord: number, chunkSize: number): number {
  // ((n % m) + m) % m は負数でも常に [0, m) の正規化された値になり、-0 も出さない。
  return ((worldCoord % chunkSize) + chunkSize) % chunkSize;
}

/**
 * 1チャンク分のブロックデータ。
 * - ids: ブロックID (0-255)
 * - facing: 向き 0-3 (2bit)
 * - open: ドアなどの開閉状態 (1bit)
 * facing/open は使用頻度が低いため、必要になるまで生成しない (メモリ節約)。
 */
export class Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly ids: Uint8Array;
  private meta: Uint8Array | null = null;
  /** メッシュ再構築が必要かどうか (レンダラ側が利用) */
  dirty = true;

  constructor(cx: number, cz: number, ids?: Uint8Array) {
    this.cx = cx;
    this.cz = cz;
    this.ids = ids ?? new Uint8Array(BLOCKS_PER_CHUNK);
  }

  private ensureMeta(): Uint8Array {
    if (!this.meta) {
      this.meta = new Uint8Array(BLOCKS_PER_CHUNK);
    }
    return this.meta;
  }

  getId(x: number, y: number, z: number): number {
    if (y < 0 || y >= CHUNK_HEIGHT) return AIR_ID;
    return this.ids[localIndex(x, y, z)] ?? AIR_ID;
  }

  setId(x: number, y: number, z: number, id: number): void {
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    this.ids[localIndex(x, y, z)] = id;
    this.dirty = true;
  }

  getFacing(x: number, y: number, z: number): Facing {
    if (!this.meta) return 0;
    const m = this.meta[localIndex(x, y, z)] ?? 0;
    return (m & 0b11) as Facing;
  }

  setFacing(x: number, y: number, z: number, facing: Facing): void {
    const meta = this.ensureMeta();
    const idx = localIndex(x, y, z);
    const cur = meta[idx] ?? 0;
    meta[idx] = (cur & ~0b11) | (facing & 0b11);
    this.dirty = true;
  }

  isOpen(x: number, y: number, z: number): boolean {
    if (!this.meta) return false;
    return ((this.meta[localIndex(x, y, z)] ?? 0) & 0b100) !== 0;
  }

  setOpen(x: number, y: number, z: number, open: boolean): void {
    const meta = this.ensureMeta();
    const idx = localIndex(x, y, z);
    const cur = meta[idx] ?? 0;
    meta[idx] = open ? cur | 0b100 : cur & ~0b100;
    this.dirty = true;
  }
}
