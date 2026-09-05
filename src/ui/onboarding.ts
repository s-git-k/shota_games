/**
 * ウェルカム/オンボーディング画面と、いつでも開ける操作ヘルプ。
 */
import { ACTION_LABELS_JA, DEFAULT_KEY_BINDINGS } from "../core/settings";
import { openModal } from "./modal";
import { el, button } from "./dom";

function labelForCode(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  const specialLabels: Record<string, string> = {
    Space: "スペース",
    ShiftLeft: "Shift",
    ControlLeft: "Ctrl",
    Escape: "Esc"
  };
  return specialLabels[code] ?? code;
}

function appendControlsHelp(container: HTMLElement): void {
  container.appendChild(el("h3", "settings-section-title", "基本操作"));
  const list = el("ul", "help-list");
  const rows: Array<[string, string]> = [
    ["W / A / S / D", "移動"],
    ["マウス移動", "視点操作"],
    ["左クリック", "ブロックを壊す / (サバイバル) 狙った生物を攻撃"],
    ["右クリック", "ブロックを置く"],
    ["マウスホイール / 数字キー", "クイックバーの選択切り替え"],
    [labelForCode(DEFAULT_KEY_BINDINGS.toggleFly), ACTION_LABELS_JA.toggleFly],
    [labelForCode(DEFAULT_KEY_BINDINGS.toggleCamera), ACTION_LABELS_JA.toggleCamera],
    [labelForCode(DEFAULT_KEY_BINDINGS.jumpOrUp), ACTION_LABELS_JA.jumpOrUp],
    [labelForCode(DEFAULT_KEY_BINDINGS.interact), ACTION_LABELS_JA.interact],
    [labelForCode(DEFAULT_KEY_BINDINGS.undo), ACTION_LABELS_JA.undo],
    [labelForCode(DEFAULT_KEY_BINDINGS.redo), ACTION_LABELS_JA.redo],
    [labelForCode(DEFAULT_KEY_BINDINGS.selectionMark), ACTION_LABELS_JA.selectionMark],
    [labelForCode(DEFAULT_KEY_BINDINGS.selectionCopy), ACTION_LABELS_JA.selectionCopy],
    [labelForCode(DEFAULT_KEY_BINDINGS.selectionPaste), ACTION_LABELS_JA.selectionPaste],
    [labelForCode(DEFAULT_KEY_BINDINGS.openInventory), ACTION_LABELS_JA.openInventory],
    [labelForCode(DEFAULT_KEY_BINDINGS.openSettings), ACTION_LABELS_JA.openSettings]
  ];
  for (const [key, desc] of rows) {
    const li = el("li", "help-list-item");
    li.appendChild(el("span", "help-key", key));
    li.appendChild(el("span", "help-desc", desc));
    list.appendChild(li);
  }
  container.appendChild(list);
  container.appendChild(
    el(
      "p",
      "modal-hint",
      "キー割り当ては設定画面からいつでも変更できます。タッチ端末では画面下部に仮想ジョイスティックとボタンが表示されます。"
    )
  );
}

