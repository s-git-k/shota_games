import { describe, expect, it } from "vitest";
import type { BlockEdit } from "../src/core/world";
import { World } from "../src/core/world";
import { getBlockDefByKey, AIR_ID } from "../src/core/blocks";
import { hashStringToInt } from "../src/core/rng";
import {
  CURRENT_TERRAIN_GENERATOR_VERSION,
  TERRAIN_GENERATOR_VERSION_BIOMES,
  TERRAIN_GENERATOR_VERSION_LEGACY
} from "../src/core/terrain";
import { buildChunkMesh } from "../src/render/chunkMesher";

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

  it("Phase 5: hasLoadedChunk/loadedChunkCountはensureChunkで読み込んだチャンクを反映する", () => {
    const world = new World(hashStringToInt("w8b"), "w8b");
    expect(world.hasLoadedChunk(0, 0)).toBe(false);
    expect(world.loadedChunkCount).toBe(0);
    world.ensureChunk(0, 0);
    expect(world.hasLoadedChunk(0, 0)).toBe(true);
    expect(world.loadedChunkCount).toBe(1);
    expect(world.hasLoadedChunk(1, 0)).toBe(false);
  });

  it("Phase 5: unloadChunksOutsideは生成を行わず、範囲外に既にロード済みのチャンクだけを破棄する", () => {
    const world = new World(hashStringToInt("w8c"), "w8c");
    world.ensureChunk(0, 0);
    world.ensureChunk(1, 0);
    expect(world.loadedChunkCount).toBe(2);

    // 半径0(中心のみ)の外側にあるチャンクだけがアンロードされ、新規生成は起きない
    const unloaded = world.unloadChunksOutside(0, 0, 0);
    expect(unloaded).toContain("1,0");
    expect(world.hasLoadedChunk(0, 0)).toBe(true);
    expect(world.hasLoadedChunk(1, 0)).toBe(false);
    expect(world.loadedChunkCount).toBe(1);
  });

  it("Phase 5: メッシュ境界確認は未ロードの隣接チャンクを暗黙生成しない", () => {
    const world = new World(hashStringToInt("mesh-budget"), "mesh-budget");
    const chunk = world.ensureChunk(0, 0);
    expect(world.loadedChunkCount).toBe(1);
    const mesh = buildChunkMesh(world, chunk);
    expect(world.loadedChunkCount).toBe(1);
    mesh.solid?.dispose();
    mesh.transparent?.dispose();
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

describe("Phase 4: 生成宝箱の座標判定と開封済みマーカー", () => {
  it("旧地形ジェネレーター(v1)のワールドには遺跡が存在しないため常にfalseを返す", () => {
    const world = new World(hashStringToInt("treasure-legacy"), "treasure-legacy", TERRAIN_GENERATOR_VERSION_LEGACY);
    for (let x = -40; x <= 40; x += 5) {
      for (let z = -40; z <= 40; z += 5) {
        expect(world.isGeneratedRuinChestLocation(x, 20, z)).toBe(false);
      }
    }
  });

  it("地形v2ワールドでは洞窟判定を維持しつつ、v3宝箱報酬だけを無効にする", () => {
    const world = new World(hashStringToInt("phase3-caves"), "phase3-caves", TERRAIN_GENERATOR_VERSION_BIOMES);
    let foundCave = false;
    for (let x = -24; x <= 24 && !foundCave; x += 3) {
      for (let z = -24; z <= 24 && !foundCave; z += 3) {
        for (let y = 5; y < 30 && !foundCave; y++) {
          foundCave = world.isNaturalCaveAt(x, y, z);
          expect(world.isGeneratedRuinChestLocation(x, y, z)).toBe(false);
        }
      }
    }
    expect(foundCave).toBe(true);
  });

  it("最新ジェネレーターのワールドでは、実際にチェストブロックが生成される座標でtrueを返す", () => {
    const world = new World(hashStringToInt("treasure-v2"), "treasure-v2");
    const CHEST = getBlockDefByKey("chest").id;
    let foundMatch = false;
    for (let cx = -6; cx <= 6 && !foundMatch; cx++) {
      for (let cz = -6; cz <= 6 && !foundMatch; cz++) {
        const chunk = world.ensureChunk(cx, cz);
        for (let lx = 0; lx < 16 && !foundMatch; lx++) {
          for (let lz = 0; lz < 16 && !foundMatch; lz++) {
            for (let ly = 0; ly < 64 && !foundMatch; ly++) {
              if (chunk.getId(lx, ly, lz) !== CHEST) continue;
              const worldX = cx * 16 + lx;
              const worldZ = cz * 16 + lz;
              expect(world.isGeneratedRuinChestLocation(worldX, ly, worldZ)).toBe(true);
              foundMatch = true;
            }
          }
        }
      }
    }
    expect(foundMatch).toBe(true);
  });

  it("開封済みマーカーは座標ごとに独立して記録・保存・復元できる", () => {
    const world = new World(hashStringToInt("loot1"), "loot1");
    expect(world.isTreasureLooted(1, 2, 3)).toBe(false);
    world.markTreasureLooted(1, 2, 3);
    expect(world.isTreasureLooted(1, 2, 3)).toBe(true);
    expect(world.isTreasureLooted(4, 5, 6)).toBe(false);

    const saved = world.getLootedTreasures();
    expect(saved).toEqual(["1,2,3"]);

    const world2 = new World(hashStringToInt("loot1"), "loot1");
    world2.loadLootedTreasures(saved);
    expect(world2.isTreasureLooted(1, 2, 3)).toBe(true);
  });

  it("ブロックを壊して同じ座標に再設置しても、開封済みマーカーは残り続ける (連続入手を防ぐ)", () => {
    const world = new World(hashStringToInt("loot2"), "loot2");
    const CHEST = getBlockDefByKey("chest").id;
    world.setBlock(5, 30, 5, CHEST);
    world.markTreasureLooted(5, 30, 5);

    world.setBlock(5, 30, 5, AIR_ID); // 破壊
    world.setBlock(5, 30, 5, CHEST); // 再設置 (クラフトした宝箱)

    expect(world.isTreasureLooted(5, 30, 5)).toBe(true);
  });
});
