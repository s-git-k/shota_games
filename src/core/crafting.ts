/**
 * クラフトレシピ (3x3配置ではなく「材料を集めてボタンでクラフト」方式のリスト)。
 * 焦点を絞った実用的なレシピ集: 木材加工・石材加工・食料・回路パーツ・医療品・武器・寝具。
 */
import { getBlockDefByKey, isValidBlockKey } from "./blocks";
import { getItemDef, isValidItemKey } from "./items";
import { getCount, removeItems, addItem, type InventoryData } from "./inventory";

export interface RecipeIngredient {
  key: string;
  count: number;
}

export interface Recipe {
  id: string;
  nameJa: string;
  ingredients: RecipeIngredient[];
  outputKey: string;
  outputCount: number;
  descriptionJa: string;
}

const WOOD_LOG = getBlockDefByKey("wood_log").key;
const PLANKS = getBlockDefByKey("planks").key;
const STONE = getBlockDefByKey("stone").key;
const COBBLESTONE = getBlockDefByKey("cobblestone").key;
const CLAY = getBlockDefByKey("clay").key;
const BRICK = getBlockDefByKey("brick").key;
const SAND = getBlockDefByKey("sand").key;
const GLASS = getBlockDefByKey("glass").key;
const METAL = getBlockDefByKey("metal").key;
const GLOW_CRYSTAL = getBlockDefByKey("glow_crystal").key;
const SWITCH = getBlockDefByKey("switch").key;
const WIRE = getBlockDefByKey("wire").key;
const LAMP = getBlockDefByKey("lamp").key;
const BED = getBlockDefByKey("bed").key;

export const RECIPES: readonly Recipe[] = [
  {
    id: "planks",
    nameJa: "木の板",
    ingredients: [{ key: WOOD_LOG, count: 1 }],
    outputKey: PLANKS,
    outputCount: 4,
    descriptionJa: "丸太から木の板を4個作ります。"
  },
  {
    id: "stick",
    nameJa: "棒",
    ingredients: [{ key: PLANKS, count: 2 }],
    outputKey: "stick",
    outputCount: 4,
    descriptionJa: "木の板から棒を4本作ります。"
  },
  {
    id: "cobblestone",
    nameJa: "丸石",
    ingredients: [{ key: STONE, count: 2 }],
    outputKey: COBBLESTONE,
    outputCount: 2,
    descriptionJa: "石を砕いて丸石にします。"
  },
  {
    id: "stone_brick",
    nameJa: "石レンガ",
    ingredients: [{ key: COBBLESTONE, count: 4 }],
    outputKey: getBlockDefByKey("stone_brick").key,
    outputCount: 4,
    descriptionJa: "丸石を加工して石レンガにします。"
  },
  {
    id: "brick",
    nameJa: "レンガ",
    ingredients: [{ key: CLAY, count: 4 }],
    outputKey: BRICK,
    outputCount: 4,
    descriptionJa: "粘土を焼き固めてレンガにします。"
  },
  {
    id: "glass",
    nameJa: "ガラス",
    ingredients: [{ key: SAND, count: 4 }],
    outputKey: GLASS,
    outputCount: 4,
    descriptionJa: "砂を精製してガラスにします。"
  },
  {
    id: "cooked_meat",
    nameJa: "焼き肉",
    ingredients: [
      { key: "raw_meat", count: 1 },
      { key: "stick", count: 1 }
    ],
    outputKey: "cooked_meat",
    outputCount: 1,
    descriptionJa: "生肉を棒で焼いて焼き肉にします。満腹度の回復量が上がります。"
  },
  {
    id: "bandage",
    nameJa: "応急手当キット",
    ingredients: [
      { key: "slime_gel", count: 2 },
      { key: "plant_fiber", count: 1 }
    ],
    outputKey: "bandage",
    outputCount: 1,
    descriptionJa: "スライムのゼリーと植物繊維から応急手当キットを作ります。使うと体力が回復します。"
  },
  {
    id: "stone_sword",
    nameJa: "石の剣",
    ingredients: [
      { key: "stick", count: 1 },
      { key: COBBLESTONE, count: 2 }
    ],
    outputKey: "stone_sword",
    outputCount: 1,
    descriptionJa: "棒と丸石から石の剣を作ります。装備すると攻撃力が上がります。"
  },
  {
    id: "bed",
    nameJa: "ベッド",
    ingredients: [
      { key: PLANKS, count: 3 },
      { key: "wool", count: 3 }
    ],
    outputKey: BED,
    outputCount: 1,
    descriptionJa: "木の板と羊毛からベッドを作ります。設置して使うとそこが復活地点になります。"
  },
  {
    id: "switch",
    nameJa: "スイッチ",
    ingredients: [
      { key: COBBLESTONE, count: 1 },
      { key: PLANKS, count: 1 }
    ],
    outputKey: SWITCH,
    outputCount: 1,
    descriptionJa: "回路の電源を入り切りするスイッチを作ります。"
  },
  {
    id: "wire",
    nameJa: "導線",
    ingredients: [
      { key: METAL, count: 1 },
      { key: "stick", count: 1 }
    ],
    outputKey: WIRE,
    outputCount: 8,
    descriptionJa: "金属パネルから導線を8本作ります。スイッチの電気をランプやドアへ届けます。"
  },
  {
    id: "lamp",
    nameJa: "ランプ",
    ingredients: [
      { key: GLASS, count: 1 },
      { key: GLOW_CRYSTAL, count: 1 }
    ],
    outputKey: LAMP,
    outputCount: 1,
    descriptionJa: "ガラスと光晶石からランプを作ります。導線で電気を通すと光ります。"
  }
];

const byId = new Map<string, Recipe>(RECIPES.map((r) => [r.id, r]));

export function getRecipe(id: string): Recipe {
  const found = byId.get(id);
  if (!found) throw new Error(`未知のレシピIDです: ${id}`);
  return found;
}

export interface CraftCheckResult {
  ok: boolean;
  missing: RecipeIngredient[];
}

/** 材料が足りているか判定し、不足分をわかりやすく返す (UIでの不足表示に使う)。 */
export function checkCraftable(inv: InventoryData, recipe: Recipe): CraftCheckResult {
  const missing: RecipeIngredient[] = [];
  for (const ing of recipe.ingredients) {
    const have = getCount(inv, ing.key);
    if (have < ing.count) {
      missing.push({ key: ing.key, count: ing.count - have });
    }
  }
  return { ok: missing.length === 0, missing };
}

export interface CraftResult {
  ok: boolean;
  inventory: InventoryData;
  missing: RecipeIngredient[];
}

/** クラフトを実行する。材料が足りない場合は変更せず ok=false を返す (サイレント失敗にはしない)。 */
export function craftItem(inv: InventoryData, recipe: Recipe): CraftResult {
  const check = checkCraftable(inv, recipe);
  if (!check.ok) {
    return { ok: false, inventory: inv, missing: check.missing };
  }
  const afterRemoval = removeItems(inv, recipe.ingredients);
  if (!afterRemoval) {
    return { ok: false, inventory: inv, missing: check.missing };
  }
  const afterAdd = addItem(afterRemoval, recipe.outputKey, recipe.outputCount);
  return { ok: true, inventory: afterAdd, missing: [] };
}

/** 表示名解決 (ブロックキーでもアイテムキーでも動く)。 */
export function displayNameForKey(key: string): string {
  if (isValidBlockKey(key)) return getBlockDefByKey(key).nameJa;
  if (isValidItemKey(key)) return getItemDef(key).nameJa;
  throw new Error(`未知の素材キーです: ${key}`);
}
