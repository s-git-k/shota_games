/**
 * 一人称/三人称カメラの制御。
 * 三人称時はプレイヤーの背後上方にカメラを置き、壁にめり込まないよう
 * 簡易的なレイサンプリングでカメラ距離を調整する。
 */
import * as THREE from "three";
import type { World } from "../core/world";
import { EYE_HEIGHT, PlayerController } from "../game/player";

const THIRD_PERSON_DISTANCE = 5;
const THIRD_PERSON_HEIGHT = 1.4;

function clearDistance(world: World, from: THREE.Vector3, to: THREE.Vector3, samples = 12): number {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  if (len < 1e-6) return len;
  dir.normalize();
  const step = len / samples;
  for (let i = 1; i <= samples; i++) {
    const d = step * i;
    const p = new THREE.Vector3().copy(from).addScaledVector(dir, d);
    if (world.isSolid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) {
      return Math.max(0, d - step);
    }
  }
  return len;
}

/** カメラを player の状態に合わせて更新する。characterRoot は三人称時に表示するモデルのルート。 */
export function updateCamera(
  camera: THREE.PerspectiveCamera,
  player: PlayerController,
  world: World,
  characterRoot: THREE.Object3D
): void {
  const eyePos = new THREE.Vector3(player.position.x, player.position.y + EYE_HEIGHT, player.position.z);
  camera.rotation.order = "YXZ";

  if (player.cameraMode === "first") {
    characterRoot.visible = false;
    camera.position.copy(eyePos);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
  } else {
    characterRoot.visible = true;
    characterRoot.position.set(player.position.x, player.position.y, player.position.z);
    characterRoot.rotation.y = player.yaw;

    const back = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    const desired = new THREE.Vector3()
      .copy(eyePos)
      .addScaledVector(back, THIRD_PERSON_DISTANCE);
    desired.y = eyePos.y + THIRD_PERSON_HEIGHT * 0.4 - player.pitch * 2.0;

    const dist = clearDistance(world, eyePos, desired);
    const dir = new THREE.Vector3().subVectors(desired, eyePos);
    const fullLen = dir.length();
    if (fullLen > 1e-6) {
      dir.normalize();
      const finalPos = new THREE.Vector3().copy(eyePos).addScaledVector(dir, Math.min(dist, fullLen));
      camera.position.copy(finalPos);
    } else {
      camera.position.copy(eyePos);
    }
    camera.lookAt(new THREE.Vector3(player.position.x, player.position.y + EYE_HEIGHT * 0.8, player.position.z));
  }
}
