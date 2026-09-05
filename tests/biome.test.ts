import { describe, expect, it } from "vitest";
import { hashStringToInt } from "../src/core/rng";
import {
  BIOMES,
  BIOME_LABELS_JA,
  findNearestLandPosition,
  getBiomeAt,
  macroElevation,
  treeChanceForBiome,
  usesBirchTree,
  type Biome
} from "../src/core/biome";

describe("getBiomeAt", () => {
  it("同じシード・座標では常に同じバイオームを返す (決定論的)", () => {
    const seed = hashStringToInt("biome-seed-a");
    expect(getBiomeAt(seed, 123, -456)).toBe(getBiomeAt(seed, 123, -456));
  });

  it("必ず6種類のいずれかを返す", () => {
    const seed = hashStringToInt("biome-seed-b");
    for (let x = -400; x <= 400; x += 37) {
      for (let z = -400; z <= 400; z += 41) {
        expect(BIOMES).toContain(getBiomeAt(seed, x, z));
      }
    }
  });

  it("十分広い範囲をサンプリングすると6種類全てが出現する", () => {
    const seed = hashStringToInt("biome-distribution");
    const seen = new Set<Biome>();
    for (let x = -2000; x <= 2000; x += 23) {
      for (let z = -2000; z <= 2000; z += 29) {
        seen.add(getBiomeAt(seed, x, z));
        if (seen.size === BIOMES.length) break;
      }
    }
    expect(seen.size).toBe(BIOMES.length);
  });

  it("バイオームの領域は広く、隣接ブロックが市松模様のように毎回切り替わったりしない", () => {
    const seed = hashStringToInt("biome-smoothness");
    let sameAsNeighborCount = 0;
    let total = 0;
    for (let x = -300; x <= 300; x += 5) {
      for (let z = -300; z <= 300; z += 5) {
        const here = getBiomeAt(seed, x, z);
        const right = getBiomeAt(seed, x + 1, z);
        total++;
        if (here === right) sameAsNeighborCount++;
      }
    }
    // 市松模様なら隣接一致率は極端に低くなるはず。広域バイオームなら大多数は隣接一致する。
    expect(sameAsNeighborCount / total).toBeGreaterThan(0.9);
  });

  it("異なるシードでは (少なくともどこかで) 異なるバイオーム配置になる", () => {
    const seedA = hashStringToInt("biome-world-alpha");
    const seedB = hashStringToInt("biome-world-beta");
    let differs = false;
    for (let x = -500; x <= 500; x += 13) {
      if (getBiomeAt(seedA, x, 7) !== getBiomeAt(seedB, x, 7)) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });

  it("標高が低いほど海、高いほど山地になりやすい", () => {
    const seed = hashStringToInt("biome-elevation-check");
    let oceanCount = 0;
    let mountainCount = 0;
    let total = 0;
    for (let x = -1000; x <= 1000; x += 17) {
      for (let z = -1000; z <= 1000; z += 19) {
        const elevation = macroElevation(seed, x, z);
        const biome = getBiomeAt(seed, x, z);
        total++;
        if (elevation < 0.32) {
          oceanCount++;
          expect(biome).toBe("ocean");
        }
        if (elevation > 0.78) {
          mountainCount++;
          expect(biome).toBe("mountain");
        }
      }
    }
    expect(oceanCount).toBeGreaterThan(0);
    expect(mountainCount).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(0);
  });
});

describe("BIOME_LABELS_JA", () => {
  it("全バイオームに日本語ラベルがある", () => {
    for (const biome of BIOMES) {
      expect(BIOME_LABELS_JA[biome]).toBeTruthy();
    }
  });

  describe("findNearestLandPosition", () => {
    it("海バイオームから開始しても決定論的に陸地を返す", () => {
      let oceanSeed: number | undefined;
      for (let seed = 1; seed <= 10_000; seed++) {
        if (getBiomeAt(seed, 0, 0) === "ocean") {
          oceanSeed = seed;
          break;
        }
      }
      expect(oceanSeed).toBeDefined();
      const first = findNearestLandPosition(oceanSeed ?? 1);
      const second = findNearestLandPosition(oceanSeed ?? 1);
      expect(first).toEqual(second);
      expect(getBiomeAt(oceanSeed ?? 1, first.x, first.z)).not.toBe("ocean");
    });
  });
});

describe("treeChanceForBiome / usesBirchTree", () => {
  it("森林は草原よりも木が生えやすい", () => {
    expect(treeChanceForBiome("forest")).toBeGreaterThan(treeChanceForBiome("grassland"));
  });

  it("砂漠・山地・海には木が生えない", () => {
    expect(treeChanceForBiome("desert")).toBe(0);
    expect(treeChanceForBiome("mountain")).toBe(0);
    expect(treeChanceForBiome("ocean")).toBe(0);
  });

  it("雪原のみ白樺を使う", () => {
    expect(usesBirchTree("snowfield")).toBe(true);
    expect(usesBirchTree("forest")).toBe(false);
  });
});
