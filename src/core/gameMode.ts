/**
 * ゲームモード: クリエイティブ (無制限・無ダメージ) / サバイバル (体力・空腹・採取・クラフト)。
 * ワールド作成時に選択し、保存データに永続化する (schema v2以降)。
 */

export type GameMode = "creative" | "survival";

export const DEFAULT_GAME_MODE: GameMode = "creative";

export const GAME_MODE_LABELS_JA: Record<GameMode, string> = {
  creative: "クリエイティブ",
  survival: "サバイバル"
};

export const GAME_MODE_DESCRIPTIONS_JA: Record<GameMode, string> = {
  creative: "ブロックが無限に使え、体力や空腹の減少もありません。自由に建築を楽しめます。",
  survival: "資源を集めてクラフトし、体力・空腹・昼夜の危険に対応しながら遊ぶモードです。"
};

export function isGameMode(v: unknown): v is GameMode {
  return v === "creative" || v === "survival";
}
