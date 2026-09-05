/**
 * ワールド: チャンクの生成・読み込み/破棄・ブロックの取得/設定を管理する。
 * 保存データには「地形からの差分 (edits)」のみを持たせることで、
 * 無限に広がる地形でも保存サイズを小さく保つ。
 */
import { AIR_ID, getBlockDef, isValidBlockId } from "./blocks";
import {
  CHUNK_HEIGHT,
  CHUNK_SIZE_X,
  CHUNK_SIZE_Z,
  Chunk,
  chunkKey,
  localIndex,
  parseChunkKey,
  worldToChunkCoord,
  worldToLocal
} from "./chunk";
import { generateChunk, CURRENT_TERRAIN_GENERATOR_VERSION } from "./terrain";
import type { Facing, Vec3Int } from "./types";

export interface BlockEdit {
  index: number;
  id: number;
  facing: Facing;
  open: boolean;
}

export interface SetBlockResult {
  changed: boolean;
  prevId: number;
  prevFacing: Facing;
  prevOpen: boolean;
}

export interface ChunkSyncResult {
  loaded: Chunk[];
  unloaded: string[];
}

export class World {
  readonly seed: number;
  readonly seedText: string;
  /**
   * 地形ジェネレーターバージョン。既存ワールド (Phase 1-2 生成) は読み込み時の値を保持し続け、
   * 新規ワールドは常に最新版で生成する (詳細は save.ts の terrainGeneratorVersion を参照)。
   */
  readonly generatorVersion: number;
  private chunks = new Map<string, Chunk>();
  /** チャンクキー -> (localIndex -> 差分) 保存/復元・再生成のための唯一の真実の情報源 */
  private edits = new Map<string, Map<number, BlockEdit>>();

  constructor(seed: number, seedText: string, generatorVersion: number = CURRENT_TERRAIN_GENERATOR_VERSION) {
    this.seed = seed;
    this.seedText = seedText;
    this.generatorVersion = generatorVersion;
  }

  private applyEditsToChunk(chunk: Chunk): void {
    const key = chunkKey(chunk.cx, chunk.cz);
    const edits = this.edits.get(key);
    if (!edits) return;
    for (const [index, edit] of edits) {
      chunk.ids[index] = edit.id;
      const y = Math.floor(index / (CHUNK_SIZE_X * CHUNK_SIZE_Z));
      const rem = index % (CHUNK_SIZE_X * CHUNK_SIZE_Z);
      const z = Math.floor(rem / CHUNK_SIZE_X);
      const x = rem % CHUNK_SIZE_X;
      chunk.setFacing(x, y, z, edit.facing);
      chunk.setOpen(x, y, z, edit.open);
    }
  }

