/**
 * トースト通知 (成功/エラーメッセージ)。
 * サイレントに失敗させないため、エラーは必ずここを通じてユーザーに見える形で表示する。
 */
import { el } from "./dom";

let container: HTMLDivElement | null = null;

function ensureContainer(): HTMLDivElement {
  if (container) return container;
  container = el("div", "toast-container");
  container.setAttribute("role", "status");
  container.setAttribute("aria-live", "polite");
  document.body.appendChild(container);
  return container;
}

export type ToastKind = "info" | "success" | "error";

export function showToast(message: string, kind: ToastKind = "info", durationMs = 4000): void {
  const root = ensureContainer();
  const toast = el("div", `toast toast-${kind}`, message);
  root.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-visible"));
  window.setTimeout(() => {
    toast.classList.remove("toast-visible");
    window.setTimeout(() => toast.remove(), 300);
  }, durationMs);
}

export function showError(message: string): void {
  showToast(message, "error", 6000);
}
