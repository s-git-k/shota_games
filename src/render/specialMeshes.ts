/**
 * 階段・柵・ドアなど「フルキューブではない」特殊ブロックの3Dメッシュ生成。
 * Phase1では代表的な実装とし、BlockDefinition の shape に応じて拡張しやすい構造にしている。
 */
import * as THREE from "three";
import { getBlockDef } from "../core/blocks";
import type { Facing } from "../core/types";
import type { SpecialBlockInstance } from "./chunkMesher";

const facingToYaw: Record<Facing, number> = {
  0: 0,
  1: Math.PI / 2,
  2: Math.PI,
  3: -Math.PI / 2
};

function materialFor(color: number, transparent = false): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.05, transparent, opacity: transparent ? 0.9 : 1 });
}

/** 階段: 下段は全面、上段は半分の奥行きのブロックを組み合わせた簡易形状。 */
function buildStairs(color: number, facing: Facing): THREE.Object3D {
  const group = new THREE.Group();
  const mat = materialFor(color);

  const lower = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1), mat);
  lower.position.set(0, -0.25, 0);
  group.add(lower);

  const upper = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 0.5), mat);
  upper.position.set(0, 0.25, -0.25);
  group.add(upper);

  group.rotation.y = facingToYaw[facing];

  const anchor = new THREE.Group();
  group.position.set(0.5, 0.5, 0.5);
  anchor.add(group);
  return anchor;
}

/** 柵: 中央の支柱と上下2段の横木で構成する簡易的な十字型フェンス。 */
function buildFence(color: number): THREE.Object3D {
  const group = new THREE.Group();
  const mat = materialFor(color);

  const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1, 0.2), mat);
  post.position.set(0.5, 0.5, 0.5);
  group.add(post);

  const railGeoX = new THREE.BoxGeometry(1, 0.15, 0.12);
  const railTop = new THREE.Mesh(railGeoX, mat);
  railTop.position.set(0.5, 0.75, 0.5);
  group.add(railTop);
  const railBottom = new THREE.Mesh(railGeoX, mat);
  railBottom.position.set(0.5, 0.4, 0.5);
  group.add(railBottom);

  const railGeoZ = new THREE.BoxGeometry(0.12, 0.15, 1);
  const railTopZ = new THREE.Mesh(railGeoZ, mat);
  railTopZ.position.set(0.5, 0.75, 0.5);
  group.add(railTopZ);
  const railBottomZ = new THREE.Mesh(railGeoZ, mat);
  railBottomZ.position.set(0.5, 0.4, 0.5);
  group.add(railBottomZ);

  return group;
}

/**
 * ドアはヒンジ (蝶番) を中心に回転させて開閉するため、
 * 蝶番位置をピボットにした Group 構造にしている。
 */
function buildDoor(color: number, facing: Facing, open: boolean): THREE.Object3D {
  const pivot = new THREE.Group();
  const mat = materialFor(color);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.12), mat);
  slab.position.set(0.45, 0.95, 0);
  pivot.add(slab);
  pivot.rotation.y = open ? Math.PI / 2 : 0;

  const anchor = new THREE.Group();
  anchor.add(pivot);
  anchor.rotation.y = facingToYaw[facing];
  // facingごとに蝶番 (ブロックの左手前の角) の位置を合わせる
  pivot.position.set(0, 0, 0);
  anchor.position.set(0, 0, 0);
  return anchor;
}

/** スイッチ: 台座 + レバー。ON(open=true)でレバーが起き上がり、色も明るくなる。 */
function buildSwitch(color: number, facing: Facing, on: boolean): THREE.Object3D {
  const group = new THREE.Group();
  const baseMat = materialFor(0x3a3a3f);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.22), baseMat);
  base.position.set(0.5, 0.06, 0.5);
  group.add(base);

  const leverMat = materialFor(on ? 0x4fe37a : color);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.08), leverMat);
  // ONのときは起き上がり (垂直気味)、OFFのときは寝かせる
  lever.rotation.z = on ? -0.15 : Math.PI / 2.3;
  lever.position.set(0.5, on ? 0.2 : 0.1, 0.5);
  group.add(lever);

  group.rotation.y = facingToYaw[facing];
  return group;
}

/** 導線: 床を這う細いケーブル。通電中 (open=true) は明るい色で発光的に見える。 */
function buildWire(color: number, powered: boolean): THREE.Object3D {
  const group = new THREE.Group();
  const mat = materialFor(powered ? 0xffe27a : color);
  if (powered) {
    (mat as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x996a10);
    (mat as THREE.MeshStandardMaterial).emissiveIntensity = 0.6;
  }
  const strand = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.16), mat);
  strand.position.set(0.5, 0.06, 0.5);
  group.add(strand);
  const strandZ = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.9), mat);
  strandZ.position.set(0.5, 0.06, 0.5);
  group.add(strandZ);
  return group;
}

/** ランプ: 通電中 (open=true) は明るく発光し、消灯中はくすんだガラス玉になる。 */
function buildLamp(color: number, lit: boolean): THREE.Object3D {
  const group = new THREE.Group();
  const housingMat = materialFor(0x5a5a62);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.4), housingMat);
  housing.position.set(0.5, 0.94, 0.5);
  group.add(housing);

  const bulbMat = new THREE.MeshStandardMaterial({
    color: lit ? color : 0x6b6b6b,
    roughness: 0.4,
    metalness: 0,
    emissive: lit ? new THREE.Color(color) : new THREE.Color(0x000000),
    emissiveIntensity: lit ? 1.1 : 0,
    transparent: true,
    opacity: lit ? 0.95 : 0.6
  });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), bulbMat);
  bulb.position.set(0.5, 0.68, 0.5);
  group.add(bulb);

  if (lit) {
    const light = new THREE.PointLight(color, 0.9, 6, 2);
    light.position.set(0.5, 0.68, 0.5);
    group.add(light);
  }
  return group;
}

