import { describe, expect, it } from "vitest";
import { hashStringToInt } from "../src/core/rng";
import {
  CAVE_MIN_Y,
  groundwaterLevelForBiome,
  isCaveAt,
  isGeneratedRuinChestAt,
  isGroundwaterAt,
  oreForVoxel,
  ruinPlanForChunk,
  stampRuinIfAny
} from "../src/core/underground";
import { CHUNK_HEIGHT, CHUNK_SIZE_X, CHUNK_SIZE_Z, BLOCKS_PER_CHUNK, localIndex, worldToChunkCoord } from "../src/core/chunk";
import { getBlockDefByKey } from "../src/core/blocks";
import { SEA_LEVEL } from "../src/core/worldgenConstants";

const SURFACE = 40;

describe("isCaveAt", () => {
  const seed = hashStringToInt("underground-cave");

  it("決定論的: 同じ座標なら常に同じ結果", () => {
    for (let i = 0; i < 30; i++) {
      const x = i * 7 - 100;
      const y = 10 + (i % 20);
      const z = i * 3 - 40;
      expect(isCaveAt(seed, x, y, z, SURFACE)).toBe(isCaveAt(seed, x, y, z, SURFACE));
    }
  });

  it("地表付近 (CAVE_SURFACE_MARGIN未満) や最下層より下では洞窟にならない", () => {
    for (let x = -50; x <= 50; x += 5) {
      for (let z = -50; z <= 50; z += 5) {
        expect(isCaveAt(seed, x, SURFACE, z, SURFACE)).toBe(false);
        expect(isCaveAt(seed, x, SURFACE - 1, z, SURFACE)).toBe(false);
        expect(isCaveAt(seed, x, CAVE_MIN_Y - 1, z, SURFACE)).toBe(false);
      }
    }
  });

  it("十分に広い範囲を調べると、歩き回れる程度に洞窟(空洞)が存在する", () => {
    let caveCount = 0;
    let total = 0;
    for (let x = -80; x <= 80; x += 2) {
      for (let y = CAVE_MIN_Y; y <= SURFACE - 5; y += 2) {
        for (let z = -20; z <= 20; z += 4) {
          total++;
          if (isCaveAt(seed, x, y, z, SURFACE)) caveCount++;
        }
      }
    }
    expect(caveCount).toBeGreaterThan(0);
    // スポンジ状であって全部空洞になってしまうような壊れた閾値ではないことも確認する
    expect(caveCount / total).toBeLessThan(0.5);
  });
});

describe("groundwaterLevelForBiome / isGroundwaterAt", () => {
  it("砂漠は海より地下水面が低い (水没しにくい)", () => {
    expect(groundwaterLevelForBiome("desert")).toBeLessThan(groundwaterLevelForBiome("ocean"));
  });

  it("地下水判定は決定論的で、地下水面より高い位置には現れない", () => {
    const seed = hashStringToInt("underground-water");
    const level = groundwaterLevelForBiome("grassland");
    for (let x = -40; x <= 40; x += 3) {
      for (let z = -40; z <= 40; z += 3) {
        expect(isGroundwaterAt(seed, x, level + 5, z, level)).toBe(false);
        expect(isGroundwaterAt(seed, x, level, z, level)).toBe(isGroundwaterAt(seed, x, level, z, level));
      }
    }
  });
});

