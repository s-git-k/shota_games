/**
 * 生物のローポリ手続き生成メッシュ。
 * 種類ごとに視覚的に区別できる簡単なプリミティブ組み合わせを使い、
 * ノートPCでも軽快に動作するよう頂点数を抑えている。
 */
import * as THREE from "three";
import type { EntityKind } from "../core/entities";

export interface EntityVisual {
  root: THREE.Group;
  /** 簡易アニメーション用の可動パーツ (脚/羽など)。無ければ空配列。 */
  animatedParts: THREE.Object3D[];
}

function mat(color: number, opts?: { transparent?: boolean; opacity?: number }): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0.05,
    transparent: opts?.transparent ?? false,
    opacity: opts?.opacity ?? 1
  });
}

function buildSlime(): EntityVisual {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), mat(0x5be07a, { transparent: true, opacity: 0.85 }));
  body.scale.set(1, 0.75, 1);
  body.position.y = 0.32;
  root.add(body);
  const eyeMat = mat(0x1c2733);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), eyeMat);
    eye.position.set(side * 0.14, 0.4, 0.32);
    root.add(eye);
  }
  return { root, animatedParts: [body] };
}

function buildGoblin(): EntityVisual {
  const root = new THREE.Group();
  const skin = mat(0x6f9e52);
  const cloth = mat(0x5a4632);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.28), cloth);
  torso.position.y = 0.75;
  root.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skin);
  head.position.y = 1.12;
  root.add(head);
  const legGeo = new THREE.BoxGeometry(0.16, 0.5, 0.16);
  const leftLeg = new THREE.Mesh(legGeo, skin);
  leftLeg.position.set(0.11, 0.25, 0);
  const rightLeg = new THREE.Mesh(legGeo, skin);
  rightLeg.position.set(-0.11, 0.25, 0);
  root.add(leftLeg, rightLeg);
  const armGeo = new THREE.BoxGeometry(0.13, 0.42, 0.13);
  const leftArm = new THREE.Mesh(armGeo, skin);
  leftArm.position.set(0.28, 0.78, 0);
  const rightArm = new THREE.Mesh(armGeo, skin);
  rightArm.position.set(-0.28, 0.78, 0);
  root.add(leftArm, rightArm);
  return { root, animatedParts: [leftLeg, rightLeg, leftArm, rightArm] };
}

function buildBat(): EntityVisual {
  const root = new THREE.Group();
  const bodyMat = mat(0x3a3550);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), bodyMat);
  body.position.y = 0.5;
  root.add(body);
  const wingGeo = new THREE.BoxGeometry(0.32, 0.05, 0.18);
  const leftWing = new THREE.Mesh(wingGeo, bodyMat);
  leftWing.position.set(0.24, 0.5, 0);
  const rightWing = new THREE.Mesh(wingGeo, bodyMat);
  rightWing.position.set(-0.24, 0.5, 0);
  root.add(leftWing, rightWing);
  return { root, animatedParts: [leftWing, rightWing] };
}

function buildGhost(): EntityVisual {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 8, 1, true), mat(0xe8f2ff, { transparent: true, opacity: 0.55 }));
  body.position.y = 0.75;
  body.rotation.x = Math.PI;
  root.add(body);
  const eyeMat = mat(0x223344, { transparent: true, opacity: 0.9 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), eyeMat);
    eye.position.set(side * 0.12, 0.95, 0.25);
    root.add(eye);
  }
  return { root, animatedParts: [body] };
}

function buildRockGolem(): EntityVisual {
  const root = new THREE.Group();
  const stoneMat = mat(0x8d8d95);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.5), stoneMat);
  torso.position.y = 1.1;
  root.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), stoneMat);
  head.position.y = 1.7;
  root.add(head);
  const legGeo = new THREE.BoxGeometry(0.3, 0.7, 0.3);
  const leftLeg = new THREE.Mesh(legGeo, stoneMat);
  leftLeg.position.set(0.18, 0.35, 0);
  const rightLeg = new THREE.Mesh(legGeo, stoneMat);
  rightLeg.position.set(-0.18, 0.35, 0);
  root.add(leftLeg, rightLeg);
  return { root, animatedParts: [leftLeg, rightLeg] };
}

function buildSheep(): EntityVisual {
  const root = new THREE.Group();
  const wool = mat(0xf5f5f5);
  const skin = mat(0x3a3a3a);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.65), wool);
  body.position.y = 0.55;
  root.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), skin);
  head.position.set(0, 0.55, 0.4);
  root.add(head);
  const legGeo = new THREE.BoxGeometry(0.1, 0.32, 0.1);
  const legs: THREE.Mesh[] = [];
  for (const [dx, dz] of [[0.18, 0.22], [-0.18, 0.22], [0.18, -0.22], [-0.18, -0.22]] as const) {
    const leg = new THREE.Mesh(legGeo, skin);
    leg.position.set(dx, 0.16, dz);
    root.add(leg);
    legs.push(leg);
  }
  return { root, animatedParts: legs };
}

