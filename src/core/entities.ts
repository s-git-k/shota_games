/**
 * 生物 (敵対/友好) の種類定義。
 * 見た目はローポリの手続き生成 (render/entityRenderer.ts) で作るため、ここではゲームロジックに
 * 必要な数値パラメータとドロップ品だけを持つ。
 */

export type EntityKind =
  | "slime"
  | "goblin"
  | "bat"
  | "ghost"
  | "rock_golem"
  | "sheep"
  | "cow"
  | "chicken"
  | "rabbit";

export type EntityTemperament = "hostile" | "friendly";

export interface DropEntry {
  key: string;
  min: number;
  max: number;
  /** 0..1 のドロップ確率 */
  chance: number;
}

export interface EntityDefinition {
  kind: EntityKind;
  nameJa: string;
  temperament: EntityTemperament;
  maxHp: number;
  /** 移動速度 (ブロック/秒) */
  speed: number;
  /** 接触攻撃のダメージ (敵対のみ) */
  attackDamage: number;
  /** プレイヤーを発見して追跡を始める距離 */
  detectRadius: number;
  /** 攻撃を行える距離 */
  attackRange: number;
  /** 攻撃のクールダウン (秒) */
  attackCooldown: number;
  /** 体の縦幅の目安 (当たり判定・描画スケールに使用) */
  height: number;
  radius: number;
  drops: DropEntry[];
  /** 飛行/浮遊するか (地面に張り付かない) */
  flies: boolean;
}

const DEFS: EntityDefinition[] = [
  {
    kind: "slime",
    nameJa: "スライム",
    temperament: "hostile",
    maxHp: 6,
    speed: 1.2,
    attackDamage: 2,
    detectRadius: 10,
    attackRange: 1.1,
    attackCooldown: 1.2,
    height: 0.7,
    radius: 0.4,
    drops: [{ key: "slime_gel", min: 1, max: 2, chance: 0.9 }],
    flies: false
  },
  {
    kind: "goblin",
    nameJa: "ゴブリン",
    temperament: "hostile",
    maxHp: 10,
    speed: 2.4,
    attackDamage: 3,
    detectRadius: 12,
    attackRange: 1.2,
    attackCooldown: 0.9,
    height: 1.3,
    radius: 0.35,
    drops: [{ key: "stick", min: 1, max: 2, chance: 0.6 }],
    flies: false
  },
  {
    kind: "bat",
    nameJa: "コウモリ",
    temperament: "hostile",
    maxHp: 5,
    speed: 3.2,
    attackDamage: 1,
    detectRadius: 9,
    attackRange: 1.0,
    attackCooldown: 0.8,
    height: 0.5,
    radius: 0.3,
    drops: [{ key: "plant_fiber", min: 1, max: 1, chance: 0.5 }],
    flies: true
  },
  {
    kind: "ghost",
    nameJa: "ゴースト",
    temperament: "hostile",
    maxHp: 8,
    speed: 1.6,
    attackDamage: 2,
    detectRadius: 14,
    attackRange: 1.3,
    attackCooldown: 1.4,
    height: 1.4,
    radius: 0.4,
    drops: [{ key: "slime_gel", min: 1, max: 1, chance: 0.35 }],
    flies: true
  },
  {
    kind: "rock_golem",
    nameJa: "ロックゴーレム",
    temperament: "hostile",
    maxHp: 22,
    speed: 1.0,
    attackDamage: 5,
    detectRadius: 9,
    attackRange: 1.4,
    attackCooldown: 1.6,
    height: 1.8,
    radius: 0.5,
    drops: [{ key: "cobblestone", min: 1, max: 3, chance: 0.8 }],
    flies: false
  },
  {
    kind: "sheep",
    nameJa: "ひつじ",
    temperament: "friendly",
    maxHp: 8,
    speed: 1.4,
    attackDamage: 0,
    detectRadius: 0,
    attackRange: 0,
    attackCooldown: 0,
    height: 0.9,
    radius: 0.4,
    drops: [
      { key: "wool", min: 1, max: 2, chance: 1 },
      { key: "raw_meat", min: 1, max: 1, chance: 0.7 }
    ],
    flies: false
  },
  {
    kind: "cow",
    nameJa: "うし",
    temperament: "friendly",
    maxHp: 10,
    speed: 1.3,
    attackDamage: 0,
    detectRadius: 0,
    attackRange: 0,
    attackCooldown: 0,
    height: 1.1,
    radius: 0.5,
    drops: [
      { key: "leather", min: 1, max: 2, chance: 0.9 },
      { key: "raw_meat", min: 1, max: 2, chance: 0.9 }
    ],
    flies: false
  },
  {
    kind: "chicken",
    nameJa: "にわとり",
    temperament: "friendly",
    maxHp: 4,
    speed: 1.6,
    attackDamage: 0,
    detectRadius: 0,
    attackRange: 0,
    attackCooldown: 0,
    height: 0.5,
    radius: 0.25,
    drops: [{ key: "raw_meat", min: 1, max: 1, chance: 0.8 }],
    flies: false
  },
  {
    kind: "rabbit",
    nameJa: "うさぎ",
    temperament: "friendly",
    maxHp: 4,
    speed: 2.2,
    attackDamage: 0,
    detectRadius: 0,
    attackRange: 0,
    attackCooldown: 0,
    height: 0.45,
    radius: 0.25,
    drops: [{ key: "leather", min: 1, max: 1, chance: 0.5 }],
    flies: false
  }
];

const byKind = new Map<EntityKind, EntityDefinition>(DEFS.map((d) => [d.kind, d]));

export const ENTITY_DEFINITIONS: readonly EntityDefinition[] = DEFS;
export const HOSTILE_KINDS: readonly EntityKind[] = DEFS.filter((d) => d.temperament === "hostile").map((d) => d.kind);
export const FRIENDLY_KINDS: readonly EntityKind[] = DEFS.filter((d) => d.temperament === "friendly").map((d) => d.kind);

export function getEntityDef(kind: EntityKind): EntityDefinition {
  const found = byKind.get(kind);
  if (!found) throw new Error(`未知の生物種類です: ${kind}`);
  return found;
}

/** 与えられた乱数値 (0..1) から範囲内のドロップ個数を1つ決める。 */
export function rollDropCount(entry: DropEntry, rand: number): number {
  if (entry.min >= entry.max) return entry.min;
  return entry.min + Math.floor(rand * (entry.max - entry.min + 1));
}
