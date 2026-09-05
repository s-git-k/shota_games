/**
 * ワールド全体のレンダリング管理。
 * プレイヤー位置に応じてチャンクをロード/アンロードし、対応する Three.js メッシュを
 * 生成・破棄する。編集があったチャンク (と境界を共有する隣接チャンク) は再メッシュする。
 */
import * as THREE from "three";
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, chunkKey, worldToChunkCoord } from "../core/chunk";
import type { World } from "../core/world";
import { buildChunkMesh } from "./chunkMesher";
import { buildSpecialBlockMesh } from "./specialMeshes";

interface ChunkVisual {
  solidMesh: THREE.Mesh | null;
  transparentMesh: THREE.Mesh | null;
  specialsGroup: THREE.Group;
}

const solidMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.02 });
const transparentMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.5,
  metalness: 0.05,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  side: THREE.DoubleSide
});

function parseKey(key: string): { cx: number; cz: number } {
  const [cx, cz] = key.split(",").map(Number);
  return { cx: cx ?? 0, cz: cz ?? 0 };
}

export class WorldRenderer {
  readonly group = new THREE.Group();
  private visuals = new Map<string, ChunkVisual>();

  constructor(private readonly world: World) {
    this.group.name = "chunks";
  }

  private disposeChunkVisual(key: string): void {
    const visual = this.visuals.get(key);
    if (!visual) return;
    if (visual.solidMesh) {
      this.group.remove(visual.solidMesh);
      visual.solidMesh.geometry.dispose();
    }
    if (visual.transparentMesh) {
      this.group.remove(visual.transparentMesh);
      visual.transparentMesh.geometry.dispose();
    }
    this.group.remove(visual.specialsGroup);
    visual.specialsGroup.traverse((c) => {
      if (c instanceof THREE.Mesh) c.geometry.dispose();
    });
    this.visuals.delete(key);
  }

  private buildAndAdd(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    this.disposeChunkVisual(key);
    const chunk = this.world.getLoadedChunk(cx, cz);
    if (!chunk) return;
    const result = buildChunkMesh(this.world, chunk);
    chunk.dirty = false;

    let solidMesh: THREE.Mesh | null = null;
    if (result.solid) {
      solidMesh = new THREE.Mesh(result.solid, solidMaterial);
      solidMesh.position.set(cx * CHUNK_SIZE_X, 0, cz * CHUNK_SIZE_Z);
      this.group.add(solidMesh);
    }

    let transparentMesh: THREE.Mesh | null = null;
    if (result.transparent) {
      transparentMesh = new THREE.Mesh(result.transparent, transparentMaterial);
      transparentMesh.position.set(cx * CHUNK_SIZE_X, 0, cz * CHUNK_SIZE_Z);
      this.group.add(transparentMesh);
    }

    const specialsGroup = new THREE.Group();
    specialsGroup.position.set(cx * CHUNK_SIZE_X, 0, cz * CHUNK_SIZE_Z);
    for (const special of result.specials) {
      const localX = special.x - cx * CHUNK_SIZE_X;
      const localZ = special.z - cz * CHUNK_SIZE_Z;
      const mesh = buildSpecialBlockMesh({ ...special, x: localX, z: localZ });
      specialsGroup.add(mesh);
    }
    this.group.add(specialsGroup);

    this.visuals.set(key, { solidMesh, transparentMesh, specialsGroup });
  }

  /** 中心チャンク周辺を読み込み・破棄しつつ、必要なチャンクのメッシュを構築する。 */
  update(playerX: number, playerZ: number, renderDistanceChunks: number): void {
    const centerCx = worldToChunkCoord(Math.floor(playerX));
    const centerCz = worldToChunkCoord(Math.floor(playerZ));
    const sync = this.world.syncLoadedChunks(centerCx, centerCz, renderDistanceChunks);

    for (const key of sync.unloaded) {
      this.disposeChunkVisual(key);
    }
    for (const chunk of sync.loaded) {
      this.buildAndAdd(chunk.cx, chunk.cz);
    }
    // Collision/raycast queries can generate a chunk before the renderer sees it.
    // Build every visible loaded chunk, not only chunks newly loaded by this update.
    for (let dx = -renderDistanceChunks; dx <= renderDistanceChunks; dx++) {
      for (let dz = -renderDistanceChunks; dz <= renderDistanceChunks; dz++) {
        if (dx * dx + dz * dz > renderDistanceChunks * renderDistanceChunks) continue;
        const cx = centerCx + dx;
        const cz = centerCz + dz;
        const key = chunkKey(cx, cz);
        if (!this.visuals.has(key) && this.world.getLoadedChunk(cx, cz)) {
          this.buildAndAdd(cx, cz);
        }
      }
    }
    // 既にロード済みだが dirty (編集された) チャンクを再構築
    for (const key of Array.from(this.visuals.keys())) {
      const { cx, cz } = parseKey(key);
      const chunk = this.world.getLoadedChunk(cx, cz);
      if (chunk && chunk.dirty) {
        this.buildAndAdd(cx, cz);
      }
    }
  }

  /** ブロック編集後に呼び出す: 対象チャンクと、境界に接する可能性のある隣接チャンクを再メッシュ対象にする。 */
  markDirtyAtWorldPos(x: number, z: number): void {
    const cx = worldToChunkCoord(x);
    const cz = worldToChunkCoord(z);
    const lx = x - cx * CHUNK_SIZE_X;
    const lz = z - cz * CHUNK_SIZE_Z;
    this.markChunkDirty(cx, cz);
    if (lx === 0) this.markChunkDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE_X - 1) this.markChunkDirty(cx + 1, cz);
    if (lz === 0) this.markChunkDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE_Z - 1) this.markChunkDirty(cx, cz + 1);
  }

  private markChunkDirty(cx: number, cz: number): void {
    const chunk = this.world.getLoadedChunk(cx, cz);
    if (chunk) chunk.dirty = true;
  }

  disposeAll(): void {
    for (const key of Array.from(this.visuals.keys())) {
      this.disposeChunkVisual(key);
    }
  }
}
