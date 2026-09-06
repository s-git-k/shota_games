/**
 * ワールド全体のレンダリング管理。
 * プレイヤー位置に応じてチャンクをロード/アンロードし、対応する Three.js メッシュを
 * 生成・破棄する。編集があったチャンク (と境界を共有する隣接チャンク) は再メッシュする。
 *
 * Phase 5 パフォーマンス改善:
 * これまでは移動するたびに描画距離内の全チャンクを同期的に生成・メッシュ化しており、
 * 描画距離が大きいほど1フレームにまとまった負荷が発生してカクつきの原因になっていた。
 * ここでは「プレイヤーに近いチャンクから優先して処理する」順序 (chunkQueue.ts) と、
 * 「1フレームあたりの生成/メッシュ構築の件数に上限を設ける」予算制を導入し、
 * 複数フレームに分散させる。ただし、プレイヤーが今いるチャンク (衝突判定/レイキャストが
 * 同期的に必要とする範囲) だけは毎フレーム即座に生成・メッシュ化を保証する。
 *
 * Web Worker化について: プレイヤー衝突判定 (World.isSolid)・レイキャスト・生物のAI接地判定
 * (World.findHighestSolidY) はいずれもメインスレッドから同期的にチャンクデータを参照する
 * 前提で書かれている。これをWorkerへ移すには、その都度postMessageで往復するプロキシに
 * 置き換える必要があり、ゲームプレイに直結する同期セマンティクスを壊すリスクが大きい。
 * そのため本Phaseでは「メインスレッド上の予算付き先読みキュー」を採用し、Worker化は
 * 見送っている (詳細はREADMEのアーキテクチャ節を参照)。
 */
import * as THREE from "three";
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, chunkKey, parseChunkKey, worldToChunkCoord } from "../core/chunk";
import { chunkCoordsInRadiusNearestFirst, type ChunkCoord } from "../core/chunkQueue";
import type { World } from "../core/world";
import { buildChunkMesh } from "./chunkMesher";
import { buildSpecialBlockMesh } from "./specialMeshes";

interface ChunkVisual {
  solidMesh: THREE.Mesh | null;
  transparentMesh: THREE.Mesh | null;
  specialsGroup: THREE.Group;
}

/** 1フレームあたりに新規生成できるチャンク数の上限 (先読み分)。 */
const CHUNK_GEN_BUDGET_PER_FRAME = 2;
/** 1フレームあたりに (再)構築できるチャンクメッシュ数の上限。 */
const MESH_BUILD_BUDGET_PER_FRAME = 2;
/** アンロード判定用のバッファ (描画距離ぎりぎりで出し入れがちらつくのを防ぐ)。 */
const UNLOAD_BUFFER = 2;

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

export interface WorldRendererDiagnostics {
  loadedChunks: number;
  queuedChunks: number;
}

export class WorldRenderer {
  readonly group = new THREE.Group();
  private visuals = new Map<string, ChunkVisual>();

