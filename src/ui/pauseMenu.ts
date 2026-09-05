/**
 * ゲーム中の一時停止メニュー (設定/ヘルプ/アバター/タイトルに戻る への入口)。
 */
import { openModal } from "./modal";
import { button } from "./dom";

export interface PauseMenuActions {
  onResume: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onOpenAvatar: () => void;
  onBackToTitle: () => void;
}

export function openPauseMenu(actions: PauseMenuActions): void {
  const modal = openModal("一時停止");

  const resumeBtn = button("ゲームに戻る", "btn btn-primary");
  resumeBtn.addEventListener("click", () => {
    modal.close();
    actions.onResume();
  });
  modal.body.appendChild(resumeBtn);

  const settingsBtn = button("設定", "btn btn-secondary");
  settingsBtn.addEventListener("click", () => {
    actions.onOpenSettings();
  });
  modal.body.appendChild(settingsBtn);

  const avatarBtn = button("アバター作成", "btn btn-secondary");
  avatarBtn.addEventListener("click", () => {
    actions.onOpenAvatar();
  });
  modal.body.appendChild(avatarBtn);

  const helpBtn = button("操作ヘルプ", "btn btn-secondary");
  helpBtn.addEventListener("click", () => {
    actions.onOpenHelp();
  });
  modal.body.appendChild(helpBtn);

  const backBtn = button("タイトルに戻る (自動保存されます)", "btn btn-danger");
  backBtn.addEventListener("click", () => {
    modal.close();
    actions.onBackToTitle();
  });
  modal.body.appendChild(backBtn);
}
