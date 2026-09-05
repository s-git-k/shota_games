import { describe, expect, it } from "vitest";
import { averageColorInRegion, derivePaletteFromPixels } from "../src/core/avatar";

function makeSolidImage(width: number, height: number, r: number, g: number, b: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = r;
    pixels[i * 4 + 1] = g;
    pixels[i * 4 + 2] = b;
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

describe("averageColorInRegion", () => {
  it("単色画像では、その色をそのまま返す", () => {
    const pixels = makeSolidImage(10, 10, 200, 100, 50);
    const color = averageColorInRegion(pixels, 10, 10, 0, 0, 1, 1);
    expect(color).toBe((200 << 16) | (100 << 8) | 50);
  });

  it("透明ピクセルは平均計算から除外される", () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    // 上半分は不透明の赤、下半分は透明
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const idx = (y * 4 + x) * 4;
        if (y < 2) {
          pixels[idx] = 255;
          pixels[idx + 3] = 255;
        } else {
          pixels[idx + 3] = 0;
        }
      }
    }
    const color = averageColorInRegion(pixels, 4, 4, 0, 0, 1, 1);
    expect(color).toBe(0xff0000);
  });

  it("完全に透明な領域はフォールバック色を返す (エラーにならない)", () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4); // 全て alpha=0
    const color = averageColorInRegion(pixels, 4, 4, 0, 0, 1, 1);
    expect(typeof color).toBe("number");
  });
});

describe("derivePaletteFromPixels", () => {
  it("肌色・髪色の2つの値を返す", () => {
    const pixels = makeSolidImage(64, 64, 220, 180, 150);
    const palette = derivePaletteFromPixels(pixels, 64, 64);
    expect(typeof palette.skinColor).toBe("number");
    expect(typeof palette.hairColor).toBe("number");
  });

  it("同じ入力からは常に同じ結果を返す (決定論的)", () => {
    const pixels = makeSolidImage(32, 32, 10, 20, 30);
    const p1 = derivePaletteFromPixels(pixels, 32, 32);
    const p2 = derivePaletteFromPixels(pixels, 32, 32);
    expect(p1).toEqual(p2);
  });
});
