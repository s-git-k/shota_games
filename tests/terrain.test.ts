import { describe, expect, it } from "vitest";
import { hashStringToInt } from "../src/core/rng";
import { CHUNK_HEIGHT, CHUNK_SIZE_X, CHUNK_SIZE_Z } from "../src/core/chunk";
import { generateChunkIds, terrainHeight } from "../src/core/terrain";
import { AIR_ID } from "../src/core/blocks";

describe("terrainHeight", () => {
  it("同じシード・座標では常に同じ高さを返す", () => {
    const seed = hashStringToInt("seed-a");
    expect(terrainHeight(seed, 10, 20)).toBe(terrainHeight(seed, 10, 20));
  });

  it("高さは常にチャンク高さの範囲内", () => {
    const seed = hashStringToInt("seed-b");
    for (let x = -50; x <= 50; x += 17) {
      const h = terrainHeight(seed, x, 0);
      expect(h).toBeGreaterThanOrEqual(1);
      expect(h).toBeLessThan(CHUNK_HEIGHT);
    }
  });

  it("異なるシードでは (少なくともどこかで) 異なる地形になる", () => {
    const seedA = hashStringToInt("world-alpha");
    const seedB = hashStringToInt("world-beta");
    let differs = false;
    for (let x = 0; x < 200; x += 5) {
      if (terrainHeight(seedA, x, 3) !== terrainHeight(seedB, x, 3)) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });
});

describe("generateChunkIds", () => {
  it("決定論的: 同じシード・チャンク座標では同一のブロック配列になる", () => {
    const seed = hashStringToInt("determinism-check");
    const a = generateChunkIds(seed, 3, -2);
    const b = generateChunkIds(seed, 3, -2);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("配列サイズが1チャンク分ぴったり", () => {
    const seed = hashStringToInt("size-check");
    const ids = generateChunkIds(seed, 0, 0);
    expect(ids.length).toBe(CHUNK_SIZE_X * CHUNK_SIZE_Z * CHUNK_HEIGHT);
  });

  it("最下層 (y=0) は地表より低いので空気ではない", () => {
    const seed = hashStringToInt("floor-check");
    const ids = generateChunkIds(seed, 0, 0);
    // (0,0,0) の地表は必ず y>0 のはずなので y=0 は地面ブロックのはず
    const idx = 0; // localIndex(0,0,0) = 0
    expect(ids[idx]).not.toBe(AIR_ID);
  });

  it("上空 (chunk上端付近) は空気であるべき", () => {
    const seed = hashStringToInt("sky-check");
    const ids = generateChunkIds(seed, 0, 0);
    const topY = CHUNK_HEIGHT - 1;
    const idx = (topY * CHUNK_SIZE_Z + 0) * CHUNK_SIZE_X + 0;
    expect(ids[idx]).toBe(AIR_ID);
  });
});
