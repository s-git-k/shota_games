import { describe, expect, it } from "vitest";
import { DEFAULT_GAME_MODE, GAME_MODE_LABELS_JA, isGameMode } from "../src/core/gameMode";

describe("gameMode", () => {
  it("デフォルトはクリエイティブである", () => {
    expect(DEFAULT_GAME_MODE).toBe("creative");
  });

  it("isGameMode は有効な値だけを true にする", () => {
    expect(isGameMode("creative")).toBe(true);
    expect(isGameMode("survival")).toBe(true);
    expect(isGameMode("hard")).toBe(false);
    expect(isGameMode(undefined)).toBe(false);
    expect(isGameMode(null)).toBe(false);
    expect(isGameMode(123)).toBe(false);
  });

  it("両モードに日本語ラベルがある", () => {
    expect(GAME_MODE_LABELS_JA.creative).toBe("クリエイティブ");
    expect(GAME_MODE_LABELS_JA.survival).toBe("サバイバル");
  });
});