describe("oreForVoxel", () => {
  const seed = hashStringToInt("underground-ore");
  const METAL = getBlockDefByKey("metal").id;
  const GOLD = getBlockDefByKey("gold").id;
  const GLOW = getBlockDefByKey("glow_crystal").id;

  it("既存ブロック(metal/gold/glow_crystal)のみを鉱石として使う", () => {
    let found = 0;
    for (let x = -150; x <= 150; x += 3) {
      for (let y = 1; y <= SEA_LEVEL + 30; y += 3) {
        const ore = oreForVoxel(seed, x, y, 0, "grassland");
        if (ore === null) continue;
        found++;
        expect([METAL, GOLD, GLOW]).toContain(ore);
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it("金は海面付近より深い場所にしか出ない (高さ制約)", () => {
    for (let x = -100; x <= 100; x += 2) {
      for (let y = SEA_LEVEL + 11; y <= SEA_LEVEL + 40; y += 2) {
        expect(oreForVoxel(seed, x, y, 0, "grassland")).not.toBe(GOLD);
      }
    }
  });

  it("光晶石は深いところ (海面付近以下) にしか出ない", () => {
    for (let x = -100; x <= 100; x += 2) {
      for (let y = SEA_LEVEL + 5; y <= SEA_LEVEL + 40; y += 2) {
        expect(oreForVoxel(seed, x, y, 0, "grassland")).not.toBe(GLOW);
      }
    }
  });

  it("決定論的: 同じ座標・バイオームなら常に同じ結果", () => {
    for (let i = 0; i < 20; i++) {
      const x = i * 5;
      const y = 10 + (i % 20);
      expect(oreForVoxel(seed, x, y, 3, "mountain")).toBe(oreForVoxel(seed, x, y, 3, "mountain"));
    }
  });

  it("山地は鉱脈が他バイオームより豊富になりやすい", () => {
    let mountainCount = 0;
    let grasslandCount = 0;
    for (let x = -300; x <= 300; x += 2) {
      for (let y = 1; y <= SEA_LEVEL + 30; y += 2) {
        if (oreForVoxel(seed, x, y, 11, "mountain") !== null) mountainCount++;
        if (oreForVoxel(seed, x, y, 13, "grassland") !== null) grasslandCount++;
      }
    }
    expect(mountainCount).toBeGreaterThan(grasslandCount);
  });
});

describe("ruinPlanForChunk / stampRuinIfAny", () => {
  const seed = hashStringToInt("underground-ruin");
  const flatHeight = (_lx: number, _lz: number) => SURFACE;

  it("決定論的: 同じチャンク座標なら常に同じ計画 (または常にnull)", () => {
    for (let cx = -20; cx <= 20; cx++) {
      for (let cz = -20; cz <= 20; cz++) {
        const a = ruinPlanForChunk(seed, cx, cz, flatHeight);
        const b = ruinPlanForChunk(seed, cx, cz, flatHeight);
        expect(a).toEqual(b);
      }
    }
  });

  it("いくつかのチャンクには遺跡が存在する (存在しないチャンクだけではない)", () => {
    let count = 0;
    for (let cx = -30; cx <= 30; cx++) {
      for (let cz = -30; cz <= 30; cz++) {
        if (ruinPlanForChunk(seed, cx, cz, flatHeight)) count++;
      }
    }
    expect(count).toBeGreaterThan(0);
  });

  it("遺跡は常にチャンク内部に完結する (余白付きの範囲を超えない)", () => {
    for (let cx = -30; cx <= 30; cx++) {
      for (let cz = -30; cz <= 30; cz++) {
        const plan = ruinPlanForChunk(seed, cx, cz, flatHeight);
        if (!plan) continue;
        expect(plan.localOriginX).toBeGreaterThanOrEqual(0);
        expect(plan.localOriginZ).toBeGreaterThanOrEqual(0);
        expect(plan.localOriginX + plan.sizeX).toBeLessThanOrEqual(CHUNK_SIZE_X);
        expect(plan.localOriginZ + plan.sizeZ).toBeLessThanOrEqual(CHUNK_SIZE_Z);
      }
    }
  });

  it("stampRuinIfAny はチャンク高さの範囲外へ書き込まない", () => {
    for (let cx = -30; cx <= 30; cx++) {
      for (let cz = -30; cz <= 30; cz++) {
        const ids = new Uint8Array(BLOCKS_PER_CHUNK);
        expect(() => stampRuinIfAny(ids, seed, cx, cz, CHUNK_HEIGHT, flatHeight)).not.toThrow();
      }
    }
  });

  it("遺跡があるチャンクをスタンプすると、既存ブロックの一部が遺跡素材に置き換わる", () => {
    let stampedSomewhere = false;
    const STONE_BRICK = getBlockDefByKey("stone_brick").id;
    const COBBLESTONE = getBlockDefByKey("cobblestone").id;
    const MOSSY_STONE = getBlockDefByKey("mossy_stone").id;
    for (let cx = -30; cx <= 30 && !stampedSomewhere; cx++) {
      for (let cz = -30; cz <= 30 && !stampedSomewhere; cz++) {
        const plan = ruinPlanForChunk(seed, cx, cz, flatHeight);
        if (!plan) continue;
        const ids = new Uint8Array(BLOCKS_PER_CHUNK);
        stampRuinIfAny(ids, seed, cx, cz, CHUNK_HEIGHT, flatHeight);
        for (let lx = plan.localOriginX; lx < plan.localOriginX + plan.sizeX && !stampedSomewhere; lx++) {
          for (let lz = plan.localOriginZ; lz < plan.localOriginZ + plan.sizeZ && !stampedSomewhere; lz++) {
            for (let ly = plan.baseY; ly < plan.baseY + plan.height && !stampedSomewhere; ly++) {
              const id = ids[localIndex(lx, ly, lz)];
              if (id === STONE_BRICK || id === COBBLESTONE || id === MOSSY_STONE) stampedSomewhere = true;
            }
          }
        }
      }
    }
    expect(stampedSomewhere).toBe(true);
  });

  it("遺跡の部屋中央の床には宝箱(chest)が配置される", () => {
    const CHEST = getBlockDefByKey("chest").id;
    let foundChest = false;
    for (let cx = -30; cx <= 30 && !foundChest; cx++) {
      for (let cz = -30; cz <= 30 && !foundChest; cz++) {
        const plan = ruinPlanForChunk(seed, cx, cz, flatHeight);
        if (!plan) continue;
        const ids = new Uint8Array(BLOCKS_PER_CHUNK);
        stampRuinIfAny(ids, seed, cx, cz, CHUNK_HEIGHT, flatHeight);
        const centerLx = plan.localOriginX + Math.floor(plan.sizeX / 2);
        const centerLz = plan.localOriginZ + Math.floor(plan.sizeZ / 2);
        if (ids[localIndex(centerLx, plan.baseY, centerLz)] === CHEST) foundChest = true;
      }
    }
    expect(foundChest).toBe(true);
  });

  it("旧v2地形向け生成では遺跡中央の黄金ブロックを維持する", () => {
    const GOLD = getBlockDefByKey("gold").id;
    let foundGold = false;
    for (let cx = -30; cx <= 30 && !foundGold; cx++) {
      for (let cz = -30; cz <= 30 && !foundGold; cz++) {
        const plan = ruinPlanForChunk(seed, cx, cz, flatHeight);
        if (!plan) continue;
        const ids = new Uint8Array(BLOCKS_PER_CHUNK);
        stampRuinIfAny(ids, seed, cx, cz, CHUNK_HEIGHT, flatHeight, false);
        const centerLx = plan.localOriginX + Math.floor(plan.sizeX / 2);
        const centerLz = plan.localOriginZ + Math.floor(plan.sizeZ / 2);
        foundGold = ids[localIndex(centerLx, plan.baseY, centerLz)] === GOLD;
      }
    }
    expect(foundGold).toBe(true);
  });
});

describe("isGeneratedRuinChestAt", () => {
  const seed = hashStringToInt("underground-ruin");
  const flatHeight = (_lx: number, _lz: number) => SURFACE;
  const terrainHeightAtWorld = (_wx: number, _wz: number) => SURFACE;

  it("決定論的: 同じ座標なら常に同じ結果", () => {
    for (let x = -60; x <= 60; x += 3) {
      for (let z = -60; z <= 60; z += 3) {
        for (let y = 10; y <= 40; y += 5) {
          expect(isGeneratedRuinChestAt(seed, x, y, z, terrainHeightAtWorld)).toBe(
            isGeneratedRuinChestAt(seed, x, y, z, terrainHeightAtWorld)
          );
        }
      }
    }
  });

  it("stampRuinIfAnyが宝箱を置く座標とisGeneratedRuinChestAtが一致する", () => {
    const CHEST = getBlockDefByKey("chest").id;
    let checkedAny = false;
    for (let cx = -20; cx <= 20; cx++) {
      for (let cz = -20; cz <= 20; cz++) {
        const plan = ruinPlanForChunk(seed, cx, cz, flatHeight);
        if (!plan) continue;
        const ids = new Uint8Array(BLOCKS_PER_CHUNK);
        stampRuinIfAny(ids, seed, cx, cz, CHUNK_HEIGHT, flatHeight);
        for (let lx = plan.localOriginX; lx < plan.localOriginX + plan.sizeX; lx++) {
          for (let lz = plan.localOriginZ; lz < plan.localOriginZ + plan.sizeZ; lz++) {
            for (let ly = plan.baseY; ly < plan.baseY + plan.height; ly++) {
              const worldX = cx * CHUNK_SIZE_X + lx;
              const worldZ = cz * CHUNK_SIZE_Z + lz;
              const isChestBlock = ids[localIndex(lx, ly, lz)] === CHEST;
              const predicate = isGeneratedRuinChestAt(seed, worldX, ly, worldZ, terrainHeightAtWorld);
              expect(predicate).toBe(isChestBlock);
              checkedAny = checkedAny || isChestBlock;
            }
          }
        }
      }
    }
    expect(checkedAny).toBe(true);
  });

  it("遺跡の存在しないチャンク座標では常にfalseを返す", () => {
    for (let cx = -20; cx <= 20; cx++) {
      for (let cz = -20; cz <= 20; cz++) {
        if (ruinPlanForChunk(seed, cx, cz, flatHeight)) continue;
        const worldX = cx * CHUNK_SIZE_X + 5;
        const worldZ = cz * CHUNK_SIZE_Z + 5;
        for (let y = 10; y <= 35; y += 5) {
          expect(isGeneratedRuinChestAt(seed, worldX, y, worldZ, terrainHeightAtWorld)).toBe(false);
        }
      }
    }
  });

  it("チャンク境界をまたぐ負の座標でも一貫して動作する", () => {
    const cx = worldToChunkCoord(-5);
    expect(cx).toBeLessThan(0);
    expect(() => isGeneratedRuinChestAt(seed, -5, 20, -5, terrainHeightAtWorld)).not.toThrow();
  });
});
