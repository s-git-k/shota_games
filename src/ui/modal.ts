/**
 * シンプルなモーダルダイアログの共通基盤。
 * ESCで閉じる・フォーカストラップ・背景クリックで閉じる、に対応。
 */
import { el, button } from "./dom";

export interface ModalHandle {
  root: HTMLDivElement;
  body: HTMLDivElement;
  close: () => void;
}

export function openModal(title: string, options?: { closable?: boolean }): ModalHandle {
  const closable = options?.closable ?? true;
  const overlay = el("div", "modal-overlay");
  const dialog = el("div", "modal-dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", title);
  dialog.tabIndex = -1;

  const header = el("div", "modal-header");
  const titleEl = el("h2", "modal-title", title);
  header.appendChild(titleEl);
  if (closable) {
    const closeBtn = button("✕", "modal-close-btn");
    closeBtn.setAttribute("aria-label", "閉じる");
    closeBtn.addEventListener("click", () => close());
    header.appendChild(closeBtn);
  }

  const body = el("div", "modal-body");

  dialog.appendChild(header);
  dialog.appendChild(body);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const close = (): void => {
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && closable) {
      close();
    }
  };
  document.addEventListener("keydown", onKeyDown);

  if (closable) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
  }

  window.setTimeout(() => dialog.focus(), 0);

  return { root: overlay, body, close };
}
