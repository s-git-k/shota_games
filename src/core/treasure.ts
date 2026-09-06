/**
 * Phase 4: 遺跡の宝箱から得られる、座標とシードだけから決まる決定論的な戦利品。
 * 同じワールド(シード)・同じ宝箱座標なら、何度呼び出しても常に同じ内容になる純粋関数。
 * 実際に「1回だけ」渡す制御 (開封済みマーカー) は呼び出し側 (World/Game) の責務。
 */
import { getBlockDefByKey } from "./blocks";
import { hash3D } from "./rng";

export interface TreasureLootEntry {
  key: string;
  count: number;
}

const GOLD = getBlockDefByKey("gold").key;
const METAL = getBlockDefByKey("metal").key;

/** ボーナス候補 (どれか1つが追加で入ることがある)。 */
const BONUS_POOL: readonly TreasureLootEntry[] = [
  { key: getBlockDefByKey("glow_crystal").key, count: 1 },
  { key: "bandage", count: 1 },
  { key: "stick", count: 3 }
];

/**
 * 遺跡宝箱の中身を決定論的に求める。
 * - 金塊(gold) 2〜4個 + 金属パネル(metal) 1〜3個は必ず入る
 * - 50%の確率でボーナス候補から1種類が追加される
 */
export function rollRuinTreasureLoot(seed: number, x: number, y: number, z: number): TreasureLootEntry[] {
  const loot: TreasureLootEntry[] = [];

  const goldCount = 2 + Math.floor(hash3D(seed ^ 0x7a01, x, y, z) * 3); // 2..4
  loot.push({ key: GOLD, count: goldCount });

  const metalCount = 1 + Math.floor(hash3D(seed ^ 0x7a02, x, y, z) * 3); // 1..3
  loot.push({ key: METAL, count: metalCount });

  const bonusRoll = hash3D(seed ^ 0x7a03, x, y, z);
  if (bonusRoll < 0.5) {
    const bonusIndex = Math.floor(hash3D(seed ^ 0x7a04, x, y, z) * BONUS_POOL.length) % BONUS_POOL.length;
    const bonus = BONUS_POOL[bonusIndex];
    if (bonus) loot.push({ ...bonus });
  }

  return loot;
}