function appendSurvivalHelp(container: HTMLElement): void {
  container.appendChild(el("h3", "settings-section-title", "サバイバルモードの遊び方"));
  const list = el("ul", "help-list");
  const rows: Array<[string, string]> = [
    ["体力とお腹", "画面左上のハートと肉アイコンで確認。お腹が減ると体力が徐々に減り、落下や敵の攻撃でも体力が減る"],
    ["資源収集", "ブロックを壊すと資源としてインベントリに入る (木材・石・鉱石など)"],
    ["クラフト", "[I] でインベントリ/クラフト画面を開き、レシピを選んで作成 (材料が足りないと赤く表示)"],
    ["昼と夜", "画面右上に時刻を表示。夜や地下は暗くなり、モンスターが出現しやすくなる"],
    ["モンスター", "近づくと襲ってくる。左クリックで攻撃し、倒すと素材をドロップする"],
    ["動物", "襲ってこない。近づいて [E] で調べたり、資源ブロックとして採取できる"],
    ["ベッド", "ベッドを設置して [E] で使うと、そこが復活地点になる"],
    ["死亡と復活", "体力が0になると持ち物をその場に落として復活する。復活後は現地に戻れば拾える"],
    ["回路", "スイッチ・導線・ランプ・ドアを組み合わせて電気回路を作れる。スイッチを [E] で切り替える"]
  ];
  for (const [key, desc] of rows) {
    const li = el("li", "help-list-item");
    li.appendChild(el("span", "help-key", key));
    li.appendChild(el("span", "help-desc", desc));
    list.appendChild(li);
  }
  container.appendChild(list);
  container.appendChild(
    el("p", "modal-hint", "クリエイティブモードでは資源・体力・お腹の概念がなく、自由に建築だけを楽しめます。")
  );
}


function appendWorldHelp(container: HTMLElement): void {
  container.appendChild(el("h3", "settings-section-title", "地形と天候について"));
  const list = el("ul", "help-list");
  const rows: Array<[string, string]> = [
    ["バイオーム", "草原・森林・砂漠・雪原・山地・海の6種類が種(シード)から決定論的に生成され、広い範囲でゆるやかに移り変わる"],
    ["洞窟", "地下には歩き回れる空洞(洞窟)が自然に広がっており、掘り進んで探検できる"],
    ["鉱脈", "地下には金属パネル・黄金ブロック・光晶石が鉱石として埋まっている。深いところほど貴重なものが見つかりやすい"],
    ["地下水・海", "地下には地下水だまりが、地表には海(水没した低地)が広がる。水は透明で泳いで通り抜けられ、壁のように塞がれない"],
    ["地下遺跡", "地下にはまれに古い遺跡が眠っており、黄金や光晶石などの目印を見つけられることがある"],
    ["天候", "晴れ・雨・雪が時間とともに移り変わる。雪原・山地では雪、砂漠では雨が降らず晴れたまま、それ以外では雨になる"]
  ];
  for (const [key, desc] of rows) {
    const li = el("li", "help-list-item");
    li.appendChild(el("span", "help-key", key));
    li.appendChild(el("span", "help-desc", desc));
    list.appendChild(li);
  }
  container.appendChild(list);
  container.appendChild(
    el("p", "modal-hint", "画面右上にバイオーム名と現在の天候が表示されます。水中では移動と落下がゆっくりになり、簡易的な水泳ができます。")
  );
}

export function showWelcomeOverlay(onClose: () => void): void {
  const modal = openModal("つみき王国へようこそ", { closable: false });
  modal.body.appendChild(
    el(
      "p",
      "welcome-intro",
      "つみき王国は、明るくやさしいローポリのファンタジー世界で自由に建物を作る、クリエイティブ建築ゲームです。"
    )
  );
  modal.body.appendChild(
    el("p", "welcome-intro", "地形は種(シード)から自動生成され、歩いたり飛んだりしながらどこまでも広がります。")
  );
  modal.body.appendChild(
    el(
      "p",
      "welcome-intro",
      "ワールド作成時に「クリエイティブ」か「サバイバル」を選べます。サバイバルでは資源集め・クラフト・昼夜サイクル・生物との駆け引きが加わります。"
    )
  );
  appendControlsHelp(modal.body);
  appendSurvivalHelp(modal.body);
  appendWorldHelp(modal.body);
  const startBtn = button("はじめる", "btn btn-primary");
  startBtn.addEventListener("click", () => {
    modal.close();
    onClose();
  });
  modal.body.appendChild(startBtn);
}

export function showHelpOverlay(): void {
  const modal = openModal("操作ヘルプ");
  appendControlsHelp(modal.body);
  appendSurvivalHelp(modal.body);
  appendWorldHelp(modal.body);
}
