/**
 * ボクセル空間でのレイキャスト (Amanatides & Woo のDDAアルゴリズム)。
 * 見ているブロックと、設置先になる隣接セルを求める。
 */
import * as THREE from "three";
import type { World } from "../core/world";
import type { Vec3Int } from "../core/types";

export interface RaycastHit {
  block: Vec3Int;
  /** ヒットした面の法線方向 (設置位置を決めるのに使う) */
  normal: Vec3Int;
  /** ヒットした面に接する、ブロックを設置すべき隣接セル */
  placeAt: Vec3Int;
  distance: number;
}

function sign(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

/**
 * origin から direction (正規化推奨) へ向けて maxDistance まで進み、
 * 最初に当たった solid ブロックの情報を返す。当たらなければ null。
 */
export function raycastVoxels(world: World, origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): RaycastHit | null {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = sign(direction.x);
  const stepY = sign(direction.y);
  const stepZ = sign(direction.z);

  const tDeltaX = stepX !== 0 ? Math.abs(1 / direction.x) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / direction.y) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / direction.z) : Infinity;

  function boundaryT(coordFloor: number, coord: number, step: number, dirComp: number): number {
    if (step === 0) return Infinity;
    const boundary = step > 0 ? coordFloor + 1 : coordFloor;
    return (boundary - coord) / dirComp;
  }

  let tMaxX = boundaryT(x, origin.x, stepX, direction.x);
  let tMaxY = boundaryT(y, origin.y, stepY, direction.y);
  let tMaxZ = boundaryT(z, origin.z, stepZ, direction.z);

  let travelled = 0;
  let lastNormal: Vec3Int = { x: 0, y: 0, z: 0 };
  const maxSteps = Math.ceil(maxDistance * 3) + 8;

  for (let i = 0; i < maxSteps && travelled <= maxDistance; i++) {
    if (world.isTargetable(x, y, z)) {
      return {
        block: { x, y, z },
        normal: lastNormal,
        placeAt: { x: x + lastNormal.x, y: y + lastNormal.y, z: z + lastNormal.z },
        distance: travelled
      };
    }

    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      travelled = tMaxX;
      tMaxX += tDeltaX;
      lastNormal = { x: -stepX, y: 0, z: 0 };
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      travelled = tMaxY;
      tMaxY += tDeltaY;
      lastNormal = { x: 0, y: -stepY, z: 0 };
    } else {
      z += stepZ;
      travelled = tMaxZ;
      tMaxZ += tDeltaZ;
      lastNormal = { x: 0, y: 0, z: -stepZ };
    }
  }
  return null;
}