function buildCow(): EntityVisual {
  const root = new THREE.Group();
  const hide = mat(0xede0c8);
  const spots = mat(0x3a2a1e);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.9), hide);
  body.position.y = 0.65;
  root.add(body);
  const patch = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), spots);
  patch.position.set(0.1, 0.75, 0.1);
  root.add(patch);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.3), hide);
  head.position.set(0, 0.65, 0.55);
  root.add(head);
  const legGeo = new THREE.BoxGeometry(0.12, 0.4, 0.12);
  const legs: THREE.Mesh[] = [];
  for (const [dx, dz] of [[0.2, 0.3], [-0.2, 0.3], [0.2, -0.3], [-0.2, -0.3]] as const) {
    const leg = new THREE.Mesh(legGeo, spots);
    leg.position.set(dx, 0.2, dz);
    root.add(leg);
    legs.push(leg);
  }
  return { root, animatedParts: legs };
}

function buildChicken(): EntityVisual {
  const root = new THREE.Group();
  const white = mat(0xfdfdfd);
  const beak = mat(0xe0a33a);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.36), white);
  body.position.y = 0.3;
  root.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), white);
  head.position.set(0, 0.46, 0.2);
  root.add(head);
  const beakMesh = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), beak);
  beakMesh.rotation.x = Math.PI / 2;
  beakMesh.position.set(0, 0.46, 0.3);
  root.add(beakMesh);
  const legGeo = new THREE.BoxGeometry(0.05, 0.2, 0.05);
  const leftLeg = new THREE.Mesh(legGeo, beak);
  leftLeg.position.set(0.06, 0.1, 0);
  const rightLeg = new THREE.Mesh(legGeo, beak);
  rightLeg.position.set(-0.06, 0.1, 0);
  root.add(leftLeg, rightLeg);
  return { root, animatedParts: [leftLeg, rightLeg] };
}

function buildRabbit(): EntityVisual {
  const root = new THREE.Group();
  const fur = mat(0xc9a876);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.32), fur);
  body.position.y = 0.24;
  root.add(body);
  const earGeo = new THREE.BoxGeometry(0.06, 0.22, 0.06);
  const leftEar = new THREE.Mesh(earGeo, fur);
  leftEar.position.set(0.06, 0.48, 0);
  const rightEar = new THREE.Mesh(earGeo, fur);
  rightEar.position.set(-0.06, 0.48, 0);
  root.add(leftEar, rightEar);
  const legGeo = new THREE.BoxGeometry(0.08, 0.18, 0.08);
  const legs: THREE.Mesh[] = [];
  for (const [dx, dz] of [[0.09, 0.12], [-0.09, 0.12], [0.09, -0.12], [-0.09, -0.12]] as const) {
    const leg = new THREE.Mesh(legGeo, fur);
    leg.position.set(dx, 0.09, dz);
    root.add(leg);
    legs.push(leg);
  }
  return { root, animatedParts: legs };
}

const BUILDERS: Record<EntityKind, () => EntityVisual> = {
  slime: buildSlime,
  goblin: buildGoblin,
  bat: buildBat,
  ghost: buildGhost,
  rock_golem: buildRockGolem,
  sheep: buildSheep,
  cow: buildCow,
  chicken: buildChicken,
  rabbit: buildRabbit
};

export function buildEntityVisual(kind: EntityKind): EntityVisual {
  return BUILDERS[kind]();
}

/** 簡易アニメーション: 歩行/浮遊のゆらぎを与える (種類を問わず同じ関数で処理できる程度に単純化)。 */
export function animateEntityVisual(visual: EntityVisual, kind: EntityKind, time: number, moving: boolean): void {
  if (kind === "slime") {
    const squash = 1 + Math.sin(time * 6) * (moving ? 0.12 : 0.03);
    visual.root.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    return;
  }
  if (kind === "bat") {
    const flap = Math.sin(time * 14) * 0.6;
    const [leftWing, rightWing] = visual.animatedParts;
    if (leftWing) leftWing.rotation.z = flap;
    if (rightWing) rightWing.rotation.z = -flap;
    visual.root.position.y = Math.sin(time * 2) * 0.15;
    return;
  }
  if (kind === "ghost") {
    visual.root.position.y = Math.sin(time * 1.5) * 0.2 + 0.1;
    return;
  }
  if (moving) {
    const swing = Math.sin(time * 8) * 0.5;
    visual.animatedParts.forEach((part, i) => {
      part.rotation.x = i % 2 === 0 ? swing : -swing;
    });
  } else {
    visual.animatedParts.forEach((part) => {
      part.rotation.x = 0;
    });
  }
}
