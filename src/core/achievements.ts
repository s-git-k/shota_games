/**
 * Phase 4: 発見・実績 (achievements) システム。
 * データ駆動レジストリ + 純粋関数で判定することで、UI・保存処理から独立してテストできる。
 */
import { BIOMES } from "./biome";

export interface ProgressCounters {
  /** これまでに設置したブロックの総数 (破壊は含まない) */
  placedBlocksCount: number;
  /** これまでにクラフトで作った回数 (成果物の個数ではなくクラフト実行回数) */
  craftedItemsCount: number;
  /** これまでに倒した敵性エンティティの総数 */
  defeatedHostilesCount: number;
  /** これまでに開封した (初回入手済みの) 遺跡宝箱の総数 */
  openedTreasureCount: number;
  /** これまでに足を踏み入れたことのあるバイオームID一覧 (重複なし) */
  discoveredBiomes: readonly string[];
  /** 自然生成された洞窟に一度でも入ったことがあるか */
  caveDiscovered: boolean;
  /** 回路 (スイッチ→導線→ランプ/ドア) を一度でも通電させたことがあるか */
  circuitPoweredEver: boolean;
}

export function createEmptyProgressCounters(): ProgressCounters {
  return {
    placedBlocksCount: 0,
    craftedItemsCount: 0,
    defeatedHostilesCount: 0,
    openedTreasureCount: 0,
    discoveredBiomes: [],
    caveDiscovered: false,
    circuitPoweredEver: false
  };
}

export interface AchievementDefinition {
  id: string;
  nameJa: string;
  descriptionJa: string;
  isUnlocked: (counters: ProgressCounters) => boolean;
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: "first_block_placed",
    nameJa: "はじめの一歩",
    descriptionJa: "はじめてブロックを設置した。",
    isUnlocked: (c) => c.placedBlocksCount >= 1
  },
  {
    id: "hundred_blocks_placed",
    nameJa: "見習い建築家",
    descriptionJa: "ブロックを合計100個設置した。",
    isUnlocked: (c) => c.placedBlocksCount >= 100
  },
  {
    id: "first_cave_discovered",
    nameJa: "洞窟探検家",
    descriptionJa: "はじめて自然の洞窟を見つけた。",
    isUnlocked: (c) => c.caveDiscovered
  },
  {
    id: "all_biomes_discovered",
    nameJa: "世界を見た者",
    descriptionJa: "6つのバイオームすべてを訪れた。",
    isUnlocked: (c) => new Set(c.discoveredBiomes).size >= BIOMES.length
  },
  {
    id: "first_ruin_treasure",
    nameJa: "宝探し",
    descriptionJa: "はじめて遺跡の宝箱を開けた。",
    isUnlocked: (c) => c.openedTreasureCount >= 1
  },
  {
    id: "first_item_crafted",
    nameJa: "クラフトデビュー",
    descriptionJa: "はじめてアイテムをクラフトした。",
    isUnlocked: (c) => c.craftedItemsCount >= 1
  },
  {
    id: "first_hostile_defeated",
    nameJa: "はじめての勝利",
    descriptionJa: "はじめて敵を倒した。",
    isUnlocked: (c) => c.defeatedHostilesCount >= 1
  },
  {
    id: "first_circuit_powered",
    nameJa: "電気の魔術師",
    descriptionJa: "はじめて回路(スイッチ)に通電させた。",
    isUnlocked: (c) => c.circuitPoweredEver
  }
];

const byId = new Map<string, AchievementDefinition>(ACHIEVEMENTS.map((a) => [a.id, a]));

export function getAchievementDef(id: string): AchievementDefinition {
  const found = byId.get(id);
  if (!found) throw new Error(`未知の実績IDです: ${id}`);
  return found;
}

export function isValidAchievementId(id: string): boolean {
  return byId.has(id);
}

/** 現在のカウンター値から、解除済みであるべき実績ID集合を求める (保存データとは独立)。 */
export function evaluateUnlockedAchievementIds(counters: ProgressCounters): Set<string> {
  const unlocked = new Set<string>();
  for (const achievement of ACHIEVEMENTS) {
    if (achievement.isUnlocked(counters)) unlocked.add(achievement.id);
  }
  return unlocked;
}

/**
 * 直前の保存済み解除済みID一覧と現在のカウンターを比べ、新たに解除された実績だけを返す
 * (トースト表示のトリガーに使う)。既に解除済みのものは含めない。
 */
export function computeNewlyUnlocked(
  counters: ProgressCounters,
  alreadyUnlocked: ReadonlySet<string> | readonly string[]
): AchievementDefinition[] {
  const already = alreadyUnlocked instanceof Set ? alreadyUnlocked : new Set(alreadyUnlocked);
  const newly: AchievementDefinition[] = [];
  for (const achievement of ACHIEVEMENTS) {
    if (already.has(achievement.id)) continue;
    if (achievement.isUnlocked(counters)) newly.push(achievement);
  }
  return newly;
}
