/**
 * ブロックではない「素材/道具/食料」アイテムの定義。
 * ブロック (blocks.ts) は設置可能なパレット (36種、上限に近いため個数を抑制) だが、
 * サバイバルの採取・クラフトに必要な素材は設置できないため、別レジストリとして
 * 自由に追加できるようにしている (パレット上限の制約を受けない)。
 */

export type ItemCategory = "resource" | "food" | "tool" | "medicine";

export interface ItemDefinition {
  /** 内部キー (インベントリのキーとしても使う) */
  key: string;
  nameJa: string;
  category: ItemCategory;
  /** インベントリUI用の簡易アイコン色 */
  color: number;
  /** 食料の場合、消費して回復する満腹度 */
  hungerRestore?: number;
  /** 医療品の場合、消費して回復する体力 */
  healAmount?: number;
}

export const ITEMS: readonly ItemDefinition[] = [
  { key: "stick", nameJa: "棒", category: "resource", color: 0x9a7148 },
  { key: "plant_fiber", nameJa: "植物繊維", category: "resource", color: 0x6fae4b },
  { key: "raw_meat", nameJa: "生肉", category: "food", color: 0xc96b6b, hungerRestore: 1 },
  { key: "cooked_meat", nameJa: "焼き肉", category: "food", color: 0xa8542f, hungerRestore: 5 },
  { key: "leather", nameJa: "革", category: "resource", color: 0x8a5a34 },
  { key: "wool", nameJa: "羊毛", category: "resource", color: 0xf2f2f2 },
  { key: "slime_gel", nameJa: "スライムのゼリー", category: "resource", color: 0x7ee0a8 },
  { key: "bandage", nameJa: "応急手当キット", category: "medicine", color: 0xf0e0d0, healAmount: 6 },
  { key: "stone_sword", nameJa: "石の剣", category: "tool", color: 0xb0b0b8 }
];

const byKey = new Map<string, ItemDefinition>(ITEMS.map((i) => [i.key, i]));

export function getItemDef(key: string): ItemDefinition {
  const found = byKey.get(key);
  if (!found) {
    throw new Error(`未知のアイテムキーです: ${key}`);
  }
  return found;
}

export function isValidItemKey(key: string): boolean {
  return byKey.has(key);
}

export function isConsumableFood(key: string): boolean {
  const def = byKey.get(key);
  return def !== undefined && def.category === "food" && (def.hungerRestore ?? 0) > 0;
}

export function isMedicine(key: string): boolean {
  const def = byKey.get(key);
  return def !== undefined && def.category === "medicine" && (def.healAmount ?? 0) > 0;
}
