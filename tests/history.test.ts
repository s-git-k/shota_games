import { describe, expect, it } from "vitest";
import { World } from "../src/core/world";
import { History, MAX_HISTORY, type BlockChange } from "../src/core/history";
import { getBlockDefByKey, AIR_ID } from "../src/core/blocks";
import { hashStringToInt } from "../src/core/rng";

const STONE = getBlockDefByKey("stone").id;
const GLASS = getBlockDefByKey("glass").id;
// 地形高さの上限より確実に高いYを使い、常に空気から始まる状態でテストする
const Y = 55;

function place(world: World, x: number, y: number, z: number, id: number): BlockChange {
  const res = world.setBlock(x, y, z, id);
  return {
    x,
    y,
    z,
    prevId: res.prevId,
    prevFacing: res.prevFacing,
    prevOpen: res.prevOpen,
    newId: id,
    newFacing: 0,
    newOpen: false
  };
}

describe("History", () => {
  it("undoで直前の設置を取り消せる", () => {
    const world = new World(hashStringToInt("h1"), "h1");
    const history = new History();
    const change = place(world, 0, Y, 0, STONE);
    history.push({ changes: [change] });

    expect(world.getBlockId(0, Y, 0)).toBe(STONE);
    history.undo(world);
    expect(world.getBlockId(0, Y, 0)).toBe(AIR_ID);
  });

  it("redoでundoした操作をやり直せる", () => {
    const world = new World(hashStringToInt("h2"), "h2");
    const history = new History();
    const change = place(world, 1, Y, 1, STONE);
    history.push({ changes: [change] });

    history.undo(world);
    expect(world.getBlockId(1, Y, 1)).toBe(AIR_ID);
    history.redo(world);
    expect(world.getBlockId(1, Y, 1)).toBe(STONE);
  });

  it("新しい操作を積むとredoスタックはクリアされる", () => {
    const world = new World(hashStringToInt("h3"), "h3");
    const history = new History();
    history.push({ changes: [place(world, 0, Y, 0, STONE)] });
    history.undo(world);
    expect(history.canRedo()).toBe(true);

    history.push({ changes: [place(world, 1, Y, 0, GLASS)] });
    expect(history.canRedo()).toBe(false);
  });

  it("最大100件を超えると古い履歴から破棄される", () => {
    const world = new World(hashStringToInt("h4"), "h4");
    const history = new History(MAX_HISTORY);
    for (let i = 0; i < 150; i++) {
      history.push({ changes: [place(world, i, Y, 0, STONE)] });
    }
    expect(history.undoCount).toBe(MAX_HISTORY);
    // 直近の操作は取り消せる
    expect(world.getBlockId(149, Y, 0)).toBe(STONE);
    history.undo(world);
    expect(world.getBlockId(149, Y, 0)).toBe(AIR_ID);
  });

  it("空の変更セットはpushしても履歴に積まれない", () => {
    const history = new History();
    history.push({ changes: [] });
    expect(history.canUndo()).toBe(false);
  });

  it("複数ブロックの一括操作 (ペースト相当) を1回のundoでまとめて戻せる", () => {
    const world = new World(hashStringToInt("h5"), "h5");
    const history = new History();
    const changes = [
      place(world, 0, Y, 0, STONE),
      place(world, 1, Y, 0, STONE),
      place(world, 2, Y, 0, GLASS)
    ];
    history.push({ changes });

    history.undo(world);
    expect(world.getBlockId(0, Y, 0)).toBe(AIR_ID);
    expect(world.getBlockId(1, Y, 0)).toBe(AIR_ID);
    expect(world.getBlockId(2, Y, 0)).toBe(AIR_ID);
  });
});
