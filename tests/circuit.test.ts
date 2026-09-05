import { describe, expect, it } from "vitest";
import { World } from "../src/core/world";
import { getBlockDefByKey, AIR_ID } from "../src/core/blocks";
import { hashStringToInt } from "../src/core/rng";
import { isCircuitBlock, recomputeCircuitNear } from "../src/core/circuit";

const SWITCH = getBlockDefByKey("switch").id;
const WIRE = getBlockDefByKey("wire").id;
const LAMP = getBlockDefByKey("lamp").id;
const DOOR = getBlockDefByKey("door").id;
const STONE = getBlockDefByKey("stone").id;
// 地形高さの上限より確実に高いYを使う (常に空気から始まる状態でテストするため)
const Y = 55;

function freshWorld(name: string): World {
  return new World(hashStringToInt(name), name);
}

describe("circuit", () => {
  it("isCircuitBlock は回路パーツのみtrueを返す", () => {
    expect(isCircuitBlock(SWITCH)).toBe(true);
    expect(isCircuitBlock(WIRE)).toBe(true);
    expect(isCircuitBlock(LAMP)).toBe(true);
    expect(isCircuitBlock(DOOR)).toBe(true);
  });

  it("isCircuitBlock はブロック/空気に対してfalseを返す", () => {
    expect(isCircuitBlock(STONE)).toBe(false);
    expect(isCircuitBlock(AIR_ID)).toBe(false);
  });

  it("スイッチをONにすると隣接する導線とランプが通電する", () => {
    const world = freshWorld("circuit1");
    world.setBlock(0, Y, 0, SWITCH, 0, false);
    world.setBlock(1, Y, 0, WIRE, 0, false);
    world.setBlock(2, Y, 0, LAMP, 0, false);

    // スイッチをON (open=true) にする
    world.setBlock(0, Y, 0, SWITCH, 0, true);
    const update = recomputeCircuitNear(world, { x: 0, y: Y, z: 0 });

    expect(world.isBlockOpen(1, Y, 0)).toBe(true); // 導線が通電
    expect(world.isBlockOpen(2, Y, 0)).toBe(true); // ランプが点灯
    expect(update.changed.length).toBeGreaterThan(0);
  });

  it("スイッチをOFFにすると通電が止まる", () => {
    const world = freshWorld("circuit2");
    world.setBlock(0, Y, 0, SWITCH, 0, true);
    world.setBlock(1, Y, 0, WIRE, 0, false);
    world.setBlock(2, Y, 0, LAMP, 0, false);
    recomputeCircuitNear(world, { x: 0, y: Y, z: 0 });
    expect(world.isBlockOpen(2, Y, 0)).toBe(true);

    world.setBlock(0, Y, 0, SWITCH, 0, false);
    recomputeCircuitNear(world, { x: 0, y: Y, z: 0 });
    expect(world.isBlockOpen(1, Y, 0)).toBe(false);
    expect(world.isBlockOpen(2, Y, 0)).toBe(false);
  });

  it("導線で繋がっていないランプは点灯しない", () => {
    const world = freshWorld("circuit3");
    world.setBlock(0, Y, 0, SWITCH, 0, true);
    world.setBlock(5, Y, 5, LAMP, 0, false); // 離れている (未接続)
    recomputeCircuitNear(world, { x: 0, y: Y, z: 0 });
    expect(world.isBlockOpen(5, Y, 5)).toBe(false);
  });

  it("導線に接続されたドアは電源で開閉する", () => {
    const world = freshWorld("circuit4");
    world.setBlock(0, Y, 0, SWITCH, 0, false);
    world.setBlock(1, Y, 0, WIRE, 0, false);
    world.setBlock(2, Y, 0, DOOR, 0, false);
    expect(world.isBlockOpen(2, Y, 0)).toBe(false);

    world.setBlock(0, Y, 0, SWITCH, 0, true);
    recomputeCircuitNear(world, { x: 0, y: Y, z: 0 });
    expect(world.isBlockOpen(2, Y, 0)).toBe(true);

    world.setBlock(0, Y, 0, SWITCH, 0, false);
    recomputeCircuitNear(world, { x: 0, y: Y, z: 0 });
    expect(world.isBlockOpen(2, Y, 0)).toBe(false);
  });

  it("導線/スイッチに繋がっていない孤立したドアは、手動トグルの状態を回路計算で上書きされない", () => {
    const world = freshWorld("circuit5");
    world.setBlock(10, Y, 10, DOOR, 0, false);
    // プレイヤーが手動でドアを開ける想定
    world.setBlock(10, Y, 10, DOOR, 0, true);
    expect(world.isBlockOpen(10, Y, 10)).toBe(true);

    recomputeCircuitNear(world, { x: 10, y: Y, z: 10 });
    // 回路に接続されていないので、手動で開けた状態が保持されるべき
    expect(world.isBlockOpen(10, Y, 10)).toBe(true);
  });

  it("長い導線チェーンでも通電が伝搬する (境界のあるBFS)", () => {
    const world = freshWorld("circuit6");
    world.setBlock(0, Y, 0, SWITCH, 0, true);
    for (let i = 1; i <= 10; i++) {
      world.setBlock(i, Y, 0, WIRE, 0, false);
    }
    world.setBlock(11, Y, 0, LAMP, 0, false);
    recomputeCircuitNear(world, { x: 0, y: Y, z: 0 });
    expect(world.isBlockOpen(11, Y, 0)).toBe(true);
  });
});
