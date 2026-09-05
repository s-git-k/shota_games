/**
 * フルインベントリ (全ブロックパレット) パネル。
 * クリックすると現在選択中のクイックバースロットにそのブロックを割り当てる。
 */
import { BLOCKS, type BlockCategory } from "../core/blocks";
import { openModal } from "./modal";
import { el } from "./dom";

const CATEGORY_LABELS_JA: Record<BlockCategory, string> = {
  terrain: "地形",
  wood: "木材",
  stone: "石材",
  special: "特殊パーツ",
  circuit: "回路パーツ"
};

export function openInventoryPanel(onPick: (blockId: number) => void): void {
  const modal = openModal("インベントリ (全ブロック一覧)");
  modal.body.appendChild(
    el("p", "modal-hint", "クリックすると、現在選択中のクイックバースロットにブロックをセットします。")
  );

  const categories: BlockCategory[] = ["terrain", "wood", "stone", "special", "circuit"];
  for (const cat of categories) {
    const blocks = BLOCKS.filter((b) => b.inPalette && b.category === cat);
    if (blocks.length === 0) continue;
    modal.body.appendChild(el("h3", "inventory-category-title", CATEGORY_LABELS_JA[cat]));
    const grid = el("div", "inventory-grid");
    for (const b of blocks) {
      const item = el("button", "inventory-item") as HTMLButtonElement;
      item.type = "button";
      const swatch = el("div", "inventory-swatch");
      swatch.style.backgroundColor = `#${b.color.toString(16).padStart(6, "0")}`;
      if (b.transparent) swatch.style.opacity = "0.6";
      item.appendChild(swatch);
      item.appendChild(el("span", "inventory-label", b.nameJa));
      item.addEventListener("click", () => {
        onPick(b.id);
      });
      grid.appendChild(item);
    }
    modal.body.appendChild(grid);
  }
}
