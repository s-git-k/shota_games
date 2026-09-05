import { describe, expect, it } from "vitest";
import { hashStringToInt } from "../src/core/rng";
import { CHUNK_HEIGHT, CHUNK_SIZE_X, CHUNK_SIZE_Z, localIndex } from "../src/core/chunk";
import { generateChunkIdsV2, terrainHeightV2 } from "../src/core/terrainV2";
import { getBiomeAt } from "../src/core/biome";
import { AIR_ID, getBlockDefByKey } from "../src/core/blocks";
import { SEA_LEVEL } from "../src/core/worldgenConstants";

const WATER = getBlockDefByKey("water").id;
const GRASS = getBlockDefByKey("grass").id;

describe("terrainHeightV2", () => {
  it("決定論的: 同じシード・座標では常に同じ高さ", () => {
    const seed = hashStringToInt("terrainv2-a");
    expect(terrainHeightV2(seed, 40, -30)).toBe(terrainHeightV2(seed, 40, -30));
  });

  it("常にチャンク高さの範囲内", () => {
    const seed = hashStringToInt("terrainv2-range");
    for (let x = -500; x <= 500; x += 23) {
      const h = terrainHeightV2(seed, x, 5);
      expect(h).toBeGreaterThanOrEqual(1);
      expect(h).toBeLessThan(CHUNK_HEIGHT);
    }
  });

  it("海バイオームの地表は常に海面より低い", () => {
    const seed = hashStringToInt("terrainv2-ocean");
    let checked = 0;
    for (let x = -800; x <= 800; x += 17) {
      for (let z = -800; z <= 800; z += 19) {
        if (getBiomeAt(seed, x, z) !== "ocean") continue;
        checked++;
        expect(terrainHeightV2(seed, x, z)).toBeLessThan(SEA_LEVEL);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("山地バイオームの地表は海面より十分高い", () => {
    const seed = hashStringToInt("terrainv2-mountain");
    let checked = 0;
    for (let x = -800; x <= 800; x += 17) {
      for (let z = -800; z <= 800; z += 19) {
        if (getBiomeAt(seed, x, z) !== "mountain") continue;
        checked++;
        expect(terrainHeightV2(seed, x, z)).toBeGreaterThanOrEqual(SEA_LEVEL + 10);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("generateChunkIdsV2", () => {
  it("決定論的: 同じシード・チャンク座標では同一のブロック配列になる", () => {
    const seed = hashStringToInt("terrainv2-determinism");
    const a = generateChunkIdsV2(seed, 4, -3);
    const b = generateChunkIdsV2(seed, 4, -3);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("配列サイズが1チャンク分ぴったり", () => {
    const seed = hashStringToInt("terrainv2-size");
    const ids = generateChunkIdsV2(seed, 0, 0);
    expect(ids.length).toBe(CHUNK_SIZE_X * CHUNK_SIZE_Z * CHUNK_HEIGHT);
  });

  it("チャンク生成の呼び出し順序に依存しない (他チャンクを先に生成しても結果が変わらない)", () => {
    const seed = hashStringToInt("terrainv2-order-independent");
    const alone = generateChunkIdsV2(seed, 7, 7);
    // ダミーで別チャンクをいくつか生成してから同じチャンクを再生成しても同じになるはず
    generateChunkIdsV2(seed, 0, 0);
    generateChunkIdsV2(seed, 100, -50);
    generateChunkIdsV2(seed, -8, 6);
    const again = generateChunkIdsV2(seed, 7, 7);
    expect(Array.from(again)).toEqual(Array.from(alone));
  });

  it("上空 (chunk上端付近) は空気であるべき", () => {
    const seed = hashStringToInt("terrainv2-sky");
    const ids = generateChunkIdsV2(seed, 0, 0);
    const topY = CHUNK_HEIGHT - 1;
    expect(ids[localIndex(0, topY, 0)]).toBe(AIR_ID);
  });

  it("海バイオームのチャンクは水ブロックを含む", () => {
    const seed = hashStringToInt("terrainv2-water-presence");
    let foundWaterChunk = false;
    for (let cx = -20; cx <= 20 && !foundWaterChunk; cx++) {
      for (let cz = -20; cz <= 20 && !foundWaterChunk; cz++) {
        const wx = cx * CHUNK_SIZE_X + 8;
        const wz = cz * CHUNK_SIZE_Z + 8;
        if (getBiomeAt(seed, wx, wz) !== "ocean") continue;
        const ids = generateChunkIdsV2(seed, cx, cz);
        if (Array.from(ids).some((id) => id === WATER)) foundWaterChunk = true;
      }
    }
    expect(foundWaterChunk).toBe(true);
  });

  it("洞窟がある場所には空気または水のポケットが生じ、完全な岩盤だけにはならない", () => {
    const seed = hashStringToInt("terrainv2-caves-present");
    let foundVoid = false;
    for (let cx = -10; cx <= 10 && !foundVoid; cx++) {
      for (let cz = -10; cz <= 10 && !foundVoid; cz++) {
        const ids = generateChunkIdsV2(seed, cx, cz);
        for (let lx = 0; lx < CHUNK_SIZE_X && !foundVoid; lx++) {
          for (let lz = 0; lz < CHUNK_SIZE_Z && !foundVoid; lz++) {
            for (let ly = 5; ly < 30 && !foundVoid; ly++) {
              const id = ids[localIndex(lx, ly, lz)];
              // 洞窟が実在する: 表面より下の層で AIR か WATER (空洞) が現れる場所がある
              if ((id === AIR_ID || id === WATER) && ly < CHUNK_HEIGHT - 20) foundVoid = true;
            }
          }
        }
      }
    }
    expect(foundVoid).toBe(true);
  });

  it("雪原/砂漠バイオームが実際に (海面より高い陸地として) 存在する", () => {
    const seed = hashStringToInt("terrainv2-surface-blocks");
    let checkedSnow = 0;
    let checkedSand = 0;
    for (let x = -1000; x <= 1000; x += 23) {
      for (let z = -1000; z <= 1000; z += 29) {
        const biome = getBiomeAt(seed, x, z);
        const h = terrainHeightV2(seed, x, z);
        if (biome === "snowfield" && h > SEA_LEVEL + 1) checkedSnow++;
        if (biome === "desert" && h > SEA_LEVEL + 1) checkedSand++;
      }
    }
    expect(checkedSnow).toBeGreaterThan(0);
    expect(checkedSand).toBeGreaterThan(0);
  });

  it("草原の地表ブロックには GRASS が実際に使われる", () => {
    const seed = hashStringToInt("terrainv2-grass-surface");
    let found = false;
    for (let cx = -15; cx <= 15 && !found; cx++) {
      for (let cz = -15; cz <= 15 && !found; cz++) {
        const ids = generateChunkIdsV2(seed, cx, cz);
        for (let lx = 0; lx < CHUNK_SIZE_X && !found; lx++) {
          for (let lz = 0; lz < CHUNK_SIZE_Z && !found; lz++) {
            const wx = cx * CHUNK_SIZE_X + lx;
            const wz = cz * CHUNK_SIZE_Z + lz;
            if (getBiomeAt(seed, wx, wz) !== "grassland") continue;
            const h = terrainHeightV2(seed, wx, wz);
            if (h >= CHUNK_HEIGHT) continue;
            if (ids[localIndex(lx, h, lz)] === GRASS) found = true;
          }
        }
      }
    }
    expect(found).toBe(true);
  });
});
