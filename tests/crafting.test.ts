import { describe, expect, it } from "vitest";
import { RECIPES, checkCraftable, craftItem, displayNameForKey, getRecipe } from "../src/core/crafting";
import { addItem, createEmptyInventory, getCount } from "../src/core/inventory";

describe("crafting", () => {
  it("レシピ一覧は空ではなく、IDが重複しない", () => {
    expect(RECIPES.length).toBeGreaterThan(0);
    const ids = new Set(RECIPES.map((r) => r.id));
    expect(ids.size).toBe(RECIPES.length);
  });

  it("getRecipe は未知のIDで例外を投げる", () => {
    expect(() => getRecipe("no-such-recipe")).toThrow();
  });

  it("checkCraftable は不足している材料をわかりやすく返す", () => {
    const recipe = getRecipe("planks");
    const inv = createEmptyInventory();
    const result = checkCraftable(inv, recipe);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([{ key: "wood_log", count: 1 }]);
  });

  it("材料が揃っているとcheckCraftableはokになる", () => {
    const recipe = getRecipe("planks");
    const inv = addItem(createEmptyInventory(), "wood_log", 1);
    const result = checkCraftable(inv, recipe);
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("craftItem は材料を消費して成果物を追加する", () => {
    const recipe = getRecipe("planks");
    const inv = addItem(createEmptyInventory(), "wood_log", 1);
    const result = craftItem(inv, recipe);
    expect(result.ok).toBe(true);
    expect(getCount(result.inventory, "wood_log")).toBe(0);
    expect(getCount(result.inventory, "planks")).toBe(4);
  });

  it("craftItem は材料不足時に変更せず失敗を返す", () => {
    const recipe = getRecipe("stone_sword");
    const inv = createEmptyInventory();
    const result = craftItem(inv, recipe);
    expect(result.ok).toBe(false);
    expect(result.inventory).toBe(inv);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it("複数材料のレシピ (焼き肉) が正しく機能する", () => {
    const recipe = getRecipe("cooked_meat");
    let inv = addItem(createEmptyInventory(), "raw_meat", 1);
    inv = addItem(inv, "stick", 1);
    const result = craftItem(inv, recipe);
    expect(result.ok).toBe(true);
    expect(getCount(result.inventory, "cooked_meat")).toBe(1);
    expect(getCount(result.inventory, "raw_meat")).toBe(0);
  });

  it("displayNameForKey はブロック/アイテムいずれのキーでも解決できる", () => {
    expect(displayNameForKey("wood_log")).toBe("丸太");
    expect(displayNameForKey("stick")).toBe("棒");
  });

  it("displayNameForKey は未知のキーで例外を投げる", () => {
    expect(() => displayNameForKey("no-such-key")).toThrow();
  });

  it("回路パーツのレシピ (スイッチ/導線/ランプ) が存在する", () => {
    expect(RECIPES.some((r) => r.id === "switch")).toBe(true);
    expect(RECIPES.some((r) => r.id === "wire")).toBe(true);
    expect(RECIPES.some((r) => r.id === "lamp")).toBe(true);
  });

  it("Phase 4の家具レシピ (宝箱/テーブル/いす) が存在し、木の板から作れる", () => {
    for (const id of ["chest", "table", "chair"]) {
      const recipe = getRecipe(id);
      const inv = addItem(createEmptyInventory(), "planks", 20);
      const result = craftItem(inv, recipe);
      expect(result.ok).toBe(true);
      expect(getCount(result.inventory, recipe.outputKey)).toBe(recipe.outputCount);
    }
  });
});
