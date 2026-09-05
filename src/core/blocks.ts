/**
 * ブロック定義レジストリ。
 * Phase 1では空気を除く32種類、Phase 2では回路パーツ4種を追加し合計36種類を実装。
 * 今後も拡張しやすいように、カテゴリ・形状・物理性質を持つデータ駆動の構造にしている。
 */

export type BlockShape =
  | "cube"
  | "slab"
  | "stairs"
  | "fence"
  | "door"
  | "leaves"
  | "liquid"
  | "switch"
  | "wire"
  | "lamp"
  | "bed";

export type BlockCategory = "terrain" | "wood" | "stone" | "special" | "circuit";

export interface BlockDefinition {
  /** 0 は必ず空気 */
  id: number;
  /** 内部キー (保存データや検索に使用) */
  key: string;
  /** 日本語表示名 */
  nameJa: string;
  category: BlockCategory;
  shape: BlockShape;
  /** ベースカラー (0xRRGGBB) */
  color: number;
  /** 側面用にわずかに暗くした色を使うか (立方体の疑似AO) */
  shadeSides: boolean;
  /** 半透明として描画するか (ガラス等) */
  transparent: boolean;
  /** 衝突判定を持つか (ドアが開いている時などは false) */
  solidDefault: boolean;
  /** クイックバー等の初期パレットに含めるか */
  inPalette: boolean;
}

const def = (partial: Omit<BlockDefinition, "shadeSides" | "transparent" | "solidDefault" | "inPalette"> & Partial<BlockDefinition>): BlockDefinition => ({
  shadeSides: true,
  transparent: false,
  solidDefault: true,
  inPalette: true,
  ...partial
});

export const AIR_ID = 0;

