/**
 * ゲーム設定 (操作・グラフィック・音量など) の型とデフォルト値。
 * 実際の永続化は storage.ts が担当する。
 */

export type ActionId =
  | "moveForward"
  | "moveBackward"
  | "moveLeft"
  | "moveRight"
  | "jumpOrUp"
  | "flyDown"
  | "toggleFly"
  | "toggleCamera"
  | "sprint"
  | "interact"
  | "undo"
  | "redo"
  | "selectionCopy"
  | "selectionPaste"
  | "selectionMark"
  | "openInventory"
  | "openSettings"
  | "openBuildMenu"
  | "openProgress";

export interface KeyBindings {
  [action: string]: string;
}

export const DEFAULT_KEY_BINDINGS: Record<ActionId, string> = {
  moveForward: "KeyW",
  moveBackward: "KeyS",
  moveLeft: "KeyA",
  moveRight: "KeyD",
  jumpOrUp: "Space",
  flyDown: "ShiftLeft",
  toggleFly: "KeyF",
  toggleCamera: "KeyV",
  sprint: "ControlLeft",
  interact: "KeyE",
  undo: "KeyZ",
  redo: "KeyY",
  selectionCopy: "KeyC",
  selectionPaste: "KeyX",
  selectionMark: "KeyB",
  openInventory: "KeyI",
  openSettings: "Escape",
  openBuildMenu: "KeyG",
  openProgress: "KeyP"
};

export const ACTION_LABELS_JA: Record<ActionId, string> = {
  moveForward: "前進",
  moveBackward: "後退",
  moveLeft: "左移動",
  moveRight: "右移動",
  jumpOrUp: "ジャンプ / 上昇",
  flyDown: "下降 (飛行中)",
  toggleFly: "飛行切り替え",
  toggleCamera: "視点切り替え",
  sprint: "ダッシュ",
  interact: "使う (ドア/スイッチ/ベッド/生物)",
  undo: "取り消す (Undo)",
  redo: "やり直す (Redo)",
  selectionCopy: "選択範囲をコピー",
  selectionPaste: "貼り付け",
  selectionMark: "選択の開始/終了",
  openInventory: "インベントリ / クラフトを開く",
  openSettings: "設定/一時停止",
  openBuildMenu: "建築メニュー (選択/設計図/回転/反転)を開く",
  openProgress: "探索の記録 (実績/進捗)を開く"
};

export type QualityLevel = "low" | "medium" | "high";

export interface GameSettings {
  fovDeg: number;
  mouseSensitivity: number;
  renderDistanceChunks: number;
  quality: QualityLevel;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  cameraShake: boolean;
  reducedMotion: boolean;
  touchControlsEnabled: boolean;
  /** Phase 5: FPS/チャンク数/生物数などの軽量な実行時診断を表示するデバッグHUD。既定は無効。 */
  debugHudEnabled: boolean;
  keyBindings: Record<ActionId, string>;
}

export const DEFAULT_SETTINGS: GameSettings = {
  fovDeg: 75,
  mouseSensitivity: 0.5,
  renderDistanceChunks: 5,
  quality: "medium",
  masterVolume: 0.8,
  musicVolume: 0.4,
  sfxVolume: 0.8,
  cameraShake: false,
  reducedMotion: false,
  touchControlsEnabled: true,
  debugHudEnabled: false,
  keyBindings: { ...DEFAULT_KEY_BINDINGS }
};

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export interface PartialGameSettings extends Partial<Omit<GameSettings, "keyBindings">> {
  keyBindings?: Partial<Record<ActionId, string>>;
}

export function clampSettings(s: PartialGameSettings): GameSettings {
  const merged: GameSettings = { ...DEFAULT_SETTINGS, ...s, keyBindings: { ...DEFAULT_SETTINGS.keyBindings, ...s.keyBindings } };
  merged.fovDeg = Math.max(50, Math.min(110, merged.fovDeg));
  merged.mouseSensitivity = Math.max(0.05, Math.min(2, merged.mouseSensitivity));
  merged.renderDistanceChunks = Math.max(2, Math.min(12, Math.round(merged.renderDistanceChunks)));
  merged.masterVolume = clamp01(merged.masterVolume);
  merged.musicVolume = clamp01(merged.musicVolume);
  merged.sfxVolume = clamp01(merged.sfxVolume);
  return merged;
}
