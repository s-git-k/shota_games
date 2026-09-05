/**
 * Undo/Redo 履歴管理。
 * 1回の操作 (単一設置/破壊、または範囲ペーストのような複数ブロック操作) を
 * 1つの HistoryEntry として記録し、最大100件までセッション内で遡れるようにする。
 */
import type { Facing } from "./types";
import type { World } from "./world";

export interface BlockChange {
  x: number;
  y: number;
  z: number;
  prevId: number;
  prevFacing: Facing;
  prevOpen: boolean;
  newId: number;
  newFacing: Facing;
  newOpen: boolean;
}

export interface HistoryEntry {
  changes: BlockChange[];
}

export const MAX_HISTORY = 100;

export class History {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number = MAX_HISTORY) {
    this.maxSize = maxSize;
  }

  push(entry: HistoryEntry): void {
    if (entry.changes.length === 0) return;
    this.undoStack.push(entry);
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoCount(): number {
    return this.undoStack.length;
  }

  get redoCount(): number {
    return this.redoStack.length;
  }

  /** 直前の操作を取り消す。影響を受けた座標一覧 (メッシュ再構築用) を返す。 */
  undo(world: World): BlockChange[] {
    const entry = this.undoStack.pop();
    if (!entry) return [];
    for (const c of entry.changes) {
      world.setBlock(c.x, c.y, c.z, c.prevId, c.prevFacing, c.prevOpen);
    }
    this.redoStack.push(entry);
    return entry.changes;
  }

  /** 取り消した操作をやり直す。 */
  redo(world: World): BlockChange[] {
    const entry = this.redoStack.pop();
    if (!entry) return [];
    for (const c of entry.changes) {
      world.setBlock(c.x, c.y, c.z, c.newId, c.newFacing, c.newOpen);
    }
    this.undoStack.push(entry);
    return entry.changes;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
