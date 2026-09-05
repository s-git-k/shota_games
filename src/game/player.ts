/**
 * プレイヤーの移動・衝突判定・飛行モードを扱う。
 * AABB (軸平行境界ボックス) を軸ごとに個別移動させることで、
 * 単純だが安定した壁ズリ (スライディング) 付きの衝突解決を行う。
 */
import * as THREE from "three";
import type { World } from "../core/world";
import type { CameraMode, MovementMode } from "../core/types";

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;

const GRAVITY = -26;
const JUMP_SPEED = 8.2;
const WALK_SPEED = 4.5;
const SPRINT_MULT = 1.7;
const FLY_SPEED = 9;
const FLY_SPRINT_MULT = 2.2;
const TERMINAL_FALL_SPEED = -50;
/** 水中では移動と落下がゆっくりになる (簡易的な浮力/水泳表現)。 */
const WATER_GRAVITY_SCALE = 0.22;
const WATER_TERMINAL_SINK_SPEED = -2.6;
const WATER_HORIZONTAL_SPEED_SCALE = 0.7;
const WATER_SWIM_UP_SPEED = 3.2;
const WATER_SWIM_DOWN_SPEED = -3.2;
const WATER_VERTICAL_ACCEL = 14;

export interface MoveInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  descend: boolean;
  sprint: boolean;
  /** タッチジョイスティック等からのアナログ入力 (-1..1)。指定時は真偽値より優先される。 */
  analogX?: number;
  analogZ?: number;
}

export class PlayerController {
  position = new THREE.Vector3(0, 40, 0);
  velocity = new THREE.Vector3(0, 0, 0);
  yaw = 0;
  pitch = 0;
  onGround = false;
  movementMode: MovementMode = "walk";
  cameraMode: CameraMode = "first";
  /** 現在の空中滞在中に落下し始めた高さ (着地時の落下ダメージ計算に使う)。 */
  private fallStartY: number | null = null;
  /** 直前の update() で着地して確定した落下距離 (ブロック数)。毎フレーム呼び出し側が消費する。 */
  lastFallDistance = 0;
  /** 直前の update() 時点で胸の高さが水中(液体ブロック)にあったか。HUD/演出/水泳判定に使う。 */
  isSwimming = false;

  private aabbAt(pos: THREE.Vector3): { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } {
    const halfW = PLAYER_WIDTH / 2;
    return {
      minX: pos.x - halfW,
      maxX: pos.x + halfW,
      minY: pos.y,
      maxY: pos.y + PLAYER_HEIGHT,
      minZ: pos.z - halfW,
      maxZ: pos.z + halfW
    };
  }

