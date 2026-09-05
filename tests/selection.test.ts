import { describe, expect, it } from "vitest";
import { World } from "../src/core/world";
import { getBlockDefByKey, AIR_ID } from "../src/core/blocks";
import { hashStringToInt } from "../src/core/rng";
import {
  Selection,
  SelectionTooLargeError,
  boundsFromPoints,
  boundsVolume,
  copySelection,
  pasteClipboard
} from "../src/core/selection";

const STONE = getBlockDefByKey("stone").id;
const GOLD = getBlockDefByKey("gold").id;
// 地形高さの上限より確実に高いYを使い、常に空気から始まる状態でテストする
const Y = 55;

describe("Selection", () => {
  it("begin/updateで範囲が正規化される (min<=max)", () => {
    const sel = new Selection();
    sel.begin({ x: 5, y: Y, z: 5 });
    sel.update({ x: 2, y: Y + 2, z: 8 });
    const bounds = sel.getBounds();
    expect(bounds).toEqual({ min: { x: 2, y: Y, z: 5 }, max: { x: 5, y: Y + 2, z: 8 } });
  });

  it("clearでリセットされる", () => {
    const sel = new Selection();
    sel.begin({ x: 0, y: 0, z: 0 });
    sel.clear();
    expect(sel.getBounds()).toBeNull();
  });

  it("boundsVolumeは直方体の体積を返す", () => {
    const b = boundsFromPoints({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
    expect(boundsVolume(b)).toBe(8);
  });
});

describe("copySelection / pasteClipboard", () => {
  it("コピーした内容を別の場所に貼り付けられる", () => {
    const world = new World(hashStringToInt("s1"), "s1");
    world.setBlock(0, Y, 0, STONE);
    world.setBlock(1, Y, 0, GOLD);

    const bounds = boundsFromPoints({ x: 0, y: Y, z: 0 }, { x: 1, y: Y, z: 0 });
    const clip = copySelection(world, bounds);
    expect(clip.cells.length).toBe(2);

    pasteClipboard(world, clip, { x: 10, y: Y, z: 10 });
    expect(world.getBlockId(10, Y, 10)).toBe(STONE);
    expect(world.getBlockId(11, Y, 10)).toBe(GOLD);
    // 元の場所は変わらない
    expect(world.getBlockId(0, Y, 0)).toBe(STONE);
  });

  it("空気を含む範囲もそのままコピーされる (スタンプ的な貼り付け)", () => {
    const world = new World(hashStringToInt("s2"), "s2");
    world.setBlock(0, Y, 0, STONE);
    // (1,Y,0) は空気のまま

    const bounds = boundsFromPoints({ x: 0, y: Y, z: 0 }, { x: 1, y: Y, z: 0 });
    const clip = copySelection(world, bounds);

    world.setBlock(21, Y, 20, GOLD); // 貼り付け先を先に埋めておく
    pasteClipboard(world, clip, { x: 20, y: Y, z: 20 });
    expect(world.getBlockId(20, Y, 20)).toBe(STONE);
    expect(world.getBlockId(21, Y, 20)).toBe(AIR_ID); // 空気で上書きされる
  });

  it("大きすぎる範囲はSelectionTooLargeErrorを投げる", () => {
    const world = new World(hashStringToInt("s3"), "s3");
    const bounds = boundsFromPoints({ x: 0, y: 0, z: 0 }, { x: 100, y: 63, z: 100 });
    expect(() => copySelection(world, bounds)).toThrow(SelectionTooLargeError);
  });

  it("pasteは変更のあったセルのみBlockChangeとして返す (undo用)", () => {
    const world = new World(hashStringToInt("s4"), "s4");
    world.setBlock(0, Y, 0, STONE);
    const bounds = boundsFromPoints({ x: 0, y: Y, z: 0 }, { x: 0, y: Y, z: 0 });
    const clip = copySelection(world, bounds);

    world.setBlock(5, Y, 5, STONE); // 貼り付け先に既に同じ内容がある
    const changes = pasteClipboard(world, clip, { x: 5, y: Y, z: 5 });
    expect(changes.length).toBe(0);
  });
});
