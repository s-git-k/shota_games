/**
 * 死亡ドロップ (死亡時にその場へ落とした持ち物) の管理 (Phase 5)。
 *
 * Phase 4までは「死亡ドロップは常に1個」で、新たに死亡すると前回の中身を
 * 自動的にマージしていた (古い落とし物を回収し損ねると、次に死ぬまでずっと
 * 同じ場所に置き去りになる問題があった)。
 * Phase 5では、複数の独立した回収可能なドロップを上限付きリストとして保持する。
 * 上限 (MAX_DEATH_DROPS) を超える場合だけ、最も古いドロップの中身を次に古い
 * ドロップへ合流させて件数を減らす (アイテムを消さない)。
 */
import type { Vec3Int } from "./types";
import { addItem, type InventoryData } from "./inventory";

/** 保持できる死亡ドロップの最大件数。 */
export const MAX_DEATH_DROPS = 10;

export interface DeathDropEntry {
  /** 安定した一意ID (回収/削除/レンダリングの対応付けに使う)。 */
  id: string;
  position: Vec3Int;
  /** アイテムキー -> 個数。 */
  inventory: Record<string, number>;
  /** 生成時刻 (ms epoch)。最古判定に使う。 */
  createdAt: number;
}

function mergeInventory(base: Record<string, number>, extra: Record<string, number>): Record<string, number> {
  let inv: InventoryData = { ...base };
  for (const [key, count] of Object.entries(extra)) {
    inv = addItem(inv, key, count);
  }
  return inv;
}

/**
 * 新しい死亡ドロップをリストに追加する。
 * 追加後の件数が上限 (MAX_DEATH_DROPS) を超える場合は、最も古いドロップの中身を
 * 次に古いドロップへ合流させたうえで、最も古いドロップだけを取り除く
 * (中身は消えず、件数だけが減る)。
 */
export function addDeathDrop(drops: readonly DeathDropEntry[], entry: DeathDropEntry): DeathDropEntry[] {
  const next = [...drops, entry];
  if (next.length <= MAX_DEATH_DROPS) return next;

  const sortedByAge = [...next].sort((a, b) => a.createdAt - b.createdAt);
  const oldest = sortedByAge[0];
  const second = sortedByAge[1];
  if (!oldest || !second) return next.slice(next.length - MAX_DEATH_DROPS);

  const mergedSecond: DeathDropEntry = {
    ...second,
    inventory: mergeInventory(second.inventory, oldest.inventory)
  };
  return next.filter((d) => d.id !== oldest.id && d.id !== second.id).concat(mergedSecond);
}

/**
 * プレイヤー座標から、水平距離radiusXZ以内・垂直距離maxDy以内にある最も近い
 * ドロップを1つ返す (無ければnull)。1フレームに1個ずつ回収させるための選定。
 */
export function findNearestPickupableDrop(
  drops: readonly DeathDropEntry[],
  player: { x: number; y: number; z: number },
  radiusXZ: number,
  maxDy: number
): DeathDropEntry | null {
  let best: DeathDropEntry | null = null;
  let bestDistSq = Infinity;
  for (const d of drops) {
    const dx = player.x - (d.position.x + 0.5);
    const dz = player.z - (d.position.z + 0.5);
    const dy = player.y - d.position.y;
    if (Math.abs(dy) > maxDy) continue;
    const distSq = dx * dx + dz * dz;
    if (distSq > radiusXZ * radiusXZ) continue;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = d;
    }
  }
  return best;
}

export function removeDeathDrop(drops: readonly DeathDropEntry[], id: string): DeathDropEntry[] {
  return drops.filter((d) => d.id !== id);
}
