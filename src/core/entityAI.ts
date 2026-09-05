/**
 * 生物のAI (追跡/徘徊/攻撃) と出現条件に関する純粋ロジック。
 * Three.js や World クラスに直接依存せず、最小限のインターフェースだけを要求することで
 * Vitest から容易にテストできるようにしている。
 */
import { canSpawnHostileAt as dayNightCanSpawnHostile } from "./dayNight";
import { getEntityDef, type EntityKind } from "./entities";

export type EntityAIState = "idle" | "wander" | "chase" | "attack" | "dead";

export interface EntityRuntime {
  id: number;
  kind: EntityKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  hp: number;
  state: EntityAIState;
  stateTimer: number;
  attackCooldownTimer: number;
  yaw: number;
  /** 繁殖クールダウン (友好生物のみ使用、秒) */
  breedCooldown: number;
}

let nextEntityId = 1;

export function resetEntityIdCounterForTests(): void {
  nextEntityId = 1;
}

export function createEntityRuntime(kind: EntityKind, x: number, y: number, z: number, yaw = 0): EntityRuntime {
  const def = getEntityDef(kind);
  return {
    id: nextEntityId++,
    kind,
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    hp: def.maxHp,
    state: "idle",
    stateTimer: 0,
    attackCooldownTimer: 0,
    yaw,
    breedCooldown: 0
  };
}

/** ワールドへの最小限の問い合わせインターフェース (実装は World クラスと互換)。 */
export interface GroundSampler {
  isSolid(x: number, y: number, z: number): boolean;
  findHighestSolidY(x: number, z: number): number;
}

export interface Vec2 {
  x: number;
  z: number;
}

function distanceXZ(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function applyDamageToEntity(entity: EntityRuntime, amount: number): EntityRuntime {
  if (amount <= 0 || entity.state === "dead") return entity;
  const hp = Math.max(0, entity.hp - amount);
  return { ...entity, hp, state: hp <= 0 ? "dead" : entity.state };
}

export interface HostileStepResult {
  entity: EntityRuntime;
  didAttack: boolean;
}

/**
 * 敵対生物の1ステップ: プレイヤーが検知範囲内なら追跡し、攻撃範囲内なら攻撃する。
 * それ以外はゆっくりランダム徘徊する。
 */
export function stepHostileAI(
  entity: EntityRuntime,
  dt: number,
  playerPos: { x: number; y: number; z: number },
  rng: () => number
): HostileStepResult {
  if (entity.state === "dead") return { entity, didAttack: false };
  const def = getEntityDef(entity.kind);
  const dist = distanceXZ(entity.x, entity.z, playerPos.x, playerPos.z);

  let next: EntityRuntime = { ...entity };
  next.attackCooldownTimer = Math.max(0, entity.attackCooldownTimer - dt);
  let didAttack = false;

  if (dist <= def.attackRange) {
    next.state = "attack";
    next.vx = 0;
    next.vz = 0;
    const dx = playerPos.x - entity.x;
    const dz = playerPos.z - entity.z;
    if (dx !== 0 || dz !== 0) next.yaw = Math.atan2(dx, dz);
    if (next.attackCooldownTimer <= 0) {
      didAttack = true;
      next.attackCooldownTimer = def.attackCooldown;
    }
  } else if (dist <= def.detectRadius) {
    next.state = "chase";
    const dx = playerPos.x - entity.x;
    const dz = playerPos.z - entity.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    next.vx = (dx / len) * def.speed;
    next.vz = (dz / len) * def.speed;
    next.yaw = Math.atan2(dx, dz);
    next.x += next.vx * dt;
    next.z += next.vz * dt;
  } else {
    next = stepWander(next, dt, def.speed * 0.4, rng);
  }

  return { entity: next, didAttack };
}

/** 友好生物のランダム徘徊 (見つけたら逃げも追跡もせず、のんびり動き回るだけ)。 */
export function stepFriendlyWander(entity: EntityRuntime, dt: number, rng: () => number): EntityRuntime {
  if (entity.state === "dead") return entity;
  const def = getEntityDef(entity.kind);
  const next = stepWander({ ...entity }, dt, def.speed * 0.5, rng);
  next.breedCooldown = Math.max(0, entity.breedCooldown - dt);
  return next;
}

function stepWander(entity: EntityRuntime, dt: number, speed: number, rng: () => number): EntityRuntime {
  const next = { ...entity };
  next.stateTimer -= dt;
  if (next.stateTimer <= 0) {
    const willMove = rng() > 0.35;
    next.state = willMove ? "wander" : "idle";
    next.stateTimer = 1.5 + rng() * 2.5;
    if (willMove) {
      const angle = rng() * Math.PI * 2;
      next.vx = Math.cos(angle) * speed;
      next.vz = Math.sin(angle) * speed;
      next.yaw = Math.atan2(next.vx, next.vz);
    } else {
      next.vx = 0;
      next.vz = 0;
    }
  }
  if (next.state === "wander") {
    next.x += next.vx * dt;
    next.z += next.vz * dt;
  }
  return next;
}

/** 出現条件: 昼夜サイクルの時刻と高さから、敵対生物が出現できるかを判定する。 */
export function canSpawnHostileAt(dayFraction: number, y: number): boolean {
  return dayNightCanSpawnHostile(dayFraction, y);
}

/** 円環上のランダムなスポーン候補地点 (プレイヤー中心、minRadius〜maxRadius) を返す。 */
export function pickSpawnOffset(rng: () => number, minRadius: number, maxRadius: number): Vec2 {
  const angle = rng() * Math.PI * 2;
  const radius = minRadius + rng() * (maxRadius - minRadius);
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

/** 確率的なスポーン試行 (1フレーム/tickあたりの発生判定)。 */
export function shouldAttemptSpawn(rng: () => number, chance: number): boolean {
  return rng() < chance;
}
