import { describe, expect, it } from "vitest";
import { World } from "../src/core/world";
import { getBlockDefByKey, AIR_ID } from "../src/core/blocks";
import { hashStringToInt } from "../src/core/rng";
import type { Facing } from "../src/core/types";
import {
  Selection,
  SelectionTooLargeError,
  boundsFromPoints,
  boundsVolume,
  copySelection,
  mirrorClipboardX,
  mirrorClipboardZ,
  mirrorFacingX,
  mirrorFacingZ,
  pasteClipboard,
  rotateClipboardY,
  rotateFacingCCW,
  rotateFacingCW
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

  it("ワールド上限外のセルは設置数やUndo履歴に含めない", () => {
    const world = new World(hashStringToInt("s-height"), "s-height");
    const changes = pasteClipboard(
      world,
      {
        sizeX: 1,
        sizeY: 1,
        sizeZ: 1,
        cells: [{ dx: 0, dy: 0, dz: 0, id: STONE, facing: 0, open: false }]
      },
      { x: 0, y: 64, z: 0 }
    );
    expect(changes).toEqual([]);
    expect(world.getBlockId(0, 64, 0)).toBe(AIR_ID);
  });
});

describe("facing の回転/反転ヘルパー", () => {
  it("rotateFacingCW/CCWは互いに逆変換になる", () => {
    for (let f = 0; f < 4; f++) {
      expect(rotateFacingCCW(rotateFacingCW(f as Facing))).toBe(f);
      expect(rotateFacingCW(rotateFacingCCW(f as Facing))).toBe(f);
    }
  });

  it("rotateFacingCWを4回適用すると元に戻る", () => {
    for (let f = 0; f < 4; f++) {
      let cur = f as Facing;
      for (let i = 0; i < 4; i++) cur = rotateFacingCW(cur);
      expect(cur).toBe(f);
    }
  });

  it("rotateFacingCW: 北(0)は時計回りで東(3)を向く", () => {
    expect(rotateFacingCW(0)).toBe(3);
    expect(rotateFacingCW(3)).toBe(2);
    expect(rotateFacingCW(2)).toBe(1);
    expect(rotateFacingCW(1)).toBe(0);
  });

  it("mirrorFacingX/Zは自身の逆変換になる (2回適用で元に戻る)", () => {
    for (let f = 0; f < 4; f++) {
      expect(mirrorFacingX(mirrorFacingX(f as Facing))).toBe(f);
      expect(mirrorFacingZ(mirrorFacingZ(f as Facing))).toBe(f);
    }
  });

  it("mirrorFacingX: 北(0)/南(2)は変わらず、東西(1,3)は入れ替わる", () => {
    expect(mirrorFacingX(0)).toBe(0);
    expect(mirrorFacingX(2)).toBe(2);
    expect(mirrorFacingX(1)).toBe(3);
    expect(mirrorFacingX(3)).toBe(1);
  });

  it("mirrorFacingZ: 東西(1,3)は変わらず、南北(0,2)は入れ替わる", () => {
    expect(mirrorFacingZ(1)).toBe(1);
    expect(mirrorFacingZ(3)).toBe(3);
    expect(mirrorFacingZ(0)).toBe(2);
    expect(mirrorFacingZ(2)).toBe(0);
  });
});

