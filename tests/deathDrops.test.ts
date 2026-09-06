import { describe, expect, it } from "vitest";
import { addDeathDrop, findNearestPickupableDrop, removeDeathDrop, MAX_DEATH_DROPS, type DeathDropEntry } from "../src/core/deathDrops";

function makeDrop(id: string, createdAt: number, overrides: Partial<DeathDropEntry> = {}): DeathDropEntry {
  return {
    id,
    position: { x: 0, y: 40, z: 0 },
    inventory: {},
    createdAt,
    ...overrides
  };
}

describe("addDeathDrop", () => {
  it("上限未満なら単純に末尾へ追加する", () => {
    const drops = [makeDrop("a", 1)];
    const next = addDeathDrop(drops, makeDrop("b", 2));
    expect(next.map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("上限(MAX_DEATH_DROPS)ちょうどまでは件数が増える", () => {
    let drops: DeathDropEntry[] = [];
    for (let i = 0; i < MAX_DEATH_DROPS; i++) {
      drops = addDeathDrop(drops, makeDrop(`d${i}`, i));
    }
    expect(drops).toHaveLength(MAX_DEATH_DROPS);
  });

  it("上限を超えて追加すると、最古のドロップの中身が次に古いドロップへ合流し、件数は上限のまま保たれる", () => {
    let drops: DeathDropEntry[] = [];
    for (let i = 0; i < MAX_DEATH_DROPS; i++) {
      drops = addDeathDrop(drops, makeDrop(`d${i}`, i, { inventory: { stone: 1 } }));
    }
    const totalStoneBefore = drops.reduce((sum, d) => sum + (d.inventory.stone ?? 0), 0);
    const withOverflow = addDeathDrop(drops, makeDrop("newest", 999, { inventory: { stone: 1 } }));

    expect(withOverflow).toHaveLength(MAX_DEATH_DROPS);
    // 最古 (d0) は消え、次点 (d1) に合流しているはず
    expect(withOverflow.some((d) => d.id === "d0")).toBe(false);
    const merged = withOverflow.find((d) => d.id === "d1");
    expect(merged).toBeDefined();
    expect(merged?.inventory.stone).toBe(2);

    // アイテムの総数 (中身) は失われていない
    const totalStoneAfter = withOverflow.reduce((sum, d) => sum + (d.inventory.stone ?? 0), 0);
    expect(totalStoneAfter).toBe(totalStoneBefore + 1);
  });
});

describe("findNearestPickupableDrop", () => {
  it("回収半径内にある最も近いドロップを返す", () => {
    const drops = [makeDrop("far", 1, { position: { x: 10, y: 40, z: 0 } }), makeDrop("near", 2, { position: { x: 1, y: 40, z: 0 } })];
    const found = findNearestPickupableDrop(drops, { x: 0, y: 40, z: 0 }, 5, 2.5);
    expect(found?.id).toBe("near");
  });

  it("回収半径外のドロップは無視する", () => {
    const drops = [makeDrop("far", 1, { position: { x: 100, y: 40, z: 0 } })];
    const found = findNearestPickupableDrop(drops, { x: 0, y: 40, z: 0 }, 5, 2.5);
    expect(found).toBeNull();
  });

  it("垂直方向の許容差(maxDy)を超えるドロップは無視する", () => {
    const drops = [makeDrop("above", 1, { position: { x: 0, y: 60, z: 0 } })];
    const found = findNearestPickupableDrop(drops, { x: 0, y: 40, z: 0 }, 5, 2.5);
    expect(found).toBeNull();
  });

  it("ドロップが無ければnullを返す", () => {
    expect(findNearestPickupableDrop([], { x: 0, y: 40, z: 0 }, 5, 2.5)).toBeNull();
  });
});

describe("removeDeathDrop", () => {
  it("指定IDのドロップだけを取り除く", () => {
    const drops = [makeDrop("a", 1), makeDrop("b", 2)];
    const next = removeDeathDrop(drops, "a");
    expect(next.map((d) => d.id)).toEqual(["b"]);
  });

  it("存在しないIDを指定しても変化しない", () => {
    const drops = [makeDrop("a", 1)];
    const next = removeDeathDrop(drops, "no-such-id");
    expect(next).toEqual(drops);
  });
});
