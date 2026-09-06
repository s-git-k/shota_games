import { describe, expect, it } from "vitest";
import { hashStringToInt } from "../src/core/rng";
import { rollRuinTreasureLoot } from "../src/core/treasure";
import { isValidBlockKey } from "../src/core/blocks";
import { isValidItemKey } from "../src/core/items";

describe("rollRuinTreasureLoot", () => {
  const seed = hashStringToInt("treasure-seed");

  it("決定論的: 同じシード・座標なら常に同じ戦利品になる", () => {
    const a = rollRuinTreasureLoot(seed, 10, 20, 30);
    const b = rollRuinTreasureLoot(seed, 10, 20, 30);
    expect(a).toEqual(b);
  });

  it("座標が違えば戦利品の内容も変わりうる (完全固定ではない)", () => {
    const seen = new Set<string>();
    for (let x = 0; x < 30; x++) {
      seen.add(JSON.stringify(rollRuinTreasureLoot(seed, x, 20, 30)));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("必ず金塊と金属パネルを含み、個数は正の整数", () => {
    for (let x = 0; x < 20; x++) {
      const loot = rollRuinTreasureLoot(seed, x, 10, 5);
      const gold = loot.find((l) => l.key === "gold");
      const metal = loot.find((l) => l.key === "metal");
      expect(gold).toBeDefined();
      expect(metal).toBeDefined();
      expect(Number.isInteger(gold!.count)).toBe(true);
      expect(gold!.count).toBeGreaterThanOrEqual(2);
      expect(gold!.count).toBeLessThanOrEqual(4);
      expect(metal!.count).toBeGreaterThanOrEqual(1);
      expect(metal!.count).toBeLessThanOrEqual(3);
    }
  });

  it("戦利品のキーは全て既知のブロックまたはアイテムである", () => {
    for (let x = 0; x < 40; x++) {
      const loot = rollRuinTreasureLoot(seed, x, 15, -8);
      for (const entry of loot) {
        expect(isValidBlockKey(entry.key) || isValidItemKey(entry.key)).toBe(true);
        expect(entry.count).toBeGreaterThan(0);
      }
    }
  });

  it("異なるシードでは異なるワールドとして違う戦利品になりうる", () => {
    const seedB = hashStringToInt("another-treasure-seed");
    let differsSomewhere = false;
    for (let x = 0; x < 20; x++) {
      const a = rollRuinTreasureLoot(seed, x, 1, 1);
      const b = rollRuinTreasureLoot(seedB, x, 1, 1);
      if (JSON.stringify(a) !== JSON.stringify(b)) differsSomewhere = true;
    }
    expect(differsSomewhere).toBe(true);
  });
});
