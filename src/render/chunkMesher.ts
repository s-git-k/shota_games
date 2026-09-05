/**
 * チャンクのボクセルデータから Three.js の BufferGeometry を構築する。
 * 隣接ブロックとの面カリングを行い、描画すべき面だけを生成することで
 * ノートPCでも動く程度の負荷に抑える。
 */
import * as THREE from "three";
import { getBlockDef } from "../core/blocks";
import { CHUNK_HEIGHT, CHUNK_SIZE_X, CHUNK_SIZE_Z, Chunk } from "../core/chunk";
import type { Facing } from "../core/types";
import type { World } from "../core/world";

export interface SpecialBlockInstance {
  x: number;
  y: number;
  z: number;
  blockId: number;
  facing: Facing;
  open: boolean;
}

export interface ChunkMeshResult {
  solid: THREE.BufferGeometry | null;
  transparent: THREE.BufferGeometry | null;
  specials: SpecialBlockInstance[];
}

interface FaceDef {
  // 4頂点 (反時計回り) をブロックのローカル座標 [0,1]^3 のオフセットで表す
  corners: [number, number, number][];
  normal: [number, number, number];
  shade: number;
  dx: number;
  dy: number;
  dz: number;
}

const FACES: FaceDef[] = [
  // +X (東)
  { corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], normal: [1,0,0], shade: 0.8, dx: 1, dy: 0, dz: 0 },
  // -X (西)
  { corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]], normal: [-1,0,0], shade: 0.8, dx: -1, dy: 0, dz: 0 },
  // +Y (上)
  { corners: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], normal: [0,1,0], shade: 1.0, dx: 0, dy: 1, dz: 0 },
  // -Y (下)
  { corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], normal: [0,-1,0], shade: 0.55, dx: 0, dy: -1, dz: 0 },
  // +Z (南)
  { corners: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]], normal: [0,0,1], shade: 0.9, dx: 0, dy: 0, dz: 1 },
  // -Z (北)
  { corners: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]], normal: [0,0,-1], shade: 0.7, dx: 0, dy: 0, dz: -1 }
];

function isFullCubeShape(shape: string): boolean {
  return shape === "cube" || shape === "leaves" || shape === "liquid";
}

function faceVisible(currentTransparent: boolean, neighborId: number): boolean {
  if (neighborId === 0) return true;
  const nDef = getBlockDef(neighborId);
  if (!isFullCubeShape(nDef.shape)) return true;
  if (nDef.transparent && !currentTransparent) return true;
  if (nDef.transparent && currentTransparent) return false;
  return false;
}

class GeometryBuilder {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  indices: number[] = [];

  addFace(face: FaceDef, ox: number, oy: number, oz: number, color: THREE.Color): void {
    const start = this.positions.length / 3;
    for (const [cx, cy, cz] of face.corners) {
      this.positions.push(ox + cx, oy + cy, oz + cz);
      this.normals.push(face.normal[0], face.normal[1], face.normal[2]);
      this.colors.push(color.r * face.shade, color.g * face.shade, color.b * face.shade);
    }
    this.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }

  isEmpty(): boolean {
    return this.positions.length === 0;
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geo.setIndex(this.indices);
    return geo;
  }
}

/**
 * 1チャンク分のメッシュ用ジオメトリを構築する。
 * world を渡すことで、チャンク境界の隣接ブロックも正しく参照してカリングする。
 */
export function buildChunkMesh(world: World, chunk: Chunk): ChunkMeshResult {
  const solidBuilder = new GeometryBuilder();
  const transparentBuilder = new GeometryBuilder();
  const specials: SpecialBlockInstance[] = [];

  const baseX = chunk.cx * CHUNK_SIZE_X;
  const baseZ = chunk.cz * CHUNK_SIZE_Z;
  const colorCache = new Map<number, THREE.Color>();

  for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        const id = chunk.getId(lx, y, lz);
        if (id === 0) continue;
        const def = getBlockDef(id);
        const wx = baseX + lx;
        const wz = baseZ + lz;

        if (!isFullCubeShape(def.shape)) {
          specials.push({ x: wx, y, z: wz, blockId: id, facing: chunk.getFacing(lx, y, lz), open: chunk.isOpen(lx, y, lz) });
          continue;
        }

        let color = colorCache.get(id);
        if (!color) {
          color = new THREE.Color(def.color);
          colorCache.set(id, color);
        }
        const builder = def.transparent ? transparentBuilder : solidBuilder;
        const shadeMul = def.shadeSides ? 1 : 0; // 0なら全面を均一の明るさにする

        for (const face of FACES) {
          const nx = lx + face.dx;
          const ny = y + face.dy;
          const nz = lz + face.dz;
          let neighborId: number;
          if (ny < 0 || ny >= CHUNK_HEIGHT) {
            neighborId = 0;
          } else if (nx < 0 || nx >= CHUNK_SIZE_X || nz < 0 || nz >= CHUNK_SIZE_Z) {
            neighborId = world.getBlockId(wx + face.dx, ny, wz + face.dz);
          } else {
            neighborId = chunk.getId(nx, ny, nz);
          }
          if (!faceVisible(def.transparent, neighborId)) continue;
          const effectiveFace: FaceDef = shadeMul ? face : { ...face, shade: 1 };
          builder.addFace(effectiveFace, lx, y, lz, color);
        }
      }
    }
  }

  return {
    solid: solidBuilder.isEmpty() ? null : solidBuilder.build(),
    transparent: transparentBuilder.isEmpty() ? null : transparentBuilder.build(),
    specials
  };
}
