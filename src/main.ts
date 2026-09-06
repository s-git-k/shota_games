/**
 * エントリーポイント: 設定/アバターの読み込み、タイトル画面表示、ゲーム開始を行う。
 */
import { loadAvatar, loadSettings, hasSeenOnboarding, setOnboardingSeen } from "./core/storage";
import type { WorldSaveData } from "./core/save";
import { showTitleScreen } from "./ui/titleScreen";
import { showWelcomeOverlay } from "./ui/onboarding";
import { showError } from "./ui/notifications";
import { Game } from "./game/voxelGame";

async function main(): Promise<void> {
  const canvasEl = document.getElementById("game-canvas");
  const uiRootEl = document.getElementById("ui-root");
  if (!(canvasEl instanceof HTMLCanvasElement) || !uiRootEl) {
    throw new Error("必要なDOM要素 (#game-canvas / #ui-root) が見つかりませんでした。");
  }
  const canvas: HTMLCanvasElement = canvasEl;
  const uiRoot: HTMLElement = uiRootEl;

  let settings = await loadSettings();
  let avatar = await loadAvatar();
  let seenOnboarding = await hasSeenOnboarding();

  let titleHandle = showTitleScreen(uiRoot, enterWorld);
  canvas.style.display = "none";

  async function startGame(worldSave: WorldSaveData): Promise<void> {
    try {
      settings = await loadSettings();
      avatar = await loadAvatar();
      const game = new Game(canvas, uiRoot, worldSave, settings, avatar, () => {
        canvas.style.display = "none";
        titleHandle = showTitleScreen(uiRoot, enterWorld);
      });
      void game;
      titleHandle.destroy();
      canvas.style.display = "block";
    } catch (err) {
      canvas.style.display = "none";
      showError(`ゲームの開始に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function enterWorld(worldSave: WorldSaveData): void {
    if (!seenOnboarding) {
      showWelcomeOverlay(() => {
        void setOnboardingSeen();
        seenOnboarding = true;
        void startGame(worldSave);
      });
    } else {
      void startGame(worldSave);
    }
  }
}

main().catch((err) => {
  console.error(err);
  showError(`初期化に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
});