  // Phase 5: 近い順の候補リストは中心チャンク/半径が変わったときだけ再計算し、
  // 毎フレームのソートコストを避ける。
  private cachedCandidateKey: string | null = null;
  private cachedCandidates: ChunkCoord[] = [];
  private queuedGenCount = 0;
  private queuedMeshCount = 0;

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
    const specialMaterials = new Set<THREE.Material>();
    visual.specialsGroup.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        c.geometry.dispose();
        const materials = Array.isArray(c.material) ? c.material : [c.material];
        materials.forEach((material) => specialMaterials.add(material));
      }
    });
    specialMaterials.forEach((material) => material.dispose());
    this.visuals.delete(key);
  }

  private ensureChunkForRendering(cx: number, cz: number): void {
    if (this.world.hasLoadedChunk(cx, cz)) return;
    this.world.ensureChunk(cx, cz);
    for (const [nx, nz] of [
      [cx - 1, cz],
      [cx + 1, cz],
      [cx, cz - 1],
      [cx, cz + 1]
    ] as const) {
      this.markChunkDirty(nx, nz);
    }
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

  /** 中心チャンク/半径ごとにキャッシュされた、近い順のチャンク候補リストを返す。 */
  private getCandidates(center: ChunkCoord, radius: number): ChunkCoord[] {
    const key = `${center.cx},${center.cz}:${radius}`;
    if (this.cachedCandidateKey !== key) {
      this.cachedCandidateKey = key;
      this.cachedCandidates = chunkCoordsInRadiusNearestFirst(center, radius);
    }
    return this.cachedCandidates;
  }

  /** 中心チャンク周辺を読み込み・破棄しつつ、必要なチャンクのメッシュを構築する。 */
  update(playerX: number, playerZ: number, renderDistanceChunks: number): void {
    const centerCx = worldToChunkCoord(Math.floor(playerX));
    const centerCz = worldToChunkCoord(Math.floor(playerZ));
    const center: ChunkCoord = { cx: centerCx, cz: centerCz };

    // 1. プレイヤーが今いるチャンクは、衝突判定/レイキャストが同期的に必要とするため
    //    予算を待たず必ずこのフレームで生成・メッシュ化する (初回表示も即座に行われる)。
    this.ensureChunkForRendering(centerCx, centerCz);
    const centerKey = chunkKey(centerCx, centerCz);
    if (!this.visuals.has(centerKey)) {
      this.buildAndAdd(centerCx, centerCz);
    }

    // 2. 範囲外のチャンクをアンロードする (生成は行わない軽量な操作)。
    const unloadRadius = renderDistanceChunks + UNLOAD_BUFFER;
    const unloaded = this.world.unloadChunksOutside(centerCx, centerCz, unloadRadius);
    for (const key of unloaded) {
      this.disposeChunkVisual(key);
      const { cx, cz } = parseChunkKey(key);
      this.markChunkDirty(cx - 1, cz);
      this.markChunkDirty(cx + 1, cz);
      this.markChunkDirty(cx, cz - 1);
      this.markChunkDirty(cx, cz + 1);
    }

    const candidates = this.getCandidates(center, renderDistanceChunks);

    // 3. 未生成のチャンクを予算内で、近い順に生成する (先読み)。
    let genBudget = CHUNK_GEN_BUDGET_PER_FRAME;
    this.queuedGenCount = 0;
    for (const c of candidates) {
      if (this.world.hasLoadedChunk(c.cx, c.cz)) continue;
      if (genBudget > 0) {
        this.ensureChunkForRendering(c.cx, c.cz);
        genBudget--;
      } else {
        this.queuedGenCount++;
      }
    }

    // 4. メッシュがまだ無い/dirtyなチャンクを予算内で、近い順に (再)構築する。
    //    「ロード済み全チャンク」ではなく、現在の描画距離候補だけを走査するため、
    //    アンロードバッファ分の余剰チャンクを毎フレーム調べずに済む。
    let meshBudget = MESH_BUILD_BUDGET_PER_FRAME;
    this.queuedMeshCount = 0;
    for (const c of candidates) {
      const key = chunkKey(c.cx, c.cz);
      const chunk = this.world.getLoadedChunk(c.cx, c.cz);
      if (!chunk) continue; // まだ生成されていない (次フレーム以降の生成予算で処理される)
      const needsBuild = !this.visuals.has(key) || chunk.dirty;
      if (!needsBuild) continue;
      if (meshBudget > 0) {
        this.buildAndAdd(c.cx, c.cz);
        meshBudget--;
      } else {
        this.queuedMeshCount++;
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

  /** デバッグHUD向けの軽量な診断値 (フレームごとの追加コストはほぼ無し)。 */
  get diagnostics(): WorldRendererDiagnostics {
    return { loadedChunks: this.visuals.size, queuedChunks: this.queuedGenCount + this.queuedMeshCount };
  }

  disposeAll(): void {
    for (const key of Array.from(this.visuals.keys())) {
      this.disposeChunkVisual(key);
    }
  }
}