  ensureChunk(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = generateChunk(this.seed, cx, cz, this.generatorVersion);
      this.applyEditsToChunk(chunk);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  getLoadedChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  getBlockId(x: number, y: number, z: number): number {
    if (y < 0 || y >= CHUNK_HEIGHT) return AIR_ID;
    const cx = worldToChunkCoord(x);
    const cz = worldToChunkCoord(z);
    const chunk = this.ensureChunk(cx, cz);
    const lx = worldToLocal(x, CHUNK_SIZE_X);
    const lz = worldToLocal(z, CHUNK_SIZE_Z);
    return chunk.getId(lx, y, lz);
  }

  getBlockFacing(x: number, y: number, z: number): Facing {
    const cx = worldToChunkCoord(x);
    const cz = worldToChunkCoord(z);
    const chunk = this.ensureChunk(cx, cz);
    const lx = worldToLocal(x, CHUNK_SIZE_X);
    const lz = worldToLocal(z, CHUNK_SIZE_Z);
    return chunk.getFacing(lx, y, lz);
  }

  isBlockOpen(x: number, y: number, z: number): boolean {
    const cx = worldToChunkCoord(x);
    const cz = worldToChunkCoord(z);
    const chunk = this.ensureChunk(cx, cz);
    const lx = worldToLocal(x, CHUNK_SIZE_X);
    const lz = worldToLocal(z, CHUNK_SIZE_Z);
    return chunk.isOpen(lx, y, lz);
  }

  /** 水/地下水など、液体ブロックかどうか (泳ぎ判定・レンダリングで使う)。 */
  isLiquid(x: number, y: number, z: number): boolean {
    const id = this.getBlockId(x, y, z);
    if (id === AIR_ID) return false;
    return getBlockDef(id).shape === "liquid";
  }

  /** ブロックは物理的に衝突判定を持つか (ドアが開いている場合などは false)。 */
  isSolid(x: number, y: number, z: number): boolean {
    const id = this.getBlockId(x, y, z);
    if (id === AIR_ID) return false;
    const def = getBlockDef(id);
    if (def.shape === "door" && this.isBlockOpen(x, y, z)) return false;
    return def.solidDefault;
  }

  /**
   * プレイヤーが照準・破壊・使用の対象にできるブロックか。
   * 回路パーツ(スイッチ/導線/ランプ)やベッド、ドアは非衝突/開放中でも対象にできる必要があるため、
   * 物理衝突 (isSolid) とは別に判定する。
   */
  isTargetable(x: number, y: number, z: number): boolean {
    const id = this.getBlockId(x, y, z);
    if (id === AIR_ID) return false;
    const def = getBlockDef(id);
    if (def.shape === "switch" || def.shape === "wire" || def.shape === "lamp" || def.shape === "bed" || def.shape === "door") {
      return true;
    }
    return def.solidDefault;
  }

  setBlock(x: number, y: number, z: number, id: number, facing: Facing = 0, open = false): SetBlockResult {
    if (y < 0 || y >= CHUNK_HEIGHT) {
      return { changed: false, prevId: AIR_ID, prevFacing: 0, prevOpen: false };
    }
    if (!isValidBlockId(id)) {
      throw new Error(`未知のブロックIDを設置しようとしました: ${id}`);
    }
    const cx = worldToChunkCoord(x);
    const cz = worldToChunkCoord(z);
    const chunk = this.ensureChunk(cx, cz);
    const lx = worldToLocal(x, CHUNK_SIZE_X);
    const lz = worldToLocal(z, CHUNK_SIZE_Z);

    const prevId = chunk.getId(lx, y, lz);
    const prevFacing = chunk.getFacing(lx, y, lz);
    const prevOpen = chunk.isOpen(lx, y, lz);

    chunk.setId(lx, y, lz, id);
    chunk.setFacing(lx, y, lz, facing);
    chunk.setOpen(lx, y, lz, open);

    const key = chunkKey(cx, cz);
    let editMap = this.edits.get(key);
    if (!editMap) {
      editMap = new Map();
      this.edits.set(key, editMap);
    }
    editMap.set(localIndex(lx, y, lz), { index: localIndex(lx, y, lz), id, facing, open });

    return {
      changed: prevId !== id || prevFacing !== facing || prevOpen !== open,
      prevId,
      prevFacing,
      prevOpen
    };
  }

  /** 指定した中心チャンク周辺 radius 以内を読み込み、範囲外を破棄する。 */
  syncLoadedChunks(centerCx: number, centerCz: number, radius: number, unloadBuffer = 2): ChunkSyncResult {
    const loaded: Chunk[] = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz > radius * radius) continue;
        const cx = centerCx + dx;
        const cz = centerCz + dz;
        const key = chunkKey(cx, cz);
        if (!this.chunks.has(key)) {
          loaded.push(this.ensureChunk(cx, cz));
        }
      }
    }

    const unloadRadius = radius + unloadBuffer;
    const unloaded: string[] = [];
    for (const key of this.chunks.keys()) {
      const { cx, cz } = parseChunkKey(key);
      const dx = cx - centerCx;
      const dz = cz - centerCz;
      if (dx * dx + dz * dz > unloadRadius * unloadRadius) {
        unloaded.push(key);
      }
    }
    for (const key of unloaded) {
      this.chunks.delete(key);
    }

    return { loaded, unloaded };
  }

  getAllEdits(): ReadonlyMap<string, Map<number, BlockEdit>> {
    return this.edits;
  }

  /** 保存データからの復元用。ロード済みチャンクは全て破棄して差分だけを再セットする。 */
  loadEdits(entries: Iterable<[string, BlockEdit[]]>): void {
    this.edits.clear();
    this.chunks.clear();
    for (const [key, editList] of entries) {
      const map = new Map<number, BlockEdit>();
      for (const e of editList) {
        map.set(e.index, e);
      }
      this.edits.set(key, map);
    }
  }

  findHighestSolidY(x: number, z: number): number {
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      if (this.isSolid(x, y, z)) return y;
    }
    return 0;
  }

  toVec(x: number, y: number, z: number): Vec3Int {
    return { x, y, z };
  }
}
