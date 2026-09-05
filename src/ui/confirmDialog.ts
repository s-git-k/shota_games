/**
 * 破壊的操作 (ワールド削除など) のための確認ダイアログ。
 */
import { openModal } from "./modal";
import { el, button } from "./dom";

export function confirmDialog(message: string, confirmLabel = "削除する", cancelLabel = "キャンセル"): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = openModal("確認", { closable: true });
    modal.body.appendChild(el("p", "confirm-message", message));

    const actions = el("div", "modal-actions");
    const cancelBtn = button(cancelLabel, "btn btn-secondary");
    const confirmBtn = button(confirmLabel, "btn btn-danger");
    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    modal.body.appendChild(actions);

    let resolved = false;
    const finish = (result: boolean): void => {
      if (resolved) return;
      resolved = true;
      resolve(result);
      modal.close();
    };

    cancelBtn.addEventListener("click", () => finish(false));
    confirmBtn.addEventListener("click", () => finish(true));
    confirmBtn.focus();

    modal.root.addEventListener("click", (e) => {
      if (e.target === modal.root) {
        finish(false);
      }
    });
    modal.root.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Escape") finish(false);
    });
  });
}
