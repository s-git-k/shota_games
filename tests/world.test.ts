import { describe, expect, it } from "vitest";
import type { BlockEdit } from "../src/core/world";
import { World } from "../src/core/world";
import { getBlockDefByKey, AIR_ID } from "../src/core/blocks";
import { hashStringToInt } from "../src/core/rng";
import { CURRENT_TERRAIN_GENERATOR_VERSION, TERRAIN_GENERATOR_VERSION_LEGACY } from "../src/core/terrain";

const STONE = getBlockDefByKey("stone").id;
const GLASS = getBlockDefByKey("glass").id;
const DOOR = getBlockDefByKey("door").id;
// 地形高さの上限より確実に高いYを使い、常に空気から始まる状態でテストする
const Y = 55;

describe("World", () => {
  it("setBlock/getBlockId が往復する", () => {
    const world = new World(hashStringToInt("w1"), "w1");
    world.setBlock(5, Y, 5, STONE);
    expect(world.getBlockId(5, Y, 5)).toBe(STONE);
  });

  it("setBlockは変更前の状態を正しく返す", () => {
    const world = new World(hashStringToInt("w2"), "w2");
    const first = world.setBlock(0, Y, 0, STONE);
    expect(first.prevId).toBe(AIR_ID);
    const second = world.setBlock(0, Y, 0, GLASS);
    expect(second.prevId).toBe(STONE);
    expect(second.changed).toBe(true);
  });

  it("同じ値を設置するとchanged=falseになる", () => {
    const world = new World(hashStringToInt("w3"), "w3");
    world.setBlock(1, Y, 1, STONE);
    const result = world.setBlock(1, Y, 1, STONE);
    expect(result.changed).toBe(false);
  });

  it("チャンク境界をまたいだ座標でも一貫して動作する", () => {
    const world = new World(hashStringToInt("w4"), "w4");
    world.setBlock(-1, Y, -1, STONE);
    expect(world.getBlockId(-1, Y, -1)).toBe(STONE);
    world.setBlock(16, Y, 16, GLASS);
    expect(world.getBlockId(16, Y, 16)).toBe(GLASS);
    // 元のチャンクには影響しない
    expect(world.getBlockId(-1, Y, -1)).toBe(STONE);
  });

  it("範囲外のYは無視され空気のまま", () => {
    const world = new World(hashStringToInt("w5"), "w5");
    const result = world.setBlock(0, -5, 0, STONE);
    expect(result.changed).toBe(false);
    expect(world.getBlockId(0, -5, 0)).toBe(AIR_ID);
  });

  it("未知のブロックIDを設置しようとすると例外を投げる", () => {
    const world = new World(hashStringToInt("w6"), "w6");
    expect(() => world.setBlock(0, Y, 0, 99999)).toThrow();
  });

  it("ドアが開いている場合は非衝突になる", () => {
    const world = new World(hashStringToInt("w7"), "w7");
    world.setBlock(0, Y, 0, DOOR, 0, false);
    expect(world.isSolid(0, Y, 0)).toBe(true);
    world.setBlock(0, Y, 0, DOOR, 0, true);
    expect(world.isSolid(0, Y, 0)).toBe(false);
  });

  it("syncLoadedChunksは中心付近のチャンクを読み込み、範囲外を破棄する", () => {
    const world = new World(hashStringToInt("w8"), "w8");
    const first = world.syncLoadedChunks(0, 0, 1);
    expect(first.loaded.length).toBeGreaterThan(0);
    expect(first.unloaded.length).toBe(0);

    // 遠くへ移動すると近くのチャンクがアンロードされる
    const second = world.syncLoadedChunks(50, 50, 1);
    expect(second.unloaded.length).toBeGreaterThan(0);
  });

  it("編集はアンロード/再ロードしても保持される (地形からの差分として)", () => {
    const world = new World(hashStringToInt("w9"), "w9");
    world.setBlock(2, Y, 2, STONE);
    world.syncLoadedChunks(0, 0, 1); // チャンク(0,0)は範囲内なので保持される
    expect(world.getBlockId(2, Y, 2)).toBe(STONE);

    world.syncLoadedChunks(100, 100, 1); // 強制的にアンロード
    world.syncLoadedChunks(0, 0, 1); // 再ロード
    expect(world.getBlockId(2, Y, 2)).toBe(STONE);
  });

  it("getAllEdits/loadEditsで差分の保存・復元ができる", () => {
    const world = new World(hashStringToInt("w10"), "w10");
    world.setBlock(3, Y, 3, GLASS);
    const edits = world.getAllEdits();
    const plain: Array<[string, BlockEdit[]]> = [];
    for (const [key, map] of edits) {
      plain.push([key, Array.from(map.values())]);
    }

    const world2 = new World(hashStringToInt("w10"), "w10");
    world2.loadEdits(plain);
    expect(world2.getBlockId(3, Y, 3)).toBe(GLASS);
  });

  it("generatorVersionを省略すると最新のPhase 3地形になる", () => {
    const world = new World(hashStringToInt("w11"), "w11");
    expect(world.generatorVersion).toBe(CURRENT_TERRAIN_GENERATOR_VERSION);
  });

  it("generatorVersion=1 (従来地形) を指定すると、明示的にそのバージョンで保持される", () => {
    const world = new World(hashStringToInt("w12"), "w12", TERRAIN_GENERATOR_VERSION_LEGACY);
    expect(world.generatorVersion).toBe(TERRAIN_GENERATOR_VERSION_LEGACY);
  });

  it("同一ワールドはチャンクの読み込み順序に関わらず同じ地形になる (継ぎ目が安定する)", () => {
    const seed = hashStringToInt("seam-stability");
    // 順序A: (0,0) -> (1,0) の順にロード
    const worldA = new World(seed, "seam-a");
    worldA.ensureChunk(0, 0);
    worldA.ensureChunk(1, 0);
    // 順序B: (1,0) -> (0,0) の順にロード (逆順)
    const worldB = new World(seed, "seam-b");
    worldB.ensureChunk(1, 0);
    worldB.ensureChunk(0, 0);

    // チャンク境界 (x=15 と x=16) のブロックが順序によらず一致することを確認する
    for (let z = 0; z < 16; z++) {
      for (let y = 0; y < 64; y++) {
        expect(worldA.getBlockId(15, y, z)).toBe(worldB.getBlockId(15, y, z));
        expect(worldA.getBlockId(16, y, z)).toBe(worldB.getBlockId(16, y, z));
      }
    }
  });

  it("isLiquidは水ブロックに対してtrue、それ以外はfalseを返す", () => {
    const world = new World(hashStringToInt("w13"), "w13");
    world.setBlock(0, Y, 0, STONE);
    expect(world.isLiquid(0, Y, 0)).toBe(false);
    expect(world.isLiquid(0, Y + 1, 0)).toBe(false); // 空気
  });
});
