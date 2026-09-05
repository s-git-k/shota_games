import { describe, expect, it } from "vitest";
import {
  addItem,
  createEmptyInventory,
  getCount,
  hasAtLeast,
  isEmpty,
  nonEmptyEntries,
  removeItem,
  removeItems,
  sanitizeInventory
} from "../src/core/inventory";

describe("inventory", () => {
  it("空のインベントリを作成できる", () => {
    const inv = createEmptyInventory();
    expect(isEmpty(inv)).toBe(true);
    expect(getCount(inv, "stick")).toBe(0);
  });

  it("addItem はアイテムを加算し、元のオブジェクトを変更しない", () => {
    const inv = createEmptyInventory();
    const next = addItem(inv, "stick", 3);
    expect(getCount(inv, "stick")).toBe(0);
    expect(getCount(next, "stick")).toBe(3);
    const next2 = addItem(next, "stick", 2);
    expect(getCount(next2, "stick")).toBe(5);
  });

  it("addItem に0以下の個数を渡すと変化しない", () => {
    const inv = addItem(createEmptyInventory(), "stick", 1);
    expect(addItem(inv, "stick", 0)).toBe(inv);
    expect(addItem(inv, "stick", -5)).toBe(inv);
  });

  it("removeItem は不足時に null を返す (サイレント失敗しない)", () => {
    const inv = addItem(createEmptyInventory(), "stick", 2);
    expect(removeItem(inv, "stick", 5)).toBeNull();
    expect(getCount(inv, "stick")).toBe(2);
  });

  it("removeItem は個数が0になるとキーを削除する", () => {
    const inv = addItem(createEmptyInventory(), "stick", 2);
    const next = removeItem(inv, "stick", 2);
    expect(next).not.toBeNull();
    expect(getCount(next!, "stick")).toBe(0);
    expect(isEmpty(next!)).toBe(true);
  });

  it("hasAtLeast は所持数を正しく判定する", () => {
    const inv = addItem(createEmptyInventory(), "stick", 3);
    expect(hasAtLeast(inv, "stick", 3)).toBe(true);
    expect(hasAtLeast(inv, "stick", 4)).toBe(false);
  });

  it("removeItems は1つでも不足していれば何も変更しない", () => {
    let inv = addItem(createEmptyInventory(), "stick", 2);
    inv = addItem(inv, "plant_fiber", 1);
    const result = removeItems(inv, [
      { key: "stick", count: 1 },
      { key: "plant_fiber", count: 5 }
    ]);
    expect(result).toBeNull();
    expect(getCount(inv, "stick")).toBe(2);
  });

  it("removeItems は全て足りている場合にまとめて消費する", () => {
    let inv = addItem(createEmptyInventory(), "stick", 2);
    inv = addItem(inv, "plant_fiber", 3);
    const result = removeItems(inv, [
      { key: "stick", count: 1 },
      { key: "plant_fiber", count: 2 }
    ]);
    expect(result).not.toBeNull();
    expect(getCount(result!, "stick")).toBe(1);
    expect(getCount(result!, "plant_fiber")).toBe(1);
  });

  it("nonEmptyEntries は0個以下のキーを除外する", () => {
    const inv = { stick: 2, empty_key: 0 };
    expect(nonEmptyEntries(inv)).toEqual([["stick", 2]]);
  });

  it("sanitizeInventory は不正な値を除去する", () => {
    const sanitized = sanitizeInventory({
      stick: 3,
      negative: -1,
      float: 1.5,
      nan: Number.NaN,
      zero: 0,
      valid: 7
    });
    expect(sanitized).toEqual({ stick: 3, valid: 7 });
  });

  it("sanitizeInventory はオブジェクト以外に空のインベントリを返す", () => {
    expect(sanitizeInventory(null)).toEqual({});
    expect(sanitizeInventory("not an object")).toEqual({});
    expect(sanitizeInventory(42)).toEqual({});
  });
});
