/**
 * Phase 4: 建築メニュー — 範囲選択の使い方・クリップボードの回転/反転・設計図ライブラリ。
 * クリエイティブモード専用の変換操作は、サバイバルでは明示的な説明とともに無効化する
 * (資源複製によるサバイバル経済の破壊を防ぐため)。
 */
import { openModal } from "./modal";
import { el, button } from "./dom";
import { confirmDialog } from "./confirmDialog";
import { showError, showToast } from "./notifications";
import { labelForCode } from "./onboarding";
import type { ActionId, GameSettings } from "../core/settings";
import type { GameMode } from "../core/gameMode";
import type { Clipboard } from "../core/selection";
import {
  validateBlueprintName,
  BlueprintValidationError,
  type BlueprintRecord
} from "../core/blueprint";
import {
  listBlueprints,
  deleteBlueprint,
  renameBlueprint,
  importBlueprintFromJson,
  exportBlueprintToJson
} from "../core/storage";

export interface BuildMenuActions {
  gameMode: GameMode;
  settings: GameSettings;
  getClipboard: () => Clipboard | null;
  onRotate: (direction: "cw" | "ccw") => void;
  onMirror: (axis: "x" | "z") => void;
  onPaste: () => void;
  /** 現在のクリップボードを設計図として保存する。バリデーション後の名前を渡す。 */
  onSaveBlueprint: (name: string) => Promise<BlueprintRecord | null>;
  /** 設計図の内容をクリップボードへ読み込む。 */
  onLoadBlueprint: (record: BlueprintRecord) => void;
}

function keyHint(settings: GameSettings, action: ActionId): string {
  return `[${labelForCode(settings.keyBindings[action])}]`;
}

