import { describe, expect, it } from "vitest";
import { AIR_ID, getBlockDefByKey } from "../src/core/blocks";
import { CHUNK_HEIGHT, CHUNK_SIZE_X, CHUNK_SIZE_Z, Chunk, chunkKey, localIndex, parseChunkKey, worldToLocal } from "../src/core/chunk";

describe("Chunk", () => {
  it("初期状態は全て空気", () => {
    const chunk = new Chunk(0, 0);
    expect(chunk.getId(0, 0, 0)).toBe(AIR_ID);
    expect(chunk.getId(CHUNK_SIZE_X - 1, CHUNK_HEIGHT - 1, CHUNK_SIZE_Z - 1)).toBe(AIR_ID);
  });

  it("setId/getId が往復する", () => {
    const chunk = new Chunk(2, -3);
    const stone = getBlockDefByKey("stone").id;
    chunk.setId(1, 5, 2, stone);
    expect(chunk.getId(1, 5, 2)).toBe(stone);
    expect(chunk.dirty).toBe(true);
  });

  it("範囲外のYは空気を返し、setIdは無視される", () => {
    const chunk = new Chunk(0, 0);
    expect(chunk.getId(0, -1, 0)).toBe(AIR_ID);
    expect(chunk.getId(0, CHUNK_HEIGHT, 0)).toBe(AIR_ID);
    chunk.setId(0, -1, 0, getBlockDefByKey("stone").id);
    expect(chunk.getId(0, -1, 0)).toBe(AIR_ID);
  });

  it("facing/open はデフォルトで0/falseで、設定すると保持される", () => {
    const chunk = new Chunk(0, 0);
    expect(chunk.getFacing(0, 0, 0)).toBe(0);
    expect(chunk.isOpen(0, 0, 0)).toBe(false);
    chunk.setFacing(3, 4, 5, 2);
    chunk.setOpen(3, 4, 5, true);
    expect(chunk.getFacing(3, 4, 5)).toBe(2);
    expect(chunk.isOpen(3, 4, 5)).toBe(true);
    // 他の座標には影響しない
    expect(chunk.getFacing(0, 0, 0)).toBe(0);
  });

  it("localIndex は一意で範囲内に収まる", () => {
    const seen = new Set<number>();
    for (let x = 0; x < CHUNK_SIZE_X; x += 3) {
      for (let y = 0; y < CHUNK_HEIGHT; y += 5) {
        for (let z = 0; z < CHUNK_SIZE_Z; z += 3) {
          const idx = localIndex(x, y, z);
          expect(seen.has(idx)).toBe(false);
          seen.add(idx);
        }
      }
    }
  });
});

describe("chunkKey / parseChunkKey", () => {
  it("往復する", () => {
    const key = chunkKey(-5, 12);
    expect(parseChunkKey(key)).toEqual({ cx: -5, cz: 12 });
  });
});

describe("worldToLocal", () => {
  it("正の座標は単純な剰余", () => {
    expect(worldToLocal(17, 16)).toBe(1);
  });

  it("負の座標でも0以上chunkSize未満を返す", () => {
    expect(worldToLocal(-1, 16)).toBe(15);
    expect(worldToLocal(-16, 16)).toBe(0);
    expect(worldToLocal(-17, 16)).toBe(15);
  });
});
