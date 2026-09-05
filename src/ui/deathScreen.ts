/**
 * サバイバルモードの死亡/復活画面。
 * 閉じられない (Escで消せない) モーダルとして表示し、復活ボタンでのみ進行できる。
 */
import { openModal } from "./modal";
import { el, button } from "./dom";

export function showDeathScreen(causeJa: string, onRespawn: () => void): void {
  const modal = openModal("たおれてしまった…", { closable: false });
  modal.body.appendChild(el("p", "death-cause", `原因: ${causeJa}`));
  modal.body.appendChild(
    el("p", "modal-hint", "持ち物はたおれた場所に落ちています。復活地点 (ベッド、なければ初期地点) に戻って探しに行きましょう。")
  );
  const respawnBtn = button("復活する", "btn btn-primary");
  respawnBtn.addEventListener("click", () => {
    modal.close();
    onRespawn();
  });
  modal.body.appendChild(respawnBtn);
}
