/**
 * 「はじめてのチェックリスト」(Phase 5): ワールドを開いた直後に表示する、コンパクトな
 * 常設パネル形式のチュートリアル。
 *
 * 既存のonboarding.ts (アプリ全体で一度だけ出す詳細ヘルプ) とは役割が異なり、こちらは
 * ワールドごとに「基本操作を一通り行ったか」をチェックリスト形式で示す軽量な補助表示。
 * モーダルではないため操作をブロックせず、いつでも閉じられる (閉じた/完了した状態は
 * ワールドIDごとに永続化し、熟練者が同じワールドを開くたびに繰り返し邪魔しないようにする)。
 * 一時停止メニューからいつでも再度開ける。
 */

export type TutorialStepId = "moveLook" | "placeBreak" | "inventory" | "camera" | "modeSpecific";

interface TutorialStepDef {
  id: TutorialStepId;
  label: string;
}

const BASE_STEPS: TutorialStepDef[] = [
  { id: "moveLook", label: "WASDで移動し、マウスで視点を動かす" },
  { id: "placeBreak", label: "左クリックでブロックを壊す / 右クリックで置く" },
  { id: "inventory", label: "[I] でインベントリ・クラフト画面を開く" },
  { id: "camera", label: "[V] で一人称・三人称視点を切り替える" }
];

function modeSpecificStep(gameMode: "creative" | "survival"): TutorialStepDef {
  return gameMode === "survival"
    ? { id: "modeSpecific", label: "画面左上の体力・お腹ゲージを確認する" }
    : { id: "modeSpecific", label: "[F] で飛行モードを切り替える" };
}

export class TutorialChecklist {
  readonly root: HTMLDivElement;
  private readonly steps: TutorialStepDef[];
  private completed = new Set<TutorialStepId>();
  private dismissCallback: (() => void) | null = null;
  private listEl: HTMLUListElement;

  constructor(parent: HTMLElement, gameMode: "creative" | "survival") {
    this.steps = [...BASE_STEPS, modeSpecificStep(gameMode)];

    this.root = document.createElement("div");
    this.root.className = "tutorial-checklist";
    this.root.style.display = "none";

    const title = document.createElement("div");
    title.className = "tutorial-checklist-title";
    title.textContent = "はじめてのチェックリスト";
    this.root.appendChild(title);

    this.listEl = document.createElement("ul");
    this.listEl.className = "tutorial-checklist-list";
    this.root.appendChild(this.listEl);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "tutorial-checklist-close btn btn-secondary";
    closeBtn.textContent = "閉じる";
    closeBtn.addEventListener("click", () => {
      this.hide();
      this.dismissCallback?.();
    });
    this.root.appendChild(closeBtn);

    parent.appendChild(this.root);
    this.renderList();
  }

  private renderList(): void {
    this.listEl.innerHTML = "";
    for (const step of this.steps) {
      const li = document.createElement("li");
      const done = this.completed.has(step.id);
      li.className = "tutorial-checklist-item" + (done ? " done" : "");
      li.textContent = (done ? "\u2705 " : "\u2610 ") + step.label;
      this.listEl.appendChild(li);
    }
  }

  /** 保存されていた完了済み項目を反映する (表示状態は変えない)。 */
  setCompletedSteps(ids: readonly string[]): void {
    this.completed = new Set(ids.filter((id): id is TutorialStepId => this.steps.some((s) => s.id === id)));
    this.renderList();
  }

  getCompletedSteps(): string[] {
    return Array.from(this.completed);
  }

  /** 指定項目を完了にする。新たに完了扱いになった場合のみ true を返す (呼び出し側の保存トリガー用)。 */
  markDone(id: TutorialStepId): boolean {
    if (this.completed.has(id)) return false;
    this.completed.add(id);
    this.renderList();
    if (this.isAllDone()) {
      this.hide();
      this.dismissCallback?.();
    }
    return true;
  }

  isAllDone(): boolean {
    return this.steps.every((s) => this.completed.has(s.id));
  }

  onDismiss(cb: () => void): void {
    this.dismissCallback = cb;
  }

  show(): void {
    this.root.style.display = "block";
  }

  hide(): void {
    this.root.style.display = "none";
  }

  get visible(): boolean {
    return this.root.style.display !== "none";
  }

  dispose(): void {
    this.root.remove();
  }
}
