/**
 * サバイバル用の「持ち物 + クラフト」パネル。
 * 3x3配置ではなく、レシピ一覧からボタンでクラフトする方式。
 * 材料不足の場合は不足分をはっきり表示する。
 */
import { RECIPES, checkCraftable, displayNameForKey, type Recipe } from "../core/crafting";
import { nonEmptyEntries, type InventoryData } from "../core/inventory";
import { isValidBlockKey, getBlockDefByKey } from "../core/blocks";
import { isValidItemKey, getItemDef } from "../core/items";
import { openModal } from "./modal";
import { el, button } from "./dom";

export interface SurvivalPanelHandle {
  refresh: () => void;
}

function colorForKey(key: string): number {
  if (isValidBlockKey(key)) return getBlockDefByKey(key).color;
  if (isValidItemKey(key)) return getItemDef(key).color;
  return 0xbbbbbb;
}

/** 非ブロックアイテムのうち、クリックで「使う/装備する」操作ができるものにボタンラベルを返す。null なら使用不可。 */
function useLabelForItem(key: string): string | null {
  if (!isValidItemKey(key)) return null;
  const def = getItemDef(key);
  if (def.category === "food" || def.category === "medicine") return "使う";
  if (def.category === "tool") return "装備する";
  return null;
}

export function openSurvivalPanel(
  getInventory: () => InventoryData,
  onCraft: (recipe: Recipe) => void,
  onAssignToQuickbar: (blockKey: string) => void,
  onUseItem: (key: string) => void
): SurvivalPanelHandle {
  const modal = openModal("持ち物 と クラフト");

  const invSection = el("div", "survival-panel-section");
  invSection.appendChild(el("h3", "settings-section-title", "持ち物"));
  const invGrid = el("div", "inventory-grid");
  invSection.appendChild(invGrid);
  modal.body.appendChild(invSection);

  const craftSection = el("div", "survival-panel-section");
  craftSection.appendChild(el("h3", "settings-section-title", "クラフト"));
  craftSection.appendChild(
    el("p", "modal-hint", "材料を集めてボタンを押すとクラフトできます。不足している材料は赤字で表示されます。")
  );
  const recipeList = el("div", "recipe-list");
  craftSection.appendChild(recipeList);
  modal.body.appendChild(craftSection);

  function renderInventory(): void {
    invGrid.innerHTML = "";
    const inv = getInventory();
    const entries = nonEmptyEntries(inv);
    if (entries.length === 0) {
      invGrid.appendChild(el("p", "modal-hint", "まだ何も持っていません。ブロックを壊したり生物を倒したりして集めましょう。"));
      return;
    }
    for (const [key, count] of entries) {
      const item = el("button", "inventory-item") as HTMLButtonElement;
      item.type = "button";
      const swatch = el("div", "inventory-swatch");
      swatch.style.backgroundColor = `#${colorForKey(key).toString(16).padStart(6, "0")}`;
      item.appendChild(swatch);
      item.appendChild(el("span", "inventory-label", displayNameForKey(key)));
      item.appendChild(el("span", "inventory-count", `×${count}`));
      const useLabel = useLabelForItem(key);
      if (isValidBlockKey(key)) {
        item.title = "クリックでクイックバーにセット";
        item.addEventListener("click", () => onAssignToQuickbar(key));
      } else if (useLabel) {
        item.title = useLabel;
        item.appendChild(el("span", "inventory-use-label", useLabel));
        item.addEventListener("click", () => {
          onUseItem(key);
          renderInventory();
        });
      } else {
        item.disabled = true;
      }
      invGrid.appendChild(item);
    }
  }

  function renderRecipes(): void {
    recipeList.innerHTML = "";
    const inv = getInventory();
    for (const recipe of RECIPES) {
      const check = checkCraftable(inv, recipe);
      const row = el("div", "recipe-row");
      const info = el("div", "recipe-info");
      info.appendChild(el("div", "recipe-name", recipe.nameJa));
      info.appendChild(el("div", "recipe-desc", recipe.descriptionJa));
      const ingredientsEl = el("div", "recipe-ingredients");
      for (const ing of recipe.ingredients) {
        const have = inv[ing.key] ?? 0;
        const short = have < ing.count;
        const span = el("span", short ? "recipe-ingredient recipe-ingredient-missing" : "recipe-ingredient");
        span.textContent = `${displayNameForKey(ing.key)} ${have}/${ing.count}`;
        ingredientsEl.appendChild(span);
      }
      info.appendChild(ingredientsEl);
      row.appendChild(info);

      const craftBtn = button("作る", "btn btn-primary btn-small") as HTMLButtonElement;
      craftBtn.disabled = !check.ok;
      craftBtn.addEventListener("click", () => {
        onCraft(recipe);
        renderInventory();
        renderRecipes();
      });
      row.appendChild(craftBtn);
      recipeList.appendChild(row);
    }
  }

  renderInventory();
  renderRecipes();

  return {
    refresh: () => {
      renderInventory();
      renderRecipes();
    }
  };
}
