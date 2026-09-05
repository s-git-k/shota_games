/**
 * 基本回路シミュレーション: スイッチ・導線・ランプ・ドアの通電を計算する。
 * ワールド全体を毎フレーム走査するのではなく、変更があった位置の周辺だけを
 * 有界 (bounded) なフラッドフィルで再計算することで、負荷を抑えている。
 */
import { getBlockDefByKey } from "./blocks";
import type { Vec3Int } from "./types";
import type { World } from "./world";

/** 1回の再計算で走査するブロック数の上限 (無限ループ・過大な負荷を防ぐ)。 */
export const MAX_CIRCUIT_NODES = 4096;

const SWITCH_ID = getBlockDefByKey("switch").id;
const WIRE_ID = getBlockDefByKey("wire").id;
const LAMP_ID = getBlockDefByKey("lamp").id;
const DOOR_ID = getBlockDefByKey("door").id;

const NEIGHBOR_OFFSETS: Vec3Int[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 }
];

function key(p: Vec3Int): string {
  return `${p.x},${p.y},${p.z}`;
}

type CircuitRole = "switch" | "wire" | "lamp" | "door" | "none";

function roleOf(blockId: number): CircuitRole {
  if (blockId === SWITCH_ID) return "switch";
  if (blockId === WIRE_ID) return "wire";
  if (blockId === LAMP_ID) return "lamp";
  if (blockId === DOOR_ID) return "door";
  return "none";
}

/** 回路網の一部として扱うブロックか (導線として繋がる/電源/受け手のいずれか)。 */
export function isCircuitBlock(blockId: number): boolean {
  return roleOf(blockId) !== "none";
}

export interface CircuitUpdate {
  changed: Vec3Int[];
}

/**
 * origin (設置/破壊/スイッチ操作があった座標) の周辺の回路網を再計算し、
 * 通電状態が変わったブロックの座標一覧を返す。呼び出し側はこれを使って
 * World.setBlock で open フラグ (=通電状態) を更新し、再描画・保存する。
 */
export function recomputeCircuitNear(world: World, origin: Vec3Int): CircuitUpdate {
  // 1. origin自身と隣接6マスのうち回路パーツであるものを起点に、連結成分を集める。
  const seeds: Vec3Int[] = [origin, ...NEIGHBOR_OFFSETS.map((o) => ({ x: origin.x + o.x, y: origin.y + o.y, z: origin.z + o.z }))];

  const componentKeys = new Set<string>();
  const componentPositions: Vec3Int[] = [];
  const queue: Vec3Int[] = [];

  for (const seed of seeds) {
    const id = world.getBlockId(seed.x, seed.y, seed.z);
    if (!isCircuitBlock(id)) continue;
    const k = key(seed);
    if (componentKeys.has(k)) continue;
    componentKeys.add(k);
    componentPositions.push(seed);
    queue.push(seed);
  }

  while (queue.length > 0 && componentPositions.length < MAX_CIRCUIT_NODES) {
    const cur = queue.shift();
    if (!cur) break;
    for (const off of NEIGHBOR_OFFSETS) {
      const nx = cur.x + off.x;
      const ny = cur.y + off.y;
      const nz = cur.z + off.z;
      const nid = world.getBlockId(nx, ny, nz);
      if (!isCircuitBlock(nid)) continue;
      const nk = key({ x: nx, y: ny, z: nz });
      if (componentKeys.has(nk)) continue;
      componentKeys.add(nk);
      const pos = { x: nx, y: ny, z: nz };
      componentPositions.push(pos);
      queue.push(pos);
      if (componentPositions.length >= MAX_CIRCUIT_NODES) break;
    }
  }

  // 2. 連結成分内の「電源 (ON状態のスイッチ)」から導線を通じて届く通電範囲をBFSで求める。
  const poweredWire = new Set<string>();
  const sourceQueue: Vec3Int[] = [];
  for (const pos of componentPositions) {
    const id = world.getBlockId(pos.x, pos.y, pos.z);
    if (roleOf(id) === "switch" && world.isBlockOpen(pos.x, pos.y, pos.z)) {
      sourceQueue.push(pos);
    }
  }

  const wireVisited = new Set<string>();
  // スイッチに直接隣接する導線から開始する。
  for (const src of sourceQueue) {
    for (const off of NEIGHBOR_OFFSETS) {
      const nx = src.x + off.x;
      const ny = src.y + off.y;
      const nz = src.z + off.z;
      const nid = world.getBlockId(nx, ny, nz);
      if (roleOf(nid) === "wire") {
        const nk = key({ x: nx, y: ny, z: nz });
        if (!wireVisited.has(nk)) {
          wireVisited.add(nk);
          poweredWire.add(nk);
          sourceQueue.push({ x: nx, y: ny, z: nz });
        }
      }
    }
  }

  // 3. 各ノードの新しい通電状態 (open フラグ) を決定する。
  const changed: Vec3Int[] = [];
  for (const pos of componentPositions) {
    const id = world.getBlockId(pos.x, pos.y, pos.z);
    const role = roleOf(id);
    if (role === "switch") continue; // スイッチの状態はプレイヤー操作のみで変わる

    let powered = false;
    let hasCircuitNeighbor = false;
    if (role === "lamp" || role === "door") {
      for (const off of NEIGHBOR_OFFSETS) {
        const nx = pos.x + off.x;
        const ny = pos.y + off.y;
        const nz = pos.z + off.z;
        const nid = world.getBlockId(nx, ny, nz);
        const nrole = roleOf(nid);
        if (nrole === "wire" || nrole === "switch") hasCircuitNeighbor = true;
        if (nrole === "wire" && poweredWire.has(key({ x: nx, y: ny, z: nz }))) {
          powered = true;
        }
        if (nrole === "switch" && world.isBlockOpen(nx, ny, nz)) {
          powered = true;
        }
      }
    }

    if (role === "wire") {
      powered = poweredWire.has(key(pos));
    } else if (role === "door" && !hasCircuitNeighbor) {
      // 導線/スイッチに直接繋がっていないドアは、プレイヤーの手動開閉のみで制御する
      // (回路の再計算のたびに手動で開けたドアが閉じ直されてしまう不具合を防ぐ)。
      continue;
    }

    const currentOpen = world.isBlockOpen(pos.x, pos.y, pos.z);
    if (currentOpen !== powered) {
      const facing = world.getBlockFacing(pos.x, pos.y, pos.z);
      world.setBlock(pos.x, pos.y, pos.z, id, facing, powered);
      changed.push(pos);
    }
  }

  return { changed };
}
