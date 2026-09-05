/**
 * サバイバルモードの体力・空腹・落下ダメージ・死亡/復活に関する純粋ロジック。
 * クリエイティブモードではこのモジュールを一切使わない (無制限・無ダメージを維持)。
 */

export const MAX_HEALTH = 20;
export const MAX_HUNGER = 20;

/** これより低い高さからの落下はダメージなし (安全落下距離、ブロック数)。 */
export const SAFE_FALL_DISTANCE = 3;
/** 落下1ブロックごとのダメージ量 (安全距離を超えた分)。 */
export const FALL_DAMAGE_PER_BLOCK = 2;
/** 落下ダメージの上限 (即死を避ける)。 */
export const MAX_FALL_DAMAGE = 12;

/** 空腹度が1減るまでの秒数。 */
export const HUNGER_DEPLETION_SECONDS_PER_POINT = 45;
/** 空腹度がこの値以上のとき、体力が自然回復する。 */
export const REGEN_HUNGER_THRESHOLD = 14;
/** 自然回復: 体力1回復に必要な秒数。 */
export const REGEN_SECONDS_PER_POINT = 6;
/** 自然回復1回につき消費する空腹度。 */
export const REGEN_HUNGER_COST = 1;
/** 空腹度が0のとき、飢餓ダメージが発生する間隔 (秒)。 */
export const STARVATION_DAMAGE_SECONDS = 4;
export const STARVATION_DAMAGE_AMOUNT = 1;

export interface SurvivalStats {
  health: number;
  hunger: number;
  /** tick内部の経過時間を貯めるためのアキュムレータ (秒)。 */
  hungerAccumulator: number;
  regenAccumulator: number;
  starvationAccumulator: number;
}

export function createInitialSurvivalStats(): SurvivalStats {
  return { health: MAX_HEALTH, hunger: MAX_HUNGER, hungerAccumulator: 0, regenAccumulator: 0, starvationAccumulator: 0 };
}

export function clampStats(stats: SurvivalStats): SurvivalStats {
  return {
    ...stats,
    health: Math.max(0, Math.min(MAX_HEALTH, stats.health)),
    hunger: Math.max(0, Math.min(MAX_HUNGER, stats.hunger))
  };
}

export function isAlive(stats: SurvivalStats): boolean {
  return stats.health > 0;
}

export function applyDamage(stats: SurvivalStats, amount: number): SurvivalStats {
  if (amount <= 0) return stats;
  return clampStats({ ...stats, health: stats.health - amount });
}

export function heal(stats: SurvivalStats, amount: number): SurvivalStats {
  if (amount <= 0) return stats;
  return clampStats({ ...stats, health: stats.health + amount });
}

export function feed(stats: SurvivalStats, amount: number): SurvivalStats {
  if (amount <= 0) return stats;
  return clampStats({ ...stats, hunger: stats.hunger + amount });
}

/** 落下距離 (ブロック数) から落下ダメージを計算する。安全距離以下は0。 */
export function calculateFallDamage(fallDistance: number): number {
  if (fallDistance <= SAFE_FALL_DISTANCE) return 0;
  const over = Math.floor(fallDistance - SAFE_FALL_DISTANCE);
  return Math.min(MAX_FALL_DAMAGE, over * FALL_DAMAGE_PER_BLOCK);
}

export function applyFallDamage(stats: SurvivalStats, fallDistance: number): { stats: SurvivalStats; damage: number } {
  const damage = calculateFallDamage(fallDistance);
  return { stats: applyDamage(stats, damage), damage };
}

/**
 * 経過時間 dt (秒) 分だけ空腹/体力を進める純粋な tick 関数。
 * 空腹が高いときはゆっくり体力が回復し、0のときは飢餓ダメージが入る。
 */
export function tickSurvival(stats: SurvivalStats, dt: number): SurvivalStats {
  if (!isAlive(stats)) return stats;
  let next = { ...stats };

  next.hungerAccumulator += dt;
  while (next.hungerAccumulator >= HUNGER_DEPLETION_SECONDS_PER_POINT) {
    next.hungerAccumulator -= HUNGER_DEPLETION_SECONDS_PER_POINT;
    next.hunger = Math.max(0, next.hunger - 1);
  }

  if (next.hunger >= REGEN_HUNGER_THRESHOLD && next.health < MAX_HEALTH) {
    next.regenAccumulator += dt;
    while (next.regenAccumulator >= REGEN_SECONDS_PER_POINT && next.health < MAX_HEALTH && next.hunger > 0) {
      next.regenAccumulator -= REGEN_SECONDS_PER_POINT;
      next.health = Math.min(MAX_HEALTH, next.health + 1);
      next.hunger = Math.max(0, next.hunger - REGEN_HUNGER_COST);
    }
  } else {
    next.regenAccumulator = 0;
  }

  if (next.hunger <= 0) {
    next.starvationAccumulator += dt;
    while (next.starvationAccumulator >= STARVATION_DAMAGE_SECONDS) {
      next.starvationAccumulator -= STARVATION_DAMAGE_SECONDS;
      next.health = Math.max(0, next.health - STARVATION_DAMAGE_AMOUNT);
    }
  } else {
    next.starvationAccumulator = 0;
  }

  return clampStats(next);
}
