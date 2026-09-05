import { describe, expect, it } from "vitest";
import { AIR_ID, BLOCKS, DEFAULT_QUICKBAR, PALETTE_ORDER, getBlockDef, getBlockDefByKey, isValidBlockId } from "../src/core/blocks";

describe("ブロックレジストリ", () => {
  it("空気ブロックはID 0で、パレットに含まれない", () => {
    const air = getBlockDef(AIR_ID);
    expect(air.key).toBe("air");
    expect(air.inPalette).toBe(false);
    expect(air.solidDefault).toBe(false);
  });

  it("空気を除いて30〜40種類のブロックを持つ (Phase 1要件)", () => {
    const nonAir = BLOCKS.filter((b) => b.id !== AIR_ID);
    expect(nonAir.length).toBeGreaterThanOrEqual(30);
    expect(nonAir.length).toBeLessThanOrEqual(40);
  });

  it("全ブロックのIDは重複しない", () => {
    const ids = BLOCKS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("全ブロックのキーは重複しない", () => {
    const keys = BLOCKS.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("キーからIDを引ける", () => {
    expect(getBlockDefByKey("stone").id).toBeGreaterThan(0);
  });

  it("未知のIDやキーを問い合わせるとエラーを投げる (サイレント失敗しない)", () => {
    expect(() => getBlockDef(9999)).toThrow();
    expect(() => getBlockDefByKey("__nope__")).toThrow();
  });

  it("isValidBlockId は既知のIDのみtrueを返す", () => {
    expect(isValidBlockId(0)).toBe(true);
    expect(isValidBlockId(1)).toBe(true);
    expect(isValidBlockId(9999)).toBe(false);
  });

  it("特殊形状ブロック (階段/柵/ドア) が定義されている", () => {
    expect(getBlockDefByKey("stairs").shape).toBe("stairs");
    expect(getBlockDefByKey("fence").shape).toBe("fence");
    expect(getBlockDefByKey("door").shape).toBe("door");
  });

  it("クイックバーの初期構成は9個で、全て有効なブロックID", () => {
    expect(DEFAULT_QUICKBAR.length).toBe(9);
    for (const id of DEFAULT_QUICKBAR) {
      expect(isValidBlockId(id)).toBe(true);
      expect(id).not.toBe(AIR_ID);
    }
  });

  it("パレット順序には空気が含まれない", () => {
    expect(PALETTE_ORDER).not.toContain(AIR_ID);
  });
});