export function openBuildMenu(actions: BuildMenuActions): void {
  const modal = openModal("建築メニュー");
  const isCreative = actions.gameMode === "creative";

  modal.body.appendChild(el("h3", "settings-section-title", "範囲選択のやりかた"));
  const instructions = el("ul", "help-list");
  const instructionRows: Array<[string, string]> = [
    [keyHint(actions.settings, "selectionMark"), "見ているブロックを1点目として設定。もう一度押すと2点目が確定し、直方体の範囲が選択される"],
    [keyHint(actions.settings, "selectionCopy"), "選択範囲の内容をクリップボードにコピー"],
    [keyHint(actions.settings, "selectionPaste"), "見ている位置を基準にクリップボードを貼り付け"]
  ];
  for (const [key, desc] of instructionRows) {
    const li = el("li", "help-list-item");
    li.appendChild(el("span", "help-key", key));
    li.appendChild(el("span", "help-desc", desc));
    instructions.appendChild(li);
  }
  modal.body.appendChild(instructions);
  modal.body.appendChild(
    el("p", "modal-hint", "選択中は画面内に半透明の枠が表示されます。範囲は最大100,000ブロックまでです。")
  );

  if (!isCreative) {
    modal.body.appendChild(
      el(
        "p",
        "modal-hint modal-hint-warning",
        "コピーは利用できますが、回転・反転・範囲貼り付け・設計図の読み込みは、資源の複製を防ぐためクリエイティブモード専用です。"
      )
    );
  }

  modal.body.appendChild(el("h3", "settings-section-title", "クリップボードの変換"));
  const clipboardInfo = el("p", "modal-hint");
  modal.body.appendChild(clipboardInfo);

  function refreshClipboardInfo(): void {
    const clip = actions.getClipboard();
    clipboardInfo.textContent = clip
      ? `現在のクリップボード: ${clip.sizeX}×${clip.sizeY}×${clip.sizeZ} (${clip.cells.length}ブロック)`
      : "クリップボードは空です。まず範囲をコピーしてください。";
  }
  refreshClipboardInfo();

  const transformRow = el("div", "build-menu-button-row");
  const rotateCwBtn = button("時計回りに回転", "btn btn-secondary btn-small");
  const rotateCcwBtn = button("反時計回りに回転", "btn btn-secondary btn-small");
  const mirrorXBtn = button("X軸で反転", "btn btn-secondary btn-small");
  const mirrorZBtn = button("Z軸で反転", "btn btn-secondary btn-small");
  const pasteBtn = button("貼り付け", "btn btn-primary btn-small");
  for (const btn of [rotateCwBtn, rotateCcwBtn, mirrorXBtn, mirrorZBtn]) {
    btn.disabled = !isCreative;
    transformRow.appendChild(btn);
  }
  transformRow.appendChild(pasteBtn);
  modal.body.appendChild(transformRow);

  rotateCwBtn.addEventListener("click", () => {
    actions.onRotate("cw");
    refreshClipboardInfo();
  });
  rotateCcwBtn.addEventListener("click", () => {
    actions.onRotate("ccw");
    refreshClipboardInfo();
  });
  mirrorXBtn.addEventListener("click", () => {
    actions.onMirror("x");
    refreshClipboardInfo();
  });
  mirrorZBtn.addEventListener("click", () => {
    actions.onMirror("z");
    refreshClipboardInfo();
  });
  pasteBtn.addEventListener("click", () => {
    actions.onPaste();
  });

  modal.body.appendChild(el("h3", "settings-section-title", "設計図ライブラリ"));
  modal.body.appendChild(
    el("p", "modal-hint", "コピーした内容に名前を付けて保存すると、別のワールドでも読み込んで使えます。")
  );

  const saveRow = el("div", "build-menu-save-row");
  const nameInput = el("input", "title-input") as HTMLInputElement;
  nameInput.type = "text";
  nameInput.maxLength = 40;
  nameInput.placeholder = "設計図の名前 (例: 見張り小屋)";
  nameInput.setAttribute("aria-label", "設計図の名前");
  const saveBtn = button("現在のクリップボードを保存", "btn btn-primary btn-small");
  saveBtn.disabled = !isCreative;
  saveRow.appendChild(nameInput);
  saveRow.appendChild(saveBtn);
  modal.body.appendChild(saveRow);

  const importBtn = button("ファイルから設計図をインポート", "btn btn-secondary btn-small");
  const importInput = el("input") as HTMLInputElement;
  importInput.type = "file";
  importInput.accept = "application/json,.json";
  importInput.style.display = "none";
  importBtn.addEventListener("click", () => importInput.click());
  modal.body.appendChild(importBtn);
  modal.body.appendChild(importInput);

  const listRoot = el("div", "blueprint-list");
  modal.body.appendChild(listRoot);

  async function refreshList(): Promise<void> {
    listRoot.innerHTML = "";
    let records: BlueprintRecord[];
    try {
      records = await listBlueprints();
    } catch (err) {
      showError(`設計図一覧の読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (records.length === 0) {
      listRoot.appendChild(el("p", "world-list-empty", "まだ保存された設計図がありません。"));
      return;
    }
    for (const record of records) {
      listRoot.appendChild(buildBlueprintRow(record));
    }
  }

  function buildBlueprintRow(record: BlueprintRecord): HTMLDivElement {
    const row = el("div", "world-row");
    const info = el("div", "world-row-info");
    info.appendChild(el("div", "world-row-name", record.name));
    const c = record.clipboard;
    info.appendChild(el("div", "world-row-meta", `${c.sizeX}×${c.sizeY}×${c.sizeZ} (${c.cells.length}ブロック)`));
    row.appendChild(info);

    const rowActions = el("div", "world-row-actions");

    const loadBtn = button("クリップボードへ読込", "btn btn-primary btn-small");
    loadBtn.disabled = !isCreative;
    loadBtn.addEventListener("click", () => {
      actions.onLoadBlueprint(record);
      refreshClipboardInfo();
    });
    rowActions.appendChild(loadBtn);

    const renameBtn = button("名前変更", "btn btn-secondary btn-small");
    renameBtn.addEventListener("click", () => void handleRename(record));
    rowActions.appendChild(renameBtn);

    const exportBtn = button("書き出し", "btn btn-secondary btn-small");
    exportBtn.addEventListener("click", () => handleExport(record));
    rowActions.appendChild(exportBtn);

    const deleteBtn = button("削除", "btn btn-danger btn-small");
    deleteBtn.addEventListener("click", () => void handleDelete(record));
    rowActions.appendChild(deleteBtn);

    row.appendChild(rowActions);
    return row;
  }

  async function handleRename(record: BlueprintRecord): Promise<void> {
    const next = window.prompt("新しい設計図の名前を入力してください", record.name);
    if (next === null) return;
    try {
      const validated = validateBlueprintName(next);
      await renameBlueprint(record.id, validated);
      showToast("設計図の名前を変更しました。", "success");
      await refreshList();
    } catch (err) {
      const message =
        err instanceof BlueprintValidationError ? err.message : `名前の変更に失敗しました: ${err instanceof Error ? err.message : String(err)}`;
      showError(message);
    }
  }

  function handleExport(record: BlueprintRecord): void {
    try {
      const json = exportBlueprintToJson(record);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${record.name.replace(/[\\/:*?"<>|]/g, "_")}.blueprint.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("設計図ファイルを書き出しました。", "success");
    } catch (err) {
      showError(`書き出しに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleDelete(record: BlueprintRecord): Promise<void> {
    const ok = await confirmDialog(`設計図「${record.name}」を削除します。この操作は取り消せません。よろしいですか?`);
    if (!ok) return;
    try {
      await deleteBlueprint(record.id);
      showToast("設計図を削除しました。", "success");
      await refreshList();
    } catch (err) {
      showError(`削除に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleImportFile(file: File | null): Promise<void> {
    if (!file) return;
    try {
      const text = await file.text();
      const imported = await importBlueprintFromJson(text);
      showToast(`「${imported.name}」をインポートしました。`, "success");
      await refreshList();
    } catch (err) {
      showError(`インポートに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      importInput.value = "";
    }
  }

  importInput.addEventListener("change", () => {
    void handleImportFile(importInput.files?.[0] ?? null);
  });

  saveBtn.addEventListener("click", () => {
    void (async () => {
      try {
        const record = await actions.onSaveBlueprint(nameInput.value);
        if (record) {
          nameInput.value = "";
          await refreshList();
        }
      } catch (err) {
        showError(`保存に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  });

  void refreshList();
}
