/**
 * タイトル画面: ワールドの作成・一覧・名前変更・削除・読み込み・書き出し/読み込み(ファイル)。
 * ゲーム開始前に必ずここを通る、フルスクリーンのオーバーレイUI。
 */
import { hashStringToInt } from "../core/rng";
import { createEmptyWorldSave, serializeWorldToJson, type WorldSaveData } from "../core/save";
import { GAME_MODE_DESCRIPTIONS_JA, GAME_MODE_LABELS_JA, type GameMode } from "../core/gameMode";
import {
  deleteWorld,
  generateId,
  importWorldFromJson,
  listWorldSummaries,
  loadWorld,
  renameWorld,
  saveWorld,
  type WorldSummary
} from "../core/storage";
import { el, button } from "./dom";
import { confirmDialog } from "./confirmDialog";
import { showError, showToast } from "./notifications";

export interface TitleScreenHandle {
  destroy: () => void;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function showTitleScreen(root: HTMLElement, onEnterWorld: (world: WorldSaveData) => void): TitleScreenHandle {
  const overlay = el("div", "title-screen");
  root.appendChild(overlay);

  const header = el("div", "title-header");
  header.appendChild(el("h1", "title-logo", "つみき王国"));
  header.appendChild(el("p", "title-tagline", "ブロックを積んで、あなただけの建物を作ろう"));
  overlay.appendChild(header);

  const panel = el("div", "title-panel");
  overlay.appendChild(panel);

  const createSection = el("div", "title-create-section");
  createSection.appendChild(el("h2", "title-section-title", "新しいワールドを作る"));
  const form = el("div", "title-create-form");
  const nameInput = el("input", "title-input") as HTMLInputElement;
  nameInput.type = "text";
  nameInput.placeholder = "ワールド名 (例: わたしの王国)";
  nameInput.maxLength = 40;
  nameInput.setAttribute("aria-label", "新しいワールドの名前");
  const seedInput = el("input", "title-input") as HTMLInputElement;
  seedInput.type = "text";
  seedInput.placeholder = "シード (空欄でランダム)";
  seedInput.setAttribute("aria-label", "ワールドのシード文字列 (省略可)");

  const modeGroup = el("div", "title-mode-group");
  modeGroup.setAttribute("role", "radiogroup");
  modeGroup.setAttribute("aria-label", "ゲームモード");
  let selectedMode: GameMode = "creative";
  const modeButtons: HTMLButtonElement[] = [];
  const modes: GameMode[] = ["creative", "survival"];
  for (const mode of modes) {
    const modeBtn = button(GAME_MODE_LABELS_JA[mode], "title-mode-btn") as HTMLButtonElement;
    modeBtn.setAttribute("role", "radio");
    modeBtn.title = GAME_MODE_DESCRIPTIONS_JA[mode];
    modeBtn.addEventListener("click", () => {
      selectedMode = mode;
      modeButtons.forEach((b, i) => b.classList.toggle("title-mode-btn-selected", modes[i] === mode));
      modeButtons.forEach((b, i) => b.setAttribute("aria-checked", String(modes[i] === mode)));
      modeHint.textContent = GAME_MODE_DESCRIPTIONS_JA[mode];
    });
    modeGroup.appendChild(modeBtn);
    modeButtons.push(modeBtn);
  }
  modeButtons[0]?.classList.add("title-mode-btn-selected");
  modeButtons[0]?.setAttribute("aria-checked", "true");
  const modeHint = el("p", "modal-hint", GAME_MODE_DESCRIPTIONS_JA.creative);

  const createBtn = button("作成してはじめる", "btn btn-primary");
  form.appendChild(nameInput);
  form.appendChild(seedInput);
  form.appendChild(modeGroup);
  form.appendChild(modeHint);
  form.appendChild(createBtn);
  createSection.appendChild(form);

  const importBtn = button("ファイルからワールドをインポート", "btn btn-secondary");
  const importInput = el("input") as HTMLInputElement;
  importInput.type = "file";
  importInput.accept = "application/json,.json";
  importInput.style.display = "none";
  importBtn.addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", () => {
    void handleImportFile(importInput.files?.[0] ?? null);
  });
  createSection.appendChild(importBtn);
  createSection.appendChild(importInput);

  panel.appendChild(createSection);

  const listSection = el("div", "title-list-section");
  listSection.appendChild(el("h2", "title-section-title", "ワールドを選ぶ"));
  const listRoot = el("div", "world-list");
  listSection.appendChild(listRoot);
  panel.appendChild(listSection);

  async function refreshList(): Promise<void> {
    listRoot.innerHTML = "";
    let summaries: WorldSummary[];
    try {
      summaries = await listWorldSummaries();
    } catch (err) {
      showError(`ワールド一覧の読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (summaries.length === 0) {
      listRoot.appendChild(el("p", "world-list-empty", "まだワールドがありません。左のフォームから作成してください。"));
      return;
    }
    for (const summary of summaries) {
      listRoot.appendChild(buildWorldRow(summary));
    }
  }

  function buildWorldRow(summary: WorldSummary): HTMLDivElement {
    const row = el("div", "world-row");
    const info = el("div", "world-row-info");
    const nameEl = el("div", "world-row-name", summary.name);
    const metaEl = el(
      "div",
      "world-row-meta",
      `${GAME_MODE_LABELS_JA[summary.gameMode]} ・ シード: ${summary.seedText || "(ランダム)"} ・ 最終更新: ${formatDate(summary.updatedAt)}`
    );
    info.appendChild(nameEl);
    info.appendChild(metaEl);
    row.appendChild(info);

    const actions = el("div", "world-row-actions");

    const loadBtn = button("読み込む", "btn btn-primary btn-small");
    loadBtn.addEventListener("click", () => void handleLoad(summary.id));
    actions.appendChild(loadBtn);

    const renameBtn = button("名前変更", "btn btn-secondary btn-small");
    renameBtn.addEventListener("click", () => void handleRename(summary.id, summary.name));
    actions.appendChild(renameBtn);

    const exportBtn = button("書き出し", "btn btn-secondary btn-small");
    exportBtn.addEventListener("click", () => void handleExport(summary.id));
    actions.appendChild(exportBtn);

    const deleteBtn = button("削除", "btn btn-danger btn-small");
    deleteBtn.addEventListener("click", () => void handleDelete(summary.id, summary.name));
    actions.appendChild(deleteBtn);

    row.appendChild(actions);
    return row;
  }

  async function handleLoad(id: string): Promise<void> {
    try {
      const world = await loadWorld(id);
      if (!world) {
        showError("ワールドが見つかりませんでした。");
        return;
      }
      onEnterWorld(world);
    } catch (err) {
      showError(`ワールドの読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleRename(id: string, currentName: string): Promise<void> {
    const next = window.prompt("新しいワールド名を入力してください", currentName);
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed.length === 0) {
      showError("ワールド名を空にはできません。");
      return;
    }
    try {
      await renameWorld(id, trimmed);
      showToast("ワールド名を変更しました。", "success");
      await refreshList();
    } catch (err) {
      showError(`名前の変更に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleExport(id: string): Promise<void> {
    try {
      const world = await loadWorld(id);
      if (!world) {
        showError("ワールドが見つかりませんでした。");
        return;
      }
      const json = serializeWorldToJson(world);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${world.name.replace(/[\\/:*?"<>|]/g, "_")}.tsumiki.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("ワールドファイルを書き出しました。", "success");
    } catch (err) {
      showError(`書き出しに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleDelete(id: string, name: string): Promise<void> {
    const ok = await confirmDialog(`ワールド「${name}」を削除します。この操作は取り消せません。よろしいですか?`);
    if (!ok) return;
    try {
      await deleteWorld(id);
      showToast("ワールドを削除しました。", "success");
      await refreshList();
    } catch (err) {
      showError(`削除に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleImportFile(file: File | null): Promise<void> {
    if (!file) return;
    try {
      const text = await file.text();
      const imported = await importWorldFromJson(text);
      showToast(`「${imported.name}」をインポートしました。`, "success");
      await refreshList();
    } catch (err) {
      showError(`インポートに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      importInput.value = "";
    }
  }

  createBtn.addEventListener("click", () => {
    void (async () => {
      const name = nameInput.value.trim() || "新しい王国";
      const seedText = seedInput.value.trim();
      const effectiveSeedText = seedText.length > 0 ? seedText : `random-${Date.now()}-${Math.random()}`;
      const seed = hashStringToInt(effectiveSeedText);
      const world = createEmptyWorldSave({
        id: generateId(),
        name,
        seedText,
        seed,
        now: Date.now(),
        gameMode: selectedMode
      });
      try {
        await saveWorld(world);
        onEnterWorld(world);
      } catch (err) {
        showError(`ワールドの作成に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  });

  void refreshList();

  return {
    destroy: () => overlay.remove()
  };
}
