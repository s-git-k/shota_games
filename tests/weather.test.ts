import { describe, expect, it } from "vitest";
import { hashStringToInt } from "../src/core/rng";
import {
  WEATHER_LABELS_JA,
  getGlobalWeatherPhase,
  getWeatherIntensity,
  getWeatherLabelJa,
  resolveWeatherKind
} from "../src/core/weather";

describe("getGlobalWeatherPhase", () => {
  it("決定論的: 同じシード・時刻では常に同じ結果", () => {
    const seed = hashStringToInt("weather-a");
    expect(getGlobalWeatherPhase(seed, 1234)).toBe(getGlobalWeatherPhase(seed, 1234));
  });

  it("時間の経過とともに 晴れ<->悪天候 が両方とも出現する (ずっと同じ天候に固定されない)", () => {
    const seed = hashStringToInt("weather-cycle");
    const phases = new Set<string>();
    for (let t = 0; t < 6000; t += 30) {
      phases.add(getGlobalWeatherPhase(seed, t));
    }
    expect(phases.has("clear")).toBe(true);
    expect(phases.has("precipitating")).toBe(true);
  });

  it("異なるシードでは (少なくともどこかで) 異なる天候サイクルになる", () => {
    const seedA = hashStringToInt("weather-world-alpha");
    const seedB = hashStringToInt("weather-world-beta");
    let differs = false;
    for (let t = 0; t < 6000; t += 30) {
      if (getGlobalWeatherPhase(seedA, t) !== getGlobalWeatherPhase(seedB, t)) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });

  it("負の経過時間を渡してもクラッシュせず、0秒相当として扱われる", () => {
    const seed = hashStringToInt("weather-negative");
    expect(() => getGlobalWeatherPhase(seed, -100)).not.toThrow();
    expect(getGlobalWeatherPhase(seed, -100)).toBe(getGlobalWeatherPhase(seed, 0));
  });
});

describe("getWeatherIntensity", () => {
  it("常に0..1の範囲", () => {
    const seed = hashStringToInt("weather-intensity-range");
    for (let t = 0; t < 3000; t += 17) {
      const intensity = getWeatherIntensity(seed, t);
      expect(intensity).toBeGreaterThanOrEqual(0);
      expect(intensity).toBeLessThanOrEqual(1);
    }
  });

  it("晴れフェーズでは常に強さ0", () => {
    const seed = hashStringToInt("weather-intensity-clear");
    for (let t = 0; t < 3000; t += 5) {
      if (getGlobalWeatherPhase(seed, t) === "clear") {
        expect(getWeatherIntensity(seed, t)).toBe(0);
      }
    }
  });

  it("悪天候フェーズの区間内では強さが0より大きい瞬間がある", () => {
    const seed = hashStringToInt("weather-intensity-precip");
    let foundPositive = false;
    for (let t = 0; t < 3000; t += 5) {
      if (getGlobalWeatherPhase(seed, t) === "precipitating" && getWeatherIntensity(seed, t) > 0) {
        foundPositive = true;
        break;
      }
    }
    expect(foundPositive).toBe(true);
  });
});

describe("resolveWeatherKind", () => {
  it("大局天候が晴れなら、どのバイオームでも常にclear", () => {
    const seed = hashStringToInt("weather-resolve-clear");
    for (let t = 0; t < 6000; t += 30) {
      if (getGlobalWeatherPhase(seed, t) !== "clear") continue;
      expect(resolveWeatherKind(seed, t, "grassland")).toBe("clear");
      expect(resolveWeatherKind(seed, t, "snowfield")).toBe("clear");
      expect(resolveWeatherKind(seed, t, "desert")).toBe("clear");
    }
  });

  it("悪天候時、雪原・山地は雪になる", () => {
    const seed = hashStringToInt("weather-resolve-snow");
    let checked = 0;
    for (let t = 0; t < 6000; t += 30) {
      if (getGlobalWeatherPhase(seed, t) !== "precipitating") continue;
      checked++;
      expect(resolveWeatherKind(seed, t, "snowfield")).toBe("snow");
      expect(resolveWeatherKind(seed, t, "mountain")).toBe("snow");
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("悪天候時、砂漠は雨にならず晴れ扱いのまま", () => {
    const seed = hashStringToInt("weather-resolve-desert");
    let checked = 0;
    for (let t = 0; t < 6000; t += 30) {
      if (getGlobalWeatherPhase(seed, t) !== "precipitating") continue;
      checked++;
      expect(resolveWeatherKind(seed, t, "desert")).toBe("clear");
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("悪天候時、草原/森林/海は雨になる", () => {
    const seed = hashStringToInt("weather-resolve-rain");
    let checked = 0;
    for (let t = 0; t < 6000; t += 30) {
      if (getGlobalWeatherPhase(seed, t) !== "precipitating") continue;
      checked++;
      expect(resolveWeatherKind(seed, t, "grassland")).toBe("rain");
      expect(resolveWeatherKind(seed, t, "forest")).toBe("rain");
      expect(resolveWeatherKind(seed, t, "ocean")).toBe("rain");
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("決定論的: 同じ入力では常に同じ結果", () => {
    const seed = hashStringToInt("weather-resolve-determinism");
    expect(resolveWeatherKind(seed, 555, "forest")).toBe(resolveWeatherKind(seed, 555, "forest"));
  });
});

describe("WEATHER_LABELS_JA / getWeatherLabelJa", () => {
  it("clear/rain/snow すべてに日本語ラベルがある", () => {
    expect(WEATHER_LABELS_JA.clear).toBeTruthy();
    expect(WEATHER_LABELS_JA.rain).toBeTruthy();
    expect(WEATHER_LABELS_JA.snow).toBeTruthy();
    expect(getWeatherLabelJa("rain")).toBe(WEATHER_LABELS_JA.rain);
  });
});