/** ID => 定義 のレジストリ本体 */
export const BLOCKS: readonly BlockDefinition[] = [
  def({ id: 0, key: "air", nameJa: "空気", category: "terrain", shape: "cube", color: 0x000000, inPalette: false, solidDefault: false }),
  def({ id: 1, key: "grass", nameJa: "草ブロック", category: "terrain", shape: "cube", color: 0x6abe4b }),
  def({ id: 2, key: "dirt", nameJa: "土", category: "terrain", shape: "cube", color: 0x8b6a4a }),
  def({ id: 3, key: "stone", nameJa: "石", category: "terrain", shape: "cube", color: 0x9a9a9a }),
  def({ id: 4, key: "sand", nameJa: "砂", category: "terrain", shape: "cube", color: 0xe8d38a }),
  def({ id: 5, key: "snow", nameJa: "雪", category: "terrain", shape: "cube", color: 0xf4f9ff }),
  def({ id: 6, key: "wood_log", nameJa: "丸太", category: "wood", shape: "cube", color: 0x8a5a34 }),
  def({ id: 7, key: "planks", nameJa: "木の板", category: "wood", shape: "cube", color: 0xd9a066 }),
  def({ id: 8, key: "leaves", nameJa: "葉っぱ", category: "wood", shape: "leaves", color: 0x4f9e3b, transparent: true, solidDefault: true }),
  def({ id: 9, key: "brick", nameJa: "レンガ", category: "stone", shape: "cube", color: 0xb15c4a }),
  def({ id: 10, key: "stone_brick", nameJa: "石レンガ", category: "stone", shape: "cube", color: 0x7c7c86 }),
  def({ id: 11, key: "glass", nameJa: "ガラス", category: "stone", shape: "cube", color: 0xbfe8f0, transparent: true, shadeSides: false }),
  def({ id: 12, key: "metal", nameJa: "金属パネル", category: "stone", shape: "cube", color: 0xc7ccd1 }),
  def({ id: 13, key: "clay", nameJa: "粘土", category: "terrain", shape: "cube", color: 0xd8ae8a }),
  def({ id: 14, key: "gold", nameJa: "黄金ブロック", category: "special", shape: "cube", color: 0xf6c445 }),
  def({ id: 15, key: "stairs", nameJa: "木の階段", category: "special", shape: "stairs", color: 0xd9a066 }),
  def({ id: 16, key: "fence", nameJa: "木の柵", category: "special", shape: "fence", color: 0x8a5a34, solidDefault: true }),
  def({ id: 17, key: "door", nameJa: "木のドア", category: "special", shape: "door", color: 0xa9714a, solidDefault: true }),
  def({ id: 18, key: "cobblestone", nameJa: "丸石", category: "stone", shape: "cube", color: 0x85827d }),
  def({ id: 19, key: "mossy_stone", nameJa: "苔むした石", category: "stone", shape: "cube", color: 0x708063 }),
  def({ id: 20, key: "marble", nameJa: "白大理石", category: "stone", shape: "cube", color: 0xe6e2dc }),
  def({ id: 21, key: "slate", nameJa: "青灰石", category: "stone", shape: "cube", color: 0x586674 }),
  def({ id: 22, key: "red_planks", nameJa: "赤木の板", category: "wood", shape: "cube", color: 0xb96f55 }),
  def({ id: 23, key: "dark_planks", nameJa: "黒樫の板", category: "wood", shape: "cube", color: 0x594231 }),
  def({ id: 24, key: "birch_log", nameJa: "白樺の丸太", category: "wood", shape: "cube", color: 0xd8ccb0 }),
  def({ id: 25, key: "birch_planks", nameJa: "白樺の板", category: "wood", shape: "cube", color: 0xe2c98d }),
  def({ id: 26, key: "white_clay", nameJa: "白い粘土", category: "terrain", shape: "cube", color: 0xeee5da }),
  def({ id: 27, key: "blue_clay", nameJa: "青い粘土", category: "terrain", shape: "cube", color: 0x6f9fc4 }),
  def({ id: 28, key: "green_clay", nameJa: "緑の粘土", category: "terrain", shape: "cube", color: 0x7eae79 }),
  def({ id: 29, key: "purple_clay", nameJa: "紫の粘土", category: "terrain", shape: "cube", color: 0xa07dac }),
  def({ id: 30, key: "roof_tile", nameJa: "屋根瓦", category: "special", shape: "stairs", color: 0x9e4f4f }),
  def({ id: 31, key: "glow_crystal", nameJa: "光晶石", category: "special", shape: "cube", color: 0x83e3d4, shadeSides: false }),
  def({
    id: 32,
    key: "fantasy_glass",
    nameJa: "虹色ガラス",
    category: "special",
    shape: "cube",
    color: 0xc8a7ea,
    transparent: true,
    shadeSides: false
  }),
  // ---- Phase 2: 回路パーツ (歩行を妨げないよう非衝突の付属パーツとして扱う) ----
  def({
    id: 33,
    key: "switch",
    nameJa: "スイッチ",
    category: "circuit",
    shape: "switch",
    color: 0x777f8c,
    solidDefault: false
  }),
  def({
    id: 34,
    key: "wire",
    nameJa: "導線",
    category: "circuit",
    shape: "wire",
    color: 0xb08d57,
    solidDefault: false
  }),
  def({
    id: 35,
    key: "lamp",
    nameJa: "ランプ",
    category: "circuit",
    shape: "lamp",
    color: 0xfff2b0,
    solidDefault: false,
    shadeSides: false
  }),
  def({
    id: 36,
    key: "bed",
    nameJa: "ベッド",
    category: "special",
    shape: "bed",
    color: 0xd65f7a,
    solidDefault: false
  }),
  // ---- Phase 3: 地形/地下生成 (バイオーム・海・地下水) ----
  def({
    id: 37,
    key: "water",
    nameJa: "水",
    category: "terrain",
    shape: "liquid",
    color: 0x3d78c9,
    transparent: true,
    shadeSides: false,
    solidDefault: false,
    // 地形生成が自動配置するための素材であり、クイックバー初期パレットには含めない
    inPalette: false
  })
];

const byId = new Map<number, BlockDefinition>(BLOCKS.map((b) => [b.id, b]));
const byKey = new Map<string, BlockDefinition>(BLOCKS.map((b) => [b.key, b]));

export function getBlockDef(id: number): BlockDefinition {
  const found = byId.get(id);
  if (!found) {
    throw new Error(`未知のブロックIDです: ${id}`);
  }
  return found;
}

export function getBlockDefByKey(key: string): BlockDefinition {
  const found = byKey.get(key);
  if (!found) {
    throw new Error(`未知のブロックキーです: ${key}`);
  }
  return found;
}

export function isValidBlockId(id: number): boolean {
  return byId.has(id);
}

export function isValidBlockKey(key: string): boolean {
  return byKey.has(key);
}

/** クイックバー/インベントリの初期並び順 (空気を除く) */
export const PALETTE_ORDER: readonly number[] = BLOCKS.filter((b) => b.inPalette).map((b) => b.id);

/** デフォルトのクイックバー (先頭9個) */
export const DEFAULT_QUICKBAR: readonly number[] = PALETTE_ORDER.slice(0, 9);
