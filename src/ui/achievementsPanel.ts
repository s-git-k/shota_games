/**
 * Phase 4: 探索/進捗パネル — 発見したバイオーム・開けた宝箱・設置ブロック数・
 * クラフト回数・倒した敵の数・実績の達成状況をまとめて確認できる画面。
 */
import { openModal } from "./modal";
import { el } from "./dom";
import { ACHIEVEMENTS } from "../core/achievements";
import { BIOMES, BIOME_LABELS_JA, type Biome } from "../core/biome";
import type { ProgressSaveData } from "../core/save";

function isBiome(v: string): v is Biome {
  return (BIOMES as readonly string[]).includes(v);
}

export function openProgressPanel(progress: ProgressSaveData): void {
  const modal = openModal("探索の記録");

  modal.body.appendChild(el("h3", "settings-section-title", "探索の記録"));
  const statsList = el("ul", "help-list");
  const discoveredCount = progress.discoveredBiomes.filter(isBiome).length;
  const stats: Array<[string, string]> = [
    ["発見したバイオーム", `${discoveredCount} / ${BIOMES.length}`],
    ["開けた宝箱の数", `${progress.openedTreasureCount}`],
    ["設置したブロック数", `${progress.placedBlocksCount}`],
    ["クラフトした回数", `${progress.craftedItemsCount}`],
    ["倒した敵の数", `${progress.defeatedHostilesCount}`],
    ["洞窟の発見", progress.caveDiscovered ? "済み" : "未発見"],
    ["回路への通電", progress.circuitPoweredEver ? "済み" : "未経験"]
  ];
  for (const [label, value] of stats) {
    const li = el("li", "help-list-item");
    li.appendChild(el("span", "help-key", label));
    li.appendChild(el("span", "help-desc", value));
    statsList.appendChild(li);
  }
  modal.body.appendChild(statsList);

  const biomeRow = el("p", "modal-hint");
  const discoveredLabels = BIOMES.filter((b) => progress.discoveredBiomes.includes(b)).map((b) => BIOME_LABELS_JA[b]);
  biomeRow.textContent =
    discoveredLabels.length > 0 ? `訪れたバイオーム: ${discoveredLabels.join("、")}` : "まだバイオームを発見していません。";
  modal.body.appendChild(biomeRow);

  modal.body.appendChild(el("h3", "settings-section-title", "実績"));
  const unlockedSet = new Set(progress.unlockedAchievements);
  const achList = el("ul", "achievement-list");
  for (const achievement of ACHIEVEMENTS) {
    const unlocked = unlockedSet.has(achievement.id);
    const item = el("li", `achievement-item ${unlocked ? "achievement-unlocked" : "achievement-locked"}`);
    const icon = el("span", "achievement-icon", unlocked ? "★" : "☆");
    const textWrap = el("div", "achievement-text");
    textWrap.appendChild(el("div", "achievement-name", achievement.nameJa));
    textWrap.appendChild(el("div", "achievement-desc", unlocked ? achievement.descriptionJa : "???"));
    item.appendChild(icon);
    item.appendChild(textWrap);
    achList.appendChild(item);
  }
  modal.body.appendChild(achList);
  modal.body.appendChild(
    el("p", "modal-hint", `達成: ${unlockedSet.size} / ${ACHIEVEMENTS.length}`)
  );
}
