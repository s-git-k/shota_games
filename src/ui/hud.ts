/**
 * ゲーム中に常時表示するHUD: クロスヘア・クイックバー・簡易ステータス表示・
 * サバイバル用の体力/空腹バー・昼夜インジケーター・操作ヒントを扱う。
 */
import { DEFAULT_QUICKBAR, getBlockDef } from "../core/blocks";
import { GAME_MODE_LABELS_JA, type GameMode } from "../core/gameMode";
import { el } from "./dom";

export class Hud {
  readonly root: HTMLDivElement;
  private crosshair: HTMLDivElement;
  private quickbarRoot: HTMLDivElement;
  private slots: HTMLButtonElement[] = [];
  private statusRoot: HTMLDivElement;
  private hintRoot: HTMLDivElement;
  private modeRoot: HTMLDivElement;
  private dayTimeRoot: HTMLDivElement;
  private environmentRoot: HTMLDivElement;
  private survivalRoot: HTMLDivElement;
  private heartsRoot: HTMLDivElement;
  private hungerRoot: HTMLDivElement;
  private quickbar: number[] = [...DEFAULT_QUICKBAR];
  private selectedIndex = 0;
  private onSelectCallback: ((index: number) => void) | null = null;
  private quickbarCounts: Map<number, number> | null = null;

  constructor(parent: HTMLElement) {
    this.root = el("div", "hud");

    this.crosshair = el("div", "crosshair");
    this.crosshair.setAttribute("aria-hidden", "true");
    this.root.appendChild(this.crosshair);

    const topBar = el("div", "hud-topbar");
    this.modeRoot = el("div", "hud-mode");
    this.dayTimeRoot = el("div", "hud-daytime");
    this.environmentRoot = el("div", "hud-environment");
    topBar.appendChild(this.modeRoot);
    topBar.appendChild(this.dayTimeRoot);
    topBar.appendChild(this.environmentRoot);
    this.root.appendChild(topBar);

    this.survivalRoot = el("div", "hud-survival");
    this.heartsRoot = el("div", "hud-hearts");
    this.heartsRoot.setAttribute("aria-label", "体力");
    this.hungerRoot = el("div", "hud-hunger");
    this.hungerRoot.setAttribute("aria-label", "満腹度");
    this.survivalRoot.appendChild(this.heartsRoot);
    this.survivalRoot.appendChild(this.hungerRoot);
    this.survivalRoot.style.display = "none";
    this.root.appendChild(this.survivalRoot);

    this.hintRoot = el("div", "hud-hint");
    this.hintRoot.setAttribute("aria-live", "polite");
    this.root.appendChild(this.hintRoot);

    this.statusRoot = el("div", "hud-status");
    this.statusRoot.setAttribute("aria-live", "off");
    this.root.appendChild(this.statusRoot);

    this.quickbarRoot = el("div", "quickbar");
    this.quickbarRoot.setAttribute("role", "listbox");
    this.quickbarRoot.setAttribute("aria-label", "クイックバー");
    this.root.appendChild(this.quickbarRoot);

    parent.appendChild(this.root);
    this.renderQuickbar();
  }

  onSelect(cb: (index: number) => void): void {
    this.onSelectCallback = cb;
  }

  setQuickbar(items: number[]): void {
    this.quickbar = items.slice(0, 9);
    while (this.quickbar.length < 9) this.quickbar.push(0);
    this.renderQuickbar();
  }

  getQuickbar(): number[] {
    return [...this.quickbar];
  }

  setSlotItem(index: number, blockId: number): void {
    if (index < 0 || index >= this.quickbar.length) return;
    this.quickbar[index] = blockId;
    this.renderQuickbar();
  }

  selectSlot(index: number): void {
    if (index < 0 || index >= this.quickbar.length) return;
    this.selectedIndex = index;
    this.updateSelectedVisual();
    this.onSelectCallback?.(index);
  }

  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  getSelectedBlockId(): number {
    return this.quickbar[this.selectedIndex] ?? 0;
  }

  cycleSlot(delta: number): void {
    const n = this.quickbar.length;
    const next = ((this.selectedIndex + delta) % n + n) % n;
    this.selectSlot(next);
  }

