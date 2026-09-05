/**
 * 三人称視点で見える、親しみやすいローポリの人型キャラクター。
 * 単純なプリミティブ (ボックス/カプセル) の組み合わせで構築し、
 * 髪型・髪色・肌色・服の色を反映できるようにしている。
 */
import * as THREE from "three";
import type { AvatarConfig, HairStyle } from "../core/avatar";

export interface CharacterParts {
  root: THREE.Group;
  head: THREE.Group;
  torso: THREE.Mesh;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  hair: THREE.Object3D | null;
}

function buildHair(style: HairStyle, color: number): THREE.Object3D | null {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  switch (style) {
    case "bald":
      return null;
    case "short": {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.28, 0.62), mat);
      mesh.position.set(0, 0.22, 0);
      return mesh;
    }
    case "long": {
      const group = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.28, 0.62), mat);
      top.position.set(0, 0.22, 0);
      group.add(top);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.2), mat);
      back.position.set(0, -0.2, -0.32);
      group.add(back);
      return group;
    }
    case "bob": {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.55, 0.66), mat);
      mesh.position.set(0, 0.05, 0);
      return mesh;
    }
    case "ponytail": {
      const group = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.28, 0.62), mat);
      top.position.set(0, 0.22, 0);
      group.add(top);
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.6, 6), mat);
      tail.position.set(0, -0.1, -0.4);
      tail.rotation.x = Math.PI / 5;
      group.add(tail);
      return group;
    }
  }
}

/** キャラクターの3Dパーツ一式を生成する。座標原点は足元。 */
export function buildCharacter(avatar: AvatarConfig): CharacterParts {
  const root = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({ color: avatar.skinColor, roughness: 0.85 });
  const clothesMat = new THREE.MeshStandardMaterial({ color: avatar.clothesColor, roughness: 0.9 });

  const legHeight = 0.75;
  const torsoHeight = 0.75;
  const headSize = 0.5;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, torsoHeight, 0.35), clothesMat);
  torso.position.set(0, legHeight + torsoHeight / 2, 0);
  root.add(torso);

  const head = new THREE.Group();
  head.position.set(0, legHeight + torsoHeight + headSize / 2, 0);
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(headSize, headSize, headSize), skinMat);
  head.add(headMesh);
  const hair = buildHair(avatar.hairStyle, avatar.hairColor);
  if (hair) {
    hair.position.y += headSize / 2;
    head.add(hair);
  }
  root.add(head);

  function buildLimb(mat: THREE.Material, width: number, height: number, x: number, topY: number): THREE.Group {
    const pivot = new THREE.Group();
    pivot.position.set(x, topY, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, width), mat);
    mesh.position.set(0, -height / 2, 0);
    pivot.add(mesh);
    return pivot;
  }

  const leftArm = buildLimb(clothesMat, 0.2, 0.7, 0.4, legHeight + torsoHeight - 0.05);
  const rightArm = buildLimb(clothesMat, 0.2, 0.7, -0.4, legHeight + torsoHeight - 0.05);
  const leftLeg = buildLimb(skinMat, 0.24, legHeight, 0.15, legHeight);
  const rightLeg = buildLimb(skinMat, 0.24, legHeight, -0.15, legHeight);
  root.add(leftArm, rightArm, leftLeg, rightLeg);

  return { root, head, torso, leftArm, rightArm, leftLeg, rightLeg, hair };
}

/** 歩行アニメーション: 経過時間と移動速度から手足の振り角を計算して適用する。 */
export function animateWalk(parts: CharacterParts, time: number, moving: boolean): void {
  const swing = moving ? Math.sin(time * 8) * 0.6 : 0;
  parts.leftArm.rotation.x = -swing;
  parts.rightArm.rotation.x = swing;
  parts.leftLeg.rotation.x = swing;
  parts.rightLeg.rotation.x = -swing;
}
