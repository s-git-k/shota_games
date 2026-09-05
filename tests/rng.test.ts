import { describe, expect, it } from "vitest";
import { createRng, fractalNoise2D, hashStringToInt, mulberry32 } from "../src/core/rng";

describe("hashStringToInt", () => {
  it("同じシード文字列からは同じ整数を返す", () => {
    expect(hashStringToInt("hello")).toBe(hashStringToInt("hello"));
  });

  it("異なるシード文字列からは (基本的に) 異なる整数を返す", () => {
    expect(hashStringToInt("hello")).not.toBe(hashStringToInt("world"));
  });

  it("空文字でも安定した値を返す", () => {
    expect(Number.isFinite(hashStringToInt(""))).toBe(true);
  });
});

describe("mulberry32 / createRng", () => {
  it("同じシードからは同じ乱数列を生成する (決定論的)", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("異なるシードからは異なる乱数列を生成する", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it("生成される値は常に [0,1) の範囲にある", () => {
    const rng = createRng("test-seed");
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("createRng は文字列シードから決定論的な乱数を作る", () => {
    const seqA = Array.from({ length: 5 }, () => createRng("world-1")());
    const seqB = Array.from({ length: 5 }, () => createRng("world-1")());
    expect(seqA).toEqual(seqB);
  });
});

describe("fractalNoise2D", () => {
  it("同じ入力に対して常に同じ値を返す", () => {
    const v1 = fractalNoise2D(42, 10, 20);
    const v2 = fractalNoise2D(42, 10, 20);
    expect(v1).toBe(v2);
  });

  it("戻り値はおおむね [0,1] の範囲に収まる", () => {
    for (let i = 0; i < 200; i++) {
      const v = fractalNoise2D(1, i * 3.1, -i * 2.7);
      expect(v).toBeGreaterThanOrEqual(-0.01);
      expect(v).toBeLessThanOrEqual(1.01);
    }
  });

  it("座標が近いと値も近くなる (滑らかさの簡易チェック)", () => {
    const v1 = fractalNoise2D(7, 100, 100);
    const v2 = fractalNoise2D(7, 100.01, 100);
    expect(Math.abs(v1 - v2)).toBeLessThan(0.05);
  });
});