  private collides(world: World, pos: THREE.Vector3): boolean {
    const box = this.aabbAt(pos);
    const x0 = Math.floor(box.minX);
    const x1 = Math.floor(box.maxX - 1e-6);
    const y0 = Math.floor(box.minY);
    const y1 = Math.floor(box.maxY - 1e-6);
    const z0 = Math.floor(box.minZ);
    const z1 = Math.floor(box.maxZ - 1e-6);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          if (world.isSolid(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  /** 胸の高さ (だいたい水面判定の基準) が水/地下水などの液体ブロックの中にあるか。 */
  private isChestInLiquid(world: World): boolean {
    const x = Math.floor(this.position.x);
    const y = Math.floor(this.position.y + PLAYER_HEIGHT * 0.5);
    const z = Math.floor(this.position.z);
    return world.isLiquid(x, y, z);
  }

  toggleFly(): void {
    this.movementMode = this.movementMode === "fly" ? "walk" : "fly";
    if (this.movementMode === "fly") this.velocity.y = 0;
  }

  toggleCamera(): void {
    this.cameraMode = this.cameraMode === "first" ? "third" : "first";
  }

  applyLook(deltaYaw: number, deltaPitch: number): void {
    this.yaw -= deltaYaw;
    this.pitch -= deltaPitch;
    const limit = Math.PI / 2 - 0.02;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
  }

  getForwardVector(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  getRightVector(): THREE.Vector3 {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  update(dt: number, input: MoveInput, world: World): void {
    const wasOnGround = this.onGround;
    const forward = this.getForwardVector();
    const right = this.getRightVector();
    const wish = new THREE.Vector3();
    let magnitude = 1;
    if (input.analogX !== undefined || input.analogZ !== undefined) {
      const ax = input.analogX ?? 0;
      const az = input.analogZ ?? 0;
      wish.addScaledVector(forward, -az);
      wish.addScaledVector(right, ax);
      magnitude = Math.min(1, Math.sqrt(ax * ax + az * az));
      if (wish.lengthSq() > 0) wish.normalize();
    } else {
      if (input.forward) wish.add(forward);
      if (input.backward) wish.sub(forward);
      if (input.right) wish.add(right);
      if (input.left) wish.sub(right);
      if (wish.lengthSq() > 0) wish.normalize();
    }

    if (this.movementMode === "fly") {
      const speed = FLY_SPEED * (input.sprint ? FLY_SPRINT_MULT : 1) * magnitude;
      this.velocity.x = wish.x * speed;
      this.velocity.z = wish.z * speed;
      let vy = 0;
      if (input.jump) vy += speed;
      if (input.descend) vy -= speed;
      this.velocity.y = vy;
      this.onGround = false;
      this.isSwimming = false;
    } else {
      const inWater = this.isChestInLiquid(world);
      this.isSwimming = inWater;
      const speed = WALK_SPEED * (input.sprint ? SPRINT_MULT : 1) * magnitude * (inWater ? WATER_HORIZONTAL_SPEED_SCALE : 1);
      this.velocity.x = wish.x * speed;
      this.velocity.z = wish.z * speed;
      if (inWater) {
        // 水中: 重力を弱めた緩やかな沈み + ジャンプ/しゃがみキーで上下に泳ぐ (簡易水泳)
        this.velocity.y = Math.max(WATER_TERMINAL_SINK_SPEED, this.velocity.y + GRAVITY * WATER_GRAVITY_SCALE * dt);
        if (input.jump) {
          this.velocity.y = Math.min(WATER_SWIM_UP_SPEED, this.velocity.y + WATER_VERTICAL_ACCEL * dt);
        } else if (input.descend) {
          this.velocity.y = Math.max(WATER_SWIM_DOWN_SPEED, this.velocity.y - WATER_VERTICAL_ACCEL * dt);
        }
      } else {
        this.velocity.y = Math.max(TERMINAL_FALL_SPEED, this.velocity.y + GRAVITY * dt);
        if (input.jump && this.onGround) {
          this.velocity.y = JUMP_SPEED;
          this.onGround = false;
        }
      }
    }

    this.onGround = false;
    this.moveAxis(world, "x", this.velocity.x * dt);
    this.moveAxis(world, "z", this.velocity.z * dt);
    this.moveAxis(world, "y", this.velocity.y * dt);

    if (this.movementMode === "fly") {
      this.fallStartY = null;
      this.lastFallDistance = 0;
    } else if (this.isSwimming) {
      // 水中にいる間 (と水面に浮上した瞬間) は落下ダメージを蓄積させない: 水に飛び込んだら安全、という直感的挙動にする
      this.fallStartY = null;
      this.lastFallDistance = 0;
    } else if (!this.onGround) {
      this.fallStartY = this.fallStartY === null ? this.position.y : Math.max(this.fallStartY, this.position.y);
      this.lastFallDistance = 0;
    } else {
      this.lastFallDistance = wasOnGround || this.fallStartY === null ? 0 : Math.max(0, this.fallStartY - this.position.y);
      this.fallStartY = null;
    }
  }

  private moveAxis(world: World, axis: "x" | "y" | "z", delta: number): void {
    if (delta === 0) return;
    const next = this.position.clone();
    next[axis] += delta;
    if (!this.collides(world, next)) {
      this.position.copy(next);
      return;
    }
    if (axis === "y" && delta < 0) {
      this.onGround = true;
    }
    if (axis === "y") {
      this.velocity.y = 0;
    }
    // 軸方向の移動は行わない (壁/床/天井にめり込まない)
  }
}
