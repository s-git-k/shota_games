import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, clampSettings } from "../src/core/settings";

describe("clampSettings", () => {
  it("範囲外の値をデフォルトの範囲内に丸める", () => {
    const s = clampSettings({ fovDeg: 999, mouseSensitivity: -5, renderDistanceChunks: 999 });
    expect(s.fovDeg).toBeLessThanOrEqual(110);
    expect(s.mouseSensitivity).toBeGreaterThanOrEqual(0.05);
    expect(s.renderDistanceChunks).toBeLessThanOrEqual(12);
  });

  it("音量は0-1にクランプされる", () => {
    const s = clampSettings({ masterVolume: 2, musicVolume: -1, sfxVolume: 0.5 });
    expect(s.masterVolume).toBe(1);
    expect(s.musicVolume).toBe(0);
    expect(s.sfxVolume).toBe(0.5);
  });

  it("部分的な入力はデフォルト値とマージされる", () => {
    const s = clampSettings({ fovDeg: 90 });
    expect(s.fovDeg).toBe(90);
    expect(s.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(s.keyBindings.moveForward).toBe(DEFAULT_SETTINGS.keyBindings.moveForward);
  });

  it("キーバインドは個別に上書きでき、他は既定値を保つ", () => {
    const s = clampSettings({ keyBindings: { moveForward: "ArrowUp" } });
    expect(s.keyBindings.moveForward).toBe("ArrowUp");
    expect(s.keyBindings.moveBackward).toBe(DEFAULT_SETTINGS.keyBindings.moveBackward);
  });
});
