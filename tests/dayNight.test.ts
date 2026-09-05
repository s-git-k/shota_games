import { describe, expect, it } from "vitest";
import {
  DAY_LENGTH_SECONDS,
  UNDERGROUND_Y_THRESHOLD,
  canSpawnHostileAt,
  formatTimeLabel,
  getAmbientIntensity,
  getSkyColors,
  getSunIntensity,
  getTimeOfDay,
  isNight
} from "../src/core/dayNight";

describe("dayNight", () => {
  it("経過0秒は1日目の開始 (fraction=0)", () => {
    const t = getTimeOfDay(0);
    expect(t.fraction).toBe(0);
    expect(t.dayNumber).toBe(0);
  });

  it("1日分経過すると2日目になり、fractionは0に戻る", () => {
    const t = getTimeOfDay(DAY_LENGTH_SECONDS);
    expect(t.dayNumber).toBe(1);
    expect(t.fraction).toBe(0);
  });

  it("半日経過するとfractionは0.5", () => {
    const t = getTimeOfDay(DAY_LENGTH_SECONDS * 0.5);
    expect(t.fraction).toBeCloseTo(0.5, 5);
  });

  it("負の経過秒数は0として扱う", () => {
    const t = getTimeOfDay(-100);
    expect(t.fraction).toBe(0);
  });

  it("isNight は0.5以上1.0未満で真", () => {
    expect(isNight(0.0)).toBe(false);
    expect(isNight(0.49)).toBe(false);
    expect(isNight(0.5)).toBe(true);
    expect(isNight(0.99)).toBe(true);
    expect(isNight(1.0)).toBe(false);
  });

  it("formatTimeLabel はHH:MM形式で、0.0を朝6:00として扱う", () => {
    expect(formatTimeLabel(0)).toBe("06:00");
  });

  it("getSunIntensity は正午付近で最大、真夜中付近で最小", () => {
    const noon = getSunIntensity(0.25);
    const midnight = getSunIntensity(0.75);
    expect(noon).toBeGreaterThan(midnight);
    expect(noon).toBeGreaterThan(0.9);
    expect(midnight).toBeLessThan(0.05);
  });

  it("getSunIntensity は常に0以上1以下", () => {
    for (let f = 0; f <= 1; f += 0.1) {
      const v = getSunIntensity(f);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("getAmbientIntensity は太陽が高いほど明るい", () => {
    expect(getAmbientIntensity(0.25)).toBeGreaterThan(getAmbientIntensity(0.75));
  });

  it("getSkyColors は色コードを返す (0..0xFFFFFF)", () => {
    const colors = getSkyColors(0.25);
    expect(colors.sky).toBeGreaterThanOrEqual(0);
    expect(colors.sky).toBeLessThanOrEqual(0xffffff);
    expect(colors.fog).toBeGreaterThanOrEqual(0);
  });

  it("canSpawnHostileAt は夜間なら地上でも出現可能", () => {
    expect(canSpawnHostileAt(0.6, 60)).toBe(true);
  });

  it("canSpawnHostileAt は昼間でも地下 (閾値未満) なら出現可能", () => {
    expect(canSpawnHostileAt(0.1, UNDERGROUND_Y_THRESHOLD - 1)).toBe(true);
  });

  it("canSpawnHostileAt は昼間の地上では出現不可", () => {
    expect(canSpawnHostileAt(0.1, UNDERGROUND_Y_THRESHOLD + 5)).toBe(false);
  });
});