  /**
   * サバイバルモード用: 各ブロックの所持数をクイックバーに小さく表示する。
   * null を渡すと表示を消す (クリエイティブモード)。
   */
  setQuickbarCounts(counts: Map<number, number> | null): void {
    this.quickbarCounts = counts;
    this.renderQuickbar();
  }

  private renderQuickbar(): void {
    this.quickbarRoot.innerHTML = "";
    this.slots = [];
    this.quickbar.forEach((blockId, i) => {
      const slot = el("button", "quickbar-slot") as HTMLButtonElement;
      slot.type = "button";
      slot.setAttribute("role", "option");
      slot.setAttribute("aria-label", `スロット ${i + 1}: ${blockId > 0 ? getBlockDef(blockId).nameJa : "空"}`);
      if (blockId > 0) {
        const def = getBlockDef(blockId);
        const swatch = el("div", "quickbar-swatch");
        swatch.style.backgroundColor = `#${def.color.toString(16).padStart(6, "0")}`;
        slot.appendChild(swatch);
        slot.appendChild(el("span", "quickbar-label", def.nameJa));
        if (this.quickbarCounts) {
          const count = this.quickbarCounts.get(blockId) ?? 0;
          slot.appendChild(el("span", "quickbar-count", String(count)));
          if (count <= 0) slot.classList.add("quickbar-slot-empty");
        }
      }
      slot.appendChild(el("span", "quickbar-index", String(i + 1)));
      slot.addEventListener("click", () => this.selectSlot(i));
      this.quickbarRoot.appendChild(slot);
      this.slots.push(slot);
    });
    this.updateSelectedVisual();
  }

  private updateSelectedVisual(): void {
    this.slots.forEach((slot, i) => {
      slot.classList.toggle("quickbar-slot-selected", i === this.selectedIndex);
    });
  }

  setStatusText(text: string): void {
    this.statusRoot.textContent = text;
  }

  /** 画面下部近くに表示する、状況に応じた短い操作ヒント (例:「[クリック]攻撃」)。 */
  setHint(text: string): void {
    this.hintRoot.textContent = text;
    this.hintRoot.style.display = text ? "block" : "none";
  }

  setModeLabel(mode: GameMode): void {
    this.modeRoot.textContent = GAME_MODE_LABELS_JA[mode];
    this.modeRoot.classList.toggle("hud-mode-survival", mode === "survival");
  }

  setDayTime(label: string, isNight: boolean): void {
    this.dayTimeRoot.textContent = `${isNight ? "🌙" : "☀"} ${label}`;
    this.dayTimeRoot.classList.toggle("hud-daytime-night", isNight);
  }

  /** 現在のバイオーム名と天候を1行で表示する (例: 「🌲 森林 ・ 🌧 雨」)。 */
  setEnvironment(biomeLabelJa: string, weatherLabelJa: string, weatherIcon: string): void {
    this.environmentRoot.textContent = `${biomeLabelJa} ・ ${weatherIcon} ${weatherLabelJa}`;
  }

  /** サバイバルHUD (体力ハート・満腹度) の表示切り替え。 */
  setSurvivalVisible(visible: boolean): void {
    this.survivalRoot.style.display = visible ? "flex" : "none";
  }

  setHealth(current: number, max: number): void {
    this.heartsRoot.innerHTML = "";
    const totalHearts = Math.ceil(max / 2);
    const filledHearts = current / 2;
    for (let i = 0; i < totalHearts; i++) {
      const heart = el("span", "hud-heart");
      const fill = Math.max(0, Math.min(1, filledHearts - i));
      heart.textContent = fill >= 1 ? "❤" : fill > 0 ? "🩷" : "🤍";
      this.heartsRoot.appendChild(heart);
    }
  }

  setHunger(current: number, max: number): void {
    this.hungerRoot.innerHTML = "";
    const totalIcons = Math.ceil(max / 2);
    const filledIcons = current / 2;
    for (let i = 0; i < totalIcons; i++) {
      const icon = el("span", "hud-hunger-icon");
      const fill = Math.max(0, Math.min(1, filledIcons - i));
      icon.textContent = fill >= 1 ? "🍗" : fill > 0 ? "🍖" : "⬜";
      this.hungerRoot.appendChild(icon);
    }
  }
}
