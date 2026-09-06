/**
 * チャンク生成/メッシュ構築の優先順位付け (純粋関数、Phase 5)。
 *
 * Phase 3までは「描画距離内の全チャンク」をプレイヤーが動くたびに同期的に
 * 生成・メッシュ化しており、範囲が広い/描画距離が大きいほど1フレームに
 * まとまった処理が発生してカクつきの原因になっていた。
 * ここでは「プレイヤーに近いチャンクほど先に処理する」順序付けと、
 * 「1フレームあたりの処理件数を制限する (予算)」という2つの純粋なユーティリティを提供し、
 * WorldRenderer 側はこれを使って処理を複数フレームに分散させる。
 */

export interface ChunkCoord {
  cx: number;
  cz: number;
}

/** 中心チャンクからの距離の二乗 (ソート用。平方根計算を避けるため二乗のまま比較する)。 */
export function chunkDistSq(a: ChunkCoord, center: ChunkCoord): number {
  const dx = a.cx - center.cx;
  const dz = a.cz - center.cz;
  return dx * dx + dz * dz;
}

/** 与えられたチャンク座標群を中心に近い順で並べ替えた新しい配列を返す (元の配列は変更しない)。 */
export function sortByDistanceAscending(coords: readonly ChunkCoord[], center: ChunkCoord): ChunkCoord[] {
  return coords
    .map((c) => ({ c, d: chunkDistSq(c, center) }))
    .sort((a, b) => a.d - b.d)
    .map((entry) => entry.c);
}

/**
 * 中心チャンクを起点に半径radius以内 (円形、Worldのロード範囲と同じ判定式) の
 * 全チャンク座標を、中心に近い順で列挙する。
 */
export function chunkCoordsInRadiusNearestFirst(center: ChunkCoord, radius: number): ChunkCoord[] {
  const coords: ChunkCoord[] = [];
  const r2 = radius * radius;
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      if (dx * dx + dz * dz > r2) continue;
      coords.push({ cx: center.cx + dx, cz: center.cz + dz });
    }
  }
  return sortByDistanceAscending(coords, center);
}

/** 配列の先頭からmax件だけを切り出す (「今フレームで処理する分」を表す予算の適用)。 */
export function takeBudget<T>(items: readonly T[], max: number): T[] {
  if (max <= 0) return [];
  return items.slice(0, max);
}
