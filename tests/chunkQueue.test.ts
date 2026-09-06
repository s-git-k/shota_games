import { describe, expect, it } from "vitest";
import {
  chunkCoordsInRadiusNearestFirst,
  chunkDistSq,
  sortByDistanceAscending,
  takeBudget,
  type ChunkCoord
} from "../src/core/chunkQueue";

describe("chunkDistSq", () => {
  it("中心からの距離の二乗を返す", () => {
    expect(chunkDistSq({ cx: 3, cz: 4 }, { cx: 0, cz: 0 })).toBe(25);
    expect(chunkDistSq({ cx: 0, cz: 0 }, { cx: 0, cz: 0 })).toBe(0);
  });
});

describe("sortByDistanceAscending", () => {
  it("中心に近い順に並べ替える", () => {
    const coords: ChunkCoord[] = [
      { cx: 5, cz: 0 },
      { cx: 1, cz: 0 },
      { cx: 3, cz: 0 }
    ];
    const sorted = sortByDistanceAscending(coords, { cx: 0, cz: 0 });
    expect(sorted).toEqual([
      { cx: 1, cz: 0 },
      { cx: 3, cz: 0 },
      { cx: 5, cz: 0 }
    ]);
  });

  it("元の配列を変更しない", () => {
    const coords: ChunkCoord[] = [
      { cx: 5, cz: 0 },
      { cx: 1, cz: 0 }
    ];
    const copy = coords.map((c) => ({ ...c }));
    sortByDistanceAscending(coords, { cx: 0, cz: 0 });
    expect(coords).toEqual(copy);
  });

  it("距離が等しい場合でも全要素を保持する (順序は安定でなくてよいが件数は変わらない)", () => {
    const coords: ChunkCoord[] = [
      { cx: 1, cz: 0 },
      { cx: -1, cz: 0 },
      { cx: 0, cz: 1 },
      { cx: 0, cz: -1 }
    ];
    const sorted = sortByDistanceAscending(coords, { cx: 0, cz: 0 });
    expect(sorted).toHaveLength(4);
  });
});

describe("chunkCoordsInRadiusNearestFirst", () => {
  it("中心チャンク自身を含む", () => {
    const coords = chunkCoordsInRadiusNearestFirst({ cx: 2, cz: 2 }, 3);
    expect(coords[0]).toEqual({ cx: 2, cz: 2 });
  });

  it("中心に近い順に並んでいる (距離の二乗が非減少)", () => {
    const center = { cx: 0, cz: 0 };
    const coords = chunkCoordsInRadiusNearestFirst(center, 4);
    for (let i = 1; i < coords.length; i++) {
      const cur = coords[i];
      const prev = coords[i - 1];
      if (!cur || !prev) continue;
      expect(chunkDistSq(cur, center)).toBeGreaterThanOrEqual(chunkDistSq(prev, center));
    }
  });

  it("半径の外側にあるチャンクを含まない (円形判定)", () => {
    const center = { cx: 0, cz: 0 };
    const radius = 3;
    const coords = chunkCoordsInRadiusNearestFirst(center, radius);
    for (const c of coords) {
      expect(chunkDistSq(c, center)).toBeLessThanOrEqual(radius * radius);
    }
    // 円の外側にある座標が含まれていないことも確認する
    expect(coords.some((c) => c.cx === radius + 1 && c.cz === 0)).toBe(false);
  });

  it("半径0のときは中心チャンクだけを返す", () => {
    const coords = chunkCoordsInRadiusNearestFirst({ cx: 5, cz: -5 }, 0);
    expect(coords).toEqual([{ cx: 5, cz: -5 }]);
  });
});

describe("takeBudget", () => {
  it("先頭からmax件だけを切り出す", () => {
    expect(takeBudget([1, 2, 3, 4, 5], 2)).toEqual([1, 2]);
  });

  it("maxが配列より大きい場合は全件を返す", () => {
    expect(takeBudget([1, 2], 10)).toEqual([1, 2]);
  });

  it("maxが0の場合は空配列を返す", () => {
    expect(takeBudget([1, 2, 3], 0)).toEqual([]);
  });

  it("maxが負数の場合も空配列を返す", () => {
    expect(takeBudget([1, 2, 3], -1)).toEqual([]);
  });

  it("元の配列を変更しない", () => {
    const items = [1, 2, 3];
    const copy = [...items];
    takeBudget(items, 1);
    expect(items).toEqual(copy);
  });
});
