/**
 * 範囲選択 + コピー&ペースト。
 * 建築補助として最優先の機能: 2点を指定して直方体範囲を選択し、
 * その内容をクリップボードへコピー、別の場所へスタンプのように貼り付けられる。
 */
import type { BlockChange } from "./history";
import type { Facing, Vec3Int } from "./types";
import type { World } from "./world";

export interface SelectionBounds {
  min: Vec3Int;
  max: Vec3Int;
}

export interface ClipboardCell {
  dx: number;
  dy: number;
  dz: number;
  id: number;
  facing: Facing;
  open: boolean;
}

export interface Clipboard {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  cells: ClipboardCell[];
}

/** 選択範囲・クリップボード1つあたりの上限ブロック数 (性能とメモリ保護のため)。 */
export const MAX_SELECTION_VOLUME = 100_000;

export class SelectionTooLargeError extends Error {
  constructor(volume: number) {
    super(`選択範囲が大きすぎます (${volume}ブロック)。上限は${MAX_SELECTION_VOLUME}ブロックです。`);
    this.name = "SelectionTooLargeError";
  }
}

export function boundsFromPoints(a: Vec3Int, b: Vec3Int): SelectionBounds {
  return {
    min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
    max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) }
  };
}

export function boundsVolume(b: SelectionBounds): number {
  return (b.max.x - b.min.x + 1) * (b.max.y - b.min.y + 1) * (b.max.z - b.min.z + 1);
}

export class Selection {
  anchor: Vec3Int | null = null;
  cursor: Vec3Int | null = null;

  begin(pos: Vec3Int): void {
    this.anchor = { ...pos };
    this.cursor = { ...pos };
  }

  update(pos: Vec3Int): void {
    if (!this.anchor) return;
    this.cursor = { ...pos };
  }

  clear(): void {
    this.anchor = null;
    this.cursor = null;
  }

  getBounds(): SelectionBounds | null {
    if (!this.anchor || !this.cursor) return null;
    return boundsFromPoints(this.anchor, this.cursor);
  }
}

/** 選択範囲をワールドから読み取ってクリップボードを作る。 */
export function copySelection(world: World, bounds: SelectionBounds): Clipboard {
  const sizeX = bounds.max.x - bounds.min.x + 1;
  const sizeY = bounds.max.y - bounds.min.y + 1;
  const sizeZ = bounds.max.z - bounds.min.z + 1;
  const volume = sizeX * sizeY * sizeZ;
  if (volume > MAX_SELECTION_VOLUME) {
    throw new SelectionTooLargeError(volume);
  }

  const cells: ClipboardCell[] = [];
  for (let x = bounds.min.x; x <= bounds.max.x; x++) {
    for (let y = bounds.min.y; y <= bounds.max.y; y++) {
      for (let z = bounds.min.z; z <= bounds.max.z; z++) {
        const id = world.getBlockId(x, y, z);
        const facing = world.getBlockFacing(x, y, z);
        const open = world.isBlockOpen(x, y, z);
        cells.push({ dx: x - bounds.min.x, dy: y - bounds.min.y, dz: z - bounds.min.z, id, facing, open });
      }
    }
  }
  return { sizeX, sizeY, sizeZ, cells };
}

/**
 * クリップボードを origin (直方体の最小コーナー) を基準にワールドへ貼り付ける。
 * 変更内容を BlockChange[] として返すので、呼び出し側で History へ1操作として積める。
 */
export function pasteClipboard(world: World, clipboard: Clipboard, origin: Vec3Int): BlockChange[] {
  const changes: BlockChange[] = [];
  for (const cell of clipboard.cells) {
    const x = origin.x + cell.dx;
    const y = origin.y + cell.dy;
    const z = origin.z + cell.dz;
    const prevId = world.getBlockId(x, y, z);
    const prevFacing = world.getBlockFacing(x, y, z);
    const prevOpen = world.isBlockOpen(x, y, z);
    if (prevId === cell.id && prevFacing === cell.facing && prevOpen === cell.open) continue;
    world.setBlock(x, y, z, cell.id, cell.facing, cell.open);
    changes.push({
      x,
      y,
      z,
      prevId,
      prevFacing,
      prevOpen,
      newId: cell.id,
      newFacing: cell.facing,
      newOpen: cell.open
    });
  }
  return changes;
}
