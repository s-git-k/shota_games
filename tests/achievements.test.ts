import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  computeNewlyUnlocked,
  createEmptyProgressCounters,
  evaluateUnlockedAchievementIds,
  getAchievementDef,
  isValidAchievementId
} from "../src/core/achievements";
import { BIOMES } from "../src/core/biome";

describe("実績レジストリ", () => {
  it("IDが重複しない", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("8種類の実績が定義されている (要求された焦点を絞った一式)", () => {
    expect(ACHIEVEMENTS.length).toBe(8);
  });

  it("getAchievementDefは未知のIDで例外を投げる", () => {
    expect(() => getAchievementDef("no-such-id")).toThrow();
  });

  it("isValidAchievementIdは既知のIDのみtrueを返す", () => {
    expect(isValidAchievementId("first_block_placed")).toBe(true);
    expect(isValidAchievementId("no-such-id")).toBe(false);
  });
});

describe("evaluateUnlockedAchievementIds", () => {
  it("初期カウンターでは何も解除されない", () => {
    const unlocked = evaluateUnlockedAchievementIds(createEmptyProgressCounters());
    expect(unlocked.size).toBe(0);
  });

  it("ブロックを1個設置すると first_block_placed のみ解除される", () => {
    const counters = { ...createEmptyProgressCounters(), placedBlocksCount: 1 };
    const unlocked = evaluateUnlockedAchievementIds(counters);
    expect(unlocked.has("first_block_placed")).toBe(true);
    expect(unlocked.has("hundred_blocks_placed")).toBe(false);
  });

  it("ブロックを100個設置すると両方の設置系実績が解除される", () => {
    const counters = { ...createEmptyProgressCounters(), placedBlocksCount: 100 };
    const unlocked = evaluateUnlockedAchievementIds(counters);
    expect(unlocked.has("first_block_placed")).toBe(true);
    expect(unlocked.has("hundred_blocks_placed")).toBe(true);
  });

  it("6バイオームすべてを訪れると all_biomes_discovered が解除される (重複は無視)", () => {
    const counters = {
      ...createEmptyProgressCounters(),
      discoveredBiomes: [...BIOMES, ...BIOMES] // 重複を含めても正しく判定できるか確認
    };
    expect(evaluateUnlockedAchievementIds(counters).has("all_biomes_discovered")).toBe(true);
  });

  it("5バイオームだけでは all_biomes_discovered は解除されない", () => {
    const counters = { ...createEmptyProgressCounters(), discoveredBiomes: BIOMES.slice(0, 5) };
    expect(evaluateUnlockedAchievementIds(counters).has("all_biomes_discovered")).toBe(false);
  });

  it("洞窟発見/宝箱開封/クラフト/撃破/通電の各フラグが個別に判定される", () => {
    expect(evaluateUnlockedAchievementIds({ ...createEmptyProgressCounters(), caveDiscovered: true }).has("first_cave_discovered")).toBe(
      true
    );
    expect(
      evaluateUnlockedAchievementIds({ ...createEmptyProgressCounters(), openedTreasureCount: 1 }).has("first_ruin_treasure")
    ).toBe(true);
    expect(
      evaluateUnlockedAchievementIds({ ...createEmptyProgressCounters(), craftedItemsCount: 1 }).has("first_item_crafted")
    ).toBe(true);
    expect(
      evaluateUnlockedAchievementIds({ ...createEmptyProgressCounters(), defeatedHostilesCount: 1 }).has("first_hostile_defeated")
    ).toBe(true);
    expect(
      evaluateUnlockedAchievementIds({ ...createEmptyProgressCounters(), circuitPoweredEver: true }).has("first_circuit_powered")
    ).toBe(true);
  });
});

describe("computeNewlyUnlocked", () => {
  it("既に解除済みの実績は除外される", () => {
    const counters = { ...createEmptyProgressCounters(), placedBlocksCount: 1 };
    const newly = computeNewlyUnlocked(counters, new Set(["first_block_placed"]));
    expect(newly.length).toBe(0);
  });

  it("新規に条件を満たした実績のみ返す", () => {
    const counters = { ...createEmptyProgressCounters(), placedBlocksCount: 100 };
    const newly = computeNewlyUnlocked(counters, new Set(["first_block_placed"]));
    expect(newly.map((a) => a.id)).toEqual(["hundred_blocks_placed"]);
  });

  it("配列で既解除リストを渡しても動作する", () => {
    const counters = { ...createEmptyProgressCounters(), craftedItemsCount: 1 };
    const newly = computeNewlyUnlocked(counters, []);
    expect(newly.map((a) => a.id)).toContain("first_item_crafted");
  });

  it("一度に複数の条件を満たしても全て返す", () => {
    const counters = {
      ...createEmptyProgressCounters(),
      placedBlocksCount: 100,
      craftedItemsCount: 1,
      defeatedHostilesCount: 1
    };
    const newly = computeNewlyUnlocked(counters, []);
    const ids = newly.map((a) => a.id);
    expect(ids).toContain("first_block_placed");
    expect(ids).toContain("hundred_blocks_placed");
    expect(ids).toContain("first_item_crafted");
    expect(ids).toContain("first_hostile_defeated");
  });
});