describe("rotateClipboardY", () => {
  it("サイズのXとZが入れ替わる", () => {
    const world = new World(hashStringToInt("rot1"), "rot1");
    world.setBlock(0, Y, 0, STONE);
    world.setBlock(2, Y, 0, GOLD);
    const bounds = boundsFromPoints({ x: 0, y: Y, z: 0 }, { x: 2, y: Y, z: 1 });
    const clip = copySelection(world, bounds); // sizeX=3, sizeY=1, sizeZ=2
    const rotated = rotateClipboardY(clip, "cw");
    expect(rotated.sizeX).toBe(2);
    expect(rotated.sizeZ).toBe(3);
    expect(rotated.sizeY).toBe(1);
  });

  it("4回連続で時計回りに回すと元の配置に戻る", () => {
    const world = new World(hashStringToInt("rot2"), "rot2");
    world.setBlock(0, Y, 0, STONE);
    world.setBlock(2, Y, 0, GOLD);
    world.setBlock(1, Y, 1, STONE);
    const doorId = getBlockDefByKey("door").id;
    world.setBlock(0, Y, 1, doorId, 2, false);

    const bounds = boundsFromPoints({ x: 0, y: Y, z: 0 }, { x: 2, y: Y, z: 1 });
    const original = copySelection(world, bounds);

    let cur = original;
    for (let i = 0; i < 4; i++) cur = rotateClipboardY(cur, "cw");
    expect(cur).toEqual(original);
  });

  it("時計回りと反時計回りは互いに逆変換になる", () => {
    const world = new World(hashStringToInt("rot3"), "rot3");
    world.setBlock(0, Y, 0, STONE);
    world.setBlock(2, Y, 0, GOLD);
    const doorId = getBlockDefByKey("door").id;
    world.setBlock(1, Y, 1, doorId, 1, true);

    const bounds = boundsFromPoints({ x: 0, y: Y, z: 0 }, { x: 2, y: Y, z: 1 });
    const original = copySelection(world, bounds);

    const roundTrip = rotateClipboardY(rotateClipboardY(original, "cw"), "ccw");
    expect(roundTrip).toEqual(original);
  });

  it("ドアのfacingを含め、cellの位置とfacingが整合して回転する", () => {
    const world = new World(hashStringToInt("rot4"), "rot4");
    const doorId = getBlockDefByKey("door").id;
    // 2x1x1 (X方向2マス) の範囲。原点(0,Y,0)に北(0)向きのドアを置く。
    world.setBlock(0, Y, 0, doorId, 0, false);
    const bounds = boundsFromPoints({ x: 0, y: Y, z: 0 }, { x: 1, y: Y, z: 0 });
    const clip = copySelection(world, bounds); // sizeX=2, sizeZ=1
    const rotated = rotateClipboardY(clip, "cw"); // sizeX=1, sizeZ=2

    const doorCell = rotated.cells.find((c) => c.id === doorId);
    expect(doorCell).toBeDefined();
    // dx=0,dz=0 -> cw変換で nx=sizeZ-1-dz=0, nz=dx=0
    expect(doorCell?.dx).toBe(0);
    expect(doorCell?.dz).toBe(0);
    // facing 0 (北) は時計回りで 3 (東) になる
    expect(doorCell?.facing).toBe(3);
  });

  it("回転してもセルの総数と各セルの内容(id/open)は保持される", () => {
    const world = new World(hashStringToInt("rot5"), "rot5");
    world.setBlock(0, Y, 0, STONE);
    world.setBlock(1, Y, 0, GOLD);
    world.setBlock(0, Y, 1, AIR_ID);
    const bounds = boundsFromPoints({ x: 0, y: Y, z: 0 }, { x: 1, y: Y, z: 1 });
    const clip = copySelection(world, bounds);
    const rotated = rotateClipboardY(clip, "cw");
    expect(rotated.cells.length).toBe(clip.cells.length);
    const ids = rotated.cells.map((c) => c.id).sort();
    expect(ids).toEqual(clip.cells.map((c) => c.id).sort());
  });
});

describe("mirrorClipboardX / mirrorClipboardZ", () => {
  it("mirrorClipboardXを2回適用すると元に戻る", () => {
    const world = new World(hashStringToInt("mx1"), "mx1");
    world.setBlock(0, Y, 0, STONE);
    world.setBlock(2, Y, 0, GOLD);
    const doorId = getBlockDefByKey("door").id;
    world.setBlock(1, Y, 1, doorId, 1, true);
    const bounds = boundsFromPoints({ x: 0, y: Y, z: 0 }, { x: 2, y: Y, z: 1 });
    const original = copySelection(world, bounds);

    const roundTrip = mirrorClipboardX(mirrorClipboardX(original));
    expect(roundTrip).toEqual(original);
  });

  it("mirrorClipboardZを2回適用すると元に戻る", () => {
    const world = new World(hashStringToInt("mz1"), "mz1");
    world.setBlock(0, Y, 0, STONE);
    world.setBlock(2, Y, 0, GOLD);
    const doorId = getBlockDefByKey("door").id;
    world.setBlock(1, Y, 1, doorId, 3, false);
    const bounds = boundsFromPoints({ x: 0, y: Y, z: 0 }, { x: 2, y: Y, z: 1 });
    const original = copySelection(world, bounds);

    const roundTrip = mirrorClipboardZ(mirrorClipboardZ(original));
    expect(roundTrip).toEqual(original);
  });

  it("mirrorClipboardXはサイズを変えず、東西向きのfacingを入れ替える", () => {
    const world = new World(hashStringToInt("mx2"), "mx2");
    const doorId = getBlockDefByKey("door").id;
    world.setBlock(0, Y, 0, doorId, 1, false); // 西向き
    const bounds = boundsFromPoints({ x: 0, y: Y, z: 0 }, { x: 1, y: Y, z: 0 });
    const clip = copySelection(world, bounds); // sizeX=2
    const mirrored = mirrorClipboardX(clip);
    expect(mirrored.sizeX).toBe(clip.sizeX);
    expect(mirrored.sizeZ).toBe(clip.sizeZ);
    const doorCell = mirrored.cells.find((c) => c.id === doorId);
    expect(doorCell?.dx).toBe(1); // sizeX-1-0 = 1
    expect(doorCell?.facing).toBe(3); // 西(1) -> 東(3)
  });

  it("mirrorClipboardZはサイズを変えず、南北向きのfacingを入れ替える", () => {
    const world = new World(hashStringToInt("mz2"), "mz2");
    const doorId = getBlockDefByKey("door").id;
    world.setBlock(0, Y, 0, doorId, 0, false); // 北向き
    const bounds = boundsFromPoints({ x: 0, y: Y, z: 0 }, { x: 0, y: Y, z: 1 });
    const clip = copySelection(world, bounds); // sizeZ=2
    const mirrored = mirrorClipboardZ(clip);
    const doorCell = mirrored.cells.find((c) => c.id === doorId);
    expect(doorCell?.dz).toBe(1); // sizeZ-1-0 = 1
    expect(doorCell?.facing).toBe(2); // 北(0) -> 南(2)
  });
});