/** ベッド: マットレス + 枕の簡易形状。復活地点の目印になる。 */
function buildBed(color: number, facing: Facing): THREE.Object3D {
  const group = new THREE.Group();
  const mattressMat = materialFor(color);
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 1.8), mattressMat);
  mattress.position.set(0.5, 0.22, 0.5);
  group.add(mattress);

  const pillowMat = materialFor(0xf3f3f3);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.3), pillowMat);
  pillow.position.set(0.5, 0.34, -0.75);
  group.add(pillow);

  const legMat = materialFor(0x6b4a30);
  const legGeo = new THREE.BoxGeometry(0.1, 0.22, 0.1);
  for (const [dx, dz] of [
    [0.1, 0.85],
    [0.9, 0.85],
    [0.1, -0.85],
    [0.9, -0.85]
  ] as const) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(dx, 0.11, dz);
    group.add(leg);
  }

  group.rotation.y = facingToYaw[facing];
  return group;
}

/**
 * 宝箱: 台座(下半分) + 蓋(上半分)。蓋は背面(facingの逆側)を蝶番にして開閉する。
 * open=true で蓋が持ち上がり、中身が見える演出になる (Phase 4: 遺跡の宝箱/クラフト家具共通)。
 */
function buildChest(color: number, facing: Facing, open: boolean): THREE.Object3D {
  const group = new THREE.Group();
  const woodMat = materialFor(color);
  const metalMat = materialFor(0xd8b25a);

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 0.75), woodMat);
  base.position.set(0, -0.25, 0);
  group.add(base);

  // 蓋の蝶番 (奥/背面側の上端)。facing方向の正面 (-z寄り) に対して背面 (+z寄り) に置く。
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0, 0.375);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.28, 0.75), woodMat);
  lid.position.set(0, 0.14, -0.375);
  lidPivot.add(lid);
  // 開くと蝶番を軸に約100度持ち上がる (箱の蓋が後方へ倒れ込むイメージ)
  lidPivot.rotation.x = open ? (100 * Math.PI) / 180 : 0;
  group.add(lidPivot);

  const latch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.06), metalMat);
  latch.position.set(0, -0.05, -0.39);
  group.add(latch);

  group.rotation.y = facingToYaw[facing];

  const anchor = new THREE.Group();
  group.position.set(0.5, 0.5, 0.5);
  anchor.add(group);
  return anchor;
}

/** テーブル: 天板 + 4本脚のシンプルな家具。 */
function buildTable(color: number, facing: Facing): THREE.Object3D {
  const group = new THREE.Group();
  const mat = materialFor(color);

  const top = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.9), mat);
  top.position.set(0, 0.06, 0);
  group.add(top);

  const legMat = materialFor(0x6b4a30);
  const legGeo = new THREE.BoxGeometry(0.1, 0.62, 0.1);
  for (const [dx, dz] of [
    [0.35, 0.35],
    [-0.35, 0.35],
    [0.35, -0.35],
    [-0.35, -0.35]
  ] as const) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(dx, -0.31, dz);
    group.add(leg);
  }

  group.rotation.y = facingToYaw[facing];

  const anchor = new THREE.Group();
  group.position.set(0.5, 0.5, 0.5);
  anchor.add(group);
  return anchor;
}

/** いす: 座面 + 背もたれ (facingの背面側) + 4本脚のシンプルな家具。 */
function buildChair(color: number, facing: Facing): THREE.Object3D {
  const group = new THREE.Group();
  const mat = materialFor(color);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.55), mat);
  seat.position.set(0, -0.05, 0);
  group.add(seat);

  const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.08), mat);
  back.position.set(0, 0.25, 0.24);
  group.add(back);

  const legMat = materialFor(0x6b4a30);
  const legGeo = new THREE.BoxGeometry(0.07, 0.4, 0.07);
  for (const [dx, dz] of [
    [0.22, 0.22],
    [-0.22, 0.22],
    [0.22, -0.22],
    [-0.22, -0.22]
  ] as const) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(dx, -0.3, dz);
    group.add(leg);
  }

  group.rotation.y = facingToYaw[facing];

  const anchor = new THREE.Group();
  group.position.set(0.5, 0.5, 0.5);
  anchor.add(group);
  return anchor;
}

export function buildSpecialBlockMesh(instance: SpecialBlockInstance): THREE.Object3D {
  const def = getBlockDef(instance.blockId);
  let obj: THREE.Object3D;
  switch (def.shape) {
    case "stairs":
      obj = buildStairs(def.color, instance.facing);
      break;
    case "fence":
      obj = buildFence(def.color);
      break;
    case "door":
      obj = buildDoor(def.color, instance.facing, instance.open);
      break;
    case "switch":
      obj = buildSwitch(def.color, instance.facing, instance.open);
      break;
    case "wire":
      obj = buildWire(def.color, instance.open);
      break;
    case "lamp":
      obj = buildLamp(def.color, instance.open);
      break;
    case "bed":
      obj = buildBed(def.color, instance.facing);
      break;
    case "chest":
      obj = buildChest(def.color, instance.facing, instance.open);
      break;
    case "table":
      obj = buildTable(def.color, instance.facing);
      break;
    case "chair":
      obj = buildChair(def.color, instance.facing);
      break;
    default:
      obj = buildFence(def.color);
      break;
  }
  obj.position.set(instance.x, instance.y, instance.z);
  obj.userData.blockInstance = instance;
  return obj;
}
